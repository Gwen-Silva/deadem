import { createReadStream, existsSync, statSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    DEFAULT_REPO_ROOT,
    TARGET_IDS,
    assertCandidateId,
    assertSafeRequestPath,
    assertTargetId,
    listCandidates,
    loadWorkspaceData
} from './data-model.mjs';
import { ReviewStateStore } from './persistence.mjs';
import { writeExportPacket } from './export.mjs';
import { loadLocalScrimData } from './scrim-media.mjs';
import { parseScrimNavigation, resolveScrimNavigation } from './scrim-navigation.mjs';
import {
    buildScrimPresentation,
    parseFriendlyScrimNavigation,
    resolveFriendlyReplayEntry,
    targetIdForReplayMatch
} from './scrim-presentation.mjs';
import { assertPublicMatchId, buildProductCatalog, buildProductMatch, targetIdFromPublicMatchId } from './product-view-model.mjs';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(MODULE_DIR, 'public');
const STATIC_FILES = new Map([
    ['/shell.mjs', { path: path.join(PUBLIC_DIR, 'shell.mjs'), type: 'text/javascript; charset=utf-8' }],
    ['/product-app.mjs', { path: path.join(PUBLIC_DIR, 'product-app.mjs'), type: 'text/javascript; charset=utf-8' }],
    ['/product-navigation.mjs', { path: path.join(PUBLIC_DIR, 'product-navigation.mjs'), type: 'text/javascript; charset=utf-8' }],
    ['/styles/tokens.css', { path: path.join(PUBLIC_DIR, 'styles', 'tokens.css'), type: 'text/css; charset=utf-8' }],
    ['/styles/base.css', { path: path.join(PUBLIC_DIR, 'styles', 'base.css'), type: 'text/css; charset=utf-8' }],
    ['/styles/components.css', { path: path.join(PUBLIC_DIR, 'styles', 'components.css'), type: 'text/css; charset=utf-8' }],
    ['/styles/shell.css', { path: path.join(PUBLIC_DIR, 'styles', 'shell.css'), type: 'text/css; charset=utf-8' }],
    ['/styles/product.css', { path: path.join(PUBLIC_DIR, 'styles', 'product.css'), type: 'text/css; charset=utf-8' }],
    ['/styles/review.css', { path: path.join(PUBLIC_DIR, 'styles', 'review.css'), type: 'text/css; charset=utf-8' }],
    ['/styles/replay.css', { path: path.join(PUBLIC_DIR, 'styles', 'replay.css'), type: 'text/css; charset=utf-8' }],
    ['/styles/showcase.css', { path: path.join(PUBLIC_DIR, 'styles', 'showcase.css'), type: 'text/css; charset=utf-8' }],
    ['/review-presentation.mjs', { path: path.join(MODULE_DIR, 'review-presentation.mjs'), type: 'text/javascript; charset=utf-8' }],
    ['/scrim-navigation.mjs', { path:path.join(MODULE_DIR, 'scrim-navigation.mjs'), type:'text/javascript; charset=utf-8' }],
    ['/scrim-presentation.mjs', { path:path.join(MODULE_DIR, 'scrim-presentation.mjs'), type:'text/javascript; charset=utf-8' }],
    ['/scrim', { path: path.join(PUBLIC_DIR, 'scrim.html'), type: 'text/html; charset=utf-8' }],
    ['/scrim-app.mjs', { path: path.join(PUBLIC_DIR, 'scrim-app.mjs'), type: 'text/javascript; charset=utf-8' }],
    ['/scrim-controller.mjs', { path: path.join(PUBLIC_DIR, 'scrim-controller.mjs'), type: 'text/javascript; charset=utf-8' }],
    ['/scrim-model.mjs', { path: path.join(MODULE_DIR, 'scrim-model.mjs'), type: 'text/javascript; charset=utf-8' }],
    ['/scrim.css', { path: path.join(PUBLIC_DIR, 'scrim.css'), type: 'text/css; charset=utf-8' }],
    ['/', { path: path.join(PUBLIC_DIR, 'product.html'), type: 'text/html; charset=utf-8' }],
    ['/matches', { path: path.join(PUBLIC_DIR, 'product.html'), type: 'text/html; charset=utf-8' }],
    ['/patterns', { path: path.join(PUBLIC_DIR, 'product.html'), type: 'text/html; charset=utf-8' }],
    ['/training', { path: path.join(PUBLIC_DIR, 'product.html'), type: 'text/html; charset=utf-8' }],
    ['/review', { path: path.join(PUBLIC_DIR, 'index.html'), type: 'text/html; charset=utf-8' }],
    ['/index.html', { path: path.join(PUBLIC_DIR, 'index.html'), type: 'text/html; charset=utf-8' }],
    ['/app.js', { path: path.join(PUBLIC_DIR, 'app.js'), type: 'text/javascript; charset=utf-8' }],
    ['/ux-model.mjs', { path: path.join(MODULE_DIR, 'ux-model.mjs'), type: 'text/javascript; charset=utf-8' }],
    ['/styles.css', { path: path.join(PUBLIC_DIR, 'styles.css'), type: 'text/css; charset=utf-8' }]
]);

