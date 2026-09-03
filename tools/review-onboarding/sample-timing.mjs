import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Player, Logger } from 'deadem';
import { TARGETS, ROOT, resolveInput } from './inputs.mjs';

// Supplemental pass reads only temporal fields missing from the legacy sampler.
// No factual family is regenerated and no observed timer becomes a gameplay fact.
const fields = ['m_nTotalPausedTicks', 'm_nPauseStartTick', 'm_bGamePaused', 'm_fLevelStartTime', 'm_flGameStartTime', 'm_flGameStateStartTime', 'm_flRoundStartTime', 'm_eGameState', 'm_nMatchClockUpdateTick', 'm_bServerPaused', 'm_fUnpauseRawTime'];
for (const reviewTargetId of TARGETS) {
    const input = await resolveInput(reviewTargetId, 'replay');
    const player = new Player(undefined, Logger.NOOP);
    const rows = [];
    try {
        await player.load(createReadStream(input.file));
        const tickRate = player.getDemo().server.tickRate;
        let next = 0;
        while (player.getCurrentTick() <= player.getLastTick()) {
            const tick = player.getCurrentTick();
            if (tick >= next * tickRate) {
                const rules = player.getDemo().getEntitiesByClassName('CCitadelGameRulesProxy')[0];
                rows.push({ elapsedSeconds: next, sourceTick: tick, tickRate, values: Object.fromEntries(fields.map(f => { const value = rules?.getField(`m_pGameRules.${f}`); return [f, typeof value === 'number' || typeof value === 'boolean' ? value : null]; })), provenanceClass: 'factual/replay_observed_state' });
                if (next % 900 === 0) console.log(reviewTargetId, next);
                next++;
            }
            if (!await player.nextTick()) break;
        }
    } finally { await player.dispose(); }
    const dir = path.join(ROOT, '.local/deadem/review-sync', reviewTargetId, 'task211');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'raw-temporal-state.json'), JSON.stringify({ reviewTargetId, fields, rows }, null, 2) + '\n');
    console.log(JSON.stringify({ reviewTargetId, samples: rows.length, first: rows[0], last: rows.at(-1) }));
}
