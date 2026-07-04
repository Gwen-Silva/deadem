import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildCanonicalState, contractToShape, diffSchema, inferSchema } from '../lib/canonical-state/builder.mjs';
import { CANONICAL_CONTRACT, canonicalContractForJson } from '../lib/canonical-state/contract.mjs';
import { createCanonicalIo } from '../lib/canonical-state/io-layer.mjs';
import { auditContractSourceConsistency } from '../lib/canonical-state/audits/contract-source-consistency.mjs';
import { auditDocumentation } from '../lib/canonical-state/audits/documentation-audit.mjs';
import { auditDirectObservations, auditEpistemicClassification } from '../lib/canonical-state/audits/epistemic-audit.mjs';
import { auditIoPolicy } from '../lib/canonical-state/audits/io-policy-audit.mjs';
import { buildFinalAttestation, listFilesRecursive, verifyBaseAuditManifest, verifyFinalAttestation, writeBaseManifestAndVerification } from '../lib/canonical-state/audits/artifact-attestation.mjs';
import { loadCanonicalPackage, readJson, readJsonl, sha256File, sha256Text, stableStringify, writeJson } from '../lib/canonical-state/audits/common.mjs';
import { createReplay002Manifest } from './build-replay-002-canonical-state.mjs';

const DEFAULT_OUTPUT = 'output/replay-002-canonical';
const DEFAULT_ASSESSMENT = 'output/replay-002-canonical-v7-validation';
const REPORT = 'reports/replay-002-canonical-factual-state-v7-validation.md';
const SUCCESS_GATE = 'replay_002_canonical_factual_state_ready_with_constraints_v7';
const BLOCKED_GATE = 'replay_002_canonical_factual_state_v7_blocked';

function parseArgs() {
    const args = process.argv.slice(2);
    const options = { outputDir: DEFAULT_OUTPUT, assessmentDir: DEFAULT_ASSESSMENT, clean: false, skipRerun: false };
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === '--output') options.outputDir = args[++index];
        else if (arg === '--assessment-output') options.assessmentDir = args[++index];
        else if (arg === '--clean') options.clean = true;
        else if (arg === '--skip-rerun') options.skipRerun = true;
    }
    return options;
}

async function writeText(file, text) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, text);
}

function runNode(args) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, args, { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', chunk => { stdout += chunk; });
        child.stderr.on('data', chunk => { stderr += chunk; });
        child.on('close', code => {
            if (code === 0) resolve({ stdout, stderr });
            else reject(new Error(`node ${args.join(' ')} failed with ${code}\n${stdout}\n${stderr}`));
        });
    });
}

async function hashTree(root, replacements) {
    const files = await listFilesRecursive(root);
    const records = [];
    for (const file of files) {
        const relativePath = path.relative(root, file).replaceAll(path.sep, '/');
        let text = await fs.readFile(file, 'utf8');
        for (const [from, to] of replacements) text = text.replaceAll(from, to);
        records.push({ path: relativePath, sha256: createHash('sha256').update(text).digest('hex') });
    }
    return records;
}

function compareTrees(a, b, tree) {
    const remaining = new Map(b.map(record => [record.path, record.sha256]));
    const mismatches = [];
    for (const record of a) {
        const second = remaining.get(record.path);
        if (!second) mismatches.push({ tree, path: record.path, issue: 'missing_in_second_run' });
        else if (second !== record.sha256) mismatches.push({ tree, path: record.path, issue: 'hash_mismatch', first: record.sha256, second });
        remaining.delete(record.path);
    }
    for (const pathName of [...remaining.keys()].sort()) mismatches.push({ tree, path: pathName, issue: 'extra_in_second_run' });
    return mismatches;
}

function normalizePairs(aOutput, aAssessment, bOutput, bAssessment) {
    const norm = value => value.replaceAll('/', path.sep);
    const escaped = value => value.replaceAll('\\', '\\\\');
    return {
        a: [[aOutput, '<canonical-output>'], [aAssessment, '<assessment-output>'], [norm(aOutput), '<canonical-output>'], [norm(aAssessment), '<assessment-output>'], [escaped(norm(aOutput)), '<canonical-output>'], [escaped(norm(aAssessment)), '<assessment-output>']],
        b: [[bOutput, '<canonical-output>'], [bAssessment, '<assessment-output>'], [norm(bOutput), '<canonical-output>'], [norm(bAssessment), '<assessment-output>'], [escaped(norm(bOutput)), '<canonical-output>'], [escaped(norm(bAssessment)), '<assessment-output>']]
    };
}

