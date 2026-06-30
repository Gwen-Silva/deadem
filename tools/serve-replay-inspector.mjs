#!/usr/bin/env node
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';

function parseArgs(argv) {
    const args = { dir: 'output/replay-009-inspection', port: 4173, host: '127.0.0.1' };
    for (let index = 0; index < argv.length; index += 1) {
        if (argv[index] === '--dir') args.dir = argv[++index];
        if (argv[index] === '--port') args.port = Number(argv[++index]);
        if (argv[index] === '--host') args.host = argv[++index];
    }
    return args;
}

const types = new Map([
    ['.html', 'text/html; charset=utf-8'],
    ['.js', 'text/javascript; charset=utf-8'],
    ['.css', 'text/css; charset=utf-8'],
    ['.json', 'application/json; charset=utf-8'],
    ['.md', 'text/markdown; charset=utf-8']
]);

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(args.dir);

const server = createServer(async (req, res) => {
    try {
        const urlPath = decodeURIComponent(new URL(req.url ?? '/', `http://${args.host}`).pathname);
        const safeRelative = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]/, '');
        const target = path.resolve(root, safeRelative || 'index.html');
        if (!target.startsWith(root)) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }
        const fileStat = await stat(target);
        const file = fileStat.isDirectory() ? path.join(target, 'index.html') : target;
        res.writeHead(200, { 'content-type': types.get(path.extname(file)) ?? 'application/octet-stream' });
        createReadStream(file).pipe(res);
    } catch {
        res.writeHead(404);
        res.end('Not found');
    }
});

server.listen(args.port, args.host, () => {
    console.log(`Replay inspector available at http://${args.host}:${args.port}/`);
});
