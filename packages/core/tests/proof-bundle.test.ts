import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildManifest } from '../src/proof-bundle.js';
import type { ActionPlan, ActionResult } from '../src/types.js';

describe('buildManifest', () => {
    const plan: ActionPlan = {
        runId: 'test-run-001',
        timestamp: '2025-01-01T00:00:00Z',
        policyVersion: '1.0.0',
        policyHash: 'abc123',
        rootPath: '/test',
        dryRun: true,
        actions: [
            {
                id: 'a1',
                type: 'rename',
                sourcePath: '/test/file.txt',
                targetPath: '/test/2025-01-01_file.txt',
                reason: 'Date prefix',
                fileInfo: {
                    path: '/test/file.txt',
                    relativePath: 'file.txt',
                    size: 100,
                    mtime: new Date('2025-01-01'),
                    sha256: 'deadbeef',
                    category: 'document',
                    suspicious: false,
                },
            },
        ],
        fileCount: 1,
        summary: 'Test plan',
    };

    const results: ActionResult[] = [
        {
            actionId: 'a1',
            type: 'rename',
            success: true,
            sourcePath: '/test/file.txt',
            targetPath: '/test/2025-01-01_file.txt',
            reason: 'Date prefix',
        },
    ];

    it('builds a valid manifest', () => {
        const manifest = buildManifest(plan, results, '/test', ['file.txt'], ['2025-01-01_file.txt']);
        assert.equal(manifest.runId, 'test-run-001');
        assert.equal(manifest.policyVersion, '1.0.0');
        assert.equal(manifest.policyHash, 'abc123');
        assert.equal(manifest.plannedActions.length, 1);
        assert.equal(manifest.executedActions.length, 1);
        assert.deepEqual(manifest.fileTreeBefore, ['file.txt']);
        assert.deepEqual(manifest.fileTreeAfter, ['2025-01-01_file.txt']);
        assert.ok(manifest.endTimestamp);
        assert.ok(manifest.environment.os);
        assert.ok(manifest.environment.nodeVersion);
    });

    it('computes correct summary', () => {
        const manifest = buildManifest(plan, results, '/test', [], []);
        assert.equal(manifest.summary, '1/1 actions succeeded');
    });

    it('handles failed actions in summary', () => {
        const failedResults: ActionResult[] = [
            { ...results[0], success: false, error: 'Permission denied' },
        ];
        const manifest = buildManifest(plan, failedResults, '/test', [], []);
        assert.equal(manifest.summary, '0/1 actions succeeded');
    });
});
