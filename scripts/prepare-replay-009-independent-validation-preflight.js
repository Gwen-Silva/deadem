import { promises as fs } from 'node:fs';
import path from 'node:path';

const INVENTORY_PATH = 'output/replay-009-validation/independent-source-inventory.json';
const HEALTH_ZERO_PATH = 'output/replay-009-validation/spirit-urn-health-zero-audit.json';
const SUMMARY_PATH = 'output/replay-009-validation/independent-validation-summary.json';
const GATE_PATH = 'output/replay-009-validation/independent-validation-gate.json';
const REPORT_PATH = 'reports/replay-009-objective-structure-independent-validation.md';
const TASK_PATH = 'tasks/blocked/064-validate-replay-009-objective-structure-factual-events-against-independent-source.md';

async function exists(file) {
    try {
        await fs.stat(file);
        return true;
    } catch {
        return false;
    }
}

async function readJsonl(file) {
    const text = await fs.readFile(file, 'utf8');
    return text.trim() ? text.trim().split(/\r?\n/).map(line => JSON.parse(line)) : [];
}

async function writeJson(file, value) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
    const knownCandidates = [
        {
            sourceId: 'samples_replay_009_normal_dem',
            sourceType: 'raw_replay_file',
            pathOrReference: 'samples/replay_009_normal.dem',
            available: await exists('samples/replay_009_normal.dem'),
            independentFromProductionParser: false,
            timeBasis: 'demo tick when parsed; raw bytes alone are not an independent validation source',
            synchronizationAvailable: false,
            coverageStart: null,
            coverageEnd: null,
            quality: 'not_independent',
            limitations: [
                'This is the source replay used by the production parser outputs.',
                'It cannot independently validate parser-derived objective/structure events without another decoder or review source.'
            ]
        },
        {
            sourceId: 'samples_partida_006_video',
            sourceType: 'recorded_video_wrong_match',
            pathOrReference: 'samples/videos/Partida_006_Replay.mp4',
            available: await exists('samples/videos/Partida_006_Replay.mp4'),
            independentFromProductionParser: true,
            timeBasis: 'video seconds',
            synchronizationAvailable: false,
            coverageStart: null,
            coverageEnd: null,
            quality: 'not_applicable',
            limitations: [
                'This video is associated with match 91119257 / replay 006 context, not replay 009 / match 91381179.',
                'It must not be used to validate replay 009 events.'
            ]
        },
        {
            sourceId: 'task_062_observability_outputs',
            sourceType: 'parser_derived_output',
            pathOrReference: 'output/replay-009-states/objective-structure-*.json',
            available: await exists('output/replay-009-states/objective-structure-entity-observability.json'),
            independentFromProductionParser: false,
            timeBasis: 'demoTick/parserSeconds',
            synchronizationAvailable: false,
            coverageStart: null,
            coverageEnd: null,
            quality: 'not_independent',
            limitations: [
                'Task 062 is the direct parser-derived evidence source for Task 063.',
                'It is explicitly excluded as an independent source.'
            ]
        },
        {
            sourceId: 'task_063_factual_event_outputs',
            sourceType: 'parser_derived_output',
            pathOrReference: 'output/replay-009-states/objective-structure-factual-events.jsonl',
            available: await exists('output/replay-009-states/objective-structure-factual-events.jsonl'),
            independentFromProductionParser: false,
            timeBasis: 'demoTick/parserSeconds',
            synchronizationAvailable: false,
            coverageStart: null,
            coverageEnd: null,
            quality: 'not_independent',
            limitations: [
                'Task 063 is a deterministic transformation of Task 062 parser-derived evidence.',
                'It cannot independently validate itself.'
            ]
        },
        {
            sourceId: 'external_parser_oracle_replay_009',
            sourceType: 'independent_parser_output',
            pathOrReference: 'not found',
            available: false,
            independentFromProductionParser: true,
            timeBasis: '',
            synchronizationAvailable: false,
            coverageStart: null,
            coverageEnd: null,
            quality: 'missing',
            limitations: [
                'Existing external parser oracle work targeted replay 006 and did not produce replay 009 objective/structure event output.'
            ]
        },
        {
            sourceId: 'manual_replay_009_timeline',
            sourceType: 'manually_annotated_replay_timeline',
            pathOrReference: 'not found',
            available: false,
            independentFromProductionParser: true,
            timeBasis: '',
            synchronizationAvailable: false,
            coverageStart: null,
            coverageEnd: null,
            quality: 'missing',
            limitations: [
                'No manually annotated replay 009 objective/structure timeline was found in repository or local output directories.'
            ]
        }
    ];

    const acceptedSource = knownCandidates.find(source => source.available
        && source.independentFromProductionParser
        && source.sourceType !== 'recorded_video_wrong_match'
        && source.synchronizationAvailable);
    const decision = acceptedSource ? 'independent_source_ready' : 'independent_source_missing';

    const lifecycle = await readJsonl('output/replay-009-states/objective-structure-lifecycle-candidates.jsonl');
    const spiritZeroCandidates = lifecycle
        .filter(candidate => candidate.candidateMechanics?.includes('spirit_urn'))
        .filter(candidate => candidate.healthValues?.includes(0) && candidate.deletionTick !== null)
        .slice()
        .sort((a, b) => `${a.entityIndex}:${a.serial}`.localeCompare(`${b.entityIndex}:${b.serial}`));

    const healthZeroAudit = {
        schemaVersion: 1,
        replayId: 'replay_009',
        auditReason: 'Task 063 reports zero supported health-zero observations while Spirit Urn candidate terminal sequences include five health_zero_then_deleted candidate sequences.',
        supportedHealthZeroObservationCount: 0,
        candidateHealthZeroSequenceCount: spiritZeroCandidates.length,
        records: spiritZeroCandidates.map(candidate => ({
            entityKey: [
                candidate.entityIndex,
                candidate.serial ?? 'no-serial',
                candidate.handle ?? 'no-handle',
                candidate.classId,
                candidate.creationTick
            ].join(':'),
            className: candidate.className,
            sourceProperty: 'healthValues',
            rawHealthValues: candidate.healthValues,
            zeroValueObserved: candidate.healthValues.includes(0),
            zeroValueMeaningValidated: false,
            candidateMechanic: 'spirit_urn',
            classification: candidate.classification,
            reason: 'Task 062 preserved this as an uncertain Spirit Urn candidate class, not a supported canonical objective identity. Zero appears only in candidate health samples and is not validated as objective destruction, completion, inactive state, or canonical Urn health.',
            warnings: [
                'Do not count this as supported objective health-zero.',
                'Do not infer Urn deposited, secured, destroyed, or completed.',
                'Independent source is missing, so zero-value meaning remains unresolved.'
            ]
        })),
        conclusion: 'candidate_zero_values_are_not_supported_objective_health_zero_observations'
    };

    const inventory = {
        schemaVersion: 1,
        taskId: '064',
        replayId: 'replay_009',
        decision,
        candidates: knownCandidates,
        requiredSource: {
            preferred: 'synchronized replay 009 video or recorded spectator video',
            acceptableAlternatives: [
                'controlled manual replay review with timestamps',
                'game-client event log independent of the production parser',
                'independent parser output for replay 009 objective/structure lifecycle',
                'manually annotated replay 009 objective/structure timeline'
            ],
            minimumCoverage: [
                'at least one independently synchronized anchor',
                'visual or logged evidence for a subset of Mid Boss, Guardian, Walker, Patron/base, Urn, or Rejuvenator observations'
            ]
        },
        replay005Protection: 'not_processed_or_inspected',
        botFixtureExclusion: 'not_processed_or_inspected'
    };

    const summary = {
        schemaVersion: 1,
        taskId: '064',
        replayId: 'replay_009',
        preflightDecision: decision,
        independentSourceType: null,
        sourceIndependenceResult: 'no_accepted_independent_source_found',
        sourceCoverage: 'none',
        synchronizationResult: 'not_attempted_source_missing',
        sampleSize: 0,
        healthZeroDiscrepancyResult: healthZeroAudit.conclusion,
        comparisonPerformed: false,
        semanticConclusionsStillBlocked: [
            'killed',
            'destroyed',
            'secured',
            'claimed',
            'deposited',
            'mechanic effects',
            'spatial contest',
            'macro interpretation'
        ],
        gate: 'replay_009_objective_structure_events_validation_blocked',
        task064Status: 'blocked',
        requiredSource: inventory.requiredSource,
        replay005Protection: 'not_processed_or_inspected',
        botFixtureExclusion: 'not_processed_or_inspected'
    };

    const gate = {
        schemaVersion: 1,
        taskId: '064',
        gate: 'replay_009_objective_structure_events_validation_blocked',
        preflightDecision: decision,
        reason: 'No accepted independent source associated with replay 009 is locally available.',
        comparisonPerformed: false,
        taskPromoted: false,
        taskExecuted: false,
        replay005Protection: 'not_processed_or_inspected',
        botFixtureExclusion: 'not_processed_or_inspected'
    };

    await writeJson(INVENTORY_PATH, inventory);
    await writeJson(HEALTH_ZERO_PATH, healthZeroAudit);
    await writeJson(SUMMARY_PATH, summary);
    await writeJson(GATE_PATH, gate);

    const taskText = `# Task 064: Validate Replay 009 Objective/Structure Factual Events Against Independent Source

Status: blocked

Unlocked by: synchronized replay 009 video, controlled manual replay review, replay-009 game-client event log, replay-009 independent parser output, or replay-009 manual objective/structure timeline with enough timing anchors for comparison

Blocked by: independent-source preflight found no accepted independent source associated with replay 009

## Preflight Result

- Preflight decision: \`independent_source_missing\`
- Source inventory: \`output/replay-009-validation/independent-source-inventory.json\`
- Required source: synchronized replay 009 video is preferred. A controlled
  manual replay review, game-client event log independent of the production
  parser, independent parser output, or manually annotated replay-009 timeline
  is also acceptable when it includes timing anchors.
- Non-independent sources rejected: Task 062 outputs, Task 063 outputs, raw
  replay bytes without independent decoding/review, mechanics knowledge, wiki
  descriptions, and expected game behavior.

## Objective

Validate Task 063 raw factual objective/structure event observations against an
independent source without applying mechanic effects or macro interpretation.

## Constraints

- Do not process replay 005.
- Do not process bot fixtures 006-008.
- Do not infer mechanic effects, objective completion, destruction, or strategic
  quality from raw events alone.
- Preserve Task 063 semantic limits: health zero is not a kill/destruction
  conclusion, and entity deletion is not an objective completion conclusion.

## Required validation

- Independent-source availability check;
- bounded sample selection;
- event-to-source comparison;
- Spirit Urn candidate health-zero audit;
- replay 005 exclusion verification;
- bot fixture exclusion verification;
- task queue validation.
`;
    await fs.writeFile(TASK_PATH, taskText);

    await fs.writeFile(REPORT_PATH, `# Replay 009 Objective/Structure Independent Validation Preflight

Task 064 was not promoted or executed because no accepted independent source associated with replay 009 is locally available.

## Decision

- Preflight decision: \`independent_source_missing\`
- Gate: \`replay_009_objective_structure_events_validation_blocked\`
- Comparison performed: no
- Task 064 status: blocked

## Source Search Result

The repository contains the raw replay file \`samples/replay_009_normal.dem\` and parser-derived Task 062/063 outputs. Those are not independent validation sources. The local video \`samples/videos/Partida_006_Replay.mp4\` is associated with the replay 006 / match 91119257 context, not replay 009.

No synchronized replay-009 video, spectator recording, independent parser output, game-client event log, or manual replay-009 objective/structure timeline was found.

## Required Source

Preferred: synchronized replay 009 video or recorded spectator video.

Acceptable alternatives: controlled manual replay review, game-client event log independent of the production parser, independent parser output for replay 009, or manually annotated replay-009 objective/structure timeline with timing anchors.

## Spirit Urn Health-Zero Audit

Task 063 reported zero supported health-zero observations. Five Spirit Urn candidate sequences contain raw zero values, but all remain uncertain candidate entities from Task 062. They are not counted as supported objective health-zero observations and do not imply Urn destruction, deposit, secure, or completion.

## Protection

Replay 005 and bot fixtures 006-008 were not processed or inspected.
`);
}

await main();
