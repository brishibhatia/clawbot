import { Command } from 'commander';
import path from 'node:path';
import { generatePlan } from '@deepclean/core';
import { loadConfig } from '../config.js';

export const planCommand = new Command('plan')
    .description('Generate a dry-run cleanup plan (no files are modified)')
    .option('-p, --path <dir>', 'Target directory to scan')
    .option('--policy <path>', 'Path to policy.json')
    .option('--config <path>', 'Path to deepclean.config.json')
    .action(async (opts) => {
        const config = loadConfig(opts.config);
        const rootPath = opts.path || config.roots[0] || '.deepclean-demo';
        const resolvedRoot = path.resolve(rootPath);

        console.log('🔍 DeepClean — Generating cleanup plan...');
        console.log(`   Root:   ${resolvedRoot}`);
        console.log(`   Policy: ${opts.policy || 'default'}`);
        console.log('');

        const plan = generatePlan(resolvedRoot, config, opts.policy, true);

        console.log(`📋 Plan: ${plan.actions.length} actions across ${plan.fileCount} files`);
        console.log(`   Run ID:  ${plan.runId}`);
        console.log(`   Policy:  v${plan.policyVersion} (${plan.policyHash.slice(0, 12)}…)`);
        console.log('');

        if (plan.actions.length === 0) {
            console.log('✨ Workspace is already clean!');
            return;
        }

        for (const action of plan.actions) {
            const icon = action.type === 'quarantine' ? '🔒'
                : action.type === 'dedupe' ? '🔗'
                    : action.type === 'rename' ? '📝'
                        : action.type === 'unzip' ? '📦'
                            : '⚡';
            console.log(`  ${icon} [${action.type.toUpperCase()}] ${action.fileInfo.relativePath}`);
            console.log(`     → ${action.reason}`);
        }

        console.log('');
        console.log('ℹ️  This is a DRY RUN. No files were modified.');
        console.log('   Run `deepclean-cli run --path <dir>` to execute.');
    });
