import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import test from 'node:test';
import { buildCanonicalState } from '../lib/canonical-state/builder.mjs';
import { createCanonicalIo } from '../lib/canonical-state/io-layer.mjs';
import { createReplay002Manifest } from '../tools/build-replay-002-canonical-state.mjs';

const canonicalDir = 'output/replay-002-canonical';
const correctionDir = 'output/replay-002-canonical-correction';

async function readJson(file) {
    return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function readJsonl(file) {
    const text = await fs.readFile(file, 'utf8');
    return text.trim().split(/\r?\n/u).filter(Boolean).map(line => JSON.parse(line));
}

function walk(value, visitor, path = []) {
    visitor(value, path);
    if (Array.isArray(value)) value.forEach((item, index) => walk(item, visitor, [...path, String(index)]));
    else if (value && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) walk(child, visitor, [...path, key]);
    }
}

test('core builder contains no replay-specific literals', async () => {
    const source = await fs.readFile('lib/canonical-state/builder.mjs', 'utf8');
    assert(!source.includes('replay_002'));
    assert(!source.includes('partida_002.dem'));
    assert(!source.includes('output/replays/replay_002'));
    assert(!source.includes('replay_009'));
});

test('two synthetic manifests prove the core is parameterized', async () => {
    const base = await createReplay002Manifest({
        outputDir: 'output-local/synthetic-canonical-a',
        assessmentDir: 'output-local/synthetic-assessment-a'
    });
    const makeSynthetic = (id, outputDir, assessmentDir) => ({
        ...base,
        replayId: id,
        eventIdPrefix: `${id}:event`,
        outputDir,
        assessmentDir,
        expectedGate: `${id}:gate`,
        followUpTaskPath: `output-local/${id}-followup.md`
    });
    for (const manifest of [
        makeSynthetic('synthetic_alpha', 'output-local/synthetic-canonical-alpha', 'output-local/synthetic-assessment-alpha'),
        makeSynthetic('synthetic_beta', 'output-local/synthetic-canonical-beta', 'output-local/synthetic-assessment-beta')
    ]) {
        const io = createCanonicalIo({ allowlist: manifest.allowedInputs, generatedRootPrefixes: [manifest.outputDir, manifest.assessmentDir] });
        const result = await buildCanonicalState(manifest, io, { clean: true });
        assert.equal(result.correctionSummary.replayId, manifest.replayId);
        const gate = await readJson(`${manifest.outputDir}/canonical-state-gate.json`);
        assert.equal(gate.replayId, manifest.replayId);
    }
});

test('allowlist rejects protected replays including 005 and 006-008', async () => {
    const manifest = await createReplay002Manifest();
    const io = createCanonicalIo({ allowlist: manifest.allowedInputs, generatedRootPrefixes: [manifest.outputDir, manifest.assessmentDir] });
    await assert.rejects(() => io.hashAllowedFile('samples/partida_005.dem', { accessClass: 'raw_replay', mode: 'test' }), /Forbidden input/);
    await assert.rejects(() => io.hashAllowedFile('samples/partida_006.dem', { accessClass: 'raw_replay', mode: 'test' }), /Forbidden input/);
    await assert.rejects(() => io.hashAllowedFile('samples/replay_007_bots01.dem', { accessClass: 'raw_replay', mode: 'test' }), /Forbidden input/);
    await assert.rejects(() => io.hashAllowedFile('samples/replay_008_bots02_short.dem', { accessClass: 'raw_replay', mode: 'test' }), /Forbidden input/);
});

test('raw replay access is identity hash only and parser result is imported', async () => {
    const raw = await readJson(`${correctionDir}/raw-replay-access-classification.json`);
    assert.equal(raw.accessClassification, 'raw_replay_identity_hash_verified');
    assert.equal(raw.parserExecutedInThisTask, false);
    assert.equal(raw.telemetryExtractedInThisTask, false);
    assert.equal(raw.parserResultSource, 'output/parser-compatibility/parser-compatibility-matrix.json');
    const log = await readJson(`${correctionDir}/input-access-log.json`);
    assert.equal(log.accesses.filter(record => record.accessClass === 'raw_replay').length, 1);
});

