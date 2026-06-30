#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { categoryKeyForEvent, describeEvent, eventMatches, parseArgs } from './replay-state-filter.mjs';

const ROOT = new URL('../', import.meta.url);

async function readJson(relativePath) {
    return JSON.parse(await readFile(new URL(relativePath, ROOT), 'utf8'));
}

async function readJsonl(relativePath) {
    const text = await readFile(new URL(relativePath, ROOT), 'utf8');
    return text.trim() ? text.trim().split(/\r?\n/u).map(line => JSON.parse(line)) : [];
}

function summarizeEvent(event, categoriesByName, includeWarnings) {
    const categoryKey = categoryKeyForEvent(event);
    return {
        eventId: event.eventId,
        eventCategory: event.eventCategory,
        eventType: event.eventType,
        subject: event.subject,
        time: event.time,
        value: event.value,
        provenance: event.provenance,
        observationConfidence: event.epistemicStatus.confidence,
        validationStatus: event.epistemicStatus.validationStatus,
        categoryValidationStatus: categoryKey ? categoriesByName.get(categoryKey)?.overallStatus ?? null : null,
        semanticLimit: event.epistemicStatus.semanticLimit,
        description: describeEvent(event),
        videoSynchronizationUncertainty: event.independentValidation.timingWindowSeconds,
        spatialStatus: event.spatial.status,
        mechanicVersionStatus: event.epistemicStatus.mechanicVersionStatus,
        mechanicEffectApplied: event.epistemicStatus.mechanicEffectApplied,
        warnings: includeWarnings ? event.epistemicStatus.warnings : event.epistemicStatus.warnings
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const replay = args.replay ?? 'replay_009';
    if (replay !== 'replay_009') {
        console.error(JSON.stringify({ error: 'only replay_009 is available in canonical state outputs' }, null, 2));
        process.exit(2);
    }

    const timelineEvents = await readJsonl('output/replay-009-canonical/factual-events.jsonl');
    const metadataEvents = (await readJson('output/replay-009-canonical/non-timeline-metadata.json')).eventsWithoutParserTimeline;
    const events = args['timeline-only'] ? timelineEvents : [...timelineEvents, ...metadataEvents];
    const categorySummary = await readJson('output/replay-009-validation/category-validation-summary.json');
    const validationSummary = await readJson('output/replay-009-canonical/validation-summary.json');
    const categoriesByName = new Map(categorySummary.categories.map(category => [category.category, category]));
    const results = events.filter(event => eventMatches(event, args)).slice(0, 50)
        .map(event => summarizeEvent(event, categoriesByName, args['include-warnings']));

    console.log(JSON.stringify({
        replay,
        query: args,
        resultCount: results.length,
        totalMatchedBeforeLimit: events.filter(event => eventMatches(event, args)).length,
        gate: validationSummary.gate,
        mechanicEffectsApplied: validationSummary.mechanicEffectsApplied,
        spatialStatus: validationSummary.spatialStatus,
        results
    }, null, 2));
}

await main();
