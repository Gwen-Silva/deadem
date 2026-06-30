#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describeEvent } from './replay-state-filter.mjs';

const ROOT = new URL('../', import.meta.url);
const DEFAULT_OUT = 'output/replay-009-inspection';
const GATE = 'replay_009_factual_state_inspector_ready_with_constraints';

function parseArgs(argv) {
    const args = { replay: 'replay_009', output: DEFAULT_OUT };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--replay') args.replay = argv[++index];
        if (arg === '--output') args.output = argv[++index];
    }
    return args;
}

async function readJson(relativePath) {
    return JSON.parse(await readFile(new URL(relativePath, ROOT), 'utf8'));
}

async function readJsonl(relativePath) {
    const text = await readFile(new URL(relativePath, ROOT), 'utf8');
    return text.trim() ? text.trim().split(/\r?\n/u).map(line => JSON.parse(line)) : [];
}

async function writeJson(file, value) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(file, value) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, value);
}

function assertCanonical(summary, events, metadata, players, entities, snapshots, overlays) {
    const errors = [];
    if (summary.gate !== 'replay_009_canonical_factual_state_ready_with_constraints') errors.push('unexpected canonical gate');
    if (summary.canonicalEventCount !== events.length + metadata.length) errors.push('canonical record count mismatch');
    if (summary.timelineEventCount !== events.length) errors.push('timeline event count mismatch');
    if (summary.nonTimelineEventCount !== metadata.length) errors.push('metadata count mismatch');
    if (summary.playerRegistryCount !== players.players.length) errors.push('player count mismatch');
    if (summary.entityRegistryCount !== entities.entities.length) errors.push('entity count mismatch');
    if (summary.snapshotCount !== snapshots.length) errors.push('snapshot count mismatch');
    if (summary.validationOverlayCount !== overlays.overlays.length) errors.push('overlay count mismatch');
    if (summary.mechanicEffectsApplied !== 0) errors.push('mechanic effects were applied');
    if (summary.spatialStatus !== 'unavailable') errors.push('spatial status changed');
    if (errors.length) throw new Error(`invalid canonical input: ${errors.join('; ')}`);
}

function playerStats(players, events) {
    return players.players.map(player => {
        const playerEvents = events.filter(event => event.subject.playerKey === player.playerKey);
        return {
            ...player,
            observedDeaths: playerEvents.filter(event => event.eventCategory === 'player_dead').length,
            observedRespawnReturns: playerEvents.filter(event => event.eventCategory === 'player_respawned').length,
            unresolvedReturns: 0,
            lifeEvents: playerEvents.filter(event => event.eventCategory.startsWith('player_')).map(event => event.eventId),
            netWorthEvents: playerEvents.filter(event => event.eventCategory === 'player_net_worth').map(event => event.eventId),
            sourceProvenance: [...new Set(playerEvents.map(event => event.provenance.sourceTaskId))]
        };
    });
}

function entityStats(entities, events, overlays) {
    const overlayByEvent = new Map(overlays.overlays.map(row => [row.canonicalEventId, row]));
    return entities.entities.map(entity => {
        const entityEvents = events.filter(event => event.subject.entityKey === entity.entityKey);
        const matchedOverlays = entityEvents.map(event => overlayByEvent.get(event.eventId)).filter(Boolean);
        return {
            ...entity,
            eventCount: entityEvents.length,
            eventIds: entityEvents.map(event => event.eventId),
            teamValues: [...new Set(entityEvents.filter(event => event.eventCategory === 'entity_team_observed').map(event => event.value.current))],
            semanticLimits: [...new Set(entityEvents.map(event => event.epistemicStatus.semanticLimit).filter(Boolean))],
            warnings: [...new Set(entityEvents.flatMap(event => event.epistemicStatus.warnings))],
            sampledVisualComparisons: matchedOverlays.map(row => row.comparisonId),
            sourceTasks: [...new Set(entityEvents.map(event => event.provenance.sourceTaskId))]
        };
    });
}