export function resolveExportFolder(exportRoot, targetId) {
    const safeTargetId = assertTargetId(targetId);
    const root = path.resolve(exportRoot);
    const folder = path.resolve(root, safeTargetId);
    if (path.dirname(folder) !== root) throw new Error('unsafe_export_folder');
    return {
        reviewTargetId: safeTargetId,
        folderPath: folder,
        relativePath: `.local/deadem/review-workspace/exports/${safeTargetId}`
    };
}

async function serveStaticFile(response, staticFile) {
    const content = await readFile(staticFile.path);
    response.writeHead(200, {
        'content-type': staticFile.type,
        'content-length': content.length,
        'cache-control': 'no-store'
    });
    response.end(content);
}

export async function openLocalFolder(folderPath) {
    if (process.platform !== 'win32') throw new Error('open_folder_platform_unsupported');
    const child = spawn('explorer.exe', [folderPath], { detached: true, stdio: 'ignore', windowsHide: false });
    child.unref();
}

function jsonResponse(response, status, value) {
    const body = `${JSON.stringify(value)}\n`;
    response.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(body),
        'cache-control': 'no-store'
    });
    response.end(body);
}

function errorResponse(response, status, code) {
    jsonResponse(response, status, { error: code });
}

async function readJsonBody(request) {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > 1024 * 1024) throw new Error('request_body_too_large');
        chunks.push(chunk);
    }
    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    } catch {
        throw new Error('invalid_json_body');
    }
}

export function parseRangeHeader(header, size) {
    if (!header) return null;
    const match = /^bytes=(\d*)-(\d*)$/u.exec(header.trim());
    if (!match) throw new Error('invalid_range');
    let start;
    let end;
    if (!match[1]) {
        const suffix = Number.parseInt(match[2], 10);
        if (!(suffix > 0)) throw new Error('invalid_range');
        start = Math.max(0, size - suffix);
        end = size - 1;
    } else {
        start = Number.parseInt(match[1], 10);
        end = match[2] ? Number.parseInt(match[2], 10) : size - 1;
    }
    if (start < 0 || end < start || start >= size) throw new Error('range_not_satisfiable');
    return { start, end: Math.min(end, size - 1) };
}

