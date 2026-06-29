# Replay 006 Entity Lifecycle State Refresh Gap

Date: 2026-06-29

## Scope

Task 051 investigated why replay 006 reaches a valid PacketEntities UPDATE for entity 5594 before the parser has a registry entry for it. Replay 005 was excluded. No entity-, baseline-, or class-specific skip was added.

## Instrumentation Validity

`valid`

[
  {
    "replayId": "replay_001",
    "nonzeroClassOrSerializerAfterSignon": true,
    "nonzeroEntityDuringGameplay": true,
    "changingRegistryAcrossPacketEntities": true,
    "maxStats": {
      "classes": 825,
      "serializers": 870,
      "baselines": 133,
      "entities": 1508
    }
  },
  {
    "replayId": "replay_002",
    "nonzeroClassOrSerializerAfterSignon": true,
    "nonzeroEntityDuringGameplay": true,
    "changingRegistryAcrossPacketEntities": true,
    "maxStats": {
      "classes": 825,
      "serializers": 870,
      "baselines": 135,
      "entities": 1508
    }
  }
]

## Entity Identity Model

{
  "registryIdentity": "entity index",
  "handleIdentity": "serial_plus_index",
  "decodedPacketEntityValue": "index_component",
  "indexBits": 14,
  "indexMask": "0x3fff",
  "serialBits": 17,
  "handleConstruction": "(serial << 14) | index",
  "handleLookupMask": "handle & 0x3FFF",
  "createUpdateDeleteKeyConstruction": "packet entity stream delta-decodes an entity index; CREATE additionally reads a 17-bit serial",
  "invalidIndexValues": "index must be >= 0 and < 16384",
  "generationIncrementRules": "not inferred by parser; serial is read from CREATE and stored on Entity",
  "indexReuseBehavior": "registerEntity replaces existing byIndex slot and updates class index"
}

## Failing Operation

{
  "loopIndex": 29,
  "entityIndexDelta": 2942,
  "decodedEntityIndex": 5594,
  "serial": null,
  "generation": null,
  "packedHandle": null,
  "operation": "update",
  "classId": null,
  "baselineId": null,
  "updateBaseline": false,
  "hasPvsVisBits": null,
  "fieldPathCount": null,
  "payloadBitStart": 7841,
  "payloadBitEnd": 7841,
  "deltaBitStart": 7825,
  "commandBitStart": 7839,
  "commandId": 0,
  "registryKey": "5594",
  "registryFoundBefore": false,
  "result": "update_missing_registry_entity",
  "warnings": []
}

## Entity 5594 Provenance

{
  "schemaVersion": 1,
  "searchedIndex": 5594,
  "priorLifecycleRows": [],
  "fullLifecycleRows": [
    {
      "commandSequence": 3880,
      "messageSequenceInCommand": 14,
      "tick": 3808,
      "messageTypeId": 55,
      "messageTypeName": "svc_PacketEntities",
      "loopIndex": 29,
      "entityIndexDelta": 2942,
      "decodedEntityIndex": 5594,
      "serial": null,
      "generation": null,
      "packedHandle": null,
      "operation": "update",
      "classId": null,
      "baselineId": null,
      "updateBaseline": false,
      "hasPvsVisBits": null,
      "fieldPathCount": null,
      "payloadBitStart": 7841,
      "payloadBitEnd": 7841,
      "deltaBitStart": 7825,
      "commandBitStart": 7839,
      "commandId": 0,
      "registryKey": "5594",
      "registryFoundBefore": false,
      "result": "exception:Unable to find an entity with index [ 5594 ]",
      "warnings": [],
      "registryStateBefore": "missing",
      "registryStateAfter": "missing"
    }
  ],
  "priorCreateFound": false,
  "priorDeleteOrLeaveFound": false,
  "result": "no_prior_create_enter_delete_leave_or_register_for_entity_5594_observed_before_failing_update"
}

## Packet Refresh Classification

