const CANDIDATE_PATTERN = /^(review_match_00[1-4])_window_(\d{4})$/u;

export const REVIEW_SECTIONS = Object.freeze([
    Object.freeze({
        id: 'context', kicker: 'ETAPA 1', title: 'Contexto',
        fields: Object.freeze([
            Object.freeze({ key: 'facts', label: 'O que sabemos', placeholder: 'Informações que estavam disponíveis naquele momento.' }),
            Object.freeze({ key: 'unknownInformation', label: 'O que ainda não sabemos', placeholder: 'Informações importantes que não estavam confirmadas.' }),
            Object.freeze({ key: 'teamCall', label: 'O que foi comunicado', placeholder: 'Calls relevantes feitas pelo time.' })
        ])
    }),
    Object.freeze({
        id: 'decision', kicker: 'ETAPA 2', title: 'Decisão',
        fields: Object.freeze([
            Object.freeze({ key: 'playerIntent', label: 'Qual era a intenção?', placeholder: 'O que você ou o time estava tentando alcançar?' }),
            Object.freeze({ key: 'observedAction', label: 'O que aconteceu?', placeholder: 'Descreva somente o que foi observado.' }),
            Object.freeze({ key: 'alternatives', label: 'Que alternativas existiam?', placeholder: 'Quais outras ações eram plausíveis naquele estado?' })
        ])
    }),
    Object.freeze({
        id: 'consequences', kicker: 'ETAPA 3', title: 'Consequências',
        fields: Object.freeze([
            Object.freeze({ key: 'immediateResult', label: 'Resultado imediato', placeholder: 'O que aconteceu logo após este trecho?' }),
            Object.freeze({ key: 'longTermResult', label: 'Consequência de longo prazo', placeholder: 'Deixe vazio quando não houver evidência suficiente.' })
        ])
    }),
    Object.freeze({
        id: 'evaluation', kicker: 'ETAPA 4', title: 'Avaliação',
        note: 'Uma boa decisão pode terminar mal. Avalie o que fazia sentido com a informação disponível naquele momento.',
        fields: Object.freeze([
            Object.freeze({ key: 'decisionQuality', label: 'Qualidade da decisão', placeholder: 'A decisão fazia sentido com a informação disponível?' }),
            Object.freeze({ key: 'executionQuality', label: 'Qualidade da execução', placeholder: 'A ideia era boa, mas a execução falhou?' })
        ])
    }),
    Object.freeze({
        id: 'learning', kicker: 'ETAPA 5', title: 'Aprendizado',
        fields: Object.freeze([
            Object.freeze({ key: 'reviewNotes', label: 'Aprendizado / notas', placeholder: 'O que você quer reconhecer ou fazer diferente na próxima vez?' })
        ])
    })
]);

export const ERROR_CLASS_GROUPS = Object.freeze([
    Object.freeze({
        id: 'problem', title: 'Tipo de problema', values: Object.freeze([
            Object.freeze(['mechanical_error', 'Erro mecânico']),
            Object.freeze(['information_error', 'Informação']),
            Object.freeze(['positioning_error', 'Posicionamento']),
            Object.freeze(['timing_error', 'Timing']),
            Object.freeze(['priority_error', 'Prioridade']),
            Object.freeze(['map_read_error', 'Leitura de mapa']),
            Object.freeze(['risk_evaluation_error', 'Avaliação de risco']),
            Object.freeze(['execution_error', 'Execução']),
            Object.freeze(['planning_error', 'Planejamento']),
            Object.freeze(['team_coordination_failure', 'Coordenação']),
            Object.freeze(['composition_identity_failure', 'Identidade da composição'])
        ])
    }),
    Object.freeze({
        id: 'evaluation', title: 'Decisão × resultado', values: Object.freeze([
            Object.freeze(['correct_decision_bad_result', 'Decisão correta, resultado ruim']),
            Object.freeze(['bad_decision_favorable_result', 'Decisão ruim, resultado favorável']),
            Object.freeze(['not_an_error', 'Não foi um erro']),
            Object.freeze(['uncertain', 'Incerto'])
        ])
    })
]);

export function momentIdentity(candidateId) {
    const match = CANDIDATE_PATTERN.exec(String(candidateId ?? ''));
    if (!match) throw new Error('invalid_candidate_id');
    return {
        targetId: match[1],
        matchId: match[1].slice(-3),
        momentNumber: Number(match[2]),
        label: `Momento ${Number(match[2])}`
    };
}

export function formatReviewTimestamp(value) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error('invalid_review_timestamp');
    const rounded = Math.round(seconds * 10) / 10;
    const minutes = Math.floor(rounded / 60);
    const remainder = rounded - minutes * 60;
    const whole = Math.floor(remainder);
    const decimal = Math.round((remainder - whole) * 10);
    return `${String(minutes).padStart(2, '0')}:${String(whole).padStart(2, '0')}${decimal ? `.${decimal}` : ''}`;
}

export function parseReviewTimestamp(value) {
    const text = String(value ?? '').trim();
    if (/^\d+(?:\.\d+)?$/u.test(text)) {
        const seconds = Number(text);
        if (Number.isFinite(seconds) && seconds >= 0) return seconds;
    }
    const match = /^(\d+):([0-5]\d)(?:\.(\d))?$/u.exec(text);
    if (!match) throw new Error('invalid_review_timestamp');
    return Number(match[1]) * 60 + Number(match[2]) + Number(`0.${match[3] ?? 0}`);
}

export function friendlyReviewUrl(candidateId) {
    const identity = momentIdentity(candidateId);
    return `/review?match=${identity.matchId}&moment=${identity.momentNumber}`;
}

export function queuePresentation(queueItem, productMoment = null) {
    const identity = momentIdentity(queueItem.candidateWindowId);
    return {
        ...identity,
        candidateId: queueItem.candidateWindowId,
        time: productMoment?.vodTime ?? null,
        thumbnail: productMoment?.thumbnail ?? { status: 'unavailable', url: null, alt: `Preview visual indisponível do ${identity.label}` },
        reviewState: queueItem.reviewState,
        reviewLabel: productMoment?.reviewLabel ?? 'Não revisado'
    };
}

export function selectEvidenceFrames(frames = []) {
    const available = frames.filter(frame => frame.status === 'available');
    const main = available.find(frame => frame.role === 'representative') ?? available[0] ?? null;
    const order = { first: 0, representative: 1, last: 2 };
    return {
        main,
        thumbnails: [...frames].sort((left, right) => (order[left.role] ?? 9) - (order[right.role] ?? 9))
    };
}

export function communicationPresentation(candidate) {
    if (candidate.scrimContextEvidence?.status === 'available') return { mode: 'multitrack', synchronizedReplay: true };
    if (candidate.audioCallEvidence) return { mode: 'legacy', synchronizedReplay: false };
    return { mode: 'unavailable', synchronizedReplay: false };
}
