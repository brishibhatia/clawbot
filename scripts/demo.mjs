// scripts/demo.mjs
// End-to-end demo: seed → plan → run → prove (if env vars set)
import { execSync } from 'node:child_process';
import fs from 'node:fs';

function run(cmd, label) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`▶ ${label}`);
  console.log(`  $ ${cmd}`);
  console.log('═'.repeat(60));
  try {
    execSync(cmd, { stdio: 'inherit', cwd: process.cwd() });
  } catch (err) {
    console.error(`\n❌ Step failed: ${label}`);
    console.error(err.message);
    process.exit(1);
  }
}

console.log(`
╔══════════════════════════════════════════════════════════════╗
║         🧹 Verifiable DeepClean Butler — Full Demo          ║
╚══════════════════════════════════════════════════════════════╝
`);

// Step 1: Clean previous demo artifacts
console.log('🧹 Cleaning previous demo artifacts...');
for (const dir of ['.deepclean-demo', '.deepclean-quarantine', '.deepclean-staging', '.deepclean-proofs']) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`   Removed ${dir}`);
  }
}

// Step 2: Seed the workspace
run('node scripts/seed_workspace.mjs', 'Step 1: Seed messy workspace');

// Step 3: Dry-run plan
run('node apps/deepclean-cli/dist/index.js plan --path .deepclean-demo', 'Step 2: Generate dry-run plan');

// Step 4: Execute cleanup
run('node apps/deepclean-cli/dist/index.js run --path .deepclean-demo', 'Step 3: Execute cleanup + generate proof bundle');

// Step 5: Show status
run('node apps/deepclean-cli/dist/index.js status', 'Step 4: Show run status');

// Step 6: Show quarantine
run('node apps/deepclean-cli/dist/index.js restore', 'Step 5: List quarantined files');

// Step 7: Prove (if env vars are set)
if (process.env.SUI_PRIVATE_KEY && process.env.DEEPCLEAN_PACKAGE_ID) {
  // Find the latest run ID from proofs dir
  const proofsDir = '.deepclean-proofs';
  if (fs.existsSync(proofsDir)) {
    const manifests = fs.readdirSync(proofsDir).filter(f => f.endsWith('-manifest.json'));
    if (manifests.length > 0) {
      const latest = JSON.parse(fs.readFileSync(`${proofsDir}/${manifests[manifests.length - 1]}`, 'utf-8'));
      run(`node apps/deepclean-cli/dist/index.js prove --run ${latest.runId}`, 'Step 6: Upload to Walrus + Anchor on Sui');
    }
  }
} else {
  console.log(`\n${'═'.repeat(60)}`);
  console.log('ℹ️  Step 6: Skipping Walrus upload + Sui anchoring');
  console.log('   Set SUI_PRIVATE_KEY and DEEPCLEAN_PACKAGE_ID to enable.');
  console.log('═'.repeat(60));
}

console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    ✅ Demo Complete!                         ║
║                                                              ║
║  Check .deepclean-proofs/ for the proof bundle.              ║
║  Check .deepclean-quarantine/ for quarantined files.         ║
╚══════════════════════════════════════════════════════════════╝
`);