{
  "isDelta": null,
  "deltaFrom": 4128,
  "updatedEntries": 59,
  "maxEntries": 2962,
  "updateBaseline": false,
  "baseline": 0,
  "entityDataBytes": 1559,
  "serializedEntitiesBytes": 101
}

Classification: `delta_update`

## Registry Reset Audit

{
  "schemaVersion": 1,
  "resetEvents": [
    {
      "kind": "demo_reset",
      "before": {
        "classCount": 0,
        "serializerCount": 0,
        "baselineCount": 0,
        "entityCount": 0,
        "entityKeyHash": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
        "classKeyHash": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"
      },
      "after": {
        "classCount": 0,
        "serializerCount": 0,
        "baselineCount": 0,
        "entityCount": 0,
        "entityKeyHash": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
        "classKeyHash": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"
      }
    }
  ],
  "registryEventsNearFailure": [
    {
      "commandSequence": 3317,
      "messageSequenceInCommand": 20,
      "tick": 3245,
      "messageTypeId": 55,
      "messageTypeName": "svc_PacketEntities",
      "kind": "register_entity",
      "index": 2956,
      "serial": 934,
      "classId": 29,
      "previousSerial": null,
      "countBefore": 1523,
      "countAfter": 1524
    },
    {
      "commandSequence": 3346,
      "messageSequenceInCommand": 33,
      "tick": 3274,
      "messageTypeId": 55,
      "messageTypeName": "svc_PacketEntities",
      "kind": "register_entity",
      "index": 2907,
      "serial": 763,
      "classId": 427,
      "previousSerial": 763,
      "countBefore": 1524,
      "countAfter": 1524
    },
    {
      "commandSequence": 3346,
      "messageSequenceInCommand": 33,
      "tick": 3274,
      "messageTypeId": 55,
      "messageTypeName": "svc_PacketEntities",
      "kind": "register_entity",
      "index": 2926,
      "serial": 453,
      "classId": 700,
      "previousSerial": 453,
      "countBefore": 1524,
      "countAfter": 1524
    },
    {
      "commandSequence": 3346,
      "messageSequenceInCommand": 33,
      "tick": 3274,
      "messageTypeId": 55,
      "messageTypeName": "svc_PacketEntities",
      "kind": "register_entity",
      "index": 2937,
      "serial": 622,
      "classId": 431,
      "previousSerial": 622,
      "countBefore": 1524,
      "countAfter": 1524
    },
    {
      "commandSequence": 3407,
      "messageSequenceInCommand": 25,
      "tick": 3335,
      "messageTypeId": 55,
      "messageTypeName": "svc_PacketEntities",
      "kind": "register_entity",
      "index": 2907,
      "serial": 763,
      "classId": 427,
      "previousSerial": 763,
      "countBefore": 1524,
      "countAfter": 1524
    },
    {
      "commandSequence": 3407,
      "messageSequenceInCommand": 25,
      "tick": 3335,
      "messageTypeId": 55,
      "messageTypeName": "svc_PacketEntities",
      "kind": "register_entity",
      "index": 2927,
      "serial": 495,
      "classId": 700,
      "previousSerial": 495,
      "countBefore": 1524,
      "countAfter": 1524
    },
    {
      "commandSequence": 3440,
      "messageSequenceInCommand": 27,
      "tick": 3368,
      "messageTypeId": 55,
      "messageTypeName": "svc_PacketEntities",
      "kind": "register_entity",
      "index": 2910,
      "serial": 934,
      "classId": 427,
      "previousSerial": 934,
      "countBefore": 1524,
      "countAfter": 1524
    },
    {
      "commandSequence": 3440,
      "messageSequenceInCommand": 27,
      "tick": 3368,
      "messageTypeId": 55,
      "messageTypeName": "svc_PacketEntities",
      "kind": "register_entity",
      "index": 2928,
      "serial": 984,
      "classId": 700,
      "previousSerial": 984,
      "countBefore": 1524,
      "countAfter": 1524
    },
    {
      "commandSequence": 3444,
      "messageSequenceInCommand": 19,
      "tick": 3372,
      "messageTypeId": 55,
      "messageTypeName": "svc_PacketEntities",
      "kind": "delete_entity",
      "index": 2956,
      "previousSerial": 934,
      "existed": true,
      "countBefore": 1524,
      "countAfter": 1523
    },
    {
      "commandSequence": 3508,
      "messageSequenceInCommand": 32,
      "tick": 3436,
      "messageTypeId": 55,
      "messageTypeName": "svc_PacketEntities",
      "kind": "register_entity",
      "index": 2907,
      "serial": 763,
      "classId": 427,
      "previousSerial": 763,
      "countBefore": 1523,
      "countAfter": 1523
    },
    {
      "commandSequence": 3508,
      "messageSequenceInCommand": 32,
      "tick": 3436,
      "messageTypeId": 55,
      "messageTypeName": "svc_PacketEntities",
      "kind": "register_entity",
      "index": 2908,
      "serial": 729,
      "classId": 700,
      "previousSerial": 729,
      "countBefore": 1523,
      "countAfter": 1523
    },
    {
      "commandSequence": 3510,
      "messageSequenceInCommand": 26,
      "tick": 3438,
      "messageTypeId": 55,
      "messageTypeName": "svc_PacketEntities",
      "kind": "register_entity",
      "index": 2910,
      "serial": 934,
      "classId": 427,
      "previousSerial": 934,
      "countBefore": 1523,
      "countAfter": 1523
    },
    {
      "commandSequence": 3510,
      "messageSequenceInCommand": 26,
      "tick": 3438,
      "messageTypeId": 55,
      "messageTypeName": "svc_PacketEntities",
      "kind": "register_entity",
      "index": 2911,
      "serial": 69,
      "classId": 700,
      "previousSerial": 69,
      "countBefore": 1523,
      "countAfter": 1523
    },
    {
      "commandSequence": 3551,
      "messageSequenceInCommand": 30,
      "tick": 3479,
      "messageTypeId": 55,
      "messageTypeName": "svc_PacketEntities",
      "kind": "register_entity",
      "index": 2913,
      "serial": 518,
      "classId": 700,
      "previousSerial": 518,
      "countBefore": 1523,
      "countAfter": 1523
    },
    {
      "commandSequence": 3551,
      "messageSequenceInCommand": 30,
      "tick": 3479,
      "messageTypeId": 55,
      "messageTypeName": "svc_PacketEntities",
      "kind": "register_entity",
      "index": 2917,
      "serial": 102,
      "classId": 427,
      "previousSerial": 102,
      "countBefore": 1523,
      "countAfter": 1523
    },
    {
      "commandSequence": 3567,
      "messageSequenceInCommand": 25,
      "tick": 3495,
      "messageTypeId": 55,
      "messageTypeName": "svc_PacketEntities",
      "kind": "register_entity",
      "index": 2916,
      "serial": 188,
      "classId": 700,
      "previousSerial": 188,
      "countBefore": 1523,
      "countAfter": 1523
    },
    {
      "commandSequence": 3567,
      "messageSequenceInCommand": 25,
      "tick": 3495,
      "messageTypeId": 55,
      "messageTypeName": "svc_PacketEntities",
      "kind": "register_entity",
      "index": 2919,
      "serial": 846,
      "classId": 427,
      "previousSerial": 846,
      "countBefore": 1523,
      "countAfter": 1523
    },
    {
      "commandSequence": 3569,
      "messageSequenceInCommand": 24,
      "tick": 3497,
      "messageTypeId": 55,
      "messageTypeName": "svc_PacketEntities",
      "kind": "register_entity",
      "index": 2914,
      "serial": 460,
      "classId": 700,
      "previousSerial": 460,
      "countBefore": 1523,
      "countAfter": 1523
    },
    {
      "commandSequence": 3569,
      "messageSequenceInCommand": 24,
      "tick": 3497,
      "messageTypeId": 55,
      "messageTypeName": "svc_PacketEntities",
      "kind": "register_entity",
      "index": 2923,
      "serial": 844,
      "classId": 427,
      "previousSerial": 844,
      "countBefore": 1523,
      "countAfter": 1523
    },
    {
      "commandSequence": 3576,
      "messageSequenceInCommand": 21,
      "tick": 3504,
      "messageTypeId": 55,
      "messageTypeName": "svc_PacketEntities",
      "kind": "register_entity",
      "index": 2918,
      "serial": 180,
      "classId": 700,
      "previousSerial": 180,
      "countBefore": 1523,
      "countAfter": 1523
    },
    {
      "commandSequence": 3576,
      "messageSequenceInCommand": 21,
      "tick": 3504,
      "messageTypeId": 55,
      "messageTypeName": "svc_PacketEntities",
      "kind": "register_entity",
      "index": 2925,
      "serial": 334,
      "classId": 427,
      "previousSerial": 334,
      "countBefore": 1523,
      "countAfter": 1523
    },
    {
      "commandSequence": 3576,
      "messageSequenceInCommand": 21,
      "tick": 3504,
      "messageTypeId": 55,
      "messageTypeName": "svc_PacketEntities",
      "kind": "register_entity",
      "index": 2937,
      "serial": 622,
      "classId": 431,
      "previousSerial": 622,
      "countBefore": 1523,
      "countAfter": 1523
    },
    {
      "commandSequence": 3624,
      "messageSequenceInCommand": 20,
      "tick": 3552,
      "messageTypeId": 55,
      "messageTypeName": "svc_PacketEntities",
      "kind": "register_entity",
      "index": 2957,
      "serial": 873,
      "classId": 624,
      "previousSerial": null,
      "countBefore": 1523,
      "countAfter": 1524
    },
    {
      "commandSequence": 3628,
      "messageSequenceInCommand": 27,
      "tick": 3556,
      "messageTypeId": 55,
      "messageTypeName": "svc_PacketEntities",
      "kind": "register_entity",
      "index": 2907,
      "serial": 763,
      "classId": 427,
      "previousSerial": 763,
      "countBefore": 1524,
      "countAfter": 1524
    },
    {
      "commandSequence": 3628,
      "messageSequenceInCommand": 27,
      "tick": 3556,
      "messageTypeId": 55,
      "messageTypeName": "svc_PacketEntities",
      "kind": "register_entity",
      "index": 2921,
      "serial": 64,
      "classId": 700,
      "previousSerial": 64,
      "countBefore": 1524,
      "countAfter": 1524
    },
    {
      "commandSequence": 3629,
      "messageSequenceInCommand": 22,
      "tick": 3557,
      "messageTypeId": 55,
      "messageTypeName": "svc_PacketEntities",
      "kind": "register_entity",
      "index": 2958,
      "serial": 155,
      "classId": 473,
      "previousSerial": null,
      "countBefore": 1524,
      "countAfter": 1525
    },
    {
      "commandSequence": 3633,
      "messageSequenceInCommand": 35,
      "tick": 3561,
      "messageTypeId": 55,
      "messageTypeName": "svc_PacketEntities",
      "kind": "delete_entity",
      "index": 2957,
      "previousSerial": 873,
      "existed": true,
      "countBefore": 1525,
      "countAfter": 1524
    },
    {
      "commandSequence": 3641,
      "messageSequenceInCommand": 30,
      "tick": 3569,
      "messageTypeId": 55,
      "messageTypeName": "svc_PacketEntities",
      "kind": "register_entity",
      "index": 2915,
      "serial": 389,
      "classId": 431,
      "previousSerial": 389,
      "countBefore": 1524,
      "countAfter": 1524
    },
    {
      "commandSequence": 3641,
      "messageSequenceInCommand": 30,
      "tick": 3569,
      "messageTypeId": 55,
      "messageTypeName": "svc_PacketEntities",
      "kind": "register_entity",
      "index": 2917,
      "serial": 102,
      "classId": 427,
      "previousSerial": 102,
      "countBefore": 1524,
      "countAfter": 1524
    },
    {
      "commandSequence": 3641,
      "messageSequenceInCommand": 30,
      "tick": 3569,
      "messageTypeId": 55,
      "messageTypeName": "svc_PacketEntities",
      "kind": "register_entity",
      "index": 2924,
      "serial": 72,
      "classId": 700,
      "previousSerial": 72,
      "countBefore": 1524,
      "countAfter": 1524
    },
    {
      "commandSequence": 3675,
      "messageSequenceInCommand": 44,
      "tick": 3603,
      "messageTypeId": 55,
      "messageTypeName": "svc_PacketEntities",
      "kind": "register_entity",
      "index": 2910,
      "serial": 934,
      "classId": 427,
      "previousSerial": 934,
      "countBefore": 1524,
      "countAfter": 1524
    },
    {
      "commandSequence": 3697,
      "messageSequenceInCommand": 39,
      "tick": 3625,
      "messageTypeId": 55,
      "messageTypeName": "svc_PacketEntities",
      "kind": "register_entity",
      "index": 2907,
      "serial": 763,
      "classId": 427,
      "previousSerial": 763,
      "countBefore": 1524,
      "countAfter": 1524
    },
    {
      "commandSequence": 3697,
      "messageSequenceInCommand": 39,
      "tick": 3625,
      "messageTypeId": 55,
      "messageTypeName": "svc_PacketEntities",
      "kind": "register_entity",
      "index": 2922,
      "serial": 133,
      "classId": 700,
      "previousSerial": 133,
      "countBefore": 1524,
      "countAfter": 1524
    },
    {
      "commandSequence": 3704,
      "messageSequenceInCommand": 24,
      "tick": 3632,
      "messageTypeId": 55,
      "messageTypeName": "svc_PacketEntities",
      "kind": "register_entity",
      "index": 2917,
      "serial": 102,
      "classId": 427,
      "previousSerial": 102,
      "countBefore": 1524,
      "countAfter": 1524
    },
    {
      "commandSequence": 3704,
      "messageSequenceInCommand": 24,
      "tick": 3632,
      "messageTypeId": 55,
      "messageTypeName": "svc_PacketEntities",
      "kind": "register_entity",
      "index": 2937,
      "serial": 622,
      "classId": 431,
      "previousSerial": 622,
      "countBefore": 1524,
      "countAfter": 1524
    },
    {
      "commandSequence": 3704,
      "messageSequenceInCommand": 24,
      "tick": 3632,
      "messageTypeId": 55,
      "messageTypeName": "svc_PacketEntities",
      "kind": "register_entity",
      "index": 2959,
      "serial": 389,
      "classId": 700,
      "previousSerial": null,
      "countBefore": 1524,
      "countAfter": 1525
    },
    {
      "commandSequence": 3712,
      "messageSequenceInCommand": 26,
      "tick": 3640,
      "messageTypeId": 55,
      "messageTypeName": "svc_PacketEntities",
      "kind": "register_entity",
      "index": 2923,
      "serial": 844,
      "classId": 427,
      "previousSerial": 844,
      "countBefore": 1525,
      "countAfter": 1525
    },
    {
      "commandSequence": 3712,
      "messageSequenceInCommand": 26,
      "tick": 3640,
      "messageTypeId": 55,
      "messageTypeName": "svc_PacketEntities",
      "kind": "register_entity",
      "index": 2960,
      "serial": 1,
      "classId": 700,
      "previousSerial": null,
      "countBefore": 1525,
      "countAfter": 1526
    },
    {
      "commandSequence": 3722,
      "messageSequenceInCommand": 19,
      "tick": 3650,
      "messageTypeId": 55,
      "messageTypeName": "svc_PacketEntities",
      "kind": "register_entity",
      "index": 2925,
      "serial": 334,
      "classId": 427,
      "previousSerial": 334,
      "countBefore": 1526,
      "countAfter": 1526
    },
    {
      "commandSequence": 3722,
      "messageSequenceInCommand": 19,
      "tick": 3650,
      "messageTypeId": 55,
      "messageTypeName": "svc_PacketEntities",
      "kind": "register_entity",
      "index": 2926,
      "serial": 453,
      "classId": 700,
      "previousSerial": 453,
      "countBefore": 1526,
      "countAfter": 1526
    }
  ],
  "entity5594WasCreatedAndCleared": false,
  "result": "entity_5594_was_never_registered_before_failure"
}

