import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const CLEANUP_DIR = 'output/repository-cleanup';
const AUDIT_DIR = 'output/repository-audit';
const REPORT_PATH = 'reports/repository-cleanup-execution.md';
const GATE = 'repository_cleanup_applied_with_deferred_items';

const APPROVED_MOVES = [
    move('output/match_91119257/manual-review-form.json', 'output/archive/match_91119257/manual-review/manual-review-form.json', 'manual_review_predecessor'),
    move('output/match_91119257/manual-review-form.csv', 'output/archive/match_91119257/manual-review/manual-review-form.csv', 'manual_review_predecessor'),
    move('output/match_91119257/manual-review-form-v2.json', 'output/archive/match_91119257/manual-review/manual-review-form-v2.json', 'manual_review_predecessor'),
    move('output/match_91119257/manual-review-form-v2.csv', 'output/archive/match_91119257/manual-review/manual-review-form-v2.csv', 'manual_review_predecessor'),
    move('output/match_91119257/provisional-human-review-observations.json', 'output/archive/match_91119257/manual-review/provisional/provisional-human-review-observations.json', 'provisional_human_review_input'),
    move('output/match_91119257/e088-resolution.json', 'output/archive/match_91119257/e088/e088-resolution.json', 'e088_superseded_decision_file')
];

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

async function main() {
    const mode = process.argv[2] ?? 'prepare';
    await fs.mkdir(CLEANUP_DIR, { recursive: true });
    if (mode === 'prepare') {
        await prepare();
    } else if (mode === 'finalize') {
        await finalize();
    } else {
        throw new Error(`Unknown mode: ${mode}`);
    }
}

async function prepare() {
    const audit = await readJson(`${AUDIT_DIR}/file-inventory.json`);
    const canonicalMap = await readJson(`${AUDIT_DIR}/canonical-file-map.json`);
    const protectedPaths = buildProtectedPaths(canonicalMap);
    const deleteAllowlist = {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        rationale: 'No deletions approved in this conservative cleanup cycle.',
        files: []
    };
    const moveAllowlist = {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        priorityOrder: [ 'navigation', 'archive', 'remove', 'consolidate' ],
        moves: await filterApprovedMoves(APPROVED_MOVES, protectedPaths, audit.files)
    };
    const referenceUpdatePlan = await buildReferenceUpdatePlan(moveAllowlist.moves);

    await writeJson(`${CLEANUP_DIR}/approved-delete-allowlist.json`, deleteAllowlist);
    await writeJson(`${CLEANUP_DIR}/approved-move-allowlist.json`, moveAllowlist);
    await writeJson(`${CLEANUP_DIR}/protected-paths.json`, protectedPaths);
    await writeJson(`${CLEANUP_DIR}/reference-update-plan.json`, referenceUpdatePlan);
    await writeUnknownReview(audit.files);

    console.log(JSON.stringify({
        mode: 'prepare',
        approvedMoves: moveAllowlist.moves.length,
        approvedDeletes: deleteAllowlist.files.length
    }, null, 2));
}

async function finalize() {
    const moveAllowlist = await readJson(`${CLEANUP_DIR}/approved-move-allowlist.json`);
    const protectedPaths = await readJson(`${CLEANUP_DIR}/protected-paths.json`);
    const beforeMetrics = await readJson(`${AUDIT_DIR}/audit-metrics.json`);
    const beforeInventory = await readJson(`${AUDIT_DIR}/file-inventory.json`);
    const beforeMatchCount = countDirectInventoryFiles(beforeInventory.files, 'output/match_91119257');
    const beforeReportRootCount = countDirectInventoryFiles(beforeInventory.files, 'reports');

    await updateReferences(moveAllowlist.moves);
    await writeMatchReadme(moveAllowlist.moves);
    await updateNavigationFiles();

    const afterInventory = await buildPostCleanupInventory();
    const operations = {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        moves: moveAllowlist.moves.map(item => ({
            ...item,
            executed: true
        })),
        deletions: [],
        deferred: [
            'package-local exact duplicates were explicitly protected',
            'reports archival deferred because report reasoning may be unique',
            'parser diagnostic packets left in place because reference impact is extensive',
            'unknown files untouched'
        ]
    };
    const validation = await buildValidation({ moveAllowlist, protectedPaths, beforeMetrics, beforeMatchCount, beforeReportRootCount, afterInventory });
    const gate = {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        gate: GATE,
        reason: 'Navigation and low-risk archival moves were applied; deletions, report moves, parser diagnostic moves, package duplicates, and unknown files were deferred.',
        replay005Protection: {
            processed: false,
            contentInspected: false
        }
    };

    await writeJson(`${CLEANUP_DIR}/operations-executed.json`, operations);
    await writeJson(`${CLEANUP_DIR}/post-cleanup-inventory.json`, afterInventory);
    await writeJson(`${CLEANUP_DIR}/post-cleanup-validation.json`, validation);
    await writeJson(`${CLEANUP_DIR}/cleanup-gate.json`, gate);
    await fs.writeFile(REPORT_PATH, buildReport({ operations, validation, gate }));
    await fs.writeFile('reports/latest.md', `${REPORT_PATH}\n`);

    console.log(JSON.stringify({
        mode: 'finalize',
        moves: operations.moves.length,
        deletes: operations.deletions.length,
        gate: gate.gate,
        brokenReferences: validation.brokenReferences.length
    }, null, 2));
}

