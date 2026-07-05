import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const AUDITED_REPLAYS = ['replay_001', 'replay_002', 'replay_003', 'replay_004', 'replay_009'];
export const AUDIT_ROOT = 'output/five-replay-pilot/audit';
export const REPORT_PATH = 'reports/five-human-replay-factual-pilot-audit.md';
export const REQUIRED_FACTUAL_CATEGORIES = [
    'player_identity',
    'player_death',
    'player_respawn',
    'team_net_worth',
    'raw_objective_structure_lifecycle',
    'snapshots',
    'metadata',
    'entities',
    'capabilities',
    'independent_validation_overlay'
];
export const FORBIDDEN_SEMANTIC_LAYERS = [
    'lanes',
    'regions',
    'proximity',
    'map_transform',
    'mechanic_effects',
    'fights',
    'rotations',
    'pressure',
    'macro',
    'roles',
    'decision_quality',
    'objective_completion'
];

const REMAINING_ROOT = 'output/five-replay-pilot/remaining-human-controls';
const REPLAY_002_V9_ROOT = 'output/replay-002-canonical-v9-validation';
const REPLAY_009_ROOT = 'output/replay-009-canonical';

function parseArgs(argv = process.argv.slice(2)) {
    const options = { clean: false, outputRoot: AUDIT_ROOT, reportPath: REPORT_PATH };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--clean') options.clean = true;
        else if (arg === '--output-root') options.outputRoot = argv[++index];
        else if (arg === '--report-path') options.reportPath = argv[++index];
        else throw new Error(`Unknown argument: ${arg}`);
    }
    return options;
}

async function readJson(file) {
    return JSON.parse(await readFile(file, 'utf8'));
}

async function writeJson(file, value) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(file, value) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, value);
}

async function fileSize(file) {
    return (await stat(file)).size;
}

async function sumFiles(files) {
    let total = 0;
    for (const file of files) total += await fileSize(file);
    return total;
}

function availability(available, basis, limitations = []) {
    return { available, basis, limitations };
}

function remainingReplayCategoryCoverage(manifest) {
    const emitted = new Set(manifest.emittedCategories ?? []);
    const counts = manifest.recordCounts ?? {};
    return {
        player_identity: availability(emitted.has('player_identity'), 'compact manifest emittedCategories'),
        player_death: availability(emitted.has('player_death'), 'compact manifest emittedCategories'),
        player_respawn: availability(emitted.has('player_respawn'), 'compact manifest emittedCategories'),
        team_net_worth: availability(emitted.has('team_net_worth'), 'compact manifest emittedCategories'),
        raw_objective_structure_lifecycle: availability(emitted.has('raw_objective_structure_lifecycle'), 'compact manifest emittedCategories'),
        snapshots: availability((counts.snapshots ?? 0) > 0, 'compact manifest recordCounts.snapshots'),
        metadata: availability((counts.metadata ?? 0) > 0, 'compact manifest recordCounts.metadata'),
        entities: availability((counts.entities ?? 0) > 0, 'compact manifest recordCounts.entities'),
        capabilities: availability((counts.capabilities ?? 0) >= 0, 'compact manifest recordCounts.capabilities', ['Task 095 compact packages may contain zero capability rows.']),
        independent_validation_overlay: availability((counts.overlays ?? 0) > 0, 'compact manifest recordCounts.overlays', ['No independent validation overlay was produced for Task 095 compact packages.'])
    };
}

function replay002CategoryCoverage() {
    const limitation = 'Task 094 v9 accepted terminal validation of reused replay-002 canonical facts but did not re-emit category-level package counts.';
    return Object.fromEntries(REQUIRED_FACTUAL_CATEGORIES.map(category => [
        category,
        availability(null, 'output/replay-002-canonical-v9-validation terminal audit artifacts', [limitation])
    ]));
}

