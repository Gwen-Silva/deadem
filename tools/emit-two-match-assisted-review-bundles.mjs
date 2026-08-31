#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AVAILABILITY = 'output/local-replay-processing/minimum-review-telemetry/task199-bounded2/availability.json';
const CANDIDATES = 'output/local-replay-processing/review-candidate-windows/task202-bounded2/candidate-windows.json';
const DENSE_MANIFEST = 'output/local-replay-processing/dense-review-evidence/task203-bounded2/manifest.json';
const DENSE_WINDOWS = 'output/local-replay-processing/dense-review-evidence/task203-bounded2/window-evidence-index.json';
const OUTPUT_ROOT = 'output/local-replay-processing/assisted-review-bundles/task204-bounded2';
const LOCAL_ROOT = '.local/deadem/review-bundles';
const TARGET_IDS = ['review_match_001', 'review_match_002'];
const ATLAS_CARD_CAPACITY = 6;
const PACKET_PAGE_CAPACITY = 3;
const POSITIVE_GATE = 'two_match_assisted_review_bundles_ready';
const GAPS_GATE = 'two_match_assisted_review_bundles_ready_with_gaps';
const BLOCKED_GATE = 'BLOCKED_BY_REVIEW_BUNDLE_LOCAL_EVIDENCE_UNAVAILABLE';
const MATCH_GATES = Object.freeze({
    review_match_001: 'match_001_review_bundle_usable',
    review_match_002: 'match_002_review_bundle_usable'
});
const PRIORITY_ORDER = Object.freeze({ high: 0, medium: 1, low: 2 });
const PROHIBITED_VISUAL_LABELS = Object.freeze([
    'fight', 'death', 'gank', 'rotation', 'objective contest', 'error', 'good play', 'bad play'
]);

export const REVIEW_PROTOCOL_TEMPLATE = Object.freeze({
    reviewState: 'unreviewed',
    visualRelevance: null,
    facts: [],
    humanContext: [],
    knownInformation: [],
    unknownInformation: [],
    teamCall: null,
    playerIntent: null,
    compositionIdentityContext: [],
    observedAction: null,
    alternatives: [],
    immediateResult: null,
    longTermResult: null,
    decisionQuality: null,
    executionQuality: null,
    errorClasses: [],
    confidence: null,
    evidenceRefs: [],
    reviewNotes: []
});

export const FUTURE_ERROR_VOCABULARY = Object.freeze([
    'mechanical_error',
    'information_error',
    'positioning_error',
    'timing_error',
    'priority_error',
    'map_read_error',
    'risk_evaluation_error',
    'execution_error',
    'planning_error',
    'team_coordination_failure',
    'composition_identity_failure',
    'correct_decision_bad_result',
    'bad_decision_favorable_result',
    'not_an_error',
    'uncertain'
]);

const HUMAN_CONTEXT = Object.freeze({
    review_match_001: {
        team: 'Archmother',
        rosterReported: ['Wraith', 'Lady Geist', 'Bebop', 'Mo & Krill', 'Rem', 'Shiv'],
        statements: [
            'draft precisou ser adaptado',
            'plano de jogo não estava claro',
            'partida foi muito disputada',
            'o time possuía vantagem relevante em determinados momentos',
            'hipótese humana de que três grandes lutas de Rift entregaram grande parte dessa vantagem'
        ],
        limitation: 'Player-reported context to validate visually; no statement is a replay-observed fact or candidate-window label.'
    },
    review_match_002: {
        team: 'Hidden King',
        rosterReported: ['Lash', 'Shiv', 'Venator', 'Paige', 'Graves', 'Mo & Krill'],
        statements: [
            'composição partiu de uma identidade planejada',
            'Graves substituiu Mirage',
            'Paige teria shadowado a side e protegido contra pickoffs',
            'Lash e Shiv teriam navegado o mapa e capitalizado',
            'core Venator + Paige + Mo & Krill teria jogado junto nas fights'
        ],
        limitation: 'All statements are player_reported/context_to_validate without inferred timestamps or automatic candidate labels.'
    }
});

const slash = value => String(value).replaceAll('\\', '/');
const round = (value, digits = 6) => Number(Number(value).toFixed(digits));

function sorted(value) {
    if (Array.isArray(value)) return value.map(sorted);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])]));
    }
    return value;
}

