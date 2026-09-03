#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TELEMETRY_MANIFEST = 'output/local-replay-processing/minimum-review-telemetry/task199-bounded2/manifest.json';
const TELEMETRY_AVAILABILITY = 'output/local-replay-processing/minimum-review-telemetry/task199-bounded2/availability.json';
const SYNC_MAPPING = 'output/local-replay-processing/replay-video-sync/task200-bounded2/mapping.json';
const VISUAL_FRAME_INDEX = 'output/local-replay-processing/whole-match-visual-index/task201-bounded2/frame-index.json';
const CONTACT_SHEET_INDEX = 'output/local-replay-processing/whole-match-visual-index/task201-bounded2/contact-sheet-index.json';
const OUTPUT_ROOT = 'output/local-replay-processing/review-candidate-windows/task202-bounded2';
const LOCAL_ROOT = '.local/deadem/review-candidates';
const TARGET_IDS = ['review_match_001', 'review_match_002'];
const BIN_SECONDS = 5;
const ACTIVITY_PERCENTILE = 0.75;
const MERGE_GAP_SECONDS = 15;
const WINDOW_PADDING_SECONDS = 12;
const MAX_WINDOW_SECONDS = 90;
export const CANDIDATE_HEURISTIC = Object.freeze({ binSeconds: BIN_SECONDS, activityPercentile: ACTIVITY_PERCENTILE, mergeGapSeconds: MERGE_GAP_SECONDS, paddingSeconds: WINDOW_PADDING_SECONDS, maximumWindowSeconds: MAX_WINDOW_SECONDS });
const LOW_SELECTIVITY_FRACTION = 0.8;
const POSITIVE_GATE = 'two_match_review_candidate_windows_ready';
const LOW_SELECTIVITY_GATE = 'two_match_review_candidate_windows_ready_with_low_selectivity';
const PARTIAL_GATE = 'two_match_review_candidate_windows_partial';
const BLOCKED_GATE = 'BLOCKED_BY_REVIEW_TELEMETRY_ARTIFACTS_UNAVAILABLE';

const round = (value, digits = 6) => Number(Number(value).toFixed(digits));
const slash = value => String(value).replaceAll('\\', '/');

function sorted(value) {
    if (Array.isArray(value)) return value.map(sorted);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])]));
    }
    return value;
}

export function deterministicJson(value) {
    return `${JSON.stringify(sorted(value), null, 2)}\n`;
}

export function assertReviewTargetId(value) {
    if (/(?:replay|partida|match)[_-]?00?[5-8]/iu.test(String(value))) {
        throw new Error(`protected replay alias rejected before filesystem access: ${value}`);
    }
    if (!TARGET_IDS.includes(value)) throw new Error(`unsupported review target: ${value}`);
    return value;
}

export function binStartFor(elapsedSeconds, binSeconds = BIN_SECONDS) {
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) throw new Error('elapsed seconds must be finite and non-negative');
    if (!Number.isInteger(binSeconds) || binSeconds < 1) throw new Error('bin size must be a positive integer');
    return Math.floor(elapsedSeconds / binSeconds) * binSeconds;
}

function emptyFamily() {
    return {
        rowCount: 0,
        summedDelta: 0,
        absoluteDeltaSum: 0,
        participantRefs: new Set(),
        entityRefs: new Set(),
        transitionTypes: new Set(),
        observedTimes: []
    };
}

export function createBinStore(model, binSeconds = BIN_SECONDS) {
    const bins = new Map();
    for (let start = model.coveredReplayRegion.startSeconds; start <= model.coveredReplayRegion.endSeconds; start += binSeconds) {
        bins.set(`mapped:${start}`, {
            binStartSeconds: start,
            binEndSeconds: Math.min(start + binSeconds, model.coveredReplayRegion.endSeconds),
            mappingStatus: 'mapped',
            families: {
                lifecycle: emptyFamily(),
                damage: emptyFamily(),
                healing: emptyFamily(),
                economy: emptyFamily(),
                objective_like: emptyFamily()
            }
        });
    }
    return bins;
}

