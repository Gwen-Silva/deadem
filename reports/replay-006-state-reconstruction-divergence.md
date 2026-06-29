# Replay 006 State Reconstruction Divergence

Date: 2026-06-29

## Scope

Task 050 compared replay 006 gameplay-state reconstruction against the structurally valid envelope stream from task 047. Replay 005 was excluded and not inspected. No entity-, baseline-, or class-specific skip was added.

## Earliest Localized Divergence

```json
{
  "type": "first_parser_exception_without_confirmed_inner_operation",
  "tick": 3808,
  "commandSequence": 3880,
  "messageSequenceInCommand": 14,
  "sourceOffsetStart": 2083,
  "sourceOffsetEnd": 3787,
  "sourceOffsetBasis": "decoded_packet_data",
  "commandSourceOffsetStart": 9724946,
  "commandSourceOffsetEnd": 9728382,
  "messageTypeId": 55,
  "messageTypeName": "svc_PacketEntities",
  "packetEntityLoop": null,
  "operation": null,
  "affectedStateTable": "entity_registry",
  "entityIndex": 5594,
  "precondition": "parser_exception",
  "details": {
    "error": {
      "name": "Error",
      "message": "Unable to find an entity with index [ 5594 ]",
      "currentKey": {
        "commandSequence": 3880,
        "messageSequenceInCommand": 14,
        "tick": 3808,
        "messageTypeId": 55,
        "messageTypeName": "svc_PacketEntities"
      }
    }
  },
  "structuralEnvelopeValid": true
}
```

The first localized invalid state precondition is not the same as a proven earlier root cause. The diagnostic found a structurally valid `SVC_PacketEntities` message at tick 3808 whose decoded operation stream references entity 5594 with an UPDATE while the parser entity registry has no entity 5594.

## Important State

- Entity 5594 lifecycle: {"creates":{"count":0,"first":null,"last":null,"sample":[]},"updates":{"count":0,"first":null,"last":null,"sample":[]},"deletes":{"count":0,"first":null,"last":null,"sample":[]},"leaves":{"count":0,"first":null,"last":null,"sample":[]},"lookups":{"count":1,"first":{"commandSequence":3880,"messageSequenceInCommand":14,"tick":3808,"messageTypeId":55,"messageTypeName":"svc_PacketEntities","found":false},"last":{"commandSequence":3880,"messageSequenceInCommand":14,"tick":3808,"messageTypeId":55,"messageTypeName":"svc_PacketEntities","found":false},"sample":[{"commandSequence":3880,"messageSequenceInCommand":14,"tick":3808,"messageTypeId":55,"messageTypeName":"svc_PacketEntities","found":false}]}}
- Baseline 709 lifecycle: {"firstSeen":null,"lookups":{"count":58742,"first":{"commandSequence":1,"messageSequenceInCommand":0,"tick":-1,"messageTypeId":4,"messageTypeName":"net_Tick","found":false},"last":{"commandSequence":3880,"messageSequenceInCommand":13,"tick":3808,"messageTypeId":208,"messageTypeName":"GE_SosStartSoundEvent","found":false},"sample":[{"commandSequence":1,"messageSequenceInCommand":0,"tick":-1,"messageTypeId":4,"messageTypeName":"net_Tick","found":false},{"commandSequence":2,"messageSequenceInCommand":0,"tick":-1,"messageTypeId":51,"messageTypeName":"svc_ClearAllStringTables","found":false},{"commandSequence":3,"messageSequenceInCommand":0,"tick":-1,"messageTypeId":44,"messageTypeName":"svc_CreateStringTable","found":false},{"commandSequence":3880,"messageSequenceInCommand":11,"tick":3808,"messageTypeId":145,"messageTypeName":"UM_ParticleManager","found":false},{"commandSequence":3880,"messageSequenceInCommand":12,"tick":3808,"messageTypeId":340,"messageTypeName":"k_EUserMsg_ParticipantStartSoundEvent","found":false},{"commandSequence":3880,"messageSequenceInCommand":13,"tick":3808,"messageTypeId":208,"messageTypeName":"GE_SosStartSoundEvent","found":false}]},"clears":{"count":1,"first":{"commandSequence":2,"messageSequenceInCommand":0,"tick":-1,"messageTypeId":51,"messageTypeName":"svc_ClearAllStringTables"},"last":{"commandSequence":2,"messageSequenceInCommand":0,"tick":-1,"messageTypeId":51,"messageTypeName":"svc_ClearAllStringTables"},"sample":[{"commandSequence":2,"messageSequenceInCommand":0,"tick":-1,"messageTypeId":51,"messageTypeName":"svc_ClearAllStringTables"}]}}
- Class 709 lifecycle: {"firstSeen":{"commandSequence":62,"messageSequenceInCommand":0,"tick":-1,"messageTypeId":7,"messageTypeName":"net_SignonState"},"lookups":{"count":0,"first":null,"last":null,"sample":[]}}
- Class 891 lifecycle: {"firstSeen":null,"lookups":{"count":0,"first":null,"last":null,"sample":[]}}
- Serializer CModelPointEntity: {"firstSeen":{"commandSequence":62,"messageSequenceInCommand":0,"tick":-1,"messageTypeId":7,"messageTypeName":"net_SignonState"},"lookups":{"count":2,"first":{"commandSequence":62,"messageSequenceInCommand":0,"tick":-1,"messageTypeId":7,"messageTypeName":"net_SignonState","found":true},"last":{"commandSequence":62,"messageSequenceInCommand":0,"tick":-1,"messageTypeId":7,"messageTypeName":"net_SignonState","found":true},"sample":[{"commandSequence":62,"messageSequenceInCommand":0,"tick":-1,"messageTypeId":7,"messageTypeName":"net_SignonState","found":true},{"commandSequence":62,"messageSequenceInCommand":0,"tick":-1,"messageTypeId":7,"messageTypeName":"net_SignonState","found":true}]}}