## Independent Index Decoder

{
  "schemaVersion": 1,
  "productionDecoder": {
    "algorithm": "index starts at -1; each loop adds readUVarInt()+1; command is next 2 bits",
    "failingIndex": 5594,
    "error": "Unable to find an entity with index [ 5594 ]"
  },
  "independentDecoder": {
    "loopIndex": 29,
    "entityIndexDelta": 2942,
    "decodedEntityIndex": 5594,
    "serial": null,
    "generation": null,
    "packedHandle": null,
    "operation": "update",
    "classId": null,
    "baselineId": null,
    "updateBaseline": false,
    "hasPvsVisBits": null,
    "fieldPathCount": null,
    "payloadBitStart": 7841,
    "payloadBitEnd": 7841,
    "deltaBitStart": 7825,
    "commandBitStart": 7839,
    "commandId": 0,
    "registryKey": "5594",
    "registryFoundBefore": false,
    "result": "update_missing_registry_entity",
    "warnings": []
  },
  "comparison": "matches_production_error_index_and_operation",
  "firstDifferingBit": null
}

## Successful Controls

{
  "schemaVersion": 1,
  "replay006": {
    "completed": false,
    "finalError": {
      "name": "Error",
      "message": "Unable to find an entity with index [ 5594 ]",
      "currentKey": {
        "commandSequence": 3880,
        "messageSequenceInCommand": 14,
        "tick": 3808,
        "messageTypeId": 55,
        "messageTypeName": "svc_PacketEntities"
      }
    },
    "updatePreconditions": {
      "missing": 1,
      "found": 222038
    },
    "maxStats": {
      "classes": 825,
      "serializers": 870,
      "baselines": 129,
      "entities": 1526
    }
  },
  "controls": [
    {
      "replayId": "replay_001",
      "completed": true,
      "finalError": null,
      "updatePreconditions": {
        "missing": 0,
        "found": 133667
      },
      "maxStats": {
        "classes": 825,
        "serializers": 870,
        "baselines": 133,
        "entities": 1508
      },
      "invariant": "all_updates_resolved_before_stop_tick"
    },
    {
      "replayId": "replay_002",
      "completed": true,
      "finalError": null,
      "updatePreconditions": {
        "missing": 0,
        "found": 149748
      },
      "maxStats": {
        "classes": 825,
        "serializers": 870,
        "baselines": 135,
        "entities": 1508
      },
      "invariant": "all_updates_resolved_before_stop_tick"
    }
  ],
  "interpretation": "Controls validate implementation observability and the current parser invariant: UPDATE expects an existing entity registry entry."
}

