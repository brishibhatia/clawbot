import fs from 'node:fs';
import path from 'node:path';
import * as tar from 'tar';
import AdmZip from 'adm-zip';
import { computeFileHash } from './planner.js';
import type { ActionPlan, ActionResult } from './types.js';
import pino from 'pino';

const logger = pino({ name: 'deepclean-executor' });

function ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function moveFile(src: string, dest: string): void {
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
    fs.unlinkSync(src);
    logger.info({ src, dest }, 'Moved file');
}

function archiveStem(filePath: string) {
    const name = path.basename(filePath);
    return name
        .replace(/\.tar\.gz$/i, '')
        .replace(/\.tgz$/i, '')
        .replace(/\.zip$/i, '');
}

async function unzipFile(src: string, stagingDir: string): Promise<string> {
    const destDir = path.join(stagingDir, archiveStem(src));
    ensureDir(destDir);

    try {
        const lower = src.toLowerCase();
        if (lower.endsWith('.zip')) {
            const zip = new AdmZip(src);
            zip.extractAllTo(destDir, true); // overwrite=true
        } else if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) {
            // tar.x is tar.extract; it auto-detects gzip archives and needs cwd to exist
            await tar.x({ file: src, cwd: destDir });
        } else {
            throw new Error(`Unsupported archive type: ${src}`);
        }
        logger.info({ src, destDir }, 'Unzipped archive');
        return destDir;
    } catch (err) {
        logger.error({ src, err }, 'Failed to unzip');
        throw err;
    }
}

export async function executePlan(plan: ActionPlan): Promise<ActionResult[]> {
    const results: ActionResult[] = [];

    if (plan.dryRun) {
        logger.info('DRY RUN — no actions will be executed');
        for (const action of plan.actions) {
            results.push({
                actionId: action.id,
                type: action.type,
                success: true,
                sourcePath: action.sourcePath,
                targetPath: action.targetPath,
                reason: `[DRY RUN] ${action.reason}`,
            });
        }
        return results;
    }

    for (const action of plan.actions) {
        try {
            const beforeMeta = fs.existsSync(action.sourcePath) && fs.statSync(action.sourcePath).isFile()
                ? {
                    size: fs.statSync(action.sourcePath).size,
                    mtime: fs.statSync(action.sourcePath).mtime.toISOString(),
                    sha256: computeFileHash(action.sourcePath),
                }
                : undefined;

            let finalPath = action.targetPath || action.sourcePath;

            switch (action.type) {
                case 'quarantine':
                case 'dedupe':
                    if (action.targetPath) {
                        moveFile(action.sourcePath, action.targetPath);
                    }
                    break;

                case 'rename':
                    if (action.targetPath) {
                        fs.renameSync(action.sourcePath, action.targetPath);
                        logger.info({ from: action.sourcePath, to: action.targetPath }, 'Renamed file');
                    }
                    break;

                case 'unzip':
                    if (action.targetPath) {
                        // For unzip, targetPath is the staging dir parent, but we extract into a subdir
                        // Actually, looking at planner.ts, targetPath IS the destination dir (staging/filename_stem)
                        // But let's use the logic we just added to be safe or just pass targetPath directly?
                        // Planner says: targetPath = path.join(config.stagingDir, baseName)

                        // Let's use our helper which derives the folder name, or trust the planner's targetPath?
                        // Planner passes a targetPath that includes the folder name.
                        // Our util derives it from src. Let's trust targetPath from planner if it's mostly correct,
                        // but `unzipFile` above logic re-derives it. 

                        // Adaptation: The user's snippet suggested:
                        // unzipArchive(action.sourcePath, config.stagingDir)
                        // But the executor receives `targetPath`. simpler to just extract TO `targetPath`.

                        // Modified logic:
                        ensureDir(action.targetPath);
                        const lower = action.sourcePath.toLowerCase();
                        if (lower.endsWith('.zip')) {
                            const zip = new AdmZip(action.sourcePath);
                            zip.extractAllTo(action.targetPath, true);
                        } else if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) {
                            await tar.x({ file: action.sourcePath, cwd: action.targetPath });
                        }
                        logger.info({ src: action.sourcePath, dest: action.targetPath }, 'Unzipped archive');
                    }
                    break;

                case 'skip':
                case 'report':
                    break;
            }

            // Check if finalPath is a directory (e.g. unzip destination)
            const isDir = fs.existsSync(finalPath) && fs.statSync(finalPath).isDirectory();

            const afterMeta = fs.existsSync(finalPath) && !isDir
                ? {
                    size: fs.statSync(finalPath).size,
                    mtime: fs.statSync(finalPath).mtime.toISOString(),
                    sha256: computeFileHash(finalPath),
                }
                : undefined;

            results.push({
                actionId: action.id,
                type: action.type,
                success: true,
                sourcePath: action.sourcePath,
                targetPath: action.targetPath,
                reason: action.reason,
                beforeMeta,
                afterMeta,
            });
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            logger.error({ action, err: errorMsg }, 'Action failed');
            results.push({
                actionId: action.id,
                type: action.type,
                success: false,
                sourcePath: action.sourcePath,
                targetPath: action.targetPath,
                reason: action.reason,
                error: errorMsg,
            });
        }
    }

    return results;
}
