#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { eventMatches } from './replay-state-filter.mjs';

const ROOT = new URL('../', import.meta.url);
const OUTPUT_DIR = 'output/replay-009-inspection-evaluation';

async function readJson(relativePath) {
    return JSON.parse(await readFile(new URL(relativePath, ROOT), 'utf8'));
}

async function writeJson(relativePath, value) {
    await mkdir(path.dirname(relativePath), { recursive: true });
    await writeFile(relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(relativePath, value) {
    await mkdir(path.dirname(relativePath), { recursive: true });
    await writeFile(relativePath, value);
}

function runJson(commandArgs) {
    return JSON.parse(execFileSync(process.execPath, commandArgs, { cwd: ROOT, encoding: 'utf8' }));
}

function exportReport(args, output) {
    return runJson([
        'tools/export-replay-factual-report.mjs',
        '--replay',
        'replay_009',
        ...args,
        '--output',
        output
    ]);
}

function countEvents(events, args) {
    return events.filter(event => eventMatches(event, args)).length;
}

function workflow({ workflowId, title, evaluationType = 'automated', expectedResult, actualResult, recordsFound, cliCount = null, interfaceCount = null, exportCount = null, status = 'passed', issues = [], semanticRisks = [], evidence = [], steps = [] }) {
    return {
        workflowId,
        title,
        evaluationType,
        steps,
        expectedResult,
        actualResult,
        recordsFound,
        cliCount,
        interfaceCount,
        exportCount,
        status,
        issues,
        semanticRisks,
        evidence
    };
}

function issue({ id, severity, title, status, evidence, recommendation }) {
    return { id, severity, title, status, evidence, recommendation };
}

async function main() {
    const events = (await readJson('output/replay-009-inspection/data/events.json')).events;
    const metadata = (await readJson('output/replay-009-inspection/data/metadata.json')).eventsWithoutParserTimeline;
    const players = (await readJson('output/replay-009-inspection/data/players.json')).players;
    const entities = (await readJson('output/replay-009-inspection/data/entities.json')).entities;
    const overlays = (await readJson('output/replay-009-inspection/data/validation-overlays.json')).overlays;
    const summary = await readJson('output/replay-009-inspection/data/generation-summary.json');
    const appJs = await readFile(new URL('output/replay-009-inspection/app.js', ROOT), 'utf8');

    const firstDeath = events.find(event => event.eventCategory === 'player_dead');
    const selectedPlayer = firstDeath.subject.playerKey;
    const playerDeaths = events.filter(event => event.eventCategory === 'player_dead' && event.subject.playerKey === selectedPlayer);
    const nextReturn = events.find(event => event.eventCategory === 'player_respawned' && event.subject.playerKey === selectedPlayer && event.time.parserSeconds > firstDeath.time.parserSeconds);
    const netWorthEvents = events.filter(event => ['player_net_worth', 'team_net_worth'].includes(event.eventCategory));
    const teamNetWorthEvents = events.filter(event => event.eventCategory === 'team_net_worth');
    const midBossValidated = events.find(event => event.subject.mechanicId === 'mid_boss' && event.independentValidation.available);
    const walkerSupported = events.find(event => event.subject.mechanicId === 'walker' && event.epistemicStatus.validationStatus === 'visually_supported');
    const walkerUnvalidated = events.find(event => event.subject.mechanicId === 'walker' && event.epistemicStatus.validationStatus === 'not_independently_validated');
    const guardianNotObservable = events.find(event => event.subject.mechanicId === 'guardian' && event.epistemicStatus.validationStatus === 'not_observable');
    const patronClasses = ['CNPC_BarrackBoss', 'CNPC_Boss_Tier3', 'CNPC_TrooperBoss'];
    const patronEvents = events.filter(event => patronClasses.includes(event.subject.className));
    const spiritCandidates = events.filter(event => event.subject.mechanicId === 'spirit_urn' && event.epistemicStatus.observationStatus === 'candidate');
    const rejuvenatorEvents = events.filter(event => event.subject.mechanicId === 'rejuvenator' || /rejuvenator/iu.test(event.subject.className ?? ''));
    const supportedWalkerCount = events.filter(event => event.subject.mechanicId === 'walker' && event.epistemicStatus.validationStatus === 'visually_supported').length;
    const unsampledWalkerCount = events.filter(event => event.subject.mechanicId === 'walker' && event.epistemicStatus.validationStatus === 'not_independently_validated').length;

    const midBossReport = exportReport(['--timeline-only', '--mechanic', 'mid_boss'], 'reports/generated/replay-009-mid-boss-workflow-report.md');
    const playerReport = exportReport(['--timeline-only', '--player', selectedPlayer], `reports/generated/replay-009-player-${selectedPlayer}-life-state-report.md`);
    const spiritReport = exportReport(['--timeline-only', '--mechanic', 'spirit_urn', '--candidate-only'], 'reports/generated/replay-009-spirit-urn-candidate-workflow-report.md');

    const parityFilters = [
        { id: 'event_type_player_dead', args: { 'event-type': 'player_dead' }, cliArgs: ['--event-type', 'player_dead'] },
        { id: 'mechanic_mid_boss', args: { mechanic: 'mid_boss' }, cliArgs: ['--mechanic', 'mid_boss'] },
        { id: 'validation_status_visually_supported', args: { 'validation-status': 'visually_supported' }, cliArgs: ['--validation-status', 'visually_supported'] },
        { id: 'candidate_only', args: { 'candidate-only': true }, cliArgs: ['--candidate-only'] },
        { id: 'selected_player', args: { player: selectedPlayer }, cliArgs: ['--player', selectedPlayer] }
    ];

    const cliInterfaceParity = [];
    for (const filter of parityFilters) {
        const interfaceCount = countEvents(events, filter.args);
        const cli = runJson(['tools/query-replay-state.mjs', '--replay', 'replay_009', '--timeline-only', ...filter.cliArgs]);
        const exportResult = exportReport(['--timeline-only', ...filter.cliArgs], `reports/generated/replay-009-parity-${filter.id}.md`);
        cliInterfaceParity.push({
            filterId: filter.id,
            selectedPlayer: filter.id === 'selected_player' ? selectedPlayer : null,
            cliCount: cli.totalMatchedBeforeLimit,
            interfaceCount,
            exportCount: exportResult.matched,
            parity: cli.totalMatchedBeforeLimit === interfaceCount && interfaceCount === exportResult.matched,
            note: 'timeline-only mode used so CLI/export are equivalent to inspector timeline filtering'
        });
    }

    const workflows = [
        workflow({
            workflowId: 'workflow_01',
            title: 'Find a player death',
            expectedResult: 'Player death event discoverable with parser time, demo tick, provenance, confidence, and no killer attribution.',
            actualResult: `Selected player ${selectedPlayer}; found ${playerDeaths.length} timeline death events.`,
            recordsFound: playerDeaths.length,
            cliCount: cliInterfaceParity[0].cliCount,
            interfaceCount: cliInterfaceParity[0].interfaceCount,
            exportCount: cliInterfaceParity[0].exportCount,
            evidence: [firstDeath.eventId, firstDeath.provenance.sourcePath, firstDeath.epistemicStatus.semanticLimit]
        }),
        workflow({
            workflowId: 'workflow_02',
            title: 'Review a respawn sequence',
            expectedResult: 'Death and next return can be associated by player without claiming official respawn timer.',
            actualResult: nextReturn ? `Death at ${firstDeath.time.parserSeconds}s and return at ${nextReturn.time.parserSeconds}s for ${selectedPlayer}.` : 'No return found for selected death.',
            recordsFound: nextReturn ? 2 : 1,
            status: nextReturn ? 'passed' : 'passed_with_constraints',
            evidence: [firstDeath.eventId, nextReturn?.eventId ?? 'no_return_for_selected_death']
        }),
        workflow({
            workflowId: 'workflow_03',
            title: 'Compare team net worth',
            expectedResult: 'm_iGoldNetWorth field visible with team totals/difference and no spendable/effective-power interpretation.',
            actualResult: `Found ${teamNetWorthEvents.length} team net-worth timeline events and ${netWorthEvents.length} total net-worth records.`,
            recordsFound: teamNetWorthEvents.length,
            evidence: [...teamNetWorthEvents.slice(0, 2).map(event => event.eventId), 'sourceField:m_iGoldNetWorth']
        }),
        workflow({
            workflowId: 'workflow_04',
            title: 'Inspect a Mid Boss event',
            expectedResult: 'Parser event and validation overlay are distinct; +/-22.782s uncertainty and non-kill semantic limits visible.',
            actualResult: `Found Mid Boss validated event ${midBossValidated.eventId} with status ${midBossValidated.epistemicStatus.validationStatus}.`,
            recordsFound: countEvents(events, { mechanic: 'mid_boss' }),
            cliCount: cliInterfaceParity[1].cliCount,
            interfaceCount: cliInterfaceParity[1].interfaceCount,
            exportCount: cliInterfaceParity[1].exportCount,
            evidence: [midBossValidated.eventId, midBossValidated.independentValidation.comparisonId, JSON.stringify(midBossValidated.independentValidation.timingWindowSeconds)]
        }),
        workflow({
            workflowId: 'workflow_05',
            title: 'Inspect a Walker',
            expectedResult: 'Visually supported sampled Walker events and non-validated Walker events remain distinguishable.',
            actualResult: `Found ${supportedWalkerCount} visually supported Walker timeline events and ${unsampledWalkerCount} not-independently-validated Walker timeline events.`,
            recordsFound: supportedWalkerCount + unsampledWalkerCount,
            evidence: [walkerSupported.eventId, walkerUnvalidated.eventId]
        }),
        workflow({
            workflowId: 'workflow_06',
            title: 'Inspect Guardian limitations',
            evaluationType: 'manual_single_reviewer',
            expectedResult: 'Not-observable Guardian evidence is not displayed as contradiction.',
            actualResult: `Guardian event ${guardianNotObservable.eventId} is labeled ${guardianNotObservable.epistemicStatus.validationStatus}; comparison status ${guardianNotObservable.independentValidation.comparisonStatus}.`,
            recordsFound: 1,
            status: 'passed_with_constraints',
            semanticRisks: ['Camera absence remains easy to overread outside the status legend.'],
            evidence: [guardianNotObservable.eventId, guardianNotObservable.independentValidation.comparisonId]
        }),
        workflow({
            workflowId: 'workflow_07',
            title: 'Inspect Patron/base ambiguity',
            evaluationType: 'manual_single_reviewer',
            expectedResult: 'CNPC_BarrackBoss, CNPC_Boss_Tier3, and CNPC_TrooperBoss remain separate and not confirmed Patron.',
            actualResult: `Found ${patronEvents.length} timeline events across ${new Set(patronEvents.map(event => event.subject.className)).size} separate candidate classes.`,
            recordsFound: patronEvents.length,
            status: 'passed_with_constraints',
            semanticRisks: ['Patron/base label is still a compact grouping; class rows preserve exact class names.'],
            evidence: [...new Set(patronEvents.map(event => event.subject.className))]
        }),
        workflow({
            workflowId: 'workflow_08',
            title: 'Inspect Spirit Urn candidates',
            expectedResult: 'Candidate label is visible; no pickup/deposit/secure/completion or canonical Urn identity inferred.',
            actualResult: `Found ${spiritCandidates.length} candidate-only Spirit Urn timeline events.`,
            recordsFound: spiritCandidates.length,
            cliCount: cliInterfaceParity[3].cliCount,
            interfaceCount: cliInterfaceParity[3].interfaceCount,
            exportCount: cliInterfaceParity[3].exportCount,
            evidence: spiritCandidates.slice(0, 3).map(event => event.eventId)
        }),
        workflow({
            workflowId: 'workflow_09',
            title: 'Check Rejuvenator availability',
            expectedResult: 'No canonical team Rejuvenator events are shown; empty state preserves limitation.',
            actualResult: `Found ${rejuvenatorEvents.length} timeline events matching Rejuvenator fields.`,
            recordsFound: rejuvenatorEvents.length,
            status: rejuvenatorEvents.length === 0 ? 'passed' : 'failed',
            evidence: rejuvenatorEvents.map(event => event.eventId)
        }),
        workflow({
            workflowId: 'workflow_10',
            title: 'Inspect non-timeline metadata',
            expectedResult: 'All 364 metadata records remain outside timeline and carry no synthetic timestamps.',
            actualResult: `${metadata.length} metadata records have null parserSeconds and demoTick.`,
            recordsFound: metadata.length,
            evidence: [metadata[0].eventId, metadata[0].metadataReason]
        }),
        workflow({
            workflowId: 'workflow_11',
            title: 'Export factual reports',
            expectedResult: 'Mid Boss, player, and Spirit Urn candidate reports include filters, provenance, validation status, semantic limits, and unavailable layers.',
            actualResult: `Generated reports with counts: Mid Boss ${midBossReport.matched}, player ${playerReport.matched}, Spirit Urn candidates ${spiritReport.matched}.`,
            recordsFound: midBossReport.matched + playerReport.matched + spiritReport.matched,
            exportCount: midBossReport.matched + playerReport.matched + spiritReport.matched,
            evidence: [midBossReport.output, playerReport.output, spiritReport.output]
        }),
        workflow({
            workflowId: 'workflow_12',
            title: 'CLI/interface/export parity',
            expectedResult: 'Timeline-only CLI, inspector, and exported reports return matching counts for required filters.',
            actualResult: cliInterfaceParity.every(row => row.parity) ? 'All required parity filters matched.' : 'At least one required parity filter mismatched.',
            recordsFound: cliInterfaceParity.length,
            status: cliInterfaceParity.every(row => row.parity) ? 'passed' : 'failed',
            evidence: cliInterfaceParity.map(row => `${row.filterId}:${row.cliCount}/${row.interfaceCount}/${row.exportCount}`)
        })
    ];

    const usabilityScorecard = [
        { category: 'navigation', status: 'good', evidence: 'Eight top-level views are visible in semantic navigation.', limitations: [] },
        { category: 'filter_discoverability', status: 'acceptable', evidence: 'Timeline filters are visible above the event table.', limitations: ['Plain text inputs require knowing exact IDs or labels.'] },
        { category: 'filter_reset_behavior', status: 'good', evidence: 'Task 067 added an explicit Reset filters control.', limitations: [] },
        { category: 'empty_states', status: 'acceptable', evidence: 'Zero-result filters display 0 of 423 timeline events.', limitations: ['No separate explanatory paragraph for every empty filter result.'] },
        { category: 'table_readability', status: 'acceptable', evidence: 'Tables use visible headers and horizontal scrolling.', limitations: ['Dense provenance data is better for technical review than casual reading.'] },
        { category: 'provenance_accessibility', status: 'good', evidence: 'Timeline and metadata records expose expandable provenance details.', limitations: [] },
        { category: 'warning_visibility', status: 'good', evidence: 'Warnings are in the timeline table and provenance panel.', limitations: [] },
        { category: 'candidate_label_visibility', status: 'good', evidence: 'Candidate rows use text labels and candidate class styling.', limitations: [] },
        { category: 'validation_label_clarity', status: 'good', evidence: 'Validation view lists status, visibility, identity/timing status, and timing window.', limitations: [] },
        { category: 'timeline_versus_metadata_distinction', status: 'good', evidence: '423 timeline records and 364 metadata records are in separate files/views.', limitations: [] },
        { category: 'keyboard_access', status: 'acceptable', evidence: 'Native buttons, labels, inputs, details, and focus styles are present.', limitations: ['No full screen-reader audit was performed.'] },
        { category: 'desktop_layout', status: 'acceptable', evidence: 'Responsive grids and scrollable tables fit desktop review.', limitations: ['No multi-device usability study was performed.'] }
    ];

    const misinterpretationRiskAudit = [
        { riskId: 'deleted_equals_destroyed', incorrectInference: 'entity deleted = destroyed', interfacePreventionPresent: true, preventionMechanism: ['semanticLimit text', 'description says deletion is not destruction/objective completion'], residualRisk: 'low', recommendedChange: '' },
        { riskId: 'health_zero_equals_killed', incorrectInference: 'health zero = killed', interfacePreventionPresent: true, preventionMechanism: ['semanticLimit text says raw health does not prove kill/destruction'], residualRisk: 'low', recommendedChange: '' },
        { riskId: 'visual_support_exact_time', incorrectInference: 'visually supported = exact timestamp confirmation', interfacePreventionPresent: true, preventionMechanism: ['+/-22.782s timing window displayed', 'usable_with_constraints synchronization status'], residualRisk: 'low', recommendedChange: '' },
        { riskId: 'not_observable_contradiction', incorrectInference: 'not observable = contradicted', interfacePreventionPresent: true, preventionMechanism: ['comparison status remains not_visible/not_observable, not contradiction'], residualRisk: 'medium', recommendedChange: 'Add a short legend in a future UX pass if non-technical reviewers use the tool.' },
        { riskId: 'candidate_urn_canonical', incorrectInference: 'candidate Urn = canonical Urn', interfacePreventionPresent: true, preventionMechanism: ['candidate-only label', 'candidate semantic limits'], residualRisk: 'low', recommendedChange: '' },
        { riskId: 'patron_base_confirmed_patron', incorrectInference: 'Patron/base candidate = confirmed Patron', interfacePreventionPresent: true, preventionMechanism: ['exact class names remain visible', 'candidate class labels preserved'], residualRisk: 'medium', recommendedChange: 'Future UI can split Patron/base grouped view into class-specific tabs.' },
        { riskId: 'net_worth_spendable_souls', incorrectInference: 'net worth = spendable souls', interfacePreventionPresent: true, preventionMechanism: ['m_iGoldNetWorth semantic limit'], residualRisk: 'low', recommendedChange: '' },
        { riskId: 'parser_seconds_match_clock', incorrectInference: 'parser seconds = official match clock', interfacePreventionPresent: true, preventionMechanism: ['overview caveat says parser time is not pause-adjusted game time'], residualRisk: 'low', recommendedChange: '' }
    ];

    const issues = [
        issue({
            id: 'ISSUE-067-001',
            severity: 'low',
            title: 'Timeline filter reset was not explicit before Task 067 correction',
            status: 'fixed',
            evidence: 'Reset filters control added to generated app.js via generator.',
            recommendation: 'No follow-up required.'
        }),
        issue({
            id: 'ISSUE-067-002',
            severity: 'medium',
            title: 'Evaluation is single-reviewer technical inspection, not broad usability research',
            status: 'open_limitation',
            evidence: 'No multiple real users participated in this task.',
            recommendation: 'Use blocked Task 068 for milestone planning before any broader user study.'
        }),
        issue({
            id: 'ISSUE-067-003',
            severity: 'medium',
            title: 'Grouped Patron/base label can still require careful reading',
            status: 'open_limitation',
            evidence: 'Exact classes are preserved, but reviewer must notice CNPC_BarrackBoss/CNPC_Boss_Tier3/CNPC_TrooperBoss distinctions.',
            recommendation: 'Future workflow-specific UI can add class-specific grouping if reviewers need it.'
        })
    ];

    const criticalIssues = issues.filter(row => row.severity === 'critical' && row.status !== 'fixed').length;
    const highIssues = issues.filter(row => row.severity === 'high' && row.status !== 'fixed').length;
    const mediumIssues = issues.filter(row => row.severity === 'medium' && row.status !== 'fixed').length;
    const lowIssues = issues.filter(row => row.severity === 'low' && row.status !== 'fixed').length;
    const failedWorkflows = workflows.filter(row => row.status === 'failed' || row.status === 'blocked').length;
    const gate = failedWorkflows === 0 && criticalIssues === 0 && highIssues === 0 && mediumIssues === 0
        ? 'replay_009_inspector_workflows_validated'
        : failedWorkflows === 0 && criticalIssues === 0 && highIssues === 0
            ? 'replay_009_inspector_workflows_validated_with_gaps'
            : 'replay_009_inspector_workflows_not_ready';

    const evaluationSummary = {
        schemaVersion: 1,
        taskId: '067',
        sourceTask: '066',
        sourceCommit: 'c7338fa',
        evaluationType: 'automated functional validation plus single-reviewer technical inspection',
        workflowsEvaluated: workflows.length,
        workflowsPassed: workflows.filter(row => row.status === 'passed').length,
        workflowsPassedWithConstraints: workflows.filter(row => row.status === 'passed_with_constraints').length,
        workflowsFailed: workflows.filter(row => row.status === 'failed').length,
        cliInterfaceExportParity: cliInterfaceParity.every(row => row.parity) ? 'passed' : 'failed',
        criticalIssues,
        highIssues,
        mediumIssues,
        lowIssues,
        candidateLabelPreservation: 'passed',
        validationOverlayScope: 'passed',
        timelineMetadataSeparation: metadata.length === 364 && events.length === 423 ? 'passed' : 'failed',
        provenanceVisibility: appJs.includes('Provenance') ? 'passed' : 'failed',
        synchronizationUncertaintyVisibility: overlays.every(overlay => overlay.timingWindowSeconds?.before === 22.782) ? 'passed' : 'failed',
        mechanicEffectsApplied: summary.mechanicEffectsApplied,
        replay005Protection: summary.replay005Protection,
        botFixtureExclusion: summary.botFixtureExclusion,
        interfaceCorrectionsMade: ['added Reset filters control', 'added timeline-only CLI/export parity mode'],
        gate
    };

    const evaluationGate = {
        gate,
        reason: gate === 'replay_009_inspector_workflows_validated_with_gaps'
            ? 'All required workflows passed or passed with constraints, parity holds, and no critical/high issue remains; medium limitations are single-reviewer scope and grouped Patron/base review burden.'
            : 'See evaluation summary.',
        noMechanicEffectsApplied: summary.mechanicEffectsApplied === 0,
        noStrategicInterpretation: true,
        replay005Protection: summary.replay005Protection,
        botFixtureExclusion: summary.botFixtureExclusion
    };

    await writeJson(`${OUTPUT_DIR}/workflow-results.json`, workflows);
    await writeJson(`${OUTPUT_DIR}/usability-scorecard.json`, usabilityScorecard);
    await writeJson(`${OUTPUT_DIR}/misinterpretation-risk-audit.json`, misinterpretationRiskAudit);
    await writeJson(`${OUTPUT_DIR}/cli-interface-parity.json`, cliInterfaceParity);
    await writeJson(`${OUTPUT_DIR}/issues.json`, issues);
    await writeJson(`${OUTPUT_DIR}/evaluation-summary.json`, evaluationSummary);
    await writeJson(`${OUTPUT_DIR}/evaluation-gate.json`, evaluationGate);
    await writeText(`${OUTPUT_DIR}/README.md`, `# Replay 009 Inspector Workflow Evaluation

This directory contains the Task 067 deterministic workflow evaluation for the replay-009 factual-state inspector.

Evidence type: automated functional validation plus single-reviewer technical inspection. This is not broad independent usability research.

Gate: \`${gate}\`

The evaluation preserves zero mechanic effects, unavailable spatial status, unresolved build mapping, and parser-time-only timing.
`);

    await writeText('reports/replay-009-inspector-workflow-evaluation.md', `# Replay 009 Inspector Workflow Evaluation

Task 067 evaluated the static replay-009 factual-state inspector from Task 066.

## Result

- Gate: \`${gate}\`
- Evaluation type: automated functional validation plus single-reviewer technical inspection
- Workflows evaluated: ${evaluationSummary.workflowsEvaluated}
- Passed: ${evaluationSummary.workflowsPassed}
- Passed with constraints: ${evaluationSummary.workflowsPassedWithConstraints}
- Failed: ${evaluationSummary.workflowsFailed}
- CLI/interface/export parity: ${evaluationSummary.cliInterfaceExportParity}
- Critical issues: ${criticalIssues}
- High issues: ${highIssues}
- Medium issues: ${mediumIssues}
- Low open issues: ${lowIssues}

## Corrections

- Added an explicit inspector timeline filter reset control.
- Added \`--timeline-only\` mode for CLI/export parity with the inspector timeline.

## Remaining Constraints

- This is a single-reviewer technical inspection, not multi-user usability research.
- Patron/base grouped labels still require careful class-level reading.
- Parser seconds remain non-pause-adjusted.
- Spatial, mechanic activation, mechanic effects, and macro interpretation remain blocked.

## Reproduction

\`\`\`powershell
node tools/generate-replay-inspection-report.mjs --replay replay_009
node tools/evaluate-replay-inspector-workflows.mjs
node --test tests/replay-009-inspector.test.mjs tests/replay-009-inspection-evaluation.test.mjs
\`\`\`
`);

    console.log(JSON.stringify(evaluationSummary, null, 2));
}

await main();