export function deterministicJson(value) {
    return `${JSON.stringify(sorted(value), null, 2)}\n`;
}

function localRelative(value) {
    const absolute = path.isAbsolute(value) ? value : path.resolve(ROOT, value);
    return slash(path.relative(ROOT, absolute));
}

export function assertReviewTargetId(value) {
    if (/(?:replay|partida|match)[_-]?00?[5-8]/iu.test(String(value))) {
        throw new Error(`protected replay alias rejected before filesystem access: ${value}`);
    }
    if (!TARGET_IDS.includes(value)) throw new Error(`unsupported review target: ${value}`);
    return value;
}

export function buildReviewOrders(windows) {
    const chronologicalOrder = [...windows]
        .sort((left, right) => left.replayStartSeconds - right.replayStartSeconds || left.candidateWindowId.localeCompare(right.candidateWindowId))
        .map(window => window.candidateWindowId);
    const priorityOrder = [...windows]
        .sort((left, right) => PRIORITY_ORDER[left.priorityTier] - PRIORITY_ORDER[right.priorityTier]
            || left.replayStartSeconds - right.replayStartSeconds
            || left.candidateWindowId.localeCompare(right.candidateWindowId))
        .map(window => window.candidateWindowId);
    return { chronologicalOrder, priorityOrder };
}

export function groupAtlasPages(reviewTargetId, chronologicalWindows, capacity = ATLAS_CARD_CAPACITY) {
    assertReviewTargetId(reviewTargetId);
    if (capacity !== 6) throw new Error('screening atlas capacity must be exactly six cards');
    const pages = [];
    for (let start = 0; start < chronologicalWindows.length; start += capacity) {
        const windows = chronologicalWindows.slice(start, start + capacity);
        const firstRange = windows[0].replayObservedFacts?.replayElapsedRangeSeconds
            ?? { start: windows[0].replayStartSeconds, end: windows[0].replayEndSeconds };
        const lastRange = windows.at(-1).replayObservedFacts?.replayElapsedRangeSeconds
            ?? { start: windows.at(-1).replayStartSeconds, end: windows.at(-1).replayEndSeconds };
        pages.push({
            atlasPageId: `${reviewTargetId}_atlas_${String(pages.length + 1).padStart(3, '0')}`,
            reviewTargetId,
            candidateWindowIds: windows.map(window => window.candidateWindowId),
            replayRange: {
                startSeconds: firstRange.start,
                endSeconds: lastRange.end
            }
        });
    }
    return pages;
}

export function groupUploadPackets(reviewTargetId, atlasPages, capacity = PACKET_PAGE_CAPACITY) {
    assertReviewTargetId(reviewTargetId);
    if (capacity !== 3) throw new Error('upload packet capacity must be exactly three atlas pages');
    const packets = [];
    for (let start = 0; start < atlasPages.length; start += capacity) {
        const pages = atlasPages.slice(start, start + capacity);
        const descriptors = pages.map(page => ({ atlasPageId: page.atlasPageId, sha256: page.sha256, sizeBytes: page.sizeBytes }));
        packets.push({
            packetId: `${reviewTargetId}_packet_${String(packets.length + 1).padStart(3, '0')}`,
            reviewTargetId,
            atlasPageIds: pages.map(page => page.atlasPageId),
            candidateWindowIds: pages.flatMap(page => page.candidateWindowIds),
            replayRange: {
                startSeconds: pages[0].replayRange.startSeconds,
                endSeconds: pages.at(-1).replayRange.endSeconds
            },
            localPaths: pages.map(page => page.localPath),
            sha256: crypto.createHash('sha256').update(deterministicJson(descriptors)).digest('hex'),
            sizeBytes: pages.reduce((sum, page) => sum + page.sizeBytes, 0)
        });
    }
    return packets;
}

export function freshReviewRecord(candidateWindowId) {
    return { candidateWindowId, ...structuredClone(REVIEW_PROTOCOL_TEMPLATE) };
}

