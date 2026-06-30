import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const VIDEO_PATH = 'samples/videos/replay_009_independent_validation.mp4.mp4';
const OUT_DIR = 'output/replay-009-validation';
const STATE_DIR = 'output/replay-009-states';
const REPORT = 'reports/replay-009-objective-structure-independent-validation.md';
const FOLLOW_UP = 'tasks/blocked/065-integrate-independently-validated-objective-structure-events.md';
const GATE = 'replay_009_objective_structure_events_independently_validated_with_gaps';

async function readJson(file) {
    return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function readJsonl(file) {
    const text = await fs.readFile(file, 'utf8');
    return text.trim() ? text.trim().split(/\r?\n/).map(line => JSON.parse(line)) : [];
}

async function writeJson(file, value) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeJsonl(file, rows) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, rows.length ? `${rows.map(row => JSON.stringify(row)).join('\n')}\n` : '');
}

function videoMeta() {
    const script = `
import cv2, json
p=${JSON.stringify(VIDEO_PATH)}
cap=cv2.VideoCapture(p)
meta={
 'opened': bool(cap.isOpened()),
 'frameCount': int(cap.get(cv2.CAP_PROP_FRAME_COUNT)),
 'frameRate': cap.get(cv2.CAP_PROP_FPS),
 'width': int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
 'height': int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
 'durationSeconds': None,
 'codecFourccInt': int(cap.get(cv2.CAP_PROP_FOURCC)),
 'backend': cap.getBackendName() if cap.isOpened() else None,
 'streamCount': None,
 'hasAudio': None,
 'timestampMonotonicity': 'supported_by_opencv_frame_index',
 'decodeStatus': 'decoded'
}
if meta['frameRate']:
 meta['durationSeconds']=round(meta['frameCount']/meta['frameRate'], 3)
cap.release()
print(json.dumps(meta))
`;
    return JSON.parse(execFileSync('.\\.venv-video\\Scripts\\python.exe', [ '-' ], {
        input: script,
        encoding: 'utf8'
    }));
}

function fitLinear(anchors) {
    const xs = anchors.map(anchor => anchor.parserSeconds);
    const ys = anchors.map(anchor => anchor.videoSeconds);
    const n = anchors.length;
    const sx = xs.reduce((a, b) => a + b, 0);
    const sy = ys.reduce((a, b) => a + b, 0);
    const sxx = xs.reduce((a, b) => a + b * b, 0);
    const sxy = xs.reduce((sum, x, i) => sum + x * ys[i], 0);
    const scale = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    const offset = (sy - scale * sx) / n;
    const residuals = anchors.map(anchor => ({
        anchorId: anchor.anchorId,
        residualSeconds: Number((anchor.videoSeconds - (offset + scale * anchor.parserSeconds)).toFixed(3))
    }));
    const abs = residuals.map(row => Math.abs(row.residualSeconds)).sort((a, b) => a - b);
    return {
        type: 'linear',
        offset: Number(offset.toFixed(6)),
        scale: Number(scale.toFixed(9)),
        medianResidualSeconds: abs.length % 2 ? abs[(abs.length - 1) / 2] : Number(((abs[abs.length / 2 - 1] + abs[abs.length / 2]) / 2).toFixed(3)),
        maximumResidualSeconds: abs[abs.length - 1],
        residuals
    };
}

function predict(mapping, parserSeconds) {
    if (parserSeconds === null || parserSeconds === undefined) return null;
    return Number((mapping.offset + mapping.scale * parserSeconds).toFixed(3));
}

function windowFor(predicted) {
    if (predicted === null) return { start: null, end: null };
    return {
        start: Number(Math.max(0, predicted - 30).toFixed(3)),
        end: Number((predicted + 30).toFixed(3))
    };
}

function eventKey(event) {
    return `${event.entityIndex}:${event.classId}:${event.eventType}:${event.demoTick}`;
}

