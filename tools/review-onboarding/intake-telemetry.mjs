import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { processFactualTarget, deterministicJson } from '../emit-minimum-factual-review-telemetry.mjs';
import { ROOT, OUTPUT, TARGETS, assertTarget, resolveInput, readHeader, sha256File } from './inputs.mjs';

const json = async (file, value) => { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, deterministicJson(value)); };
export async function intakeTelemetry() {
    const manifest = [], summaries = [], availability = [];
    for (const reviewTargetId of TARGETS) {
        const syncDir = path.join(ROOT, '.local/deadem/review-sync', reviewTargetId, 'task211');
        const inputs = {};
        for (const kind of ['replay', 'video']) {
            const resolved = await resolveInput(reviewTargetId, kind);
            inputs[kind] = { ...resolved, localPath: resolved.file, sha256: await sha256File(resolved.file) };
            if (kind === 'replay') inputs[kind].header = await readHeader(resolved.file, resolved.sizeBytes);
            else {
                const meta = JSON.parse(execFileSync(path.join(ROOT, '.venv-video/Scripts/python.exe'), ['-B', 'tools/review-onboarding/media.py', '--target', reviewTargetId], { cwd: ROOT, windowsHide: true, encoding: 'utf8' }));
                if (!(meta.durationSeconds > 0) || meta.videoStreamCount !== 1) throw new Error('invalid_video_container');
                inputs[kind].durationSeconds = meta.durationSeconds;
            }
        }
        await json(path.join(syncDir, 'private-intake.json'), { reviewTargetId, inputs });
        manifest.push({ reviewTargetId, provenanceClass: 'factual/local_file_identity', association: 'explicit_target_directory',
            replay: { filenamePseudonym: `${reviewTargetId}.dem`, sizeBytes: inputs.replay.sizeBytes, sha256: inputs.replay.sha256, header: inputs.replay.header },
            video: { filenamePseudonym: `${reviewTargetId}.mp4`, sizeBytes: inputs.video.sizeBytes, sha256: inputs.video.sha256, durationSeconds: inputs.video.durationSeconds, status: 'valid_video_container' },
            identityMetadata: { matchId: null, build: null, date: null, playerNames: null, namedTeams: null, result: null, status: 'not_established_by_minimum_intake' } });
        const clockRows = [];
        const started = performance.now();
        process.stdout.write(`${reviewTargetId}: identities and header validated; forward-only sampling\n`);
        const summary = await processFactualTarget({ reviewTargetId, inputs }, { targetValidator: assertTarget, onSample: ({ player, elapsedSeconds, sourceTick, rows }) => {
            const demo = player.getDemo();
            const rules = demo.getEntitiesByClassName('CCitadelGameRulesProxy');
            const fields = ['m_pGameRules.m_flGameStartTime', 'm_pGameRules.m_flGameTime', 'm_pGameRules.m_bGamePaused', 'm_pGameRules.m_flPauseStartTime', 'm_pGameRules.m_flTotalPauseTime', 'm_pGameRules.m_nGameState'];
            const values = Object.fromEntries(fields.map(field => { const value = rules[0]?.getField?.(field); return [field, typeof value === 'number' || typeof value === 'boolean' ? value : null]; }));
            clockRows.push({ elapsedSeconds, sourceTick, values, teamCounters: [...new Set(rows.map(r => r.teamRef))].filter(r => r !== null).map(teamRef => ({ teamRef, netWorth: rows.filter(r => r.teamRef === teamRef && Number.isFinite(r.netWorth)).reduce((sum, r) => sum + r.netWorth, 0) })), provenanceClass: 'factual/replay_observed_state' });
            if (elapsedSeconds % 600 === 0) process.stdout.write(`${reviewTargetId}: replay elapsed ${elapsedSeconds}\n`);
            if (elapsedSeconds === 60) process.stdout.write(JSON.stringify({ ruleClasses: demo.getClasses().filter(c => /GameRules/iu.test(c.name ?? c.className ?? '')).map(c => ({ name: c.name, className: c.className })), rulesCount: rules.length, ruleObjectKeys: rules[0] ? Object.keys(rules[0]) : [], rulePrototypeKeys: rules[0] ? Object.getOwnPropertyNames(Object.getPrototypeOf(rules[0])) : [] }) + '\n');
        } });
        await json(path.join(syncDir, 'replay-timing-observations.json'), clockRows);
        await json(path.join(syncDir, 'private-telemetry-summary.json'), { ...summary, processingTimeSeconds: (performance.now() - started) / 1000 });
        summaries.push({ reviewTargetId, processingStatus: summary.processingStatus, parser: summary.parser, replayCoverage: summary.normalizedTimeCoverage,
            sampleCount: summary.counts.time, gapCount: summary.normalizedTimeCoverage.gaps.length, counts: { ...summary.counts, participantLocalRefCount: summary.counts.participants },
            unavailableFamilies: summary.unavailableFamilies, warnings: summary.warnings, localArtifactIdentities: summary.localArtifacts, analystInference: [] });
        availability.push({ reviewTargetId, availability: summary.availability });
        process.stdout.write(JSON.stringify({ reviewTargetId, parser: summary.parser, coverage: summary.normalizedTimeCoverage, counts: summary.counts }) + '\n');
    }
    await json(path.join(ROOT, OUTPUT, 'manifest.json'), { schemaVersion: 1, taskId: '211', targets: manifest });
    await json(path.join(ROOT, OUTPUT, 'telemetry-summary.json'), { schemaVersion: 1, taskId: '211', sampling: 'deadem.Player.forward_only_1Hz_replay_elapsed', targets: summaries });
    await json(path.join(ROOT, OUTPUT, 'availability.json'), { schemaVersion: 1, targets: availability });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    intakeTelemetry().catch(error => { console.error(error); process.exitCode = 1; });
}