## Hypotheses

- 1. supported: entity 5594 was never created in the stream - no_prior_create_enter_delete_leave_or_register_for_entity_5594_observed_before_failing_update
- 2. not_supported: entity 5594 was created under another serial/generation - No prior CREATE/register for index 5594 was observed; UPDATE carries only index in this parser model.
- 3. not_supported: entity 5594 was created and incorrectly removed - entity_5594_was_never_registered_before_failure
- 4. not_supported: the failing decoded index is wrong due to delta accumulation - matches_production_error_index_and_operation
- 5. not_supported: the failing operation is misclassified as UPDATE - operation=update
- 6. not_supported: a full refresh is incorrectly treated as delta - delta_update
- 7. not_testable: an enter-PVS operation is incorrectly treated as update-only - The parser operation enum exposes UPDATE/LEAVE/CREATE/DELETE only; no independent enter-PVS marker was found in the envelope.
- 8. not_supported: a registry reset is applied without corresponding repopulation - entity_5594_was_never_registered_before_failure
- 9. not_supported: parser keys by index when protocol requires index plus serial - CREATE includes serial; UPDATE uses index only and successful controls satisfy that invariant.
- 10. not_supported: parser keys by packed handle when update provides index only - Demo.getEntity uses index; getEntityByHandle is not used in PacketEntities UPDATE.
- 11. supported: state instrumentation in task 050 observed the wrong registry - Task 050 final/control snapshots reported zero registry counts; this diagnostic validates registry visibility using stream-time demo.getStats() samples and register/delete hooks.
- 12. partially_supported: replay 006 uses a lifecycle path not covered by current tests - Replay 006 is the only failing eligible replay; no prior CREATE for the UPDATE was observed by current operation decoder.
- 13. not_supported: the stream legitimately references a missing entity and requires generic stale-reference tolerance - Controls did not show missing UPDATE preconditions; no protocol evidence yet permits treating this as harmless stale reference.

