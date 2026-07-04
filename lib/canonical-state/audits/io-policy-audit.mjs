import { promises as fs } from 'node:fs';
import { sha256File } from './common.mjs';

const FORBIDDEN_APIS = ['readFile', 'createReadStream', 'open', 'stat', 'readdir', 'access'];

export async function auditIoPolicy(manifest) {
    const modules = manifest.pipelineModules ?? [];
    const modulesExamined = [];
    const findings = [];
    for (const modulePath of modules) {
        const text = await fs.readFile(modulePath, 'utf8');
        const lines = text.split(/\r?\n/u);
        const isIoLayer = modulePath.endsWith('io-layer.mjs');
        const moduleRecord = { path: modulePath, sha256: await sha256File(modulePath), lineCount: lines.length };
        modulesExamined.push(moduleRecord);
        lines.forEach((line, index) => {
            const importsFs = line.includes('node:fs') || line.match(/\bfrom ['"]fs['"]/u);
            if (importsFs && !isIoLayer) {
                findings.push({ file: modulePath, line: index + 1, api: 'node:fs import', classification: modulePath.includes('/audits/') || modulePath.includes('\\audits\\') || modulePath.includes('check-replay-002-canonical-determinism') || modulePath.includes('build-replay-002-canonical-state') ? 'validation_or_orchestration_read' : 'potential_factual_io_outside_layer', text: line.trim() });
            }
            for (const api of FORBIDDEN_APIS) {
                const pattern = new RegExp(`(?:\\.|\\b)${api}\\s*\\(`, 'u');
                if (pattern.test(line)) {
                    const allowed = isIoLayer
                        || modulePath.includes('/audits/')
                        || modulePath.includes('\\audits\\')
                        || modulePath.includes('check-replay-002-canonical-determinism')
                        || modulePath.includes('build-replay-002-canonical-state');
                    findings.push({ file: modulePath, line: index + 1, api, classification: allowed ? 'validation_or_io_allowed' : 'forbidden_factual_io_outside_layer', text: line.trim() });
                }
            }
        });
    }
    const forbiddenFindings = findings.filter(finding => finding.classification === 'forbidden_factual_io_outside_layer' || finding.classification === 'potential_factual_io_outside_layer');
    return {
        schemaVersion: 1,
        modulesExamined,
        findings,
        forbiddenFindings,
        apisChecked: FORBIDDEN_APIS,
        passed: modulesExamined.length === modules.length && forbiddenFindings.length === 0
    };
}