function assertEmptyReviewRecord(record) {
    if (record.reviewState !== 'unreviewed') throw new Error(`review state changed: ${record.candidateWindowId}`);
    for (const key of ['visualRelevance', 'teamCall', 'playerIntent', 'observedAction', 'immediateResult', 'longTermResult', 'decisionQuality', 'executionQuality', 'confidence']) {
        if (record[key] !== null) throw new Error(`review conclusion was prefilled: ${record.candidateWindowId}/${key}`);
    }
    for (const key of ['facts', 'humanContext', 'knownInformation', 'unknownInformation', 'compositionIdentityContext', 'alternatives', 'errorClasses', 'evidenceRefs', 'reviewNotes']) {
        if (!Array.isArray(record[key]) || record[key].length !== 0) throw new Error(`review conclusion array was prefilled: ${record.candidateWindowId}/${key}`);
    }
    return true;
}

async function sha256File(file) {
    const hash = crypto.createHash('sha256');
    await new Promise((resolve, reject) => {
        const stream = createReadStream(file);
        stream.on('data', chunk => hash.update(chunk));
        stream.on('error', reject);
        stream.on('end', resolve);
    });
    return hash.digest('hex');
}

async function validateFileBridge(bridge) {
    const absolute = path.resolve(ROOT, bridge.path);
    const metadata = await stat(absolute);
    const actualSha256 = await sha256File(absolute);
    if (metadata.size !== bridge.sizeBytes || actualSha256 !== bridge.sha256) throw new Error(`Task203 local artifact bridge mismatch: ${bridge.path}`);
    return { path: bridge.path, expectedSizeBytes: bridge.sizeBytes, actualSizeBytes: metadata.size, expectedSha256: bridge.sha256, actualSha256, status: 'validated' };
}

async function validateImage(filePath, expectedSha256, cache) {
    const absolute = path.resolve(ROOT, filePath);
    if (!cache.has(absolute)) {
        const metadata = await stat(absolute);
        const actualSha256 = await sha256File(absolute);
        cache.set(absolute, { localPath: localRelative(absolute), sizeBytes: metadata.size, actualSha256 });
    }
    const result = cache.get(absolute);
    if (result.actualSha256 !== expectedSha256) throw new Error(`local visual evidence hash mismatch: ${filePath}`);
    return { ...result, expectedSha256, status: 'validated' };
}

async function run(command, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', chunk => { stdout += chunk; });
        child.stderr.on('data', chunk => { stderr += chunk; });
        child.on('error', reject);
        child.on('close', code => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`command failed (${code}): ${stdout}\n${stderr}`)));
    });
}

async function writeLocalJson(file, value) {
    const absolute = path.resolve(ROOT, file);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, deterministicJson(value), 'utf8');
    return absolute;
}

async function writeArtifact(name, value) {
    const absolute = path.resolve(ROOT, OUTPUT_ROOT, name);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, deterministicJson(value), 'utf8');
}

async function bridgeLocalFile(file) {
    const metadata = await stat(file);
    return { path: localRelative(file), sizeBytes: metadata.size, sha256: await sha256File(file) };
}

async function buildAtlas(reviewTargetId, cards, pages) {
    const targetRoot = path.resolve(ROOT, LOCAL_ROOT, reviewTargetId);
    const source = path.join(targetRoot, 'screening-atlas-source.json');
    const manifest = path.join(targetRoot, 'screening-atlas-manifest.json');
    await mkdir(targetRoot, { recursive: true });
    await writeFile(source, deterministicJson({ reviewTargetId, cards, pages }), 'utf8');
    const python = path.resolve(ROOT, '.venv-video/Scripts/python.exe');
    const script = path.resolve(ROOT, 'tools/build-review-screening-atlas.py');
    const args = ['--source', source, '--output-root', path.resolve(ROOT, LOCAL_ROOT), '--manifest', manifest];
    await run(python, [script, ...args]);
    const first = await readFile(manifest, 'utf8');
    await run(python, [script, ...args]);
    const second = await readFile(manifest, 'utf8');
    return { manifest: JSON.parse(second), byteDeterministic: first === second };
}

function compactAvailability(availability) {
    return Object.fromEntries(['lifeState', 'netWorth', 'damage', 'healing', 'objectives', 'positions'].map(family => [family, {
        status: availability[family].status,
        rows: availability[family].rows,
        source: availability[family].source,
        semanticLimitations: availability[family].semanticLimitations
    }]));
}

