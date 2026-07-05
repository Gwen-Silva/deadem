import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync } from 'node:fs';
import { ParserConfiguration, EntityOperation } from 'deadem';
import {
    recoverMissingClassBaseline,
    recoverMissingEntityReference
} from '../packages/engine/src/handlers/DemoMessageHandler.js';
import {
    auditImplementationSources,
    decideGate,
    summarizeRecoveryWarnings,
    validateInputPath,
    validateOutputRoots
} from '../tools/evaluate-missing-entity-recovery-canary.mjs';

function fakeBitBuffer() {
    return {
        movedTo: null,
        move(bits) {
            this.movedTo = bits;
        }
    };
}

test('default recovery config is disabled', () => {
    const configuration = new ParserConfiguration({});
    assert.equal(configuration.recovery, null);
    assert.deepEqual(configuration.recoveryWarnings, []);
});

test('explicit recovery config is required', () => {
    const configuration = new ParserConfiguration({
        recovery: {
            allowUnresolvedEntityReference: true,
            allowMissingClassBaseline: false
        }
    });
    assert.equal(configuration.recovery.allowUnresolvedEntityReference, true);
    assert.equal(configuration.recovery.allowMissingClassBaseline, false);
});

test('parser configuration accepts recovery option only in allowed shape', () => {
    assert.throws(() => new ParserConfiguration({ recovery: { unsafe: true } }), /unsupported keys/);
    assert.throws(() => new ParserConfiguration({ recovery: true }), /object or null/);
    assert.throws(() => new ParserConfiguration({ recovery: { allowUnresolvedEntityReference: 'yes' } }), /must be a boolean/);
});

test('recovery warnings can be recorded', () => {
    const configuration = new ParserConfiguration({ recovery: { allowUnresolvedEntityReference: true } });
    configuration.recovery.recordUnresolvedEntityReference({ operation: 'UPDATE', recoverable: true });
    assert.equal(configuration.recoveryWarnings.length, 1);
    assert.equal(configuration.recoveryWarnings[0].type, 'unresolved_entity_reference');
});

test('missing entity update with payload size can be skipped only in recovery mode', () => {
    const bitBuffer = fakeBitBuffer();
    const context = {
        operation: EntityOperation.UPDATE,
        index: 2905,
        bitBuffer,
        payloadBits: 32,
        loop: 1,
        registryState: 'missing'
    };
    assert.equal(recoverMissingEntityReference(null, context), false);
    const configuration = new ParserConfiguration({ recovery: { allowUnresolvedEntityReference: true } });
    assert.equal(recoverMissingEntityReference(configuration.recovery, context), true);
    assert.equal(bitBuffer.movedTo, 32);
    assert.equal(configuration.recoveryWarnings[0].recoveryAction, 'skipped_invalid_update_payload');
});

test('missing entity update without payload size fails closed', () => {
    const configuration = new ParserConfiguration({ recovery: { allowUnresolvedEntityReference: true } });
    const context = {
        operation: EntityOperation.UPDATE,
        index: 2905,
        bitBuffer: fakeBitBuffer(),
        payloadBits: null,
        loop: 1,
        registryState: 'missing'
    };
    assert.equal(recoverMissingEntityReference(configuration.recovery, context), false);
    assert.equal(configuration.recoveryWarnings[0].reason, 'missing_payload_size');
});

test('missing entity leave and delete can be ignored only in recovery mode', () => {
    const configuration = new ParserConfiguration({ recovery: { allowUnresolvedEntityReference: true } });
    for (const operation of [EntityOperation.LEAVE, EntityOperation.DELETE]) {
        const context = {
            operation,
            index: 2905,
            bitBuffer: fakeBitBuffer(),
            payloadBits: 0,
            loop: 1,
            registryState: 'missing'
        };
        assert.equal(recoverMissingEntityReference(null, context), false);
        assert.equal(recoverMissingEntityReference(configuration.recovery, context), true);
    }
});

test('recovery never creates an entity', () => {
    const summary = summarizeRecoveryWarnings([{ type: 'unresolved_entity_reference', recoveryAction: 'ignored_missing_entity_state_transition' }]);
    assert.equal(summary.recoveryCreatedEntities, false);
});

test('committed recovery warning summary is compact and points to local full log later', () => {
    const warnings = Array.from({ length: 30 }, (_, index) => ({ type: 'unresolved_entity_reference', index }));
    const summary = summarizeRecoveryWarnings(warnings);
    assert.equal(summary.totalWarningCount, 30);
    assert.equal(summary.warnings.length, 25);
    assert.equal(summary.warningSampleTruncated, true);
    assert.equal(summary.fullWarningLog, null);
});

test('recovery never materializes fields', () => {
    const summary = summarizeRecoveryWarnings([{ type: 'unresolved_entity_reference', recoveryAction: 'skipped_invalid_update_payload' }]);
    assert.equal(summary.recoveryMaterializedFields, false);
});

test('default path still throws in synthetic missing-entity case', () => {
    const context = {
        operation: EntityOperation.UPDATE,
        index: 2905,
        bitBuffer: fakeBitBuffer(),
        payloadBits: 32,
        loop: 1,
        registryState: 'missing'
    };
    assert.equal(recoverMissingEntityReference(null, context), false);
});

