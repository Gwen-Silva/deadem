#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);

function parseArgs(argv) {
    const args = {};
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (!arg.startsWith('--')) continue;
        const key = arg.slice(2);
        if (['independently-validated', 'candidate-only', 'include-warnings'].includes(key)) {
            args[key] = true;
        } else {
            args[key] = argv[index + 1];
            index += 1;
        }
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

function matches(event, args) {
    if (args.replay && event.replayId !== args.replay) return false;
    if (args['at-seconds'] !== undefined) {
        const target = Number(args['at-seconds']);
        if (!Number.isFinite(target)) return false;
        if (event.time.parserSeconds === null || Math.abs(event.time.parserSeconds - target) > 0.001) return false;
    }
    if (args.player && event.subject.playerKey !== args.player) return false;
    if (args.mechanic && event.subject.mechanicId !== args.mechanic) return false;
    if (args['event-type'] && event.eventType !== args['event-type'] && event.eventCategory !== args['event-type']) return false;
    if (args['validation-status'] && event.epistemicStatus.validationStatus !== args['validation-status']) return false;
    if (args['independently-validated'] && !event.independentValidation.available) return false;
    if (args['candidate-only'] && event.epistemicStatus.observationStatus !== 'candidate') return false;
    return true;
}

function summarizeEvent(event, categoriesByName, includeWarnings) {
    const categoryKey = event.subject.mechanicId === 'mid_boss' ? 'mid_boss'
        : event.subject.mechanicId === 'walker' ? 'walker'
            : event.subject.mechanicId === 'guardian' ? 'guardian'
                : event.subject.mechanicId === 'spirit_urn' ? 'spirit_urn_candidates'
                    : event.subject.className === 'CNPC_BarrackBoss' ? 'barrack_boss'
                        : event.subject.className === 'CNPC_Boss_Tier3' ? 'boss_tier3'
                            : event.subject.className === 'CNPC_TrooperBoss' ? 'trooper_boss'
                                : null;
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

    const events = [
        ...await readJsonl('output/replay-009-canonical/factual-events.jsonl'),
        ...(await readJson('output/replay-009-canonical/non-timeline-metadata.json')).eventsWithoutParserTimeline
    ];
    const categorySummary = await readJson('output/replay-009-validation/category-validation-summary.json');
    const validationSummary = await readJson('output/replay-009-canonical/validation-summary.json');
    const categoriesByName = new Map(categorySummary.categories.map(category => [category.category, category]));
    const results = events.filter(event => matches(event, args)).slice(0, 50)
        .map(event => summarizeEvent(event, categoriesByName, args['include-warnings']));

    console.log(JSON.stringify({
        replay,
        query: args,
        resultCount: results.length,
        totalMatchedBeforeLimit: events.filter(event => matches(event, args)).length,
        gate: validationSummary.gate,
        mechanicEffectsApplied: validationSummary.mechanicEffectsApplied,
        spatialStatus: validationSummary.spatialStatus,
        results
    }, null, 2));
}

await main();