function getBin(bins, model, elapsedSeconds, binSeconds = BIN_SECONDS) {
    const start = binStartFor(elapsedSeconds, binSeconds);
    const mapped = elapsedSeconds >= model.coveredReplayRegion.startSeconds && elapsedSeconds <= model.coveredReplayRegion.endSeconds;
    const key = `${mapped ? 'mapped' : 'unmapped'}:${start}`;
    if (!bins.has(key)) {
        bins.set(key, {
            binStartSeconds: start,
            binEndSeconds: start + binSeconds,
            mappingStatus: mapped ? 'mapped' : 'unmapped',
            families: {
                lifecycle: emptyFamily(),
                damage: emptyFamily(),
                healing: emptyFamily(),
                economy: emptyFamily(),
                objective_like: emptyFamily()
            }
        });
    }
    return bins.get(key);
}

function recordFamilyMetric(family, row, delta = 0) {
    family.rowCount += 1;
    family.summedDelta += delta;
    family.absoluteDeltaSum += Math.abs(delta);
    if (row.participantKey) family.participantRefs.add(row.participantKey);
    if (row.entityRef) family.entityRefs.add(row.entityRef);
    family.observedTimes.push(row.elapsedSeconds);
}

export function accumulatePositiveDeltaRows(rows, bins, model, familyName) {
    if (!['damage', 'healing'].includes(familyName)) throw new Error(`unsupported counter family: ${familyName}`);
    for (const row of rows) {
        if (!(row.delta > 0)) continue;
        const family = getBin(bins, model, row.elapsedSeconds).families[familyName];
        recordFamilyMetric(family, row, row.delta);
    }
}

const LIFECYCLE_FIELDS = ['lifeState', 'alive', 'deaths', 'respawnState'];

export function accumulateLifecycleRows(rows, bins, model) {
    const lastByParticipant = new Map();
    for (const row of rows) {
        const previous = lastByParticipant.get(row.participantKey);
        if (previous) {
            const changed = LIFECYCLE_FIELDS.filter(field => !Object.is(previous[field], row[field]));
            if (changed.length) {
                const family = getBin(bins, model, row.elapsedSeconds).families.lifecycle;
                recordFamilyMetric(family, row, changed.length);
                for (const field of changed) {
                    family.transitionTypes.add(field === 'deaths' ? 'death_counter_transition_observed' : `lifecycle_field_transition:${field}`);
                }
            }
        }
        lastByParticipant.set(row.participantKey, Object.fromEntries(LIFECYCLE_FIELDS.map(field => [field, row[field]])));
    }
}

export function accumulateNetWorthRows(rows, bins, model) {
    const lastByParticipant = new Map();
    for (const row of rows) {
        const previous = lastByParticipant.get(row.participantKey);
        if (Number.isFinite(previous) && Number.isFinite(row.value) && previous !== row.value) {
            const delta = row.value - previous;
            const family = getBin(bins, model, row.elapsedSeconds).families.economy;
            recordFamilyMetric(family, row, delta);
        }
        if (Number.isFinite(row.value)) lastByParticipant.set(row.participantKey, row.value);
    }
}

export function accumulateObjectiveRows(rows, bins, model) {
    const lastByEntity = new Map();
    for (const row of rows) {
        const previous = lastByEntity.get(row.entityRef);
        if (previous && Number.isFinite(previous.health) && Number.isFinite(row.health) && previous.health !== row.health) {
            const delta = row.health - previous.health;
            const family = getBin(bins, model, row.elapsedSeconds).families.objective_like;
            recordFamilyMetric(family, row, delta);
            family.transitionTypes.add('objective_like_health_change');
        }
        lastByEntity.set(row.entityRef, { health: row.health, maxHealth: row.maxHealth, teamRef: row.teamRef });
    }
}

