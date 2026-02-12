import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../config.js';

export const statusCommand = new Command('status')
    .description('Show status of recent DeepClean runs')
    .option('--config <path>', 'Path to deepclean.config.json')
    .action(async (opts) => {
        const config = loadConfig(opts.config);
        const proofsDir = config.proofsDir;

        console.log('📊 DeepClean — Recent Runs');
        console.log(`   Proofs dir: ${path.resolve(proofsDir)}`);
        console.log('');

        if (!fs.existsSync(proofsDir)) {
            console.log('   No runs found. Run `deepclean-cli run` first.');
            return;
        }

        const manifests = fs.readdirSync(proofsDir)
            .filter(f => f.endsWith('-manifest.json'))
            .sort()
            .reverse()
            .slice(0, 10);

        if (manifests.length === 0) {
            console.log('   No runs found.');
            return;
        }

        for (const file of manifests) {
            try {
                const manifest = JSON.parse(fs.readFileSync(path.join(proofsDir, file), 'utf-8'));
                const date = new Date(manifest.startTimestamp).toLocaleString();
                console.log(`  📦 ${manifest.runId}`);
                console.log(`     Date:    ${date}`);
                console.log(`     Actions: ${manifest.executedActions?.length ?? 0}`);
                console.log(`     SHA256:  ${manifest.bundleSha256?.slice(0, 16)}…`);
                console.log(`     Summary: ${manifest.summary}`);
                console.log('');
            } catch {
                // Skip malformed manifests
            }
        }
    });