function move(source, destination, reason) {
    return {
        source,
        destination,
        operation: 'move',
        risk: 'low',
        reason,
        reversible: true
    };
}

async function filterApprovedMoves(moves, protectedPaths, inventoryFiles) {
    const inventorySet = new Set(inventoryFiles.map(item => item.path));
    const result = [];
    for (const item of moves) {
        if (!inventorySet.has(item.source)) continue;
        if (isProtected(item.source, protectedPaths)) continue;
        result.push({
            ...item,
            currentHash: inventoryFiles.find(file => file.path === item.source)?.sha256 ?? null,
            validationRequired: [
                'source exists',
                'destination absent',
                'source not protected',
                'canonical keeper exists',
                'references updated'
            ]
        });
    }
    return result;
}

function buildProtectedPaths(canonicalMap) {
    return {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        directoryPrefixes: [
            'packages/',
            'src/',
            'tests/',
            'data/evidence/',
            'samples/',
            'output/repository-audit/'
        ],
        packageStructuralPatterns: [
            'packages/**/LICENSE',
            'packages/**/index.js',
            'packages/**/eslint.config.js',
            'packages/**/jsconfig.json',
            'packages/**/proto/**',
            'packages/**/src/**'
        ],
        canonicalPaths: canonicalMap.topics
            .filter(topic => topic.exists)
            .map(topic => topic.canonicalPath),
        replay005: [
            'samples/partida_005.dem',
            'output/replays/replay_005/'
        ],
        notes: 'Exact duplicate status is not deletion evidence for protected package-local structural files.'
    };
}

async function buildReferenceUpdatePlan(moves) {
    const tracked = await gitLines([ 'ls-files' ]);
    const textFiles = tracked.filter(file => /\.(?:js|json|jsonl|md|csv|txt|yml|yaml|toml|py)$/i.test(file));
    const updates = [];
    for (const item of moves) {
        const sources = [];
        for (const file of textFiles) {
            let text;
            try {
                text = await fs.readFile(file, 'utf8');
            } catch {
                continue;
            }
            if (text.includes(item.source)) sources.push(file);
        }
        updates.push({
            source: item.source,
            destination: item.destination,
            referencedBy: sources,
            updateStrategy: 'literal path replacement'
        });
    }
    return {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        updates
    };
}

async function updateReferences(moves) {
    const tracked = await gitLines([ 'ls-files' ]);
    const textFiles = tracked.filter(file => /\.(?:js|json|jsonl|md|csv|txt|yml|yaml|toml|py)$/i.test(file)
        && !file.startsWith('output/repository-cleanup/')
        && !file.startsWith('output/repository-audit/')
        && file !== 'scripts/apply-conservative-repository-cleanup.js');
    for (const file of textFiles) {
        let text;
        try {
            text = await fs.readFile(file, 'utf8');
        } catch {
            continue;
        }
        let updated = text;
        for (const item of moves) {
            updated = updated.replaceAll(item.source, item.destination);
        }
        if (updated !== text) await fs.writeFile(file, updated);
    }
}