export function percentileThreshold(values, percentile = ACTIVITY_PERCENTILE) {
    if (!(percentile > 0 && percentile <= 1)) throw new Error('percentile must be in (0, 1]');
    const nonzero = values.filter(value => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
    if (!nonzero.length) return null;
    const index = Math.max(0, Math.ceil(percentile * nonzero.length) - 1);
    return nonzero[index];
}

function compactFamily(family) {
    return {
        rowCount: family.rowCount,
        summedDelta: round(family.summedDelta, 3),
        absoluteDeltaSum: round(family.absoluteDeltaSum, 3),
        participantRefs: [...family.participantRefs].sort(),
        entityRefs: [...family.entityRefs].sort(),
        transitionTypes: [...family.transitionTypes].sort()
    };
}

const FAMILY_CONFIG = {
    lifecycle: {
        sourceType: 'lifecycle_field_transition',
        provenanceClass: 'derived/replay_observed_lifecycle_field_change',
        limitations: ['Observed lifecycle-related field change; not a confirmed death or gameplay event.'],
        mandatory: true
    },
    damage: {
        sourceType: 'damage_counter_activity',
        provenanceClass: 'derived_metric/aggregate_counter_delta_bin',
        limitations: ['Aggregate positive counter deltas without source-target attribution or gameplay semantics.'],
        mandatory: false
    },
    healing: {
        sourceType: 'healing_counter_activity',
        provenanceClass: 'derived_metric/aggregate_counter_delta_bin',
        limitations: ['Aggregate positive counter deltas without source-target attribution or gameplay semantics.'],
        mandatory: false
    },
    economy: {
        sourceType: 'net_worth_counter_change',
        provenanceClass: 'derived_metric/replay_counter_change_bin',
        limitations: ['Counter change only; not a lead swing, power spike, advantage or fight result.'],
        mandatory: false
    },
    objective_like: {
        sourceType: 'objective_like_state_change',
        provenanceClass: 'derived/replay_observed_objective_like_state_change',
        limitations: ['Raw objective-like entity state change; not destruction, contest, completion or reward.'],
        mandatory: true
    }
};

export function selectSeeds(reviewTargetId, bins, percentile = ACTIVITY_PERCENTILE, validateTarget = assertReviewTargetId) {
    validateTarget(reviewTargetId);
    const mappedBins = [...bins.values()].filter(bin => bin.mappingStatus === 'mapped');
    const thresholds = {
        damage: percentileThreshold(mappedBins.map(bin => bin.families.damage.summedDelta), percentile),
        healing: percentileThreshold(mappedBins.map(bin => bin.families.healing.summedDelta), percentile),
        economy: percentileThreshold(mappedBins.map(bin => bin.families.economy.absoluteDeltaSum), percentile)
    };
    const selected = [];
    const orderedBins = [...bins.values()].sort((a, b) => a.binStartSeconds - b.binStartSeconds || a.mappingStatus.localeCompare(b.mappingStatus));
    for (const bin of orderedBins) {
        for (const familyName of Object.keys(FAMILY_CONFIG)) {
            const config = FAMILY_CONFIG[familyName];
            const family = bin.families[familyName];
            const metric = familyName === 'economy' ? family.absoluteDeltaSum : family.summedDelta;
            const include = config.mandatory ? family.rowCount > 0 : family.rowCount > 0 && thresholds[familyName] !== null && metric >= thresholds[familyName];
            if (!include) continue;
            selected.push({
                reviewTargetId,
                replayElapsedSeconds: Math.min(...family.observedTimes),
                binStartSeconds: bin.binStartSeconds,
                binEndSeconds: bin.binEndSeconds,
                mappingStatus: bin.mappingStatus,
                sourceFamily: familyName,
                sourceType: familyName === 'lifecycle' && family.transitionTypes.size === 1 && family.transitionTypes.has('death_counter_transition_observed')
                    ? 'death_counter_transition_observed'
                    : config.sourceType,
                metrics: compactFamily(family),
                provenanceClass: config.provenanceClass,
                semanticLimitations: config.limitations
            });
        }
    }
    selected.sort((a, b) => a.replayElapsedSeconds - b.replayElapsedSeconds || a.sourceFamily.localeCompare(b.sourceFamily));
    const seeds = selected.map((seed, index) => ({ ...seed, seedId: `${reviewTargetId}_seed_${String(index + 1).padStart(5, '0')}` }));
    return { thresholds, seeds };
}

export function priorityTierForFamilyCount(count) {
    if (count >= 3) return 'high';
    if (count === 2) return 'medium';
    if (count === 1) return 'low';
    throw new Error('candidate window requires at least one source family');
}

function aggregateFamilyMetrics(seeds) {
    const byFamily = new Map();
    for (const seed of seeds) {
        if (!byFamily.has(seed.sourceFamily)) {
            byFamily.set(seed.sourceFamily, { sourceFamily: seed.sourceFamily, seedCount: 0, rowCount: 0, summedDelta: 0, absoluteDeltaSum: 0, participantRefs: new Set(), entityRefs: new Set() });
        }
        const aggregate = byFamily.get(seed.sourceFamily);
        aggregate.seedCount += 1;
        aggregate.rowCount += seed.metrics.rowCount;
        aggregate.summedDelta += seed.metrics.summedDelta;
        aggregate.absoluteDeltaSum += seed.metrics.absoluteDeltaSum;
        for (const ref of seed.metrics.participantRefs) aggregate.participantRefs.add(ref);
        for (const ref of seed.metrics.entityRefs) aggregate.entityRefs.add(ref);
    }
    return [...byFamily.values()].sort((a, b) => a.sourceFamily.localeCompare(b.sourceFamily)).map(item => ({
        sourceFamily: item.sourceFamily,
        seedCount: item.seedCount,
        rowCount: item.rowCount,
        summedDelta: round(item.summedDelta, 3),
        absoluteDeltaSum: round(item.absoluteDeltaSum, 3),
        participantRefCount: item.participantRefs.size,
        entityRefCount: item.entityRefs.size
    }));
}

function paddedBounds(seeds, model, paddingSeconds) {
    return {
        start: Math.max(model.coveredReplayRegion.startSeconds, seeds[0].replayElapsedSeconds - paddingSeconds),
        end: Math.min(model.coveredReplayRegion.endSeconds, seeds.at(-1).replayElapsedSeconds + paddingSeconds)
    };
}

function splitCluster(cluster, model, paddingSeconds, maxWindowSeconds) {
    const parts = [];
    let current = [];
    for (const seed of cluster) {
        const proposed = [...current, seed];
        const bounds = paddedBounds(proposed, model, paddingSeconds);
        if (current.length && bounds.end - bounds.start > maxWindowSeconds) {
            parts.push(current);
            current = [seed];
        } else {
            current = proposed;
        }
    }
    if (current.length) parts.push(current);
    return parts;
}

export function mergeSeedsToWindows(reviewTargetId, seeds, model, options = {}) {
    (options.validateTarget ?? assertReviewTargetId)(reviewTargetId);
    const mergeGapSeconds = options.mergeGapSeconds ?? MERGE_GAP_SECONDS;
    const paddingSeconds = options.paddingSeconds ?? WINDOW_PADDING_SECONDS;
    const maxWindowSeconds = options.maxWindowSeconds ?? MAX_WINDOW_SECONDS;
    const mappedSeeds = seeds.filter(seed => seed.mappingStatus === 'mapped').sort((a, b) => a.replayElapsedSeconds - b.replayElapsedSeconds || a.seedId.localeCompare(b.seedId));
    const clusters = [];
    let cluster = [];
    for (const seed of mappedSeeds) {
        if (cluster.length && seed.replayElapsedSeconds - cluster.at(-1).replayElapsedSeconds > mergeGapSeconds) {
            clusters.push(cluster);
            cluster = [];
        }
        cluster.push(seed);
    }
    if (cluster.length) clusters.push(cluster);
    const parts = clusters.flatMap(item => splitCluster(item, model, paddingSeconds, maxWindowSeconds));
    return parts.map((part, index) => {
        const bounds = paddedBounds(part, model, paddingSeconds);
        const sourceFamilies = [...new Set(part.map(seed => seed.sourceFamily))].sort();
        return {
            candidateWindowId: `${reviewTargetId}_window_${String(index + 1).padStart(4, '0')}`,
            reviewTargetId,
            replayStartSeconds: bounds.start,
            replayEndSeconds: bounds.end,
            replayDurationSeconds: round(bounds.end - bounds.start, 3),
            seedIds: part.map(seed => seed.seedId),
            seedCount: part.length,
            sourceFamilies,
            sourceFamilyCount: sourceFamilies.length,
            priorityTier: priorityTierForFamilyCount(sourceFamilies.length),
            prioritySemantics: 'review_priority_heuristic_not_probability',
            perFamilyMetrics: aggregateFamilyMetrics(part),
            provenance: [...new Set(part.map(seed => seed.provenanceClass))].sort(),
            semanticLimitations: [...new Set(part.flatMap(seed => seed.semanticLimitations))].sort()
        };
    });
}

export function mapWindowToVideo(window, model) {
    const segment = model.segments.find(item => window.replayStartSeconds >= item.replayStartSeconds && window.replayEndSeconds <= item.replayEndSeconds);
    if (!segment) return { mapped: false, reason: 'unreviewable_by_current_sync' };
    const mappedStart = round(segment.slope * window.replayStartSeconds + segment.interceptSeconds, 3);
    const mappedEnd = round(segment.slope * window.replayEndSeconds + segment.interceptSeconds, 3);
    return {
        mapped: true,
        syncSegmentId: segment.segmentId,
        syncEstimatedErrorSeconds: model.estimatedErrorSeconds,
        mappedVodStartSeconds: mappedStart,
        mappedVodEndSeconds: mappedEnd,
        visualEvidenceStartSeconds: round(Math.max(segment.videoStartSeconds, mappedStart - model.estimatedErrorSeconds), 3),
        visualEvidenceEndSeconds: round(Math.min(segment.videoEndSeconds, mappedEnd + model.estimatedErrorSeconds), 3)
    };
}

function frameReference(frame) {
    if (!frame) return null;
    return {
        visualIndexFrameId: frame.visualIndexFrameId,
        replayElapsedSeconds: frame.replayElapsedSeconds,
        mappedVideoTimestampSeconds: frame.mappedVideoTimestampSeconds,
        localFramePath: frame.localFramePath,
        contactSheetId: frame.contactSheetId
    };
}

export function linkVisualNavigation(window, frames, sheets) {
    const targetFrames = frames.filter(frame => frame.reviewTargetId === window.reviewTargetId).sort((a, b) => a.replayElapsedSeconds - b.replayElapsedSeconds);
    const before = [...targetFrames].reverse().find(frame => frame.replayElapsedSeconds <= window.replayStartSeconds) ?? null;
    const inside = targetFrames.filter(frame => frame.replayElapsedSeconds >= window.replayStartSeconds && frame.replayElapsedSeconds <= window.replayEndSeconds);
    const after = targetFrames.find(frame => frame.replayElapsedSeconds >= window.replayEndSeconds) ?? null;
    const sheetIds = [...new Set([before, ...inside, after].filter(Boolean).map(frame => frame.contactSheetId).filter(Boolean))].sort();
    const targetSheets = sheets.filter(sheet => sheet.reviewTargetId === window.reviewTargetId);
    return {
        nearestFrameBefore: frameReference(before),
        coarseFramesInside: inside.map(frameReference),
        nearestFrameAfter: frameReference(after),
        contactSheets: sheetIds.map(id => {
            const sheet = targetSheets.find(item => item.sheetId === id);
            return { contactSheetId: id, localPath: sheet?.localPath ?? null };
        })
    };
}

function unionDuration(windows) {
    const intervals = windows.map(window => [window.replayStartSeconds, window.replayEndSeconds]).sort((a, b) => a[0] - b[0]);
    if (!intervals.length) return 0;
    let total = 0;
    let [start, end] = intervals[0];
    for (const [nextStart, nextEnd] of intervals.slice(1)) {
        if (nextStart <= end) end = Math.max(end, nextEnd);
        else {
            total += end - start;
            [start, end] = [nextStart, nextEnd];
        }
    }
    return total + (end - start);
}

export function percentileValue(values, percentile) {
    if (!values.length) return null;
    const ordered = [...values].sort((a, b) => a - b);
    return ordered[Math.max(0, Math.ceil(percentile * ordered.length) - 1)];
}

async function sha256File(relativePath) {
    const hash = crypto.createHash('sha256');
    for await (const chunk of createReadStream(path.resolve(ROOT, relativePath))) hash.update(chunk);
    return hash.digest('hex');
}

export async function validateTask199ArtifactBridge(target) {
    assertReviewTargetId(target.reviewTargetId);
    const results = [];
    for (const [artifactName, artifact] of Object.entries(target.localArtifacts).sort(([a], [b]) => a.localeCompare(b))) {
        let actualSize = null;
        let actualSha256 = null;
        let status = 'missing';
        try {
            actualSize = (await stat(path.resolve(ROOT, artifact.path))).size;
            actualSha256 = await sha256File(artifact.path);
            status = actualSize === artifact.sizeBytes && actualSha256 === artifact.sha256 ? 'validated' : 'mismatch';
        } catch {
            status = 'missing';
        }
        results.push({ artifactName, path: slash(artifact.path), expectedSizeBytes: artifact.sizeBytes, actualSizeBytes: actualSize, expectedSha256: artifact.sha256, actualSha256, validationStatus: status });
    }
    return { reviewTargetId: target.reviewTargetId, artifactCount: results.length, validatedArtifactCount: results.filter(item => item.validationStatus === 'validated').length, artifacts: results };
}

async function readJson(relativePath) {
    return JSON.parse(await readFile(path.resolve(ROOT, relativePath), 'utf8'));
}

async function streamJsonl(relativePath, onRow) {
    const input = createReadStream(path.resolve(ROOT, relativePath), { encoding: 'utf8' });
    const lines = readline.createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY });
    for await (const line of lines) {
        if (line.trim()) await onRow(JSON.parse(line));
    }
}

