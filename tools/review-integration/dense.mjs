import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { ROOT, TARGETS, OUTPUT, writeJson, acceptedJson } from './candidates.mjs';
import { buildWindowEvidence } from '../emit-dense-visual-review-evidence.mjs';

// Revalidate compact identity before the Python extractor checks the fixed-slot VOD.
await acceptedJson('manifest');
const artifact = JSON.parse(await readFile(path.join(ROOT, OUTPUT, 'candidate-windows.json')));
const summaries = [], indexes = [];
for (const id of TARGETS) {
    const local = `.local/deadem/dense-review/${id}`;
    const python = path.join(ROOT, '.venv-video/Scripts/python.exe');
    if (!process.argv.includes('--reuse-frames')) execFileSync(python, ['-B', 'tools/review-integration/extract-frames.py', id], { cwd:ROOT, stdio:'inherit' });
    const { frames, videoIdentityVerified } = JSON.parse(await readFile(path.join(ROOT, local, 'frame-evidence-index.json')));
    const plan = JSON.parse(await readFile(path.join(ROOT, local, 'extraction-plan.json')));
    const windows = artifact.windows.filter(w => w.reviewTargetId === id).map(w => ({ ...buildWindowEvidence(w, frames),
        provenance: { candidateWindow:'Task212_reusing_Task202_unchanged_semantics', visualRange:'Task211_operational_error_bounds', syncUncertainty:'Task211_accepted_operational_error', frames:'Task212_local_visual_evidence_without_interpretation' } }));
    const byId = new Map(frames.map(f => [f.denseFrameId, f]));
    await writeJson(`${local}/contact-sheet-source.json`, { reviewTargetId:id, windows:windows.map(w => ({ ...w, frames:w.denseFrameIds.map(f => byId.get(f)) })) });
    execFileSync(python, ['-B', 'tools/build-dense-review-contact-sheets.py', '--source', `${local}/contact-sheet-source.json`, '--output-root', '.local/deadem/dense-review', '--manifest', `${local}/contact-sheet-manifest.json`], { cwd:ROOT, stdio:'inherit' });
    const sheets = JSON.parse(await readFile(path.join(ROOT, local, 'contact-sheet-manifest.json')));
    const localWindows = windows.map(w => ({ ...w, storyboards:sheets.windows.find(s => s.candidateWindowId === w.candidateWindowId).pages }));
    await writeJson(`${local}/window-evidence-index.json`, { schemaVersion:1, reviewTargetId:id, windows:localWindows });
    summaries.push({ reviewTargetId:id, plannedFrames:plan.rawPlannedRequests, physicalDeduplicatedFrames:frames.length,
        extractedFrames:frames.filter(f => f.extractionStatus === 'decoded').length,
        extractionFailures:frames.filter(f => f.extractionStatus !== 'decoded').length,
        windowsWithFirstRepresentativeLast:windows.filter(w => w.boundaryEvidence.complete).length,
        candidateCount:windows.length, visualCoverage:windows.filter(w => w.frameCount > 0).length / windows.length,
        storyboardCount:sheets.pageCount, localBytes:frames.reduce((n,f) => n + (f.sizeBytes ?? 0),0) + sheets.pages.reduce((n,p) => n+p.sizeBytes,0),
        videoIdentityVerified, cadenceSeconds:plan.cadenceSeconds, densityAdjustmentCount:0 });
    indexes.push({ reviewTargetId:id, candidateCount:windows.length, localFrameIndex:`${local}/frame-evidence-index.json`, localWindowIndex:`${local}/window-evidence-index.json` });
}
await writeJson(`${OUTPUT}/dense-evidence-summary.json`, { schemaVersion:1, taskId:'212', targets:summaries });
await writeJson(`${OUTPUT}/workspace-index.json`, { schemaVersion:1, taskId:'212', provider:'task212', candidateArtifact:`${OUTPUT}/candidate-windows.json`, targets:indexes });
console.log(JSON.stringify(summaries, null, 2));
