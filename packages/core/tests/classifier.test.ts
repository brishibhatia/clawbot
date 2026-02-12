import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyFile, isSuspicious, shouldSkip } from '../src/classifier.js';

describe('classifyFile', () => {
    it('classifies archive files', () => {
        assert.equal(classifyFile('report.zip'), 'archive');
        assert.equal(classifyFile('backup.tar.gz'), 'archive');
        assert.equal(classifyFile('data.7z'), 'archive');
    });

    it('classifies media files', () => {
        assert.equal(classifyFile('photo.jpg'), 'media');
        assert.equal(classifyFile('video.mp4'), 'media');
        assert.equal(classifyFile('song.mp3'), 'media');
    });

    it('classifies code files', () => {
        assert.equal(classifyFile('app.ts'), 'code');
        assert.equal(classifyFile('main.py'), 'code');
        assert.equal(classifyFile('config.json'), 'code');
    });

    it('classifies document files', () => {
        assert.equal(classifyFile('paper.pdf'), 'document');
        assert.equal(classifyFile('notes.md'), 'document');
        assert.equal(classifyFile('data.csv'), 'document');
    });

    it('classifies executables', () => {
        assert.equal(classifyFile('setup.exe'), 'executable');
        assert.equal(classifyFile('app.msi'), 'executable');
    });

    it('returns unknown for unrecognized extensions', () => {
        assert.equal(classifyFile('weirdfile.xyz'), 'unknown');
        assert.equal(classifyFile('noext'), 'unknown');
    });
});

describe('isSuspicious', () => {
    it('detects double extensions', () => {
        const result = isSuspicious('report.pdf.exe', 1000);
        assert.equal(result.suspicious, true);
        assert.ok(result.reason?.includes('Double extension'));
    });

    it('detects large executables', () => {
        const size = 100 * 1024 * 1024; // 100MB
        const result = isSuspicious('setup.exe', size, 50);
        assert.equal(result.suspicious, true);
        assert.ok(result.reason?.includes('Large executable'));
    });

    it('passes normal files', () => {
        const result = isSuspicious('document.pdf', 1024);
        assert.equal(result.suspicious, false);
    });
});

describe('shouldSkip', () => {
    it('skips node_modules', () => {
        assert.equal(shouldSkip('/project/node_modules/foo.js', ['node_modules']), true);
    });

    it('skips .git directories', () => {
        assert.equal(shouldSkip('/project/.git/config', ['.git']), true);
    });

    it('does not skip normal files', () => {
        assert.equal(shouldSkip('/project/src/app.ts', ['node_modules', '.git']), false);
    });
});
