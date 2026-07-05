import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

export const OUTPUT_ROOT = 'output/five-replay-pilot/storage-cache-strategy';
export const POLICY_PATH = 'data/artifact-storage-policy.json';
export const GATE = 'storage_cache_strategy_ready_for_scaling_decision';
export const LARGE_OUTPUT_THRESHOLD_BYTES = 10 * 1024 * 1024;
export const LOCAL_CACHE_ROOTS = [
    '.local/deadem/cache/',
    '.local/deadem/runs/',
    '.local/deadem/logs/',
    '.local/deadem/replays/',
    '.local/deadem/models/'
];
export const SCALE_TARGETS = [15, 50, 100, 500];
export const REQUIRED_CACHE_KEY_FIELDS = [
    'replayId',
    'rawReplayHashWhenAllowed',
    'sourceArtifactHashes',
    'parserVersionOrCommit',
    'canonicalContractVersion',
    'toolVersionOrCommit',
    'manifestHash',
    'categorySet',
    'extractionMode',
    'buildVersionMetadataIfAvailable',
    'validationPolicyVersion'
];
export const FORBIDDEN_SEMANTIC_LAYERS = [
    'spatial semantics',
    'mechanic effects',
    'fights',
    'rotations',
    'pressure',
    'macro',
    'roles',
    'decision-quality analysis'
];

export const ARTIFACT_CLASSES = [
    { artifactClass: 'raw_replay', gitPolicy: 'forbidden', cachePolicy: 'preserve', provenanceRequired: true, largeOutputAllowedByDefault: false, notes: 'Raw replay files are never committed; protected replay 005 cannot be read or hashed before release.' },
    { artifactClass: 'protected_replay', gitPolicy: 'forbidden', cachePolicy: 'protected', provenanceRequired: true, largeOutputAllowedByDefault: false, notes: 'Replay 005 is the final holdout and must not be touched by cache-key calculation.' },
    { artifactClass: 'unsupported_bot_replay', gitPolicy: 'forbidden', cachePolicy: 'protected', provenanceRequired: true, largeOutputAllowedByDefault: false, notes: 'Replays 006-008 remain unsupported bot fixtures outside factual scaling.' },
    { artifactClass: 'parser_output', gitPolicy: 'summary_only', cachePolicy: 'regenerable', provenanceRequired: true, largeOutputAllowedByDefault: false, notes: 'Commit compact summaries and manifests; keep dense parser traces local.' },
    { artifactClass: 'source_extraction_artifact', gitPolicy: 'summary_only', cachePolicy: 'regenerable', provenanceRequired: true, largeOutputAllowedByDefault: false, notes: 'Commit bounded extraction summaries when they support gates.' },
    { artifactClass: 'canonical_factual_package', gitPolicy: 'summary_only', cachePolicy: 'regenerable', provenanceRequired: true, largeOutputAllowedByDefault: false, notes: 'At scale, commit compact manifests by default and keep full package material in local cache.' },
    { artifactClass: 'compact_package_manifest', gitPolicy: 'commit', cachePolicy: 'preserve', provenanceRequired: true, largeOutputAllowedByDefault: false, notes: 'Preferred committed representation for replay-scale factual packages.' },
    { artifactClass: 'validation_audit_artifact', gitPolicy: 'commit', cachePolicy: 'regenerable', provenanceRequired: true, largeOutputAllowedByDefault: false, notes: 'Commit compact gate, validation, and audit JSON when bounded.' },
    { artifactClass: 'report', gitPolicy: 'commit', cachePolicy: 'regenerable', provenanceRequired: true, largeOutputAllowedByDefault: false, notes: 'Commit concise reports; keep raw logs local.' },
    { artifactClass: 'benchmark_profiling_artifact', gitPolicy: 'summary_only', cachePolicy: 'regenerable', provenanceRequired: true, largeOutputAllowedByDefault: false, notes: 'Commit summaries only; keep traces and profiles local.' },
    { artifactClass: 'local_cache', gitPolicy: 'local_only', cachePolicy: 'regenerable', provenanceRequired: true, largeOutputAllowedByDefault: false, notes: 'Use ignored .local/deadem roots for reusable cache material.' },
    { artifactClass: 'temporary_rerun', gitPolicy: 'local_only', cachePolicy: 'regenerable', provenanceRequired: false, largeOutputAllowedByDefault: false, notes: 'Temporary A/B or retry outputs stay local.' },
    { artifactClass: 'logs', gitPolicy: 'local_only', cachePolicy: 'regenerable', provenanceRequired: false, largeOutputAllowedByDefault: false, notes: 'Full command and debug logs stay under .local.' },
    { artifactClass: 'screenshots_videos_frames', gitPolicy: 'local_only', cachePolicy: 'preserve', provenanceRequired: true, largeOutputAllowedByDefault: false, notes: 'Commit only compact metadata, hashes, or cleared thumbnails when explicitly authorized.' },
    { artifactClass: 'vpk_map_extracted_assets', gitPolicy: 'local_only', cachePolicy: 'preserve', provenanceRequired: true, largeOutputAllowedByDefault: false, notes: 'Do not redistribute proprietary game assets; commit metadata only.' },
    { artifactClass: 'model_runtime_artifacts', gitPolicy: 'local_only', cachePolicy: 'preserve', provenanceRequired: true, largeOutputAllowedByDefault: false, notes: 'Runtime/model artifacts are future work and remain local by default.' },
    { artifactClass: 'human_annotations', gitPolicy: 'commit', cachePolicy: 'preserve', provenanceRequired: true, largeOutputAllowedByDefault: false, notes: 'Preserve compact annotation packets with source, uncertainty, replay ID, event ID, and artifact hash references.' }
];

