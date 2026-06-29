import { describe, expect, test } from 'vitest';

import EntityOperation from '#data/enums/EntityOperation.js';
import { recoverMissingEntityReference } from '#handlers/DemoMessageHandler.js';

function createRecovery(warnings) {
    return {
        allowUnresolvedEntityReference: true,
        recordUnresolvedEntityReference: warning => warnings.push(warning)
    };
}

describe('DemoMessageHandler unresolved entity recovery', () => {
    test('It skips only the invalid update payload when payload size is known', () => {
        const warnings = [];
        const bitBuffer = {
            moved: 0,
            move(bits) {
                this.moved += bits;
            }
        };

        const recovered = recoverMissingEntityReference(createRecovery(warnings), {
            operation: EntityOperation.UPDATE,
            index: 5594,
            bitBuffer,
            payloadBits: 37,
            loop: 4,
            registryState: 'missing'
        });

        expect(recovered).toBe(true);
        expect(bitBuffer.moved).toBe(37);
        expect(warnings).toEqual([
            {
                operation: 'UPDATE',
                entityIndex: 5594,
                loop: 4,
                payloadBits: 37,
                registryStateBefore: 'missing',
                recoveryAction: 'skipped_invalid_update_payload',
                recoverable: true,
                reason: null,
                registryStateAfter: 'unchanged_missing_entity'
            }
        ]);
    });

    test('It refuses update recovery when payload size is unavailable', () => {
        const warnings = [];
        const bitBuffer = {
            move() {
                throw new Error('must not move');
            }
        };

        const recovered = recoverMissingEntityReference(createRecovery(warnings), {
            operation: EntityOperation.UPDATE,
            index: 5594,
            bitBuffer,
            payloadBits: null,
            loop: 4,
            registryState: 'missing'
        });

        expect(recovered).toBe(false);
        expect(warnings[0]).toMatchObject({
            operation: 'UPDATE',
            entityIndex: 5594,
            recoveryAction: 'none',
            recoverable: false,
            reason: 'missing_payload_size'
        });
    });

    test('It preserves unrelated packet entries by tolerating missing leave and delete references', () => {
        for (const operation of [ EntityOperation.LEAVE, EntityOperation.DELETE ]) {
            const warnings = [];
            const recovered = recoverMissingEntityReference(createRecovery(warnings), {
                operation,
                index: 2961,
                bitBuffer: { move() {} },
                payloadBits: 0,
                loop: 8,
                registryState: 'missing'
            });

            expect(recovered).toBe(true);
            expect(warnings[0]).toMatchObject({
                operation: operation.code,
                entityIndex: 2961,
                recoveryAction: 'ignored_missing_entity_state_transition',
                registryStateAfter: 'unchanged_missing_entity'
            });
        }
    });

    test('It remains disabled unless explicitly enabled', () => {
        const recovered = recoverMissingEntityReference(null, {
            operation: EntityOperation.UPDATE,
            index: 5594,
            bitBuffer: { move() {} },
            payloadBits: 37,
            loop: 4,
            registryState: 'missing'
        });

        expect(recovered).toBe(false);
    });
});
