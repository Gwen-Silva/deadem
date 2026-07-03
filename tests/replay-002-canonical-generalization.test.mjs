import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import test from 'node:test';

const canonicalDir = 'output/replay-002-canonical';
const assessmentDir = 'output/replay-002-canonical-generalization';

async function readJson(path) {
    return JSON.parse(await fs.readFile(path, 'utf8'));
}

async function readJsonl(path) {
    const text = await fs.readFile(path, 'utf8');
    return text.trim().split(/\r?\n/u).filter(Boolean).map(line => JSON.parse(line));
}

function walk(value, visitor, path = []) {
    visitor(value, path);
    if (Array.isArray(value)) {
        value.forEach((item, index) => walk(item, visitor, [...path, String(index)]));
    } else if (value && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) {
            walk(child, visitor, [...path, key]);
        }
    }
}

test('Task 082 canonical package is constrained-ready and replay 002 scoped', async () => {
    const gate = await readJson(`${assessmentDir}/generalization-gate.json`);
    const summary = await readJson(`${assessmentDir}/generalization-summary.json`);
    assert.equal(gate.gate, 'replay_002_canonical_factual_state_ready_with_constraints');
    assert.equal(summary.rawReplayProcessed, 'samples/partida_002.dem');
    assert.equal(summary.parserResult.completed, true);
    assert.equal(summary.playersObserved, 12);
    assert.deepEqual(summary.rawTeamDistribution, { 2: 6, 3: 6 });
    assert.equal(summary.provenanceAudit.replay005Accessed, false);
    assert.equal(summary.provenanceAudit.botFixturesProcessed, false);
});

test('input access log records only the allowed raw replay and no protected fixtures', async () => {
    const log = await readJson(`${assessmentDir}/input-access-log.json`);
    const rawProcessed = log.reads.filter(record => record.accessClass === 'raw_replay_processed');
    assert.deepEqual(rawProcessed.map(record => record.path), ['samples/partida_002.dem']);
    const paths = log.reads.map(record => record.path).join('\n');
    assert(!paths.includes('partida_005'));
    assert(!paths.includes('replay_006'));
    assert(!paths.includes('replay_007'));
    assert(!paths.includes('replay_008'));
});

test('canonical events preserve provenance, generations, and semantic boundaries', async () => {
    const events = await readJsonl(`${canonicalDir}/factual-events.jsonl`);
    assert(events.length > 0);
    for (const event of events) {
        assert(event.provenance?.sourceTask, event.eventId);
        assert(event.provenance?.sourcePath, event.eventId);
        assert(event.provenance?.derivationMethod, event.eventId);
        assert.equal(event.epistemicStatus?.mechanicEffectApplied, false, event.eventId);
        assert.notEqual(event.eventType, 'destroyed', event.eventId);
        assert.notEqual(event.eventType, 'killed', event.eventId);
        assert.notEqual(event.eventType, 'secured', event.eventId);
        assert.notEqual(event.eventType, 'claimed', event.eventId);
        assert.notEqual(event.eventType, 'deposited', event.eventId);
    }

    const entities = await readJson(`${canonicalDir}/entity-registry.json`);
    for (const entity of entities.entities) {
        if (entity.entityIndex !== null) {
            assert.notEqual(entity.entityGeneration, undefined, entity.entityKey);
        }
    }
});

test('forbidden spatial and semantic layers are not emitted as canonical fields', async () => {
    const events = await readJsonl(`${canonicalDir}/factual-events.jsonl`);
    const snapshots = await readJsonl(`${canonicalDir}/snapshots.jsonl`);
    const packageValues = [events, snapshots, await readJson(`${canonicalDir}/entity-registry.json`)];
    const forbiddenKeys = new Set(['lane', 'laneAxis', 'region', 'mapRegion', 'proximity', 'transform', 'residual']);
    for (const value of packageValues) {
        walk(value, (_node, path) => {
            const key = path.at(-1);
            assert(!forbiddenKeys.has(key), `forbidden canonical key emitted: ${path.join('.')}`);
        });
    }
});

test('replay 009 overlays and build mechanics are not inherited', async () => {
    const overlay = await readJson(`${canonicalDir}/independent-validation-overlay.json`);
    assert.equal(overlay.overlays.length, 0);
    assert.equal(overlay.status, 'not_available_for_replay_002');
    const validation = await readJson(`${canonicalDir}/validation-summary.json`);
    assert.equal(validation.mechanicEffectsApplied, 0);
    assert.equal(validation.independentValidation, 'not_available_for_replay_002');
});

test('schema diff is programmatic and has no material schema breaks', async () => {
    const diff = await readJson(`${assessmentDir}/canonical-schema-diff.json`);
    assert(diff.replay009);
    assert(diff.replay002);
    assert.equal(diff.summary.schemaBreaks, 0);
    assert(diff.summary.sourceUnavailableInReplay002 > 0);
});

test('deterministic rerun matched generated payloads', async () => {
    const rerun = await readJson(`${assessmentDir}/deterministic-rerun.json`);
    assert.equal(rerun.deterministic, true);
    assert.equal(rerun.mismatches.length, 0);
    assert(rerun.comparedFiles > 0);
});