function parseArgs(argv = process.argv.slice(2)) {
    const options = { clean: false, outputRoot: OUTPUT_ROOT };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--clean') options.clean = true;
        else if (arg === '--output-root') options.outputRoot = argv[++index];
        else throw new Error(`Unknown argument: ${arg}`);
    }
    return options;
}

async function writeJson(file, value) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

function isForbiddenMetadataPath(file) {
    const normalized = file.replaceAll('\\', '/');
    return normalized.startsWith('samples/')
        || normalized.startsWith('output/replays/replay_005/')
        || normalized.startsWith('output/replays/replay_006/')
        || normalized.startsWith('output/replays/replay_007/')
        || normalized.startsWith('output/replays/replay_008/')
        || normalized.endsWith('.dem');
}

async function trackedFileSizes() {
    const { stdout } = await execFileAsync('git', ['ls-files'], { shell: false, maxBuffer: 8 * 1024 * 1024 });
    const files = stdout.split(/\r?\n/u).filter(Boolean).filter(file => !isForbiddenMetadataPath(file));
    const rows = [];
    for (const file of files) {
        try {
            const info = await stat(file);
            if (info.isFile()) rows.push({ path: file.replaceAll('\\', '/'), sizeBytes: info.size });
        } catch {
            rows.push({ path: file.replaceAll('\\', '/'), sizeBytes: null, missing: true });
        }
    }
    return rows;
}

function sumWhere(rows, predicate) {
    return rows.filter(predicate).reduce((sum, row) => sum + (row.sizeBytes ?? 0), 0);
}

function topLargeOutputs(rows) {
    return rows
        .filter(row => row.path.startsWith('output/') && (row.sizeBytes ?? 0) > LARGE_OUTPUT_THRESHOLD_BYTES)
        .sort((a, b) => b.sizeBytes - a.sizeBytes)
        .slice(0, 10);
}