async function fullPipelineDeterminism() {
    const root = 'output-local/replay-002-canonical-v7-rerun';
    const aOutput = `${root}/a/canonical`;
    const aAssessment = `${root}/a/assessment`;
    const bOutput = `${root}/b/canonical`;
    const bAssessment = `${root}/b/assessment`;
    await fs.rm(root, { recursive: true, force: true });
    await runNode(['tools/finalize-replay-002-canonical-v7.mjs', '--clean', '--skip-rerun', '--output', aOutput, '--assessment-output', aAssessment]);
    await runNode(['tools/finalize-replay-002-canonical-v7.mjs', '--clean', '--skip-rerun', '--output', bOutput, '--assessment-output', bAssessment]);
    const replacements = normalizePairs(aOutput, aAssessment, bOutput, bAssessment);
    const canonicalA = await hashTree(aOutput, replacements.a);
    const canonicalB = await hashTree(bOutput, replacements.b);
    const assessmentA = await hashTree(aAssessment, replacements.a);
    const assessmentB = await hashTree(bAssessment, replacements.b);
    const canonicalMismatches = compareTrees(canonicalA, canonicalB, 'canonical');
    const assessmentMismatches = compareTrees(assessmentA, assessmentB, 'assessment');
    return {
        schemaVersion: 1,
        taskId: '088',
        replayId: 'replay_002',
        fullPipeline: true,
        deterministic: canonicalMismatches.length === 0 && assessmentMismatches.length === 0,
        firstRun: { canonicalDir: aOutput, assessmentDir: aAssessment, canonicalFileCount: canonicalA.length, assessmentFileCount: assessmentA.length },
        secondRun: { canonicalDir: bOutput, assessmentDir: bAssessment, canonicalFileCount: canonicalB.length, assessmentFileCount: assessmentB.length },
        comparedCanonicalFiles: canonicalA.length,
        comparedAuditFiles: assessmentA.filter(record => !['evidence-matrix.json', 'validation-matrix.json', 'correction-gate.json', 'correction-summary.json', 'final-attestation.json', 'final-attestation-verification.json', 'release-decision.json'].includes(record.path)).length,
        comparedFinalFiles: assessmentA.filter(record => ['evidence-matrix.json', 'validation-matrix.json', 'correction-gate.json', 'correction-summary.json', 'final-attestation.json', 'final-attestation-verification.json', 'release-decision.json'].includes(record.path)).length,
        normalizationsApplied: [
            { field: 'temporary canonical output root', reason: 'root differs by A/B run, relative artifact paths and stored hashes are preserved' },
            { field: 'temporary assessment output root', reason: 'root differs by A/B run, relative artifact paths and stored hashes are preserved' }
        ],
        mismatches: [...canonicalMismatches, ...assessmentMismatches]
    };
}

function artifactRef(assessmentDir, name, passed) {
    return async () => ({
        passed,
        artifact: name,
        path: path.join(assessmentDir, name).replaceAll(path.sep, '/'),
        sha256: await sha256File(path.join(assessmentDir, name))
    });
}

function shapeHash(shape) {
    return sha256Text(stableStringify(shape));
}

function normalizeRootStrings(value, manifest) {
    if (typeof value === 'string') {
        return value
            .replaceAll(manifest.outputDir, '<canonical-output>')
            .replaceAll(manifest.assessmentDir, '<assessment-output>')
            .replaceAll(manifest.outputDir.replaceAll('/', path.sep), '<canonical-output>')
            .replaceAll(manifest.assessmentDir.replaceAll('/', path.sep), '<assessment-output>');
    }
    if (Array.isArray(value)) return value.map(item => normalizeRootStrings(item, manifest));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, normalizeRootStrings(child, manifest)]));
    return value;
}

async function normalizeRootSensitiveJson(file, manifest) {
    const value = await readJson(file);
    await writeJson(file, normalizeRootStrings(value, manifest));
}

function comparisonRecord(differences) {
    const byClassification = {};
    for (const diff of differences) byClassification[diff.classification] = (byClassification[diff.classification] ?? 0) + 1;
    return { differences, differenceCount: differences.length, byClassification };
}

function compareArtifact({ ledger, comparisonId, artifactId, sourceShape, targetShape, comparatorId, comparator }) {
    const entry = {
        comparison: comparisonId,
        artifact: artifactId,
        sourceShapeHash: shapeHash(sourceShape),
        targetShapeHash: shapeHash(targetShape),
        comparatorId,
        status: 'started',
        differenceCount: null,
        differenceClassifications: {},
        error: null
    };
    ledger.entries.push(entry);
    try {
        const differences = comparator(sourceShape, targetShape);
        entry.status = 'completed';
        entry.differenceCount = differences.length;
        for (const diff of differences) entry.differenceClassifications[diff.classification] = (entry.differenceClassifications[diff.classification] ?? 0) + 1;
        return differences;
    } catch (error) {
        entry.status = 'failed';
        entry.error = error.message;
        return [{ path: artifactId, classification: 'comparison_error', justification: error.message, impact: 'gate_blocking' }];
    }
}

function coverageFromLedger(ledger) {
    const required = {
        targetReplay002V7VersusContractV7: ['playerRegistry', 'entityRegistry', 'factualEventVariants', 'metadataVariants', 'independentValidationOverlay', 'snapshot', 'capabilityMatrix', 'validationSummary', 'canonicalGate'],
        replay009V1VersusContractV7: ['playerRegistry', 'entityRegistry', 'factualEventVariants', 'metadata', 'metadataVariants', 'independentValidationOverlay', 'snapshot', 'capabilityMatrix', 'validationSummary', 'canonicalGate'],
        replay009V1VersusReplay002V7: ['playerRegistry', 'entityRegistry', 'factualEventVariants', 'metadata', 'independentValidationOverlay', 'snapshot', 'capabilityMatrix', 'validationSummary']
    };
    const comparisons = [];
    for (const [comparison, requiredArtifacts] of Object.entries(required)) {
        const successful = ledger.entries.filter(entry => entry.comparison === comparison && entry.status === 'completed' && entry.sourceShapeHash && entry.targetShapeHash && entry.comparatorId && !entry.error).map(entry => entry.artifact);
        const missingComparisons = requiredArtifacts.filter(artifact => !successful.includes(artifact));
        comparisons.push({ comparison, requiredArtifacts, actuallyComparedArtifacts: successful, missingComparisons, passed: missingComparisons.length === 0 });
    }
    return { schemaVersion: 1, comparisons, passed: comparisons.every(item => item.passed) };
}

