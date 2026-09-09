// Explicit post-remediation epoch instrumentation, loaded before reviewed tests.
// Not a security sandbox: it audits public Node filesystem entry points and
// combines with reviewed callers, lexical filtering and Git-only inventories.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import { assertUnprotectedName } from './hygiene-paths.mjs';

const epoch = process.env.TASK222_VALIDATION_EPOCH;
if (epoch) {
    if (!/^post-remediation-[a-z0-9-]+$/u.test(epoch)) throw new Error('invalid_epoch_name');
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const dir = path.join(root, '.local/codex/222', epoch);
    const write = fs.writeFileSync.bind(fs);
    const audit = { epoch, pid: process.pid, operations: {}, violations: [], realMediaContentReadCount: 0, protectedAccessCount: 0, syntheticFixtureMediaOperations: 0 };
    const content = /^(?:open|readFile|createReadStream|writeFile|appendFile|copyFile|cp)/u;
    const media = /\.(?:dem|mp4|mkv|webm|mov|wav|aac|mp3|flac|ogg|jpg|jpeg|png|webp)$/iu;
    function inspect(value, operation) {
        if (typeof value === 'number' || value == null) return;
        const text = value instanceof URL ? fileURLToPath(value) : Buffer.isBuffer(value) ? value.toString() : typeof value === 'string' ? value : null;
        if (text === null) return;
        let reason;
        try { assertUnprotectedName(text); } catch { reason = 'protected_or_ambiguous_path_before_io'; }
        const absolute = path.resolve(text);
        const relative = path.relative(root, absolute).replaceAll('\\','/');
        if (/^readdir/u.test(operation) && ['.local','.local/deadem','.local/codex'].includes(relative)) reason = 'broad_local_enumeration_forbidden';
        if (content.test(operation) && media.test(text)) {
            // Existing intake contract tests create bytes from syntheticReplay /
            // syntheticMp4 in fresh task218-* temp directories only.
            const tempRelative = path.relative(os.tmpdir(), absolute).replaceAll('\\','/');
            if (/^task218-[^/]+\//u.test(tempRelative)) audit.syntheticFixtureMediaOperations++;
            else reason = 'real_media_content_io_forbidden';
        }
        if (reason) {
            audit.violations.push({ operation, path: text, reason });
            throw new Error(`TASK222_EPOCH_BOUNDARY: ${reason}`);
        }
        audit.operations[operation] = (audit.operations[operation] ?? 0) + 1;
    }
    function patch(object, name, secondary = false) {
        const original = object[name];
        if (typeof original !== 'function') return;
        const wrapped = function (...args) { inspect(args[0], name); if (secondary) inspect(args[1], name); return Reflect.apply(original, this, args); };
        Object.assign(wrapped, original);
        if (typeof original.native === 'function') wrapped.native = function(...args) { inspect(args[0], name+'.native'); return original.native(...args); };
        object[name] = wrapped;
    }
    for (const name of ['stat','lstat','realpath','access','exists','open','readFile','writeFile','appendFile','readdir','opendir','unlink','rm','rmdir','mkdir','mkdtemp','readlink','truncate','chmod','chown','utimes']) {
        patch(fs,name); patch(fs,name+'Sync'); patch(fsp,name);
    }
    for (const name of ['copyFile','cp','rename','link','symlink']) { patch(fs,name,true);patch(fs,name+'Sync',true);patch(fsp,name,true); }
    patch(fs,'createReadStream');patch(fs,'createWriteStream');
    syncBuiltinESMExports();
    process.on('exit', () => {
        if (audit.violations.length) process.exitCode = 1;
        write(path.join(dir, `io-${process.pid}-${Date.now()}.json`),JSON.stringify(audit,null,2)+'\n',{flag:'wx'});
    });
}
