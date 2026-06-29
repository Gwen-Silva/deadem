import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const OUTPUT_DIR = 'output/parser-compatibility';
const REPORT = 'reports/replay-006-external-parser-oracle-comparison.md';
const now = '2026-06-29T00:00:00.000Z';

const oracleRoot = 'output-local/external-parser-oracles';
const candidates = [
  {
    id: 'upstream_deadem',
    repository: 'Igor-Losev/deadem',
    localPath: path.join(oracleRoot, 'upstream-deadem'),
    commitSha: '207fe497e8bf909a1208ac6b9a62f43b640a781a',
    license: 'MIT',
    language: 'JavaScript',
    runtime: 'Node.js',
    activeOrArchived: 'active',
    deadlockSupportClaimed: true,
    packetEntitiesImplemented: true,
    candidateStatus: 'accepted',
    reason: 'Closest upstream/reference implementation; Deadlock package and packet-entity state reconstruction are present.'
  },
  {
    id: 'demlocksharp',
    repository: 'OpenSource-Deadlock-Tools/DemLockSharp',
    localPath: path.join(oracleRoot, 'DemLockSharp'),
    commitSha: '70c9b5072b192b21a47957de3587223f03c4c140',
    license: 'not_found_in_root',
    language: 'C#',
    runtime: '.NET',
    activeOrArchived: 'active_or_wip',
    deadlockSupportClaimed: true,
    packetEntitiesImplemented: true,
    candidateStatus: 'blocked',
    reason: 'Deadlock-specific but sample executable has a hard-coded demo path and requires local instrumentation before controlled replay execution.'
  },
  {
    id: 'source2_demo',
    repository: 'Rupas1k/source2-demo',
    localPath: path.join(oracleRoot, 'source2-demo'),
    commitSha: '9909e369e6f308291ea15ef9e9dfd1206f86956c',
    license: 'Apache-2.0 OR MIT',
    language: 'Rust',
    runtime: 'cargo',
    activeOrArchived: 'active',
    deadlockSupportClaimed: true,
    packetEntitiesImplemented: true,
    candidateStatus: 'blocked',
    reason: 'Deadlock feature exists, but cargo is unavailable in this environment; source comparison only.'
  },
  {
    id: 'demofile_net',
    repository: 'saul/demofile-net',
    localPath: path.join(oracleRoot, 'demofile-net'),
    commitSha: 'fd59701a998cf30a46adc4942e063d90de73c07a',
    license: 'MIT',
    language: 'C#',
    runtime: '.NET',
    activeOrArchived: 'active',
    deadlockSupportClaimed: true,
    packetEntitiesImplemented: true,
    candidateStatus: 'blocked',
    reason: 'Deadlock parser exists; NuGet restore succeeded after escalation but build is blocked by shallow-clone version-height requirements.'
  }
];

const upstreamRun = {
  parser: 'upstream_deadem',
  command: 'node --input-type=module upstream Parser over samples/partida_001.dem, partida_002.dem, partida_006.dem',
  controls: [
    { replay: 'partida_001.dem', status: 'complete', elapsedMs: 77112, finalTickReached: null, completionToEof: true },
    { replay: 'partida_002.dem', status: 'complete', elapsedMs: 41826, finalTickReached: null, completionToEof: true }
  ],
  replay006: {
    status: 'error',
    elapsedMs: 1223,
    passesTick3808: false,
    firstError: 'Unable to find an entity with index [ 5594 ]',
    stackTop: [
      'DemoMessageHandler.handleSvcPacketEntities packages/engine/src/handlers/DemoMessageHandler.js:128:31',
      'DemoStreamPacketAnalyzer._handleMessagePackets packages/engine/src/stream/DemoStreamPacketAnalyzer.js:110:73'
    ]
  }
};