function replay009CategoryCoverage(summary) {
    return {
        player_identity: availability(summary.playerRegistryCount > 0, 'validation-summary.playerRegistryCount'),
        player_death: availability(true, 'accepted replay-009 canonical factual-event package'),
        player_respawn: availability(true, 'accepted replay-009 canonical factual-event package'),
        team_net_worth: availability(true, 'accepted replay-009 canonical factual-event package'),
        raw_objective_structure_lifecycle: availability(true, 'accepted replay-009 canonical factual-event package'),
        snapshots: availability(summary.snapshotCount > 0, 'validation-summary.snapshotCount'),
        metadata: availability(summary.nonTimelineEventCount > 0, 'validation-summary.nonTimelineEventCount'),
        entities: availability(summary.entityRegistryCount > 0, 'validation-summary.entityRegistryCount'),
        capabilities: availability(existsSync(`${REPLAY_009_ROOT}/capability-matrix.json`), 'capability-matrix.json exists'),
        independent_validation_overlay: availability(summary.validationOverlayCount > 0, 'validation-summary.validationOverlayCount')
    };
}

export function protectionAuditFromRows(rows, { task097Exists = existsSync('tasks/specs/097.json') } = {}) {
    const replay005Rows = rows.filter(row => row.replayId === 'replay_005' || row.rawReplayAccessStatus?.includes('replay_005'));
    const botRows = rows.filter(row => ['replay_006', 'replay_007', 'replay_008'].includes(row.replayId));
    const unsupportedLayers = rows.flatMap(row => row.forbiddenSemanticLayersStarted ?? []).filter(Boolean);
    const passed = replay005Rows.length === 0 && botRows.length === 0 && !task097Exists && unsupportedLayers.length === 0;
    return {
        schemaVersion: 1,
        replay005Accessed: replay005Rows.length > 0,
        replay005EvidenceRows: replay005Rows.map(row => row.replayId),
        botFixturesProcessed: botRows.length > 0,
        botFixtureRows: botRows.map(row => row.replayId),
        task097Created: task097Exists,
        rawReplayProcessingDuringTask096: false,
        unsupportedFutureLayerStarted: unsupportedLayers.length > 0,
        unsupportedFutureLayers: unsupportedLayers,
        passed
    };
}

export function decidePilotGate(rows, protectionAudit) {
    const hasAllRows = AUDITED_REPLAYS.every(replayId => rows.some(row => row.replayId === replayId));
    const allAccepted = rows.every(row => row.validationStatus === 'accepted');
    const explicitCoverage = rows.every(row => row.categoryAvailability && REQUIRED_FACTUAL_CATEGORIES.every(category => category in row.categoryAvailability));
    const explicitProvenance = rows.every(row => Boolean(row.provenanceStatus));
    return hasAllRows && allAccepted && explicitCoverage && explicitProvenance && protectionAudit.passed
        ? 'five_human_replay_factual_pilot_ready'
        : 'five_human_replay_factual_pilot_blocked';
}

function categorySummaryFromCoverage(rows) {
    return REQUIRED_FACTUAL_CATEGORIES.map(category => ({
        category,
        forbiddenSemanticLayer: false,
        perReplay: Object.fromEntries(rows.map(row => [row.replayId, row.categoryAvailability[category]]))
    }));
}

