import { EP_TYPES } from '../contract.mjs';
import { loadCanonicalPackage, walk } from './common.mjs';

const ARTIFACTS = [
    ['playerRegistry', 'playerRegistry'],
    ['entityRegistry', 'entityRegistry'],
    ['factualEvents', 'factualEvents'],
    ['metadata', 'nonTimelineMetadata'],
    ['overlays', 'independentValidationOverlay'],
    ['snapshots', 'snapshots'],
    ['capabilities', 'capabilityMatrix'],
    ['validationSummary', 'validationSummary'],
    ['canonicalGate', 'canonicalGate']
];

function emptyCounts() {
    return Object.fromEntries(EP_TYPES.map(type => [type, 0]));
}

export function collectProvenanceRecords(packageData) {
    const records = [];
    for (const [artifact, key] of ARTIFACTS) {
        walk(packageData[key], (node, path) => {
            if (!node || typeof node !== 'object') return;
            if (node.provenance && typeof node.provenance === 'object') {
                const provenanceEntries = Array.isArray(node.provenance) ? node.provenance : [node.provenance];
                provenanceEntries.forEach((provenance, index) => {
                    records.push({
                        artifact,
                        path: `${path.join('.')}.provenance${Array.isArray(node.provenance) ? `[${index}]` : ''}`,
                        provenance,
                        record: node
                    });
                });
            }
        });
    }
    return records;
}

export async function auditEpistemicClassification(outputDir) {
    const packageData = await loadCanonicalPackage(outputDir);
    const records = collectProvenanceRecords(packageData);
    const byArtifact = Object.fromEntries(ARTIFACTS.map(([artifact]) => [artifact, emptyCounts()]));
    const missingEpistemicType = [];
    const incompatibleEpistemicType = [];
    const directObservations = [];
    const unjustifiedDirectObservations = [];
    const derivationsWithoutMethod = [];
    const formulaRequiredMissing = [];

    for (const item of records) {
        const ep = item.provenance.epistemicType;
        if (!ep) missingEpistemicType.push(item);
        else if (!EP_TYPES.includes(ep)) incompatibleEpistemicType.push(item);
        else byArtifact[item.artifact][ep] += 1;

        if (ep === 'direct_parser_observation') {
            directObservations.push(item);
            const method = item.provenance.method ?? '';
            const bad = !item.provenance.sourceField
                || method.includes('aggregate')
                || method.includes('reconciled')
                || method.includes('filtered')
                || method.includes('summed')
                || method.includes('imported');
            if (bad) unjustifiedDirectObservations.push(item);
        }
        if (ep === 'deterministic_derivation' && !item.provenance.method) derivationsWithoutMethod.push(item);
        if (item.record?.eventCategory === 'team_net_worth' && !item.provenance.formula) formulaRequiredMissing.push(item);
    }

    return {
        schemaVersion: 1,
        artifactsCovered: ARTIFACTS.map(([artifact]) => artifact),
        byArtifact,
        totalProvenanceRecords: records.length,
        missingEpistemicType: missingEpistemicType.map(item => ({ artifact: item.artifact, path: item.path })),
        incompatibleEpistemicType: incompatibleEpistemicType.map(item => ({ artifact: item.artifact, path: item.path, epistemicType: item.provenance.epistemicType })),
        directObservations: directObservations.map(item => ({ artifact: item.artifact, path: item.path, sourceTask: item.provenance.sourceTask, sourcePath: item.provenance.sourcePath, sourceField: item.provenance.sourceField, method: item.provenance.method, limitations: item.provenance.limitations })),
        unjustifiedDirectObservations: unjustifiedDirectObservations.map(item => ({ artifact: item.artifact, path: item.path, sourceTask: item.provenance.sourceTask, sourcePath: item.provenance.sourcePath, sourceField: item.provenance.sourceField, method: item.provenance.method, limitations: item.provenance.limitations })),
        derivationsWithoutMethod: derivationsWithoutMethod.map(item => ({ artifact: item.artifact, path: item.path })),
        formulaRequiredMissing: formulaRequiredMissing.map(item => ({ artifact: item.artifact, path: item.path })),
        passed: missingEpistemicType.length === 0
            && incompatibleEpistemicType.length === 0
            && unjustifiedDirectObservations.length === 0
            && derivationsWithoutMethod.length === 0
            && formulaRequiredMissing.length === 0
    };
}

export async function auditDirectObservations(outputDir) {
    const audit = await auditEpistemicClassification(outputDir);
    return {
        schemaVersion: 1,
        inspectedArtifacts: audit.artifactsCovered,
        directObservationCount: audit.directObservations.length,
        directObservations: audit.directObservations.map(item => ({
            ...item,
            intermediateTransformation: item.method ?? null,
            reasonStillDirect: item.method?.includes('parser-side field chain') ? item.method : null
        })),
        unjustifiedDirectObservations: audit.unjustifiedDirectObservations,
        passed: audit.unjustifiedDirectObservations.length === 0
    };
}