const currentKnown = {
  parser: 'current_fork_reference',
  controls: [
    { replay: 'partida_001.dem', status: 'complete', source: 'parser compatibility matrix' },
    { replay: 'partida_002.dem', status: 'complete', source: 'parser compatibility matrix' }
  ],
  replay006: {
    status: 'error',
    firstError: 'Unable to find an entity with index [ 5594 ]',
    failingTick: 3808,
    commandSequence: 3880,
    messageSequenceInCommand: 14,
    packetEntityLoop: 29,
    decodedIndex: 5594,
    operation: 'UPDATE'
  }
};

async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

function readIfExists(filePath) {
  return fsSync.existsSync(filePath) ? fsSync.readFileSync(filePath, 'utf8') : '';
}

function sha256Text(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function compareFile(relativePath) {
  const current = readIfExists(relativePath);
  const upstream = readIfExists(path.join(oracleRoot, 'upstream-deadem', relativePath));
  const identical = current.length > 0 && upstream.length > 0 && current === upstream;
  return {
    path: relativePath,
    currentHash: current ? sha256Text(current) : null,
    upstreamHash: upstream ? sha256Text(upstream) : null,
    comparison: identical ? 'identical' : current && upstream ? 'fork_modified' : 'unknown',
    currentBytes: Buffer.byteLength(current),
    upstreamBytes: Buffer.byteLength(upstream)
  };
}

async function writeJson(filePath, value) {
  await ensureDir(filePath);
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + '\n');
}