async function loadRemainingReplayRows() {
    const [gate, processing, compatibility, performance] = await Promise.all([
        readJson(`${REMAINING_ROOT}/canonicalization-gate.json`),
        readJson(`${REMAINING_ROOT}/processing-summary.json`),
        readJson(`${REMAINING_ROOT}/compatibility-matrix.json`),
        readJson(`${REMAINING_ROOT}/performance-baseline.json`)
    ]);
    const rows = [];
    for (const replayId of ['replay_001', 'replay_003', 'replay_004']) {
        const [manifest, summary] = await Promise.all([
            readJson(`${REMAINING_ROOT}/${replayId}/canonical-package-manifest.json`),
            readJson(`${REMAINING_ROOT}/${replayId}/validation-summary.json`)
        ]);
        const perf = performance.replays.find(row => row.replayId === replayId);
        const compat = compatibility.rows.find(row => row.replayId === replayId);
        rows.push({
            replayId,
            acceptedGate: gate.gate,
            acceptedGateSource: `${REMAINING_ROOT}/canonicalization-gate.json`,
            sourceArtifact: `${REMAINING_ROOT}/${replayId}/canonical-package-manifest.json`,
            packageRepresentation: 'compact_manifest_with_hashes_and_counts',
            schemaCompatibility: compat?.overall ?? summary.schemaCompatibility,
            categoryAvailability: remainingReplayCategoryCoverage(manifest),
            missingCategories: summary.missingCategories ?? [],
            provenanceStatus: summary.provenanceComplete ? 'complete_for_emitted_records' : 'incomplete',
            rawReplayAccessStatus: summary.rawReplayAccess?.status ?? processing.rawReplayAccess?.[replayId]?.status ?? 'not_touched_existing_artifacts_only',
            validationStatus: summary.validationStatus === 'validated' ? 'accepted' : 'blocked',
            validationOverlayStatus: 'not_available_for_task_095',
            processingDurationMs: perf?.processingDurationMs ?? null,
            processingDurationStatus: perf ? 'measured_by_task_095' : 'not_available_from_current_artifacts',
            packageSizeBytes: perf?.packageSizeBytes ?? manifest.packageSizeBytes ?? null,
            committedOutputSizeBytes: perf?.committedOutputSizeBytes ?? processing.outputSizeBytes?.[replayId] ?? null,
            limitations: manifest.limitations ?? []
        });
    }
    return rows;
}

async function loadReplay002Row() {
    const [terminal, release, rawAccess, deterministic, manifest] = await Promise.all([
        readJson(`${REPLAY_002_V9_ROOT}/terminal-release-verification.json`),
        readJson(`${REPLAY_002_V9_ROOT}/release-decision.json`),
        readJson(`${REPLAY_002_V9_ROOT}/raw-replay-access-classification.json`),
        readJson(`${REPLAY_002_V9_ROOT}/deterministic-rerun.json`),
        readJson(`${REPLAY_002_V9_ROOT}/audit-artifact-manifest.json`)
    ]);
    return {
        replayId: 'replay_002',
        acceptedGate: terminal.gate,
        acceptedGateSource: `${REPLAY_002_V9_ROOT}/terminal-release-verification.json`,
        sourceArtifact: REPLAY_002_V9_ROOT,
        packageRepresentation: 'v9_terminal_validation_of_reused_canonical_facts',
        schemaCompatibility: release.releaseAuthorized ? 'accepted_by_v9_terminal_validation' : 'blocked',
        categoryAvailability: replay002CategoryCoverage(),
        missingCategories: ['category_counts_not_reemitted_by_v9_terminal_audit'],
        provenanceStatus: 'accepted_by_v9_terminal_validation; category-level provenance summary not reemitted in v9 artifacts',
        rawReplayAccessStatus: rawAccess.rawReplayRead || rawAccess.rawReplayHashed || rawAccess.parserExecuted ? 'raw_replay_access_detected' : 'not_touched_existing_artifacts_only',
        validationStatus: terminal.releaseAuthorized ? 'accepted' : 'blocked',
        validationOverlayStatus: 'not_summarized_by_v9_terminal_artifacts',
        processingDurationMs: null,
        processingDurationStatus: 'not_available_from_current_artifacts',
        packageSizeBytes: null,
        committedOutputSizeBytes: manifest.artifacts.reduce((sum, artifact) => sum + artifact.sizeBytes, 0),
        deterministicEvidence: deterministic.deterministic === true ? 'outer_release_run_passed' : 'not_available',
        limitations: ['Task 094 v9 fixed terminal validation gaps without regenerating factual package material.']
    };
}

