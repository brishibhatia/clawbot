import fs from 'node:fs';
import crypto from 'node:crypto';
import type { PolicyConfig, ActionType } from './types.js';

const DEFAULT_POLICY: PolicyConfig = {
    version: '1.0.0',
    rules: {
        neverDelete: true,
        maxFileSizeMB: 500,
        quarantineDoubleExtensions: true,
        quarantineLargeExecutablesMB: 50,
        dedupeByContentHash: true,
        renameWithDatePrefix: true,
        autoUnzipArchives: true,
        skipOnBattery: false,
        skipPatterns: ['node_modules', '.git', '.deepclean-'],
    },
};

export function loadPolicy(policyPath?: string): PolicyConfig {
    if (policyPath && fs.existsSync(policyPath)) {
        const raw = fs.readFileSync(policyPath, 'utf-8');
        return JSON.parse(raw) as PolicyConfig;
    }
    return DEFAULT_POLICY;
}

export function computePolicyHash(policy: PolicyConfig): string {
    const json = JSON.stringify(policy, null, 0);
    return crypto.createHash('sha256').update(json).digest('hex');
}

export function isActionAllowed(action: ActionType, allowedActions: ActionType[]): boolean {
    return allowedActions.includes(action);
}

export function evaluatePolicy(policy: PolicyConfig, fileSize: number, isSuspicious: boolean): ActionType[] {
    const actions: ActionType[] = [];

    if (isSuspicious && policy.rules.quarantineDoubleExtensions) {
        actions.push('quarantine');
    }

    if (policy.rules.dedupeByContentHash) {
        actions.push('dedupe');
    }

    if (policy.rules.renameWithDatePrefix) {
        actions.push('rename');
    }

    if (policy.rules.autoUnzipArchives) {
        actions.push('unzip');
    }

    if (fileSize > policy.rules.maxFileSizeMB * 1024 * 1024) {
        actions.push('quarantine');
    }

    return [...new Set(actions)];
}
