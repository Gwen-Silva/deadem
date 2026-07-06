import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
    buildDecisionMatrix,
    buildExternalOracleComparison,
    buildOracleReplayResults,
    validateOutputRoots,
    validateReplayInput
} from '../tools/evaluate-external-parser-oracle-canaries.mjs';

const OUTPUT_ROOT = 'output/local-replay-processing/external-parser-oracle-canaries';

async function readOutput(name) {
    return JSON.parse(await readFile(`${OUTPUT_ROOT}/${name}`, 'utf8'));
}

function syntheticInventory(overrides = {}) {
    return {
        schemaVersion: 1,
        parsers: [
            {
                id: 'clarity',
                name: 'skadistats/clarity',
                deadlockSupportStatus: 'found',
                cloneAvailability: 'available_task123_local_clone',
                blocker: 'blocked_by_no_minimal_oracle_entrypoint',
                canaryExecutionAttempted: false,
                commandProbe: { logPathLocalOnly: '.local/deadem/cache/local-replay-processing/external-parser-oracle-canaries/logs/clarity.log' }
            },
            {
                id: 'manta',
                name: 'dotabuff/manta',
                deadlockSupportStatus: 'not_found',
                cloneAvailability: 'available_task123_local_clone',
                blocker: 'blocked_by_game_support',
                canaryExecutionAttempted: false
            },
            {
                id: 'demoparser',
                name: 'LaihoE/demoparser',
                deadlockSupportStatus: 'not_found',
                cloneAvailability: 'available_task123_local_clone',
                blocker: 'blocked_by_game_support',
                canaryExecutionAttempted: false
            },
            {
                id: 'demoinfocs-golang',
                name: 'markus-wa/demoinfocs-golang',
                deadlockSupportStatus: 'not_found',
                cloneAvailability: 'available_task123_local_clone',
                blocker: 'blocked_by_game_support',
                canaryExecutionAttempted: false
            }
        ],
        ...overrides
    };
}

test('path guards allow only replay 010 and replay 011 canaries', () => {
    assert.doesNotThrow(() => validateReplayInput('.local/deadem/replays/inbox/partida_010.dem', 'replay_010'));
    assert.doesNotThrow(() => validateReplayInput('.local/deadem/replays/inbox/partida_011.dem', 'replay_011'));

    assert.throws(() => validateReplayInput('.local/deadem/replays/inbox/partida_005.dem', 'replay_010'), /protected replay path/);
    assert.throws(() => validateReplayInput('.local/deadem/replays/inbox/partida_006.dem', 'replay_010'), /bot fixture path/);
    assert.throws(() => validateReplayInput('.local/deadem/replays/inbox/partida_012.dem', 'replay_011'), /candidate outside canary scope/);
    assert.throws(() => validateReplayInput('samples/partida_010.dem', 'replay_010'), /samples path is forbidden/);
    assert.throws(() => validateReplayInput('output/replays/partida_011.dem', 'replay_011'), /output\/replays path is forbidden/);
    assert.throws(() => validateReplayInput('.local/deadem/replays/inbox/partida_011.dem', 'replay_010'), /replay_010 input must/);
});

test('output roots are fixed to local-only cache and compact summary output', () => {
    assert.doesNotThrow(() => validateOutputRoots(
        '.local/deadem/cache/local-replay-processing/external-parser-oracle-canaries/',
        'output/local-replay-processing/external-parser-oracle-canaries/'
    ));
    assert.throws(() => validateOutputRoots(
        '.local/deadem/cache/local-replay-processing/external-parser-oracle-canaries/',
        'output/replays/external-parser-oracle-canaries/'
    ), /output\/replays path is forbidden/);
    assert.throws(() => validateOutputRoots(
        '.local/deadem/cache/local-replay-processing/other/',
        'output/local-replay-processing/external-parser-oracle-canaries/'
    ), /local output root/);
});

test('oracle replay results report cannot-run status without claiming external contradiction', () => {
    const inventory = syntheticInventory();
    const replay010 = buildOracleReplayResults(inventory, 'replay_010');
    const replay011 = buildOracleReplayResults(inventory, 'replay_011');
    const comparison = buildExternalOracleComparison(replay010, replay011, inventory);

    assert.equal(replay010.localParserFailureReference, 'Unable to find an entity with index [ 2905 ]');
    assert.equal(replay011.localParserFailureReference, 'Unable to find an entity with index [ 5624 ]');
    assert.equal(replay010.results.length, 4);
    assert.equal(replay010.results[0].status, 'cannot_run');
    assert.equal(comparison.anyExternalParserContradictsLocalParserBehavior, false);
    assert.equal(comparison.noPracticalOracleCurrentlyAvailable, true);
});

test('decision matrix recommends manual external setup when clarity supports Deadlock but cannot run', () => {
    const inventory = syntheticInventory();
    const replay010 = buildOracleReplayResults(inventory, 'replay_010');
    const replay011 = buildOracleReplayResults(inventory, 'replay_011');
    const comparison = buildExternalOracleComparison(replay010, replay011, inventory);
    const decision = buildDecisionMatrix({ inventory, comparison });

    assert.equal(decision.oracle_unavailable, true);
    assert.equal(decision.oracle_game_support_blocked, true);
    assert.equal(decision.needs_manual_external_setup, true);
    assert.equal(decision.recommendedNextAction, 'manual_external_oracle_setup_needed');
});

test('summary outputs are compact oracle feasibility artifacts without raw or canonical data', async () => {
    const identities = await readOutput('input-identities.json');
    const inventory = await readOutput('oracle-feasibility-inventory.json');
    const replay010 = await readOutput('replay-010-oracle-results.json');
    const replay011 = await readOutput('replay-011-oracle-results.json');
    const comparison = await readOutput('external-oracle-comparison.json');
    const task123 = await readOutput('task123-comparison.json');
    const decision = await readOutput('decision-matrix.json');
    const recommendation = await readOutput('recommended-next-action.json');
    const protection = await readOutput('protection-audit.json');
    const branch = await readOutput('replay-specific-branch-audit.json');
    const gate = await readOutput('oracle-gate.json');

    assert.equal(identities.rawBytesCommitted, false);
    assert.equal(identities.inputs.length, 2);
    assert.equal(inventory.parsers.length, 4);
    assert.equal(inventory.noExternalSourceCommitted, true);
    assert.equal(inventory.fullLogsLocalOnly, true);
    assert.equal(replay010.localParserFailureReference, 'Unable to find an entity with index [ 2905 ]');
    assert.equal(replay011.localParserFailureReference, 'Unable to find an entity with index [ 5624 ]');
    assert.equal(typeof comparison.noPracticalOracleCurrentlyAvailable, 'boolean');
    assert.equal(task123.task124FollowedRecommendation, true);
    assert.ok([
        'manual_external_oracle_setup_needed',
        'external_oracle_blocked_by_support',
        'external_oracle_inconclusive'
    ].includes(decision.recommendedNextAction));
    assert.equal(recommendation.noTask125Created, true);
    assert.equal(protection.replay005Accessed, false);
    assert.equal(protection.candidates012To020Accessed, false);
    assert.equal(protection.rawEntityDataCommitted, false);
    assert.equal(protection.externalSourceTreeCommitted, false);
    assert.equal(branch.parserOrEngineFilesModified, false);
    assert.equal(gate.parserDefaultBehaviorChanged, false);
    assert.equal(gate.recoveryAddedOrPromoted, false);
    assert.equal(gate.canonicalFactsProduced, false);
    assert.equal(gate.task125Created, false);
    assert.ok(existsSync('reports/external-parser-oracle-canaries.md'));
});
