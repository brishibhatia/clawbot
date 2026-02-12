import { Command } from 'commander';
import path from 'node:path';
import fs from 'node:fs';
import { generatePlan, executePlan, buildManifest, createProofBundle, getFileTree } from '@deepclean/core';
import { loadConfig } from '../config.js';

export const runCommand = new Command('run')
    .description('Execute a cleanup run and generate a proof bundle')
    .option('-p, --path <dir>', 'Target directory to clean')
    .option('--policy <path>', 'Path to policy.json')
    .option('--config <path>', 'Path to deepclean.config.json')
    .option('--dry-run', 'Analyze only, do not execute actions')
    .action(async (opts) => {
        const config = loadConfig(opts.config);
        const rootPath = opts.path || config.roots[0] || '.deepclean-demo';
        const resolvedRoot = path.resolve(rootPath);
        const dryRun = opts.dryRun ?? false;

        console.log(`🧹 DeepClean — ${dryRun ? 'Dry Run' : 'Executing cleanup'}...`);
        console.log(`   Root: ${resolvedRoot}`);
        console.log('');

        // Capture file tree before
        const fileTreeBefore = getFileTree(resolvedRoot);

        // Generate plan
        const plan = generatePlan(resolvedRoot, config, opts.policy, dryRun);
        console.log(`📋 Plan: ${plan.actions.length} actions across ${plan.fileCount} files`);
        console.log(`   Run ID: ${plan.runId}`);

        // Ensure quarantine / staging dirs exist
        if (!dryRun) {
            for (const dir of [config.quarantineDir, config.stagingDir, config.proofsDir]) {
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            }
        }

        // Execute
        const results = await executePlan(plan);
        const succeeded = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        console.log(`\n✅ Executed: ${succeeded} succeeded, ${failed} failed`);

        // Capture file tree after
        const fileTreeAfter = getFileTree(resolvedRoot);

        // Build proof bundle
        const logOutput = results
            .map(r => `[${r.type}] ${r.sourcePath} → ${r.success ? 'OK' : `FAIL: ${r.error}`}`)
            .join('\n');

        const manifest = buildManifest(plan, results, resolvedRoot, fileTreeBefore, fileTreeAfter);
        const bundle = await createProofBundle(manifest, config, logOutput);

        console.log(`\n📦 Proof bundle created:`);
        console.log(`   ZIP:    ${bundle.zipPath}`);
        console.log(`   SHA256: ${bundle.sha256}`);
        console.log(`   Run ID: ${plan.runId}`);
        console.log('');
        console.log(`Next: deepclean-cli prove --run ${plan.runId}`);
    });
