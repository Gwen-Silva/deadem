import fs from 'node:fs';
import path from 'node:path';

const OUTPUT_DIR = 'output';
const POINT_SOURCE = path.join(OUTPUT_DIR, '23-calibrated-lane-occupancy.json');
const EPISODE_SOURCE = path.join(OUTPUT_DIR, '23-calibrated-occupancy-episodes.json');
const CALIBRATION_REVIEW_SOURCE = path.join(OUTPUT_DIR, '23-occupancy-calibration-review.json');
const MODEL_COMPARISON_SOURCE = path.join(OUTPUT_DIR, '23-occupancy-model-comparison.json');

const POINT_SAMPLE_OUTPUT = path.join(OUTPUT_DIR, '24-point-review-samples.json');
const EPISODE_SAMPLE_OUTPUT = path.join(OUTPUT_DIR, '24-episode-review-samples.json');
const POINT_TEMPLATE_OUTPUT = path.join(OUTPUT_DIR, '24-point-review-unlabeled-template.json');
const EPISODE_TEMPLATE_OUTPUT = path.join(OUTPUT_DIR, '24-episode-review-unlabeled-template.json');
const GATE_OUTPUT = path.join(OUTPUT_DIR, '24-human-review-gate.json');

const TARGET_POINT_SAMPLES = 120;
const TARGET_EPISODE_SAMPLES = 72;
const PHASES = [
    { name: 'early', minSecond: 0, maxSecond: 600 },
    { name: 'middle', minSecond: 601, maxSecond: 1200 },
    { name: 'late', minSecond: 1201, maxSecond: Number.POSITIVE_INFINITY }
];

const LABEL_FIELDS = {
    label: null,
    reviewedPhysicalLane: null,
    reviewerConfidence: null,
    observedEvidence: null,
    reviewer: null,
    reviewedAt: null,
    notes: null
};

main();

