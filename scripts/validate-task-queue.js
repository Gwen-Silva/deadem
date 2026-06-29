import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const TASK_ROOT = path.join(ROOT, 'tasks');
const TASK_DIRS = [ 'pending', 'active', 'completed', 'blocked', 'backlog' ];
const ALLOWED_STATUSES = new Set(TASK_DIRS);

const errors = [];
const tasks = [];

function readTaskFiles(dirName) {
    const dir = path.join(TASK_ROOT, dirName);
    if (!fs.existsSync(dir)) {
        errors.push(`missing task directory: tasks/${dirName}`);
        return;
    }

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isFile() || entry.name === '.gitkeep' || entry.name === 'INDEX.md') {
            continue;
        }

        if (!entry.name.endsWith('.md')) {
            errors.push(`unexpected file in tasks/${dirName}: ${entry.name}`);
            continue;
        }

        const idMatch = entry.name.match(/^(\d{3})-.+\.md$/);
        if (!idMatch) {
            errors.push(`task filename does not start with a three-digit ID: tasks/${dirName}/${entry.name}`);
            continue;
        }

        const filePath = path.join(dir, entry.name);
        const text = fs.readFileSync(filePath, 'utf8');
        tasks.push({
            dirName,
            fileName: entry.name,
            id: idMatch[1],
            path: filePath,
            text,
            status: readMetadata(text, 'Status'),
            executionMode: readMetadata(text, 'Execution mode'),
            unlockedBy: readMetadata(text, 'Unlocked by')
        });
    }
}

function readMetadata(text, label) {
    const match = text.match(new RegExp(`^${escapeRegExp(label)}:\\s*(.+?)\\s*$`, 'im'));
    return match?.[1]?.trim() ?? '';
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sectionHasContent(text, heading) {
    const lines = text.split(/\r?\n/);
    const headingLine = `## ${heading}`;
    const start = lines.findIndex((line) => line.trim() === headingLine);
    if (start === -1) {
        return false;
    }

    const content = [];
    for (let index = start + 1; index < lines.length; index += 1) {
        if (lines[index].startsWith('## ')) {
            break;
        }
        content.push(lines[index]);
    }

    return Boolean(content.join('\n').trim());
}

for (const dirName of TASK_DIRS) {
    readTaskFiles(dirName);
}

const ids = new Map();

for (const task of tasks) {
    const previous = ids.get(task.id);
    if (previous) {
        errors.push(`duplicate task ID ${task.id}: tasks/${previous.dirName}/${previous.fileName} and tasks/${task.dirName}/${task.fileName}`);
    } else {
        ids.set(task.id, task);
    }

    if (!ALLOWED_STATUSES.has(task.status)) {
        errors.push(`invalid status in tasks/${task.dirName}/${task.fileName}: ${task.status || '<missing>'}`);
    }

    if (task.status && task.status !== task.dirName) {
        errors.push(`task location does not match status: tasks/${task.dirName}/${task.fileName} has Status: ${task.status}`);
    }

    if (task.dirName === 'pending') {
        if (task.executionMode.toLowerCase() === 'human') {
            errors.push(`human task is in pending: ${task.fileName}`);
        }

        for (const heading of [ 'Objective', 'Acceptance criteria', 'Required validation', 'Stop conditions' ]) {
            if (!sectionHasContent(task.text, heading)) {
                errors.push(`pending task missing non-empty section "${heading}": ${task.fileName}`);
            }
        }

        if (!task.executionMode) {
            errors.push(`pending task missing execution mode: ${task.fileName}`);
        }
    }

    if (task.dirName === 'blocked' && !task.unlockedBy) {
        errors.push(`blocked task missing unlock gate: ${task.fileName}`);
    }

    if (task.dirName === 'backlog') {
        if (task.status !== 'backlog') {
            errors.push(`backlog task has executable status: ${task.fileName}`);
        }

        if (!sectionHasContent(task.text, 'Not executable because')) {
            errors.push(`backlog task missing reason it is not executable: ${task.fileName}`);
        }
    }
}

const pendingTasks = tasks.filter((task) => task.dirName === 'pending');
const activeTasks = tasks.filter((task) => task.dirName === 'active');
const blockedTasks = tasks.filter((task) => task.dirName === 'blocked');
const backlogTasks = tasks.filter((task) => task.dirName === 'backlog');
const humanPending = pendingTasks.filter((task) => task.executionMode.toLowerCase() === 'human');

if (activeTasks.length > 1) {
    errors.push(`only one task may be active, found ${activeTasks.length}`);
}

if (errors.length > 0) {
    console.error('Task queue validation failed');
    for (const error of errors) {
        console.error(`- ${error}`);
    }
    process.exitCode = 1;
} else {
    console.log('Task queue validation passed');
}

const pendingNames = pendingTasks.map((task) => task.fileName).sort();
console.log(`pending tasks: ${pendingTasks.length}`);
if (pendingNames.length > 0) {
    for (const pendingName of pendingNames) {
        console.log(`pending task: ${pendingName}`);
    }
} else {
    console.log('pending task: none');
}
console.log(`human tasks in pending: ${humanPending.length}`);
console.log(`active tasks: ${activeTasks.length}`);
console.log(`blocked tasks: ${blockedTasks.length}`);
console.log(`backlog tasks: ${backlogTasks.length}`);