## Message Body Audit

- Schema used: svc_PacketEntities
- Payload bounds: structural envelope payloadComplete true from task 047; semantic entityData bit consumption inspected only for operation preconditions
- Decode/re-encode equivalence available: false

## Atomicity

{
  "failingOperation": null,
  "parserAbortsEntityOperation": true,
  "parserAbortsEmbeddedMessage": true,
  "parserAbortsPacket": true,
  "parserAbortsAllMessagesAtCommandTick": true,
  "partialStateRollbackObserved": false,
  "continuesWithInconsistentRegistry": false
}

## Successful Replay Controls

[
  {
    "replayId": "replay_001",
    "completed": true,
    "finalError": null,
    "finalSnapshot": {
      "commandSequence": 3879,
      "messageSequenceInCommand": 19,
      "tick": 3808,
      "sourceOffset": null,
      "messageTypeId": 55,
      "classCount": 0,
      "serializerCount": 0,
      "baselineCount": 0,
      "entityCount": 0,
      "dormantEntityCount": 0,
      "classKeyHash": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
      "serializerKeyHash": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
      "baselineKeyHash": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
      "entityKeyHash": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
      "stateDigest": "401e558c0b835c538ea1b714bff3e2e32bab7dbf8f26865dedb79c10f3d04b13",
      "warningsSincePreviousCheckpoint": []
    },
    "packetEntityMessages": 3809,
    "firstInvalidPrecondition": null,
    "stateHash": "8599263011c21e86be770a30b1f1545315ad5f82ef97d79bf038cd86c673fd54"
  },
  {
    "replayId": "replay_002",
    "completed": true,
    "finalError": null,
    "finalSnapshot": {
      "commandSequence": 3879,
      "messageSequenceInCommand": 19,
      "tick": 3808,
      "sourceOffset": null,
      "messageTypeId": 55,
      "classCount": 0,
      "serializerCount": 0,
      "baselineCount": 0,
      "entityCount": 0,
      "dormantEntityCount": 0,
      "classKeyHash": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
      "serializerKeyHash": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
      "baselineKeyHash": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
      "entityKeyHash": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
      "stateDigest": "401e558c0b835c538ea1b714bff3e2e32bab7dbf8f26865dedb79c10f3d04b13",
      "warningsSincePreviousCheckpoint": []
    },
    "packetEntityMessages": 3809,
    "firstInvalidPrecondition": null,
    "stateHash": "54adae13619f2582855e524d3e2af50fa680f92f0ec8d79d2ecb8bd63a7c0986"
  }
]

