import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    AUTHORIZED_REPLAYS,
    buildOutputPolicyAudit,
    buildPlannedArtifactSummary,
    classifyDryRun,
    schemaReadinessSummary,
    validateOutputRoots,
    validateReplayInput
} from '../tools/dry-run-generic-source-canonical-readiness.mjs';

test('dry-run path guards allow only replay 010 and replay 011 inputs', () => {
    assert.equal(validateReplayInput('replay_010', AUTHORIZED_REPLAYS.replay_010).normalized, AUTHORIZED_REPLAYS.replay_010);
    assert.equal(validateReplayInput('replay_011', AUTHORIZED_REPLAYS.replay_011).normalized, AUTHORIZED_REPLAYS.replay_011);

    assert.throws(
        () => validateReplayInput('replay_010', '.local/deadem/replays/inbox/partida_005.dem'),
        /protected replay 005 path/u
    );
    assert.throws(
        () => validateReplayInput('replay_011', '.local/deadem/replays/inbox/partida_012.dem'),
        /out-of-scope candidate replay path/u
    );
    assert.throws(
        () => validateReplayInput('replay_012', '.local/deadem/replays/inbox/partida_012.dem'),
        /unsupported replay id/u
    );
});

test('dry-run output roots are fixed to compact local and summary roots', () => {
    const roots = validateOutputRoots(
        '.local/deadem/cache/local-replay-processing/generic-source-canonical-dry-run-entrypoint/',
        'output/local-replay-processing/generic-source-canonical-dry-run-entrypoint/'
    );
    assert.equal(roots.local.normalized, '.local/deadem/cache/local-replay-processing/generic-source-canonical-dry-run-entrypoint/');
    assert.equal(roots.summary.normalized, 'output/local-replay-processing/generic-source-canonical-dry-run-entrypoint/');

    assert.throws(
        () => validateOutputRoots('.local/deadem/cache/local-replay-processing/other/', 'output/local-replay-processing/generic-source-canonical-dry-run-entrypoint/'),
        /local output root must be exactly/u
    );
});

test('planned artifacts separate compact readiness from future final source classes', () => {
    const summary = buildPlannedArtifactSummary({
        sourceArtifact: "export const REQUIRED_ARTIFACT_CLASSES = ['parser_source_summary', 'death_events'];",
        forwardSourceArtifact: "export const REQUIRED_ARTIFACT_CLASSES = ['parser_source_summary', 'respawn_events'];"
    });

    assert.equal(summary.finalArtifactsWrittenByDryRun, false);
    assert.equal(summary.dryRunEntrypointArtifactClasses.every(row => row.finalFactArtifact === false), true);
    assert.deepEqual(
        summary.existingSourceArtifactClassesPlannedForFutureEmission.map(row => row.artifactClass),
        ['death_events', 'parser_source_summary', 'respawn_events']
    );
});

test('schema and output policy pass for compact readiness-only plan', () => {
    const planned = buildPlannedArtifactSummary({
        sourceArtifact: "const REQUIRED_ARTIFACT_CLASSES = ['parser_source_summary'];",
        forwardSourceArtifact: "const REQUIRED_ARTIFACT_CLASSES = ['match_state_timeline'];"
    });
    const schema = schemaReadinessSummary(planned);
    const policy = buildOutputPolicyAudit(planned);

    assert.equal(schema.readinessSchemaValidationStatus, 'passed');
    assert.equal(policy.policyStatus, 'passed');
    assert.equal(policy.sourceFactsProduced, false);
    assert.equal(policy.canonicalFactsProduced, false);
    assert.equal(policy.matchFactsProduced, false);
    assert.equal(policy.fieldValues, false);
});

test('classification distinguishes ready, schema blocked, output policy blocked, and partial parser states', () => {
    const replayResults = [
        { replayId: 'replay_010', parseCompleted: true },
        { replayId: 'replay_011', parseCompleted: true }
    ];

    assert.equal(
        classifyDryRun({
            replayResults,
            schemaSummary: { readinessSchemaValidationStatus: 'passed' },
            outputPolicy: { policyStatus: 'passed' }
        }),
        'generic_source_canonical_dry_run_ready'
    );
    assert.equal(
        classifyDryRun({
            replayResults,
            schemaSummary: { readinessSchemaValidationStatus: 'blocked' },
            outputPolicy: { policyStatus: 'passed' }
        }),
        'generic_source_canonical_dry_run_blocked_by_schema'
    );
    assert.equal(
        classifyDryRun({
            replayResults,
            schemaSummary: { readinessSchemaValidationStatus: 'passed' },
            outputPolicy: { policyStatus: 'blocked' }
        }),
        'generic_source_canonical_dry_run_blocked_by_output_policy'
    );
    assert.equal(
        classifyDryRun({
            replayResults: [{ replayId: 'replay_010', parseCompleted: true }, { replayId: 'replay_011', parseCompleted: false }],
            schemaSummary: { readinessSchemaValidationStatus: 'passed' },
            outputPolicy: { policyStatus: 'passed' }
        }),
        'generic_source_canonical_dry_run_partial'
    );
});

test('dry-run script does not implement update commands or replay_010-only branches', async () => {
    const source = await readFile('tools/dry-run-generic-source-canonical-readiness.mjs', 'utf8');
    assert.equal(/\bgit\s+(pull|merge|cherry-pick|rebase)\b/iu.test(source), false);
    assert.equal(/\bif\s*\([^)]*replay_010[^)]*\)/iu.test(source), false);
    assert.equal(/\bswitch\s*\([^)]*replayId[^)]*\)/iu.test(source), false);
    assert.equal(/sourceFactsProduced:\s*true|canonicalFactsProduced:\s*true|matchFactsProduced:\s*true/u.test(source), false);
});