export function serveMedia(request, response, entry) {
    if (!entry?.available || !existsSync(entry.absolutePath)) return errorResponse(response, 404, 'media_unavailable');
    const size = statSync(entry.absolutePath).size;
    let range;
    try {
        range = parseRangeHeader(request.headers.range, size);
    } catch (error) {
        response.writeHead(error.message === 'range_not_satisfiable' ? 416 : 400, {
            'content-range': `bytes */${size}`,
            'accept-ranges': 'bytes'
        });
        return response.end();
    }
    const observe = stream => {
        if (entry.transferMetrics) {
            entry.transferMetrics.requestCount += 1;
            if (range) entry.transferMetrics.rangeRequestCount += 1;
            stream.on('data', chunk => {
                entry.transferMetrics.bytesSent += chunk.length;
                entry.transferMetrics.maxChunkBytes = Math.max(entry.transferMetrics.maxChunkBytes, chunk.length);
            });
        }
        return stream;
    };
    if (range) {
        response.writeHead(206, {
            'content-type': entry.contentType,
            'content-length': range.end - range.start + 1,
            'content-range': `bytes ${range.start}-${range.end}/${size}`,
            'accept-ranges': 'bytes',
            'cache-control': 'no-store'
        });
        if (request.method === 'HEAD') return response.end();
        const stream = observe(createReadStream(entry.absolutePath, { ...range, highWaterMark: 64 * 1024 }));
        response.once('close', () => stream.destroy());
        stream.once('error', () => response.destroy());
        return stream.pipe(response);
    }
    response.writeHead(200, {
        'content-type': entry.contentType,
        'content-length': size,
        'accept-ranges': 'bytes',
        'cache-control': 'no-store'
    });
    if (request.method === 'HEAD') return response.end();
    const stream = observe(createReadStream(entry.absolutePath, { highWaterMark: 64 * 1024 }));
    response.once('close', () => stream.destroy());
    stream.once('error', () => response.destroy());
    return stream.pipe(response);
}

async function candidateWithState(data, store, candidateId) {
    assertCandidateId(candidateId);
    const candidate = data.candidateById.get(candidateId);
    if (!candidate) return null;
    const state = await store.load(candidate.reviewTargetId);
    return {
        ...candidate,
        humanReview: state.candidates[candidateId] ?? {
            reviewRecord: candidate.initialReviewRecord,
            transcriptCorrections: {},
            reviewSegments: []
        },
        detectedOverlaps: state.overlaps.filter(overlap => overlap.candidateWindowId === candidateId)
    };
}

