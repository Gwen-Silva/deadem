import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadKnowledge, queryMechanics, validateKnowledge } from '../../tools/query-mechanics.mjs';

test('knowledge base validates with warnings only', () => {
    const summary = validateKnowledge();
    assert.equal(summary.status, 'valid_with_warnings');
    assert.equal(summary.errors.length, 0);
    assert.ok(summary.mechanic_count >= 6);
    assert.ok(summary.rule_count >= 7);
    assert.ok(summary.evidence_count >= 8);
});

test('build 23916427 remains ambiguous rather than applying current Urn rules', () => {
    const result = queryMechanics({
        mechanic: 'spirit_urn',
        build: 23916427,
        atDate: '2026-06-29'
    });
    assert.equal(result.missingBuildMapping, true);
    assert.equal(result.applicableRules.length, 0);
    assert.equal(result.mappingType, 'date_supported');
    assert.deepEqual(result.candidatePatchIds, [ 'official_2026_06_11_minor' ]);
    assert.ok(result.ambiguousRules.some((rule) => rule.ruleId === 'spirit_urn.current_documented_lifecycle'));
});

test('duplicate rule ids are validation errors', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'deadem-knowledge-'));
    fs.cpSync('knowledge', tmp, { recursive: true });
    const source = path.join(tmp, 'mechanics', 'objectives', 'spirit-urn', 'versions', 'current-documented-rule.json');
    const duplicate = path.join(tmp, 'mechanics', 'objectives', 'spirit-urn', 'versions', 'duplicate-rule.json');
    fs.copyFileSync(source, duplicate);
    const summary = validateKnowledge(tmp);
    assert.equal(summary.status, 'invalid');
    assert.ok(summary.errors.some((error) => error.code === 'duplicate_rule_id'));
});

test('missing evidence refs are validation errors', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'deadem-knowledge-'));
    fs.cpSync('knowledge', tmp, { recursive: true });
    const file = path.join(tmp, 'mechanics', 'economy', 'souls', 'versions', 'current-terminology-rule.json');
    const rule = JSON.parse(fs.readFileSync(file, 'utf8'));
    rule.evidence_refs.push('missing-source');
    fs.writeFileSync(file, `${JSON.stringify(rule, null, 2)}\n`);
    const summary = validateKnowledge(tmp);
    assert.equal(summary.status, 'invalid');
    assert.ok(summary.errors.some((error) => error.code === 'missing_evidence_ref'));
});

test('loadKnowledge exposes mechanic and rule records', () => {
    const knowledge = loadKnowledge();
    assert.ok(knowledge.mechanics.some((mechanic) => mechanic.mechanic_id === 'souls_economy'));
    assert.ok(knowledge.rules.some((rule) => rule.rule_id === 'death_respawn.current_documented_identity'));
});