test('missing class baseline recovery stays opt-in', () => {
    const context = {
        index: 10,
        serial: 1,
        classId: 123,
        className: 'SyntheticClass',
        bitBuffer: fakeBitBuffer(),
        payloadBits: 24,
        loop: 1
    };
    assert.equal(recoverMissingClassBaseline(null, context), false);
    const configuration = new ParserConfiguration({ recovery: { allowMissingClassBaseline: true } });
    assert.equal(recoverMissingClassBaseline(configuration.recovery, context), true);
    assert.equal(configuration.recoveryWarnings[0].type, 'missing_class_baseline');
});

test('canary input validation only allows partida_010', () => {
    const result = validateInputPath('.local/deadem/replays/inbox/partida_010.dem', 'replay_010');
    assert.equal(result.relativePath, '.local/deadem/replays/inbox/partida_010.dem');
});

test('candidates 011 through 020 are rejected', () => {
    for (const id of ['011', '012', '013', '014', '015', '016', '017', '018', '019', '020']) {
        assert.throws(() => validateInputPath(`.local/deadem/replays/inbox/partida_${id}.dem`, `replay_${id}`), /unauthorized|outside|unsupported/);
    }
});

test('replay 005-like filename is rejected', () => {
    assert.throws(() => validateInputPath('.local/deadem/replays/inbox/partida_005.dem', 'replay_005'), /unsupported|protected|unauthorized/);
});

test('006 through 008-like filenames are rejected', () => {
    for (const id of ['006', '007', '008']) {
        assert.throws(() => validateInputPath(`.local/deadem/replays/inbox/partida_${id}.dem`, `replay_${id}`), /unsupported|bot fixture|unauthorized/);
    }
});

test('samples path is rejected', () => {
    assert.throws(() => validateInputPath('samples/partida_010.dem', 'replay_010'), /samples/);
});

test('output roots are fixed to missing entity recovery canary paths', () => {
    const roots = validateOutputRoots(
        '.local/deadem/cache/local-replay-processing/replay_010/missing-entity-recovery/',
        'output/local-replay-processing/replay_010-missing-entity-recovery/'
    );
    assert.equal(roots.local.relativePath, '.local/deadem/cache/local-replay-processing/replay_010/missing-entity-recovery/');
    assert.equal(roots.summary.relativePath, 'output/local-replay-processing/replay_010-missing-entity-recovery/');
});

test('branch audit detects default recovery enabled', async () => {
    const root = '.local/codex/106/synthetic-default-enabled';
    await import('node:fs/promises').then(async fs => {
        await fs.mkdir(`${root}/packages/engine/src/stream`, { recursive: true });
        await fs.mkdir(`${root}/packages/engine/src/handlers`, { recursive: true });
        await fs.mkdir(`${root}/packages/deadem`, { recursive: true });
        await fs.mkdir(`${root}/tools`, { recursive: true });
        await fs.writeFile(`${root}/packages/engine/src/ParserConfiguration.js`, 'const DEFAULTS = { [OPTIONS.RECOVERY]: { allowUnresolvedEntityReference: true } };');
        await fs.writeFile(`${root}/packages/engine/src/ParserEngine.js`, '');
        await fs.writeFile(`${root}/packages/engine/src/stream/DemoStreamPacketAnalyzer.js`, '');
        await fs.writeFile(`${root}/packages/engine/src/handlers/DemoMessageHandler.js`, '');
        await fs.writeFile(`${root}/packages/deadem/index.js`, '');
        await fs.writeFile(`${root}/tools/evaluate-missing-entity-recovery-canary.mjs`, '');
    });
    const result = await auditImplementationSources(root);
    assert.equal(result.passed, false);
    assert.equal(result.recoveryDefaultEnabled, true);
});

test('branch audit detects synthetic replay-specific branch', async () => {
    const root = '.local/codex/106/synthetic-replay-branch';
    await import('node:fs/promises').then(async fs => {
        for (const file of [
            'packages/engine/src/ParserConfiguration.js',
            'packages/engine/src/ParserEngine.js',
            'packages/engine/src/stream/DemoStreamPacketAnalyzer.js',
            'packages/engine/src/handlers/DemoMessageHandler.js',
            'packages/deadem/index.js',
            'tools/evaluate-missing-entity-recovery-canary.mjs'
        ]) {
            await fs.mkdir(`${root}/${file.split('/').slice(0, -1).join('/')}`, { recursive: true });
            await fs.writeFile(`${root}/${file}`, file.endsWith('ParserEngine.js') ? 'if (replayId === "replay_010") {}' : '');
        }
    });
    const result = await auditImplementationSources(root);
    assert.equal(result.passed, false);
    assert.equal(result.replaySpecificBranchFindings.length, 1);
});

test('gate partial requires progress past prior failure', () => {
    const gate = decideGate({
        defaultPass: { expectedFailureReproduced: true },
        recoveryPass: { advancedPastTask105Failure: true, reachedEnd: false, currentTick: 1000 },
        warningSummary: { recoveryCreatedEntities: false, recoveryMaterializedFields: false },
        protectionAudit: { passed: true },
        branchAudit: { passed: true }
    });
    assert.equal(gate.gate, 'local_replay_missing_entity_recovery_partial_progress');
});

test('Task 116 does not exist', () => {
    assert.equal(existsSync('tasks/specs/116.json'), false);
    assert.equal(existsSync('tasks/blocked/116-select-next-canonical-generalization-control.md'), false);
});
