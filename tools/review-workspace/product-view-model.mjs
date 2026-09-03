import { TARGET_IDS, assertCandidateId } from './data-model.mjs';

const PUBLIC_MATCH_PATTERN = /^00[1-4]$/u;
const PUBLIC_STATE_LABELS = Object.freeze({
    not_started: 'Não iniciada',
    in_progress: 'Em revisão',
    completed: 'Concluída'
});

export function assertPublicMatchId(value) {
    const id = String(value ?? '');
    if (!PUBLIC_MATCH_PATTERN.test(id)) throw new Error('public_match_not_allowlisted');
    return id;
}

export function targetIdFromPublicMatchId(value) {
    return `review_match_${assertPublicMatchId(value)}`;
}

export function publicMatchIdFromTargetId(targetId) {
    if (!TARGET_IDS.includes(targetId)) throw new Error('target_not_allowlisted');
    return targetId.slice(-3);
}

export function displayNameForTarget(targetId) {
    return `Scrim ${publicMatchIdFromTargetId(targetId).slice(-2)}`;
}

export function candidateIdForMoment(matchId, moment) {
    const targetId = targetIdFromPublicMatchId(matchId);
    const number = Number(moment);
    if (!Number.isInteger(number) || number < 1 || number > 9999) throw new Error('invalid_public_moment');
    return assertCandidateId(`${targetId}_window_${String(number).padStart(4, '0')}`, targetId);
}

export function reviewLink(matchId, moment = null) {
    const id = assertPublicMatchId(matchId);
    const params = new URLSearchParams({ match: id });
    if (moment !== null) {
        candidateIdForMoment(id, moment);
        params.set('moment', String(Number(moment)));
    }
    return `/review?${params}`;
}

export function deriveReviewProgress(candidates, state = {}) {
    const counts = { unreviewed: 0, in_review: 0, reviewed: 0, skipped: 0 };
    for (const candidate of candidates) {
        const value = state.candidates?.[candidate.candidateWindowId]?.reviewRecord?.reviewState ?? 'unreviewed';
        if (!(value in counts)) throw new Error('invalid_review_state');
        counts[value] += 1;
    }
    const total = candidates.length;
    const processed = counts.reviewed + counts.skipped;
    const touched = total - counts.unreviewed;
    const stateName = total > 0 && processed === total
        ? 'completed'
        : touched > 0 ? 'in_progress' : 'not_started';
    return {
        state: stateName,
        label: PUBLIC_STATE_LABELS[stateName],
        processed,
        reviewed: counts.reviewed,
        skipped: counts.skipped,
        inReview: counts.in_review,
        pending: counts.unreviewed,
        remaining: total - processed,
        total,
        percent: total === 0 ? 0 : Number(((processed / total) * 100).toFixed(2))
    };
}

function safeMedia(item, displayName) {
    if (!item || item.status !== 'available' || !/^\/media\/[0-9a-f]{32}$/u.test(item.url ?? '')) {
        return { status: 'unavailable', url: null, alt: `Preview visual indisponível da ${displayName}` };
    }
    return { status: 'available', url: item.url, alt: `Preview visual da ${displayName}` };
}

export function selectCandidateCover(candidates, displayName) {
    const chronological = candidates.toSorted((left, right) => left.chronologicalRank - right.chronologicalRank);
    for (const candidate of chronological) {
        const representative = candidate.videoEvidence?.frames?.find(frame => frame.role === 'representative');
        const cover = safeMedia(representative, displayName);
        if (cover.status === 'available') return cover;
    }
    for (const candidate of chronological) {
        for (const frame of candidate.videoEvidence?.frames ?? []) {
            const cover = safeMedia(frame, displayName);
            if (cover.status === 'available') return cover;
        }
    }
    return safeMedia(null, displayName);
}

function formatVodTime(value) {
    const seconds = Math.max(0, Math.round(Number(value) || 0));
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function publicMoment(candidate, state, displayName, matchId) {
    const momentNumber = Number(candidate.candidateWindowId.slice(-4));
    const reviewState = state.candidates?.[candidate.candidateWindowId]?.reviewRecord?.reviewState ?? 'unreviewed';
    const representative = candidate.videoEvidence?.frames?.find(frame => frame.role === 'representative');
    const vodTimeSeconds = representative?.requestedVodSeconds ?? candidate.videoEvidence?.visualVodRangeSeconds?.start ?? 0;
    return {
        momentNumber,
        displayName: `Momento ${momentNumber}`,
        vodTime: formatVodTime(vodTimeSeconds),
        reviewState,
        reviewLabel: { unreviewed: 'Não revisado', in_review: 'Em revisão', reviewed: 'Revisado', skipped: 'Ignorado' }[reviewState],
        thumbnail: safeMedia(representative, displayName),
        reviewUrl: reviewLink(matchId, momentNumber),
        replayUrl: candidate.scrimContextEvidence?.status === 'available' ? candidate.scrimContextEvidence.url : null
    };
}

export function buildProductMatch({ workspaceData, reviewState, scrimSessions, matchId }) {
    const id = assertPublicMatchId(matchId);
    const targetId = targetIdFromPublicMatchId(id);
    const candidates = workspaceData.candidatesByTarget.get(targetId);
    if (!candidates) throw new Error('product_match_unavailable');
    const summary = workspaceData.targets.find(target => target.reviewTargetId === targetId);
    const displayName = displayNameForTarget(targetId);
    const realSession = scrimSessions.find(session => session.reviewTargetId === targetId && session.syncStatus === 'validated');
    const moments = candidates.toSorted((left, right) => left.chronologicalRank - right.chronologicalRank)
        .map(candidate => publicMoment(candidate, reviewState, displayName, id));
    const firstReplayMoment = moments.find(moment => moment.replayUrl);
    return {
        id,
        internalReviewTargetId: targetId,
        displayName,
        review: deriveReviewProgress(candidates, reviewState),
        materials: {
            gameplay: summary.visualAvailability !== 'unavailable' ? 'available' : 'unavailable',
            matchData: candidates.some(candidate => candidate.replayObservedFacts) ? 'available' : 'unavailable',
            communication: summary.audioAvailability === 'available' || summary.scrimContextAvailability === 'available' ? 'available' : 'unavailable',
            synchronizedReplay: realSession ? 'available' : 'unavailable'
        },
        cover: selectCandidateCover(candidates, displayName),
        reviewUrl: reviewLink(id),
        replayUrl: realSession && firstReplayMoment ? firstReplayMoment.replayUrl : null,
        moments
    };
}

export function buildProductCatalog({ workspaceData, reviewStates, scrimSessions }) {
    const matches = TARGET_IDS.map(targetId => {
        const id = publicMatchIdFromTargetId(targetId);
        return buildProductMatch({ workspaceData, reviewState: reviewStates[targetId] ?? {}, scrimSessions, matchId: id });
    });
    return {
        matches,
        continueMatchId: matches.find(match => match.review.state === 'in_progress')?.id ?? null
    };
}