function historicalMetadataVariants(referenceMetadata) {
    const records = referenceMetadata.records ?? [];
    return records.map((record, index) => ({
        recordIndex: index,
        variantKey: record.metadataId ?? `historical_record_${String(index).padStart(3, '0')}`,
        discriminator: record.metadataId ?? null,
        classification: record.metadataId ? 'historical_metadata_variant_observed' : 'historical_variant_discriminator_unavailable',
        observedSchema: record.metadataId ? inferSchema(record.value) : inferSchema(record),
        comparedAgainstEmptyObject: false
    }));
}

function variantSetShape(variants) {
    return { type: 'object', fields: Object.fromEntries(Object.entries(variants).sort(([a], [b]) => a.localeCompare(b))) };
}

function metadataVariantSchemas(records) {
    const variants = {};
    for (const [index, record] of records.entries()) {
        const key = record.metadataId ?? `historical_record_${String(index).padStart(3, '0')}`;
        variants[key] = record.metadataId ? inferSchema(record.value) : inferSchema(record);
    }
    return variants;
}

function collectValueVariants(events) {
    const byVariant = new Map();
    for (const event of events) {
        const key = `${event.eventCategory}:${event.eventType}`;
        if (!byVariant.has(key)) byVariant.set(key, inferSchema(event.value));
    }
    return Object.fromEntries([...byVariant.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

async function loadReferencePackage(manifest) {
    return {
        playerRegistry: await readJson(manifest.sources.referencePlayerRegistry.path),
        entityRegistry: await readJson(manifest.sources.referenceEntityRegistry.path),
        factualEvents: await readJsonl(manifest.sources.referenceFactualEvents.path),
        metadata: await readJson(manifest.sources.referenceMetadata.path),
        overlay: await readJson(manifest.sources.referenceOverlay.path),
        snapshots: await readJsonl(manifest.sources.referenceSnapshots.path),
        capabilities: await readJson(manifest.sources.referenceCapabilities.path),
        validation: await readJson(manifest.sources.referenceValidation.path)
    };
}

async function buildSchemaDiffV7(manifest) {
    const replay002 = await loadCanonicalPackage(manifest.outputDir);
    const replay009 = await loadReferencePackage(manifest);
    const contract = CANONICAL_CONTRACT.artifacts;
    const ledger = { schemaVersion: 2, entries: [] };
    const compare = ({ comparisonId, artifactId, sourceShape, targetShape, source, target }) => compareArtifact({
        ledger,
        comparisonId,
        artifactId,
        sourceShape,
        targetShape,
        comparatorId: 'diffSchema.v7',
        comparator: (left, right) => diffSchema(left, right, artifactId, { source, target })
    });

    const contractShapes = {
        playerRegistry: contractToShape(contract.playerRegistry),
        entityRegistry: contractToShape(contract.entityRegistry),
        factualEventVariants: variantSetShape(Object.fromEntries(Object.entries(contract.factualEventVariants).map(([key, rule]) => [key, contractToShape(rule.value)]))),
        metadata: contractToShape(contract.nonTimelineMetadata),
        metadataVariants: variantSetShape(Object.fromEntries(Object.entries(contract.metadataVariants).map(([key, rule]) => [key, contractToShape(rule)]))),
        independentValidationOverlay: contractToShape(contract.independentValidationOverlay),
        snapshot: contractToShape(contract.snapshot),
        capabilityMatrix: contractToShape(contract.capabilityMatrix),
        validationSummary: contractToShape(contract.validationSummary),
        canonicalGate: contractToShape(contract.canonicalStateGate)
    };
    const replay002Shapes = {
        playerRegistry: inferSchema(replay002.playerRegistry),
        entityRegistry: inferSchema(replay002.entityRegistry),
        factualEventVariants: variantSetShape(collectValueVariants(replay002.factualEvents)),
        metadata: inferSchema(replay002.nonTimelineMetadata),
        metadataVariants: variantSetShape(metadataVariantSchemas(replay002.nonTimelineMetadata.records)),
        independentValidationOverlay: inferSchema(replay002.independentValidationOverlay),
        snapshot: replay002.snapshots.length ? inferSchema(replay002.snapshots[0]) : 'unknown',
        capabilityMatrix: inferSchema(replay002.capabilityMatrix),
        validationSummary: inferSchema(replay002.validationSummary),
        canonicalGate: inferSchema(replay002.canonicalGate)
    };
    const replay009Shapes = {
        playerRegistry: inferSchema(replay009.playerRegistry),
        entityRegistry: inferSchema(replay009.entityRegistry),
        factualEventVariants: variantSetShape(collectValueVariants(replay009.factualEvents)),
        metadata: inferSchema(replay009.metadata),
        metadataVariants: variantSetShape(metadataVariantSchemas(replay009.metadata.records ?? [])),
        independentValidationOverlay: inferSchema(replay009.overlay),
        snapshot: replay009.snapshots.length ? inferSchema(replay009.snapshots[0]) : 'missing_historical_artifact',
        capabilityMatrix: inferSchema(replay009.capabilities),
        validationSummary: inferSchema(replay009.validation),
        canonicalGate: 'missing_historical_artifact'
    };

    const targetDiffs = [
        ...compare({ comparisonId: 'targetReplay002V7VersusContractV7', artifactId: 'playerRegistry', sourceShape: contractShapes.playerRegistry, targetShape: replay002Shapes.playerRegistry, source: 'contract_v7', target: 'replay_002_v7' }),
        ...compare({ comparisonId: 'targetReplay002V7VersusContractV7', artifactId: 'entityRegistry', sourceShape: contractShapes.entityRegistry, targetShape: replay002Shapes.entityRegistry, source: 'contract_v7', target: 'replay_002_v7' }),
        ...compare({ comparisonId: 'targetReplay002V7VersusContractV7', artifactId: 'factualEventVariants', sourceShape: contractShapes.factualEventVariants, targetShape: replay002Shapes.factualEventVariants, source: 'contract_v7', target: 'replay_002_v7' }),
        ...compare({ comparisonId: 'targetReplay002V7VersusContractV7', artifactId: 'metadataVariants', sourceShape: contractShapes.metadataVariants, targetShape: replay002Shapes.metadataVariants, source: 'contract_v7', target: 'replay_002_v7' }),
        ...compare({ comparisonId: 'targetReplay002V7VersusContractV7', artifactId: 'independentValidationOverlay', sourceShape: contractShapes.independentValidationOverlay, targetShape: replay002Shapes.independentValidationOverlay, source: 'contract_v7', target: 'replay_002_v7' }),
        ...compare({ comparisonId: 'targetReplay002V7VersusContractV7', artifactId: 'snapshot', sourceShape: contractShapes.snapshot, targetShape: replay002Shapes.snapshot, source: 'contract_v7', target: 'replay_002_v7' }),
        ...compare({ comparisonId: 'targetReplay002V7VersusContractV7', artifactId: 'capabilityMatrix', sourceShape: contractShapes.capabilityMatrix, targetShape: replay002Shapes.capabilityMatrix, source: 'contract_v7', target: 'replay_002_v7' }),
        ...compare({ comparisonId: 'targetReplay002V7VersusContractV7', artifactId: 'validationSummary', sourceShape: contractShapes.validationSummary, targetShape: replay002Shapes.validationSummary, source: 'contract_v7', target: 'replay_002_v7' }),
        ...compare({ comparisonId: 'targetReplay002V7VersusContractV7', artifactId: 'canonicalGate', sourceShape: contractShapes.canonicalGate, targetShape: replay002Shapes.canonicalGate, source: 'contract_v7', target: 'replay_002_v7' })
    ];
    const historicalDiffs = [
        ...compare({ comparisonId: 'replay009V1VersusContractV7', artifactId: 'playerRegistry', sourceShape: contractShapes.playerRegistry, targetShape: replay009Shapes.playerRegistry, source: 'contract_v7', target: 'replay_009_v1' }),
        ...compare({ comparisonId: 'replay009V1VersusContractV7', artifactId: 'entityRegistry', sourceShape: contractShapes.entityRegistry, targetShape: replay009Shapes.entityRegistry, source: 'contract_v7', target: 'replay_009_v1' }),
        ...compare({ comparisonId: 'replay009V1VersusContractV7', artifactId: 'factualEventVariants', sourceShape: contractShapes.factualEventVariants, targetShape: replay009Shapes.factualEventVariants, source: 'contract_v7', target: 'replay_009_v1' }),
        ...compare({ comparisonId: 'replay009V1VersusContractV7', artifactId: 'metadata', sourceShape: contractShapes.metadata, targetShape: replay009Shapes.metadata, source: 'contract_v7', target: 'replay_009_v1' }),
        ...compare({ comparisonId: 'replay009V1VersusContractV7', artifactId: 'metadataVariants', sourceShape: contractShapes.metadataVariants, targetShape: replay009Shapes.metadataVariants, source: 'contract_v7', target: 'replay_009_v1' }),
        ...compare({ comparisonId: 'replay009V1VersusContractV7', artifactId: 'independentValidationOverlay', sourceShape: contractShapes.independentValidationOverlay, targetShape: replay009Shapes.independentValidationOverlay, source: 'contract_v7', target: 'replay_009_v1' }),
        ...compare({ comparisonId: 'replay009V1VersusContractV7', artifactId: 'snapshot', sourceShape: contractShapes.snapshot, targetShape: replay009Shapes.snapshot, source: 'contract_v7', target: 'replay_009_v1' }),
        ...compare({ comparisonId: 'replay009V1VersusContractV7', artifactId: 'capabilityMatrix', sourceShape: contractShapes.capabilityMatrix, targetShape: replay009Shapes.capabilityMatrix, source: 'contract_v7', target: 'replay_009_v1' }),
        ...compare({ comparisonId: 'replay009V1VersusContractV7', artifactId: 'validationSummary', sourceShape: contractShapes.validationSummary, targetShape: replay009Shapes.validationSummary, source: 'contract_v7', target: 'replay_009_v1' }),
        ...compare({ comparisonId: 'replay009V1VersusContractV7', artifactId: 'canonicalGate', sourceShape: contractShapes.canonicalGate, targetShape: replay009Shapes.canonicalGate, source: 'contract_v7', target: 'replay_009_v1' })
    ].map(diff => ({
        ...diff,
        classification: diff.path.includes('metadataVariants') && diff.newType !== null ? 'historical_variant_discriminator_unavailable' : diff.classification,
        historicalClassificationPreserved: true
    }));
    const replayDiffs = [
        ...compare({ comparisonId: 'replay009V1VersusReplay002V7', artifactId: 'playerRegistry', sourceShape: replay009Shapes.playerRegistry, targetShape: replay002Shapes.playerRegistry, source: 'replay_009_v1', target: 'replay_002_v7' }),
        ...compare({ comparisonId: 'replay009V1VersusReplay002V7', artifactId: 'entityRegistry', sourceShape: replay009Shapes.entityRegistry, targetShape: replay002Shapes.entityRegistry, source: 'replay_009_v1', target: 'replay_002_v7' }),
        ...compare({ comparisonId: 'replay009V1VersusReplay002V7', artifactId: 'factualEventVariants', sourceShape: replay009Shapes.factualEventVariants, targetShape: replay002Shapes.factualEventVariants, source: 'replay_009_v1', target: 'replay_002_v7' }),
        ...compare({ comparisonId: 'replay009V1VersusReplay002V7', artifactId: 'metadata', sourceShape: replay009Shapes.metadata, targetShape: replay002Shapes.metadata, source: 'replay_009_v1', target: 'replay_002_v7' }),
        ...compare({ comparisonId: 'replay009V1VersusReplay002V7', artifactId: 'independentValidationOverlay', sourceShape: replay009Shapes.independentValidationOverlay, targetShape: replay002Shapes.independentValidationOverlay, source: 'replay_009_v1', target: 'replay_002_v7' }),
        ...compare({ comparisonId: 'replay009V1VersusReplay002V7', artifactId: 'snapshot', sourceShape: replay009Shapes.snapshot, targetShape: replay002Shapes.snapshot, source: 'replay_009_v1', target: 'replay_002_v7' }),
        ...compare({ comparisonId: 'replay009V1VersusReplay002V7', artifactId: 'capabilityMatrix', sourceShape: replay009Shapes.capabilityMatrix, targetShape: replay002Shapes.capabilityMatrix, source: 'replay_009_v1', target: 'replay_002_v7' }),
        ...compare({ comparisonId: 'replay009V1VersusReplay002V7', artifactId: 'validationSummary', sourceShape: replay009Shapes.validationSummary, targetShape: replay002Shapes.validationSummary, source: 'replay_009_v1', target: 'replay_002_v7' })
    ];
    const schemaDiff = {
        schemaVersion: 7,
        contract: canonicalContractForJson(),
        replay002Schemas: replay002Shapes,
        replay009Schemas: replay009Shapes,
        historicalMetadataVariants: historicalMetadataVariants(replay009.metadata),
        targetV7VersusContractV7: {
            schemaBreaks: targetDiffs.filter(diff => ['schema_break', 'missing_field'].includes(diff.classification)).length,
            differences: targetDiffs
        },
        replay009V1VersusContractV7: { differences: historicalDiffs },
        replay009V1VersusReplay002V7: { differences: replayDiffs },
        schemaBreaks: targetDiffs.filter(diff => ['schema_break', 'missing_field'].includes(diff.classification)),
        replay002VsReplay009KnownDifferences: [
            { category: 'entity_identity', classification: 'identity_model_difference', impact: 'historical adapter required' },
            { category: 'metadata', classification: 'expected_version_break', impact: 'historical metadata migration required' }
        ]
    };
    return { schemaDiff, ledger };
}

async function finalize(options) {
    const reportPath = options.skipRerun ? path.join(options.assessmentDir, 'local-report.md').replaceAll(path.sep, '/') : REPORT;
    const manifest = await createReplay002Manifest({ outputDir: options.outputDir, assessmentDir: options.assessmentDir });
    manifest.taskId = '088';
    manifest.eventIdPrefix = 'canon002v7';
    manifest.expectedGate = SUCCESS_GATE;
    manifest.blockedGate = BLOCKED_GATE;
    manifest.followUpTaskPath = 'tasks/blocked/089-select-next-canonical-generalization-control.md';
    manifest.pipelineModules = [
        ...new Set([
            ...manifest.pipelineModules,
            'tools/finalize-replay-002-canonical-v7.mjs',
            'tools/verify-replay-002-canonical-v7-attestation.mjs',
            'lib/canonical-state/audits/artifact-attestation.mjs'
        ])
    ];
    const io = createCanonicalIo({ allowlist: manifest.allowedInputs, generatedRootPrefixes: [manifest.outputDir, manifest.assessmentDir] });
    const result = await buildCanonicalState(manifest, io, { clean: options.clean });
    await normalizeRootSensitiveJson(path.join(manifest.assessmentDir, 'input-manifest.json'), manifest);
    await normalizeRootSensitiveJson(path.join(manifest.assessmentDir, 'input-access-log.json'), manifest);
    await fs.mkdir('schemas', { recursive: true });
    await writeJson('schemas/canonical-factual-state-contract.v2.json', canonicalContractForJson());

    const audits = result.candidateAudits;
    await writeJson(path.join(manifest.assessmentDir, 'canonical-contract.json'), canonicalContractForJson());
    await writeJson(path.join(manifest.assessmentDir, 'contract-completeness-audit.json'), audits.contractCompletenessAudit);
    await writeJson(path.join(manifest.assessmentDir, 'raw-replay-access-classification.json'), audits.rawReplayAccessClassification);
    await writeJson(path.join(manifest.assessmentDir, 'assumption-audit.json'), audits.assumptionAudit);
    await writeJson(path.join(manifest.assessmentDir, 'identity-and-generation-audit.json'), audits.identityAudit);
    await writeJson(path.join(manifest.assessmentDir, 'spatial-leakage-audit.json'), audits.spatialLeakageAudit);
    await writeJson(path.join(manifest.assessmentDir, 'provenance-audit.json'), audits.provenanceAudit);
    const epistemicAudit = await auditEpistemicClassification(manifest.outputDir);
    await writeJson(path.join(manifest.assessmentDir, 'epistemic-classification-audit.json'), epistemicAudit);
    const directAudit = await auditDirectObservations(manifest.outputDir);
    await writeJson(path.join(manifest.assessmentDir, 'direct-observation-justification.json'), directAudit);
    await writeJson(path.join(manifest.assessmentDir, 'canonical-schema-validation.json'), audits.canonicalSchemaValidation);

    const { schemaDiff, ledger } = await buildSchemaDiffV7(manifest);
    await writeJson(path.join(manifest.assessmentDir, 'canonical-schema-diff.json'), schemaDiff);
    await writeJson(path.join(manifest.assessmentDir, 'schema-comparison-ledger.json'), ledger);
    const schemaCoverage = coverageFromLedger(ledger);
    await writeJson(path.join(manifest.assessmentDir, 'schema-diff-coverage.json'), schemaCoverage);

    await writeJson(path.join(manifest.assessmentDir, 'manifest-behavior-validation.json'), audits.manifestBehaviorValidation);
    const ioAudit = await auditIoPolicy(manifest);
    await writeJson(path.join(manifest.assessmentDir, 'io-policy-audit.json'), ioAudit);
    const contractConsistency = await auditContractSourceConsistency({ schemaPath: 'schemas/canonical-factual-state-contract.v2.json', emittedPath: path.join(manifest.assessmentDir, 'canonical-contract.json') });
    await writeJson(path.join(manifest.assessmentDir, 'contract-source-consistency.json'), contractConsistency);
    await normalizeRootSensitiveJson(path.join(manifest.assessmentDir, 'io-policy-audit.json'), manifest);
    await normalizeRootSensitiveJson(path.join(manifest.assessmentDir, 'contract-source-consistency.json'), manifest);
    if (options.outputDir === DEFAULT_OUTPUT && options.assessmentDir === DEFAULT_ASSESSMENT) await createFollowupTask(true, manifest);
    const docAudit = await auditDocumentation({ expectedTaskId: '088', nextTaskPath: 'tasks/blocked/089-select-next-canonical-generalization-control.md', expectedGate: SUCCESS_GATE, reportPath: REPORT });
    await writeJson(path.join(manifest.assessmentDir, 'documentation-consistency.json'), docAudit);
    await writeJson(path.join(manifest.assessmentDir, 'protections-audit.json'), audits.protectionsAudit);

    const deterministic = options.skipRerun ? skippedDeterminism() : await fullPipelineDeterminism();
    await writeJson(path.join(manifest.assessmentDir, 'deterministic-rerun.json'), deterministic);

    const evidenceMatrix = await buildValidationMatrix({ assessmentDir: manifest.assessmentDir, audits, epistemicAudit, directAudit, schemaDiff, schemaCoverage, ledger, ioAudit, contractConsistency, docAudit, deterministic, verification: { passed: true }, includeBaseVerification: false });
    await writeJson(path.join(manifest.assessmentDir, 'evidence-matrix.json'), evidenceMatrix);
    const candidateSuccess = evidenceMatrix.allPassed;
    const correctionGate = { schemaVersion: 1, taskId: '088', replayId: 'replay_002', gate: candidateSuccess ? SUCCESS_GATE : BLOCKED_GATE, success: candidateSuccess, evidenceMatrixPassed: evidenceMatrix.allPassed, releaseDecisionPath: 'release-decision.json' };
    await writeJson(path.join(manifest.assessmentDir, 'correction-gate.json'), correctionGate);
    await updateCanonicalFinalFiles({ manifest, result, success: candidateSuccess, matrix: evidenceMatrix, epistemicAudit });
    const correctionSummary = {
        ...result.correctionSummary,
        taskId: '088',
        gate: correctionGate.gate,
        releaseDecisionPath: 'release-decision.json',
        finalAttestationPath: 'final-attestation.json'
    };
    await writeJson(path.join(manifest.assessmentDir, 'correction-summary.json'), correctionSummary);
    await writeReport({ reportPath, correctionSummary, schemaDiff, schemaCoverage, ledger, ioAudit, docAudit, deterministic, verification: { passed: null } });
    const { manifest: baseManifest, verification } = await writeBaseManifestAndVerification({ canonicalDir: manifest.outputDir, assessmentDir: manifest.assessmentDir });
    const matrix = await buildValidationMatrix({ assessmentDir: manifest.assessmentDir, audits, epistemicAudit, directAudit, schemaDiff, schemaCoverage, ledger, ioAudit, contractConsistency, docAudit, deterministic, verification });
    await writeJson(path.join(manifest.assessmentDir, 'validation-matrix.json'), matrix);
    const finalAttestation = await buildFinalAttestation({ canonicalDir: manifest.outputDir, assessmentDir: manifest.assessmentDir, reportPath });
    await writeJson(path.join(manifest.assessmentDir, 'final-attestation.json'), finalAttestation);
    const finalAttestationVerification = await verifyFinalAttestation({ canonicalDir: manifest.outputDir, assessmentDir: manifest.assessmentDir, reportPath, attestation: finalAttestation });
    await writeJson(path.join(manifest.assessmentDir, 'final-attestation-verification.json'), finalAttestationVerification);
    const releaseDecision = {
        schemaVersion: 1,
        taskId: '088',
        replayId: 'replay_002',
        candidateGate: correctionGate.gate,
        evidenceMatrixPassed: evidenceMatrix.allPassed,
        baseManifestVerificationPassed: verification.passed,
        finalAttestationVerificationPassed: finalAttestationVerification.passed,
        releaseAuthorized: evidenceMatrix.allPassed && verification.passed && finalAttestationVerification.passed,
        gate: evidenceMatrix.allPassed && verification.passed && finalAttestationVerification.passed ? SUCCESS_GATE : BLOCKED_GATE
    };
    await writeJson(path.join(manifest.assessmentDir, 'release-decision.json'), releaseDecision);
    if (options.outputDir === DEFAULT_OUTPUT && options.assessmentDir === DEFAULT_ASSESSMENT) await createFollowupTask(releaseDecision.releaseAuthorized, manifest);
    return { correctionSummary, gate: { gate: releaseDecision.gate, success: releaseDecision.releaseAuthorized }, deterministic, verification, finalAttestation, finalAttestationVerification, releaseDecision, baseManifest };
}

function skippedDeterminism() {
    return {
        schemaVersion: 1,
        taskId: '088',
        replayId: 'replay_002',
        fullPipeline: true,
        status: 'nested_rerun_not_applicable',
        deterministic: null,
        skipReason: 'inner deterministic run; outer production run performs A/B comparison',
        comparedCanonicalFiles: 0,
        comparedAuditFiles: 0,
        comparedFinalFiles: 0,
        normalizationsApplied: [],
        mismatches: []
    };
}

async function buildValidationMatrix({ assessmentDir, audits, epistemicAudit, directAudit, schemaDiff, schemaCoverage, ledger, ioAudit, contractConsistency, docAudit, deterministic, verification, includeBaseVerification = true }) {
    const ref = async (name, passed) => ({ passed, artifact: name, path: name, sha256: await sha256File(path.join(assessmentDir, name)) });
    const deterministicPassed = deterministic.deterministic === true || deterministic.status === 'nested_rerun_not_applicable';
    const matrix = {
        schemaVersion: 3,
        taskId: '088',
        replayId: 'replay_002',
        contractCompleteness: await ref('contract-completeness-audit.json', audits.contractCompletenessAudit.passed),
        contractValidation: await ref('canonical-schema-validation.json', audits.canonicalSchemaValidation.valid),
        schemaDiff: await ref('canonical-schema-diff.json', schemaDiff.targetV7VersusContractV7.schemaBreaks === 0),
        schemaComparisonLedger: await ref('schema-comparison-ledger.json', ledger.entries.length > 0 && ledger.entries.every(entry => entry.status === 'completed' && entry.sourceShapeHash && entry.targetShapeHash && !entry.error)),
        schemaDiffCoverage: await ref('schema-diff-coverage.json', schemaCoverage.passed),
        targetSchemaBreaks: schemaDiff.targetV7VersusContractV7.schemaBreaks,
        missingComparisons: schemaCoverage.comparisons.flatMap(item => item.missingComparisons),
        provenanceAudit: await ref('provenance-audit.json', audits.provenanceAudit.passed),
        globalEpistemicAudit: await ref('epistemic-classification-audit.json', epistemicAudit.passed),
        directObservationAudit: await ref('direct-observation-justification.json', directAudit.passed),
        identityAudit: await ref('identity-and-generation-audit.json', audits.identityAudit.fabricatedGenerationCount === 0 && audits.identityAudit.eventRegistryReferenceMismatches.length === 0),
        spatialLeakageAudit: await ref('spatial-leakage-audit.json', audits.spatialLeakageAudit.passed),
        manifestBehaviorAudit: await ref('manifest-behavior-validation.json', audits.manifestBehaviorValidation.passed),
        ioStaticAudit: await ref('io-policy-audit.json', ioAudit.passed),
        contractDeepConsistency: await ref('contract-source-consistency.json', contractConsistency.passed),
        documentationContentAudit: await ref('documentation-consistency.json', docAudit.passed),
        protectionsAudit: await ref('protections-audit.json', audits.protectionsAudit.passed),
        deterministicRerun: await ref('deterministic-rerun.json', deterministicPassed)
    };
    if (includeBaseVerification) matrix.baseAuditManifestVerification = await ref('audit-artifact-verification.json', verification.passed);
    matrix.allPassed = Object.entries(matrix)
        .filter(([key]) => !['schemaVersion', 'taskId', 'replayId', 'targetSchemaBreaks', 'missingComparisons'].includes(key))
        .every(([, value]) => value?.passed === true)
        && matrix.targetSchemaBreaks === 0
        && matrix.missingComparisons.length === 0;
    return matrix;
}

async function updateCanonicalFinalFiles({ manifest, result, success, matrix, epistemicAudit }) {
    const gatePath = path.join(manifest.outputDir, 'canonical-state-gate.json');
    const summaryPath = path.join(manifest.outputDir, 'validation-summary.json');
    const gate = await readJson(gatePath);
    gate.taskId = '088';
    gate.gate = success ? SUCCESS_GATE : BLOCKED_GATE;
    gate.readyWithConstraints = success;
    gate.finalGateSource = 'release-decision.json';
    gate.validationMatrixPath = 'validation-matrix.json';
    await writeJson(gatePath, gate);
    const summary = await readJson(summaryPath);
    summary.taskId = '088';
    summary.gate = gate.gate;
    summary.finalGateVerifiedBy = gate.finalGateSource;
    summary.packageEpistemicTypeCounts = epistemicAudit.byArtifact;
    await writeJson(summaryPath, summary);
    result.correctionSummary.gate = gate.gate;
}

async function writeReport({ reportPath, correctionSummary, schemaDiff, schemaCoverage, ledger, ioAudit, docAudit, deterministic, verification }) {
    await writeText(reportPath, `# Replay 002 Canonical Factual State v7 Validation

## Gate

\`${correctionSummary.gate}\`

Task 088 finalizes audit-manifest verification, full-pipeline determinism, ledger-derived schema coverage, role/path IO policy, and per-file documentation validation.

## Results

- Players: ${correctionSummary.players}
- Entities: ${correctionSummary.entities}
- Factual events: ${correctionSummary.events}
- Snapshots: ${correctionSummary.snapshots}
- Target schema breaks: ${schemaDiff.targetV7VersusContractV7.schemaBreaks}
- Schema ledger entries: ${ledger.entries.length}
- Schema coverage missing comparisons: ${schemaCoverage.comparisons.flatMap(item => item.missingComparisons).length}
- IO findings: ${ioAudit.findings.length}, forbidden findings: ${ioAudit.findings.filter(item => !item.allowed).length}
- Documentation rules: ${docAudit.rules.length}
- Full-pipeline deterministic: ${deterministic.deterministic}
- Base audit manifest verified: ${verification.passed}
- Mechanic effects applied: 0

## Boundaries

Replay 005 remains protected. Bot fixtures 006-008 were not processed. Spatial semantics, mechanic effects, fights, rotations, pressure, macro, and decision analysis remain blocked.
`);
}

async function createFollowupTask(success, manifest) {
    const taskPath = success ? 'tasks/blocked/089-select-next-canonical-generalization-control.md' : 'tasks/blocked/089-fix-replay-002-canonical-v7-blocker.md';
    try {
        await fs.access(taskPath);
    } catch {
        await writeText(taskPath, `# Task 088: ${success ? 'Select Next Canonical Generalization Control' : 'Fix Replay 002 Canonical v7 Blocker'}

Status: blocked

Execution mode: autonomous after explicit authorization

Blocked by: explicit user authorization after reviewing Task 088 gate \`${success ? SUCCESS_GATE : BLOCKED_GATE}\`.

## Objective

${success ? 'Select the next compatible human replay for canonical factual-state generalization after the v7 replay-002 attestation and full-pipeline determinism checks pass.' : 'Resolve the first blocker reported by the Task 088 v7 validation matrix.'}

## Constraints

Do not process replay 005. Do not process bot fixtures 006-008. Do not apply spatial semantics, mechanic effects, fights, rotations, pressure, macro, or decision analysis.
`);
    }
    manifest.followUpTaskPath = taskPath;
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    const result = await finalize(parseArgs());
    console.log(JSON.stringify({
        taskId: '088',
        gate: result.gate.gate,
        deterministic: result.deterministic.deterministic,
        baseManifestVerified: result.verification.passed,
        finalAttestationVerified: result.finalAttestationVerification.passed,
        releaseAuthorized: result.releaseDecision.releaseAuthorized
    }, null, 2));
}

export { compareArtifact, coverageFromLedger, finalize, historicalMetadataVariants };
