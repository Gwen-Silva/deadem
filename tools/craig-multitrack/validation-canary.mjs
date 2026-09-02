export function selectDeterministicCanary(regionsByTrack, sampleCount = 18) {
    const selected = [];
    const remaining = [];
    for (const [trackOrdinalText, regions] of Object.entries(regionsByTrack).sort(([left], [right]) => Number(left) - Number(right))) {
        const trackOrdinal = Number(trackOrdinalText);
        const sorted = [...regions].sort((left, right) => left.startSeconds - right.startSeconds);
        const indexes = sorted.length >= 2 ? [Math.floor((sorted.length - 1) / 3), Math.floor(2 * (sorted.length - 1) / 3)] : sorted.length ? [0] : [];
        const unique = [...new Set(indexes)];
        unique.forEach(index => selected.push({ trackOrdinal, ...sorted[index] }));
        sorted.forEach((region, index) => { if (!unique.includes(index)) remaining.push({ trackOrdinal, ...region }); });
    }
    remaining.sort((left, right) => left.startSeconds - right.startSeconds || left.trackOrdinal - right.trackOrdinal);
    while (selected.length < sampleCount && remaining.length) selected.push(remaining.shift());
    if (selected.length !== sampleCount) throw new Error('insufficient_activity_regions_for_canary');
    return selected.sort((left, right) => left.startSeconds - right.startSeconds || left.trackOrdinal - right.trackOrdinal)
        .map((row, index) => ({ ...row, sampleId: `craig_sample_${String(index + 1).padStart(2, '0')}` }));
}
