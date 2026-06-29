import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const OUTPUT_DIR = 'output/repository-audit';
const REPORT_PATH = 'reports/repository-hygiene-and-cleanup-audit.md';
const GATE = 'repository_cleanup_audit_ready_with_unknowns';
const TEXT_EXTENSIONS = new Set([
    '.cjs', '.csv', '.js', '.json', '.jsonl', '.md', '.mjs', '.py', '.toml', '.ts', '.txt', '.yaml', '.yml'
]);
const STRUCTURED_EXTENSIONS = new Set([ '.csv', '.json', '.jsonl', '.md' ]);

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

async function main() {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });

    const trackedFiles = await gitLines([ 'ls-files' ]);
    const ignoredFiles = await gitIgnoredLines();
    const fileTexts = await readTextFiles(trackedFiles);
    const referencesByFile = buildReferenceIndex(trackedFiles, fileTexts);
    const hashGroups = await buildHashGroups(trackedFiles);
    const duplicateAnalysis = buildDuplicateAnalysis(trackedFiles, hashGroups);
    const taskIndex = await buildTaskIndex(trackedFiles, fileTexts);
    const canonicalMap = buildCanonicalMap(trackedFiles);
    const versionChainAudit = buildVersionChainAudit(trackedFiles);
    const inventory = await buildInventory({
        trackedFiles,
        fileTexts,
        referencesByFile,
        duplicateAnalysis,
        canonicalMap,
        versionChainAudit
    });
    const referenceGraph = buildReferenceGraph(inventory);
    const cleanupProposal = buildCleanupProposal(inventory, duplicateAnalysis);
    const metrics = buildMetrics(inventory, duplicateAnalysis, cleanupProposal, ignoredFiles);
    const gate = {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        gate: GATE,
        reason: metrics.unknownCount > 0
            ? 'Some tracked files cannot be safely classified beyond conservative keep/investigate without human review.'
            : 'Audit completed with no unresolved classification unknowns.',
        replay005Protection: {
            processed: false,
            contentInspected: false,
            note: 'Audit used git file paths and tracked file metadata only; replay files were not processed.'
        }
    };

    await writeJson(path.join(OUTPUT_DIR, 'file-inventory.json'), {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        files: inventory
    });
    await fs.writeFile(path.join(OUTPUT_DIR, 'file-inventory.csv'), inventoryToCsv(inventory));
    await writeJson(path.join(OUTPUT_DIR, 'reference-graph.json'), referenceGraph);
    await writeJson(path.join(OUTPUT_DIR, 'canonical-file-map.json'), canonicalMap);
    await writeJson(path.join(OUTPUT_DIR, 'version-chain-audit.json'), versionChainAudit);
    await writeJson(path.join(OUTPUT_DIR, 'duplicate-analysis.json'), duplicateAnalysis);
    await writeJson(path.join(OUTPUT_DIR, 'task-index.json'), taskIndex);
    await writeJson(path.join(OUTPUT_DIR, 'cleanup-proposal.json'), cleanupProposal);
    await writeJson(path.join(OUTPUT_DIR, 'audit-metrics.json'), metrics);
    await writeJson(path.join(OUTPUT_DIR, 'repository-hygiene-gate.json'), gate);

    await fs.writeFile('docs/REPOSITORY_GUIDE.md', buildRepositoryGuide(metrics, canonicalMap));
    await fs.writeFile('reports/INDEX.md', buildReportsIndex(inventory));
    await fs.writeFile('tasks/completed/INDEX.md', buildCompletedTasksIndex(taskIndex));
    await fs.writeFile('output/README.md', buildOutputReadme(metrics));
    await fs.writeFile(REPORT_PATH, buildReport(metrics, cleanupProposal, gate));
    await fs.writeFile('reports/latest.md', `${REPORT_PATH}\n`);
    await createBlockedCleanupTask();

    console.log(JSON.stringify({
        gate: gate.gate,
        trackedFiles: metrics.totalTrackedFiles,
        unknown: metrics.unknownCount,
        exactDuplicateGroups: metrics.exactDuplicateGroups,
        phaseAEstimatedRemovals: metrics.phaseAEstimatedRemovals
    }, null, 2));
}

