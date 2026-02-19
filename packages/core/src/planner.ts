import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { classifyFile, classifyFileWithAI, isSuspicious, shouldSkip } from './classifier.js';
import { loadPolicy, computePolicyHash, isActionAllowed } from './policy-engine.js';
import type { ActionPlan, PlannedAction, ActionItem, FileInfo, DeepCleanConfig, ActionType } from './types.js';

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

export async function buildFileInfo(filePath: string, rootPath: string, maxExeMB: number): Promise<FileInfo & { semantic?: { category: string; summary?: string } }> {
    const stat = fs.statSync(filePath);

    // Use AI classification
    const aiResult = await classifyFileWithAI(filePath);

    // If AI gave a specific category, prefer it? Or stick to file extension base category?
    // Let's keep base category for mechanical rules (e.g. unzip archives)
    // But verify suspicion based on extension still.
    const baseCategory = classifyFile(filePath);

    const suspicion = isSuspicious(filePath, stat.size, maxExeMB);
    const sha256 = computeFileHash(filePath);

    return {
        path: filePath,
        relativePath: path.relative(rootPath, filePath),
        size: stat.size,
        mtime: stat.mtime,
        sha256,
        category: baseCategory,
        suspicious: suspicion.suspicious,
        suspiciousReason: suspicion.reason,
        semantic: {
            category: aiResult.category,
            summary: aiResult.summary
        }
    };
}

export async function generatePlan(
    rootPath: string,
    config: DeepCleanConfig,
    policyPath?: string,
    dryRun: boolean = true
): Promise<ActionPlan> {
    const policy = loadPolicy(policyPath);
    const policyHash = computePolicyHash(policy);
    const runId = randomUUID();
    const files = collectFiles(rootPath, policy.rules.skipPatterns);
    const actions: PlannedAction[] = [];
    const seenHashes = new Map<string, string>(); // hash -> first file path

    for (const filePath of files) {
        // Rate limit: Sleep 2s to respect Gemini free tier (approx 15 RPM, but error says 5 RPM?)
        await new Promise(resolve => setTimeout(resolve, 2000));

        const fileInfo = await buildFileInfo(filePath, rootPath, policy.rules.quarantineLargeExecutablesMB);

        const actionBase: Partial<PlannedAction> = {
            id: randomUUID(),
            fileInfo,
            semanticCategory: fileInfo.semantic?.category,
            summary: fileInfo.semantic?.summary
        };

        // Suspicious → quarantine
        if (fileInfo.suspicious) {
            if (isActionAllowed('quarantine', config.allowedActions)) {
                actions.push({
                    ...actionBase,
                    type: 'quarantine',
                    sourcePath: filePath,
                    targetPath: path.join(config.quarantineDir, fileInfo.relativePath),
                    reason: fileInfo.suspiciousReason || 'Suspicious file',
                } as PlannedAction);
            }
            continue;
        }

        // Dedupe by content hash
        if (policy.rules.dedupeByContentHash && isActionAllowed('dedupe', config.allowedActions)) {
            const existing = seenHashes.get(fileInfo.sha256);
            if (existing) {
                actions.push({
                    ...actionBase,
                    type: 'dedupe',
                    sourcePath: filePath,
                    targetPath: path.join(config.quarantineDir, 'dupes', fileInfo.relativePath),
                    reason: `Duplicate of ${path.basename(existing)}`,
                } as PlannedAction);
                continue;
            }
            seenHashes.set(fileInfo.sha256, filePath);
        }

        // Auto-unzip archives
        if (fileInfo.category === 'archive' && policy.rules.autoUnzipArchives && isActionAllowed('unzip', config.allowedActions)) {
            const baseName = path.basename(filePath, path.extname(filePath));
            actions.push({
                ...actionBase,
                type: 'unzip',
                sourcePath: filePath,
                targetPath: path.join(config.stagingDir, baseName),
                reason: 'Archive file — auto-unzip to staging',
            } as PlannedAction);
        }

        // Rename with date prefix
        if (policy.rules.renameWithDatePrefix && isActionAllowed('rename', config.allowedActions)) {
            const datePrefix = fileInfo.mtime.toISOString().slice(0, 10);
            const baseName = path.basename(filePath);
            const sanitized = baseName.replace(/[^a-zA-Z0-9._-]/g, '_');

            // Idempotency: If already prefixed with ANY date (YYYY-MM-DD_), skip
            if (/^\d{4}-\d{2}-\d{2}_/.test(baseName)) {
                // Already processed
            } else {
                const newName = `${datePrefix}_${sanitized}`;
                if (newName !== baseName) {
                    actions.push({
                        ...actionBase,
                        type: 'rename',
                        sourcePath: filePath,
                        targetPath: path.join(path.dirname(filePath), newName),
                        reason: `Rename with date prefix: ${newName}`,
                    } as PlannedAction);
                }
            }
        }
    }

    // Classify action for pure Semantic logging if no other action taken?
    // For now, only semantic info attached to other actions.
    // Ideally we should have a 'classify' action if we just want to log what it is.
    // But let's stick to existing actions + metadata for now.

    const summary = `Plan: ${actions.length} actions across ${files.length} files in ${rootPath}`;

    // Deterministic plan hash: sha256 of canonical JSON (sorted keys) of actions
    // We only hash the actions array to detect duplicate *intent*
    const canonicalPlan = JSON.stringify(actions, Object.keys(actions).sort());
    const planHash = crypto.createHash('sha256').update(canonicalPlan).digest('hex');

    return {
        runId,
        timestamp: new Date().toISOString(),
        policyVersion: policy.version,
        policyHash,
        planHash,
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
