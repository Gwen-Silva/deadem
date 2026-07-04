import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import test from 'node:test';
import { buildCanonicalState } from '../lib/canonical-state/builder.mjs';
import { createCanonicalIo } from '../lib/canonical-state/io-layer.mjs';
import { createReplay002Manifest } from '../tools/build-replay-002-canonical-state.mjs';

const canonicalDir = 'output/replay-002-canonical';
const correctionDir = 'output/replay-002-canonical-v3-validation';

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

async function writeJson(file, value) {
    await fs.mkdir(file.split('/').slice(0, -1).join('/'), { recursive: true });
    await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeJsonl(file, rows) {
    await fs.mkdir(file.split('/').slice(0, -1).join('/'), { recursive: true });
    await fs.writeFile(file, `${rows.map(row => JSON.stringify(row)).join('\n')}\n`);
}

async function makeSyntheticManifest(id, seed) {
    const root = `output-local/${id}-sources`;
    const rawReplay = `${root}/${id}.dem`;
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(rawReplay, `synthetic replay identity ${id} ${seed}\n`);
    const parserMatrix = `${root}/parser-matrix.json`;
    const matchStateQuality = `${root}/match-state-quality.json`;
    const oneSecondQuality = `${root}/one-second-quality.json`;
    const deathEvents = `${root}/death-events.json`;
    const deathValidation = `${root}/death-validation.json`;
    const respawnEvents = `${root}/respawn-events.json`;
    const objectiveInventory = `${root}/objective-inventory.json`;
    const objectiveLifecycle = `${root}/objective-lifecycle.json`;
    const referencePlayerRegistry = `${root}/reference-player-registry.json`;
    const referenceEntityRegistry = `${root}/reference-entity-registry.json`;
    const referenceFactualEvents = `${root}/reference-factual-events.jsonl`;
    const referenceMetadata = `${root}/reference-metadata.json`;
    const referenceOverlay = `${root}/reference-overlay.json`;
    const referenceSnapshots = `${root}/reference-snapshots.jsonl`;
    const referenceCapabilities = `${root}/reference-capabilities.json`;
    const referenceValidation = `${root}/reference-validation.json`;
    const matchStateIndex = `${root}/match-state-index.jsonl`;
    const matchShard = `${root}/match-state-shard.jsonl`;
    await writeJson(parserMatrix, { rows: [{ replayId: id, modes: { default_parser: { completed: true, finalParsedTick: 100 + seed } } }] });
    await writeJson(matchStateQuality, { summary: { synthetic: true, seed } });
    await writeJson(oneSecondQuality, { playerReconciliation: { players: [
        { playerId: `${id}:p1`, team: 2, heroId: 10 + seed, controllerHandle: 1000 + seed },
        { playerId: `${id}:p2`, team: 3, heroId: 20 + seed, controllerHandle: 2000 + seed }
    ] } });
    await writeJson(deathEvents, { events: [{ eventId: `${id}:death:1`, tick: 50 + seed, gameTimeSeconds: 5 + seed, victim: { playerId: `${id}:p1`, team: 2 }, evidence: [{ name: 'synthetic_counter' }], confidence: 'supported', validationFlags: [] }] });
    await writeJson(deathValidation, { summary: { matchedEvents: 1, synthetic: true } });
    await writeJson(respawnEvents, { events: [{ eventId: `${id}:respawn:1`, playerId: `${id}:p1`, team: 2, respawn: { tick: 70 + seed, gameTimeSeconds: 7 + seed, deadDurationSeconds: 2 }, validationFlags: [] }] });
    await writeJson(objectiveInventory, { entities: [{ objectiveId: `${id}:objective:1`, entityClass: seed === 1 ? 'CNPC_MidBoss' : 'CNPC_Boss_Tier2', handles: [3000 + seed], team: 2, firstObservedTime: 0, lastObservedTime: 10, healthFields: ['health'], maxHealthFields: ['maxHealth'], observedHealthSummary: { count: 1, min: 100, max: 100, examples: [100] }, classification: 'candidate', confidence: 'supported' }] });
    await writeJson(objectiveLifecycle, { events: [{ eventId: `${id}:objective-event:1`, objectiveId: `${id}:objective:1`, eventType: 'objective_spawned', tick: 1, gameTimeSeconds: 1, value: { health: 100 }, previousValue: null, sourceField: 'synthetic.health', confidence: 'supported', flags: [] }] });
    await writeJson(referencePlayerRegistry, { schemaVersion: '1.0.0', replayId: `${id}:reference`, players: [] });
    await writeJson(referenceEntityRegistry, { schemaVersion: '1.0.0', replayId: `${id}:reference`, entities: [] });
    await writeJsonl(referenceFactualEvents, []);
    await writeJson(referenceMetadata, { schemaVersion: '1.0.0', replayId: `${id}:reference`, records: [] });
    await writeJson(referenceOverlay, { schemaVersion: '1.0.0', replayId: `${id}:reference`, overlays: [] });
    await writeJsonl(referenceSnapshots, []);
    await writeJson(referenceCapabilities, { schemaVersion: '1.0.0', replayId: `${id}:reference`, capabilities: [] });
    await writeJson(referenceValidation, { schemaVersion: '1.0.0', replayId: `${id}:reference`, gate: 'synthetic_reference' });
    await writeJsonl(matchStateIndex, [{ file: matchShard }]);
    await writeJsonl(matchShard, [{ tick: 10 + seed, gameTimeSeconds: 1 + seed, players: [
        { playerId: `${id}:p1`, team: 2, alive: true, position: { quality: 'direct', x: seed, y: seed + 1, z: 0 }, netWorth: 100 + seed },
        { playerId: `${id}:p2`, team: 3, alive: true, position: { quality: 'direct', x: seed + 2, y: seed + 3, z: 0 }, netWorth: 90 + seed }
    ] }]);
    const sources = {
        rawReplay: { path: rawReplay, sourceTask: 'synthetic_fixture' },
        parserMatrix: { path: parserMatrix, sourceTask: 'synthetic_fixture' },
        matchStateQuality: { path: matchStateQuality, sourceTask: 'synthetic_fixture' },
        oneSecondQuality: { path: oneSecondQuality, sourceTask: 'synthetic_fixture' },
        deathEvents: { path: deathEvents, sourceTask: 'synthetic_fixture' },
        deathValidation: { path: deathValidation, sourceTask: 'synthetic_fixture' },
        respawnEvents: { path: respawnEvents, sourceTask: 'synthetic_fixture' },
        objectiveInventory: { path: objectiveInventory, sourceTask: 'synthetic_fixture' },
        objectiveLifecycle: { path: objectiveLifecycle, sourceTask: 'synthetic_fixture' },
        referencePlayerRegistry: { path: referencePlayerRegistry, sourceTask: 'synthetic_fixture' },
        referenceEntityRegistry: { path: referenceEntityRegistry, sourceTask: 'synthetic_fixture' },
        referenceFactualEvents: { path: referenceFactualEvents, sourceTask: 'synthetic_fixture' },
        referenceMetadata: { path: referenceMetadata, sourceTask: 'synthetic_fixture' },
        referenceOverlay: { path: referenceOverlay, sourceTask: 'synthetic_fixture' },
        referenceSnapshots: { path: referenceSnapshots, sourceTask: 'synthetic_fixture' },
        referenceCapabilities: { path: referenceCapabilities, sourceTask: 'synthetic_fixture' },
        referenceValidation: { path: referenceValidation, sourceTask: 'synthetic_fixture' },
        matchStateIndex: { path: matchStateIndex, sourceTask: 'synthetic_fixture' },
        matchStateShard: { path: matchShard, sourceTask: 'synthetic_fixture' }
    };
    const base = await createReplay002Manifest({
        outputDir: `output-local/${id}-canonical`,
        assessmentDir: `output-local/${id}-assessment`
    });
    return {
        ...base,
        replayId: id,
        parserMatrixReplayId: id,
        eventIdPrefix: `${id}:event`,
        rawReplay: { path: rawReplay, accessMode: 'raw_replay_identity_hash_verified' },
        sources,
        allowedInputs: [...Object.values(sources).map(source => source.path), matchShard],
        outputDir: `output-local/${id}-canonical`,
        assessmentDir: `output-local/${id}-assessment`,
        followUpTaskPath: `output-local/${id}-followup.md`
    };
}

test('core builder contains no replay-specific literals', async () => {
    const source = await fs.readFile('lib/canonical-state/builder.mjs', 'utf8');
    assert(!source.includes('replay_002'));
    assert(!source.includes('partida_002.dem'));
    assert(!source.includes('output/replays/replay_002'));
    assert(!source.includes('replay_009'));
});

test('pipeline wrappers and core do not read factual inputs outside IO layer', async () => {
    const files = [
        'tools/build-replay-002-canonical-state.mjs',
        'lib/canonical-state/builder.mjs'
    ];
    for (const file of files) {
        const source = await fs.readFile(file, 'utf8');
        assert(!source.includes('readFile('), `${file} uses readFile`);
        assert(!source.includes('createReadStream('), `${file} uses createReadStream`);
        assert(!source.includes('stat('), `${file} uses stat`);
        assert(!source.includes('open('), `${file} uses open`);
    }
    const ioSource = await fs.readFile('lib/canonical-state/io-layer.mjs', 'utf8');
    assert(ioSource.includes('readFile('));
    assert(ioSource.includes('createReadStream('));
});

test('two synthetic manifests prove the core is parameterized', async () => {
    for (const manifest of [
        await makeSyntheticManifest('synthetic_alpha', 1),
        await makeSyntheticManifest('synthetic_beta', 2)
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

test('contract validation covers every artifact and final gate follows matrix', async () => {
    const validation = await readJson(`${correctionDir}/canonical-schema-validation.json`);
    const expectedArtifacts = ['playerRegistry', 'entityRegistry', 'factualEvents', 'nonTimelineMetadata', 'independentValidationOverlay', 'snapshots', 'capabilityMatrix', 'validationSummary', 'canonicalStateGate'];
    for (const artifact of expectedArtifacts) {
        assert(validation.byArtifact[artifact], `missing validation artifact ${artifact}`);
        assert.equal(validation.byArtifact[artifact].errors.length, 0, artifact);
    }
    assert.equal(validation.totalRecordsFound, validation.totalRecordsValidated);
    const matrix = await readJson(`${correctionDir}/validation-matrix.json`);
    assert.equal(matrix.contractValidationPassed, true);
    assert.equal(matrix.schemaDiffExecuted, true);
    assert.equal(matrix.targetSchemaBreaks, 0);
    assert.equal(matrix.provenanceAuditPassed, true);
    assert.equal(matrix.ioAuditPassed, true);
    assert.equal(matrix.deterministicRerunPassed, true);
    const gate = await readJson(`${correctionDir}/correction-gate.json`);
    assert.equal(gate.success, true);
    assert.equal(gate.gate, 'replay_002_canonical_factual_state_ready_with_constraints_v3');
});

test('schema diff is real and negative schema cases fail', async () => {
    const diff = await readJson(`${correctionDir}/canonical-schema-diff.json`);
    assert(diff.targetV2VersusContractV3);
    assert.equal(diff.targetV2VersusContractV3.schemaBreaks, 0);
    assert(diff.replay009V1VersusContractV3.differences.length > 0);
    assert(diff.replay009V1VersusReplay002V3.differences.length > 0);

    const { validateCanonicalPackage, CANONICAL_CONTRACT } = await import('../lib/canonical-state/contract.mjs');
    const events = await readJsonl(`${canonicalDir}/factual-events.jsonl`);
    const packageData = {
        playerRegistry: await readJson(`${canonicalDir}/player-registry.json`),
        entityRegistry: await readJson(`${canonicalDir}/entity-registry.json`),
        factualEvents: events,
        nonTimelineMetadata: await readJson(`${canonicalDir}/non-timeline-metadata.json`),
        independentValidationOverlay: await readJson(`${canonicalDir}/independent-validation-overlay.json`),
        snapshots: await readJsonl(`${canonicalDir}/snapshots.jsonl`),
        capabilityMatrix: await readJson(`${canonicalDir}/capability-matrix.json`),
        validationSummary: await readJson(`${canonicalDir}/validation-summary.json`),
        canonicalGate: await readJson(`${canonicalDir}/canonical-state-gate.json`)
    };
    const renamed = structuredClone(packageData);
    renamed.factualEvents[0].eventIdRenamed = renamed.factualEvents[0].eventId;
    delete renamed.factualEvents[0].eventId;
    assert.equal(validateCanonicalPackage(renamed, CANONICAL_CONTRACT).valid, false);

    const typed = structuredClone(packageData);
    typed.factualEvents[0].time.demoTick = '0';
    assert.equal(validateCanonicalPackage(typed, CANONICAL_CONTRACT).valid, false);

    const noProv = structuredClone(packageData);
    delete noProv.factualEvents[0].provenance;
    assert.equal(validateCanonicalPackage(noProv, CANONICAL_CONTRACT).valid, false);

    const unknownVariant = structuredClone(packageData);
    unknownVariant.factualEvents[0].eventType = 'new_unknown_variant';
    assert.equal(validateCanonicalPackage(unknownVariant, CANONICAL_CONTRACT).valid, false);

    const forbidden = structuredClone(packageData);
    forbidden.factualEvents[0].laneAxis = 'lane_axis_1';
    assert.equal(validateCanonicalPackage(forbidden, CANONICAL_CONTRACT).valid, false);
});