function main() {
    const timeline = readJson(POINT_SOURCE);
    const episodes = readJson(EPISODE_SOURCE);
    const calibrationReview = readJson(CALIBRATION_REVIEW_SOURCE);
    const modelComparison = readJson(MODEL_COMPARISON_SOURCE);

    const rows = decodeRows(timeline.schema, timeline.rows);
    const pointSamples = selectPointSamples(rows, TARGET_POINT_SAMPLES);
    const episodeSamples = selectEpisodeSamples(episodes, TARGET_EPISODE_SAMPLES);

    const metadata = {
        experiment: 24,
        sourceExperiment: 23,
        generatedAt: new Date().toISOString(),
        recommendedModel: timeline.recommendedModel,
        gateResult: 'awaiting_human_labels',
        labelStatus: 'unlabeled',
        allowedLabels: [ 'correct', 'incorrect', 'ambiguous' ],
        allowedReviewedPhysicalLanes: [ 'lane_1', 'lane_2', 'lane_3', 'deployment', 'base', 'unknown' ],
        requiredHumanFields: [
            'label',
            'reviewedPhysicalLane',
            'reviewerConfidence',
            'observedEvidence'
        ],
        note: 'These samples are infrastructure for human validation and are not scientific validation results.'
    };

    writeJson(POINT_SAMPLE_OUTPUT, {
        ...metadata,
        kind: 'point_review_samples',
        sampleCount: pointSamples.length,
        samplingSummary: summarizeSamples(pointSamples),
        samples: pointSamples
    });

    writeJson(EPISODE_SAMPLE_OUTPUT, {
        ...metadata,
        kind: 'episode_review_samples',
        sampleCount: episodeSamples.length,
        samplingSummary: summarizeSamples(episodeSamples),
        samples: episodeSamples
    });

    writeJson(POINT_TEMPLATE_OUTPUT, {
        ...metadata,
        kind: 'point_review_unlabeled_template',
        sampleCount: pointSamples.length,
        samples: pointSamples.map((sample) => withReviewFields(sample))
    });

    writeJson(EPISODE_TEMPLATE_OUTPUT, {
        ...metadata,
        kind: 'episode_review_unlabeled_template',
        sampleCount: episodeSamples.length,
        samples: episodeSamples.map((sample) => withReviewFields(sample))
    });

    writeJson(GATE_OUTPUT, {
        experiment: 24,
        generatedAt: metadata.generatedAt,
        gateResult: 'awaiting_human_labels',
        completionMeaning: 'Validation infrastructure is ready for human labeling only.',
        notValidatedYet: true,
        humanInputsRequired: [
            'output/24-point-review-labeled.json',
            'output/24-episode-review-labeled.json'
        ],
        minimumCompletionGate: {
            nonAmbiguousPointSamples: 60,
            nonAmbiguousEpisodeSamples: 30,
            physicalLanes: [ 'lane_1', 'lane_2', 'lane_3' ],
            players: Array.from({ length: 12 }, (_, index) => index),
            matchPhases: [ 'early', 'middle', 'late' ]
        },
        sourceEvidence: {
            readyToDetectTransitions: calibrationReview.readyToDetectTransitions,
            recommendedModel: calibrationReview.recommendedModel,
            modelComparisonRecommendedModel: modelComparison.recommendedModel
        }
    });

    console.log(`Wrote ${POINT_SAMPLE_OUTPUT} (${pointSamples.length} samples)`);
    console.log(`Wrote ${EPISODE_SAMPLE_OUTPUT} (${episodeSamples.length} samples)`);
    console.log('Gate result: awaiting_human_labels');
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function decodeRows(schema, rows) {
    return rows.map((row) => Object.fromEntries(schema.map((field, index) => [ field, row[index] ])));
}

function selectPointSamples(rows, targetCount) {
    const rowsWithContext = rows
        .map((row) => ({
            ...row,
            matchPhase: getMatchPhase(row.gameSecond)
        }))
        .sort(comparePointCandidates);

    const requiredSamples = [
        ...takeOnePer(rowsWithContext, (row) => `player:${row.playerIndex}`),
        ...takeOnePer(rowsWithContext, (row) => `lane:${row.physicalLaneId ?? 'none'}`),
        ...takeOnePer(rowsWithContext, (row) => `state:${row.state}`),
        ...takeOnePer(rowsWithContext, (row) => `phase:${row.matchPhase}`)
    ];

    const selected = uniqueBy(requiredSamples, pointSourceId);
    fillPhaseQuotas(selected, rowsWithContext, targetCount, pointSourceId, pointBucketKey);
    fillRoundRobin(selected, groupBy(rowsWithContext, pointBucketKey), targetCount, pointSourceId);

    return selected
        .slice(0, targetCount)
        .map((row, index) => ({
            sampleId: `p24_point_${String(index + 1).padStart(3, '0')}`,
            reviewKind: 'point',
            sourceExperiment: 23,
            stratum: {
                playerIndex: row.playerIndex,
                state: row.state,
                physicalLaneId: row.physicalLaneId,
                matchPhase: row.matchPhase
            },
            sourceRow: row
        }));
}

function selectEpisodeSamples(episodes, targetCount) {
    const stable = episodes.stableEpisodes.map((episode) => ({
        ...episode,
        episodeType: 'stable_episode',
        matchPhase: getMatchPhase(episode.startSecond),
        sourceId: episode.episodeId,
        state: `stable_${episode.confidence}`
    }));

    const brief = episodes.briefContacts.map((episode) => ({
        ...episode,
        episodeType: 'brief_contact',
        matchPhase: getMatchPhase(episode.startSecond),
        sourceId: episode.contactId,
        state: episode.reason
    }));

    const candidates = [ ...stable, ...brief ].sort(compareEpisodeCandidates);
    const requiredSamples = [
        ...takeOnePer(candidates, (episode) => `player:${episode.playerIndex}`),
        ...takeOnePer(candidates, (episode) => `lane:${episode.physicalLaneId}`),
        ...takeOnePer(candidates, (episode) => `phase:${episode.matchPhase}`),
        ...takeOnePer(candidates, (episode) => `type:${episode.episodeType}`),
        ...takeOnePer(candidates, (episode) => `state:${episode.state}`)
    ];

    const selected = uniqueBy(requiredSamples, (episode) => episode.sourceId);
    fillPhaseQuotas(selected, candidates, targetCount, (episode) => episode.sourceId, episodeBucketKey);
    fillRoundRobin(selected, groupBy(candidates, episodeBucketKey), targetCount, (episode) => episode.sourceId);

    return selected
        .slice(0, targetCount)
        .map((episode, index) => ({
            sampleId: `p24_episode_${String(index + 1).padStart(3, '0')}`,
            reviewKind: 'episode',
            sourceExperiment: 23,
            stratum: {
                playerIndex: episode.playerIndex,
                episodeType: episode.episodeType,
                physicalLaneId: episode.physicalLaneId,
                matchPhase: episode.matchPhase,
                state: episode.state,
                durationBucket: getDurationBucket(episode.durationSeconds)
            },
            sourceEpisode: episode
        }));
}

function comparePointCandidates(left, right) {
    return left.gameSecond - right.gameSecond
        || left.playerIndex - right.playerIndex
        || String(left.state).localeCompare(String(right.state))
        || String(left.physicalLaneId).localeCompare(String(right.physicalLaneId));
}

function compareEpisodeCandidates(left, right) {
    return left.startSecond - right.startSecond
        || left.playerIndex - right.playerIndex
        || String(left.episodeType).localeCompare(String(right.episodeType))
        || String(left.sourceId).localeCompare(String(right.sourceId));
}

function takeOnePer(items, keyFn) {
    const seen = new Set();
    const result = [];

    for (const item of items) {
        const key = keyFn(item);
        if (!seen.has(key)) {
            seen.add(key);
            result.push(item);
        }
    }

    return result;
}

function uniqueBy(items, keyFn) {
    const seen = new Set();
    const result = [];

    for (const item of items) {
        const key = keyFn(item);
        if (!seen.has(key)) {
            seen.add(key);
            result.push(item);
        }
    }

    return result;
}

function fillRoundRobin(selected, buckets, targetCount, keyFn) {
    const seen = new Set(selected.map(keyFn));
    const sortedBuckets = Array.from(buckets.values())
        .map((items) => items.filter((item) => !seen.has(keyFn(item))))
        .filter((items) => items.length > 0);

    let cursor = 0;
    while (selected.length < targetCount && sortedBuckets.length > 0) {
        const bucket = sortedBuckets[cursor % sortedBuckets.length];
        const item = bucket.shift();

        if (item) {
            const key = keyFn(item);
            if (!seen.has(key)) {
                seen.add(key);
                selected.push(item);
            }
        }

        if (bucket.length === 0) {
            sortedBuckets.splice(cursor % sortedBuckets.length, 1);
        } else {
            cursor += 1;
        }
    }
}

function fillPhaseQuotas(selected, candidates, targetCount, keyFn, bucketKeyFn) {
    const baseQuota = Math.floor(targetCount / PHASES.length);
    const remainder = targetCount % PHASES.length;

    PHASES.forEach((phase, phaseIndex) => {
        const quota = baseQuota + (phaseIndex < remainder ? 1 : 0);
        const phaseCandidates = candidates.filter((candidate) => candidate.matchPhase === phase.name);
        const phaseBuckets = groupBy(phaseCandidates, bucketKeyFn);

        fillRoundRobin(
            selected,
            phaseBuckets,
            quota * (phaseIndex + 1),
            keyFn
        );
    });
}

function groupBy(items, keyFn) {
    const groups = new Map();

    for (const item of items) {
        const key = keyFn(item);
        const group = groups.get(key) ?? [];
        group.push(item);
        groups.set(key, group);
    }

    return groups;
}

function pointSourceId(row) {
    return `${row.playerIndex}:${row.gameSecond}`;
}

function pointBucketKey(row) {
    return [
        row.matchPhase,
        row.state,
        row.physicalLaneId ?? 'none',
        row.playerIndex
    ].join('|');
}

function episodeBucketKey(episode) {
    return [
        episode.matchPhase,
        episode.episodeType,
        episode.physicalLaneId,
        episode.playerIndex,
        episode.state
    ].join('|');
}

function getMatchPhase(second) {
    return PHASES.find((phase) => second >= phase.minSecond && second <= phase.maxSecond)?.name ?? 'late';
}

function getDurationBucket(durationSeconds) {
    if (durationSeconds <= 2) {
        return 'short';
    }

    if (durationSeconds <= 10) {
        return 'medium';
    }

    return 'long';
}

function withReviewFields(sample) {
    return {
        ...sample,
        review: { ...LABEL_FIELDS }
    };
}

function summarizeSamples(samples) {
    return {
        byPlayer: countBy(samples, (sample) => String(sample.stratum.playerIndex)),
        byLane: countBy(samples, (sample) => sample.stratum.physicalLaneId ?? 'none'),
        byPhase: countBy(samples, (sample) => sample.stratum.matchPhase),
        byState: countBy(samples, (sample) => sample.stratum.state)
    };
}

function countBy(items, keyFn) {
    const counts = {};

    for (const item of items) {
        const key = keyFn(item);
        counts[key] = (counts[key] ?? 0) + 1;
    }

    return Object.fromEntries(Object.entries(counts).sort(([ left ], [ right ]) => left.localeCompare(right)));
}