function overview(summary, capabilities) {
    return {
        schemaVersion: 1,
        replayId: 'replay_009',
        matchId: '91381179',
        buildId: '23916427',
        parserDurationSeconds: 2170.703,
        canonicalGate: summary.gate,
        inspectorGate: GATE,
        playerCount: summary.playerRegistryCount,
        entityCount: summary.entityRegistryCount,
        canonicalRecordCount: summary.canonicalEventCount,
        timelineEventCount: summary.timelineEventCount,
        metadataRecordCount: summary.nonTimelineEventCount,
        snapshotCount: summary.snapshotCount,
        validationOverlayCount: summary.validationOverlayCount,
        unmatchedValidationCount: summary.unmatchedValidationCount,
        spatialStatus: summary.spatialStatus,
        mechanicVersionStatus: 'unresolved',
        mechanicEffectsApplied: summary.mechanicEffectsApplied,
        caveats: [
            'Canonical does not mean independently validated.',
            'Visual validation applies only to sampled events.',
            'Parser time is not pause-adjusted game time.',
            'Camera absence is not entity absence.',
            'Entity deletion is not destruction or objective completion.'
        ],
        capabilities: capabilities.capabilities
    };
}

function metadataForInspector(metadata) {
    return {
        ...metadata,
        eventsWithoutParserTimeline: metadata.eventsWithoutParserTimeline.map(event => ({
            ...event,
            time: {
                ...event.time,
                demoTick: null,
                parserSeconds: null
            },
            metadataReason: 'no demo tick / no parser time; kept outside chronological timeline'
        }))
    };
}

