import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const OUTPUT_DIR = 'output';
const POINT_TEMPLATE = path.join(OUTPUT_DIR, '24-point-review-unlabeled-template.json');
const EPISODE_TEMPLATE = path.join(OUTPUT_DIR, '24-episode-review-unlabeled-template.json');
const GATE_FILE = path.join(OUTPUT_DIR, '24-human-review-gate.json');
const POINT_LABELED = path.join(OUTPUT_DIR, '24-point-review-labeled.json');
const EPISODE_LABELED = path.join(OUTPUT_DIR, '24-episode-review-labeled.json');

const POINT_RESULTS = path.join(OUTPUT_DIR, '24-point-validation-results.json');
const EPISODE_RESULTS = path.join(OUTPUT_DIR, '24-episode-validation-results.json');
const CONFUSION_MATRIX = path.join(OUTPUT_DIR, '24-lane-confusion-matrix.json');
const ERROR_ANALYSIS = path.join(OUTPUT_DIR, '24-error-analysis.json');
const TRANSITION_READINESS = path.join(OUTPUT_DIR, '24-transition-readiness-review.json');

const VALID_LABELS = new Set([ 'correct', 'incorrect', 'ambiguous' ]);
const REQUIRED_LANES = new Set([ 'lane_1', 'lane_2', 'lane_3' ]);
const REQUIRED_PHASES = new Set([ 'early', 'middle', 'late' ]);
const REQUIRED_PLAYERS = new Set(Array.from({ length: 12 }, (_, index) => index));
const args = new Set(process.argv.slice(2));

if (args.has('--template-check')) {
    runTemplateCheck();
} else {
    runScoring();
}

function runTemplateCheck() {
    const pointTemplate = readJson(POINT_TEMPLATE);
    const episodeTemplate = readJson(EPISODE_TEMPLATE);
    const gate = readJson(GATE_FILE);

    assertUnlabeled(pointTemplate, POINT_TEMPLATE);
    assertUnlabeled(episodeTemplate, EPISODE_TEMPLATE);

    if (gate.gateResult !== 'awaiting_human_labels') {
        throw new Error(`Expected ${GATE_FILE} gateResult to be awaiting_human_labels.`);
    }

    console.log(`template check passed: ${POINT_TEMPLATE} (${pointTemplate.samples.length} samples)`);
    console.log(`template check passed: ${EPISODE_TEMPLATE} (${episodeTemplate.samples.length} samples)`);
    console.log('gate result: awaiting_human_labels');
}