async function buildInventory({ trackedFiles, fileTexts, referencesByFile, duplicateAnalysis, canonicalMap, versionChainAudit }) {
    const canonicalPaths = new Set(canonicalMap.topics.map(topic => topic.canonicalPath).filter(Boolean));
    const supersededPaths = new Map();
    for (const topic of canonicalMap.topics) {
        for (const superseded of topic.supersededPaths ?? []) supersededPaths.set(superseded, topic.canonicalPath);
    }
    for (const chain of versionChainAudit.chains) {
        for (const item of chain.files) {
            if (item.role === 'superseded') supersededPaths.set(item.path, chain.canonicalPath);
        }
    }
    const duplicateGroupByFile = new Map();
    for (const group of duplicateAnalysis.exactDuplicates) {
        for (const file of group.files) duplicateGroupByFile.set(file, group.groupId);
    }

    const records = [];
    for (const file of trackedFiles) {
        const stat = await fs.stat(file);
        const ext = path.extname(file).toLowerCase();
        const topLevelArea = file.split('/')[0] ?? '';
        const references = extractPathReferences(fileTexts.get(file) ?? '');
        const referencedBy = referencesByFile.get(file) ?? [];
        const producer = findProducers(file, trackedFiles, fileTexts);
        const consumers = findConsumers(file, referencedBy);
        const classification = classifyFile({
            file,
            ext,
            topLevelArea,
            canonicalPaths,
            supersededPaths,
            duplicateGroupByFile,
            referencedBy,
            producer
        });
        records.push({
            path: file,
            sizeBytes: stat.size,
            extension: ext,
            topLevelArea,
            category: classification.category,
            producer,
            consumers,
            referencedBy,
            references,
            gitTracked: true,
            generated: classification.generated,
            regenerable: classification.regenerable,
            uniqueEvidence: classification.uniqueEvidence,
            supersededBy: supersededPaths.get(file) ?? null,
            possibleDuplicateGroup: duplicateGroupByFile.get(file) ?? null,
            recommendedAction: classification.recommendedAction,
            actionConfidence: classification.actionConfidence,
            reason: classification.reason
        });
    }
    return records.sort((a, b) => a.path.localeCompare(b.path));
}

function classifyFile({ file, ext, topLevelArea, canonicalPaths, supersededPaths, duplicateGroupByFile, referencedBy, producer }) {
    if (canonicalPaths.has(file)) {
        return baseClassification('canonical', 'keep_in_place', 'high', 'Current canonical map points here.', { uniqueEvidence: true });
    }
    if (supersededPaths.has(file)) {
        return baseClassification('superseded', 'move_to_archive', 'medium', 'Version-chain or canonical map marks this as superseded but historically useful.', { uniqueEvidence: true });
    }
    if (duplicateGroupByFile.has(file)) {
        return baseClassification('duplicate', 'investigate', 'medium', 'Exact content duplicate detected; removal requires approval and provenance check.');
    }
    if (file === 'reports/latest.md' || file === 'AGENTS.md' || file === 'package.json' || file.endsWith('package-lock.json')) {
        return baseClassification('active_dependency', 'keep_in_place', 'high', 'Operational repository file.');
    }
    if (topLevelArea === 'packages' || topLevelArea === 'python' || topLevelArea === 'tests') {
        return baseClassification('active_dependency', 'keep_in_place', 'high', 'Source code or tests.');
    }
    if (topLevelArea === 'docs') {
        return baseClassification('historical_record', 'keep_but_index', 'medium', 'Documentation or project memory.');
    }
    if (topLevelArea === 'reports') {
        return baseClassification('historical_record', 'keep_but_index', 'medium', 'Report may contain unique reasoning not captured in structured outputs.', { uniqueEvidence: true });
    }
    if (topLevelArea === 'tasks') {
        return baseClassification('historical_record', 'keep_but_index', 'high', 'Task queue/history file.');
    }
    if (topLevelArea === 'scripts') {
        return baseClassification('active_dependency', 'keep_in_place', 'medium', 'Script may regenerate outputs or validate evidence.');
    }
    if (topLevelArea === 'output') {
        if (producer.length > 0 && referencedBy.length === 0 && STRUCTURED_EXTENSIONS.has(ext)) {
            return baseClassification('regenerable_output', 'keep_but_index', 'medium', 'Structured output appears generated and may be terminal evidence; do not remove without approval.', { generated: true, regenerable: true, uniqueEvidence: true });
        }
        return baseClassification('unique_evidence', 'keep_but_index', 'medium', 'Tracked output is treated as evidence unless superseded explicitly.', { generated: true, uniqueEvidence: true });
    }
    if (topLevelArea === 'data') {
        return baseClassification('canonical', 'keep_in_place', 'medium', 'Data manifest or compact evidence input.', { uniqueEvidence: true });
    }
    return baseClassification('unknown', 'investigate', 'low', 'No safe classification rule matched.');
}

