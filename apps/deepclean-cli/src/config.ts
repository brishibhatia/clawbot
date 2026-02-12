import fs from 'node:fs';
import path from 'node:path';
import type { DeepCleanConfig } from '@deepclean/core';

const DEFAULT_CONFIG_NAME = 'deepclean.config.json';

export function loadConfig(configPath?: string): DeepCleanConfig {
    const tryPath = configPath || findConfigUp(process.cwd());
    if (tryPath && fs.existsSync(tryPath)) {
        return JSON.parse(fs.readFileSync(tryPath, 'utf-8'));
    }
    // Sane defaults
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

function findConfigUp(dir: string): string | null {
    let current = dir;
    for (let i = 0; i < 10; i++) {
        const candidate = path.join(current, DEFAULT_CONFIG_NAME);
        if (fs.existsSync(candidate)) return candidate;
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
    }
    return null;
}
