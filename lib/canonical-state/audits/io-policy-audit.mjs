import { promises as fs } from 'node:fs';
import { assertPathWithinRoots, sha256FileWithinRoots } from './common.mjs';

const FS_APIS = ['readFile', 'writeFile', 'createReadStream', 'open', 'stat', 'readdir', 'access', 'rm', 'mkdir'];
const GUARDED_FUNCTIONS = new Map([
    ['assertPathWithinRoots', { kind: 'guard' }],
    ['resolveScopedArtifact', { kind: 'guard' }],
    ['readJsonWithinRoots', { requiresRoots: true }],
    ['readJsonlWithinRoots', { requiresRoots: true }],
    ['sha256FileWithinRoots', { requiresRoots: true }],
    ['writeJsonWithinRoots', { requiresRoots: true }]
]);

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
    if (/finalize-replay-002-canonical-v[789]/u.test(modulePath) || /verify-replay-002-canonical-v[789]-(?:attestation|release-envelope)/u.test(modulePath)) {
        return { module: modulePath, role: 'orchestrator', allowedReadRoots: ['output/replay-002-canonical', manifest.assessmentDir, 'schemas', 'docs', 'reports', 'tasks', 'README.md', 'output/README.md', 'lib', 'tools', 'output-local'], allowedWriteRoots: [manifest.outputDir, manifest.assessmentDir, 'schemas', 'reports', 'tasks/blocked', 'tasks/completed', 'output-local'], allowedApis: FS_APIS };
    }
    return { module: modulePath, role: 'validator_or_wrapper', allowedReadRoots: ['output/replay-002-canonical', manifest.assessmentDir, 'schemas', 'docs', 'reports', 'tasks', 'README.md', 'output/README.md', 'lib', 'tools', 'output-local'], allowedWriteRoots: [manifest.outputDir, manifest.assessmentDir, 'schemas', 'reports', 'tasks/blocked', 'output-local'], allowedApis: FS_APIS };
}