function runScoring() {
    if (!fs.existsSync(POINT_LABELED) || !fs.existsSync(EPISODE_LABELED)) {
        throw new Error('Labeled point and episode files are required before scoring. No metrics were computed.');
    }

    const points = readJson(POINT_LABELED);
    const episodes = readJson(EPISODE_LABELED);
    const pointCoverage = validateCoverage(points.samples, 'point');
    const episodeCoverage = validateCoverage(episodes.samples, 'episode');

    if (!pointCoverage.passes || !episodeCoverage.passes) {
        throw new Error('Labeled files did not pass coverage validation. No metrics were computed.');
    }

    const pointResults = summarizeValidation(points.samples, 'point');
    const episodeResults = summarizeValidation(episodes.samples, 'episode');
    const confusion = buildConfusionMatrix([ ...points.samples, ...episodes.samples ]);
    const errors = buildErrorAnalysis(points.samples, episodes.samples);
    const transitionReadiness = buildTransitionReadiness(pointResults, episodeResults, pointCoverage, episodeCoverage);

    writeJson(POINT_RESULTS, pointResults);
    writeJson(EPISODE_RESULTS, episodeResults);
    writeJson(CONFUSION_MATRIX, confusion);
    writeJson(ERROR_ANALYSIS, errors);
    writeJson(TRANSITION_READINESS, transitionReadiness);

    console.log(`gate result: ${transitionReadiness.gateResult}`);
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function assertUnlabeled(document, filePath) {
    const labeled = document.samples.filter((sample) => {
        const review = sample.review ?? {};
        return Object.values(review).some((value) => value !== null && value !== '');
    });

    if (labeled.length > 0) {
        throw new Error(`${filePath} contains non-empty review fields.`);
    }
}

function validateCoverage(samples, kind) {
    const reviewed = samples.filter((sample) => VALID_LABELS.has(sample.review?.label));
    const nonAmbiguous = reviewed.filter((sample) => sample.review.label !== 'ambiguous');
    const lanes = new Set(nonAmbiguous.map((sample) => sample.review.reviewedPhysicalLane).filter((lane) => REQUIRED_LANES.has(lane)));
    const players = new Set(nonAmbiguous.map((sample) => sample.stratum?.playerIndex).filter((player) => REQUIRED_PLAYERS.has(player)));
    const phases = new Set(nonAmbiguous.map((sample) => sample.stratum?.matchPhase).filter((phase) => REQUIRED_PHASES.has(phase)));
    const minimum = kind === 'point' ? 60 : 30;
    const missing = [];

    if (nonAmbiguous.length < minimum) {
        missing.push(`at least ${minimum} non-ambiguous ${kind} samples`);
    }

    for (const lane of REQUIRED_LANES) {
        if (!lanes.has(lane)) {
            missing.push(`lane ${lane}`);
        }
    }

    for (const player of REQUIRED_PLAYERS) {
        if (!players.has(player)) {
            missing.push(`player ${player}`);
        }
    }

    for (const phase of REQUIRED_PHASES) {
        if (!phases.has(phase)) {
            missing.push(`match phase ${phase}`);
        }
    }

    return {
        kind,
        passes: missing.length === 0,
        reviewedSamples: reviewed.length,
        nonAmbiguousSamples: nonAmbiguous.length,
        lanes: Array.from(lanes).sort(),
        players: Array.from(players).sort((left, right) => left - right),
        phases: Array.from(phases).sort(),
        missing
    };
}

function summarizeValidation(samples, kind) {
    const groups = groupBy(samples, (sample) => sample.stratum?.state ?? sample.stratum?.episodeType ?? 'unknown');

    return {
        kind,
        generatedAt: new Date().toISOString(),
        sampleCount: samples.length,
        total: summarizeGroup(samples),
        byState: Object.fromEntries(Array.from(groups.entries())
            .sort(([ left ], [ right ]) => left.localeCompare(right))
            .map(([ key, group ]) => [ key, summarizeGroup(group) ]))
    };
}

function summarizeGroup(samples) {
    const reviewed = samples.filter((sample) => VALID_LABELS.has(sample.review?.label));
    const correct = reviewed.filter((sample) => sample.review.label === 'correct').length;
    const incorrect = reviewed.filter((sample) => sample.review.label === 'incorrect').length;
    const ambiguous = reviewed.filter((sample) => sample.review.label === 'ambiguous').length;
    const denominator = correct + incorrect;

    return {
        reviewed: reviewed.length,
        correct,
        incorrect,
        ambiguous,
        precisionExcludingAmbiguous: denominator > 0 ? round(correct / denominator) : null
    };
}

function buildConfusionMatrix(samples) {
    const matrix = {};

    for (const sample of samples) {
        if (!VALID_LABELS.has(sample.review?.label) || sample.review.label === 'ambiguous') {
            continue;
        }

        const predicted = sample.stratum?.physicalLaneId ?? 'none';
        const reviewed = sample.review.reviewedPhysicalLane ?? 'none';
        matrix[predicted] ??= {};
        matrix[predicted][reviewed] = (matrix[predicted][reviewed] ?? 0) + 1;
    }

    return {
        generatedAt: new Date().toISOString(),
        note: 'Rows are model physical lane; columns are human-reviewed physical lane.',
        matrix
    };
}

function buildErrorAnalysis(pointSamples, episodeSamples) {
    const allSamples = [ ...pointSamples, ...episodeSamples ];
    const incorrect = allSamples.filter((sample) => sample.review?.label === 'incorrect');

    return {
        generatedAt: new Date().toISOString(),
        incorrectCount: incorrect.length,
        baseErrors: incorrect.filter((sample) => sample.stratum?.state === 'base_core').length,
        deploymentErrors: incorrect.filter((sample) => sample.stratum?.state === 'deployment_ambiguous').length,
        episodeContinuityErrors: incorrect.filter((sample) => sample.reviewKind === 'episode').length,
        fragmentationErrors: incorrect.filter((sample) => sample.sourceEpisode?.episodeType === 'brief_contact').length,
        truncationErrors: incorrect.filter((sample) => sample.review?.observedEvidence?.toLowerCase().includes('trunc')).length,
        examples: incorrect.slice(0, 25).map((sample) => ({
            sampleId: sample.sampleId,
            reviewKind: sample.reviewKind,
            stratum: sample.stratum,
            review: sample.review
        }))
    };
}

function buildTransitionReadiness(pointResults, episodeResults, pointCoverage, episodeCoverage) {
    const pointPrecision = pointResults.total.precisionExcludingAmbiguous;
    const episodePrecision = episodeResults.total.precisionExcludingAmbiguous;
    let gateResult = 'requires_model_revision';

    if (!pointCoverage.passes || !episodeCoverage.passes) {
        gateResult = 'insufficient_human_labels';
    } else if (pointPrecision !== null && episodePrecision !== null && pointPrecision >= 0.8 && episodePrecision >= 0.8) {
        gateResult = 'validated_for_transition_candidates';
    }

    return {
        generatedAt: new Date().toISOString(),
        gateResult,
        pointCoverage,
        episodeCoverage,
        pointPrecisionExcludingAmbiguous: pointPrecision,
        episodePrecisionExcludingAmbiguous: episodePrecision,
        requiredMetrics: [
            'stratified precision by state',
            'confusion matrix by physical lane',
            'base and deployment errors',
            'episode continuity',
            'fragmentation',
            'truncation',
            'transition readiness'
        ]
    };
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

function round(value) {
    return Math.round(value * 1000) / 1000;
}