function buildWindowRecord(candidate, dense, availability) {
    if (candidate.candidateWindowId !== dense.candidateWindowId) throw new Error(`candidate ID bridge changed: ${candidate.candidateWindowId}`);
    if (candidate.priorityTier !== dense.priorityTier) throw new Error(`candidate priority bridge changed: ${candidate.candidateWindowId}`);
    if (deterministicJson(candidate.sourceFamilies) !== deterministicJson(dense.sourceFamilies)) throw new Error(`candidate source families changed: ${candidate.candidateWindowId}`);
    const reviewRecord = freshReviewRecord(candidate.candidateWindowId);
    assertEmptyReviewRecord(reviewRecord);
    return {
        candidateWindowId: candidate.candidateWindowId,
        reviewTargetId: candidate.reviewTargetId,
        candidateSemantics: 'review_attention_region_not_gameplay_event',
        provenance: {
            replayObservedFacts: 'Task199/factual_telemetry_availability_and_replay_elapsed_axis',
            derivedMetrics: 'Task202/structural_candidate_metrics_not_probability',
            videoEvidence: 'Task200_mapping_plus_Task203_local_visual_evidence',
            humanSuppliedContext: 'human_supplied/player_reported_match_level_link',
            analystInference: 'empty_in_Task204'
        },
        replayObservedFacts: {
            replayElapsedRangeSeconds: { start: candidate.replayStartSeconds, end: candidate.replayEndSeconds },
            telemetryAvailability: compactAvailability(availability),
            limitations: ['Availability and raw observations do not establish gameplay events, decisions or outcomes.']
        },
        derivedMetrics: {
            priorityTier: candidate.priorityTier,
            prioritySemantics: candidate.prioritySemantics,
            sourceFamilies: candidate.sourceFamilies,
            sourceFamilyCount: candidate.sourceFamilyCount,
            seedCount: candidate.seedCount,
            perFamilyMetrics: candidate.perFamilyMetrics,
            notProbability: true
        },
        videoEvidence: {
            visualVodRangeSeconds: { start: dense.visualVodStartSeconds, end: dense.visualVodEndSeconds },
            syncEstimatedErrorSeconds: dense.syncEstimatedErrorSeconds,
            firstFrameId: dense.firstFrameId,
            representativeFrameId: dense.representativeFrameId,
            lastFrameId: dense.lastFrameId,
            denseFrameIds: dense.denseFrameIds,
            storyboardIds: dense.contactSheetIds,
            storyboardPageCount: dense.storyboardPageCount,
            storyboards: [],
            screeningCard: null
        },
        humanSuppliedContext: {
            provenanceClass: 'human_supplied/player_reported',
            matchContextRef: `${candidate.reviewTargetId}_human_context`,
            timestampsInferred: false
        },
        analystInference: [],
        reviewRecord
    };
}

function reviewGuide(reviewTargetId, firstPacketId) {
    return `# ${reviewTargetId} Assisted Review Guide\n\n` +
        `Start with packet \`${firstPacketId}\`. Upload its three atlas JPEGs together. Each atlas panel is a visual review candidate, not a gameplay-event label. ` +
        `Use the candidateWindowId printed on the panel to find factual context in window-review-index.json. If denser evidence is requested, open only the referenced Task203 storyboard pages. ` +
        `Add new player context under human_supplied/player_reported and leave analystInference empty until a human or ChatGPT review is explicitly performed.\n`;
}

export function noGameplayLabels(value) {
    if (typeof value === 'string') {
        const text = value.toLowerCase();
        return PROHIBITED_VISUAL_LABELS.every(label => !text.includes(label));
    }
    if (Array.isArray(value)) return value.every(noGameplayLabels);
    if (value && typeof value === 'object') return Object.values(value).every(noGameplayLabels);
    return true;
}

