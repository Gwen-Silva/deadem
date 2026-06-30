import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

function readJson(path) {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
}

test('replay 009 spatial validation preserves coordinate coverage and limits projection', () => {
    const summary = readJson('output/replay-009-spatial/spatial-validation-summary.json');
    assert.equal(summary.gate, 'replay_009_spatial_geometric_projection_ready_with_limitations');
    assert.equal(summary.coordinateSourceResult, 'usable_with_constraints');
    assert.equal(summary.eligiblePositionSamples, 26052);
    assert.equal(summary.successfullyProjectedSamples, 0);
    assert.equal(summary.genericRegionResult, 'unavailable');
    assert.equal(summary.laneProjectionResult, 'unavailable');
});

test('task 060 unlock matrix allows only non-spatial factual state categories', () => {
    const matrix = readJson('output/replay-009-spatial/task-060-unlock-matrix.json');
    const byCategory = new Map(matrix.categories.map((category) => [ category.category, category ]));
    assert.equal(byCategory.get('player life state').unlockStatus, 'unlocked_with_constraints');
    assert.equal(byCategory.get('team net worth').unlockStatus, 'unlocked_with_constraints');
    assert.equal(byCategory.get('objective-player proximity').unlockStatus, 'blocked');
    assert.equal(byCategory.get('lane/region membership').unlockStatus, 'blocked');
});

test('replay 005 and bot fixtures remain excluded', () => {
    const gate = readJson('output/replay-009-spatial/spatial-validation-gate.json');
    assert.equal(gate.replay005Protection, 'not_processed');
    assert.equal(gate.botFixtureExclusion, 'not_processed');
});