function literalPath(line) {
    const match = line.match(/\b(?:readFile|writeFile|createReadStream|open|stat|readdir|access|rm|mkdir)\s*\(\s*['"]([^'"]+)['"]/u)
        ?? line.match(/\bfs\.(?:readFile|writeFile|createReadStream|open|stat|readdir|access|rm|mkdir)\s*\(\s*['"]([^'"]+)['"]/u);
    return match?.[1] ?? null;
}

function pathAllowed(pathLiteral, roots) {
    if (!pathLiteral) return { allowed: false, classification: 'unresolved_dynamic_path' };
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

function functionNameForLine(line) {
    return line.match(/\b(?:async\s+)?function\s+(\w+)\s*\(/u)?.[1]
        ?? line.match(/\b(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/u)?.[1]
        ?? null;
}

function functionRanges(lines) {
    const ranges = [];
    let current = { name: '<module>', start: 1, braceDepth: 0 };
    for (const [index, line] of lines.entries()) {
        const lineNo = index + 1;
        const name = functionNameForLine(line);
        if (name) current = { name, start: lineNo, braceDepth: 0 };
        current.braceDepth += (line.match(/\{/gu) ?? []).length;
        current.braceDepth -= (line.match(/\}/gu) ?? []).length;
        ranges.push({ line: lineNo, name: current.name });
        if (current.name !== '<module>' && current.braceDepth <= 0) current = { name: '<module>', start: lineNo + 1, braceDepth: 0 };
    }
    return new Map(ranges.map(range => [range.line, range.name]));
}

function dynamicArgument(line, api, alias) {
    const pattern = alias
        ? new RegExp(`\\b${alias}\\s*\\(\\s*([^,\\)]+)`, 'u')
        : new RegExp(`(?:fs\\.|\\b)${api}\\s*\\(\\s*([^,\\)]+)`, 'u');
    return line.match(pattern)?.[1]?.trim() ?? null;
}

function ioCall(line, api, aliases) {
    const directMatch = line.match(new RegExp(`(?:fs\\.|\\b)${api}\\s*\\(`, 'u'));
    const aliasEntry = [...aliases.entries()].find(([alias, value]) => value.api === api && new RegExp(`\\b${alias}\\s*\\(`, 'u').test(line));
    const aliasMatch = aliasEntry ? line.match(new RegExp(`\\b${aliasEntry[0]}\\s*\\(`, 'u')) : null;
    const direct = Boolean(directMatch);
    if (!direct && !aliasEntry) return null;
    return { alias: aliasEntry?.[0] ?? null, expression: dynamicArgument(line, api, aliasEntry?.[0] ?? null), index: aliasMatch?.index ?? directMatch?.index ?? 0 };
}

function updateGuardsFromLine(line, lineNo, state) {
    const guardedFunctionPattern = [...GUARDED_FUNCTIONS.keys()].join('|');
    for (const statement of line.split(';')) {
        const guardAssign = statement.match(new RegExp(`\\b(?:const|let|var)\\s+(\\w+)\\s*=\\s*(${guardedFunctionPattern})\\s*\\(`, 'u'))
            ?? statement.match(new RegExp(`^\\s*(\\w+)\\s*=\\s*(${guardedFunctionPattern})\\s*\\(`, 'u'));
        if (guardAssign) {
            state.guards.set(guardAssign[1], { guard: guardAssign[2], assignmentLine: lineNo, guardLine: lineNo, reassignmentLines: [] });
            continue;
        }
        const assignment = statement.match(/\b(?:const|let|var)\s+(\w+)\s*=/u) ?? statement.match(/^\s*(\w+)\s*=/u);
        if (assignment && state.guards.has(assignment[1])) {
            const prior = state.guards.get(assignment[1]);
            state.guards.set(assignment[1], { ...prior, invalidated: true, reassignmentLines: [...prior.reassignmentLines, lineNo] });
        }
    }
}

function dynamicPathInfo({ expression, state }) {
    if (!expression) return { allowed: false, classification: 'unresolved_dynamic_path', guard: null };
    if (expression.includes('samples/') || expression.includes('output/replays/')) return { allowed: false, classification: 'dynamic_path_may_resolve_forbidden_root', guard: null };
    if (/^assertPathWithinRoots\s*\(/u.test(expression)) return { allowed: true, classification: 'dynamic_path_guarded_by_immediate_assertPathWithinRoots', guard: 'assertPathWithinRoots' };
    const call = expression.match(/^(\w+)\s*\(/u);
    if (call && GUARDED_FUNCTIONS.has(call[1])) return { allowed: true, classification: 'dynamic_path_guarded_by_registered_function', guard: call[1] };
    const variable = expression.match(/^\w+$/u)?.[0] ?? null;
    if (!variable) return { allowed: false, classification: 'unresolved_dynamic_path', guard: null, variable: null };
    const variableGuard = state.guards.get(variable);
    if (variableGuard && !variableGuard.invalidated) {
        return {
            allowed: true,
            classification: 'dynamic_path_guarded_by_tracked_variable',
            guard: variableGuard.guard,
            variable,
            assignmentLine: variableGuard.assignmentLine,
            guardLine: variableGuard.guardLine,
            reassignmentLines: variableGuard.reassignmentLines
        };
    }
    return {
        allowed: false,
        classification: variableGuard?.invalidated ? 'dynamic_path_guard_invalidated_by_reassignment' : 'unresolved_dynamic_path',
        guard: variableGuard?.guard ?? null,
        variable,
        assignmentLine: variableGuard?.assignmentLine ?? null,
        guardLine: variableGuard?.guardLine ?? null,
        reassignmentLines: variableGuard?.reassignmentLines ?? []
    };
}

export async function auditIoPolicy(manifest) {
    const modules = manifest.pipelineModules ?? [];
    const modulesExamined = [];
    const modulePolicies = [];
    const findings = [];
    for (const modulePath of modules) {
        const safeModulePath = assertPathWithinRoots(modulePath);
        const text = await fs.readFile(safeModulePath, 'utf8');
        const lines = text.split(/\r?\n/u);
        const policy = modulePolicy(modulePath, manifest);
        modulePolicies.push(policy);
        modulesExamined.push({ path: modulePath, sha256: await sha256FileWithinRoots(modulePath, [modulePath, 'lib', 'tools', 'tests', 'output-local']), lineCount: lines.length, role: policy.role });
        const aliases = detectAliases(lines);
        const functionsByLine = functionRanges(lines);
        const states = new Map();
        for (const [index, line] of lines.entries()) {
            const lineNo = index + 1;
            const functionName = functionsByLine.get(lineNo) ?? '<module>';
            if (!states.has(functionName)) states.set(functionName, { guards: new Map() });
            const state = states.get(functionName);
            const importsFs = line.includes('node:fs') || /\bfrom ['"]fs['"]/u.test(line) || /import\s*\(['"]node:fs['"]\)/u.test(line);
            if (importsFs) {
                findings.push({
                    module: modulePath,
                    functionName,
                    line: lineNo,
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
                const call = ioCall(line, api, aliases);
                if (!call) continue;
                const callState = { guards: new Map(state.guards) };
                updateGuardsFromLine(line.slice(0, call.index), lineNo, callState);
                let pathInfo = pathAllowed(literalPath(line), api.startsWith('write') || ['rm', 'mkdir'].includes(api) ? policy.allowedWriteRoots : policy.allowedReadRoots);
                if (!literalPath(line)) pathInfo = dynamicPathInfo({ expression: call.expression, state: callState });
                const allowed = policy.allowedApis.includes(api) && pathInfo.allowed;
                findings.push({
                    module: modulePath,
                    functionName,
                    line: lineNo,
                    api,
                    alias: call.alias,
                    pathLiteral: literalPath(line),
                    expression: call.expression,
                    variable: pathInfo.variable ?? null,
                    assignmentLine: pathInfo.assignmentLine ?? null,
                    guardLine: pathInfo.guardLine ?? null,
                    reassignmentLines: pathInfo.reassignmentLines ?? [],
                    allowedRoots: api.startsWith('write') || ['rm', 'mkdir'].includes(api) ? policy.allowedWriteRoots : policy.allowedReadRoots,
                    pathClassification: pathInfo.classification,
                    runtimeGuard: pathInfo.guard ?? null,
                    role: policy.role,
                    ruleApplied: 'API and literal/dynamic path must be allowed by module role and guarded path dataflow',
                    allowed,
                    justification: allowed ? 'role and path policy allow this IO use' : 'API or path is outside explicit role policy or lacks a same-function guard',
                    text: line.trim()
                });
            }
            updateGuardsFromLine(line, lineNo, state);
        }
    }
    const forbiddenFindings = findings.filter(finding => !finding.allowed);
    return {
        schemaVersion: 3,
        modulesExamined,
        modulePolicies,
        findings,
        forbiddenFindings,
        apisChecked: FS_APIS,
        guardTracking: 'intraprocedural_order_aware',
        passed: modulesExamined.length === modules.length && forbiddenFindings.length === 0
    };
}