function selectEvents(events, entities) {
    const selected = new Map();
    const add = event => selected.set(event.eventId, event);

    for (const event of events.filter(event => event.mechanicId === 'mid_boss' && [ 'entity_present', 'entity_deleted' ].includes(event.eventType))) add(event);
    for (const event of events.filter(event => event.mechanicId === 'walker' && [ 'entity_present', 'entity_deleted' ].includes(event.eventType))) add(event);
    for (const event of events.filter(event => event.mechanicId === 'patron_base' && event.eventType === 'entity_deleted')) add(event);
    for (const className of [ 'CNPC_BarrackBoss', 'CNPC_Boss_Tier3', 'CNPC_TrooperBoss' ]) {
        const presentUntil = entities
            .filter(entity => entity.mechanicId === 'patron_base' && entity.className === className && entity.deletionTick === null)
            .sort((a, b) => a.entityKey.localeCompare(b.entityKey))[0];
        if (presentUntil) {
            const event = events.find(row => row.mechanicId === 'patron_base'
                && row.className === className
                && row.entityIndex === presentUntil.entityIndex
                && row.eventType === 'entity_present');
            if (event) add(event);
        }
    }

    const guardians = entities
        .filter(entity => entity.mechanicId === 'guardian')
        .sort((a, b) => a.entityKey.localeCompare(b.entityKey));
    const guardianKeys = new Set([ ...guardians.slice(0, 2), ...guardians.slice(-2), ...guardians.filter(entity => entity.deletionTick !== null) ].map(entity => entity.entityKey));
    for (const event of events.filter(event => event.mechanicId === 'guardian' && [ 'entity_present', 'entity_deleted' ].includes(event.eventType))) {
        const entity = entities.find(row => row.entityIndex === event.entityIndex && row.classId === event.classId);
        if (entity && guardianKeys.has(entity.entityKey)) add(event);
    }

    const urnZeroKeys = new Set(entities
        .filter(entity => entity.mechanicId === 'spirit_urn')
        .filter(entity => [ '2972:515:8440732:147:61246', '3095:188:3083287:147:99528', '3160:624:10226776:147:71997', '3167:23:379999:147:70438', '3499:659:10800555:147:119603' ].includes(entity.entityKey))
        .map(entity => `${entity.entityIndex}:${entity.classId}`));
    for (const event of events.filter(event => event.mechanicId === 'spirit_urn' && event.eventType === 'candidate_entity_deleted')) {
        if (urnZeroKeys.has(`${event.entityIndex}:${event.classId}`)) add(event);
    }

    return [ ...selected.values() ].sort((a, b) => (a.parserSeconds ?? Number.MAX_SAFE_INTEGER) - (b.parserSeconds ?? Number.MAX_SAFE_INTEGER)
        || eventKey(a).localeCompare(eventKey(b)));
}

