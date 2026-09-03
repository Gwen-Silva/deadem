const PUBLIC_MATCHES = Object.freeze(['003', '004']);
const REVIEW_LABELS = Object.freeze({
    unreviewed: 'Não revisado',
    in_review: 'Em revisão',
    reviewed: 'Revisado',
    skipped: 'Ignorado'
});

export const PUBLIC_REPLAY_MATCHES = PUBLIC_MATCHES;

export function assertPublicReplayMatchId(value) {
    const matchId = String(value ?? '');
    if (!PUBLIC_MATCHES.includes(matchId)) throw new Error('public_replay_match_not_allowlisted');
    return matchId;
}

export function targetIdForReplayMatch(value) {
    return `review_match_${assertPublicReplayMatchId(value)}`;
}

export function publicReplayUrl(matchId, moment = null) {
    const id = assertPublicReplayMatchId(matchId);
    const params = new URLSearchParams({ match: id });
    if (moment !== null) {
        const number = Number(moment);
        if (!Number.isInteger(number) || number < 1) throw new Error('invalid_public_replay_moment');
        params.set('moment', String(number));
    }
    return `/scrim?${params}`;
}

export function parseFriendlyScrimNavigation(search = '') {
    const params = new URLSearchParams(String(search).replace(/^\?/u, ''));
    if (!params.has('match')) return null;
    const allowed = new Set(['match', 'moment']);
    if ([...params.keys()].some(key => !allowed.has(key))) throw new Error('invalid_public_replay_query');
    if (params.getAll('match').length !== 1 || params.getAll('moment').length > 1) throw new Error('invalid_public_replay_query');
    const matchId = assertPublicReplayMatchId(params.get('match'));
    const momentText = params.get('moment');
    if (momentText === null) return { kind: 'friendly', matchId, momentNumber: null };
    if (!/^[1-9][0-9]*$/u.test(momentText)) throw new Error('invalid_public_replay_moment');
    return { kind: 'friendly', matchId, momentNumber: Number(momentText) };
}

function publicReviewState(reviewState, candidateId) {
    const state = reviewState?.candidates?.[candidateId]?.reviewRecord?.reviewState ?? 'unreviewed';
    if (!(state in REVIEW_LABELS)) throw new Error('invalid_review_state');
    return { state, label: REVIEW_LABELS[state] };
}

function momentNumber(candidate) {
    const match = /_window_([0-9]{4})$/u.exec(candidate.candidateWindowId ?? '');
    if (!match) throw new Error('invalid_candidate_window_for_replay');
    return Number(match[1]);
}

function finite(value) {
    return Number.isFinite(Number(value));
}

export function buildScrimPresentation({ workspaceData, reviewState, sessions, matchId }) {
    const id = assertPublicReplayMatchId(matchId);
    const reviewTargetId = targetIdForReplayMatch(id);
    const candidates = workspaceData.candidatesByTarget.get(reviewTargetId);
    if (!candidates) throw new Error('public_replay_candidates_unavailable');
    const realSessions = sessions.filter(session => session.reviewTargetId === reviewTargetId && session.syncStatus === 'validated');
    if (realSessions.length !== 1) throw new Error('public_replay_session_unavailable_or_ambiguous');
    const session = realSessions[0];
    if (!finite(session.vodRange?.start) || !finite(session.vodRange?.end) || session.vodRange.end <= session.vodRange.start) {
        throw new Error('public_replay_session_range_invalid');
    }

    const markerGaps = [];
    const markers = [];
    for (const candidate of candidates) {
        const context = candidate.scrimContextEvidence;
        const number = momentNumber(candidate);
        const anchor = Number(context?.suggestedOpenVodSeconds);
        const start = Number(context?.vodStartSeconds);
        const end = Number(context?.vodEndSeconds);
        const preRollSeconds = Number(context?.preRollSeconds);
        const valid = context?.status === 'available'
            && context.reviewTargetId === reviewTargetId
            && finite(anchor) && finite(start) && finite(end) && finite(preRollSeconds)
            && start <= anchor && anchor <= end
            && start >= session.vodRange.start && end <= session.vodRange.end
            && anchor >= session.vodRange.start && anchor <= session.vodRange.end;
        if (!valid) {
            markerGaps.push({ momentNumber: number, reason: 'validated_context_unavailable' });
            continue;
        }
        const review = publicReviewState(reviewState, candidate.candidateWindowId);
        markers.push({
            momentNumber: number,
            label: `Momento ${number}`,
            vodAnchorSeconds: anchor,
            vodContextStartSeconds: start,
            vodContextEndSeconds: end,
            preRollSeconds,
            reviewState: review.state,
            reviewLabel: review.label,
            reviewUrl: `/review?match=${id}&moment=${number}`,
            replayUrl: publicReplayUrl(id, number)
        });
    }
    markers.sort((left, right) => left.vodAnchorSeconds - right.vodAnchorSeconds || left.momentNumber - right.momentNumber);

    return {
        schemaVersion: 1,
        match: {
            id,
            displayName: `Scrim ${id.slice(-2)}`,
            replayUrl: publicReplayUrl(id),
            overviewUrl: `/matches/${id}`,
            reviewUrl: `/review?match=${id}`
        },
        session: {
            status: 'available',
            syncStatus: session.precisionStatus === 'preferred_precision' ? 'verified' : 'available_with_limited_precision',
            syncLabel: session.precisionStatus === 'preferred_precision'
                ? 'Sincronização verificada'
                : 'Sincronização disponível com precisão limitada',
            vodRange: { start: Number(session.vodRange.start), end: Number(session.vodRange.end) },
            trackCount: 9
        },
        expectedMarkerCount: candidates.length,
        markerCount: markers.length,
        markerCoverage: candidates.length === 0 ? 0 : Number((markers.length / candidates.length).toFixed(4)),
        markers,
        markerGaps,
        semantics: 'chronological_factual_review_context_not_gameplay_event_or_ranking'
    };
}

export function resolveFriendlyReplayEntry(navigation, presentation) {
    if (!navigation || navigation.kind !== 'friendly') throw new Error('friendly_replay_navigation_required');
    if (navigation.matchId !== presentation.match.id) throw new Error('friendly_replay_target_mismatch');
    if (navigation.momentNumber === null) {
        return { marker: null, seekVodSeconds: presentation.session.vodRange.start, entryUsesPreRoll: false };
    }
    const marker = presentation.markers.find(item => item.momentNumber === navigation.momentNumber);
    if (!marker) throw new Error('public_replay_moment_unavailable');
    return {
        marker,
        seekVodSeconds: Math.max(presentation.session.vodRange.start, marker.vodAnchorSeconds - marker.preRollSeconds),
        entryUsesPreRoll: true
    };
}