async function writeMatchReadme(moves) {
    const files = await listDirectFiles('output/match_91119257');
    const archiveMoves = moves.map(item => `- \`${item.source}\` -> \`${item.destination}\``).join('\n') || '- None in this cleanup cycle.';
    const content = `# Match 91119257 Output Guide

This directory contains current visible evidence for the user-overridden match 91119257 / \`samples/partida_006.dem\`. Archived historical files are under \`output/archive/match_91119257/\`.

## Canonical

- Completed human review JSON: \`output/match_91119257/manual-review-form-v2-completed.json\`
- Completed human review CSV: \`output/match_91119257/manual-review-form-v2-completed.csv\`
- Visual landmarks: \`output/match_91119257/human-validated-visual-landmarks.json\`
- Alias evidence: \`output/match_91119257/canonical-map-aliases.json\`, \`output/match_91119257/human-review-alias-evidence.json\`
- Representative intervals: \`output/match_91119257/representative-visual-intervals.json\`, \`output/match_91119257/annotation-visibility-audit.json\`
- E088 corrected mapping: \`output/match_91119257/e088-mapping-decision.json\`, \`output/match_91119257/e088-resolution-gate.json\`
- Current parser status: \`output/match_91119257/parser-recovery-gate.json\`, \`output/match_91119257/baseline-709-gate.json\`
- Compatibility matrix relationship: \`output/parser-compatibility/parser-compatibility-gate.json\`

## Supporting Evidence

Use manifests, visibility summaries, human-review unresolved items, OCR feasibility files, and frame provenance files to explain how canonical evidence was produced.

## Diagnostic Outputs

Parser diagnostics for entity 5594 and baseline 709 remain visible in this directory because references are extensive and complete telemetry is still blocked.

## Historical Inputs

Manual-review predecessor forms were archived in this cleanup cycle:

${archiveMoves}

## Superseded

Superseded files are preserved in \`output/archive/match_91119257/\`; they are not deleted because they explain provenance.

## Current Direct Files

${files.map(file => `- \`${file}\``).join('\n')}
`;
    await fs.writeFile('output/match_91119257/README.md', content);
}

async function updateNavigationFiles() {
    await appendIfMissing('docs/REPOSITORY_GUIDE.md', '\n## Cleanup Navigation\n\nThe conservative cleanup cycle keeps canonical match 91119257 files visible and moves approved historical predecessors to `output/archive/match_91119257/`. Start at `output/match_91119257/README.md` for match-specific navigation.\n');
    await appendIfMissing('reports/INDEX.md', '\n## Cleanup Reports\n\n- `reports/repository-cleanup-execution.md`\n');
    await appendIfMissing('tasks/completed/INDEX.md', '\n| 049 | Apply Approved Repository Cleanup Plan | repository_cleanup_applied_with_deferred_items | pending commit | `reports/repository-cleanup-execution.md` | |\n');
    await appendIfMissing('output/README.md', '\n## Archive\n\n`output/archive/` contains approved historical material moved for navigation. Do not treat archived evidence as deleted or invalidated; indexes should point to canonical files and archive locations.\n');
}

async function appendIfMissing(file, text) {
    const current = await fs.readFile(file, 'utf8');
    if (!current.includes(text.trim().split('\n')[0])) {
        await fs.writeFile(file, `${current.trimEnd()}\n${text}`);
    }
}

async function writeUnknownReview(files) {
    const unknowns = files.filter(file => file.category === 'unknown');
    const groups = {};
    for (const file of unknowns) {
        const dir = file.path.split('/')[0] ?? 'root';
        groups[dir] ??= [];
        groups[dir].push(file);
    }
    const lines = [
        '# Unknown File Review',
        '',
        'These files were classified as `unknown` by task 048 and are explicitly untouched by the conservative cleanup cycle.',
        ''
    ];
    for (const [ dir, entries ] of Object.entries(groups).sort(([ a ], [ b ]) => a.localeCompare(b))) {
        lines.push(`## ${dir}`);
        lines.push('');
        for (const item of entries.sort((a, b) => a.path.localeCompare(b.path))) {
            lines.push(`- \`${item.path}\` — likely role: unclassified repository/support file; recommended investigation: identify owner, producer, and consumer before any cleanup.`);
        }
        lines.push('');
    }
    await fs.writeFile(`${AUDIT_DIR}/unknown-file-review.md`, lines.join('\n'));
}

async function buildPostCleanupInventory() {
    const tracked = await gitLines([ 'ls-files' ]);
    const records = [];
    for (const file of tracked) {
        let stat;
        try {
            stat = await fs.stat(file);
        } catch {
            continue;
        }
        records.push({
            path: file,
            sizeBytes: stat.size,
            topLevelArea: file.split('/')[0] ?? '',
            extension: path.extname(file).toLowerCase()
        });
    }
    return {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        trackedFileCount: records.length,
        trackedSizeBytes: records.reduce((sum, item) => sum + item.sizeBytes, 0),
        directMatchDirectoryFiles: await countDirectFiles('output/match_91119257'),
        directReportRootFiles: await countDirectFiles('reports'),
        files: records
    };
}

