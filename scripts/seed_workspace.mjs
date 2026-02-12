// scripts/seed_workspace.mjs
// Creates a messy demo workspace for showcasing DeepClean Butler.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as tar from 'tar';
import AdmZip from 'adm-zip';

const DEMO_DIR = '.deepclean-demo';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeFile(rel, content) {
  const full = path.join(DEMO_DIR, rel);
  ensureDir(path.dirname(full));
  fs.writeFileSync(full, content);
  console.log(`  📄 ${rel}`);
}

console.log('🌱 Seeding demo workspace...\n');
// Clean start
if (fs.existsSync(DEMO_DIR)) {
    console.log('🧹 Cleaning previous demo workspace...');
    fs.rmSync(DEMO_DIR, { recursive: true, force: true });
}
ensureDir(DEMO_DIR);

// ── Normal documents ──────────────────────────────────────────
writeFile('documents/meeting notes.docx', 'Fake DOCX content — meeting notes from Jan 2025');
writeFile('documents/quarterly-report.pdf', 'Fake PDF content — Q4 report');
writeFile('documents/budget_2025.xlsx', 'Fake XLSX — budget spreadsheet');
writeFile('documents/readme.md', '# My Project\nThis is a sample readme.');

// ── Media files ───────────────────────────────────────────────
writeFile('media/vacation_photo.jpg', crypto.randomBytes(2048));
writeFile('media/presentation_recording.mp4', crypto.randomBytes(4096));
writeFile('media/podcast_episode.mp3', crypto.randomBytes(1024));

// ── Code files ────────────────────────────────────────────────
writeFile('code/app.ts', 'export function main() { console.log("hello"); }');
writeFile('code/utils.py', 'def helper(): return 42');
writeFile('code/config.json', '{"key": "value", "debug": true}');

// ── Archives ──────────────────────────────────────────────────
// Create a temp source dir for packing
const archiveSrc = path.join(DEMO_DIR, '_archive_src');
ensureDir(archiveSrc);
fs.writeFileSync(path.join(archiveSrc, 'README.txt'), 'This is a valid archive created by seed script.');

// Ensure destination dir exists
const archivesDir = path.join(DEMO_DIR, 'archives');
ensureDir(archivesDir);

// Create .tar.gz
await tar.c(
    { gzip: true, file: path.join(archivesDir, 'backup-2024.tar.gz'), cwd: archiveSrc },
    ['.']
);
console.log('  📦 archives/backup-2024.tar.gz');

// Create .zip
const zip = new AdmZip();
zip.addLocalFolder(archiveSrc);
zip.writeZip(path.join(DEMO_DIR, 'archives/old-project.zip'));
console.log('  📦 archives/old-project.zip');

// Cleanup source
fs.rmSync(archiveSrc, { recursive: true, force: true });

// ── Duplicates (same content, different names) ────────────────
const dupeContent = 'This is the exact same file duplicated for demo purposes.\n';
writeFile('documents/important_doc.txt', dupeContent);
writeFile('documents/important_doc_copy.txt', dupeContent);
writeFile('documents/important_doc_backup.txt', dupeContent);

// ── Suspicious files ─────────────────────────────────────────
writeFile('suspicious/invoice.pdf.exe', 'FAKE EXECUTABLE — this is a demo suspicious file');
writeFile('suspicious/readme.doc.bat', '@echo off\necho This is suspicious');
writeFile('suspicious/totally_safe.jpg.scr', crypto.randomBytes(128));

// ── Random clutter ────────────────────────────────────────────
writeFile('downloads/random_installer.exe', crypto.randomBytes(256));
writeFile('downloads/unnamed_file', 'what even is this');
writeFile('downloads/file (1).txt', 'copied from somewhere');
writeFile('downloads/file (2).txt', 'another copy');

// ── Sample git repo (just the structure, not a real repo) ─────
writeFile('repos/sample-project/package.json', '{"name":"sample-project","version":"1.0.0"}');
writeFile('repos/sample-project/src/index.ts', 'console.log("hello from sample project");');
writeFile('repos/sample-project/README.md', '# Sample Project\nA demo repo for DeepClean.');

console.log(`\n✅ Demo workspace seeded at ./${DEMO_DIR}`);
console.log(`   ${fs.readdirSync(DEMO_DIR, { recursive: true }).length} items created`);
