"""Task 211 bounded visual timing evidence; no audio/ASR, no replay access."""
import argparse
import hashlib
import json
from pathlib import Path
import av
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
TARGETS = ('review_match_003', 'review_match_004')


def resolve_video(target):
    if target not in TARGETS:
        raise ValueError('target_not_authorized_before_filesystem')
    directory = ROOT / '.local/deadem/review-targets' / target / 'video'
    if directory.resolve() != directory:
        raise ValueError('redirected_directory')
    files = [p for p in directory.iterdir() if p.suffix.lower() == '.mp4']
    if len(files) != 1 or not files[0].is_file() or files[0].is_symlink() or files[0].resolve() != files[0]:
        raise ValueError('exactly_one_regular_mp4_required')
    return files[0]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--target', choices=TARGETS, required=True)
    parser.add_argument('--times', help='Comma-separated bounded frame timestamps, maximum 80 per invocation')
    args = parser.parse_args()
    source = resolve_video(args.target)
    with av.open(str(source)) as container:
        duration = container.duration / av.time_base
        if not args.times:
            print(json.dumps({'durationSeconds': duration, 'videoStreamCount': len(container.streams.video)}))
            return
        times = [float(t) for t in args.times.split(',')]
        if not 1 <= len(times) <= 80 or any(t < 0 or t >= duration for t in times):
            raise ValueError('unbounded_or_invalid_frame_request')
        stream = container.streams.video[0]
        output = ROOT / '.local/deadem/review-sync' / args.target / 'task211/frames'
        output.mkdir(parents=True, exist_ok=True)
        rows = []
        for seconds in times:
            container.seek(int(seconds / stream.time_base), stream=stream, backward=True)
            for frame in container.decode(stream):
                if frame.time is None or frame.time + 0.00001 < seconds:
                    continue
                dest = output / f'vod-{seconds:.3f}.jpg'
                with av.open(str(dest), 'w', format='image2') as image:
                    encoder = image.add_stream('mjpeg', rate=1)
                    encoder.width, encoder.height, encoder.pix_fmt = frame.width, frame.height, 'yuvj420p'
                    for packet in encoder.encode(frame.reformat(format='yuvj420p')):
                        image.mux(packet)
                    for packet in encoder.encode():
                        image.mux(packet)
                # Bounded top-center timing crop, local-only and never a storyboard.
                pixels = frame.to_ndarray(format='rgb24')
                crop = av.VideoFrame.from_ndarray(np.ascontiguousarray(pixels[:130, 1150:1420]), format='rgb24')
                with av.open(str(dest.with_name(dest.stem + '-clock.jpg')), 'w', format='image2') as image:
                    encoder = image.add_stream('mjpeg', rate=1)
                    encoder.width, encoder.height, encoder.pix_fmt = crop.width, crop.height, 'yuvj420p'
                    for packet in encoder.encode(crop.reformat(format='yuvj420p')):
                        image.mux(packet)
                    for packet in encoder.encode():
                        image.mux(packet)
                rows.append({'requestedVodSeconds': seconds, 'decodedVodSeconds': frame.time,
                             'sha256': hashlib.sha256(dest.read_bytes()).hexdigest(),
                             'file': str(dest.relative_to(ROOT)).replace('\\', '/')})
                break
        manifest = output.parent / ('frames-' + hashlib.sha256(args.times.encode()).hexdigest()[:12] + '.json')
        manifest.write_text(json.dumps(rows, indent=2) + '\n', encoding='utf8')
        print(json.dumps({'frames': rows}))


if __name__ == '__main__':
    main()
