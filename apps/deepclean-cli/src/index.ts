#!/usr/bin/env node
import { Command } from 'commander';
import { planCommand } from './commands/plan.js';
import { runCommand } from './commands/run.js';
import { proveCommand } from './commands/prove.js';
import { verifyCommand } from './commands/verify.js';
import { statusCommand } from './commands/status.js';
import { restoreCommand } from './commands/restore.js';

const program = new Command();

program
    .name('deepclean-cli')
    .description('Verifiable DeepClean Butler — tamper-evident workspace cleanup with Sui/Walrus proof anchoring')
    .version('0.1.0');

program.addCommand(planCommand);
program.addCommand(runCommand);
program.addCommand(proveCommand);
program.addCommand(verifyCommand);
program.addCommand(statusCommand);
program.addCommand(restoreCommand);

program.parse();