## Hypotheses

- 1. not_supported: an earlier packet/message exception silently skips state mutations - No earlier exception was recorded before the first invalid packet-entity precondition.
- 2. partially_supported: a class-info message is parsed but not registered - class709 firstSeen={"commandSequence":62,"messageSequenceInCommand":0,"tick":-1,"messageTypeId":7,"messageTypeName":"net_SignonState"}, class891 firstSeen=null
- 3. partially_supported: an instancebaseline message is structurally present but ignored - Baseline 709 was absent when looked up; this task did not prove a prior baseline carrier for key 709 was ignored.
- 4. not_testable: an instancebaseline key is decoded incorrectly - No independent expected key mapping for baseline 709 was available without full semantic baseline decoding.
- 5. partially_supported: a table clear/reset removes valid baseline or class state - baseline clears tracked=1
- 6. partially_supported: entity registry uses the wrong index/generation key - Entity 5594 is referenced by UPDATE without observed prior create. No alternate generation key was proven.
- 7. not_supported: entity delete/reuse handling removes the wrong entity - entity5594 deletes=0
- 8. not_supported: a full packet is treated as delta or vice versa - Structural command sequence and parser command types agree through the candidate boundary.
- 9. not_testable: packet-entity operation ordering is decoded incorrectly - Operation order is internally consistent enough to reach the invalid UPDATE; no alternate decoder is established.
- 10. partially_supported: a serializer/class table version transition is unsupported - Class 891 is absent later under diagnostic recovery, but the earliest invalid precondition is entity 5594.
- 11. not_supported: parser state is initialized too late - Server, serializers, classes, baselines, and entities are already populated before tick 3808.
- 12. partially_supported: replay 006 contains an initialization/state-refresh path not exercised by replays 001-004 - Successful controls do not show the same invalid precondition before tick 3808.
- 13. not_supported: a prior recovery or warning path changes default state before tick 3808 - Default parser run used no recovery and recorded no accepted recovery before the failure.
- 14. partially_supported: message body decoding uses a schema that is structurally valid but semantically mismatched - Structural envelope is valid but state-level preconditions fail; exact schema mismatch is not proven.

## Causal Chain

