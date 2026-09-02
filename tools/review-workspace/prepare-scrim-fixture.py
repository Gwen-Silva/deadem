"""Generate only a synthetic local master-clock video; never reads real media."""
from pathlib import Path
from fractions import Fraction
import json
import av
import numpy as np

root = Path(__file__).resolve().parents[2] / ".local/deadem/review-workspace/scrim"
root.mkdir(parents=True, exist_ok=True)
video_path = root / "synthetic-clock.mp4"
if video_path.exists():
    raise SystemExit("Synthetic video already exists; reuse it without regeneration.")
container = av.open(str(video_path), mode="w")
video = container.add_stream("libx264", rate=5)
video.width, video.height, video.pix_fmt = 640, 360, "yuv420p"
video.options = {"crf": "30", "preset": "ultrafast"}
audio = container.add_stream("aac", rate=16000)
audio.layout = "mono"
for ordinal in range(1000):
    pixels = np.zeros((360, 640, 3), dtype=np.uint8)
    pixels[:] = (16, 15, 31)
    pixels[140:220, :int(640 * ordinal / 1000)] = (121, 73, 203)
    pixels[260:264, :] = (56, 44, 79)
    pixels[80:110, (ordinal * 3) % 600: (ordinal * 3) % 600 + 40] = (180, 150, 239)
    frame = av.VideoFrame.from_ndarray(pixels, format="rgb24")
    frame.pts, frame.time_base = ordinal, Fraction(1, 5)
    for packet in video.encode(frame):
        container.mux(packet)
    samples = np.arange(ordinal * 3200, (ordinal + 1) * 3200)
    tone = (np.sin(samples * (2 * np.pi * 440 / 16000)) * 0.015).astype(np.float32).reshape(1, -1)
    aframe = av.AudioFrame.from_ndarray(tone, format="flt", layout="mono")
    aframe.sample_rate, aframe.pts, aframe.time_base = 16000, ordinal * 3200, Fraction(1, 16000)
    for packet in audio.encode(aframe):
        container.mux(packet)
for stream in [video, audio]:
    for packet in stream.encode(None):
        container.mux(packet)
container.close()
session = {
    "craigRecordingId": "craig_recording_task208_real_01",
    "vodSessions": [{
        "vodSessionId": "task209_synthetic_session", "sourceVodRef": "task209_synthetic_video", "reviewTargetId": None,
        "craigRange": {"start": 0, "end": 190}, "vodRange": {"start": 2, "end": 192.38},
        "syncModel": {"slope": 1.002, "interceptSeconds": 2, "method": "synthetic_fixture", "validationStatus": "synthetic_validated"},
        "syncEstimatedErrorSeconds": 0, "syncStatus": "synthetic_only"
    }]
}
(root / "sessions.json").write_text(json.dumps(session, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"syntheticDurationSeconds": 200, "realVodAccessCount": 0, "realAudioGenerated": False}))
