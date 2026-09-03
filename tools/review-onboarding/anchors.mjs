import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, TARGETS, sha256File } from './inputs.mjs';
import { sha256 } from './timeline.mjs';

// Calibrate the parser/raw-state origin from observed transitions ONLY, without
// VOD values, fitting labels, game identities or assumptions about a match clock.
export function calibrateRawOrigin(rows) {
    const transitions = [];
    for (let i = 1; i < rows.length; i++) {
        const previous = rows[i - 1], row = rows[i], a = previous.values, b = row.values;
        let rawSeconds = null, field = null;
        if (b.m_nPauseStartTick > 0 && b.m_nPauseStartTick !== a.m_nPauseStartTick) {
            rawSeconds = b.m_nPauseStartTick / row.tickRate; field = 'm_nPauseStartTick';
        } else if (!b.m_bGamePaused && b.m_nTotalPausedTicks !== a.m_nTotalPausedTicks) {
            rawSeconds = b.m_nMatchClockUpdateTick / row.tickRate; field = 'm_nMatchClockUpdateTick';
        } else if (b.m_eGameState !== a.m_eGameState) {
            rawSeconds = b.m_flGameStateStartTime + b.m_nTotalPausedTicks / row.tickRate; field = 'm_flGameStateStartTime_plus_completed_paused_ticks';
        }
        if (Number.isFinite(rawSeconds)) transitions.push({ sourceField: field, observedReplayInterval: { startExclusive: previous.elapsedSeconds, endInclusive: row.elapsedSeconds }, rawSeconds,
            originInterval: { lower: rawSeconds - row.elapsedSeconds, upper: rawSeconds - previous.elapsedSeconds } });
    }
    if (transitions.length < 2) throw new Error('raw_clock_origin_not_independently_supported');
    const lower = Math.max(...transitions.map(t => t.originInterval.lower)), upper = Math.min(...transitions.map(t => t.originInterval.upper));
    if (lower > upper) throw new Error('raw_clock_origin_inconsistent');
    return { seconds: (lower + upper) / 2, uncertaintySeconds: (upper - lower) / 2, lower, upper, transitions, method: 'intersection_of_1Hz_observed_transition_intervals_no_VOD_input' };
}
export function replayCoordinateFromTimer(rows, origin, displayedSeconds) {
    const possible = new Map();
    for (const row of rows) {
        const v = row.values;
        if (v.m_bGamePaused || v.m_eGameState !== 7) continue;
        const replay = displayedSeconds + 0.5 + v.m_flGameStartTime + v.m_nTotalPausedTicks / row.tickRate - origin.seconds;
        if (Math.abs(replay - row.elapsedSeconds) <= 0.5) possible.set(replay, { replayElapsedSeconds: replay, rawStateSample: row.elapsedSeconds, gameStartFieldSeconds: v.m_flGameStartTime, completedPausedTicks: v.m_nTotalPausedTicks, tickRate: row.tickRate });
    }
    if (possible.size !== 1) throw new Error('visual_timer_cross_surface_coordinate_not_unique');
    return [...possible.values()][0];
}
export async function prepareAnchors() {
    const planBytes = await readFile(path.join(ROOT, 'tools/review-onboarding/anchor-plan.json'));
    const visualBytes = await readFile(path.join(ROOT, 'tools/review-onboarding/visual-observations.json'));
    const plan = JSON.parse(planBytes), visual = JSON.parse(visualBytes);
    const targets = [];
    for (const reviewTargetId of TARGETS) {
        const dir = path.join(ROOT, '.local/deadem/review-sync', reviewTargetId, 'task211');
        const rawPath = path.join(dir, 'raw-temporal-state.json');
        const raw = JSON.parse(await readFile(rawPath));
        const origin = calibrateRawOrigin(raw.rows);
        const observation = visual.targets.find(t => t.reviewTargetId === reviewTargetId);
        const timing = JSON.parse(await readFile(path.join(dir, 'replay-timing-observations.json')));
        const anchors = [];
        for (const planned of plan.targets.find(t => t.reviewTargetId === reviewTargetId).anchors) {
            const vodTimeSeconds = observation.replacement?.originalVodSeconds === planned.vodTimeSeconds ? observation.replacement.replacementVodSeconds : planned.vodTimeSeconds;
            const v = observation.rows.find(r => r.vodTimeSeconds === vodTimeSeconds);
            if (!v) throw new Error('missing_visual_observation');
            const coordinate = replayCoordinateFromTimer(raw.rows, origin, v.displayedTimerSeconds);
            const frame = path.join(dir, 'frames', `vod-${vodTimeSeconds.toFixed(3)}.jpg`);
            const counters = timing[Math.round(coordinate.replayElapsedSeconds)].teamCounters.filter(t => t.teamRef === 2 || t.teamRef === 3).map(t => t.netWorth / 1000).sort((a, b) => a - b);
            const observed = [...v.roundedTeamCountersThousands].sort((a, b) => a - b);
            anchors.push({ ...planned, vodTimeSeconds, ...coordinate,
                // 0.5s display quantization, calibrated origin interval, plus 0.5s
                // conservative UI refresh latency; no sub-frame accuracy claim.
                uncertaintySeconds: 1 + origin.uncertaintySeconds,
                displayedTimerSeconds: v.displayedTimerSeconds,
                evidence: { replay: 'raw_temporal_state_with_independently_calibrated_parser_origin', vod: 'independently_inspected_decoded_frame_timer', frameSha256: await sha256File(frame),
                    localFrameRef: path.relative(ROOT, frame).replaceAll('\\', '/'), rawTemporalStateSha256: await sha256File(rawPath),
                    roundedCounterSanity: { replayThousands: counters, visualThousands: observed, maxDifferenceThousands: Math.max(...counters.map((n, i) => Math.abs(n - observed[i]))), usage: 'coarse_sanity_only_not_fit_input_or_identity' } } });
        }
        const result = { reviewTargetId, origin, anchors, planSha256: sha256(planBytes), visualObservationSha256: sha256(visualBytes), replacement: observation.replacement ?? null,
            limitations: ['Visual timer is only a cross-surface timing cue; replay elapsed is not promoted to displayed game clock.', 'Origin calibration uses 1Hz transition intervals; timer quantization and UI refresh uncertainty remain explicit.', 'Rounded HUD counters are only a coarse non-identifying sanity check.'] };
        await writeFile(path.join(dir, 'anchors.json'), JSON.stringify(result, null, 2) + '\n');
        targets.push(result);
    }
    return targets;
}