export async function createReviewWorkspaceServer({
    repoRoot = DEFAULT_REPO_ROOT,
    stateRoot = path.join(repoRoot, '.local/deadem/review-workspace/state'),
    exportRoot = path.join(repoRoot, '.local/deadem/review-workspace/exports'),
    host = '127.0.0.1',
    port = 4179,
    workspaceData = null,
    scrimData = null,
    scrimOnly = false,
    openFolder = openLocalFolder
} = {}) {
    if (host !== '127.0.0.1') throw new Error('review_workspace_must_bind_loopback');
    const data = workspaceData ?? await loadWorkspaceData({ repoRoot });
    const scrim = scrimData ?? loadLocalScrimData(repoRoot);
    const store = new ReviewStateStore({ root: stateRoot, workspaceData: data });
    const getScrimPresentation = async matchId => {
        const targetId = targetIdForReplayMatch(matchId);
        return buildScrimPresentation({
            workspaceData: data,
            reviewState: await store.load(targetId),
            sessions: scrim.view.vodSessions,
            matchId
        });
    };
    const server = http.createServer(async (request, response) => {
        try {
            const safeRawPath = assertSafeRequestPath((request.url ?? '/').split('?')[0]);
            const url = new URL(request.url ?? '/', 'http://127.0.0.1');
            if (safeRawPath !== url.pathname) throw new Error('unsafe_request_path');
            if (url.pathname === '/scrim' && url.search) {
                try {
                    const friendly = parseFriendlyScrimNavigation(url.search);
                    if (friendly) resolveFriendlyReplayEntry(friendly, await getScrimPresentation(friendly.matchId));
                    else resolveScrimNavigation(parseScrimNavigation(url.search), scrim.view.vodSessions);
                }
                catch (error) { return errorResponse(response, 400, error.message); }
            }
            if (url.pathname.startsWith('/scrim/media/') && url.search) return errorResponse(response, 400, 'scrim_media_query_rejected');
            if (request.method === 'GET' && url.pathname === '/api/scrim') return jsonResponse(response, 200, scrim.view);
            const scrimPresentationMatch = /^\/api\/scrim\/presentation\/(00[0-9])$/u.exec(url.pathname);
            if (request.method === 'GET' && scrimPresentationMatch) {
                return jsonResponse(response, 200, await getScrimPresentation(scrimPresentationMatch[1]));
            }
            const scrimMatch = /^\/scrim\/media\/([0-9a-f]{32})$/u.exec(url.pathname);
            if (['GET', 'HEAD'].includes(request.method) && scrimMatch) return serveMedia(request, response, scrim.registry.resolve(scrimMatch[1]));

            if (request.method === 'GET' && url.pathname === '/api/product/matches') {
                const reviewStates = Object.fromEntries(await Promise.all(TARGET_IDS.map(async targetId => [targetId, await store.load(targetId)])));
                return jsonResponse(response, 200, buildProductCatalog({
                    workspaceData: data,
                    reviewStates,
                    scrimSessions: scrim.view.vodSessions
                }));
            }
            const productMatchApi = /^\/api\/product\/matches\/([^/]+)$/u.exec(url.pathname);
            if (request.method === 'GET' && productMatchApi) {
                const matchId = assertPublicMatchId(productMatchApi[1]);
                const targetId = targetIdFromPublicMatchId(matchId);
                return jsonResponse(response, 200, buildProductMatch({
                    workspaceData: data,
                    reviewState: await store.load(targetId),
                    scrimSessions: scrim.view.vodSessions,
                    matchId
                }));
            }

            if (request.method === 'GET' && url.pathname === '/api/targets') {
                return jsonResponse(response, 200, {
                    candidateSemantics: data.candidateSemantics,
                    prioritySemantics: data.prioritySemantics,
                    targets: data.targets
                });
            }
            if (request.method === 'GET' && url.pathname === '/api/candidates') {
                const targetParam = url.searchParams.get('reviewTargetId');
                const targets = targetParam ? [assertTargetId(targetParam)] : TARGET_IDS;
                const candidates = [];
                for (const targetId of targets) {
                    const state = await store.load(targetId);
                    candidates.push(...listCandidates(data, {
                        reviewTargetId: targetId,
                        order: url.searchParams.get('order') ?? 'chronological',
                        status: url.searchParams.get('status'),
                        search: url.searchParams.get('q') ?? '',
                        reviewState: state
                    }));
                }
                return jsonResponse(response, 200, { count: candidates.length, candidates });
            }
            const candidateMatch = /^\/api\/candidates\/(review_match_00[1-4]_window_\d{4})$/u.exec(url.pathname);
            if (request.method === 'GET' && candidateMatch) {
                const candidate = await candidateWithState(data, store, candidateMatch[1]);
                return candidate ? jsonResponse(response, 200, candidate) : errorResponse(response, 404, 'candidate_not_found');
            }
            const stateMatch = /^\/api\/review-state\/(review_match_00[1-4])$/u.exec(url.pathname);
            if (stateMatch && request.method === 'GET') {
                return jsonResponse(response, 200, await store.load(stateMatch[1]));
            }
            if (stateMatch && request.method === 'PUT') {
                const body = await readJsonBody(request);
                return jsonResponse(response, 200, await store.save(stateMatch[1], body));
            }
            if (request.method === 'POST' && url.pathname === '/api/export') {
                const selection = await readJsonBody(request);
                const targetId = assertTargetId(selection.reviewTargetId);
                const reviewState = await store.load(targetId);
                const result = await writeExportPacket({ workspaceData: data, reviewState, selection, exportRoot });
                const location = resolveExportFolder(exportRoot, targetId);
                return jsonResponse(response, 200, {
                    reviewTargetId: targetId,
                    candidateCount: result.packet.candidateCount,
                    jsonPath: `.local/deadem/review-workspace/exports/${targetId}/review_packet.json`,
                    markdownPath: `.local/deadem/review-workspace/exports/${targetId}/review_packet.md`,
                    folderPath: location.folderPath,
                    relativeFolderPath: location.relativePath
                });
            }
            const exportLocationMatch = /^\/api\/export-location\/(review_match_00[1-4])$/u.exec(url.pathname);
            if (request.method === 'GET' && exportLocationMatch) {
                return jsonResponse(response, 200, resolveExportFolder(exportRoot, exportLocationMatch[1]));
            }
            if (request.method === 'POST' && url.pathname === '/api/export-folder/open') {
                const body = await readJsonBody(request);
                const location = resolveExportFolder(exportRoot, body.reviewTargetId);
                await mkdir(location.folderPath, { recursive: true });
                await openFolder(location.folderPath);
                return jsonResponse(response, 200, { ...location, opened: true });
            }
            const mediaMatch = /^\/media\/([0-9a-f]{32})$/u.exec(url.pathname);
            if (request.method === 'GET' && mediaMatch) return serveMedia(request, response, data.mediaRegistry.resolve(mediaMatch[1]));
            const productMatchPage = /^\/matches\/(00[1-4])$/u.exec(url.pathname);
            if (request.method === 'GET' && productMatchPage) {
                return serveStaticFile(response, { path: path.join(PUBLIC_DIR, 'product.html'), type: 'text/html; charset=utf-8' });
            }
            if (request.method === 'GET' && STATIC_FILES.has(url.pathname)) {
                return serveStaticFile(response, STATIC_FILES.get(url.pathname));
            }
            return errorResponse(response, 404, 'not_found');
        } catch (error) {
            const clientErrors = new Set([
                'invalid_request_path', 'unsafe_request_path', 'target_not_allowlisted', 'invalid_candidate_id',
                'invalid_candidate_order', 'invalid_review_state_filter', 'invalid_json_body', 'request_body_too_large',
                'review_state_target_mismatch', 'candidate_target_mismatch', 'candidate_not_found', 'invalid_review_state_payload',
                'invalid_review_state', 'invalid_error_class', 'call_not_in_candidate', 'invalid_transcript_classification',
                'segment_identity_mismatch', 'invalid_review_segment_id', 'review_segment_outside_candidate',
                'export_selection_empty', 'export_state_target_mismatch', 'export_candidate_not_found', 'export_segment_not_found',
                'unsafe_export_folder', 'public_match_not_allowlisted', 'invalid_public_moment', 'product_match_unavailable',
                'public_replay_match_not_allowlisted', 'invalid_public_replay_query', 'invalid_public_replay_moment',
                'public_replay_candidates_unavailable', 'public_replay_session_unavailable_or_ambiguous',
                'public_replay_session_range_invalid', 'public_replay_moment_unavailable', 'friendly_replay_target_mismatch'
            ]);
            return errorResponse(response, clientErrors.has(error.message) ? 400 : 500, error.message);
        }
    });
    server.requestTimeout = 15_000;
    server.headersTimeout = 10_000;
    return {
        server,
        data,
        store,
        async start() {
            await new Promise((resolve, reject) => {
                server.once('error', reject);
                server.listen(port, host, resolve);
            });
            const address = server.address();
            return `http://${host}:${address.port}`;
        },
        async stop() {
            if (!server.listening) return;
            await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        }
    };
}

async function main() {
    const port = Number.parseInt(process.env.REVIEW_WORKSPACE_PORT ?? '4179', 10);
    if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error('invalid_review_workspace_port');
    const workspace = await createReviewWorkspaceServer({ port, scrimOnly: process.argv.includes('--scrim-only') });
    const url = await workspace.start();
    process.stdout.write(`Local assisted review workspace: ${url}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(error => {
        process.stderr.write(`${error.stack ?? error.message}\n`);
        process.exitCode = 1;
    });
}