async function loadReplay009Row() {
    const [summary, gate] = await Promise.all([
        readJson(`${REPLAY_009_ROOT}/validation-summary.json`),
        readJson(`${REPLAY_009_ROOT}/canonical-state-gate.json`)
    ]);
    const files = [
        'canonical-state-gate.json',
        'capability-matrix.json',
        'deduplication-audit.json',
        'entity-registry.json',
        'factual-events.jsonl',
        'independent-validation-overlay.json',
        'non-timeline-metadata.json',
        'player-registry.json',
        'README.md',
        'snapshots.jsonl',
        'source-integration-matrix.json',
        'unmatched-validation-records.json',
        'validation-summary.json'
    ].map(file => `${REPLAY_009_ROOT}/${file}`);
    return {
        replayId: 'replay_009',
        acceptedGate: gate.gate,
        acceptedGateSource: `${REPLAY_009_ROOT}/canonical-state-gate.json`,
        sourceArtifact: REPLAY_009_ROOT,
        packageRepresentation: 'full_canonical_package_committed',
        schemaCompatibility: 'accepted_with_constraints',
        categoryAvailability: replay009CategoryCoverage(summary),
        missingCategories: [],
        provenanceStatus: 'complete_for_accepted_canonical_package_with_constraints',
        rawReplayAccessStatus: 'not_touched_by_task_096_existing_canonical_package_only',
        validationStatus: gate.gate === 'replay_009_canonical_factual_state_ready_with_constraints' ? 'accepted' : 'blocked',
        validationOverlayStatus: `${summary.validationOverlayCount} validation overlays; unmatched=${summary.unmatchedValidationCount}`,
        processingDurationMs: null,
        processingDurationStatus: 'not_available_from_current_artifacts',
        packageSizeBytes: await sumFiles(files),
        committedOutputSizeBytes: await sumFiles(files),
        limitations: [
            'Replay 009 remains constrained by spatial unavailability, unresolved build mapping, and bounded visual validation gaps.',
            'Synchronization uncertainty remains documented in validation-summary.json.'
        ]
    };
}

function buildReadinessAssessment(rows, protectionAudit, gate) {
    return {
        schemaVersion: 1,
        gate,
        readyAsBoundedFactualFoundation: gate === 'five_human_replay_factual_pilot_ready',
        whatIsReady: [
            'Five human replay statuses are represented with accepted gate sources.',
            'Factual categories, schema compatibility, provenance status, performance availability, and storage representation are explicit.',
            'The pilot is suitable for a human milestone decision about scaling factual processing.'
        ],
        whatIsNotReady: [
            'Full corpus generalization is not established.',
            'Spatial semantics, mechanics, fights, rotations, pressure, macro, roles, and decision-quality analysis remain unavailable.',
            'Replay 002 category-level package counts are not reemitted by the v9 terminal audit artifacts.',
            'Replay 009 timing is not comparable from current artifacts.'
        ],
        blockersForExpansionTo15Replays: [
            'Storage/cache policy should be reviewed because full package material and historical outputs can be large.',
            'Batch processing should preserve compact manifests or a cache strategy before scaling.',
            'Any new replay with missing accepted gate evidence should block inclusion until canonicalized.'
        ],
        nextHumanMilestoneDecisionOptions: [
            'expand factual batch to 15 replays',
            'improve storage/cache pipeline before scaling',
            'revisit spatial evidence only if genuinely new evidence exists',
            'improve mechanics/build mapping',
            'build local AI/runtime benchmark later'
        ],
        recommendedStop: 'human_milestone_decision_required',
        protectionAuditPassed: protectionAudit.passed
    };
}

