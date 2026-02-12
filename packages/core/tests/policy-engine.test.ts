import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadPolicy, computePolicyHash, isActionAllowed, evaluatePolicy } from '../src/policy-engine.js';

describe('loadPolicy', () => {
    it('returns default policy when no path given', () => {
        const policy = loadPolicy();
        assert.equal(policy.version, '1.0.0');
        assert.equal(policy.rules.neverDelete, true);
        assert.equal(policy.rules.maxFileSizeMB, 500);
    });

    it('returns default policy for non-existent file', () => {
        const policy = loadPolicy('/nonexistent/path.json');
        assert.equal(policy.version, '1.0.0');
    });
});

describe('computePolicyHash', () => {
    it('produces stable hash for same policy', () => {
        const policy = loadPolicy();
        const hash1 = computePolicyHash(policy);
        const hash2 = computePolicyHash(policy);
        assert.equal(hash1, hash2);
        assert.equal(hash1.length, 64); // sha256 hex
    });

    it('produces different hash for different policy', () => {
        const p1 = loadPolicy();
        const p2 = { ...loadPolicy(), version: '2.0.0' };
        assert.notEqual(computePolicyHash(p1), computePolicyHash(p2));
    });
});

describe('isActionAllowed', () => {
    it('allows listed actions', () => {
        assert.equal(isActionAllowed('dedupe', ['dedupe', 'rename']), true);
    });

    it('denies unlisted actions', () => {
        assert.equal(isActionAllowed('quarantine', ['dedupe', 'rename']), false);
    });
});

describe('evaluatePolicy', () => {
    it('includes quarantine for suspicious files', () => {
        const policy = loadPolicy();
        const actions = evaluatePolicy(policy, 1024, true);
        assert.ok(actions.includes('quarantine'));
    });

    it('includes dedupe and rename by default', () => {
        const policy = loadPolicy();
        const actions = evaluatePolicy(policy, 1024, false);
        assert.ok(actions.includes('dedupe'));
        assert.ok(actions.includes('rename'));
    });
});
