import { describe, expect, test } from 'vitest';

import Class from '#data/Class.js';
import Demo from '#data/Demo.js';
import Entity from '#data/entity/Entity.js';
import Serializer from '#data/fields/Serializer.js';

import {
    decodePacketEntityOperationsWithParserState,
    entityIdentityModel,
    packEntityHandle,
    summarizeDemoState
} from '../../../scripts/replay-006-entity-lifecycle-utils.js';

describe('Replay 006 entity lifecycle diagnostics', () => {
    test('It documents parser entity identity as index lookup plus serial handle metadata', () => {
        const model = entityIdentityModel();

        expect(model.registryIdentity).toBe('entity index');
        expect(model.handleConstruction).toBe('(serial << 14) | index');
        expect(packEntityHandle(5594, 3)).toBe(((3 << 14) | 5594) >>> 0);
    });

    test('It independently decodes a missing update index without registry materialization', () => {
        const demo = new Demo();
        const message = {
            updatedEntries: 1,
            updateBaseline: false,
            entityData: Uint8Array.from([ 0 ]),
            serializedEntities: new Uint8Array()
        };

        const operations = decodePacketEntityOperationsWithParserState(message, demo);

        expect(operations).toHaveLength(1);
        expect(operations[0]).toMatchObject({
            loopIndex: 0,
            decodedEntityIndex: 0,
            operation: 'update',
            registryFoundBefore: false,
            result: 'update_missing_registry_entity'
        });
    });

    test('It observes real Demo registry changes through public stats and iterators', () => {
        const demo = new Demo();
        const serializer = new Serializer('CExampleEntity', 0, []);
        const clazz = new Class(7, 'CExampleEntity', serializer);

        demo.registerSerializer(serializer);
        demo.registerClass(clazz);
        demo.registerEntity(new Entity(42, 5, clazz));

        const state = summarizeDemoState(demo);

        expect(state.classCount).toBe(1);
        expect(state.serializerCount).toBe(1);
        expect(state.entityCount).toBe(1);
        expect(demo.getEntity(42)?.serial).toBe(5);
        expect(demo.getEntityByHandle(packEntityHandle(42, 5))?.index).toBe(42);
    });
});
