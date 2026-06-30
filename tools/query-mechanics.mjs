import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const rootDir = process.cwd();
const knowledgeDir = path.join(rootDir, 'knowledge');

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function listFiles(dir, predicate = () => true) {
    if (!fs.existsSync(dir)) {
        return [];
    }
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...listFiles(fullPath, predicate));
        } else if (predicate(fullPath)) {
            files.push(fullPath);
        }
    }
    return files.sort();
}

function parseSimpleYamlIdentity(filePath) {
    const text = fs.readFileSync(filePath, 'utf8');
    const result = {};
    for (const line of text.split(/\r?\n/)) {
        const match = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
        if (!match) {
            continue;
        }
        const value = match[2].trim();
        result[match[1]] = value.replace(/^"|"$/g, '');
    }
    return result;
}

export function loadKnowledge(baseDir = knowledgeDir) {
    const sourceIndex = readJson(path.join(baseDir, 'sources', 'source-index.json'));
    const buildMapping = readJson(path.join(baseDir, 'patches', 'build-patch-mapping.json'));
    const mechanicFiles = listFiles(path.join(baseDir, 'mechanics'), (filePath) => filePath.endsWith('mechanic.yaml'));
    const versionFiles = listFiles(path.join(baseDir, 'mechanics'), (filePath) => filePath.includes(`${path.sep}versions${path.sep}`) && filePath.endsWith('.json'));
    return {
        sourceIndex,
        buildMapping,
        mechanics: mechanicFiles.map((filePath) => ({ ...parseSimpleYamlIdentity(filePath), filePath: path.relative(rootDir, filePath).replaceAll('\\', '/') })),
        rules: versionFiles.map((filePath) => ({ ...readJson(filePath), filePath: path.relative(rootDir, filePath).replaceAll('\\', '/') }))
    };
}

function isDateAfter(a, b) {
    return a && b && new Date(a).getTime() > new Date(b).getTime();
}

function validateRuleShape(rule) {
    const required = [
        'schema_version',
        'rule_id',
        'mechanic_id',
        'name',
        'category',
        'description',
        'claim_type',
        'validity',
        'activation',
        'effects',
        'telemetry_requirements',
        'analytical_implications',
        'evidence_refs',
        'status',
        'notes'
    ];
    return required.filter((key) => !(key in rule)).map((key) => ({
        severity: 'error',
        code: 'missing_rule_field',
        file: rule.filePath,
        message: `${rule.rule_id ?? rule.filePath} missing ${key}`
    }));
}

export function validateKnowledge(baseDir = knowledgeDir) {
    const knowledge = loadKnowledge(baseDir);
    const errors = [];
    const warnings = [];
    const evidenceIds = new Set(knowledge.sourceIndex.evidence.map((entry) => entry.evidenceId));
    const mechanicIds = new Map();
    const ruleIds = new Map();

    for (const mechanic of knowledge.mechanics) {
        if (!mechanic.mechanic_id) {
            errors.push({ severity: 'error', code: 'missing_mechanic_id', file: mechanic.filePath });
            continue;
        }
        if (mechanicIds.has(mechanic.mechanic_id)) {
            errors.push({ severity: 'error', code: 'duplicate_mechanic_id', mechanicId: mechanic.mechanic_id, files: [ mechanicIds.get(mechanic.mechanic_id), mechanic.filePath ] });
        }
        mechanicIds.set(mechanic.mechanic_id, mechanic.filePath);
    }

    for (const rule of knowledge.rules) {
        errors.push(...validateRuleShape(rule));
        if (rule.rule_id) {
            if (ruleIds.has(rule.rule_id)) {
                errors.push({ severity: 'error', code: 'duplicate_rule_id', ruleId: rule.rule_id, files: [ ruleIds.get(rule.rule_id), rule.filePath ] });
            }
            ruleIds.set(rule.rule_id, rule.filePath);
        }
        if (rule.mechanic_id && !mechanicIds.has(rule.mechanic_id)) {
            errors.push({ severity: 'error', code: 'unknown_mechanic_ref', ruleId: rule.rule_id, mechanicId: rule.mechanic_id, file: rule.filePath });
        }
        for (const evidenceRef of rule.evidence_refs ?? []) {
            if (!evidenceIds.has(evidenceRef)) {
                errors.push({ severity: 'error', code: 'missing_evidence_ref', ruleId: rule.rule_id, evidenceRef, file: rule.filePath });
            }
        }
        const validity = rule.validity ?? {};
        if (isDateAfter(validity.effective_date_from, validity.effective_date_until)) {
            errors.push({ severity: 'error', code: 'invalid_temporal_interval', ruleId: rule.rule_id, file: rule.filePath });
        }
        if (validity.build_min !== null && validity.build_max !== null && validity.build_min > validity.build_max) {
            errors.push({ severity: 'error', code: 'invalid_build_interval', ruleId: rule.rule_id, file: rule.filePath });
        }
        if (validity.confidence === 'unknown_validity') {
            warnings.push({ severity: 'warning', code: 'unknown_rule_validity', ruleId: rule.rule_id, file: rule.filePath });
        }
    }

    for (const buildEntry of knowledge.buildMapping.builds) {
        if (buildEntry.mapping_status === 'unresolved_build_mapping') {
            warnings.push({ severity: 'warning', code: 'unknown_build_mapping', build: buildEntry.build });
        }
    }

    return {
        schema_version: '1.0.0',
        status: errors.length === 0 ? 'valid_with_warnings' : 'invalid',
        mechanic_count: knowledge.mechanics.length,
        rule_count: knowledge.rules.length,
        evidence_count: knowledge.sourceIndex.evidence.length,
        errors,
        warnings
    };
}

