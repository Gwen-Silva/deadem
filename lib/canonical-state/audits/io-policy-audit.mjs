import { promises as fs } from 'node:fs';
import { sha256File } from './common.mjs';

const FS_APIS = ['readFile', 'writeFile', 'createReadStream', 'open', 'stat', 'readdir', 'access', 'rm', 'mkdir'];

function modulePolicy(modulePath, manifest) {
    if (modulePath.endsWith('io-layer.mjs')) {
        return { module: modulePath, role: 'factual_io_layer', allowedReadRoots: manifest.allowedInputs ?? [], allowedWriteRoots: manifest.generatedRootPrefixes ?? [], allowedApis: FS_APIS };
    }
    if (modulePath.endsWith('builder.mjs')) {
        return { module: modulePath, role: 'builder', allowedReadRoots: [], allowedWriteRoots: [], allowedApis: [] };
    }
    if (modulePath.includes('/audits/') || modulePath.includes('\\audits\\')) {
        return { module: modulePath, role: 'audit', allowedReadRoots: ['output/replay-002-canonical', manifest.assessmentDir, 'schemas', 'docs', 'reports', 'tasks', 'README.md', 'output/README.md', 'lib', 'tools'], allowedWriteRoots: [manifest.assessmentDir], allowedApis: FS_APIS };
    }
    if (modulePath.includes('finalize-replay-002-canonical-v6') || modulePath.includes('verify-replay-002-canonical-v6-attestation')) {
        return { module: modulePath, role: 'orchestrator', allowedReadRoots: ['output/replay-002-canonical', manifest.assessmentDir, 'schemas', 'docs', 'reports', 'tasks', 'README.md', 'output/README.md', 'lib', 'tools', 'output-local'], allowedWriteRoots: [manifest.outputDir, manifest.assessmentDir, 'schemas', 'reports', 'tasks/blocked', 'output-local'], allowedApis: FS_APIS };
    }
    return { module: modulePath, role: 'validator_or_wrapper', allowedReadRoots: ['output/replay-002-canonical', manifest.assessmentDir, 'schemas', 'docs', 'reports', 'tasks', 'README.md', 'output/README.md', 'lib', 'tools', 'output-local'], allowedWriteRoots: [manifest.outputDir, manifest.assessmentDir, 'schemas', 'reports', 'tasks/blocked', 'output-local'], allowedApis: FS_APIS };
}

function literalPath(line) {
    const match = line.match(/\b(?:readFile|writeFile|createReadStream|open|stat|readdir|access|rm|mkdir)\s*\(\s*['"]([^'"]+)['"]/u)
        ?? line.match(/\bfs\.(?:readFile|writeFile|createReadStream|open|stat|readdir|access|rm|mkdir)\s*\(\s*['"]([^'"]+)['"]/u);
    return match?.[1] ?? null;
}

function pathAllowed(pathLiteral, roots) {
    if (!pathLiteral) return { allowed: true, classification: 'dynamic_path_requires_runtime_policy' };
    const normalized = pathLiteral.replaceAll('\\', '/');
    if (normalized.includes('samples/') || normalized.includes('output/replays/')) return { allowed: false, classification: 'forbidden_direct_factual_path' };
    const allowed = roots.some(root => normalized === root || normalized.startsWith(`${root.replaceAll('\\', '/')}/`));
    return { allowed, classification: allowed ? 'path_within_role_roots' : 'path_outside_role_roots' };
}

function detectAliases(lines) {
    const aliases = new Map();
    for (const [index, line] of lines.entries()) {
        for (const api of FS_APIS) {
            const assign = line.match(new RegExp(`(?:const|let|var)\\s+(\\w+)\\s*=\\s*fs\\.${api}\\b`, 'u'));
            if (assign) aliases.set(assign[1], { api, line: index + 1 });
            const destructure = line.match(new RegExp(`\\{[^}]*\\b${api}\\s*(?::\\s*(\\w+))?[^}]*\\}\\s+from\\s+['"]node:fs['"]`, 'u'));
            if (destructure) aliases.set(destructure[1] ?? api, { api, line: index + 1 });
        }
    }
    return aliases;
}

export async function auditIoPolicy(manifest) {
    const modules = manifest.pipelineModules ?? [];
    const modulesExamined = [];
    const modulePolicies = [];
    const findings = [];
    for (const modulePath of modules) {
        const text = await fs.readFile(modulePath, 'utf8');
        const lines = text.split(/\r?\n/u);
        const policy = modulePolicy(modulePath, manifest);
        modulePolicies.push(policy);
        modulesExamined.push({ path: modulePath, sha256: await sha256File(modulePath), lineCount: lines.length, role: policy.role });
        const aliases = detectAliases(lines);
        lines.forEach((line, index) => {
            const importsFs = line.includes('node:fs') || /\bfrom ['"]fs['"]/u.test(line) || /import\s*\(['"]node:fs['"]\)/u.test(line);
            if (importsFs) {
                findings.push({
                    module: modulePath,
                    line: index + 1,
                    api: 'node:fs import',
                    alias: null,
                    pathLiteral: null,
                    pathClassification: 'module_import',
                    role: policy.role,
                    ruleApplied: 'module role may import fs only if allowedApis is non-empty',
                    allowed: policy.allowedApis.length > 0,
                    justification: policy.allowedApis.length > 0 ? 'role has explicit fs API allowance' : 'builder must not import fs directly',
                    text: line.trim()
                });
            }
            for (const api of FS_APIS) {
                const direct = new RegExp(`(?:fs\\.|\\b)${api}\\s*\\(`, 'u').test(line);
                const aliasEntry = [...aliases.entries()].find(([alias, value]) => value.api === api && new RegExp(`\\b${alias}\\s*\\(`, 'u').test(line));
                if (!direct && !aliasEntry) continue;
                const pathInfo = pathAllowed(literalPath(line), api.startsWith('write') || ['rm', 'mkdir'].includes(api) ? policy.allowedWriteRoots : policy.allowedReadRoots);
                const allowed = policy.allowedApis.includes(api) && pathInfo.allowed;
                findings.push({
                    module: modulePath,
                    line: index + 1,
                    api,
                    alias: aliasEntry?.[0] ?? null,
                    pathLiteral: literalPath(line),
                    pathClassification: pathInfo.classification,
                    role: policy.role,
                    ruleApplied: 'API and literal/dynamic path must be allowed by module role',
                    allowed,
                    justification: allowed ? 'role and path policy allow this IO use' : 'API or path is outside explicit role policy',
                    text: line.trim()
                });
            }
        });
    }
    const forbiddenFindings = findings.filter(finding => !finding.allowed);
    return {
        schemaVersion: 2,
        modulesExamined,
        modulePolicies,
        findings,
        forbiddenFindings,
        apisChecked: FS_APIS,
        passed: modulesExamined.length === modules.length && forbiddenFindings.length === 0
    };
}
