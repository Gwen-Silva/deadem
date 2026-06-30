export function parseArgs(argv) {
    const args = {};
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (!arg.startsWith('--')) continue;
        const key = arg.slice(2);
        if (['independently-validated', 'candidate-only', 'include-warnings', 'warnings-present'].includes(key)) {
            args[key] = true;
        } else {
            args[key] = argv[index + 1];
            index += 1;
        }
    }
    return args;
}

export function eventMatches(event, args = {}) {
    if (args.replay && event.replayId !== args.replay) return false;
    if (args['at-seconds'] !== undefined) {
        const target = Number(args['at-seconds']);
        if (!Number.isFinite(target)) return false;
        if (event.time.parserSeconds === null || Math.abs(event.time.parserSeconds - target) > 0.001) return false;
    }
    if (args['start-seconds'] !== undefined) {
        const target = Number(args['start-seconds']);
        if (event.time.parserSeconds === null || event.time.parserSeconds < target) return false;
    }
    if (args['end-seconds'] !== undefined) {
        const target = Number(args['end-seconds']);
        if (event.time.parserSeconds === null || event.time.parserSeconds > target) return false;
    }
    if (args.player && event.subject.playerKey !== args.player) return false;
    if (args.team && String(event.subject.team) !== String(args.team)) return false;
    if (args.mechanic && event.subject.mechanicId !== args.mechanic) return false;
    if (args['entity-class'] && event.subject.className !== args['entity-class']) return false;
    if (args.confidence && event.epistemicStatus.confidence !== args.confidence) return false;
    if (args['event-type'] && event.eventType !== args['event-type'] && event.eventCategory !== args['event-type']) return false;
    if (args['event-category'] && event.eventCategory !== args['event-category']) return false;
    if (args['validation-status'] && event.epistemicStatus.validationStatus !== args['validation-status']) return false;
    if (args['independently-validated'] && !event.independentValidation.available) return false;
    if (args['candidate-only'] && event.epistemicStatus.observationStatus !== 'candidate') return false;
    if (args['warnings-present'] && event.epistemicStatus.warnings.length === 0) return false;
    if (args['visually-supported']) {
        if (!['visually_confirmed', 'visually_supported'].includes(event.epistemicStatus.validationStatus)) return false;
    }
    return true;
}

export function categoryKeyForEvent(event) {
    if (event.subject.mechanicId === 'mid_boss') return 'mid_boss';
    if (event.subject.mechanicId === 'walker') return 'walker';
    if (event.subject.mechanicId === 'guardian') return 'guardian';
    if (event.subject.mechanicId === 'spirit_urn') return 'spirit_urn_candidates';
    if (event.subject.className === 'CNPC_BarrackBoss') return 'barrack_boss';
    if (event.subject.className === 'CNPC_Boss_Tier3') return 'boss_tier3';
    if (event.subject.className === 'CNPC_TrooperBoss') return 'trooper_boss';
    return null;
}

export function describeEvent(event) {
    const seconds = event.time.parserSeconds === null ? 'no parser time' : `${event.time.parserSeconds}s`;
    const subject = event.subject.playerKey
        ? `Player ${event.subject.playerKey}`
        : event.subject.entityKey
            ? `${event.subject.className ?? 'Entity'} ${event.subject.entityKey}`
            : event.subject.subjectId ?? 'Record';
    if (event.eventCategory === 'player_dead') return `${subject} was observed transitioning to dead at parser time ${seconds}.`;
    if (event.eventCategory === 'player_respawned') return `${subject} was observed returning to active state at parser time ${seconds}.`;
    if (event.eventCategory === 'entity_deleted' || event.eventCategory === 'candidate_entity_deleted') {
        return `${subject} was deleted from the parser entity registry at parser time ${seconds}. This deletion was not interpreted as destruction or objective completion.`;
    }
    if (event.independentValidation.available) {
        return `${subject} event ${event.eventType} received ${event.epistemicStatus.validationStatus} evidence within a synchronization window of +/-${event.independentValidation.timingWindowSeconds?.before}s.`;
    }
    if (event.epistemicStatus.observationStatus === 'candidate') return `${subject} remains candidate-only; identity or mechanic meaning is unresolved.`;
    return `${subject} produced factual event ${event.eventType} at parser time ${seconds}.`;
}
