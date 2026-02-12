import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import pino from 'pino';

const logger = pino({ name: 'deepclean-repo-hygiene' });

export interface RepoStatus {
    path: string;
    name: string;
    hasUncommittedChanges: boolean;
    currentBranch: string;
    lastCommit: string;
    canFetch: boolean;
    summary: string;
}

function runGit(cwd: string, args: string): string | null {
    try {
        return execSync(`git ${args}`, { cwd, stdio: 'pipe', encoding: 'utf-8' }).trim();
    } catch {
        return null;
    }
}

export function detectGitRepos(rootDir: string): string[] {
    const repos: string[] = [];
    if (!fs.existsSync(rootDir)) return repos;

    const entries = fs.readdirSync(rootDir, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const fullPath = path.join(rootDir, entry.name);
        if (fs.existsSync(path.join(fullPath, '.git'))) {
            repos.push(fullPath);
        }
    }
    return repos;
}

export function analyzeRepo(repoPath: string): RepoStatus {
    const name = path.basename(repoPath);

    const status = runGit(repoPath, 'status --porcelain');
    const hasUncommittedChanges = status !== null && status.length > 0;

    const branch = runGit(repoPath, 'rev-parse --abbrev-ref HEAD') || 'unknown';
    const lastCommit = runGit(repoPath, 'log -1 --oneline') || 'no commits';

    const canFetch = !hasUncommittedChanges;

    let summary: string;
    if (hasUncommittedChanges) {
        summary = `⚠️ ${name}: has uncommitted changes — skipping (safe)`;
    } else {
        summary = `✅ ${name}: clean on ${branch}, last: ${lastCommit}`;
    }

    logger.info({ repo: name, branch, hasUncommittedChanges }, summary);

    return {
        path: repoPath,
        name,
        hasUncommittedChanges,
        currentBranch: branch,
        lastCommit,
        canFetch,
        summary,
    };
}

export function analyzeAllRepos(rootDir: string): RepoStatus[] {
    const repos = detectGitRepos(rootDir);
    return repos.map(analyzeRepo);
}