function buildMappedPatch(knowledge, build) {
    if (!build) {
        return null;
    }
    return knowledge.buildMapping.builds.find((entry) => String(entry.build) === String(build)) ?? null;
}

function ruleMatchesDate(rule, atDate) {
    if (!atDate) {
        return true;
    }
    const { effective_date_from: from, effective_date_until: until } = rule.validity;
    if (from && new Date(atDate) < new Date(from)) {
        return false;
    }
    if (until && new Date(atDate) > new Date(until)) {
        return false;
    }
    return true;
}

export function queryMechanics({ mechanic, build = null, patch = null, atDate = null }, baseDir = knowledgeDir) {
    const knowledge = loadKnowledge(baseDir);
    const buildEntry = buildMappedPatch(knowledge, build);
    const missingBuildMapping = Boolean(build && (!buildEntry || buildEntry.mapping_status === 'unresolved_build_mapping' || !buildEntry.patch_id));
    const rules = knowledge.rules.filter((rule) => (!mechanic || rule.mechanic_id === mechanic) && ruleMatchesDate(rule, atDate));
    const result = {
        mechanic,
        build: build === null ? null : Number(build),
        patch,
        atDate,
        applicableRules: [],
        ambiguousRules: [],
        supersededRules: [],
        missingBuildMapping,
        mappingConfidence: buildEntry?.confidence ?? null,
        mappingType: buildEntry?.mappingType ?? buildEntry?.mapping_status ?? null,
        candidatePatchIds: buildEntry?.candidatePatchIds ?? [],
        warnings: []
    };

    if (missingBuildMapping) {
        result.warnings.push(`Build ${build} has no independently verified patch mapping; current rules are not automatically applicable.`);
    }

    for (const rule of rules) {
        if (rule.status === 'superseded' || rule.validity.confidence === 'superseded') {
            result.supersededRules.push({ ruleId: rule.rule_id, reason: 'superseded' });
            continue;
        }
        if (missingBuildMapping || rule.validity.confidence === 'unknown_validity') {
            result.ambiguousRules.push({
                ruleId: rule.rule_id,
                validityConfidence: rule.validity.confidence,
                status: rule.status,
                reason: missingBuildMapping ? 'missing_build_mapping' : 'unknown_validity'
            });
            continue;
        }
        if (patch && rule.validity.patch_from && rule.validity.patch_from !== patch) {
            result.ambiguousRules.push({ ruleId: rule.rule_id, reason: 'patch_filter_not_matched' });
            continue;
        }
        result.applicableRules.push({ ruleId: rule.rule_id, validityConfidence: rule.validity.confidence, status: rule.status });
    }

    return result;
}

function parseArgs(argv) {
    const args = {};
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg.startsWith('--')) {
            const key = arg.slice(2);
            const next = argv[index + 1];
            if (!next || next.startsWith('--')) {
                args[key] = true;
            } else {
                args[key] = next;
                index += 1;
            }
        }
    }
    return args;
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.validate) {
        const summary = validateKnowledge();
        if (args['write-summary']) {
            fs.mkdirSync(path.dirname(path.resolve(args['write-summary'])), { recursive: true });
            fs.writeFileSync(path.resolve(args['write-summary']), `${JSON.stringify(summary, null, 2)}\n`);
        }
        console.log(JSON.stringify(summary, null, 2));
        process.exit(summary.status === 'invalid' ? 1 : 0);
    }
    const result = queryMechanics({
        mechanic: args.mechanic ?? null,
        build: args.build ?? null,
        patch: args.patch ?? null,
        atDate: args['at-date'] ?? null
    });
    console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
