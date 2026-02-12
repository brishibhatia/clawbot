import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../config.js';

export const restoreCommand = new Command('restore')
    .description('Restore files from quarantine back to their original location')
    .option('--file <path>', 'Specific file to restore (relative to quarantine dir)')
    .option('--all', 'Restore all quarantined files')
    .option('--config <path>', 'Path to deepclean.config.json')
    .action(async (opts) => {
        const config = loadConfig(opts.config);
        const quarantineDir = path.resolve(config.quarantineDir);

        if (!fs.existsSync(quarantineDir)) {
            console.log('✨ No quarantined files found.');
            return;
        }

        console.log('♻️  DeepClean — Restore from Quarantine');
        console.log(`   Quarantine dir: ${quarantineDir}`);
        console.log('');

        if (opts.file) {
            const fullPath = path.join(quarantineDir, opts.file);
            if (!fs.existsSync(fullPath)) {
                console.error(`❌ File not found in quarantine: ${opts.file}`);
                process.exit(1);
            }

            // Restore to original location: quarantine mirrors the original structure
            const roots = config.roots;
            const targetDir = roots[0] || '.';
            const targetPath = path.join(targetDir, opts.file);

            const targetParent = path.dirname(targetPath);
            if (!fs.existsSync(targetParent)) {
                fs.mkdirSync(targetParent, { recursive: true });
            }

            fs.copyFileSync(fullPath, targetPath);
            fs.unlinkSync(fullPath);
            console.log(`✅ Restored: ${opts.file} → ${targetPath}`);

        } else if (opts.all) {
            const files = collectQuarantinedFiles(quarantineDir);
            if (files.length === 0) {
                console.log('✨ No quarantined files to restore.');
                return;
            }

            const roots = config.roots;
            const targetDir = roots[0] || '.';
            let restored = 0;

            for (const relPath of files) {
                const src = path.join(quarantineDir, relPath);
                const dest = path.join(targetDir, relPath);

                const destParent = path.dirname(dest);
                if (!fs.existsSync(destParent)) {
                    fs.mkdirSync(destParent, { recursive: true });
                }

                fs.copyFileSync(src, dest);
                fs.unlinkSync(src);
                console.log(`  ✅ ${relPath}`);
                restored++;
            }
            console.log(`\nRestored ${restored} files.`);

        } else {
            // List quarantined files
            const files = collectQuarantinedFiles(quarantineDir);
            if (files.length === 0) {
                console.log('✨ No quarantined files.');
                return;
            }

            console.log('Quarantined files:');
            for (const f of files) {
                const stat = fs.statSync(path.join(quarantineDir, f));
                console.log(`  🔒 ${f} (${(stat.size / 1024).toFixed(1)} KB)`);
            }
            console.log(`\nUse --file <path> or --all to restore.`);
        }
    });

function collectQuarantinedFiles(dir: string, base: string = ''): string[] {
    const results: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const rel = path.join(base, entry.name);
        if (entry.isDirectory()) {
            results.push(...collectQuarantinedFiles(path.join(dir, entry.name), rel));
        } else {
            results.push(rel);
        }
    }
    return results;
}
