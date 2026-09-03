"""Task 210 bounded local audio measurement. Never opens replay directories.

Only the two explicit video directories and nine normalized WAVs are inputs.
Decoded signals, correlation diagnostics and frames remain in ignored storage.
No ASR, labels, remembered transcripts or game clocks enter audio correlation.
"""
import argparse
import json
import time
import wave
from pathlib import Path

import av
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
LOCAL = ROOT / '.local/deadem/review-workspace/scrim/real-sync-task210'
CRAIG = ROOT / '.local/deadem/craig/recordings/craig_recording_task208_real_01/normalized'
RATE = 8000
ENVELOPE_HZ = 50
TARGETS = ('review_match_003', 'review_match_004')


def write_json(name, value):
    LOCAL.mkdir(parents=True, exist_ok=True)
    (LOCAL / name).write_text(json.dumps(value, indent=2, allow_nan=False) + '\n', encoding='utf8')


def video_path(target):
    if target not in TARGETS:
        raise ValueError('target_not_authorized')
    directory = ROOT / '.local/deadem/review-targets' / target / 'video'
    # Deliberately non-recursive; never inspect the sibling replay directory.
    videos = list(directory.glob('*.mp4'))
    if len(videos) != 1 or videos[0].resolve().parent != directory.resolve():
        raise ValueError('ambiguous_or_unsafe_video')
    return videos[0]


def envelope(signal, rate=RATE):
    block = rate // ENVELOPE_HZ
    result = np.empty(len(signal) // block, dtype=np.float32)
    for start in range(0, len(result), 50000):
        end = min(start + 50000, len(result))
        chunk = np.asarray(signal[start * block:end * block], dtype=np.float32)
        result[start:end] = np.sqrt(np.mean(chunk.reshape(-1, block) ** 2, axis=1))
    return result


def extract():
    LOCAL.mkdir(parents=True, exist_ok=True)
    metadata = {'sampleRate': RATE, 'envelopeHz': ENVELOPE_HZ, 'videos': [], 'tracks': []}
    for target in TARGETS:
        source = video_path(target)
        with av.open(str(source)) as container:
            duration = container.duration / av.time_base
            streams = list(container.streams.audio)
            meta = {'reviewTargetId': target, 'durationSeconds': duration, 'audioStreams': [],
                    'sourceFile': str(source), 'sourceSizeBytes': source.stat().st_size}
            pending = []
            for stream in streams:
                name = f'{target}-audio-{stream.index}'
                dest = LOCAL / f'{name}.npy'
                meta['audioStreams'].append({'index': stream.index, 'signalRef': name})
                if dest.exists() and (LOCAL / f'{name}-envelope.npy').exists():
                    continue
                samples = np.lib.format.open_memmap(dest, mode='w+', dtype='float32', shape=(int(np.ceil(duration * RATE)) + RATE,))
                samples[:] = 0
                pending.append((stream, samples, av.AudioResampler(format='flt', layout='mono', rate=RATE), name))
            by_index = {stream.index: (samples, resampler, name) for stream, samples, resampler, name in pending}
            if pending:
                for packet in container.demux([item[0] for item in pending]):
                    samples, resampler, name = by_index[packet.stream.index]
                    for frame in packet.decode():
                        for mono in resampler.resample(frame):
                            if mono.pts is None:
                                raise ValueError('audio_pts_required')
                            start = round(float(mono.pts * mono.time_base) * RATE)
                            values = mono.to_ndarray().reshape(-1)
                            end = min(start + len(values), len(samples))
                            if end > max(0, start):
                                samples[max(0, start):end] = values[max(0, -start):end-start]
                for stream, samples, resampler, name in pending:
                    for mono in resampler.resample(None):
                        start = round(float(mono.pts * mono.time_base) * RATE)
                        values = mono.to_ndarray().reshape(-1)
                        samples[start:min(start + len(values), len(samples))] = values[:max(0, min(len(values), len(samples)-start))]
                    samples.flush()
                    np.save(LOCAL / f'{name}-envelope.npy', envelope(samples))
            metadata['videos'].append(meta)
            print(json.dumps({'extracted': target, 'duration': duration, 'streams': len(streams)}), flush=True)
    for number in range(1, 10):
        ref = f'track_{number:02d}'
        source = CRAIG / f'{ref}.wav'
        dest = LOCAL / f'{ref}-envelope.npy'
        with wave.open(str(source), 'rb') as audio:
            if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate()) != (1, 2, 16000):
                raise ValueError('unexpected_normalized_wave_format')
            metadata['tracks'].append({'trackRef': ref, 'durationSeconds': audio.getnframes() / 16000})
            if not dest.exists():
                pieces = []
                while True:
                    raw = audio.readframes(16000 * 100)
                    if not raw:
                        break
                    pieces.append(envelope(np.frombuffer(raw, dtype='<i2').astype(np.float32) / 32768, 16000))
                np.save(dest, np.concatenate(pieces))
    write_json('input-metadata.json', metadata)