async function collectTargetBins(target, model) {
    const bins = createBinStore(model);
    const lifecycleRows = [];
    const netWorthRows = [];
    const objectiveRows = [];
    await streamJsonl(target.localArtifacts.lifeState.path, row => {
        if (row.reviewTargetId !== target.reviewTargetId) throw new Error('cross-target lifecycle row');
        lifecycleRows.push(row);
    });
    accumulateLifecycleRows(lifecycleRows, bins, model);
    await streamJsonl(target.localArtifacts.damage.path, row => {
        if (row.reviewTargetId !== target.reviewTargetId) throw new Error('cross-target damage row');
        accumulatePositiveDeltaRows([row], bins, model, 'damage');
    });
    await streamJsonl(target.localArtifacts.healing.path, row => {
        if (row.reviewTargetId !== target.reviewTargetId) throw new Error('cross-target healing row');
        accumulatePositiveDeltaRows([row], bins, model, 'healing');
    });
    await streamJsonl(target.localArtifacts.netWorth.path, row => {
        if (row.reviewTargetId !== target.reviewTargetId) throw new Error('cross-target net-worth row');
        netWorthRows.push(row);
    });
    accumulateNetWorthRows(netWorthRows, bins, model);
    await streamJsonl(target.localArtifacts.objectives.path, row => {
        if (row.reviewTargetId !== target.reviewTargetId) throw new Error('cross-target objective-like row');
        objectiveRows.push(row);
    });
    accumulateObjectiveRows(objectiveRows, bins, model);
    return bins;
}