## Causal Chain

{
  "schemaVersion": 1,
  "exactRootCauseConfirmed": false,
  "confidence": "medium",
  "rootCause": "No prior parser-observable CREATE/register/enter lifecycle for entity 5594 was found before a valid UPDATE operation references index 5594.",
  "chain": [
    {
      "step": 1,
      "statement": "Instrumentation now observes nonzero parser registries in successful controls.",
      "evidence": "valid"
    },
    {
      "step": 2,
      "statement": "The tick 3808 packet decodes entity 5594 as UPDATE at a concrete loop/bit range.",
      "evidence": {
        "loopIndex": 29,
        "entityIndexDelta": 2942,
        "decodedEntityIndex": 5594,
        "serial": null,
        "generation": null,
        "packedHandle": null,
        "operation": "update",
        "classId": null,
        "baselineId": null,
        "updateBaseline": false,
        "hasPvsVisBits": null,
        "fieldPathCount": null,
        "payloadBitStart": 7841,
        "payloadBitEnd": 7841,
        "deltaBitStart": 7825,
        "commandBitStart": 7839,
        "commandId": 0,
        "registryKey": "5594",
        "registryFoundBefore": false,
        "result": "update_missing_registry_entity",
        "warnings": []
      }
    },
    {
      "step": 3,
      "statement": "No prior entity 5594 CREATE/register lifecycle was observed before the failing update.",
      "evidence": "no_prior_create_enter_delete_leave_or_register_for_entity_5594_observed_before_failing_update"
    },
    {
      "step": 4,
      "statement": "No registry reset/delete lifecycle explains removal of entity 5594 before failure.",
      "evidence": "entity_5594_was_never_registered_before_failure"
    },
    {
      "step": 5,
      "statement": "Tick 3808 is not proven to be a full refresh or enter-PVS mode that should implicitly create the entity.",
      "evidence": "delta_update"
    }
  ],
  "missingEvidenceForConfirmedGate": [
    "Independent protocol evidence that this UPDATE should have been preceded by a CREATE in the same replay stream.",
    "Or evidence of a generic state-refresh/enter-PVS semantic that the parser fails to implement.",
    "Or a production-safe generic fix that advances replay 006 and leaves replays 001-004 unchanged."
  ]
}

## Validation

{
  "schemaVersion": 1,
  "deterministicDiagnosticRerun": true,
  "instrumentationStatus": "valid",
  "replay005Protection": {
    "processed": false,
    "contentInspected": false,
    "excluded": true
  },
  "productionParserFixIncluded": false,
  "semanticTelemetryExtracted": false
}

## Gate

`replay_006_entity_lifecycle_narrowed_not_confirmed`
