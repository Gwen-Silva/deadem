const MATCH_PATTERN = /^00[1-4]$/u;

export function parseFriendlyReviewNavigation(search) {
  const params = new URLSearchParams(search);
  const match = params.get('match');
  const moment = params.get('moment');
  if (!match) return null;
  if (!MATCH_PATTERN.test(match)) return null;
  const result = { matchId: match, targetId: `review_match_${match}`, candidateId: null };
  if (moment !== null) {
    const number = Number(moment);
    if (!/^\d{1,4}$/u.test(moment) || !Number.isInteger(number) || number < 1) return null;
    result.candidateId = `${result.targetId}_window_${String(number).padStart(4, '0')}`;
  }
  return result;
}