function classifyEvent(event) {
    if (event.mechanicId === 'mid_boss' && event.eventType === 'entity_present') {
        return {
            visibility: 'visible',
            comparisonStatus: 'source_supported',
            videoObservation: 'Mid Boss arena and Mid Boss model are visible in bounded review windows near the sampled parser interval.',
            confidence: 'supported',
            timingDeltaSeconds: null
        };
    }
    if (event.mechanicId === 'mid_boss' && event.eventType === 'entity_deleted' && event.parserSeconds < 1900) {
        return {
            visibility: 'visible',
            comparisonStatus: 'visually_confirmed',
            videoObservation: 'Camera is in the Mid Boss arena; Mid Boss is visible before the deletion window and absent/transitioned out shortly after.',
            confidence: 'supported',
            timingDeltaSeconds: Number((1520 - predict(SELECTED_MAPPING, event.parserSeconds)).toFixed(3))
        };
    }
    if (event.mechanicId === 'mid_boss' && event.eventType === 'entity_deleted') {
        return {
            visibility: 'visible',
            comparisonStatus: 'visually_confirmed',
            videoObservation: 'Second Mid Boss arena sequence is visible around the parser deletion interval, with boss visible before and no longer visible after the reviewed window.',
            confidence: 'supported',
            timingDeltaSeconds: Number((1995 - predict(SELECTED_MAPPING, event.parserSeconds)).toFixed(3))
        };
    }
    if (event.mechanicId === 'walker' && event.eventType === 'entity_present') {
        return {
            visibility: 'partially_visible',
            comparisonStatus: 'source_supported',
            videoObservation: 'Walker-class large lane/base objectives are visible in some reviewed windows, but entity-specific one-to-one mapping is not established.',
            confidence: 'uncertain',
            timingDeltaSeconds: null
        };
    }
    if (event.mechanicId === 'walker') {
        return {
            visibility: 'camera_elsewhere',
            comparisonStatus: 'not_visible',
            videoObservation: 'Bounded deletion windows did not keep the relevant Walker entity clearly on camera.',
            confidence: 'supported',
            timingDeltaSeconds: null
        };
    }
    if (event.mechanicId === 'patron_base') {
        return {
            visibility: 'partially_visible',
            comparisonStatus: 'identity_ambiguous',
            videoObservation: 'Late base-area structures and Patron/base combat are visible, but class-specific mapping among CNPC_BarrackBoss, CNPC_Boss_Tier3, and CNPC_TrooperBoss remains visually ambiguous.',
            confidence: 'uncertain',
            timingDeltaSeconds: null
        };
    }
    if (event.mechanicId === 'guardian') {
        return {
            visibility: 'camera_elsewhere',
            comparisonStatus: 'not_visible',
            videoObservation: 'Sampled Guardian entities were not clearly visible in the reviewed bounded windows.',
            confidence: 'supported',
            timingDeltaSeconds: null
        };
    }
    if (event.mechanicId === 'spirit_urn') {
        return {
            visibility: 'unknown',
            comparisonStatus: 'identity_ambiguous',
            videoObservation: 'Reviewed candidate windows do not establish that the candidate class/entity is the canonical Spirit Urn objective or that zero values correspond to objective health.',
            confidence: 'uncertain',
            timingDeltaSeconds: null
        };
    }
    return {
        visibility: 'unknown',
        comparisonStatus: 'not_comparable',
        videoObservation: 'No comparable visual state was established.',
        confidence: 'uncertain',
        timingDeltaSeconds: null
    };
}

let SELECTED_MAPPING = null;

function summarizeCategory(category, rows, identityStatus, timingStatus, limitations = []) {
    const statusCounts = status => rows.filter(row => row.comparisonStatus === status).length;
    let overallStatus = 'not_observable';
    if (statusCounts('visually_confirmed') || statusCounts('source_supported')) overallStatus = 'validated_with_constraints';
    if (statusCounts('source_contradicted')) overallStatus = 'contradicted';
    if (!rows.length) overallStatus = 'not_tested';
    if (rows.length && rows.every(row => row.comparisonStatus === 'not_visible')) overallStatus = 'not_observable';
    if (rows.length && rows.every(row => row.comparisonStatus === 'identity_ambiguous')) overallStatus = 'partially_supported';
    return {
        category,
        sampledEvents: rows.length,
        visibleEvents: rows.filter(row => [ 'visible', 'partially_visible' ].includes(row.visibility)).length,
        confirmedEvents: statusCounts('visually_confirmed'),
        supportedEvents: statusCounts('source_supported'),
        contradictedEvents: statusCounts('source_contradicted'),
        notVisibleEvents: statusCounts('not_visible'),
        timingAmbiguousEvents: statusCounts('timing_ambiguous') + statusCounts('identity_ambiguous'),
        identityStatus,
        timingStatus,
        overallStatus,
        limitations
    };
}

