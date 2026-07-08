import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
    EXPECTED_REPLAY_IDS,
    buildAggregateCounterTransitionSummary,
    buildInterpretationBoundaries,
    buildProtectionAudit,
    buildReplayEventCountIndex,
    validateArtifacts
} from '../tools/summarize-exact-15-death-validation-compact-artifacts.mjs';

function artifact(replayId, eventCount = 1) {
    return {
        schemaVersion: 1,
        replayId,
        artifactClass: 'death_validation',
        sourceMethod: 'counter_transition_summary',
        eventCount,
        duplicateKeyCount: 0,
        validationStatus: 'source_events_available_with_limitations',
        limitations: ['compact test artifact'],
        rawDataCaptured: false,
        finalFactsProduced: false
    };
}

function exactArtifacts() {
    return EXPECTED_REPLAY_IDS.map((replayId, index) => artifact(replayId, index + 1));
}

test('summary index contains one compact item per expected replay', () => {
    const index = buildReplayEventCountIndex(exactArtifacts());
    assert.equal(index.replayCount, 15);
    assert.deepEqual(index.items.map(item => item.replayId), EXPECTED_REPLAY_IDS);
    assert.equal(index.items.every(item => item.artifactPath.endsWith('/death_validation.json')), true);
    assert.equal(index.items.every(item => item.eventCountMeaning === 'source_observed_counter_transition_candidate_count_not_final_death_fact'), true);
    assert.equal(index.items.every(item => item.finalFactsProduced === false), true);
    assert.equal(index.items.every(item => item.gameplayInterpretationProduced === false), true);
});

test('aggregate uses sourceObservedCounterTransitionCandidateTotal and never death total naming', () => {
    const aggregate = buildAggregateCounterTransitionSummary(buildReplayEventCountIndex(exactArtifacts()));
    assert.equal(aggregate.artifactCount, 15);
    assert.equal(aggregate.sourceObservedCounterTransitionCandidateTotal, 120);
    assert.equal(aggregate.minEventCount, 1);
    assert.equal(aggregate.maxEventCount, 15);
    assert.equal(aggregate.duplicateKeyTotal, 0);
    assert.deepEqual(aggregate.allValidationStatuses, ['source_events_available_with_limitations']);
    assert.equal(aggregate.notFinalDeathFacts, true);
    assert.equal(aggregate.notGameplayTruth, true);
    assert.equal(Object.hasOwn(aggregate, 'totalDeaths'), false);
    assert.equal(Object.hasOwn(aggregate, 'totalKills'), false);
});

test('interpretation boundaries explicitly reject fact and gameplay conclusions', () => {
    const boundaries = buildInterpretationBoundaries();
    assert.equal(boundaries.notTotalDeathCount, true);
    assert.equal(boundaries.notFinalFact, true);
    assert.equal(boundaries.notCanonicalTruth, true);
    assert.equal(boundaries.containsEventRows, false);
    assert.equal(boundaries.containsFieldValues, false);
    assert.equal(boundaries.containsKillerVictimAssistAttribution, false);
    assert.equal(boundaries.containsPlayerIdentity, false);
    assert.equal(boundaries.containsObjectiveAttribution, false);
    assert.equal(boundaries.containsTimeline, false);
    assert.equal(boundaries.containsGameplayInterpretation, false);
    assert.equal(boundaries.validatesSource2Semantics, false);
    assert.equal(boundaries.provesTotalParserCorrectness, false);
});

test('protection audit confirms no replay or parser access for summary task', () => {
    const audit = buildProtectionAudit(buildReplayEventCountIndex(exactArtifacts()));
    assert.equal(audit.consumedTask168CompactArtifactsOnly, true);
    assert.equal(audit.replayFilesAccessed, false);
    assert.equal(audit.replayFilesOpened, false);
    assert.equal(audit.replayFilesHashed, false);
    assert.equal(audit.replayFilesCopied, false);
    assert.equal(audit.replayFilesParsed, false);
    assert.equal(audit.replayFilesProcessed, false);
    assert.equal(audit.parserExecuted, false);
    assert.equal(audit.emissionRunnerExecuted, false);
    assert.equal(audit.newDeathValidationArtifactsEmitted, false);
    assert.equal(audit.task170Created, false);
});

test('artifact validator requires exact 15 compact artifacts only', () => {
    assert.deepEqual(validateArtifacts(exactArtifacts()), []);
    assert.match(validateArtifacts(exactArtifacts().slice(0, 14)).join('\n'), /expected exactly 15/u);
    assert.match(validateArtifacts([...exactArtifacts().slice(0, 14), artifact('replay_020')]).join('\n'), /unexpected artifact replayId replay_020/u);
    assert.match(validateArtifacts([artifact('replay_001', -1), ...exactArtifacts().slice(1)]).join('\n'), /eventCount must be non-negative integer/u);
});

test('summary script source does not import parser APIs or execute emission/update commands', async () => {
    const source = await readFile('tools/summarize-exact-15-death-validation-compact-artifacts.mjs', 'utf8');
    assert.equal(/\bfrom\s+['"]deadem['"]/u.test(source), false);
    assert.equal(/\b(Player|Logger|createReadStream|createHash|copyFile)\b/u.test(source), false);
    assert.equal(/\bgit\s+(pull|merge|cherry-pick|rebase)\b/iu.test(source), false);
    assert.equal(/emit:exact-15-death-validation-compact|emit:batch-death-validation-compact|emit:death-validation-compact/u.test(source), false);
    assert.equal(/totalDeaths|totalKills|finalDeaths|finalKills/u.test(source), false);
});
