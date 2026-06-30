import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);

function readJson(relativePath) {
    return JSON.parse(readFileSync(new URL(relativePath, ROOT), 'utf8'));
}

test('workflow evaluation covers all required workflows and preserves gate constraints', () => {
    const summary = readJson('output/replay-009-inspection-evaluation/evaluation-summary.json');
    const gate = readJson('output/replay-009-inspection-evaluation/evaluation-gate.json');
    const workflows = readJson('output/replay-009-inspection-evaluation/workflow-results.json');

    assert.equal(summary.gate, 'replay_009_inspector_workflows_validated_with_gaps');
    assert.equal(gate.gate, summary.gate);
    assert.equal(workflows.length, 12);
    assert.equal(summary.workflowsEvaluated, 12);
    assert.equal(summary.workflowsFailed, 0);
    assert.equal(summary.criticalIssues, 0);
    assert.equal(summary.highIssues, 0);
    assert.equal(summary.mechanicEffectsApplied, 0);
    assert.equal(summary.replay005Protection, 'not_processed_or_inspected');
    assert.equal(summary.botFixtureExclusion, 'not_processed_or_inspected');
});

test('CLI, inspector timeline, and export reports have parity for required filters', () => {
    const parity = readJson('output/replay-009-inspection-evaluation/cli-interface-parity.json');

    assert.deepEqual(parity.map(row => row.filterId), [
        'event_type_player_dead',
        'mechanic_mid_boss',
        'validation_status_visually_supported',
        'candidate_only',
        'selected_player'
    ]);
    assert.ok(parity.every(row => row.parity));
    assert.ok(parity.every(row => row.cliCount === row.interfaceCount));
    assert.ok(parity.every(row => row.interfaceCount === row.exportCount));
});

test('misinterpretation risks remain bounded and no critical/high issues remain', () => {
    const risks = readJson('output/replay-009-inspection-evaluation/misinterpretation-risk-audit.json');
    const issues = readJson('output/replay-009-inspection-evaluation/issues.json');

    for (const riskId of [
        'deleted_equals_destroyed',
        'health_zero_equals_killed',
        'visual_support_exact_time',
        'not_observable_contradiction',
        'candidate_urn_canonical',
        'patron_base_confirmed_patron',
        'net_worth_spendable_souls',
        'parser_seconds_match_clock'
    ]) {
        assert.ok(risks.some(risk => risk.riskId === riskId && risk.interfacePreventionPresent));
    }
    assert.equal(issues.filter(issue => ['critical', 'high'].includes(issue.severity) && issue.status !== 'fixed').length, 0);
    assert.equal(issues.filter(issue => issue.severity === 'medium' && issue.status !== 'fixed').length, 2);
});

test('Task 067 interface corrections are present', () => {
    const app = readFileSync(new URL('output/replay-009-inspection/app.js', ROOT), 'utf8');

    assert.match(app, /Reset filters/u);
    assert.match(app, /resetTimelineFilters/u);

    const queryOutput = execFileSync(process.execPath, [
        'tools/query-replay-state.mjs',
        '--replay',
        'replay_009',
        '--timeline-only',
        '--mechanic',
        'mid_boss'
    ], { cwd: ROOT, encoding: 'utf8' });
    const query = JSON.parse(queryOutput);
    assert.equal(query.totalMatchedBeforeLimit, 15);
});

test('generated workflow reports contain limitations and no strategic interpretation', () => {
    const midBoss = readFileSync(new URL('reports/generated/replay-009-mid-boss-workflow-report.md', ROOT), 'utf8');
    const spirit = readFileSync(new URL('reports/generated/replay-009-spirit-urn-candidate-workflow-report.md', ROOT), 'utf8');

    assert.match(midBoss, /Included record set: timeline events only/u);
    assert.match(midBoss, /Known unavailable layers/u);
    assert.match(spirit, /"candidate-only": true/u);
    assert.match(spirit, /Records matched: 46/u);
    assert.doesNotMatch(`${midBoss}\n${spirit}`, /strategically ahead|was destroyed|was killed|objective was secured|macro decision/u);
});
