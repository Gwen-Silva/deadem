// Historical governance fixture. Never overwrite live coordination state to
// make a historical contract test pass.
export function task191State(template) {
    return {
        ...structuredClone(template), lastAcceptedTaskId: '190',
        lastAcceptedCommit: '13a3da64bcf0ba839a752038f07f40e3eeeed890',
        activeBaseCommit: '13a3da64bcf0ba839a752038f07f40e3eeeed890',
        activeTaskId: '191', branch: 'task191-correction', status: 'VALIDATING',
        candidateCommit: null,
        candidateResolution: { strategy: 'git_head_exactly_one_commit_from_active_base', requiredCommitCount: 1, branch: 'task191-correction', reviewArtifact: '.local/codex/191/post-commit-attestation.json' },
        completedTasks: ['190'], pendingTasks: ['191'],
        rejectedCommits: ['bf5cdaaa20c41b73523b53ea2855ca41c6223653']
    };
}