export async function emit() {
    const availabilityArtifact = JSON.parse(await readFile(path.resolve(ROOT, AVAILABILITY), 'utf8'));
    const candidateArtifact = JSON.parse(await readFile(path.resolve(ROOT, CANDIDATES), 'utf8'));
    const denseManifest = JSON.parse(await readFile(path.resolve(ROOT, DENSE_MANIFEST), 'utf8'));
    const denseWindowArtifact = JSON.parse(await readFile(path.resolve(ROOT, DENSE_WINDOWS), 'utf8'));
    if (candidateArtifact.windowCount !== 102 || denseWindowArtifact.candidateWindowCount !== 102) throw new Error('Task202/203 candidate count must remain 102');
    if (candidateArtifact.candidateSemantics !== 'review_attention_region_not_gameplay_event') throw new Error('Task202 candidate semantics changed');
    const candidateIds = candidateArtifact.windows.map(window => window.candidateWindowId);
    const denseIds = denseWindowArtifact.windows.map(window => window.candidateWindowId);
    if (deterministicJson(candidateIds) !== deterministicJson(denseIds)) throw new Error('Task203 candidate ID bridge changed');

    const availabilityById = new Map(availabilityArtifact.targets.map(target => [target.reviewTargetId, target.availability]));
    const denseById = new Map(denseWindowArtifact.windows.map(window => [window.candidateWindowId, window]));
    const localBridgeAudits = [];
    const matchContexts = [];
    const queues = [];
    const allWindowRecords = [];
    const allAtlasPages = [];
    const allPackets = [];
    const targetSummaries = [];
    const imageCache = new Map();
    let storyboardReferenceValidations = 0;
    let sourceFrameReferenceValidations = 0;

    for (const reviewTargetId of TARGET_IDS) {
        assertReviewTargetId(reviewTargetId);
        const localBridges = denseManifest.localArtifacts.find(target => target.reviewTargetId === reviewTargetId);
        if (!localBridges) throw new Error(`Task203 local artifacts missing: ${reviewTargetId}`);
        const bridgeAudit = { reviewTargetId, artifacts: [] };
        for (const key of ['extractionPlan', 'frameEvidenceIndex', 'windowEvidenceIndex', 'contactSheetManifest']) {
            bridgeAudit.artifacts.push({ artifact: key, ...await validateFileBridge(localBridges[key]) });
        }
        localBridgeAudits.push(bridgeAudit);

        const frameIndex = JSON.parse(await readFile(path.resolve(ROOT, localBridges.frameEvidenceIndex.path), 'utf8'));
        const storyboardManifest = JSON.parse(await readFile(path.resolve(ROOT, localBridges.contactSheetManifest.path), 'utf8'));
        const framesById = new Map(frameIndex.frames.map(frame => [frame.denseFrameId, frame]));
        const pagesById = new Map(storyboardManifest.pages.map(page => [page.storyboardId, page]));
        const candidates = candidateArtifact.windows.filter(window => window.reviewTargetId === reviewTargetId);
        const denseWindows = candidates.map(candidate => denseById.get(candidate.candidateWindowId));
        if (denseWindows.some(window => !window)) throw new Error(`Task203 dense window missing: ${reviewTargetId}`);
        const records = candidates.map((candidate, index) => buildWindowRecord(candidate, denseWindows[index], availabilityById.get(reviewTargetId)));
        const cards = [];
        for (const record of records) {
            const frameIds = [record.videoEvidence.firstFrameId, record.videoEvidence.representativeFrameId, record.videoEvidence.lastFrameId];
            const roles = ['first', 'representative', 'last'];
            const visualFrames = [];
            for (let index = 0; index < frameIds.length; index++) {
                const frame = framesById.get(frameIds[index]);
                if (!frame?.localPath || !frame.frameSha256) throw new Error(`Task203 screening frame missing: ${record.candidateWindowId}/${roles[index]}`);
                const validation = await validateImage(frame.localPath, frame.frameSha256, imageCache);
                sourceFrameReferenceValidations += 1;
                visualFrames.push({ role: roles[index], denseFrameId: frame.denseFrameId, localPath: frame.localPath, sha256: frame.frameSha256, sizeBytes: validation.sizeBytes });
            }
            const storyboardRefs = [];
            for (const storyboardId of record.videoEvidence.storyboardIds) {
                const page = pagesById.get(storyboardId);
                if (!page) throw new Error(`Task203 storyboard missing: ${record.candidateWindowId}/${storyboardId}`);
                await validateImage(page.localPath, page.sha256, imageCache);
                storyboardReferenceValidations += 1;
                storyboardRefs.push({ storyboardId, localPath: page.localPath, sha256: page.sha256, sizeBytes: page.sizeBytes, denseFrameIds: page.denseFrameIds });
            }
            record.videoEvidence.storyboards = storyboardRefs;
            cards.push({
                screeningCardId: `${record.candidateWindowId}_card`,
                candidateWindowId: record.candidateWindowId,
                reviewTargetId,
                priorityTier: record.derivedMetrics.priorityTier,
                replayRange: record.replayObservedFacts.replayElapsedRangeSeconds,
                visualVodRange: record.videoEvidence.visualVodRangeSeconds,
                syncEstimatedErrorSeconds: record.videoEvidence.syncEstimatedErrorSeconds,
                sourceFamilies: record.derivedMetrics.sourceFamilies,
                visualFrames
            });
        }
        if (!noGameplayLabels(cards.map(card => ({ ...card, visualFrames: card.visualFrames.map(frame => ({ role: frame.role, denseFrameId: frame.denseFrameId })) })))) {
            throw new Error(`prohibited gameplay label entered screening card metadata: ${reviewTargetId}`);
        }

        const orders = buildReviewOrders(candidates);
        const recordById = new Map(records.map(record => [record.candidateWindowId, record]));
        const chronologicalRecords = orders.chronologicalOrder.map(id => recordById.get(id));
        const cardById = new Map(cards.map(card => [card.candidateWindowId, card]));
        const atlasPlan = groupAtlasPages(reviewTargetId, chronologicalRecords);
        const atlas = await buildAtlas(reviewTargetId, cards, atlasPlan);
        const atlasPages = atlas.manifest.pages;
        const atlasPageByCandidate = new Map();
        for (const page of atlasPages) {
            page.candidateWindowIds.forEach((candidateWindowId, cardIndex) => atlasPageByCandidate.set(candidateWindowId, { page, cardIndex }));
        }
        for (const record of records) {
            const membership = atlasPageByCandidate.get(record.candidateWindowId);
            const card = cardById.get(record.candidateWindowId);
            if (!membership) throw new Error(`screening card atlas membership missing: ${record.candidateWindowId}`);
            record.videoEvidence.screeningCard = {
                screeningCardId: card.screeningCardId,
                atlasPageId: membership.page.atlasPageId,
                atlasLocalPath: membership.page.localPath,
                atlasSha256: membership.page.sha256,
                cardIndex: membership.cardIndex,
                sourceFrameIds: card.visualFrames.map(frame => frame.denseFrameId),
                sourceFrameHashes: card.visualFrames.map(frame => frame.sha256)
            };
        }
        const packets = groupUploadPackets(reviewTargetId, atlasPages);
        const humanContext = {
            humanContextId: `${reviewTargetId}_human_context`,
            reviewTargetId,
            provenanceClass: 'human_supplied/player_reported',
            team: HUMAN_CONTEXT[reviewTargetId].team,
            rosterReported: HUMAN_CONTEXT[reviewTargetId].rosterReported,
            statements: HUMAN_CONTEXT[reviewTargetId].statements.map(text => ({ text, status: 'context_to_validate', timestamps: [] })),
            limitation: HUMAN_CONTEXT[reviewTargetId].limitation,
            analystInference: []
        };
        matchContexts.push(humanContext);
        queues.push({ reviewTargetId, schedulingSemantics: 'review_scheduling_only_not_factual_relevance', ...orders });
        allWindowRecords.push(...records);
        allAtlasPages.push(...atlasPages);
        allPackets.push(...packets);

        const bundle = {
            schemaVersion: 1,
            reviewTargetId,
            matchGate: MATCH_GATES[reviewTargetId],
            candidateSemantics: 'review_attention_region_not_gameplay_event',
            humanContext,
            reviewQueue: orders,
            candidateWindows: records,
            screeningAtlasPages: atlasPages,
            uploadPackets: packets,
            analystInference: []
        };
        const bundleFile = await writeLocalJson(`${LOCAL_ROOT}/${reviewTargetId}/bundle.json`, bundle);
        const windowIndexFile = await writeLocalJson(`${LOCAL_ROOT}/${reviewTargetId}/window-review-index.json`, { schemaVersion: 1, reviewTargetId, windows: records });
        const packetFile = await writeLocalJson(`${LOCAL_ROOT}/${reviewTargetId}/upload-packet-index.json`, { schemaVersion: 1, reviewTargetId, packets });
        const guideFile = path.resolve(ROOT, LOCAL_ROOT, reviewTargetId, 'review-guide.md');
        await writeFile(guideFile, reviewGuide(reviewTargetId, packets[0].packetId), 'utf8');
        const atlasBytes = atlasPages.reduce((sum, page) => sum + page.sizeBytes, 0);
        const localBundleBytes = atlasBytes + (await stat(bundleFile)).size + (await stat(windowIndexFile)).size + (await stat(packetFile)).size + (await stat(guideFile)).size;
        const metrics = {
            reviewTargetId,
            candidateWindows: records.length,
            screeningCards: cards.length,
            atlasPages: atlasPages.length,
            uploadPackets: packets.length,
            windowsByPriority: {
                high: records.filter(record => record.derivedMetrics.priorityTier === 'high').length,
                medium: records.filter(record => record.derivedMetrics.priorityTier === 'medium').length,
                low: records.filter(record => record.derivedMetrics.priorityTier === 'low').length
            },
            windowsWithFactualContext: records.filter(record => record.replayObservedFacts).length,
            windowsWithReviewTemplate: records.filter(record => assertEmptyReviewRecord(record.reviewRecord)).length,
            windowsWithDenseStoryboardRefs: records.filter(record => record.videoEvidence.storyboards.length === record.videoEvidence.storyboardPageCount && record.videoEvidence.storyboards.length > 0).length,
            sourceFrameReferencesValidated: cards.length * 3,
            uniqueSourceFramesValidated: new Set(cards.flatMap(card => card.visualFrames.map(frame => frame.denseFrameId))).size,
            storyboardReferencesValidated: records.reduce((sum, record) => sum + record.videoEvidence.storyboards.length, 0),
            atlasLocalBytes: atlasBytes,
            localBundleBytes,
            syncEstimatedErrorSeconds: records[0].videoEvidence.syncEstimatedErrorSeconds,
            unresolvedEvidenceReferences: 0,
            atlasByteDeterministic: atlas.byteDeterministic
        };
        targetSummaries.push({ reviewTargetId, matchGate: MATCH_GATES[reviewTargetId], metrics, localArtifacts: {
            bundle: await bridgeLocalFile(bundleFile),
            windowReviewIndex: await bridgeLocalFile(windowIndexFile),
            uploadPacketIndex: await bridgeLocalFile(packetFile),
            reviewGuide: await bridgeLocalFile(guideFile),
            screeningAtlasManifest: await bridgeLocalFile(path.resolve(ROOT, LOCAL_ROOT, reviewTargetId, 'screening-atlas-manifest.json'))
        } });
    }

    const allUsable = targetSummaries.every(target => target.metrics.candidateWindows === target.metrics.screeningCards
        && target.metrics.windowsWithFactualContext === target.metrics.candidateWindows
        && target.metrics.windowsWithReviewTemplate === target.metrics.candidateWindows
        && target.metrics.windowsWithDenseStoryboardRefs === target.metrics.candidateWindows
        && target.metrics.unresolvedEvidenceReferences === 0
        && target.metrics.atlasByteDeterministic);
    const aggregate = {
        candidates: allWindowRecords.length,
        totalAtlasPages: allAtlasPages.length,
        uploadPacketCount: allPackets.length,
        sourceFrameReferenceValidationCount: sourceFrameReferenceValidations,
        uniqueSourceFrameValidationCount: imageCache.size - storyboardReferenceValidations,
        storyboardReferenceValidationCount: storyboardReferenceValidations,
        localBundleBytes: targetSummaries.reduce((sum, target) => sum + target.metrics.localBundleBytes, 0),
        replayAccessCount: 0,
        vodAccessCount: 0,
        protectedAccessCount: 0,
        analystInferenceCount: allWindowRecords.reduce((sum, record) => sum + record.analystInference.length, 0) + matchContexts.reduce((sum, context) => sum + context.analystInference.length, 0),
        gameplayInterpretationCount: 0,
        imagesVersioned: 0
    };
    const technicalGateStatus = allUsable && aggregate.candidates === 102 ? POSITIVE_GATE
        : aggregate.candidates === 102 ? GAPS_GATE
            : BLOCKED_GATE;

    await writeArtifact('manifest.json', {
        schemaVersion: 1,
        artifactClass: 'two_match_assisted_review_bundle_manifest',
        generatedBy: 'tools/emit-two-match-assisted-review-bundles.mjs',
        generatedAtLogical: 'task_204',
        sourceArtifacts: [AVAILABILITY, CANDIDATES, DENSE_MANIFEST, DENSE_WINDOWS],
        task203LocalArtifactValidation: localBridgeAudits,
        targetBundles: targetSummaries.map(target => ({ reviewTargetId: target.reviewTargetId, matchGate: target.matchGate, localArtifacts: target.localArtifacts })),
        mediaStoragePolicy: 'local_untracked_do_not_commit_images'
    });
    await writeArtifact('match-context.json', { schemaVersion: 1, provenanceClass: 'human_supplied/player_reported', contexts: matchContexts, analystInference: [] });
    await writeArtifact('review-queue.json', { schemaVersion: 1, schedulingSemantics: 'review_scheduling_only_not_factual_relevance', targets: queues });
    await writeArtifact('window-review-index.json', {
        schemaVersion: 1,
        artifactClass: 'two_match_assisted_window_review_index',
        candidateSemantics: 'review_attention_region_not_gameplay_event',
        candidateCount: allWindowRecords.length,
        windows: allWindowRecords
    });
    await writeArtifact('screening-atlas-index.json', { schemaVersion: 1, cardCapacityPerPage: 6, imagesVersioned: false, pageCount: allAtlasPages.length, pages: allAtlasPages });
    await writeArtifact('upload-packet-index.json', { schemaVersion: 1, atlasPagesPerPacket: 3, packetCount: allPackets.length, packets: allPackets });
    await writeArtifact('review-protocol-template.json', {
        schemaVersion: 1,
        templateSemantics: 'empty_record_for_future_human_or_chatgpt_review',
        template: REVIEW_PROTOCOL_TEMPLATE,
        futureAllowedErrorVocabulary: FUTURE_ERROR_VOCABULARY,
        task204AssignedErrorClasses: []
    });
    await writeArtifact('summary.json', { schemaVersion: 1, technicalGateStatus, aggregate, targets: targetSummaries.map(target => ({ reviewTargetId: target.reviewTargetId, matchGate: target.matchGate, metrics: target.metrics })) });
    await writeArtifact('gate.json', {
        schemaVersion: 1,
        technicalGateStatus,
        matchGates: Object.fromEntries(targetSummaries.map(target => [target.reviewTargetId, target.matchGate])),
        moduleStatus: technicalGateStatus === POSITIVE_GATE ? 'functional_ready_for_real_review_handoff' : technicalGateStatus === BLOCKED_GATE ? 'blocked' : 'functional_with_gaps',
        workAcceptanceStatus: 'pending_independent_validation',
        reservedFutureGate: 'two_match_assisted_vod_review_ready_after_real_review_only'
    });
    await writeArtifact('provenance-audit.json', {
        schemaVersion: 1,
        task203LocalArtifactsValidated: 8,
        candidateIdsPreserved: candidateIds.length,
        sourceFrameReferencesValidated: sourceFrameReferenceValidations,
        storyboardReferencesValidated: storyboardReferenceValidations,
        replayObservedFactsSeparated: true,
        derivedMetricsSeparated: true,
        videoEvidenceSeparated: true,
        humanSuppliedContextSeparated: true,
        humanContextProvenanceClass: 'human_supplied/player_reported',
        analystInferenceSeparatedAndEmpty: aggregate.analystInferenceCount === 0,
        candidatePriorityChanged: 0,
        candidateRemoved: 0,
        replayAccessCount: 0,
        vodAccessCount: 0,
        protectedAccessCount: 0,
        gameplayInterpretationCount: 0,
        imagesVersioned: 0,
        prohibitedStagesExecuted: [],
        limitations: [
            'Screening atlas composition is a visual transformation, not visual analysis.',
            'Human-supplied context has no inferred timestamps and creates no candidate labels.',
            'Bundle readiness does not mean either match has been reviewed.'
        ]
    });
    return { technicalGateStatus, aggregate, targetSummaries };
}

async function main() {
    const result = await emit();
    process.stdout.write(deterministicJson({ status: result.technicalGateStatus, aggregate: result.aggregate }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    main().catch(error => {
        process.stderr.write(`${error.stack ?? error.message}\n`);
        process.exitCode = 1;
    });
}