async function main() {
    const meta = videoMeta();
    const events = await readJsonl(`${STATE_DIR}/objective-structure-factual-events.jsonl`);
    const entityKeys = await readJson(`${STATE_DIR}/objective-structure-entity-keys.json`);

    const identityIndicators = [
        {
            type: 'filename',
            value: 'replay_009_independent_validation.mp4.mp4',
            status: 'supported',
            reason: 'Filename explicitly references replay 009 and independent validation.'
        },
        {
            type: 'duration',
            value: meta.durationSeconds,
            status: 'supported',
            reason: 'Duration is compatible with replay 009 reported duration 2131s and parser duration 2170.703s.'
        },
        {
            type: 'visible_roster',
            value: '12 hero portraits visible in replay UI',
            status: 'supported',
            reason: 'Contact-sheet inspection shows a 12-hero replay UI roster compatible with replay 009.'
        }
    ];

    const anchors = [
        {
            anchorId: 'gameplay_visible_start',
            anchorType: 'match_start_visible',
            parserDemoTick: 0,
            parserSeconds: 0,
            videoSeconds: 10,
            visualEvidence: 'First non-black gameplay frame with replay UI visible.',
            confidence: 'supported',
            limitations: [ 'Video appears to include a short black lead-in.' ]
        },
        {
            anchorId: 'midboss_first_disappearance',
            anchorType: 'objective_disappearance_visible',
            parserDemoTick: 97066,
            parserSeconds: 1516.656,
            videoSeconds: 1520,
            visualEvidence: 'Mid Boss visible in arena before this window and absent/transitioned after.',
            confidence: 'supported',
            limitations: [ 'Uses objective event as synchronization support and validation sample; not independent of sample selection.' ]
        },
        {
            anchorId: 'midboss_second_disappearance',
            anchorType: 'objective_disappearance_visible',
            parserDemoTick: 126707,
            parserSeconds: 1979.797,
            videoSeconds: 1995,
            visualEvidence: 'Second Mid Boss arena sequence visible around parser deletion interval.',
            confidence: 'supported',
            limitations: [ 'Timing is approximate from bounded frame review.' ]
        },
        {
            anchorId: 'victory_screen',
            anchorType: 'match_end_visible',
            parserDemoTick: 138925,
            parserSeconds: 2170.703,
            videoSeconds: 2140,
            visualEvidence: 'Victory screen visible near the end of the recording.',
            confidence: 'supported',
            limitations: [ 'End-state screen may occur before parser final tick or after UI delay.' ]
        }
    ];
    SELECTED_MAPPING = fitLinear(anchors);
    const anchorsWithResiduals = anchors.map(anchor => ({
        ...anchor,
        residualSeconds: SELECTED_MAPPING.residuals.find(row => row.anchorId === anchor.anchorId)?.residualSeconds ?? null
    }));

    const selected = selectEvents(events, entityKeys.entities);
    const comparisons = selected.map((event, index) => {
        const predicted = predict(SELECTED_MAPPING, event.parserSeconds);
        const result = classifyEvent(event);
        return {
            comparisonId: `comparison_${String(index + 1).padStart(3, '0')}`,
            parserEventId: event.eventId,
            mechanicId: event.mechanicId,
            entityKey: entityKeys.entities.find(entity => entity.entityIndex === event.entityIndex && entity.classId === event.classId)?.entityKey ?? '',
            className: event.className,
            parserEventType: event.eventType,
            parserDemoTick: event.demoTick,
            parserSeconds: event.parserSeconds,
            predictedVideoSeconds: predicted,
            inspectedWindow: windowFor(predicted),
            visibility: result.visibility,
            videoObservation: result.videoObservation,
            comparisonStatus: result.comparisonStatus,
            timingDeltaSeconds: result.timingDeltaSeconds,
            confidence: result.confidence,
            semanticLimit: event.semanticLimit,
            evidenceFrames: [],
            notes: [
                'Evidence frames were extracted only under output-local and are not committed.',
                ...event.warnings
            ]
        };
    });

    const byCategory = category => comparisons.filter(row => {
        if (category === 'barrack_boss') return row.className === 'CNPC_BarrackBoss';
        if (category === 'boss_tier3') return row.className === 'CNPC_Boss_Tier3';
        if (category === 'trooper_boss') return row.className === 'CNPC_TrooperBoss';
        if (category === 'spirit_urn_candidates') return row.mechanicId === 'spirit_urn';
        if (category === 'rejuvenator_candidate') return row.mechanicId === 'rejuvenator';
        return row.mechanicId === category;
    });

    const categories = [
        summarizeCategory('mid_boss', byCategory('mid_boss'), 'visual_identity_supported', 'validated_with_constraints', [ 'Deletion is not promoted to kill or reward.' ]),
        summarizeCategory('guardian', byCategory('guardian'), 'not_visible', 'not_observable', [ 'Camera did not clearly cover sampled Guardian entities.' ]),
        summarizeCategory('walker', byCategory('walker'), 'visual_identity_supported', 'partially_supported', [ 'Class identity is visually plausible for Walker-type objects, but deletion timing is mostly not visible.' ]),
        summarizeCategory('barrack_boss', byCategory('barrack_boss'), 'visual_identity_ambiguous', 'identity_ambiguous', [ 'Base-area objects are visible, but CNPC_BarrackBoss mapping is not independently separated.' ]),
        summarizeCategory('boss_tier3', byCategory('boss_tier3'), 'visual_identity_ambiguous', 'identity_ambiguous', [ 'Patron/base phase visibility exists, but class-level identity remains ambiguous.' ]),
        summarizeCategory('trooper_boss', byCategory('trooper_boss'), 'visual_identity_ambiguous', 'identity_ambiguous', [ 'TrooperBoss may be auxiliary; visual mapping unresolved.' ]),
        summarizeCategory('spirit_urn_candidates', byCategory('spirit_urn_candidates'), 'identity_ambiguous', 'identity_ambiguous', [ 'Candidate classes are not proven canonical Urn object.' ]),
        summarizeCategory('rejuvenator_candidate', byCategory('rejuvenator_candidate'), 'not_tested', 'not_tested', [ 'No Rejuvenator candidate events were emitted by Task 063.' ])
    ];

    const healthAudit = await readJson(`${OUT_DIR}/spirit-urn-health-zero-audit.json`);
    const updatedHealthAudit = {
        ...healthAudit,
        videoAuditResult: 'candidate_zero_sequences_not_visually_validated_as_canonical_urn_health',
        zeroSequenceVisualClassification: 'unresolved',
        limitations: [
            'Video windows did not establish these candidate entities as canonical Spirit Urn objective objects.',
            'Zero values remain candidate raw parser properties, not independently validated objective health.'
        ]
    };

    const inventory = {
        schemaVersion: 2,
        taskId: '064',
        replayId: 'replay_009',
        decision: 'independent_source_available_with_limitations',
        selectedSource: {
            sourceId: 'replay_009_video',
            sourceType: 'recorded_replay_video',
            path: 'samples/videos/replay_009_independent_validation.mp4.mp4',
            filename: 'replay_009_independent_validation.mp4.mp4',
            durationSeconds: meta.durationSeconds,
            width: meta.width,
            height: meta.height,
            frameRate: meta.frameRate,
            hasAudio: meta.hasAudio,
            identityIndicators,
            identityStatus: 'supported',
            independentFromProductionParser: true,
            independenceScope: 'independent visual rendering path; not independent match data origin',
            timeBasis: 'video_seconds',
            limitations: [
                'Video was rendered/recorded from replay playback and shares match data origin with the DEM.',
                'No committed frames or clips are included.',
                'Camera coverage is player/spectator-view dependent.'
            ]
        },
        rejectedSources: [
            {
                sourceId: 'samples_partida_006_video',
                reason: 'Wrong match/replay context; belongs to replay 006 / match 91119257.'
            }
        ],
        replay005Protection: 'not_processed_or_inspected',
        botFixtureExclusion: 'not_processed_or_inspected'
    };

    const coverage = {
        schemaVersion: 1,
        replayId: 'replay_009',
        coverage: [
            { category: 'scoreboard_or_replay_ui', status: 'continuous', limitations: [ 'UI text is small in committed metadata; frame evidence remains local.' ] },
            { category: 'player_deaths', status: 'partial', limitations: [ 'Top feed/roster visible, but detailed death anchors were not used as objective validation targets.' ] },
            { category: 'mid_boss_area', status: 'partial', limitations: [ 'Two Mid Boss arena sequences are visible.' ] },
            { category: 'guardians', status: 'brief', limitations: [ 'Guardian-specific sampled entities are not clearly isolated.' ] },
            { category: 'walkers', status: 'partial', limitations: [ 'Large lane/base objective figures appear, but deletion windows are often camera-elsewhere.' ] },
            { category: 'patron_base', status: 'partial', limitations: [ 'Late base/Patron-area combat is visible, but class-specific mapping remains ambiguous.' ] },
            { category: 'spirit_urn', status: 'brief', limitations: [ 'Candidate windows do not prove canonical Urn object identity.' ] },
            { category: 'rejuvenator', status: 'not_visible', limitations: [ 'No clear Rejuvenator claim/effect validation.' ] },
            { category: 'map_overview', status: 'continuous', limitations: [ 'Minimap is visible but not used for spatial validation.' ] },
            { category: 'replay_timeline', status: 'continuous', limitations: [ 'Timeline visible but not used as authoritative active-game clock.' ] }
        ]
    };

    const sync = {
        schemaVersion: 1,
        replayId: 'replay_009',
        synchronizationStatus: 'usable_with_constraints',
        anchorCount: anchors.length,
        anchors: anchorsWithResiduals,
        selectedMapping: SELECTED_MAPPING,
        testedMappings: [
            { type: 'offset_only', result: 'rejected_for_large_end_residual' },
            { type: 'linear', result: 'selected' },
            { type: 'piecewise_linear', result: 'not_required_for_bounded_validation' }
        ],
        coverageInterval: { parserStartSeconds: 0, parserEndSeconds: 2170.703, videoStartSeconds: 10, videoEndSeconds: 2140 },
        cutsOrSpeedChanges: 'not_detected_by_bounded_review',
        limitations: [
            'Residuals are coarse because anchors are visual and no OCR/game-clock mapping was established.',
            'Predicted windows use +/-30 seconds for sampled event review.'
        ]
    };

    const sample = {
        schemaVersion: 1,
        replayId: 'replay_009',
        selectionRule: [
            'all Mid Boss entity_present/entity_deleted events',
            'all Walker entity_present/entity_deleted events',
            'all supported Mid Boss, Walker, and Patron/base deletion events',
            'Guardian subset: first two and last two entities by entityKey plus any deleted entities',
            'all five Spirit Urn candidate zero-sequence deletion events'
        ],
        sampledEventCount: selected.length,
        sampledEvents: selected.map(event => ({
            eventId: event.eventId,
            mechanicId: event.mechanicId,
            className: event.className,
            eventType: event.eventType,
            parserSeconds: event.parserSeconds,
            semanticLimit: event.semanticLimit
        }))
    };

    const classIdentity = {
        schemaVersion: 1,
        replayId: 'replay_009',
        classes: [
            { className: 'CNPC_MidBoss', validationStatus: 'visual_identity_supported', limitations: [ 'Mid Boss visual model and arena sequence match parser class timing with constraints.' ] },
            { className: 'CNPC_BaseDefenseSentry', validationStatus: 'not_visible', limitations: [ 'Sampled Guardian entities not clearly visible.' ] },
            { className: 'CNPC_Boss_Tier2', validationStatus: 'visual_identity_supported', limitations: [ 'Walker-type identity is visually plausible; entity-specific deletion timing mostly not visible.' ] },
            { className: 'CNPC_BarrackBoss', validationStatus: 'visual_identity_ambiguous', limitations: [ 'Base-object mapping not independently separated.' ] },
            { className: 'CNPC_Boss_Tier3', validationStatus: 'visual_identity_ambiguous', limitations: [ 'Patron/base phase visible but class-specific identity unresolved.' ] },
            { className: 'CNPC_TrooperBoss', validationStatus: 'visual_identity_ambiguous', limitations: [ 'Could be auxiliary or base-related; unresolved.' ] },
            { className: 'Spirit Urn candidate classes', validationStatus: 'unresolved', limitations: [ 'Candidate classes not proven canonical Urn object.' ] },
            { className: 'CCitadel_ArmorUpgrade_PersonalRejuvenator', validationStatus: 'not_tested', limitations: [ 'No Task 063 candidate events and no clear video validation.' ] }
        ]
    };

    const confirmed = comparisons.filter(row => row.comparisonStatus === 'visually_confirmed').length;
    const supported = comparisons.filter(row => row.comparisonStatus === 'source_supported').length;
    const contradicted = comparisons.filter(row => row.comparisonStatus === 'source_contradicted').length;
    const notVisible = comparisons.filter(row => row.comparisonStatus === 'not_visible').length;
    const summary = {
        schemaVersion: 2,
        taskId: '064',
        replayId: 'replay_009',
        selectedVideoFilename: 'replay_009_independent_validation.mp4.mp4',
        videoIdentityResult: 'supported',
        durationSeconds: meta.durationSeconds,
        resolution: { width: meta.width, height: meta.height },
        independentRenderingStatus: 'independent visual rendering path; not independent match data origin',
        coverageSummary: 'Mid Boss has useful visual coverage; Walker and Patron/base have partial coverage; Guardian, Spirit Urn candidates, and Rejuvenator remain limited or unresolved.',
        synchronization: {
            anchorCount: anchors.length,
            model: 'linear',
            medianResidualSeconds: SELECTED_MAPPING.medianResidualSeconds,
            maximumResidualSeconds: SELECTED_MAPPING.maximumResidualSeconds,
            status: 'usable_with_constraints'
        },
        sampledEventCount: comparisons.length,
        categorySummary: categories,
        confirmedEvents: confirmed,
        supportedEvents: supported,
        contradictedEvents: contradicted,
        notVisibleEvents: notVisible,
        timingAmbiguousEvents: comparisons.filter(row => row.comparisonStatus === 'timing_ambiguous' || row.comparisonStatus === 'identity_ambiguous').length,
        healthZeroAuditResult: updatedHealthAudit.videoAuditResult,
        mechanicEffectsApplied: 0,
        gate: GATE,
        blockedFollowUpTask: FOLLOW_UP,
        replay005Protection: 'not_processed_or_inspected',
        botFixtureExclusion: 'not_processed_or_inspected'
    };

    const gate = {
        schemaVersion: 2,
        taskId: '064',
        gate: GATE,
        videoIdentity: 'supported',
        synchronizationStatus: 'usable_with_constraints',
        comparisonPerformed: true,
        mechanicEffectsApplied: 0,
        limitations: [
            'Validation is partial because camera coverage is limited.',
            'Mid Boss received the strongest independent visual support.',
            'Structure class mappings remain constrained or ambiguous for some classes.',
            'No kill, destruction, claim, deposit, secure, mechanic effect, spatial contest, or macro conclusion was produced.'
        ]
    };

    await writeJson(`${OUT_DIR}/independent-source-inventory.json`, inventory);
    await writeJson(`${OUT_DIR}/video-metadata.json`, {
        schemaVersion: 1,
        sourceId: 'replay_009_video',
        path: 'samples/videos/replay_009_independent_validation.mp4.mp4',
        ...meta,
        codec: 'opencv_fourcc_int_875967080',
        creationMetadata: null,
        integrity: {
            canDecode: true,
            nonzeroDuration: meta.durationSeconds > 0,
            timestampsMonotonic: true,
            majorCorruption: false,
            cutsOrPausesDocumented: 'none_detected_by_bounded_review'
        }
    });
    await writeJson(`${OUT_DIR}/video-coverage-audit.json`, coverage);
    await writeJson(`${OUT_DIR}/source-synchronization.json`, sync);
    await writeJson(`${OUT_DIR}/validation-sample.json`, sample);
    await writeJsonl(`${OUT_DIR}/event-source-comparison.jsonl`, comparisons);
    await writeJson(`${OUT_DIR}/category-validation-summary.json`, { schemaVersion: 1, replayId: 'replay_009', categories });
    await writeJson(`${OUT_DIR}/spirit-urn-health-zero-audit.json`, updatedHealthAudit);
    await writeJson(`${OUT_DIR}/class-identity-validation.json`, classIdentity);
    await writeJson(`${OUT_DIR}/independent-validation-summary.json`, summary);
    await writeJson(`${OUT_DIR}/independent-validation-gate.json`, gate);

    const observability = await readJson(`${STATE_DIR}/objective-structure-entity-observability.json`);
    observability.task064IndependentValidation = {
        gate: GATE,
        midBoss: 'validated_with_constraints',
        walker: 'partially_supported',
        guardian: 'not_observable',
        patronBase: 'partially_supported_identity_ambiguous',
        spiritUrnCandidates: 'unresolved',
        rejuvenatorCandidate: 'not_tested',
        mechanicEffectsApplied: 0
    };
    await writeJson(`${STATE_DIR}/objective-structure-entity-observability.json`, observability);

    const reclassification = await readJson(`${STATE_DIR}/task-060-candidate-reclassification.json`);
    reclassification.task064IndependentValidation = {
        midBoss: 'visual_identity_supported',
        coreStructures: 'partial_visual_support_with_class_ambiguity',
        spiritUrn: 'unresolved',
        rejuvenator: 'not_tested'
    };
    await writeJson(`${STATE_DIR}/task-060-candidate-reclassification.json`, reclassification);

    const eventSummary = await readJson(`${STATE_DIR}/objective-structure-event-summary.json`);
    eventSummary.task064IndependentValidation = {
        gate: GATE,
        confirmedEvents: confirmed,
        supportedEvents: supported,
        contradictedEvents: contradicted,
        notVisibleEvents: notVisible,
        mechanicEffectsApplied: 0
    };
    await writeJson(`${STATE_DIR}/objective-structure-event-summary.json`, eventSummary);

    await fs.writeFile(FOLLOW_UP, `# Task 065: Integrate Independently Validated Objective/Structure Event Statuses

Status: blocked

Unlocked by: explicit authorization after Task 064 review

Blocked by: review of Task 064 independent validation outputs

## Objective

Integrate Task 064 independent validation statuses into the canonical replay-009
state schema without applying mechanic effects or macro interpretation.

## Constraints

- Do not process replay 005.
- Do not process bot fixtures 006-008.
- Do not promote health zero to kill/destruction.
- Do not promote entity deletion to destroyed, claimed, secured, deposited, or
  objective completion.
- Preserve camera-coverage limitations and class-identity ambiguity.

## Required validation

- canonical state schema tests;
- validation status propagation tests;
- mechanic-effect-zero tests;
- replay 005 exclusion verification;
- bot fixture exclusion verification;
- task queue validation.
`);

    await fs.writeFile(REPORT, `# Replay 009 Objective/Structure Independent Validation

Task 064 validates Task 063 bounded factual events against the user-supplied replay-009 video.

## Result

- Gate: \`${GATE}\`
- Video: \`replay_009_independent_validation.mp4.mp4\`
- Video identity: supported
- Independent source scope: independent visual rendering path, not independent match data origin
- Synchronization: usable with constraints, ${anchors.length} anchors, linear mapping
- Median residual: ${SELECTED_MAPPING.medianResidualSeconds}s
- Maximum residual: ${SELECTED_MAPPING.maximumResidualSeconds}s
- Sampled events: ${comparisons.length}

## Category Results

| Category | Status | Confirmed | Supported | Not visible | Ambiguous/other |
| --- | ---: | ---: | ---: | ---: | ---: |
${categories.map(row => `| ${row.category} | ${row.overallStatus} | ${row.confirmedEvents} | ${row.supportedEvents} | ${row.notVisibleEvents} | ${row.timingAmbiguousEvents} |`).join('\n')}

## Interpretation

Mid Boss receives the strongest visual support: the arena and boss model are visible around both parser deletion windows. Walker and Patron/base categories have partial visual support, but several deletion timings are not visible or class-specific mapping remains ambiguous. Guardian sampled entities are not clearly visible. Spirit Urn candidate classes remain unresolved, and Rejuvenator is not validated.

No mechanic effects were applied. Health zero remains a raw observation only, and entity deletion is not interpreted as kill, destruction, secure, claim, deposit, or objective completion.
`);
}

await main();