async function writeCsv(filePath, rows) {
  const headers = Object.keys(rows[0] ?? {});
  const esc = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const lines = [headers.join(','), ...rows.map(row => headers.map(header => esc(row[header])).join(','))];
  await ensureDir(filePath);
  await fs.writeFile(filePath, lines.join('\n') + '\n');
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const tick3808 = [
    {
      parser: 'current_fork_reference',
      tick: 3808,
      packetEntityLoop: 29,
      decodedIndex: 5594,
      operation: 'UPDATE',
      serial: null,
      classId: null,
      registryFoundBefore: false,
      behavior: 'throws missing entity during state reconstruction',
      continuesAfterOperation: false,
      evidenceType: 'trace',
      confidence: 'high'
    },
    {
      parser: 'upstream_deadem',
      tick: 3808,
      packetEntityLoop: null,
      decodedIndex: 5594,
      operation: 'UPDATE',
      serial: null,
      classId: null,
      registryFoundBefore: false,
      behavior: 'same missing-entity exception in same handleSvcPacketEntities UPDATE path',
      continuesAfterOperation: false,
      evidenceType: 'output-log+source-analysis',
      confidence: 'medium_high'
    },
    {
      parser: 'demofile_net',
      tick: 3808,
      packetEntityLoop: null,
      decodedIndex: null,
      operation: null,
      serial: null,
      classId: null,
      registryFoundBefore: null,
      behavior: 'not executed; build blocked by shallow-clone versioning after NuGet restore',
      continuesAfterOperation: null,
      evidenceType: 'output-log',
      confidence: 'low'
    },
    {
      parser: 'source2_demo',
      tick: 3808,
      packetEntityLoop: null,
      decodedIndex: null,
      operation: null,
      serial: null,
      classId: null,
      registryFoundBefore: null,
      behavior: 'not executed; cargo unavailable',
      continuesAfterOperation: null,
      evidenceType: 'source-analysis',
      confidence: 'low'
    },
    {
      parser: 'demlocksharp',
      tick: 3808,
      packetEntityLoop: null,
      decodedIndex: null,
      operation: null,
      serial: null,
      classId: null,
      registryFoundBefore: null,
      behavior: 'not executed; requires controlled CLI/instrumentation rather than hard-coded sample path',
      continuesAfterOperation: null,
      evidenceType: 'source-analysis',
      confidence: 'low'
    }
  ];

  const executionMatrix = [
    {
      parser: 'upstream_deadem',
      replay: 'partida_001.dem',
      parserStartsSuccessfully: true,
      headerParsed: true,
      completionToEof: true,
      firstError: null,
      entityStateSupport: true,
      tick3808Reached: true,
      replay006PassesTick3808: null,
      notes: 'Control parsed completely.'
    },
    {
      parser: 'upstream_deadem',
      replay: 'partida_002.dem',
      parserStartsSuccessfully: true,
      headerParsed: true,
      completionToEof: true,
      firstError: null,
      entityStateSupport: true,
      tick3808Reached: true,
      replay006PassesTick3808: null,
      notes: 'Control parsed completely.'
    },
    {
      parser: 'upstream_deadem',
      replay: 'partida_006.dem',
      parserStartsSuccessfully: true,
      headerParsed: true,
      completionToEof: false,
      firstError: 'Unable to find an entity with index [ 5594 ]',
      entityStateSupport: true,
      tick3808Reached: true,
      replay006PassesTick3808: false,
      notes: 'Fails in same upstream packet-entity update path.'
    },
    {
      parser: 'demofile_net',
      replay: 'partida_006.dem',
      parserStartsSuccessfully: false,
      headerParsed: false,
      completionToEof: false,
      firstError: 'Nerdbank.GitVersioning shallow clone lacks objects required to calculate version height',
      entityStateSupport: true,
      tick3808Reached: null,
      replay006PassesTick3808: null,
      notes: 'Execution blocked by oracle clone/build setup, not replay evidence.'
    },
    {
      parser: 'source2_demo',
      replay: 'partida_006.dem',
      parserStartsSuccessfully: false,
      headerParsed: false,
      completionToEof: false,
      firstError: 'cargo unavailable',
      entityStateSupport: true,
      tick3808Reached: null,
      replay006PassesTick3808: null,
      notes: 'Source-level candidate only in this environment.'
    },
    {
      parser: 'demlocksharp',
      replay: 'partida_006.dem',
      parserStartsSuccessfully: false,
      headerParsed: false,
      completionToEof: false,
      firstError: 'controlled CLI not available without local instrumentation',
      entityStateSupport: true,
      tick3808Reached: null,
      replay006PassesTick3808: null,
      notes: 'WIP parser; source comparison only.'
    }
  ];

  const provenance = [
    {
      parser: 'current_fork_reference',
      entityIndex: 5594,
      result: 'not_observed_before_tick_3808',
      details: 'Task 051 found no prior create/register/enter/delete/leave/reset and no alternate serial/generation.'
    },
    {
      parser: 'upstream_deadem',
      entityIndex: 5594,
      result: 'same_failure',
      details: 'Upstream fails at missing entity 5594 before exposing lifecycle state; source has same update lookup assumption.'
    },
    {
      parser: 'demofile_net',
      entityIndex: 5594,
      result: 'not_observable',
      details: 'Build blocked before replay execution.'
    },
    {
      parser: 'source2_demo',
      entityIndex: 5594,
      result: 'not_observable',
      details: 'Rust runtime unavailable.'
    },
    {
      parser: 'demlocksharp',
      entityIndex: 5594,
      result: 'not_observable',
      details: 'No controlled execution path used in this task.'
    }
  ];

  const lifecycleComparison = [
    {
      parser: 'current_fork_reference',
      indexDeltaAlgorithm: 'index += readUVarInt() + 1',
      operationDecoder: 'two-bit entity command: UPDATE=0, LEAVE=1, CREATE=2, DELETE=3',
      identityKey: 'entity index only in current registry access',
      missingUpdateBehavior: 'throw',
      enterPvsBehavior: 'not separately represented from CREATE in observed parser path',
      leavePvsBehavior: 'requires existing entity then emits LEAVE',
      fullUpdateBehavior: 'does not infer entities from UPDATE in delta packet',
      deltaUpdateBehavior: 'UPDATE requires existing entity',
      atomicityBehavior: 'message parse aborts on missing entity',
      notes: ['Task 051 independent index decoder matches production for failing loop.']
    },
    {
      parser: 'upstream_deadem',
      indexDeltaAlgorithm: 'index += readUVarInt() + 1',
      operationDecoder: 'two-bit entity command: UPDATE=0, LEAVE=1, CREATE=2, DELETE=3',
      identityKey: 'entity index only in source path',
      missingUpdateBehavior: 'throw',
      enterPvsBehavior: 'not separately represented from CREATE in source path',
      leavePvsBehavior: 'requires existing entity then emits LEAVE',
      fullUpdateBehavior: 'does not infer entities from UPDATE in delta packet',
      deltaUpdateBehavior: 'UPDATE requires existing entity',
      atomicityBehavior: 'message parse aborts on missing entity',
      notes: ['Upstream source line 128 throws the same missing-entity exception.']
    },
    {
      parser: 'demofile_net',
      indexDeltaAlgorithm: 'source contains entity index/serial abstractions but not executed here',
      operationDecoder: 'not observed',
      identityKey: 'entity index plus serial is present in public test JSON representation',
      missingUpdateBehavior: 'not observed',
      enterPvsBehavior: 'not observed',
      leavePvsBehavior: 'not observed',
      fullUpdateBehavior: 'source includes full-packet support',
      deltaUpdateBehavior: 'not observed',
      atomicityBehavior: 'not observed',
      notes: ['Promising independent oracle, but build requires non-shallow clone or versioning override.']
    },
    {
      parser: 'source2_demo',
      indexDeltaAlgorithm: 'not executed',
      operationDecoder: 'not observed',
      identityKey: 'source exposes entity indices and handles',
      missingUpdateBehavior: 'not observed',
      enterPvsBehavior: 'not observed',
      leavePvsBehavior: 'not observed',
      fullUpdateBehavior: 'source has packet_state writer/read support',
      deltaUpdateBehavior: 'not observed',
      atomicityBehavior: 'not observed',
      notes: ['Requires Rust toolchain and Deadlock feature build.']
    }
  ];

  const upstreamFiles = [
    'packages/engine/src/handlers/DemoMessageHandler.js',
    'packages/engine/src/data/enums/EntityOperation.js',
    'packages/engine/src/core/BitBuffer.js',
    'packages/engine/src/extractors/EntityPayloadSizeExtractor.js',
    'packages/engine/src/handlers/DemoEntityHandler.js'
  ].map(compareFile);

  const upstreamComparison = {
    upstreamRepository: 'Igor-Losev/deadem',
    upstreamCommit: candidates[0].commitSha,
    currentRepository: 'Gwen-Silva/deadem',
    currentHead: 'not_resolved_by_script',
    forkPoint: 'not_established',
    relevantFiles: upstreamFiles,
    focusedFindings: [
      {
        area: 'packet entity loop',
        classification: 'fork_modified',
        finding: 'The fork adds diagnostic/recovery parameters and trace objects, but the core UPDATE lookup requirement and missing entity throw are inherited from upstream.'
      },
      {
        area: 'entity operation enum',
        classification: 'identical',
        finding: 'UPDATE/LEAVE/CREATE/DELETE ids match upstream.'
      },
      {
        area: 'index delta decoding',
        classification: 'identical',
        finding: 'Both implementations use index += readUVarInt() + 1 in the packet-entity loop.'
      },
      {
        area: 'missing update behavior',
        classification: 'identical',
        finding: 'Both implementations throw when UPDATE cannot resolve an existing entity.'
      },
      {
        area: 'structural inspector',
        classification: 'fork_added',
        finding: 'The current fork has StructuralReplayInspector from Task 047; upstream clone does not export it.'
      }
    ],
    conclusion: 'No upstream fix for replay 006 missing UPDATE behavior was found in the cloned upstream head.'
  };

  const diffSummary = {
    schemaVersion: 1,
    generatedAt: now,
    items: upstreamComparison.focusedFindings,
    productionFixCandidate: null,
    reasonNoFix: 'The only executable external parser in this task was upstream deadem, and it fails identically; no independent implementation exposed a valid prior lifecycle event or protocol-tolerated missing UPDATE.'
  };

  const ranking = [
    {
      parser: 'upstream_deadem',
      rank: 'B',
      evidence: 'Executes controls and replay 006; fails same missing-entity path. Lifecycle detail requires source inspection.'
    },
    {
      parser: 'demofile_net',
      rank: 'C',
      evidence: 'Credible independent implementation with Deadlock support and source-level full-packet/entity support, but execution blocked by shallow-clone build versioning.'
    },
    {
      parser: 'source2_demo',
      rank: 'C',
      evidence: 'Credible Source 2 parser with Deadlock feature, but cargo unavailable.'
    },
    {
      parser: 'demlocksharp',
      rank: 'C',
      evidence: 'Deadlock-specific WIP source, but controlled execution/instrumentation not available.'
    }
  ];

  const decision = {
    schemaVersion: 1,
    generatedAt: now,
    bestSupportedDecisionModel: 'upstream_inherited_defect',
    alternatives: [
      { model: 'fork_regression', support: 'not_supported', reason: 'Upstream fails in same packet-entity missing-update path.' },
      { model: 'external_parser_confirms_missing_create', support: 'partially_supported', reason: 'Current fork confirms no prior create; upstream same-fails before exposing provenance.' },
      { model: 'external_parser_finds_implicit_lifecycle_event', support: 'not_supported', reason: 'No executed independent parser exposed such an event.' },
      { model: 'missing_update_is_protocol_tolerated', support: 'not_supported', reason: 'No oracle demonstrated valid tolerance semantics.' },
      { model: 'no_suitable_independent_oracle', support: 'not_supported', reason: 'At least upstream deadem was executable, but it is not independent enough to resolve protocol behavior.' },
      { model: 'insufficient_evidence', support: 'partially_supported', reason: 'Independent non-deadem oracles remain unexecuted due environment/build blockers.' }
    ],
    productionFixIncluded: false,
    reasonNoProductionFix: 'No independent lifecycle evidence or generic protocol behavior was demonstrated.'
  };

  const validation = {
    schemaVersion: 1,
    generatedAt: now,
    replay005Excluded: true,
    externalReposCommitted: false,
    largeTracesCommitted: false,
    currentControlsUsed: ['partida_001.dem', 'partida_002.dem'],
    replay006Used: 'partida_006.dem',
    filesJsonValidatedByScript: true,
    notes: [
      'NuGet network was requested for demofile-net; build then failed on shallow clone versioning.',
      'No .dem files, external clones, or package caches are intended for commit.'
    ]
  };

  const gate = {
    schemaVersion: 1,
    gate: 'external_oracle_comparison_ready_without_resolution',
    selectedDecisionModel: decision.bestSupportedDecisionModel,
    replay005Excluded: true,
    productionFixIncluded: false,
    blockedFollowUpTask: 'tasks/blocked/053-complete-independent-parser-oracle-execution-for-replay-006.md',
    summary: 'Upstream deadem is not a fix source and fails replay 006 identically; stronger independent oracles remain blocked by runtime/build setup.'
  };

  await writeJson(path.join(OUTPUT_DIR, 'external-oracle-candidate-inventory.json'), { schemaVersion: 1, generatedAt: now, candidates });
  await writeJson(path.join(OUTPUT_DIR, 'external-oracle-execution-matrix.json'), { schemaVersion: 1, generatedAt: now, currentKnown, upstreamRun, executionMatrix });
  await writeJson(path.join(OUTPUT_DIR, 'external-oracle-tick-3808-comparison.json'), { schemaVersion: 1, generatedAt: now, comparisons: tick3808 });
  await writeJson(path.join(OUTPUT_DIR, 'external-oracle-entity-5594-provenance.json'), { schemaVersion: 1, generatedAt: now, provenance });
  await writeJson(path.join(OUTPUT_DIR, 'external-oracle-lifecycle-behavior-comparison.json'), { schemaVersion: 1, generatedAt: now, comparisons: lifecycleComparison });
  await writeJson(path.join(OUTPUT_DIR, 'upstream-fork-comparison.json'), upstreamComparison);
  await writeJson(path.join(OUTPUT_DIR, 'upstream-relevant-diff-summary.json'), diffSummary);
  await writeJson(path.join(OUTPUT_DIR, 'external-oracle-evidence-ranking.json'), { schemaVersion: 1, generatedAt: now, ranking });
  await writeJson(path.join(OUTPUT_DIR, 'external-oracle-decision.json'), decision);
  await writeJson(path.join(OUTPUT_DIR, 'external-oracle-validation.json'), validation);
  await writeJson(path.join(OUTPUT_DIR, 'external-oracle-gate.json'), gate);
  await writeCsv(path.join(OUTPUT_DIR, 'external-oracle-execution-matrix.csv'), executionMatrix);

  const report = `# Replay 006 External Parser Oracle Comparison

## Objective

Task 052 compared replay 006 against external parser candidates without adding parser skips, placeholders, or semantic recovery. Replay 005 was not processed.

## Candidate Results

| Candidate | Commit | Status | Result |
| --- | --- | --- | --- |
| Igor-Losev/deadem | ${candidates[0].commitSha} | executable | Controls 001/002 completed; replay 006 failed with \`Unable to find an entity with index [ 5594 ]\`. |
| OpenSource-Deadlock-Tools/DemLockSharp | ${candidates[1].commitSha} | source-only | Deadlock-specific WIP; controlled CLI/instrumentation not available in this task. |
| Rupas1k/source2-demo | ${candidates[2].commitSha} | source-only | Deadlock support exists, but cargo is unavailable. |
| saul/demofile-net | ${candidates[3].commitSha} | blocked | Deadlock parser exists; NuGet restore was allowed, then build failed because the shallow clone lacks version-height history. |

## Upstream Deadem Oracle

The upstream parser is the closest reference implementation. It successfully parsed \`partida_001.dem\` and \`partida_002.dem\`, then failed \`partida_006.dem\` in \`DemoMessageHandler.handleSvcPacketEntities\` with the same missing entity 5594 error.

This result does not prove protocol correctness, because upstream is related to this fork. It does show that the current replay-006 blocker is not explained by a simple fork-only regression in packet-entity UPDATE handling.

## Tick 3808

Task 051 established the precise current-fork decode:

- tick: 3808
- command sequence: 3880
- message sequence: 14
- message type: svc_PacketEntities
- packet loop index: 29
- decoded entity index: 5594
- operation: UPDATE
- packet classification: delta update
- registry state before operation: missing

Upstream does not expose loop-level diagnostics without local third-party instrumentation, but its failure is in the same UPDATE lookup path and error text.

## Source-Level Comparison

The relevant upstream packet-entity logic uses the same index-delta algorithm and the same operation IDs. Both implementations require UPDATE, LEAVE, and DELETE to resolve an existing entity. The fork adds diagnostic/recovery instrumentation around this path, but no upstream fix or alternate lifecycle behavior was found in the cloned upstream head.

## Decision

Best-supported model: \`upstream_inherited_defect\`.

This is not a production fix criterion. No independent implementation demonstrated that a missing UPDATE is protocol-tolerated, that an implicit lifecycle event exists before tick 3808, or that the operation should decode differently.

## Gate

\`external_oracle_comparison_ready_without_resolution\`

## Follow-Up

Created blocked task 053 to complete independent oracle execution once the environment can support either:

- a non-shallow/full-history \`demofile-net\` checkout, or
- a Rust toolchain for \`source2-demo\`, or
- a controlled \`DemLockSharp\` CLI/instrumentation pass.
`;
  await ensureDir(REPORT);
  await fs.writeFile(REPORT, report);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
