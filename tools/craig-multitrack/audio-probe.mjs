const round = value => Number(Number(value).toFixed(3));

export function summarizeTimeline(tracks) {
    const valid = tracks.filter(track => track.decodeSmoke === true);
    if (!valid.length) throw new Error('no_valid_audio_tracks');
    const starts = valid.map(track => track.firstTimestampSeconds);
    const ends = valid.map(track => track.lastTimestampSeconds);
    const durations = valid.map(track => track.durationSeconds);
    return {
        timelineSpreadStartSeconds: round(Math.max(...starts) - Math.min(...starts)),
        timelineSpreadEndSeconds: round(Math.max(...ends) - Math.min(...ends)),
        durationSpreadSeconds: round(Math.max(...durations) - Math.min(...durations)),
        durationRangeSeconds: { min: round(Math.min(...durations)), max: round(Math.max(...durations)) }
    };
}

export function overlapMetrics(regions) {
    let overlapPairCount = 0;
    let overlapDurationSeconds = 0;
    for (let left = 0; left < regions.length; left += 1) {
        for (let right = left + 1; right < regions.length; right += 1) {
            if (regions[left].trackOrdinal === regions[right].trackOrdinal) continue;
            const duration = Math.min(regions[left].endSeconds, regions[right].endSeconds)
                - Math.max(regions[left].startSeconds, regions[right].startSeconds);
            if (duration > 0) { overlapPairCount += 1; overlapDurationSeconds += duration; }
        }
    }
    return { overlapPairCount, overlapDurationSeconds: round(overlapDurationSeconds) };
}
