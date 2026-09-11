"""Bounded local VOD decoding for a normalized continuous-review processing job."""
import hashlib
import json
import math
import os
import re
import sys
from pathlib import Path
import av
import cv2

ROOT = Path(__file__).absolute().parents[2]
PROTECTED = re.compile(r'(?:^|[\\/._\s-])(?:replay|review[_-]?match|match|partida)[_-]?0*[5-8](?=$|[\\/._\s-])|(?:^|[\\/])(?:replays?|review[_-]?matches|matches|partidas?)[\\/]0*[5-8](?=$|[\\/._-])', re.I)

def safe(file, missing=False):
    text = str(file)
    if '\x00' in text or '..' in text.replace('\\', '/').split('/') or PROTECTED.search(text) or '%' in text:
        raise ValueError('protected_or_unsafe_path_before_io')
    file = Path(os.path.abspath(text))
    for current in [*reversed(file.parents), file]:
        try:
            info = current.lstat()
        except FileNotFoundError:
            if missing:
                break
            raise
        if current.is_symlink() or getattr(info, 'st_reparse_tag', 0):
            raise ValueError('linked_path_before_following')
    return file

def sha(file):
    safe(file)
    h = hashlib.sha256()
    with file.open('rb') as stream:
        for b in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            h.update(b)
    return h.hexdigest()

def main():
    job_path = safe(sys.argv[1])
    processing_root = ROOT / '.local/deadem/continuous-review/processing'
    if not job_path.is_relative_to(processing_root):
        raise ValueError('job_outside_processing')
    job = json.loads(job_path.read_text(encoding='utf-8'))
    target = job['reviewTargetId']
    if PROTECTED.search(target):
        raise ValueError('protected_target_before_io')
    production = re.fullmatch(r'review_match_(?:009|0[1-9][0-9]|[1-9][0-9]{2})', target)
    if not ((job['mode'] == 'production' and production) or (job['mode'] == 'historical-canary' and target in ('review_match_003', 'review_match_004'))):
        raise ValueError('invalid_processing_target')
    run = safe(job['runDir'])
    if job_path.parent != run or not run.is_relative_to(processing_root):
        raise ValueError('run_directory_mismatch')
    video = safe(job['video']['sourcePath'])
    if video.stat().st_size != job['video']['sizeBytes'] or sha(video) != job['video']['sha256']:
        raise ValueError('video_identity_conflict')
    requests = job['plan']['rows']
    if len(requests) > 10000:
        raise ValueError('visual_request_budget_exceeded')
    for r in requests:
        if not re.fullmatch(re.escape(target) + r'_window_[0-9]{4}_(?:first|representative|last)', r['frameId']):
            raise ValueError('invalid_frame_identity')
        if not math.isfinite(r['requestedVodSeconds']) or not 0 <= r['requestedVodSeconds'] <= job['video']['durationSeconds']:
            raise ValueError('frame_outside_video')
    output = safe(run / 'visual', missing=True)
    output.mkdir(exist_ok=False)
    frames = []
    with av.open(str(video)) as container:
        if len(container.streams.video) != 1:
            raise ValueError('ambiguous_video_stream')
        stream = container.streams.video[0]
        stream.thread_type = 'AUTO'
        for i, r in enumerate(requests):
            seconds = r['requestedVodSeconds']
            container.seek(int(seconds / stream.time_base), stream=stream, backward=True)
            previous = None
            chosen = None
            for frame in container.decode(stream):
                if frame.time is None:
                    continue
                if frame.time >= seconds:
                    chosen = frame if previous is None or abs(frame.time - seconds) < abs(previous.time - seconds) else previous
                    break
                previous = frame
            chosen = chosen or previous
            if chosen is None or abs(chosen.time - seconds) > 0.1:
                frames.append({**r, 'status': 'failed', 'decodedVodSeconds': None})
                continue
            image = chosen.to_ndarray(format='bgr24')
            height = round(image.shape[0] * 960 / image.shape[1])
            image = cv2.resize(image, (960, height), interpolation=cv2.INTER_AREA)
            file = safe(output / (r['frameId'] + '.jpg'), missing=True)
            if not cv2.imwrite(str(file), image, [cv2.IMWRITE_JPEG_QUALITY, 90]):
                raise RuntimeError('frame_write_failed')
            frames.append({**r, 'status': 'decoded', 'decodedVodSeconds': chosen.time,
                           'seekErrorSeconds': chosen.time - seconds, 'localPath': file.relative_to(ROOT).as_posix(),
                           'sha256': sha(file), 'sizeBytes': file.stat().st_size,
                           'epistemicType': 'decoded_visual_evidence', 'semanticInterpretation': None})
            if (i + 1) % 30 == 0:
                print(f'{target}: decoded {i + 1}/{len(requests)} frames', flush=True)
    result = {'schemaVersion': 1, 'reviewTargetId': target, 'epistemicType': 'decoded_visual_evidence',
              'provenance': {'videoSha256': job['video']['sha256'], 'interpretation': 'none'}, 'frames': frames}
    temporary = safe(output / 'frame-index.json.tmp', missing=True)
    temporary.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    temporary.rename(output / 'frame-index.json')
    print(json.dumps({'decodedFrames': sum(f['status'] == 'decoded' for f in frames), 'requestedFrames': len(requests)}), flush=True)

if __name__ == '__main__':
    main()
