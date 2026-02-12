import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { classifyFile, isSuspicious, shouldSkip } from './classifier.js';
import { loadPolicy, computePolicyHash, isActionAllowed } from './policy-engine.js';
import type { ActionPlan, PlannedAction, FileInfo, DeepCleanConfig, ActionType } from './types.js';

export function computeFileHash(filePath: string): string {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
}

import fg from 'fast-glob';

function collectFiles(dir: string, skipPatterns: string[]): string[] {
    if (!fs.existsSync(dir)) return [];

    // Ensure ignore patterns match fast-glob expectations (forward slashes)
    const ignore = (skipPatterns ?? []).map(p => p.replace(/\\/g, '/'));

    // Always exclude .git and node_modules explicitly
    ignore.push('**/.git/**', '**/node_modules/**');

    const cwd = path.resolve(dir);

    // fast-glob returns forward-slash paths relative to cwd
    const relPaths = fg.globSync(['**/*'], {
        cwd,
        ignore,
        onlyFiles: true,
        dot: true,
        followSymbolicLinks: false,
        absolute: false,
    });

    // Convert back to absolute system paths
    return relPaths.map(p => path.join(cwd, p));
}

export function buildFileInfo(filePath: string, rootPath: string, maxExeMB: number): FileInfo {
    const stat = fs.statSync(filePath);
    const category = classifyFile(filePath);
    const suspicion = isSuspicious(filePath, stat.size, maxExeMB);
    const sha256 = computeFileHash(filePath);

    return {
        path: filePath,
        relativePath: path.relative(rootPath, filePath),
        size: stat.size,
        mtime: stat.mtime,
        sha256,
        category,
        suspicious: suspicion.suspicious,
        suspiciousReason: suspicion.reason,
    };
}

export function generatePlan(
    rootPath: string,
    config: DeepCleanConfig,
    policyPath?: string,
    dryRun: boolean = true
): ActionPlan {
    const policy = loadPolicy(policyPath);
    const policyHash = computePolicyHash(policy);
    const runId = randomUUID();
    const files = collectFiles(rootPath, policy.rules.skipPatterns);
    const actions: PlannedAction[] = [];
    const seenHashes = new Map<string, string>(); // hash -> first file path

    for (const filePath of files) {
        const fileInfo = buildFileInfo(filePath, rootPath, policy.rules.quarantineLargeExecutablesMB);

        // Suspicious → quarantine
        if (fileInfo.suspicious) {
            if (isActionAllowed('quarantine', config.allowedActions)) {
                actions.push({
                    id: randomUUID(),
                    type: 'quarantine',
                    sourcePath: filePath,
                    targetPath: path.join(config.quarantineDir, fileInfo.relativePath),
                    reason: fileInfo.suspiciousReason || 'Suspicious file',
                    fileInfo,
                });
            }
            continue;
        }

        // Dedupe by content hash
        if (policy.rules.dedupeByContentHash && isActionAllowed('dedupe', config.allowedActions)) {
            const existing = seenHashes.get(fileInfo.sha256);
            if (existing) {
                actions.push({
                    id: randomUUID(),
                    type: 'dedupe',
                    sourcePath: filePath,
                    targetPath: path.join(config.quarantineDir, 'dupes', fileInfo.relativePath),
                    reason: `Duplicate of ${path.basename(existing)}`,
                    fileInfo,
                });
                continue;
            }
            seenHashes.set(fileInfo.sha256, filePath);
        }

        // Auto-unzip archives
        if (fileInfo.category === 'archive' && policy.rules.autoUnzipArchives && isActionAllowed('unzip', config.allowedActions)) {
            const baseName = path.basename(filePath, path.extname(filePath));
            actions.push({
                id: randomUUID(),
                type: 'unzip',
                sourcePath: filePath,
                targetPath: path.join(config.stagingDir, baseName),
                reason: 'Archive file — auto-unzip to staging',
                fileInfo,
            });
        }

        // Rename with date prefix
        if (policy.rules.renameWithDatePrefix && isActionAllowed('rename', config.allowedActions)) {
            const datePrefix = fileInfo.mtime.toISOString().slice(0, 10);
            const baseName = path.basename(filePath);
            const sanitized = baseName.replace(/[^a-zA-Z0-9._-]/g, '_');
            const newName = `${datePrefix}_${sanitized}`;
            if (newName !== baseName) {
                actions.push({
                    id: randomUUID(),
                    type: 'rename',
                    sourcePath: filePath,
                    targetPath: path.join(path.dirname(filePath), newName),
                    reason: `Rename with date prefix: ${newName}`,
                    fileInfo,
                });
            }
        }
    }

    const summary = `Plan: ${actions.length} actions across ${files.length} files in ${rootPath}`;

    return {
        runId,
        timestamp: new Date().toISOString(),
        policyVersion: policy.version,
        policyHash,
        rootPath: path.resolve(rootPath),
        dryRun,
        actions,
        fileCount: files.length,
        summary,
    };
}

export function getFileTree(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    const files = collectFiles(dir, []);
    return files.map(f => path.relative(dir, f)).sort();
}