{
  "schemaVersion": 1,
  "confidence": "medium",
  "exactRootCauseConfirmed": false,
  "chain": [
    {
      "step": 1,
      "statement": "Structurally valid SVC_PacketEntities message is reached.",
      "evidence": {
        "tick": 3808,
        "commandSequence": 3880,
        "messageSequenceInCommand": 14,
        "sourceOffsetStart": 2083,
        "sourceOffsetEnd": 3787,
        "messageTypeId": 55
      }
    },
    {
      "step": 2,
      "statement": "Semantic packet-entity scan decodes an UPDATE for entity 5594.",
      "evidence": {
        "packetEntityLoop": null,
        "operation": null,
        "entityIndex": 5594,
        "precondition": "parser_exception"
      }
    },
    {
      "step": 3,
      "statement": "Entity 5594 is absent from the entity registry at that moment.",
      "evidence": {
        "creates": {
          "count": 0,
          "first": null,
          "last": null,
          "sample": []
        },
        "updates": {
          "count": 0,
          "first": null,
          "last": null,
          "sample": []
        },
        "deletes": {
          "count": 0,
          "first": null,
          "last": null,
          "sample": []
        },
        "leaves": {
          "count": 0,
          "first": null,
          "last": null,
          "sample": []
        },
        "lookups": {
          "count": 1,
          "first": {
            "commandSequence": 3880,
            "messageSequenceInCommand": 14,
            "tick": 3808,
            "messageTypeId": 55,
            "messageTypeName": "svc_PacketEntities",
            "found": false
          },
          "last": {
            "commandSequence": 3880,
            "messageSequenceInCommand": 14,
            "tick": 3808,
            "messageTypeId": 55,
            "messageTypeName": "svc_PacketEntities",
            "found": false
          },
          "sample": [
            {
              "commandSequence": 3880,
              "messageSequenceInCommand": 14,
              "tick": 3808,
              "messageTypeId": 55,
              "messageTypeName": "svc_PacketEntities",
              "found": false
            }
          ]
        }
      }
    },
    {
      "step": 4,
      "statement": "Default parser aborts on the missing entity update; prior tasks showed limited continuation then exposes missing baseline 709 and class 891 at the same boundary.",
      "evidence": {
        "baseline709": {
          "firstSeen": null,
          "lookups": {
            "count": 58742,
            "first": {
              "commandSequence": 1,
              "messageSequenceInCommand": 0,
              "tick": -1,
              "messageTypeId": 4,
              "messageTypeName": "net_Tick",
              "found": false
            },
            "last": {
              "commandSequence": 3880,
              "messageSequenceInCommand": 13,
              "tick": 3808,
              "messageTypeId": 208,
              "messageTypeName": "GE_SosStartSoundEvent",
              "found": false
            },
            "sample": [
              {
                "commandSequence": 1,
                "messageSequenceInCommand": 0,
                "tick": -1,
                "messageTypeId": 4,
                "messageTypeName": "net_Tick",
                "found": false
              },
              {
                "commandSequence": 2,
                "messageSequenceInCommand": 0,
                "tick": -1,
                "messageTypeId": 51,
                "messageTypeName": "svc_ClearAllStringTables",
                "found": false
              },
              {
                "commandSequence": 3,
                "messageSequenceInCommand": 0,
                "tick": -1,
                "messageTypeId": 44,
                "messageTypeName": "svc_CreateStringTable",
                "found": false
              },
              {
                "commandSequence": 3880,
                "messageSequenceInCommand": 11,
                "tick": 3808,
                "messageTypeId": 145,
                "messageTypeName": "UM_ParticleManager",
                "found": false
              },
              {
                "commandSequence": 3880,
                "messageSequenceInCommand": 12,
                "tick": 3808,
                "messageTypeId": 340,
                "messageTypeName": "k_EUserMsg_ParticipantStartSoundEvent",
                "found": false
              },
              {
                "commandSequence": 3880,
                "messageSequenceInCommand": 13,
                "tick": 3808,
                "messageTypeId": 208,
                "messageTypeName": "GE_SosStartSoundEvent",
                "found": false
              }
            ]
          },
          "clears": {
            "count": 1,
            "first": {
              "commandSequence": 2,
              "messageSequenceInCommand": 0,
              "tick": -1,
              "messageTypeId": 51,
              "messageTypeName": "svc_ClearAllStringTables"
            },
            "last": {
              "commandSequence": 2,
              "messageSequenceInCommand": 0,
              "tick": -1,
              "messageTypeId": 51,
              "messageTypeName": "svc_ClearAllStringTables"
            },
            "sample": [
              {
                "commandSequence": 2,
                "messageSequenceInCommand": 0,
                "tick": -1,
                "messageTypeId": 51,
                "messageTypeName": "svc_ClearAllStringTables"
              }
            ]
          }
        },
        "class891": {
          "firstSeen": null,
          "lookups": {
            "count": 0,
            "first": null,
            "last": null,
            "sample": []
          }
        }
      }
    }
  ],
  "rankedCandidateChains": [
    {
      "rank": 1,
      "confidence": "medium",
      "summary": "Replay 006 reaches a valid packet-entity message whose first invalid state precondition is UPDATE for never-created entity 5594."
    },
    {
      "rank": 2,
      "confidence": "low",
      "summary": "Replay 006 may require an unsupported earlier state-refresh/lifecycle path that should have created or retained entity 5594 before tick 3808."
    }
  ]
}

## Validation

{
  "schemaVersion": 1,
  "replay005Protection": {
    "processed": false,
    "contentInspected": false,
    "excluded": true
  },
  "deterministicDiagnosticRerun": true,
  "normalParserBehaviorChanged": false,
  "earliestInvalidPreconditionFound": true,
  "outputContainsSemanticTelemetry": false,
  "finalErrorPreserved": "Unable to find an entity with index [ 5594 ]"
}

## Gate

`replay_006_divergence_narrowed_not_confirmed`