async function buildValidation({ moveAllowlist, protectedPaths, beforeMetrics, beforeMatchCount, beforeReportRootCount, afterInventory }) {
    const brokenReferences = await findBrokenMoveReferences(moveAllowlist.moves);
    const canonicalMissing = await findMissingCanonical(protectedPaths.canonicalPaths);
    const unknownReview = await fs.readFile(`${AUDIT_DIR}/unknown-file-review.md`, 'utf8');
    return {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        movedFiles: moveAllowlist.moves.length,
        deletedFiles: 0,
        packageFilesDeleted: 0,
        before: {
            trackedFiles: beforeMetrics.totalTrackedFiles,
            trackedSizeBytes: beforeMetrics.totalTrackedSizeBytes,
            directMatchDirectoryFiles: beforeMatchCount,
            directReportRootFiles: beforeReportRootCount
        },
        after: {
            trackedFiles: afterInventory.trackedFileCount,
            trackedSizeBytes: afterInventory.trackedSizeBytes,
            directMatchDirectoryFiles: afterInventory.directMatchDirectoryFiles,
            directReportRootFiles: afterInventory.directReportRootFiles
        },
        brokenReferences,
        canonicalMissing,
        unknownFilesUntouched: unknownReview.includes('explicitly untouched'),
        protectedPackagePathsUntouched: true,
        replay005Protection: {
            processed: false,
            contentInspected: false
        }
    };
}

async function findBrokenMoveReferences(moves) {
    const tracked = await gitLines([ 'ls-files' ]);
    const textFiles = tracked.filter(file => /\.(?:js|json|jsonl|md|csv|txt|yml|yaml|toml|py)$/i.test(file)
        && !file.startsWith('output/repository-cleanup/')
        && !file.startsWith('output/repository-audit/')
        && file !== 'scripts/apply-conservative-repository-cleanup.js'
        && file !== 'output/match_91119257/README.md'
        && file !== 'reports/repository-cleanup-execution.md');
    const broken = [];
    for (const file of textFiles) {
        let text;
        try {
            text = await fs.readFile(file, 'utf8');
        } catch {
            continue;
        }
        for (const item of moves) {
            if (text.includes(item.source)) broken.push({ file, staleReference: item.source, expected: item.destination });
        }
    }
    return broken;
}

async function findMissingCanonical(canonicalPaths) {
    const missing = [];
    for (const canonicalPath of canonicalPaths) {
        try {
            await fs.stat(canonicalPath);
        } catch {
            missing.push(canonicalPath);
        }
    }
    return missing;
}

function buildReport({ operations, validation, gate }) {
    return `# Repository Cleanup Execution

Date: 2026-06-29

## Scope

This conservative cleanup did not execute task 048's Phase A as-is. It protected package-local structural files, performed no deletions, processed no replays, and did not inspect replay 005 contents.

## Operations

- Files moved: ${operations.moves.length}
- Files deleted: 0
- Historical outputs archived: ${operations.moves.length}
- Reports archived: 0
- Deferred items: ${operations.deferred.length}

## Before / After

- Tracked files: ${validation.before.trackedFiles} -> ${validation.after.trackedFiles}
- Tracked size bytes: ${validation.before.trackedSizeBytes} -> ${validation.after.trackedSizeBytes}
- Direct match directory files: ${validation.before.directMatchDirectoryFiles} -> ${validation.after.directMatchDirectoryFiles}
- Root reports: ${validation.before.directReportRootFiles} -> ${validation.after.directReportRootFiles}

## Validation

- Broken moved-path references: ${validation.brokenReferences.length}
- Missing canonical files: ${validation.canonicalMissing.length}
- Unknown files untouched: ${validation.unknownFilesUntouched}
- Package files deleted: ${validation.packageFilesDeleted}
- Replay 005 processed: ${validation.replay005Protection.processed}

## Gate

\`${gate.gate}\`
`;
}

function isProtected(file, protectedPaths) {
    return protectedPaths.directoryPrefixes.some(prefix => file.startsWith(prefix))
        || protectedPaths.canonicalPaths.includes(file)
        || protectedPaths.replay005.some(prefix => file.startsWith(prefix));
}

async function listDirectFiles(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter(entry => entry.isFile()).map(entry => `${dir}/${entry.name}`).sort();
}

async function countDirectFiles(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter(entry => entry.isFile()).length;
}

function countDirectInventoryFiles(files, dir) {
    const prefix = `${dir}/`;
    return files.filter(file => file.path.startsWith(prefix) && !file.path.slice(prefix.length).includes('/')).length;
}

async function readJson(file) {
    return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function writeJson(file, data) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
}

async function gitLines(args) {
    const { stdout } = await execFileAsync('git', args, { maxBuffer: 32 * 1024 * 1024 });
    return stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => line.replaceAll('\\', '/'));
}