def ncc(search, template):
    """Zero-mean normalized correlation, every valid alignment; NumPy FFT only."""
    x = np.asarray(search, dtype=np.float64)
    y = np.asarray(template, dtype=np.float64)
    if len(x) < len(y) or len(y) < 2:
        return np.array([])
    y = y - np.mean(y)
    power = np.sum(y*y)
    if power < 1e-14:
        return np.zeros(len(x)-len(y)+1)
    size = 1 << (len(x) + len(y) - 2).bit_length()
    convolution = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(y[::-1], size), size)
    numerator = convolution[len(y)-1:len(x)]
    sums = np.r_[0., np.cumsum(x)]
    squares = np.r_[0., np.cumsum(x*x)]
    local_sum = sums[len(y):] - sums[:-len(y)]
    variance = squares[len(y):] - squares[:-len(y)] - local_sum**2 / len(y)
    return numerator / np.sqrt(np.maximum(variance * power, 1e-20))


def peak(correlations, hz, exclusion_seconds=2):
    index = int(np.argmax(correlations))
    masked = correlations.copy()
    radius = round(exclusion_seconds * hz)
    masked[max(0, index-radius):index+radius+1] = -1
    return index / hz, float(correlations[index]), float(np.max(masked))


def coarse():
    metadata = json.loads((LOCAL / 'input-metadata.json').read_text(encoding='utf8'))
    tracks = {f'track_{i:02d}': np.load(LOCAL / f'track_{i:02d}-envelope.npy') for i in range(1, 10)}
    maxlen = max(map(len, tracks.values()))
    mix = np.zeros(maxlen, dtype=np.float32)
    for signal in tracks.values():
        mix[:len(signal)] += signal / max(float(np.percentile(signal, 90)), 1e-5)
    tracks['mix'] = mix
    rows = []
    for video in metadata['videos']:
        for stream in video['audioStreams']:
            vod = np.load(LOCAL / f"{stream['signalRef']}-envelope.npy")
            for fraction in [0.08, 0.30, 0.60, 0.90]:
                start = round((video['durationSeconds'] - 60) * fraction * ENVELOPE_HZ)
                template = vod[start:start + 60 * ENVELOPE_HZ]
                for ref, signal in tracks.items():
                    shift, confidence, alternative = peak(ncc(signal, template), ENVELOPE_HZ)
                    rows.append({'reviewTargetId': video['reviewTargetId'], 'vodAudioStream': stream['index'],
                                 'trackRef': ref, 'vodStartSeconds': start / ENVELOPE_HZ,
                                 'craigStartSeconds': shift, 'offsetSeconds': start / ENVELOPE_HZ - shift,
                                 'correlationConfidence': confidence, 'alternativePeak': alternative})
            best = sorted([r for r in rows if r['reviewTargetId'] == video['reviewTargetId'] and r['vodAudioStream'] == stream['index']], key=lambda r: r['correlationConfidence'], reverse=True)[:5]
            print(json.dumps({'coarseBest': best}), flush=True)
    write_json('coarse-correlation.json', rows)


