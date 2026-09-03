const TARGETS = Object.freeze(['review_match_003', 'review_match_004']);
function validateRequest(request) {
    if (!TARGETS.includes(request.reviewTargetId)) throw new Error('scrim_navigation_target_not_allowlisted');
    if (![request.vodTimeSeconds, request.preRollSeconds].every(Number.isFinite) || request.vodTimeSeconds < 0 || request.preRollSeconds < 0 || request.preRollSeconds > 120) throw new Error('invalid_scrim_navigation_time');
}
export function buildScrimContextUrl(context) {
    const request = { reviewTargetId:context.reviewTargetId, vodTimeSeconds:context.suggestedOpenVodSeconds, preRollSeconds:context.preRollSeconds };
    validateRequest(request);
    if (context.status !== 'available' || ![context.vodStartSeconds, context.vodEndSeconds, context.replayVodMappingErrorSeconds, context.craigVodMappingErrorSeconds, context.composedOperationalErrorSeconds].every(Number.isFinite)
        || context.vodStartSeconds > context.vodEndSeconds || context.vodStartSeconds > request.vodTimeSeconds || context.vodEndSeconds < request.vodTimeSeconds
        || Math.abs(context.composedOperationalErrorSeconds - context.replayVodMappingErrorSeconds - context.craigVodMappingErrorSeconds) > 0.000001) throw new Error('invalid_scrim_context');
    return `/scrim?${new URLSearchParams(Object.entries(request).map(([k,v]) => [k,String(v)]))}`;
}
export function parseScrimNavigation(search) {
    const query = new URLSearchParams(search);
    if (![...query].length) return null;
    const keys = ['reviewTargetId','vodTimeSeconds','preRollSeconds'];
    if ([...query.keys()].some(k => !keys.includes(k)) || keys.some(k => query.getAll(k).length !== 1 || query.get(k).trim() === '')) throw new Error('invalid_scrim_navigation_query');
    const request = { reviewTargetId:query.get('reviewTargetId'), vodTimeSeconds:Number(query.get('vodTimeSeconds')), preRollSeconds:Number(query.get('preRollSeconds')) };
    validateRequest(request); return request;
}
export function resolveScrimNavigation(request, sessions) {
    validateRequest(request);
    const matches = sessions.filter(s => s.reviewTargetId === request.reviewTargetId && s.syncStatus !== 'synthetic_only');
    if (matches.length !== 1) throw new Error('scrim_navigation_session_unavailable');
    const session = matches[0];
    if (request.vodTimeSeconds < session.vodRange.start || request.vodTimeSeconds > session.vodRange.end) throw new Error('scrim_navigation_outside_session');
    return { session, seekVodSeconds:Math.max(session.vodRange.start, request.vodTimeSeconds-request.preRollSeconds) };
}
