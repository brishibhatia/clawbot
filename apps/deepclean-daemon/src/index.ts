import fs from 'node:fs';
import path from 'node:path';
import pino from 'pino';
import { generatePlan, executePlan, buildManifest, createProofBundle, getFileTree } from '@deepclean/core';
import type { DeepCleanConfig } from '@deepclean/core';
import { startWatcher } from './watcher.js';
import { startScheduler } from './scheduler.js';

const logger = pino({
    name: 'deepclean-daemon',
    transport: { target: 'pino-pretty' },
});

function loadConfig(): DeepCleanConfig {
    const configPath = path.resolve('deepclean.config.json');
    if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
    return {
        roots: ['.deepclean-demo'],
        quarantineDir: '.deepclean-quarantine',
        stagingDir: '.deepclean-staging',
        proofsDir: '.deepclean-proofs',
        schedule: '*/30 * * * *',
        maxCpuPercent: 50,
        allowedActions: ['classify', 'dedupe', 'rename', 'quarantine', 'unzip'],
        dryRunByDefault: true,
    };
}

async function performCleanup(config: DeepCleanConfig) {
    for (const root of config.roots) {
        const resolvedRoot = path.resolve(root);
        if (!fs.existsSync(resolvedRoot)) continue;

        logger.info({ root: resolvedRoot }, 'Running cleanup');

        const fileTreeBefore = getFileTree(resolvedRoot);
        const plan = generatePlan(resolvedRoot, config, undefined, config.dryRunByDefault);
        const results = await executePlan(plan);
        const fileTreeAfter = getFileTree(resolvedRoot);

        const logOutput = results
            .map(r => `[${r.type}] ${r.sourcePath} → ${r.success ? 'OK' : `FAIL: ${r.error}`}`)
            .join('\n');

        const manifest = buildManifest(plan, results, resolvedRoot, fileTreeBefore, fileTreeAfter);
        await createProofBundle(manifest, config, logOutput);

        logger.info({ runId: plan.runId, actions: results.length }, 'Cleanup complete');
    }
}

// ── Main ──────────────────────────────────────────────────────
const config = loadConfig();

logger.info('🧹 DeepClean Daemon starting...');
logger.info({ roots: config.roots, schedule: config.schedule }, 'Configuration loaded');

// Ensure directories exist
for (const dir of [config.quarantineDir, config.stagingDir, config.proofsDir]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Start watcher — triggers cleanup on new files
let debounceTimer: NodeJS.Timeout | null = null;
startWatcher(config, {
    onFileAdded: (_filePath) => {
        // Debounce: wait for 5 seconds of quiet before running cleanup
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            performCleanup(config).catch(err => logger.error({ err }, 'Cleanup failed'));
        }, 5000);
    },
    onFileChanged: () => { },
    onFileRemoved: () => { },
});

// Start scheduler for periodic cleanups
startScheduler(config, [
    {
        name: 'periodic-cleanup',
        intervalMs: 0, // use default from config.schedule
        execute: () => performCleanup(config),
    },
]);

logger.info('✅ Daemon running. Press Ctrl+C to stop.');

// Graceful shutdown
process.on('SIGINT', () => {
    logger.info('Shutting down...');
    process.exit(0);
});
process.on('SIGTERM', () => {
    logger.info('Shutting down...');
    process.exit(0);
});