function serializeBins(reviewTargetId, bins) {
    return {
        schemaVersion: 1,
        reviewTargetId,
        binSeconds: BIN_SECONDS,
        bins: [...bins.values()].sort((a, b) => a.binStartSeconds - b.binStartSeconds || a.mappingStatus.localeCompare(b.mappingStatus)).map(bin => ({
            binStartSeconds: bin.binStartSeconds,
            binEndSeconds: bin.binEndSeconds,
            mappingStatus: bin.mappingStatus,
            families: Object.fromEntries(Object.entries(bin.families).map(([name, family]) => [name, compactFamily(family)]))
        }))
    };
}

function countBy(values, selector) {
    const counts = {};
    for (const value of values) {
        const key = String(selector(value));
        counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
}

function targetMetrics(reviewTargetId, bins, seeds, windows, model) {
    const mappedSeeds = seeds.filter(seed => seed.mappingStatus === 'mapped');
    const unmappedSeeds = seeds.filter(seed => seed.mappingStatus !== 'mapped');
    const durations = windows.map(window => window.replayDurationSeconds);
    const coveredDuration = model.coveredReplayRegion.endSeconds - model.coveredReplayRegion.startSeconds;
    const linkedFrames = new Set();
    const sheets = new Set();
    for (const window of windows) {
        for (const ref of [window.visualNavigation.nearestFrameBefore, ...window.visualNavigation.coarseFramesInside, window.visualNavigation.nearestFrameAfter].filter(Boolean)) linkedFrames.add(ref.visualIndexFrameId);
        for (const sheet of window.visualNavigation.contactSheets) sheets.add(sheet.contactSheetId);
    }
    return {
        reviewTargetId,
        coveredReplaySeconds: coveredDuration,
        binsAnalyzed: [...bins.values()].filter(bin => bin.mappingStatus === 'mapped').length,
        seedsByFamily: countBy(seeds, seed => seed.sourceFamily),
        task197Seeds: 0,
        manualSeeds: 0,
        totalSeeds: seeds.length,
        seedsMerged: mappedSeeds.length,
        candidateWindows: windows.length,
        windowsBySourceFamilyCount: countBy(windows, window => window.sourceFamilyCount),
        windowsByPriorityTier: countBy(windows, window => window.priorityTier),
        medianWindowDurationSeconds: percentileValue(durations, 0.5),
        p90WindowDurationSeconds: percentileValue(durations, 0.9),
        candidateCoverageSeconds: round(unionDuration(windows), 3),
        candidateCoverageFraction: coveredDuration ? round(unionDuration(windows) / coveredDuration, 6) : 0,
        mappedSeeds: mappedSeeds.length,
        unmappedSeeds: unmappedSeeds.length,
        unmappedSeedIds: unmappedSeeds.map(seed => seed.seedId),
        linkedCoarseFrames: linkedFrames.size,
        contactSheetsReferenced: sheets.size
    };
}

async function writeDeterministic(relativePath, value) {
    const absolute = path.resolve(ROOT, relativePath);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, deterministicJson(value));
}