function html() {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Replay 009 Factual State Inspector</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header>
    <h1>Replay 009 Factual State Inspector</h1>
    <p>Factual and candidate observations only. No mechanic effects, spatial regions, or macro interpretation.</p>
  </header>
  <nav aria-label="Inspector views">
    <button data-view="overview">Overview</button>
    <button data-view="capabilities">Capabilities</button>
    <button data-view="timeline">Timeline</button>
    <button data-view="snapshots">Snapshots</button>
    <button data-view="players">Players</button>
    <button data-view="entities">Entities</button>
    <button data-view="validation">Validation</button>
    <button data-view="metadata">Metadata</button>
  </nav>
  <main id="app" tabindex="-1"></main>
  <script src="app.js"></script>
</body>
</html>
`;
}

function css() {
    return `:root{font-family:Segoe UI,Arial,sans-serif;color:#17202a;background:#f6f8fb}body{margin:0}header{padding:20px 28px;background:#16202f;color:white}header h1{margin:0 0 6px;font-size:28px}nav{display:flex;gap:8px;flex-wrap:wrap;padding:12px 24px;background:#e8edf5;border-bottom:1px solid #cfd7e6}button,input,select{font:inherit}button{border:1px solid #8fa1ba;background:white;border-radius:6px;padding:7px 10px;cursor:pointer}button:focus,input:focus,select:focus{outline:3px solid #6da8ff;outline-offset:2px}main{padding:20px 24px}.panel{background:white;border:1px solid #d7dfeb;border-radius:8px;padding:16px;margin-bottom:16px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}.metric{background:#f2f5fa;border:1px solid #dae2ef;border-radius:6px;padding:10px}.toolbar{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin-bottom:12px}table{width:100%;border-collapse:collapse;background:white}th,td{border:1px solid #dce3ee;padding:7px;vertical-align:top;text-align:left}th{background:#edf2f8;position:sticky;top:0}.status{font-weight:700}.candidate{background:#fff8df}.blocked{background:#ffecec}.supported{background:#eaf7ef}.muted{color:#5f6b7a}.scroll{max-height:65vh;overflow:auto}.empty{padding:20px;background:#fff5e6;border:1px solid #f0cf93}details{margin-top:4px}summary{cursor:pointer;font-weight:600}code{white-space:pre-wrap}`;
}

function js() {
    return `const state={data:{},view:'overview'};
const files={overview:'data/overview.json',players:'data/players.json',entities:'data/entities.json',events:'data/events.json',metadata:'data/metadata.json',snapshots:'data/snapshots.json',validation:'data/validation-overlays.json',capabilities:'data/capabilities.json',summary:'data/generation-summary.json'};
async function load(){for(const [k,u] of Object.entries(files)) state.data[k]=await fetch(u).then(r=>r.json()); document.querySelectorAll('nav button').forEach(b=>b.addEventListener('click',()=>render(b.dataset.view))); render('overview');}
function esc(v){return String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function badge(v){const c=String(v).includes('candidate')?'candidate':String(v).includes('blocked')?'blocked':String(v).includes('supported')||String(v).includes('confirmed')?'supported':'';return '<span class="status '+c+'">'+esc(v)+'</span>'}
function provenance(r){return '<details><summary>Provenance</summary><code>'+esc(JSON.stringify({sourceTask:r.provenance?.sourceTaskId,sourcePath:r.provenance?.sourcePath,sourceEventId:r.provenance?.sourceEventId,parserDerived:r.provenance?.parserDerived,visualValidationSource:r.provenance?.visualValidationSourceId,observationStatus:r.epistemicStatus?.observationStatus,confidence:r.epistemicStatus?.confidence,validationStatus:r.epistemicStatus?.validationStatus,mechanicVersionStatus:r.epistemicStatus?.mechanicVersionStatus,mechanicEffectApplied:r.epistemicStatus?.mechanicEffectApplied,semanticLimit:r.epistemicStatus?.semanticLimit,warnings:r.epistemicStatus?.warnings},null,2))+'</code></details>'}
function render(view){state.view=view; const app=document.getElementById('app'); app.innerHTML=views[view](); app.focus();}
const views={
overview(){const o=state.data.overview;return '<section class="panel"><h2>Overview</h2><div class="grid">'+['replayId','matchId','buildId','parserDurationSeconds','canonicalGate','inspectorGate','playerCount','entityCount','timelineEventCount','metadataRecordCount','snapshotCount','validationOverlayCount','spatialStatus','mechanicVersionStatus','mechanicEffectsApplied'].map(k=>'<div class="metric"><strong>'+esc(k)+'</strong><br>'+badge(o[k])+'</div>').join('')+'</div><h3>Caveats</h3><ul>'+o.caveats.map(c=>'<li>'+esc(c)+'</li>').join('')+'</ul><p><strong>Entity deletion is not interpreted as destruction or objective completion.</strong></p></section>'},
capabilities(){return '<section class="panel"><h2>Capability Matrix</h2><table><thead><tr><th>Capability</th><th>Status</th><th>Evidence</th><th>Safe / prohibited</th></tr></thead><tbody>'+state.data.capabilities.capabilities.map(c=>'<tr><td>'+esc(c.capability)+'</td><td>'+badge(c.status)+'</td><td>'+esc(c.evidence)+'</td><td>Safe factual inspection only; no strategic or mechanic-effect conclusions.</td></tr>').join('')+'</tbody></table></section>'},
timeline(){const events=filterEvents(state.data.events.events);return '<section class="panel"><h2>Timeline</h2>'+filters()+'<p>'+events.length+' of '+state.data.events.events.length+' timeline events shown.</p><div class="scroll"><table><thead><tr><th>Seconds</th><th>Tick</th><th>Category</th><th>Type</th><th>Subject</th><th>Team</th><th>Mechanic</th><th>Value</th><th>Source</th><th>Confidence</th><th>Validation</th><th>Limit</th><th>Warnings</th></tr></thead><tbody>'+events.slice(0,500).map(eventRow).join('')+'</tbody></table></div></section>'},
snapshots(){return '<section class="panel"><h2>Snapshot Viewer</h2><label>Parser seconds <input id="snapTime" type="number" step="0.001" value="0"></label> <button onclick="showSnapshot()">Show nearest</button><div id="snapshotResult" class="panel"></div></section>'},
players(){return '<section class="panel"><h2>Player Inspector</h2><table><thead><tr><th>Player</th><th>Team</th><th>Controller</th><th>Pawns</th><th>Deaths</th><th>Returns</th><th>Warnings</th></tr></thead><tbody>'+state.data.players.players.map(p=>'<tr><td>'+esc(p.playerKey)+'</td><td>'+esc(p.team)+'</td><td>'+esc(p.controllerEntityIndex)+'</td><td>'+esc((p.pawnEntityIndices||[]).join(', '))+'</td><td>'+esc(p.observedDeaths)+'</td><td>'+esc(p.observedRespawnReturns)+'</td><td>'+esc((p.warnings||[]).join('; '))+'</td></tr>').join('')+'</tbody></table></section>'},
entities(){return '<section class="panel"><h2>Entity Inspector</h2><div class="scroll"><table><thead><tr><th>Entity</th><th>Class</th><th>Type</th><th>First</th><th>Last</th><th>Events</th><th>Visual</th><th>Limits</th></tr></thead><tbody>'+state.data.entities.entities.map(e=>'<tr class="'+(e.classification.includes('candidate')?'candidate':'')+'"><td>'+esc(e.entityKey)+'</td><td>'+esc(e.className)+'</td><td>'+badge(e.classification)+'</td><td>'+esc(e.firstSeenTick)+'</td><td>'+esc(e.lastSeenTick)+'</td><td>'+esc(e.eventCount)+'</td><td>'+esc(e.independentValidation?.categoryStatus)+' / '+esc((e.sampledVisualComparisons||[]).join(', '))+'</td><td>'+esc((e.semanticLimits||[]).join('; '))+'</td></tr>').join('')+'</tbody></table></div></section>'},
validation(){return '<section class="panel"><h2>Independent Validation</h2><table><thead><tr><th>Comparison</th><th>Event</th><th>Category</th><th>Status</th><th>Visibility</th><th>Predicted video</th><th>Window</th><th>Identity</th><th>Timing</th><th>Confidence</th><th>Limits</th></tr></thead><tbody>'+state.data.validation.overlays.map(o=>'<tr><td>'+esc(o.comparisonId)+'</td><td>'+esc(o.canonicalEventId)+'</td><td>'+esc(o.category)+'</td><td>'+badge(o.comparisonStatus)+'</td><td>'+esc(o.visibility)+'</td><td>'+esc(o.predictedVideoSeconds)+'</td><td>+/-'+esc(o.timingWindowSeconds?.before)+'</td><td>'+esc(o.identityStatus)+'</td><td>'+esc(o.timingStatus)+'</td><td>'+esc(o.confidence)+'</td><td>'+esc((o.semanticLimits||[]).join('; '))+'</td></tr>').join('')+'</tbody></table></section>'},
metadata(){return '<section class="panel"><h2>Non-Timeline Metadata</h2><p>These '+state.data.metadata.eventsWithoutParserTimeline.length+' records have no parser timeline placement and no synthetic timestamps.</p><div class="scroll"><table><thead><tr><th>Category</th><th>Type</th><th>Subject</th><th>Reason</th><th>Provenance</th></tr></thead><tbody>'+state.data.metadata.eventsWithoutParserTimeline.map(r=>'<tr><td>'+esc(r.eventCategory)+'</td><td>'+esc(r.eventType)+'</td><td>'+esc(r.subject?.entityKey||r.subject?.subjectId)+'</td><td>no demo tick / no parser time</td><td>'+provenance(r)+'</td></tr>').join('')+'</tbody></table></div></section>'}
};
function filters(){return '<div class="toolbar">'+['start-seconds','end-seconds','event-category','event-type','player','team','mechanic','entity-class','confidence','validation-status'].map(k=>'<label>'+k+'<input data-filter="'+k+'"></label>').join('')+'<label><input type="checkbox" data-filter="candidate-only"> candidate-only</label><label><input type="checkbox" data-filter="visually-supported"> visually supported</label><label><input type="checkbox" data-filter="warnings-present"> warnings</label><button onclick="render(\\'timeline\\')">Apply</button></div>'}
function filterArgs(){const args={}; document.querySelectorAll('[data-filter]').forEach(el=>{if(el.type==='checkbox'){if(el.checked)args[el.dataset.filter]=true}else if(el.value)args[el.dataset.filter]=el.value}); return args}
function filterEvents(events){const args=filterArgs(); return events.filter(e=>{if(args['start-seconds']&&e.time.parserSeconds<Number(args['start-seconds']))return false;if(args['end-seconds']&&e.time.parserSeconds>Number(args['end-seconds']))return false;if(args['event-category']&&e.eventCategory!==args['event-category'])return false;if(args['event-type']&&e.eventType!==args['event-type'])return false;if(args.player&&e.subject.playerKey!==args.player)return false;if(args.team&&String(e.subject.team)!==String(args.team))return false;if(args.mechanic&&e.subject.mechanicId!==args.mechanic)return false;if(args['entity-class']&&e.subject.className!==args['entity-class'])return false;if(args.confidence&&e.epistemicStatus.confidence!==args.confidence)return false;if(args['validation-status']&&e.epistemicStatus.validationStatus!==args['validation-status'])return false;if(args['candidate-only']&&e.epistemicStatus.observationStatus!=='candidate')return false;if(args['visually-supported']&&!['visually_confirmed','visually_supported'].includes(e.epistemicStatus.validationStatus))return false;if(args['warnings-present']&&e.epistemicStatus.warnings.length===0)return false;return true})}
function subject(e){return e.subject.playerKey||e.subject.entityKey||e.subject.subjectId||''}
function eventRow(e){return '<tr class="'+(e.epistemicStatus.observationStatus==='candidate'?'candidate':'')+'"><td>'+esc(e.time.parserSeconds)+'</td><td>'+esc(e.time.demoTick)+'</td><td>'+esc(e.eventCategory)+'</td><td>'+esc(e.eventType)+'</td><td>'+esc(subject(e))+'</td><td>'+esc(e.subject.team)+'</td><td>'+esc(e.subject.mechanicId)+'</td><td>'+esc(JSON.stringify(e.value.current))+'</td><td>'+esc(e.provenance.sourceTaskId)+'</td><td>'+esc(e.epistemicStatus.confidence)+'</td><td>'+badge(e.epistemicStatus.validationStatus)+'</td><td>'+esc(e.epistemicStatus.semanticLimit)+'</td><td>'+esc(e.epistemicStatus.warnings.join('; '))+provenance(e)+'</td></tr>'}
window.showSnapshot=function(){const target=Number(document.getElementById('snapTime').value);const snaps=state.data.snapshots.snapshots;const s=snaps.reduce((best,row)=>Math.abs(row.parserSeconds-target)<Math.abs(best.parserSeconds-target)?row:best,snaps[0]);const alive=Object.entries(s.players).filter(([,p])=>p.state==='alive');const dead=Object.entries(s.players).filter(([,p])=>p.state==='dead');const ents=Object.values(s.entityPresence);document.getElementById('snapshotResult').innerHTML='<h3>Nearest snapshot '+esc(s.parserSeconds)+'s</h3><p>Alive '+alive.length+', dead '+dead.length+'. Carry-forward values are marked in JSON.</p><p>Team net worth: '+esc(JSON.stringify(s.teamNetWorth))+'</p><p>Present entities: '+esc(ents.map(e=>e.className||e.mechanicId).join(', '))+'</p><details open><summary>Snapshot JSON</summary><code>'+esc(JSON.stringify(s,null,2))+'</code></details>'}
load();`;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.replay !== 'replay_009') throw new Error('Only replay_009 is supported.');
    const out = args.output;
    const dataOut = path.join(out, 'data');

    const summary = await readJson('output/replay-009-canonical/validation-summary.json');
    const players = await readJson('output/replay-009-canonical/player-registry.json');
    const entities = await readJson('output/replay-009-canonical/entity-registry.json');
    const events = await readJsonl('output/replay-009-canonical/factual-events.jsonl');
    const metadata = await readJson('output/replay-009-canonical/non-timeline-metadata.json');
    const snapshots = await readJsonl('output/replay-009-canonical/snapshots.jsonl');
    const overlays = await readJson('output/replay-009-canonical/independent-validation-overlay.json');
    const capabilities = await readJson('output/replay-009-canonical/capability-matrix.json');
    const unmatched = await readJson('output/replay-009-canonical/unmatched-validation-records.json');

    assertCanonical(summary, events, metadata.eventsWithoutParserTimeline, players, entities, snapshots, overlays);

    const inspectorMetadata = metadataForInspector(metadata);
    const eventDescriptions = events.map(event => ({ ...event, description: describeEvent(event) }));
    const playerData = { ...players, players: playerStats(players, events) };
    const entityData = { ...entities, entities: entityStats(entities, events, overlays) };
    const overviewData = overview(summary, capabilities);
    const generationSummary = {
        schemaVersion: 1,
        replayId: 'replay_009',
        gate: GATE,
        generatedBy: 'tools/generate-replay-inspection-report.mjs',
        sourceCanonicalGate: summary.gate,
        canonicalRecordsLoaded: summary.canonicalEventCount,
        timelineRecordsLoaded: events.length,
        metadataRecordsLoaded: inspectorMetadata.eventsWithoutParserTimeline.length,
        playersLoaded: players.players.length,
        entitiesLoaded: entities.entities.length,
        snapshotsLoaded: snapshots.length,
        overlaysLoaded: overlays.overlays.length,
        unmatchedOverlays: unmatched.unmatchedCount,
        filtersImplemented: ['time range', 'event type', 'event category', 'player', 'team', 'mechanic', 'entity class', 'confidence', 'validation status', 'candidate-only', 'visually supported', 'warnings present'],
        mechanicEffectsApplied: 0,
        spatialStatus: 'unavailable',
        replay005Protection: 'not_processed_or_inspected',
        botFixtureExclusion: 'not_processed_or_inspected'
    };

    await writeText(path.join(out, 'index.html'), html());
    await writeText(path.join(out, 'styles.css'), css());
    await writeText(path.join(out, 'app.js'), js());
    await writeJson(path.join(dataOut, 'overview.json'), overviewData);
    await writeJson(path.join(dataOut, 'players.json'), playerData);
    await writeJson(path.join(dataOut, 'entities.json'), entityData);
    await writeJson(path.join(dataOut, 'events.json'), { schemaVersion: 1, replayId: 'replay_009', events: eventDescriptions });
    await writeJson(path.join(dataOut, 'metadata.json'), inspectorMetadata);
    await writeJson(path.join(dataOut, 'snapshots.json'), { schemaVersion: 1, replayId: 'replay_009', snapshots });
    await writeJson(path.join(dataOut, 'validation-overlays.json'), overlays);
    await writeJson(path.join(dataOut, 'capabilities.json'), capabilities);
    await writeJson(path.join(dataOut, 'generation-summary.json'), generationSummary);
    await writeText(path.join(out, 'README.md'), `# Replay 009 Factual State Inspector\n\nGenerate with:\n\n\`\`\`bash\nnode tools/generate-replay-inspection-report.mjs --replay replay_009\n\`\`\`\n\nServe locally with:\n\n\`\`\`bash\nnode tools/serve-replay-inspector.mjs --dir output/replay-009-inspection\n\`\`\`\n\nOpen \`index.html\` through the local server. The inspector displays factual and candidate observations only. It does not perform strategic or macro analysis, apply mechanic effects, infer destruction/kills/objective completion, or use spatial regions.\n`);
    await writeText('reports/replay-009-factual-state-inspection-interface.md', `# Replay 009 Factual State Inspection Interface\n\nTask 066 generated a static local inspector for the Task 065 canonical replay-009 factual state layer.\n\n## Gate\n\n\`${GATE}\`\n\n## Output\n\n- Static interface: \`output/replay-009-inspection/index.html\`\n- Local server: \`node tools/serve-replay-inspector.mjs --dir output/replay-009-inspection\`\n- Export tool: \`tools/export-replay-factual-report.mjs\`\n\n## Loaded Data\n\n- Canonical records: ${summary.canonicalEventCount}\n- Timeline records: ${events.length}\n- Non-timeline metadata records: ${metadata.eventsWithoutParserTimeline.length}\n- Players: ${players.players.length}\n- Entities: ${entities.entities.length}\n- Snapshots: ${snapshots.length}\n- Validation overlays: ${overlays.overlays.length}\n- Unmatched overlays: ${unmatched.unmatchedCount}\n\n## Boundaries\n\nThe inspector displays factual and candidate observations. It does not apply mechanic effects, infer spatial regions, classify lanes, infer objective completion, destruction, kills, secured objectives, fights, pressure, macro decisions, or strategy.\n`);
    console.log(JSON.stringify(generationSummary, null, 2));
}

await main();