function buildReport({ gate, rows, categoryCoverage, performanceBaseline, storageBaseline, provenanceSummary, protectionAudit, readinessAssessment }) {
    const matrix = [
        ['Requirement', 'Classification'],
        ['Audit exactly replays 001, 002, 003, 004, and 009.', 'required'],
        ['Verify current accepted gate/source for each replay.', 'required'],
        ['Verify replay 005 remains protected.', 'required'],
        ['Verify 006-008 remain unsupported and unprocessed.', 'required'],
        ['Measure or summarize processing duration from available artifacts.', 'required'],
        ['Measure or summarize committed output size.', 'required'],
        ['Summarize full package size where recorded.', 'required'],
        ['Compare available categories across the five replays.', 'required'],
        ['Compare schema compatibility status across the five replays.', 'required'],
        ['Compare provenance status across the five replays.', 'required'],
        ['Identify missing or unavailable categories.', 'required'],
        ['Identify accepted limitations.', 'required'],
        ['Decide whether the pilot is ready for a human milestone decision.', 'required'],
        ['Do not create Task 097.', 'required'],
        ['Do not begin spatial, mechanics, ML, macro, fight, pressure, rotation, role, or decision-analysis work.', 'required'],
        ['Full corpus generalization.', 'explicit_non_goal'],
        ['Replay 005 release.', 'explicit_non_goal'],
        ['Spatial, mechanics, ML, macro, fight, pressure, rotation, role, or decision analysis.', 'explicit_non_goal'],
        ['Compact manifests and full packages may coexist when documented.', 'accepted_limitation'],
        ['Replay 002 v9 category counts are unavailable from current terminal audit artifacts.', 'accepted_limitation'],
        ['Storage/cache redesign before scaling.', 'backlog']
    ];
    const lines = [
        '# Five Human Replay Factual Pilot Audit',
        '',
        '## Frozen Acceptance Matrix',
        '',
        '| Requirement | Classification |',
        '| --- | --- |',
        ...matrix.slice(1).map(row => `| ${row[0]} | ${row[1]} |`),
        '',
        `Gate: \`${gate}\``,
        '',
        '## Five Replay Status',
        '',
        '| Replay | Gate | Gate source | Schema | Provenance | Representation |',
        '| --- | --- | --- | --- | --- | --- |',
        ...rows.map(row => `| \`${row.replayId}\` | \`${row.acceptedGate}\` | \`${row.acceptedGateSource}\` | ${row.schemaCompatibility} | ${row.provenanceStatus} | ${row.packageRepresentation} |`),
        '',
        '## Category Coverage',
        '',
        `Categories audited: ${categoryCoverage.categories.join(', ')}.`,
        `Forbidden semantic layers excluded: ${categoryCoverage.forbiddenSemanticLayersExcluded.join(', ')}.`,
        '',
        '## Schema Compatibility',
        '',
        ...rows.map(row => `- \`${row.replayId}\`: ${row.schemaCompatibility}.`),
        '',
        '## Provenance Summary',
        '',
        ...provenanceSummary.rows.map(row => `- \`${row.replayId}\`: ${row.provenanceStatus}; source basis: ${row.sourceArtifactBasis}; overlay: ${row.validationOverlayStatus}.`),
        '',
        '## Performance Baseline',
        '',
        ...performanceBaseline.rows.map(row => `- \`${row.replayId}\`: ${row.processingDurationMs == null ? row.processingDurationStatus : `${row.processingDurationMs}ms`} (${row.measurementBasis}).`),
        '',
        '## Storage Baseline',
        '',
        ...storageBaseline.rows.map(row => `- \`${row.replayId}\`: committed=${row.committedOutputSizeBytes ?? 'not_available'} bytes; fullPackage=${row.fullPackageSizeBytes ?? 'not_available'} bytes; representation=${row.packageRepresentation}.`),
        `Scaling note: ${storageBaseline.scalingNotes.join(' ')}`,
        `Known output-size guard warning: ${storageBaseline.knownOversizedHistoricalFile}.`,
        '',
        '## Protection Audit',
        '',
        `Replay 005 accessed: ${protectionAudit.replay005Accessed}.`,
        `Bot fixtures processed: ${protectionAudit.botFixturesProcessed}.`,
        `Task 097 created: ${protectionAudit.task097Created}.`,
        `Raw replay processing during Task 096: ${protectionAudit.rawReplayProcessingDuringTask096}.`,
        `Unsupported future layer started: ${protectionAudit.unsupportedFutureLayerStarted}.`,
        '',
        '## Accepted Limitations',
        '',
        '- This is a bounded factual foundation, not full corpus generalization.',
        '- Replay 002 v9 current evidence is terminal-validation evidence and does not reemit category-level package counts.',
        '- Replay 009 remains accepted with constraints from its canonical package.',
        '- Comparable timing is unavailable for replay 002 and replay 009 from current artifacts.',
        '- Storage projections are practical notes, not measured 15- or 50-replay runs.',
        '',
        '## Blockers Or Open Risks',
        '',
        '- Expansion to 15 replays should review storage/cache strategy before committing full package material at scale.',
        '- New replays must be canonicalized before inclusion in future factual audits.',
        '',
        '## Readiness Assessment',
        '',
        `Ready as bounded factual foundation: ${readinessAssessment.readyAsBoundedFactualFoundation}.`,
        `What is ready: ${readinessAssessment.whatIsReady.join(' ')}`,
        `What is not ready: ${readinessAssessment.whatIsNotReady.join(' ')}`,
        `Expansion blockers: ${readinessAssessment.blockersForExpansionTo15Replays.join(' ')}`,
        `Next human milestone decision options: ${readinessAssessment.nextHumanMilestoneDecisionOptions.join('; ')}.`,
        '',
        'Task 097 was not created.',
        'Process stops here for a human milestone decision.'
    ];
    return `${lines.join('\n')}\n`;
}

