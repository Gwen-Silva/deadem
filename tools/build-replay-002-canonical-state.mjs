import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCanonicalState } from '../lib/canonical-state/builder.mjs';
import { createCanonicalIo } from '../lib/canonical-state/io-layer.mjs';
import { canonicalContractForJson } from '../lib/canonical-state/contract.mjs';

const DEFAULT_OUTPUT = 'output/replay-002-canonical';
const DEFAULT_ASSESSMENT = 'output/replay-002-canonical-v5-validation';

function parseArgs() {
    const args = process.argv.slice(2);
    const options = { outputDir: DEFAULT_OUTPUT, assessmentDir: DEFAULT_ASSESSMENT, clean: false };
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === '--output') options.outputDir = args[++index];
        else if (arg === '--assessment-output') options.assessmentDir = args[++index];
        else if (arg === '--clean') options.clean = true;
    }
    return options;
}

export async function createReplay002Manifest(options = {}) {
    const outputDir = options.outputDir ?? DEFAULT_OUTPUT;
    const assessmentDir = options.assessmentDir ?? DEFAULT_ASSESSMENT;
    const matchStateShardPaths = [
        'output/replays/replay_002/match-state-timeline-shards/chunk_001.jsonl',
        'output/replays/replay_002/match-state-timeline-shards/chunk_002.jsonl',
        'output/replays/replay_002/match-state-timeline-shards/chunk_003.jsonl',
        'output/replays/replay_002/match-state-timeline-shards/chunk_004.jsonl',
        'output/replays/replay_002/match-state-timeline-shards/chunk_005.jsonl',
        'output/replays/replay_002/match-state-timeline-shards/chunk_006.jsonl',
        'output/replays/replay_002/match-state-timeline-shards/chunk_007.jsonl'
    ];
    const sources = {
        rawReplay: { path: 'samples/partida_002.dem', sourceTask: 'source_fixture', accessClass: 'raw_replay' },
        parserMatrix: { path: 'output/parser-compatibility/parser-compatibility-matrix.json', sourceTask: '046-run-parser-compatibility-matrix', accessClass: 'artifact_factual' },
        matchStateIndex: { path: 'output/replays/replay_002/match-state-timeline.jsonl', sourceTask: '032-build-unified-descriptive-match-state-timeline', accessClass: 'artifact_factual' },
        matchStateShard: { path: 'output/replays/replay_002/match-state-timeline-shards/*.jsonl', sourceTask: '032-build-unified-descriptive-match-state-timeline', accessClass: 'artifact_factual' },
        matchStateQuality: { path: 'output/replays/replay_002/match-state-quality.json', sourceTask: '032-build-unified-descriptive-match-state-timeline', accessClass: 'artifact_factual' },
        oneSecondQuality: { path: 'output/replays/replay_002/one-second-spatial/quality.json', sourceTask: '026-build-one-second-spatial-extraction', accessClass: 'artifact_factual' },
        deathEvents: { path: 'output/replays/replay_002/canonical-death-events.json', sourceTask: '029-extract-multi-replay-death-events', accessClass: 'artifact_factual' },
        deathValidation: { path: 'output/replays/replay_002/death-event-validation.json', sourceTask: '029-extract-multi-replay-death-events', accessClass: 'artifact_factual' },
        respawnEvents: { path: 'output/replays/replay_002/respawn-events.json', sourceTask: '029-extract-multi-replay-death-events', accessClass: 'artifact_factual' },
        objectiveInventory: { path: 'output/replays/replay_002/objective-entity-inventory.json', sourceTask: '031-map-multi-replay-objective-entities-and-lifecycle', accessClass: 'artifact_factual' },
        objectiveLifecycle: { path: 'output/replays/replay_002/objective-lifecycle-events.json', sourceTask: '031-map-multi-replay-objective-entities-and-lifecycle', accessClass: 'artifact_factual' },
        referencePlayerRegistry: { path: 'output/replay-009-canonical/player-registry.json', sourceTask: '065-build-canonical-replay-009-factual-state', accessClass: 'canonical_reference' },
        referenceEntityRegistry: { path: 'output/replay-009-canonical/entity-registry.json', sourceTask: '065-build-canonical-replay-009-factual-state', accessClass: 'canonical_reference' },
        referenceFactualEvents: { path: 'output/replay-009-canonical/factual-events.jsonl', sourceTask: '065-build-canonical-replay-009-factual-state', accessClass: 'canonical_reference' },
        referenceMetadata: { path: 'output/replay-009-canonical/non-timeline-metadata.json', sourceTask: '065-build-canonical-replay-009-factual-state', accessClass: 'canonical_reference' },
        referenceOverlay: { path: 'output/replay-009-canonical/independent-validation-overlay.json', sourceTask: '065-build-canonical-replay-009-factual-state', accessClass: 'canonical_reference' },
        referenceSnapshots: { path: 'output/replay-009-canonical/snapshots.jsonl', sourceTask: '065-build-canonical-replay-009-factual-state', accessClass: 'canonical_reference' },
        referenceCapabilities: { path: 'output/replay-009-canonical/capability-matrix.json', sourceTask: '065-build-canonical-replay-009-factual-state', accessClass: 'canonical_reference' },
        referenceValidation: { path: 'output/replay-009-canonical/validation-summary.json', sourceTask: '065-build-canonical-replay-009-factual-state', accessClass: 'canonical_reference' }
    };
    const allowedInputs = [
        ...Object.values(sources).filter(source => !source.path.includes('*')).map(source => source.path),
        ...matchStateShardPaths
    ];
    return {
        schemaVersion: 1,
        taskId: '086',
        replayId: 'replay_002',
        eventIdPrefix: 'canon002v5',
        parserMatrixReplayId: 'replay_002',
        rawReplay: { path: sources.rawReplay.path, accessMode: 'raw_replay_identity_hash_verified' },
        outputDir,
        assessmentDir,
        expectedGate: 'replay_002_canonical_factual_state_ready_with_constraints_v5',
        blockedGate: 'replay_002_canonical_factual_state_v5_blocked',
        referenceReplayLabel: 'historical_reference_v1',
        enabledCategories: ['player_identity', 'player_death', 'player_respawn', 'team_net_worth', 'raw_objective_structure_lifecycle', 'snapshots'],
        optionalValidationOverlays: [],
        blockedFieldsOrCategories: ['lane', 'region', 'proximity', 'transform', 'residual', 'mechanic_effects', 'fight', 'rotation', 'pressure', 'macro', 'decision'],
        generatedRootPrefixes: [outputDir, assessmentDir],
        forbiddenPaths: [
            'samples/partida_005.dem',
            'samples/partida_006.dem',
            'samples/replay_006*.dem',
            'samples/replay_007_bots01.dem',
            'samples/replay_008_bots02_short.dem'
        ],
        followUpTaskPath: 'tasks/blocked/087-select-next-canonical-generalization-control.md',
        pipelineModules: [
            'tools/build-replay-002-canonical-state.mjs',
            'tools/check-replay-002-canonical-determinism.mjs',
            'lib/canonical-state/builder.mjs',
            'lib/canonical-state/contract.mjs',
            'lib/canonical-state/io-layer.mjs',
            'lib/canonical-state/audits/common.mjs',
            'lib/canonical-state/audits/contract-source-consistency.mjs',
            'lib/canonical-state/audits/documentation-audit.mjs',
            'lib/canonical-state/audits/epistemic-audit.mjs',
            'lib/canonical-state/audits/io-policy-audit.mjs'
        ],
        sources,
        allowedInputs,
        matchStateShardPaths
    };
}

