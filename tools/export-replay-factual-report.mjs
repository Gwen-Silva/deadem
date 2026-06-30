#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describeEvent, eventMatches, parseArgs } from './replay-state-filter.mjs';

const ROOT = new URL('../', import.meta.url);

async function readJson(relativePath) {
    return JSON.parse(await readFile(new URL(relativePath, ROOT), 'utf8'));
}

async function readJsonl(relativePath) {
    const text = await readFile(new URL(relativePath, ROOT), 'utf8');
    return text.trim() ? text.trim().split(/\r?\n/u).map(line => JSON.parse(line)) : [];
}

function row(event) {
    return `| ${event.time.parserSeconds ?? ''} | ${event.time.demoTick ?? ''} | ${event.eventCategory} | ${event.eventType} | ${event.subject.playerKey ?? event.subject.entityKey ?? event.subject.subjectId ?? ''} | ${event.epistemicStatus.confidence} | ${event.epistemicStatus.validationStatus} | ${event.provenance.sourceTaskId} | ${event.epistemicStatus.semanticLimit.replaceAll('|', '/')} |`;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if ((args.replay ?? 'replay_009') !== 'replay_009') throw new Error('Only replay_009 is supported.');
    const output = args.output ?? 'reports/generated/replay-009-factual-report.md';
    const timelineEvents = await readJsonl('output/replay-009-canonical/factual-events.jsonl');
    const metadataEvents = (await readJson('output/replay-009-canonical/non-timeline-metadata.json')).eventsWithoutParserTimeline;
    const events = args['timeline-only'] ? timelineEvents : [...timelineEvents, ...metadataEvents];
    const summary = await readJson('output/replay-009-canonical/validation-summary.json');
    const filtered = events.filter(event => eventMatches(event, args));
    const markdown = `# Replay 009 Factual Report

## Filters

\`\`\`json
${JSON.stringify(args, null, 2)}
\`\`\`

Records matched: ${filtered.length}

Included record set: ${args['timeline-only'] ? 'timeline events only; non-timeline metadata excluded' : 'timeline events plus non-timeline metadata'}.

Known unavailable layers: spatial regions, lane classification, objective proximity, active-game time, mechanic activation, mechanic effects, macro interpretation.

Mechanic effects applied: ${summary.mechanicEffectsApplied}

## Events

| Parser seconds | Demo tick | Category | Type | Subject | Confidence | Validation | Source task | Semantic limitation |
| --- | ---: | --- | --- | --- | --- | --- | --- | --- |
${filtered.slice(0, 200).map(row).join('\n')}

## Provenance And Descriptions

${filtered.slice(0, 50).map(event => `- \`${event.eventId}\`: ${describeEvent(event)} Source: ${event.provenance.sourcePath}; validation: ${event.epistemicStatus.validationStatus}.`).join('\n')}
`;
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, markdown);
    console.log(JSON.stringify({ output, matched: filtered.length, mechanicEffectsApplied: summary.mechanicEffectsApplied }, null, 2));
}

await main();