function baseClassification(category, recommendedAction, actionConfidence, reason, extra = {}) {
    return {
        category,
        recommendedAction,
        actionConfidence,
        reason,
        generated: false,
        regenerable: false,
        uniqueEvidence: false,
        ...extra
    };
}

function buildCanonicalMap(trackedFiles) {
    const topics = [
        topic('project_state', 'docs/PROJECT_STATE.md', [], [], 'Current project-state narrative.'),
        topic('latest_report_pointer', 'reports/latest.md', [], [], 'Pointer to latest report.'),
        topic('replay_manifest', 'data/replay-manifest.json', [], [], 'Replay inventory manifest when present.'),
        topic('match_91119257_visual_annotation_source', 'output/match_91119257/landmark-source-events.json', [], [], 'Structured source annotation packet if present.'),
        topic('match_91119257_dense_frame_manifest', 'output/match_91119257/dense-frame-manifest-v2.json', [
            'output/match_91119257/video-frame-index.json'
        ], [], 'Dense v2 frame manifest supersedes initial sparse frame index for manual-review context.'),
        topic('completed_human_review', 'output/match_91119257/manual-review-form-v2-completed.json', [
            'output/archive/match_91119257/manual-review/manual-review-form.json',
            'output/archive/match_91119257/manual-review/manual-review-form.csv',
            'output/archive/match_91119257/manual-review/manual-review-form-v2.json',
            'output/archive/match_91119257/manual-review/manual-review-form-v2.csv'
        ], [], 'Completed dense v2 JSON is canonical; CSV remains useful human-readable export.'),
        topic('visual_landmark_evidence', 'output/match_91119257/human-visual-review-evidence.json', [], [], 'Canonical structured human visual evidence if present.'),
        topic('alias_evidence', 'output/match_91119257/canonical-map-aliases.json', [], [], 'Alias evidence remains packet-scoped and must preserve provenance.'),
        topic('representative_visual_intervals', 'output/match_91119257/annotation-visibility-audit.json', [], [], 'Visibility audit identifies representative and ambiguous intervals.'),
        topic('e088_corrected_overlay', 'output/match_91119257/e088-canonical-mapping.json', [
            'output/archive/match_91119257/e088/e088-resolution.json'
        ], [], 'E088 corrected-window overlay preserves original source row.'),
        topic('parser_failure_state', 'output/parser-compatibility/parser-compatibility-gate.json', [], [], 'Current parser compatibility gate.'),
        topic('entity_5594_investigation', 'output/match_91119257/parser-recovery-gate.json', [], [], 'Entity 5594 root-cause gate.'),
        topic('baseline_709_investigation', 'output/match_91119257/baseline-709-gate.json', [], [], 'Baseline 709 protocol-support gate.'),
        topic('current_parser_gate', 'output/parser-compatibility/parser-compatibility-gate.json', [], [], 'Current parser gate after matrix assessment.')
    ].map(item => ({
        ...item,
        exists: trackedFiles.includes(item.canonicalPath),
        supersededPaths: item.supersededPaths.filter(file => trackedFiles.includes(file)),
        historicalDependencies: item.historicalDependencies.filter(file => trackedFiles.includes(file))
    }));
    return {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        topics
    };
}

function topic(topicName, canonicalPath, supersededPaths, historicalDependencies, notes) {
    return { topic: topicName, canonicalPath, supersededPaths, historicalDependencies, notes };
}

function buildVersionChainAudit(trackedFiles) {
    const chainDefinitions = [
        {
            chainId: 'manual_review_json',
            files: [
                'output/archive/match_91119257/manual-review/manual-review-form.json',
                'output/archive/match_91119257/manual-review/manual-review-form-v2.json',
                'output/match_91119257/manual-review-form-v2-completed.json'
            ],
            canonicalPath: 'output/match_91119257/manual-review-form-v2-completed.json'
        },
        {
            chainId: 'manual_review_csv',
            files: [
                'output/archive/match_91119257/manual-review/manual-review-form.csv',
                'output/archive/match_91119257/manual-review/manual-review-form-v2.csv',
                'output/match_91119257/manual-review-form-v2-completed.csv'
            ],
            canonicalPath: 'output/match_91119257/manual-review-form-v2-completed.csv'
        },
        {
            chainId: 'human_observations',
            files: [
                'output/match_91119257/provisional-human-observations.json',
                'output/match_91119257/human-visual-review-responses.json',
                'output/match_91119257/human-visual-review-evidence.json'
            ],
            canonicalPath: 'output/match_91119257/human-visual-review-evidence.json'
        },
        {
            chainId: 'e088_mapping',
            files: [
                'output/archive/match_91119257/e088/e088-resolution.json',
                'output/match_91119257/e088-review-packet.json',
                'output/match_91119257/e088-canonical-mapping.json'
            ],
            canonicalPath: 'output/match_91119257/e088-canonical-mapping.json'
        }
    ];

    return {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        chains: chainDefinitions.map(chain => ({
            chainId: chain.chainId,
            canonicalPath: chain.canonicalPath,
            canonicalExists: trackedFiles.includes(chain.canonicalPath),
            files: chain.files.filter(file => trackedFiles.includes(file)).map(file => ({
                path: file,
                role: file === chain.canonicalPath ? 'canonical' : 'superseded',
                neededForReproducibility: true,
                recommendation: file === chain.canonicalPath ? 'keep_in_place' : 'move_to_archive_after_approval'
            })),
            notes: 'Keep chain together until user approves archival; predecessor files explain provenance.'
        }))
    };
}