def craig_audio(ref, start, duration):
    if ref not in [f'track_{i:02d}' for i in range(1, 10)] or start < 0:
        raise ValueError('unauthorized_track_window')
    with wave.open(str(CRAIG / f'{ref}.wav'), 'rb') as source:
        source.setpos(min(round(start * 16000), source.getnframes()))
        raw = np.frombuffer(source.readframes(round(duration * 16000)), dtype='<i2').astype(np.float32) / 32768
    # Native 16k normalized audio -> 8k analysis only; originals never rewritten.
    return raw[:len(raw)//2*2].reshape(-1, 2).mean(axis=1)


def anchors():
    metadata = json.loads((LOCAL / 'input-metadata.json').read_text(encoding='utf8'))
    coarse_rows = json.loads((LOCAL / 'coarse-correlation.json').read_text(encoding='utf8'))
    # Regions/splits/quality policy declared before any model fit or held-out score.
    policy = {'fractions': [0, 0.025, 0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 1],
              'splitRule': 'even_region_fit_odd_region_validation', 'templateSeconds': 8,
              'searchRadiusSeconds': 3, 'minNcc': 0.25, 'minPeakMargin': 0.08,
              'regionOffsetsSeconds': [-16, -8, 0, 8, 16],
              'sourceGroups': [{'stream': 2, 'tracks': [1, 2, 3, 4, 5, 7, 8, 9]}, {'stream': 3, 'tracks': [6]}]}
    write_json('measurement-policy.json', policy)
    all_results = []
    for video in metadata['videos']:
        target = video['reviewTargetId']
        reliable = [row for row in coarse_rows if row['reviewTargetId'] == target and row['trackRef'] != 'mix'
                    and row['correlationConfidence'] >= 0.5 and row['correlationConfidence'] - row['alternativePeak'] >= 0.15]
        offsets = np.array([row['offsetSeconds'] for row in reliable])
        if len(offsets) < 3:
            raise ValueError('coarse_alignment_not_established')
        center = float(np.median(offsets))
        consistent = offsets[np.abs(offsets-center) <= 2]
        if len(consistent) < 3:
            raise ValueError('coarse_alignment_ambiguous')
        offset = float(np.median(consistent))
        first = max(25., offset + 25)
        last = video['durationSeconds'] - 30
        accepted, rejected = [], []
        for region, fraction in enumerate(policy['fractions']):
            center_vod = first + fraction * (last - first)
            for group in policy['sourceGroups']:
                vod = np.load(LOCAL / f"{target}-audio-{group['stream']}.npy", mmap_mode='r')
                measurements = []
                for track_num in group['tracks']:
                    ref = f'track_{track_num:02d}'
                    duration = metadata['tracks'][track_num-1]['durationSeconds']
                    for shift in policy['regionOffsetsSeconds']:
                        craig_start = round((center_vod - offset + shift - 4) * RATE) / RATE
                        if craig_start < 0 or craig_start + 8 > duration:
                            continue
                        template = craig_audio(ref, craig_start, 8)
                        if len(template) != 8 * RATE or float(np.sqrt(np.mean(template**2))) < 0.0001:
                            continue
                        search_start = round((craig_start + offset - 3) * RATE)
                        search_end = search_start + 14 * RATE
                        if search_start < 0 or search_end > len(vod):
                            continue
                        values = ncc(vod[search_start:search_end], template)
                        lag, confidence, alternative = peak(values, RATE, 0.15)
                        measurements.append({'trackRef': ref, 'craigTimeSeconds': craig_start + 4,
                                             'vodTimeSeconds': search_start / RATE + lag + 4,
                                             'correlationConfidence': confidence, 'alternativePeak': alternative,
                                             'windowCraigStartSeconds': craig_start, 'windowDurationSeconds': 8})
                eligible = [row for row in measurements if row['correlationConfidence'] >= policy['minNcc']
                            and row['correlationConfidence'] - row['alternativePeak'] >= policy['minPeakMargin']]
                if eligible:
                    row = max(eligible, key=lambda item: item['correlationConfidence'])
                    accepted.append({**row, 'anchorId': f'{target}_region_{region:02d}_stream_{group["stream"]}',
                                     'provenance': 'audio_measured_anchor', 'clockDomain': 'craig_to_vod',
                                     'role': 'fit' if region % 2 == 0 else 'validation', 'region': region,
                                     'vodAudioStream': group['stream']})
                else:
                    rejected.append({'region': region, 'vodAudioStream': group['stream'], 'reason': 'correlation_quality_below_frozen_policy',
                                     'bestNcc': max([row['correlationConfidence'] for row in measurements], default=0)})
            print(json.dumps({'target': target, 'region': region, 'accepted': len(accepted), 'rejected': len(rejected)}), flush=True)
        result = {'reviewTargetId': target, 'vodDurationSeconds': video['durationSeconds'], 'coarseOffsetSeconds': offset,
                  'anchors': accepted, 'rejectedRegions': rejected, 'rejectedAnchorCount': len(rejected)}
        all_results.append(result)
        write_json(f'{target}-measured-anchors.json', result)
    write_json('measured-anchors.json', all_results)


def frames():
    # Bounded visual sampling only; no OCR loop. Times remain VOD timestamps.
    requested = {'review_match_003': [38, 43, 46, 55, 58, 65, 2790, 2805, 2820, 2825, 2828],
                 'review_match_004': [0, 25, 45, 60, 75, 330, 355, 365, 3690, 3710, 3725, 3728, 3730]}
    result = []
    for target, times in requested.items():
        with av.open(str(video_path(target))) as container:
            stream = container.streams.video[0]
            for stamp in times:
                container.seek(int(stamp / stream.time_base), stream=stream, backward=True)
                for frame in container.decode(stream):
                    actual = float(frame.pts * frame.time_base)
                    if actual >= stamp:
                        name = f'{target}-vod-{stamp}.jpg'
                        with av.open(str(LOCAL / name), 'w', format='image2') as output:
                            encoder = output.add_stream('mjpeg', rate=1)
                            encoder.width, encoder.height = frame.width, frame.height
                            encoder.pix_fmt = 'yuvj420p'
                            for packet in encoder.encode(frame.reformat(format='yuvj420p')):
                                output.mux(packet)
                            for packet in encoder.encode(None):
                                output.mux(packet)
                        result.append({'reviewTargetId': target, 'requestedVodSeconds': stamp, 'actualVodSeconds': actual, 'frame': name})
                        break
    write_json('visual-frame-index.json', result)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('stage', choices=['extract', 'coarse', 'anchors', 'frames'])
    args = parser.parse_args()
    started = time.perf_counter()
    {'extract': extract, 'coarse': coarse, 'anchors': anchors, 'frames': frames}[args.stage]()
    print(json.dumps({'stage': args.stage, 'seconds': time.perf_counter() - started}), flush=True)


if __name__ == '__main__':
    main()