async function main() {
    const options = parseArgs();
    const manifest = await createReplay002Manifest(options);
    const isPrimaryRun = options.outputDir === DEFAULT_OUTPUT && options.assessmentDir === DEFAULT_ASSESSMENT;
    const io = createCanonicalIo({
        allowlist: manifest.allowedInputs,
        generatedRootPrefixes: [manifest.outputDir, manifest.assessmentDir]
    });
    const result = await buildCanonicalState(manifest, io, { clean: options.clean });
    await fs.mkdir('schemas', { recursive: true });
    await fs.writeFile('schemas/canonical-factual-state-contract.v2.json', `${JSON.stringify(canonicalContractForJson(), null, 2)}\n`);
    if (isPrimaryRun) {
        await fs.mkdir(path.dirname(manifest.followUpTaskPath), { recursive: true });
        try {
            await fs.access(manifest.followUpTaskPath);
        } catch {
            await fs.writeFile(manifest.followUpTaskPath, `# Task 087: Select Next Canonical Generalization Control\n\nStatus: blocked\n\nExecution mode: autonomous after explicit authorization\n\nBlocked by: explicit user authorization after reviewing Task 086 gate \`${manifest.expectedGate}\`.\n\nUnlocked by: explicit user authorization after reviewing Task 086 gate \`${manifest.expectedGate}\`\n\nUnlock gate: replay_002_canonical_factual_state_ready_with_constraints_v5_reviewed_and_next_control_authorized\n\n## Objective\n\nSelect the next compatible human replay for canonical factual-state generalization after the v5 replay-002 audit coverage and independence checks pass.\n\n## Constraints\n\nDo not process replay 005. Do not process bot fixtures 006-008. Do not apply spatial semantics, mechanic effects, fights, rotations, pressure, macro, or decision analysis.\n`);
        }
        await fs.mkdir('reports', { recursive: true });
        await fs.writeFile('reports/replay-002-canonical-factual-state-v5-validation.md', `# Replay 002 Canonical Factual State V5 Validation\n\n## Gate\n\n\`${result.correctionSummary.gate}\`\n\nTask 086 closes final audit coverage and independence gaps after Task 085's v4 gate was rejected in technical review.\n\n## Executable Contract\n\nThe canonical contract is sourced from \`lib/canonical-state/contract.mjs\` and emitted to \`schemas/canonical-factual-state-contract.v2.json\` plus \`${manifest.assessmentDir}/canonical-contract.json\`.\n\n## Raw Replay Access\n\nApproach: \`${result.correctionSummary.rawReplayApproach}\`.\n\nThe replay file is hashed only for identity. Parser completion is imported from the parser compatibility matrix with provenance; the parser is not executed by Task 086.\n\n## Results\n\n- Players: ${result.correctionSummary.players}\n- Entities: ${result.correctionSummary.entities}\n- Factual events: ${result.correctionSummary.events}\n- Snapshots: ${result.correctionSummary.snapshots}\n- Schema valid: ${result.correctionSummary.schemaValid}\n- Mechanic effects applied: 0\n\n## Remaining Constraints\n\nDecoded entity indices, entity serials, objective entity generations, pawn generations, independent visual validation, spatial semantics, mechanic effects, combat grouping, rotations, pressure, macro, and decision analysis remain unavailable or blocked. Replay 005 remains protected.\n`);
    }
    console.log(JSON.stringify(result.correctionSummary, null, 2));
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    await main();
}