function buildDuplicateAnalysis(trackedFiles, hashGroups) {
    const exactDuplicates = [];
    let groupNumber = 1;
    for (const [ hash, files ] of hashGroups.entries()) {
        if (files.length <= 1) continue;
        exactDuplicates.push({
            groupId: `exact_${String(groupNumber).padStart(3, '0')}`,
            hash,
            files,
            recommendation: 'investigate_before_removal'
        });
        groupNumber++;
    }
    return {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        exactDuplicates,
        formatEquivalentPairs: findFormatPairs(trackedFiles),
        supersededVersions: [],
        similarButNotEquivalent: []
    };
}

function findFormatPairs(trackedFiles) {
    const set = new Set(trackedFiles);
    const pairs = [];
    for (const file of trackedFiles) {
        if (!file.endsWith('.json')) continue;
        const csv = file.replace(/\.json$/, '.csv');
        if (set.has(csv)) {
            pairs.push({
                json: file,
                csv,
                status: 'format_pair_not_assumed_duplicate',
                recommendation: 'keep_until_consumers_are_checked'
            });
        }
    }
    return pairs;
}

async function buildTaskIndex(trackedFiles, fileTexts) {
    const taskFiles = trackedFiles.filter(file => file.startsWith('tasks/') && file.endsWith('.md') && !file.endsWith('INDEX.md'));
    const tasks = [];
    for (const file of taskFiles) {
        const text = fileTexts.get(file) ?? await fs.readFile(file, 'utf8');
        const id = path.basename(file).match(/^(\d+)/)?.[1] ?? null;
        tasks.push({
            taskId: id,
            title: firstLine(text).replace(/^#\s*/, ''),
            path: file,
            status: readField(text, 'Status'),
            commit: readCommit(text),
            gate: readGate(text),
            mainReport: findFirstPath(text, 'reports/'),
            successorTask: findSuccessor(text),
            stillRelevant: !file.includes('/completed/') || /blocked|pending|active/i.test(text)
        });
    }
    return {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        duplicateTaskIds: findDuplicateTaskIds(tasks),
        tasks: tasks.sort((a, b) => String(a.taskId).localeCompare(String(b.taskId)))
    };
}

function buildReferenceGraph(inventory) {
    return {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        nodes: inventory.map(file => ({
            path: file.path,
            category: file.category,
            generated: file.generated,
            uniqueEvidence: file.uniqueEvidence
        })),
        edges: inventory.flatMap(file => file.references
            .filter(target => target !== file.path)
            .map(target => ({ from: file.path, to: target, type: 'text_reference' })))
    };
}

function buildCleanupProposal(inventory, duplicateAnalysis) {
    const exactDuplicateKeeps = new Set(duplicateAnalysis.exactDuplicates.map(group => group.files[0]));
    const exactDuplicateMoves = duplicateAnalysis.exactDuplicates.flatMap(group => group.files.slice(1));
    const phaseA = exactDuplicateMoves.map(file => proposal('delete', file, null, 'low', 'Exact duplicate content; delete only after confirming selected keeper.', [], [ 'hash check', 'reference check' ], true));
    const phaseB = inventory
        .filter(file => file.category === 'superseded' || (file.topLevelArea === 'reports' && file.path !== 'reports/latest.md'))
        .slice(0, 200)
        .map(file => proposal('archive', file.path, archiveDestination(file.path), 'medium', 'Historical or superseded file should be easier to browse from archive after approval.', [ file.path ], [ 'link update', 'report index update' ], true));
    const phaseC = duplicateAnalysis.formatEquivalentPairs.map(pair => proposal('consolidate', pair.json, pair.csv, 'high', 'JSON/CSV format pair may be interface-impacting; do not consolidate without consumer migration.', [ pair.json, pair.csv ], [ 'consumer check', 'schema check' ], true));

    return {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        exactDuplicateKeepCandidates: Array.from(exactDuplicateKeeps),
        phases: {
            phaseA_safeCleanup: phaseA,
            phaseB_archivalReorganization: phaseB,
            phaseC_interfaceImpactingConsolidation: phaseC
        },
        notExecuted: true
    };
}

function proposal(operation, source, destination, risk, reason, requiredReferenceUpdates, validationRequired, reversible) {
    return {
        operation,
        source,
        destination,
        risk,
        reason,
        requiredReferenceUpdates,
        validationRequired,
        reversible
    };
}

function archiveDestination(file) {
    if (file.startsWith('reports/')) return file.replace(/^reports\//, 'reports/archive/');
    if (file.startsWith('output/')) return file.replace(/^output\//, 'output/archive/');
    return `archive/${file}`;
}

function buildMetrics(inventory, duplicateAnalysis, cleanupProposal, ignoredFiles) {
    const byTopLevel = countBy(inventory, file => file.topLevelArea);
    const byCategory = countBy(inventory, file => file.category);
    const totalTrackedSizeBytes = inventory.reduce((sum, file) => sum + file.sizeBytes, 0);
    return {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        totalTrackedFiles: inventory.length,
        filesByTopLevelDirectory: byTopLevel,
        filesByCategory: byCategory,
        totalTrackedSizeBytes,
        outputFileCount: inventory.filter(file => file.topLevelArea === 'output').length,
        reportCount: inventory.filter(file => file.topLevelArea === 'reports').length,
        taskCount: inventory.filter(file => file.topLevelArea === 'tasks').length,
        exactDuplicateGroups: duplicateAnalysis.exactDuplicates.length,
        exactDuplicateFiles: duplicateAnalysis.exactDuplicates.reduce((sum, group) => sum + group.files.length, 0),
        supersededCount: inventory.filter(file => file.category === 'superseded').length,
        regenerableCount: inventory.filter(file => file.regenerable).length,
        unknownCount: inventory.filter(file => file.category === 'unknown').length,
        phaseAEstimatedRemovals: cleanupProposal.phases.phaseA_safeCleanup.length,
        phaseBEstimatedArchivalMoves: cleanupProposal.phases.phaseB_archivalReorganization.length,
        phaseCEstimatedConsolidations: cleanupProposal.phases.phaseC_interfaceImpactingConsolidation.length,
        estimatedVisibleNavigationReductionAfterIndexing: inventory.filter(file => [ 'reports', 'tasks', 'output' ].includes(file.topLevelArea)).length,
        ignoredConventionSamples: ignoredFiles.slice(0, 200),
        localOnlyConventions: [
            'output-local/',
            '.venv-video/',
            'generated frame directories',
            'contact sheets',
            'pip/npm caches',
            'model weights and downloaded OCR/detection/VLM assets'
        ]
    };
}

function buildRepositoryGuide(metrics, canonicalMap) {
    return `# Repository Guide

This repository keeps source code, task history, compact evidence, reports, and generated structured outputs together. Use this guide to distinguish current canonical files from historical evidence.

## Source Code

- Node parser and engine code: \`packages/engine/\`
- Deadlock package code: \`packages/deadem/\`
- Video pipeline Python package: \`python/deadem/video_pipeline/\`
- Utility and experiment scripts: \`scripts/\` and \`experiments/\`
- Tests: \`packages/*/tests/\` and \`tests/video_pipeline/\`

## Project State

- Current narrative state: \`docs/PROJECT_STATE.md\`
- Queue rules: \`AGENTS.md\`, \`docs/WORKFLOW.md\`, \`docs/CODEX_QUEUE_RUNNER.md\`
- Parser failure catalog: \`docs/PARSER_FAILURE_CATALOG.md\`

## Evidence And Outputs

Tracked compact evidence lives under \`output/\`. Files there may be canonical, diagnostic, historical, or regenerable. See \`output/README.md\` and \`output/repository-audit/canonical-file-map.json\`.

Current canonical topics include:

${canonicalMap.topics.filter(topic => topic.exists).map(topic => `- ${topic.topic}: \`${topic.canonicalPath}\``).join('\n')}

## Reports

- Current report pointer: \`reports/latest.md\`
- Human report index: \`reports/INDEX.md\`
- Reports are historical records unless a task states otherwise.

## Task History

- Completed task index: \`tasks/completed/INDEX.md\`
- Executable queue: \`tasks/pending/\`
- Blocked work: \`tasks/blocked/\`
- Future ideas: \`tasks/backlog/\`

## Local-Only Directories

\`output-local/\`, virtual environments, frame dumps, contact sheets, caches, model weights, MP4 files, and DEM files should remain local unless a future task explicitly permits a compact manifest.

## Match 91119257

Start with \`docs/PROJECT_STATE.md\`, then read current reports under \`reports/INDEX.md\` in the visual calibration, human review, and parser recovery groups. Use neutral IDs unless a canonical alias file explicitly records packet-scoped provenance.

## Canonical Versus Historical

Canonical files are current inputs or decisions. Historical files preserve provenance and should not be deleted merely because a newer file exists. Superseded files may be archived only after the cleanup proposal is explicitly approved.

Audit metrics: ${metrics.totalTrackedFiles} tracked files, ${metrics.outputFileCount} tracked output files, ${metrics.reportCount} reports.
`;
}

function buildReportsIndex(inventory) {
    const reports = inventory.filter(file => file.topLevelArea === 'reports' && file.path.endsWith('.md'));
    const groups = {
        current: reports.filter(file => file.path === 'reports/latest.md' || /repository-hygiene|parser-compatibility|latest/i.test(file.path)),
        visualCalibration: reports.filter(file => /visual|video|annotation|landmark|91119257/i.test(file.path)),
        humanReview: reports.filter(file => /human|review|e088|ocr/i.test(file.path)),
        parserRecovery: reports.filter(file => /parser|entity|baseline|compatibility/i.test(file.path)),
        projectProcess: reports.filter(file => /workflow|project|repository|queue|intake|multi-replay/i.test(file.path)),
        otherHistorical: reports
    };
    const used = new Set();
    const section = (title, files) => {
        const unique = files.filter(file => {
            if (used.has(file.path)) return false;
            used.add(file.path);
            return true;
        });
        return `## ${title}\n\n${unique.length === 0 ? '- None currently identified.' : unique.map(file => `- \`${file.path}\``).join('\n')}\n`;
    };
    return `# Reports Index

Final/current reports are listed first. Historical reports are grouped by domain and should be preserved unless a cleanup phase is explicitly approved.

${section('Current And Final Reports', groups.current)}
${section('Visual Calibration', groups.visualCalibration)}
${section('Human Review', groups.humanReview)}
${section('Parser Recovery', groups.parserRecovery)}
${section('Project Process', groups.projectProcess)}
${section('Other Historical Reports', reports)}
`;
}

function buildCompletedTasksIndex(taskIndex) {
    const completed = taskIndex.tasks.filter(task => task.path.startsWith('tasks/completed/'));
    return `# Completed Task Index

This is a compact navigation index. The task files remain the source records.

| Task | Title | Gate | Commit | Main report | Successor |
| --- | --- | --- | --- | --- | --- |
${completed.map(task => `| ${task.taskId ?? ''} | ${escapeTable(task.title)} | ${escapeTable(task.gate ?? '')} | ${escapeTable(task.commit ?? '')} | ${task.mainReport ? `\`${task.mainReport}\`` : ''} | ${escapeTable(task.successorTask ?? '')} |`).join('\n')}
`;
}

function buildOutputReadme(metrics) {
    return `# Output Directory

\`output/\` contains compact structured outputs and evidence packets. It is intentionally noisy because many files preserve auditability.

## Conventions

- Canonical evidence: current decision or input artifacts listed in \`output/repository-audit/canonical-file-map.json\`.
- Diagnostic outputs: parser, video, model, geometry, and replay-analysis evidence used to explain a decision.
- Intermediate outputs: generated files that can often be regenerated, but may still be tracked to preserve exact provenance.
- Regenerable outputs: files with known producer scripts; do not delete until a cleanup phase is approved.
- Local-only outputs: frames, contact sheets, dense media extracts, caches, and large debug logs belong in \`output-local/\` or ignored directories.

## Generated-File Policy

- Track compact JSON/JSONL/CSV manifests when they are evidence or task outputs.
- Keep frames, MP4 files, DEM files, model weights, and contact sheets out of Git.
- Do not assume JSON/CSV pairs are duplicates; one may serve machine use and the other human review.
- Full logs and debug traces should be local unless a bounded task explicitly requires a compact trace.

## Current Audit

- Tracked output files: ${metrics.outputFileCount}
- Regenerable output files: ${metrics.regenerableCount}
- Unknown files requiring investigation: ${metrics.unknownCount}
- Cleanup proposal: \`output/repository-audit/cleanup-proposal.json\`
`;
}

function buildReport(metrics, cleanupProposal, gate) {
    return `# Repository Hygiene And Cleanup Audit

Date: 2026-06-29

## Scope

This audit inventoried tracked repository files and detectable ignored/local conventions. It did not process replays, inspect replay 005 contents, move existing files, delete files, or execute cleanup.

## Metrics

- Tracked files audited: ${metrics.totalTrackedFiles}
- Tracked repository size: ${metrics.totalTrackedSizeBytes} bytes
- Output files: ${metrics.outputFileCount}
- Reports: ${metrics.reportCount}
- Tasks: ${metrics.taskCount}
- Exact duplicate groups: ${metrics.exactDuplicateGroups}
- Superseded files: ${metrics.supersededCount}
- Regenerable files: ${metrics.regenerableCount}
- Unknown files: ${metrics.unknownCount}

## Cleanup Proposal

- Phase A safe cleanup candidates: ${cleanupProposal.phases.phaseA_safeCleanup.length}
- Phase B archival candidates: ${cleanupProposal.phases.phaseB_archivalReorganization.length}
- Phase C consolidation candidates: ${cleanupProposal.phases.phaseC_interfaceImpactingConsolidation.length}

No cleanup phase was executed. The blocked follow-up task requires explicit user approval and an allowlist.

## Navigation Created

- \`docs/REPOSITORY_GUIDE.md\`
- \`reports/INDEX.md\`
- \`tasks/completed/INDEX.md\`
- \`output/README.md\`

## Gate

\`${gate.gate}\`
`;
}

async function createBlockedCleanupTask() {
    const content = `# Task 049: Apply Approved Repository Cleanup Plan

Status: blocked
Execution mode: autonomous
Project stage: repository hygiene
Related experiment: repository maintenance
Priority: medium
Depends on: task 048 completed
Unlocked by: explicit user approval of cleanup proposal with allowlisted files
Blocks: repository cleanup execution

## Objective

Apply only an explicitly approved repository cleanup allowlist derived from \`output/repository-audit/cleanup-proposal.json\`.

## Context to read

- \`AGENTS.md\`
- \`docs/PROJECT_STATE.md\`
- \`reports/repository-hygiene-and-cleanup-audit.md\`
- \`output/repository-audit/cleanup-proposal.json\`

## Work requested

Delete, move, archive, or consolidate only files explicitly allowlisted by the user.

## Constraints

- No broad glob deletion.
- No replay, MP4, frame, contact sheet, cache, or virtual-environment commits.
- No cleanup operation without an explicit source and destination or delete allowlist.
- Validate every reference update.

## Inputs

- User-approved allowlist of files to delete.
- User-approved allowlist of files to move.
- User-approved allowlist of files to archive.
- User-approved allowlist of files to consolidate.

## Outputs

- Cleanup commit with reference updates and validation report.

## Acceptance criteria

- Only allowlisted files are changed.
- Reference updates pass validation.
- Git diff contains no unapproved paths.

## Required validation

- JSON/CSV validation.
- Documentation-link validation.
- Task queue validation.
- Git status validation.

## Gate result

Blocked until user approval.

## Documentation updates

Update indexes and repository guide if approved paths move.

## Git scope

Stage only approved cleanup paths and required reference updates.

## Expected report

Summarize approved cleanup operations and validation.

## Stop conditions

Stop if the requested cleanup is broader than the explicit allowlist.
`;
    await fs.writeFile('tasks/blocked/049-apply-approved-repository-cleanup-plan.md', content);
}

async function readTextFiles(files) {
    const result = new Map();
    for (const file of files) {
        if (!TEXT_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;
        const stat = await fs.stat(file);
        if (stat.size > 2 * 1024 * 1024) continue;
        try {
            result.set(file, await fs.readFile(file, 'utf8'));
        } catch {
            result.set(file, '');
        }
    }
    return result;
}

function buildReferenceIndex(files, fileTexts) {
    const referencesByFile = new Map(files.map(file => [ file, [] ]));
    for (const target of files) {
        const needles = new Set([ target, target.replaceAll('/', '\\') ]);
        for (const [ source, text ] of fileTexts.entries()) {
            if (source === target) continue;
            for (const needle of needles) {
                if (needle.length > 3 && text.includes(needle)) {
                    referencesByFile.get(target).push(source);
                    break;
                }
            }
        }
    }
    return referencesByFile;
}

function extractPathReferences(text) {
    const matches = new Set();
    const regex = /\b(?:docs|reports|output|tasks|scripts|experiments|data|packages|python|tests)\/[A-Za-z0-9_./-]+/g;
    for (const match of text.matchAll(regex)) matches.add(match[0].replace(/[),.;:]+$/, ''));
    return Array.from(matches).sort();
}

function findProducers(file, trackedFiles, fileTexts) {
    const producers = [];
    for (const [ source, text ] of fileTexts.entries()) {
        if (!source.startsWith('scripts/') && !source.startsWith('experiments/')) continue;
        if (text.includes(file) || text.includes(file.replaceAll('/', '\\'))) producers.push(source);
    }
    return producers;
}

function findConsumers(file, referencedBy) {
    return referencedBy.filter(source => source.startsWith('scripts/') || source.startsWith('experiments/') || source.startsWith('tests/') || source.startsWith('packages/'));
}

async function buildHashGroups(files) {
    const groups = new Map();
    for (const file of files) {
        const stat = await fs.stat(file);
        if (stat.size > 5 * 1024 * 1024) continue;
        const buffer = await fs.readFile(file);
        const hash = createHash('sha256').update(buffer).digest('hex');
        const group = groups.get(hash) ?? [];
        group.push(file);
        groups.set(hash, group);
    }
    return groups;
}

function countBy(items, keyFn) {
    const result = {};
    for (const item of items) {
        const key = keyFn(item) || 'unknown';
        result[key] = (result[key] ?? 0) + 1;
    }
    return result;
}

function inventoryToCsv(inventory) {
    const fields = [
        'path', 'sizeBytes', 'extension', 'topLevelArea', 'category', 'generated', 'regenerable',
        'uniqueEvidence', 'supersededBy', 'possibleDuplicateGroup', 'recommendedAction', 'actionConfidence', 'reason'
    ];
    return [
        fields.join(','),
        ...inventory.map(record => fields.map(field => csvCell(record[field])).join(','))
    ].join('\n') + '\n';
}

function csvCell(value) {
    if (value === null || value === undefined) return '';
    const text = Array.isArray(value) ? value.join('|') : String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function firstLine(text) {
    return text.split(/\r?\n/)[0] ?? '';
}

function readField(text, fieldName) {
    const match = text.match(new RegExp(`^${fieldName}:\\s*(.+)$`, 'm'));
    return match?.[1]?.trim() ?? null;
}

function readCommit(text) {
    const match = text.match(/\bCommit:\s*`?([0-9a-f]{7,40})`?/i) ?? text.match(/\bcommit\s*[:=]\s*`?([0-9a-f]{7,40})`?/i);
    return match?.[1] ?? null;
}

function readGate(text) {
    const section = text.match(/## Gate result\s+([\s\S]*?)(?:\n## |\n# |$)/i);
    const line = section?.[1]?.split(/\r?\n/).map(item => item.trim()).find(Boolean);
    if (line && !/Pending|Blocked until/i.test(line)) return line.replace(/^`|`$/g, '');
    const match = text.match(/\bGate:\s*`?([A-Za-z0-9_:-]+)`?/i);
    return match?.[1] ?? null;
}

function findFirstPath(text, prefix) {
    const match = text.match(new RegExp(`${prefix.replace('/', '/')}[A-Za-z0-9_./-]+`));
    return match?.[0] ?? null;
}

function findSuccessor(text) {
    const match = text.match(/\b(?:successor|Blocks|blocked task|follow-up task)[:\s]+`?([0-9]{3}[A-Za-z0-9_./-]*)`?/i);
    return match?.[1] ?? null;
}

function findDuplicateTaskIds(tasks) {
    const byId = new Map();
    for (const task of tasks) {
        if (task.taskId === null) continue;
        const group = byId.get(task.taskId) ?? [];
        group.push(task.path);
        byId.set(task.taskId, group);
    }
    return Array.from(byId.entries())
        .filter(([ , files ]) => files.length > 1)
        .map(([ taskId, files ]) => ({ taskId, files }));
}

function escapeTable(value) {
    return String(value ?? '').replaceAll('|', '\\|').replace(/\r?\n/g, ' ');
}

async function gitLines(args) {
    const { stdout } = await execFileAsync('git', args, { maxBuffer: 32 * 1024 * 1024 });
    return stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
        .map(line => line.replace(/^!!\s+/, '').replace(/^..\s+/, '').replaceAll('\\', '/'));
}

async function gitIgnoredLines() {
    const { stdout } = await execFileAsync('git', [ 'status', '--ignored', '--short' ], { maxBuffer: 32 * 1024 * 1024 });
    return stdout.split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.startsWith('!! '))
        .map(line => line.replace(/^!!\s+/, '').replaceAll('\\', '/'));
}

async function writeJson(filePath, data) {
    await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}
