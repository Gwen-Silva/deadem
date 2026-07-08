import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
    buildLocalAppliedFixes,
    compareSemverTags,
    decideUpdateStatus,
    KNOWN_APPLIED_UPSTREAM_FIX_SHA
} from '../tools/check-upstream-deadem-updates.mjs';

const localFixes = buildLocalAppliedFixes({
    fieldFactoryChange: {
        scalarCharWithoutCountResolution: 'char_without_count_var_uint_32'
    },
    finalClassification: {
        classification: 'upstream_fix_resolved_replay_010_and_011'
    },
    syntheticTestResult: {
        scenarios: ['scalar char without count resolves to decodeUVarInt32']
    }
});

test('upstream check classifies no update when upstream head is known applied fix', () => {
    const decision = decideUpdateStatus({
        upstreamReachable: true,
        upstreamHeadSha: KNOWN_APPLIED_UPSTREAM_FIX_SHA,
        upstreamLatestTag: 'v3.2.1',
        upstreamLatestRelease: 'v3.2.1'
    }, localFixes);

    assert.equal(decision.classification, 'upstream_check_no_update_detected');
    assert.equal(decision.updateDetected, false);
    assert.equal(decision.recommendedAction, 'continue_local_debug_after_upstream_check');
});

test('upstream check classifies update available for newer release', () => {
    const decision = decideUpdateStatus({
        upstreamReachable: true,
        upstreamHeadSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        upstreamLatestTag: 'v3.3.0',
        upstreamLatestRelease: 'v3.3.0'
    }, localFixes);

    assert.equal(decision.classification, 'upstream_check_update_available');
    assert.equal(decision.updateDetected, true);
    assert.equal(decision.recommendedAction, 'review_upstream_release_notes_first');
});

test('upstream check reports unavailable when network metadata is unavailable', () => {
    const decision = decideUpdateStatus({
        upstreamReachable: false,
        upstreamHeadSha: null,
        upstreamLatestTag: null,
        upstreamLatestRelease: null
    }, localFixes);

    assert.equal(decision.classification, 'upstream_check_unavailable');
    assert.equal(decision.updateDetected, false);
    assert.equal(decision.recommendedAction, 'manual_upstream_check_required');
});

test('upstream check local evidence records known applied char decoder fix', () => {
    assert.equal(localFixes.knownAppliedUpstreamFixes[0].sha, KNOWN_APPLIED_UPSTREAM_FIX_SHA);
    assert.equal(localFixes.knownAppliedUpstreamFixes[0].evidencePresent, true);
    assert.equal(localFixes.localEvidence.charWithoutCountVarUint32, true);
    assert.equal(localFixes.rawDataCaptured, false);
});

test('semver comparison handles newer, older, equal, and unknown tags', () => {
    assert.equal(compareSemverTags('v3.3.0', 'v3.2.1'), 1);
    assert.equal(compareSemverTags('v3.1.9', 'v3.2.1'), -1);
    assert.equal(compareSemverTags('v3.2.1', 'v3.2.1'), 0);
    assert.equal(compareSemverTags('nightly', 'v3.2.1'), null);
});

test('upstream checker does not implement update-application commands', async () => {
    const source = await readFile(new URL('../tools/check-upstream-deadem-updates.mjs', import.meta.url), 'utf8');

    assert.equal(/child_process|spawn|execFile|exec\(/u.test(source), false);
    assert.equal(/git\s+(pull|merge|cherry-pick|rebase|reset)/u.test(source), false);
    assert.equal(/rawReplayBytesRecorded:\s*true|rawDataCaptured:\s*true/u.test(source), false);
});