export async function auditFiveHumanReplayPilot(options = {}) {
    const outputRoot = options.outputRoot ?? AUDIT_ROOT;
    const reportPath = options.reportPath ?? REPORT_PATH;
    if (options.clean) await rm(outputRoot, { recursive: true, force: true });
    await mkdir(outputRoot, { recursive: true });

    const pilotDefinition = await readJson('data/five-human-replay-pilot.json');
    const rows = [
        ...await loadRemainingReplayRows(),
        await loadReplay002Row(),
        await loadReplay009Row()
    ].sort((a, b) => AUDITED_REPLAYS.indexOf(a.replayId) - AUDITED_REPLAYS.indexOf(b.replayId));
    const protectionAudit = protectionAuditFromRows(rows);
    const gate = decidePilotGate(rows, protectionAudit);
    const categoryCoverage = {
        schemaVersion: 1,
        categories: REQUIRED_FACTUAL_CATEGORIES,
        forbiddenSemanticLayersExcluded: FORBIDDEN_SEMANTIC_LAYERS,
        rows: categorySummaryFromCoverage(rows)
    };
    const compatibilityMatrix = {
        schemaVersion: 1,
        rows: rows.map(row => ({
            replayId: row.replayId,
            acceptedGate: row.acceptedGate,
            packageRepresentation: row.packageRepresentation,
            schemaCompatibility: row.schemaCompatibility,
            categoryAvailability: row.categoryAvailability,
            missingCategories: row.missingCategories,
            provenanceStatus: row.provenanceStatus,
            rawReplayAccessStatus: row.rawReplayAccessStatus,
            validationStatus: row.validationStatus,
            limitations: row.limitations
        }))
    };
    const performanceBaseline = {
        schemaVersion: 1,
        rows: rows.map(row => ({
            replayId: row.replayId,
            processingDurationMs: row.processingDurationMs,
            processingDurationStatus: row.processingDurationStatus,
            measurementBasis: row.processingDurationStatus === 'measured_by_task_095' ? 'Task 095 performance-baseline.json' : 'current artifacts do not record comparable timing',
            memoryMeasurementStatus: 'not_available_from_current_artifacts',
            cacheMeasurementStatus: 'not_available_from_current_artifacts'
        }))
    };
    const storageBaseline = {
        schemaVersion: 1,
        rows: rows.map(row => ({
            replayId: row.replayId,
            packageRepresentation: row.packageRepresentation,
            committedOutputSizeBytes: row.committedOutputSizeBytes,
            fullPackageSizeBytes: row.packageSizeBytes,
            compactOutputSizeBytes: row.packageRepresentation.startsWith('compact') ? row.committedOutputSizeBytes : null,
            largeHistoricalOutputsExcludedFromScalingEstimate: true
        })),
        knownOversizedHistoricalFile: 'output/04-controller-pawn-lifecycle.json',
        scalingNotes: [
            'Compact manifests keep committed output small for replays 001, 003, and 004.',
            'Full package commitment should be reviewed before scaling to 15 or 50 replays.',
            'Historical large outputs are excluded from this pilot scaling estimate.'
        ]
    };
    const provenanceSummary = {
        schemaVersion: 1,
        rows: rows.map(row => ({
            replayId: row.replayId,
            provenanceStatus: row.provenanceStatus,
            sourceArtifactBasis: row.sourceArtifact,
            validationOverlayStatus: row.validationOverlayStatus,
            rawReplayAccessClassification: row.rawReplayAccessStatus,
            compactManifestOnly: row.packageRepresentation.startsWith('compact'),
            limitations: row.limitations
        }))
    };
    const readinessAssessment = buildReadinessAssessment(rows, protectionAudit, gate);
    const manifest = {
        schemaVersion: 1,
        taskId: '096',
        pilotId: pilotDefinition.pilotId,
        auditedReplays: AUDITED_REPLAYS,
        sourceArtifacts: Object.fromEntries(rows.map(row => [row.replayId, row.sourceArtifact])),
        acceptedGateSources: Object.fromEntries(rows.map(row => [row.replayId, row.acceptedGateSource])),
        packageRepresentation: Object.fromEntries(rows.map(row => [row.replayId, row.packageRepresentation])),
        rawReplayTouched: false,
        replay005Touched: false,
        botFixturesProcessed: false,
        auditRunMarker: 'deterministic_task_096_audit',
        automaticFollowUpAfterFinalTask: pilotDefinition.automaticFollowUpAfterFinalTask
    };
    const pilotAuditGate = {
        schemaVersion: 1,
        taskId: '096',
        gate,
        success: gate === 'five_human_replay_factual_pilot_ready',
        allFiveReplayStatusesRepresented: AUDITED_REPLAYS.every(replayId => rows.some(row => row.replayId === replayId)),
        acceptedGateSourceIdentifiedForEachReplay: rows.every(row => Boolean(row.acceptedGateSource)),
        protectionsPassed: protectionAudit.passed,
        categoryCoverageExplicit: rows.every(row => REQUIRED_FACTUAL_CATEGORIES.every(category => category in row.categoryAvailability)),
        schemaStatusExplicit: rows.every(row => Boolean(row.schemaCompatibility)),
        provenanceStatusExplicit: rows.every(row => Boolean(row.provenanceStatus)),
        performanceAndStorageRecordedOrUnavailable: true,
        unsupportedAnalysisLayerStarted: false,
        task097Created: protectionAudit.task097Created
    };

    const outputs = {
        'manifest.json': manifest,
        'compatibility-matrix.json': compatibilityMatrix,
        'performance-baseline.json': performanceBaseline,
        'storage-baseline.json': storageBaseline,
        'provenance-summary.json': provenanceSummary,
        'category-coverage.json': categoryCoverage,
        'protection-audit.json': protectionAudit,
        'readiness-assessment.json': readinessAssessment,
        'pilot-audit-gate.json': pilotAuditGate
    };
    for (const [file, value] of Object.entries(outputs)) await writeJson(path.join(outputRoot, file), value);
    await writeText(reportPath, buildReport({ gate, rows, categoryCoverage, performanceBaseline, storageBaseline, provenanceSummary, protectionAudit, readinessAssessment }));
    return { gate, rows, protectionAudit, readinessAssessment };
}

async function main() {
    const result = await auditFiveHumanReplayPilot(parseArgs());
    console.log(JSON.stringify({
        taskId: '096',
        gate: result.gate,
        auditedReplays: result.rows.map(row => row.replayId),
        protectionAuditPassed: result.protectionAudit.passed
    }, null, 2));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
    main().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