test('epistemic types distinguish direct observations from derivations', async () => {
    const events = await readJsonl(`${canonicalDir}/factual-events.jsonl`);
    const team = events.filter(event => event.eventCategory === 'team_net_worth');
    assert(team.length > 0);
    assert(team.every(event => event.provenance.epistemicType === 'deterministic_derivation'));
    assert(team.every(event => event.provenance.formula?.includes('sum')));
    const inferredRespawns = events.filter(event => event.eventType === 'player_return_inferred');
    assert(inferredRespawns.length > 0);
    assert(inferredRespawns.every(event => event.provenance.epistemicType === 'deterministic_derivation'));
    const identity = events.filter(event => event.eventCategory === 'player_identity');
    assert(identity.every(event => event.provenance.epistemicType === 'direct_parser_observation'));
});

test('handles, entity indexes, and generations are separated and not fabricated', async () => {
    const registry = await readJson(`${canonicalDir}/entity-registry.json`);
    assert(registry.entities.length > 0);
    assert(registry.entities.every(entity => Object.hasOwn(entity, 'rawHandle')));
    assert(registry.entities.every(entity => entity.entityIndex === null));
    assert(registry.entities.every(entity => entity.entityIndexSource === 'not_decoded'));
    assert(registry.entities.every(entity => entity.entityGeneration === null));
    assert(registry.entities.every(entity => entity.generationStatus === 'unavailable'));
    const audit = await readJson(`${correctionDir}/identity-and-generation-audit.json`);
    assert.equal(audit.fabricatedGenerationCount, 0);
    assert.equal(audit.eventRegistryReferenceMismatches.length, 0);
});

test('canonical entity keys and promoted values do not leak spatial semantics', async () => {
    const registry = await readJson(`${canonicalDir}/entity-registry.json`);
    const events = await readJsonl(`${canonicalDir}/factual-events.jsonl`);
    assert(registry.entities.every(entity => !entity.entityKey.includes('lane_axis_')));
    const forbiddenFields = new Set(['lane', 'laneAxis', 'laneProgress', 'nearestLane', 'region', 'mapRegion', 'structuralRegion', 'proximity', 'transform', 'residual']);
    for (const value of [registry, events, await readJsonl(`${canonicalDir}/snapshots.jsonl`)]) {
        walk(value, (node, parts) => {
            const key = parts.at(-1);
            assert(!forbiddenFields.has(key), `forbidden field ${parts.join('.')}`);
            if (typeof node === 'string' && node.includes('lane_axis_')) {
                const path = parts.join('.');
                assert(path.includes('provenance') && path.endsWith('legacySourceIdentifier.value'), `promoted spatial string ${path}`);
            }
        });
    }
    const audit = await readJson(`${correctionDir}/spatial-leakage-audit.json`);
    assert.equal(audit.findings.length, 0);
});

test('all records validate against contract and schema diff covers variants', async () => {
    const validation = await readJson(`${correctionDir}/canonical-schema-validation.json`);
    assert.equal(validation.valid, true);
    assert(validation.eventVariants.length >= 5);
    const diff = await readJson(`${correctionDir}/canonical-schema-diff.json`);
    assert(diff.replay009Schemas);
    assert(diff.replay002Schemas.factualEventVariants);
    assert(diff.contract);
});

test('schema break detection is not name-based suppression', async () => {
    const diff = await readJson(`${correctionDir}/canonical-schema-diff.json`);
    assert(Array.isArray(diff.schemaBreaks));
    assert(diff.replay002VsReplay009KnownDifferences.some(item => item.category === 'entity_identity'));
});

test('zero health and delete are not destruction, and forbidden conclusions are absent', async () => {
    const events = await readJsonl(`${canonicalDir}/factual-events.jsonl`);
    const text = JSON.stringify(events);
    assert(!text.includes('"eventType":"destroyed"'));
    assert(!text.includes('"eventType":"killed"'));
    assert(!text.includes('"eventType":"secured"'));
    assert(!text.includes('"eventType":"claimed"'));
    assert(!text.includes('"eventType":"deposited"'));
    assert(!text.includes('mechanicEffectApplied":true'));
    assert(!text.includes('fight_quality'));
    assert(!text.includes('macro'));
    assert(!text.includes('decision_quality'));
});

test('replay 009 overlays are not applied and deterministic rerun is stable', async () => {
    const overlay = await readJson(`${canonicalDir}/independent-validation-overlay.json`);
    assert.equal(overlay.overlays.length, 0);
    assert.equal(overlay.status, 'not_available_for_target_replay');
    const rerun = await readJson(`${correctionDir}/deterministic-rerun.json`);
    assert.equal(rerun.deterministic, true);
    assert.equal(rerun.mismatches.length, 0);
});
