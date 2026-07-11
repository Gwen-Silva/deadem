import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createSemanticArtifact } from '../tools/emit-death-event-semantic-sequence-evidence.mjs';
import { validateJsonSchema } from '../tools/lib/json-schema-validator.mjs';

const schema = JSON.parse(await readFile('schemas/death-event-semantic-sequence-evidence.schema.json', 'utf8'));
export function fixtureArtifact() {
    const anchor = { eventCandidateKey: 'death_event_candidate_000001', sourceTransitionKey: 'life_transition_000001', participantKey: 'participant_01', heroRefKey: 'hero_ref_01', teamRefKey: 'team_ref_01', normalizedElapsedSecond: 10 };
    const states = [];
    for (let second = 0; second <= 200; second += 1) states.push({ second, state: { healthBoundary: second < 10 || second >= 20 ? 'positive' : 'non_positive', booleanAlive: second < 10 || second >= 20, lifeStateSignature: 'stable', respawnBoundary: second < 10 || second >= 20 ? 'non_positive' : 'positive', respawnSignature: 'stable', pawnLinkPresence: second < 10 || second >= 20 } });
    const events = [];
    for (const [index, family] of ['healthBoundary', 'booleanAlive', 'respawnBoundary', 'pawnLinkPresence'].entries()) { events.push({ key: `f${index}`, participantKey: 'participant_01', family, sourceFamily: family === 'pawnLinkPresence' ? 'pawnLink' : family, second: 10, direction: 'forward', toState: states[10].state[family] }); events.push({ key: `i${index}`, participantKey: 'participant_01', family, sourceFamily: family === 'pawnLinkPresence' ? 'pawnLink' : family, second: 20, direction: 'inverse', toState: states[20].state[family] }); }
    return createSemanticArtifact({ replayId: 'replay_010', identity: { participants: [{ participantKey: 'participant_01' }] }, transitions: { transitionCandidates: [{ transitionKey: anchor.sourceTransitionKey, participantKey: anchor.participantKey, normalizedElapsedSecond: 10 }] }, anchors: { candidates: [anchor] }, controls: { evidenceRows: [{ ...anchor, anchorNormalizedElapsedSecond: 10, controlNormalizedElapsedSecond: 100 }] }, mapped: { samples: new Map([['participant_01', states]]), events, failures: 0 }, replayEndSecond: 200 }).artifact;
}
test('semantic sequence schema accepts policy-safe operational sequence evidence', () => { const result = validateJsonSchema(schema, fixtureArtifact()); assert.equal(result.valid, true, result.errors.join('\n')); assert.equal(result.draft, '2020-12'); });
test('semantic sequence schema rejects raw fields and final facts', () => { const value = fixtureArtifact(); value.evidenceRows[0].rawFieldName = 'm_iHealth'; assert.equal(validateJsonSchema(schema, value).valid, false); const value2 = fixtureArtifact(); value2.evidenceRows[0].finalFact = true; assert.equal(validateJsonSchema(schema, value2).valid, false); });