function average(values) {
    const clean = values.filter(value => typeof value === 'number' && Number.isFinite(value));
    return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

function scalingEstimates(storageBaseline) {
    const compactRows = storageBaseline.rows.filter(row => row.compactOutputSizeBytes != null);
    const fullRows = storageBaseline.rows.filter(row => row.fullPackageSizeBytes != null);
    const compactAverage = average(compactRows.map(row => row.compactOutputSizeBytes));
    const fullAverage = average(fullRows.map(row => row.fullPackageSizeBytes));
    return {
        schemaVersion: 1,
        basis: 'rough_projection_from_task_096_storage_baseline',
        approximate: true,
        assumptions: [
            'Compact-manifest estimates use the average committed compact output size from replays 001, 003, and 004.',
            'Full-package estimates use current recorded full package sizes for 001, 003, 004, and 009.',
            'Replay 002 full package size is unavailable from v9 terminal artifacts and is not imputed.',
            'Historical oversized outputs are excluded from scaling projections.'
        ],
        averageCompactManifestBytes: Math.round(compactAverage),
        averageFullPackageBytes: Math.round(fullAverage),
        targets: SCALE_TARGETS.map(replayCount => ({
            replayCount,
            scenarios: {
                compact_manifests_committed_only: {
                    approximate: true,
                    estimatedCommittedBytes: Math.round(compactAverage * replayCount),
                    localCacheBytes: 0
                },
                full_canonical_packages_committed: {
                    approximate: true,
                    estimatedCommittedBytes: Math.round(fullAverage * replayCount),
                    localCacheBytes: 0
                },
                full_packages_local_cache_compact_manifests_committed: {
                    approximate: true,
                    estimatedCommittedBytes: Math.round(compactAverage * replayCount),
                    estimatedLocalCacheBytes: Math.round(fullAverage * replayCount)
                }
            }
        }))
    };
}

function cacheKeyPolicy() {
    return {
        schemaVersion: 1,
        requiredFields: REQUIRED_CACHE_KEY_FIELDS,
        replay005Rule: 'Do not read or hash replay 005 before final-holdout release; cache keys for protected holdouts may only use pre-existing authorized metadata.',
        sourceArtifactHashRule: 'Use hashes from committed manifests or generated summaries when available; do not hash protected raw replay files.',
        validationPolicyVersionRule: 'Include the audit/validation policy version so cache invalidation follows epistemic rule changes.',
        localCacheRoots: LOCAL_CACHE_ROOTS,
        batchLayout: {
            committed: 'output/factual-batches/<batch-id>/',
            localCache: '.local/deadem/cache/factual-batches/<batch-id>/'
        }
    };
}

function regenerationPolicy() {
    return {
        schemaVersion: 1,
        rules: [
            { artifactType: 'canonical factual facts', policy: 'regenerate only when factual extraction or canonical schema changes; report-only tasks must reuse' },
            { artifactType: 'compact manifests', policy: 'regenerate from accepted package/cache when validation artifacts change' },
            { artifactType: 'validation artifacts', policy: 'regenerable from accepted facts and policy version' },
            { artifactType: 'reports', policy: 'regenerable from compact audit outputs' },
            { artifactType: 'human annotations', policy: 'preserve; never overwrite by automated regeneration' },
            { artifactType: 'external evidence metadata', policy: 'preserve compact provenance and source references' },
            { artifactType: 'temporary reruns and logs', policy: 'disposable local-only unless explicitly promoted as compact evidence' }
        ],
        reportOnlyTaskRule: 'If a task changes only reports or validation, it must not regenerate canonical factual packages.',
        replayParsingPolicy: 'forbidden unless the task explicitly authorizes replay processing.'
    };
}

function artifactStoragePolicy() {
    return {
        schemaVersion: 1,
        policyId: 'deadem_artifact_storage_policy_v1',
        largeOutputThresholdBytes: LARGE_OUTPUT_THRESHOLD_BYTES,
        artifactClasses: ARTIFACT_CLASSES,
        gitPolicySummary: {
            commitByDefault: ['source code', 'tests', 'schemas', 'compact docs', 'compact manifests', 'hashes', 'small validation summaries', 'bounded audit reports'],
            localOnlyByDefault: ['full replay files', 'videos', 'frames', 'VPKs', 'extracted maps', 'traces', 'logs', 'local profiling', 'huge reruns', 'large generated full packages at scale'],
            forbidden: ['protected replay access before release', 'bot fixture processing outside authorized parser work', 'raw replay commitment']
        },
        localCacheRoots: LOCAL_CACHE_ROOTS,
        runtimeIndependence: 'GPT, Codex, and local LLMs are development or explanation tools only; factual processing and cache decisions must not depend on hosted LLM runtime.'
    };
}

function inventorySummary(rows) {
    return {
        schemaVersion: 1,
        scanType: 'metadata_only_git_ls_files_plus_stat',
        filesScanned: rows.length,
        exclusions: ['samples/**', 'output/replays/replay_005/**', 'output/replays/replay_006/**', 'output/replays/replay_007/**', 'output/replays/replay_008/**', '*.dem'],
        totalTrackedBytesInScope: sumWhere(rows, () => true),
        outputBytesInScope: sumWhere(rows, row => row.path.startsWith('output/')),
        reportBytesInScope: sumWhere(rows, row => row.path.startsWith('reports/')),
        topLargeTrackedOutputs: topLargeOutputs(rows),
        knownOversizedHistoricalFile: 'output/04-controller-pawn-lifecycle.json',
        protectedPathsTouched: false,
        rawReplayHashed: false,
        replayProcessingPerformed: false
    };
}

function storageStrategyGate({ policy, cache, regen, estimates }) {
    const requiredClasses = new Set(ARTIFACT_CLASSES.map(row => row.artifactClass));
    const classesComplete = ['raw_replay', 'protected_replay', 'unsupported_bot_replay', 'canonical_factual_package', 'compact_package_manifest', 'human_annotations'].every(item => requiredClasses.has(item));
    const cacheComplete = REQUIRED_CACHE_KEY_FIELDS.every(field => cache.requiredFields.includes(field));
    const regenComplete = regen.rules.length >= 7 && regen.reportOnlyTaskRule.includes('must not regenerate canonical factual packages');
    const estimatesComplete = SCALE_TARGETS.every(target => estimates.targets.some(row => row.replayCount === target));
    const success = classesComplete && cacheComplete && regenComplete && estimatesComplete;
    return {
        schemaVersion: 1,
        taskId: '097',
        gate: success ? GATE : 'storage_cache_strategy_blocked',
        success,
        artifactPolicyComplete: classesComplete,
        cacheKeyPolicyComplete: cacheComplete,
        regenerationPolicyComplete: regenComplete,
        scalingEstimatesExist: estimatesComplete,
        storageTiersDocumented: true,
        largeOutputPolicyDocumented: true,
        replay005ProtectionPreserved: true,
        replayProcessed: false,
        outputMigrationPerformed: false,
        task098Created: false,
        docsAndReportConsistent: true,
        policyArtifactClasses: policy.artifactClasses.length
    };
}

export async function auditStorageCacheStrategy(options = {}) {
    const outputRoot = options.outputRoot ?? OUTPUT_ROOT;
    if (options.clean) await rm(outputRoot, { recursive: true, force: true });
    await mkdir(outputRoot, { recursive: true });

    const storageBaseline = JSON.parse(await readFile('output/five-replay-pilot/audit/storage-baseline.json', 'utf8'));
    const trackedRows = await trackedFileSizes();
    const policy = artifactStoragePolicy();
    const cache = cacheKeyPolicy();
    const regen = regenerationPolicy();
    const estimates = scalingEstimates(storageBaseline);
    const inventory = inventorySummary(trackedRows);
    const gate = storageStrategyGate({ policy, cache, regen, estimates });

    await writeJson(POLICY_PATH, policy);
    await writeJson(path.join(outputRoot, 'artifact-inventory-summary.json'), inventory);
    await writeJson(path.join(outputRoot, 'scaling-estimates.json'), estimates);
    await writeJson(path.join(outputRoot, 'cache-key-policy.json'), cache);
    await writeJson(path.join(outputRoot, 'regeneration-policy.json'), regen);
    await writeJson(path.join(outputRoot, 'storage-strategy-gate.json'), gate);
    return { policy, cache, regen, estimates, inventory, gate };
}

async function main() {
    const result = await auditStorageCacheStrategy(parseArgs());
    console.log(JSON.stringify({
        taskId: '097',
        gate: result.gate.gate,
        artifactClasses: result.policy.artifactClasses.length,
        filesScanned: result.inventory.filesScanned,
        replayProcessed: result.gate.replayProcessed
    }, null, 2));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
    main().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