async function main() {
    const telemetryManifest = await readJson(TELEMETRY_MANIFEST);
    const availability = await readJson(TELEMETRY_AVAILABILITY);
    const mapping = await readJson(SYNC_MAPPING);
    const frameIndex = await readJson(VISUAL_FRAME_INDEX);
    const contactSheetIndex = await readJson(CONTACT_SHEET_INDEX);
    const sheets = contactSheetIndex.targets.flatMap(target => target.sheets);
    const bridges = [];
    for (const target of telemetryManifest.targets) bridges.push(await validateTask199ArtifactBridge(target));
    const bridgeValid = bridges.every(bridge => bridge.validatedArtifactCount === bridge.artifactCount);
    if (!bridgeValid) {
        await writeDeterministic(`${OUTPUT_ROOT}/gate.json`, { schemaVersion: 1, technicalGateStatus: BLOCKED_GATE, workAcceptanceStatus: 'pending_independent_validation', reasons: ['One or more required local Task 199 artifacts are missing or fail the recorded hash/size bridge.'] });
        throw new Error(BLOCKED_GATE);
    }

    const allWindows = [];
    const targetResults = [];
    const localArtifacts = [];
    for (const targetId of TARGET_IDS) {
        assertReviewTargetId(targetId);
        const target = telemetryManifest.targets.find(item => item.reviewTargetId === targetId);
        const model = mapping.models.find(item => item.reviewTargetId === targetId);
        if (!target || !model) throw new Error(`missing accepted input for ${targetId}`);
        const bins = await collectTargetBins(target, model);
        const { thresholds, seeds } = selectSeeds(targetId, bins);
        const rawWindows = mergeSeedsToWindows(targetId, seeds, model);
        const windows = rawWindows.map(window => ({
            ...window,
            videoMapping: mapWindowToVideo(window, model),
            visualNavigation: linkVisualNavigation(window, frameIndex.frames, sheets),
            notProbability: true
        }));
        const localDir = `${LOCAL_ROOT}/${targetId}`;
        const binsPath = `${localDir}/bins.json`;
        const seedsPath = `${localDir}/seeds.json`;
        await writeDeterministic(binsPath, serializeBins(targetId, bins));
        await writeDeterministic(seedsPath, { schemaVersion: 1, reviewTargetId: targetId, seeds });
        localArtifacts.push({ reviewTargetId: targetId, bins: { path: binsPath, sha256: await sha256File(binsPath), sizeBytes: (await stat(path.resolve(ROOT, binsPath))).size }, seeds: { path: seedsPath, sha256: await sha256File(seedsPath), sizeBytes: (await stat(path.resolve(ROOT, seedsPath))).size } });
        const metrics = targetMetrics(targetId, bins, seeds, windows, model);
        targetResults.push({ reviewTargetId: targetId, thresholds: { percentile: ACTIVITY_PERCENTILE, ...thresholds }, metrics, availableSourceFamilies: Object.keys(metrics.seedsByFamily).sort() });
        allWindows.push(...windows);
    }

    const aggregateCoverage = targetResults.reduce((sum, target) => sum + target.metrics.candidateCoverageSeconds, 0);
    const aggregateCovered = targetResults.reduce((sum, target) => sum + target.metrics.coveredReplaySeconds, 0);
    const aggregateCoverageFraction = aggregateCovered ? round(aggregateCoverage / aggregateCovered, 6) : 0;
    const lowSelectivity = aggregateCoverageFraction > LOW_SELECTIVITY_FRACTION || targetResults.some(target => target.metrics.candidateCoverageFraction > LOW_SELECTIVITY_FRACTION);
    const multipleFamilies = targetResults.every(target => target.availableSourceFamilies.length >= 2);
    const bothUsable = targetResults.every(target => target.metrics.candidateWindows > 0);
    const technicalGateStatus = !multipleFamilies || !bothUsable ? PARTIAL_GATE : lowSelectivity ? LOW_SELECTIVITY_GATE : POSITIVE_GATE;
    const counts = {
        targetsAttempted: TARGET_IDS.length,
        targetsUsable: targetResults.filter(target => target.metrics.candidateWindows > 0).length,
        totalWindows: allWindows.length,
        totalSeeds: targetResults.reduce((sum, target) => sum + target.metrics.totalSeeds, 0),
        protectedReplayAccessCount: 0,
        replayAccessCount: 0,
        vodAccessCount: 0,
        gameplayInterpretationsProduced: 0,
        finalFactsProduced: 0,
        attributionProduced: 0
    };

    const manifest = {
        schemaVersion: 1,
        artifactClass: 'two_match_review_candidate_window_manifest',
        generatedAtLogical: 'task_202',
        generatedBy: 'tools/emit-review-candidate-windows.mjs',
        inputs: { telemetryManifest: TELEMETRY_MANIFEST, telemetryAvailability: TELEMETRY_AVAILABILITY, syncMapping: SYNC_MAPPING, visualFrameIndex: VISUAL_FRAME_INDEX, contactSheetIndex: CONTACT_SHEET_INDEX },
        task199HashBridge: bridges,
        localArtifacts,
        policy: { binSeconds: BIN_SECONDS, activityPercentile: ACTIVITY_PERCENTILE, mergeGapSeconds: MERGE_GAP_SECONDS, paddingSeconds: WINDOW_PADDING_SECONDS, maximumWindowSeconds: MAX_WINDOW_SECONDS, lowSelectivityFraction: LOW_SELECTIVITY_FRACTION, thresholdRevisionCount: 0 },
        task197SignalStatus: 'task197_signal_unavailable_for_review_targets'
    };
    const signalAvailability = {
        schemaVersion: 1,
        targets: targetResults.map(target => ({ reviewTargetId: target.reviewTargetId, sourceFamilies: target.availableSourceFamilies, thresholds: target.thresholds, positionStatus: 'unavailable_non_blocking', task197SignalStatus: 'task197_signal_unavailable_for_review_targets', manualSeedStatus: 'no_explicit_timestamps_supplied' }))
    };
    const candidateWindows = { schemaVersion: 1, artifactClass: 'review_attention_region_candidates', candidateSemantics: 'review_attention_region_not_gameplay_event', notProbability: true, windowCount: allWindows.length, windows: allWindows };
    const coverage = { schemaVersion: 1, targets: targetResults.map(target => target.metrics), aggregate: { synchronizedReplayCoverageSeconds: aggregateCovered, candidateCoverageSeconds: round(aggregateCoverage, 3), candidateCoverageFraction: aggregateCoverageFraction, lowSelectivityObserved: lowSelectivity } };
    const summary = { schemaVersion: 1, technicalGateStatus, counts, targets: targetResults, aggregateCandidateCoverageFraction: aggregateCoverageFraction, thresholdRevisionCount: 0 };
    const gate = { schemaVersion: 1, technicalGateStatus, workAcceptanceStatus: 'pending_independent_validation', reasons: [lowSelectivity ? 'Candidate windows exceed the declared operational selectivity warning fraction.' : 'Candidate windows reduce both synchronized timelines without exceeding the declared warning fraction.', 'All candidate windows remain review attention regions rather than gameplay-event claims.'] };
    const provenance = { schemaVersion: 1, factualInputs: ['Task 199 local artifact bytes revalidated against committed hashes', 'Task 200 accepted covered mapping', 'Task 201 frame/contact-sheet metadata'], derivedOutputs: ['5-second factual signal bins', 'percentile activity seeds', 'merged padded candidate windows', 'review priority tiers'], semanticPromotions: [], task197SignalStatus: 'task197_signal_unavailable_for_review_targets', manualSeedsUsed: 0, ...counts };
    const outputs = { 'manifest.json': manifest, 'signal-availability.json': signalAvailability, 'candidate-windows.json': candidateWindows, 'coverage.json': coverage, 'summary.json': summary, 'gate.json': gate, 'provenance-audit.json': provenance };
    for (const [name, value] of Object.entries(outputs)) await writeDeterministic(`${OUTPUT_ROOT}/${name}`, value);
    process.stdout.write(`${deterministicJson({ technicalGateStatus, counts, aggregateCandidateCoverageFraction: aggregateCoverageFraction, targets: targetResults.map(target => ({ reviewTargetId: target.reviewTargetId, thresholds: target.thresholds, metrics: target.metrics })) })}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch(error => {
        console.error(error.stack ?? error.message);
        process.exitCode = 1;
    });
}
