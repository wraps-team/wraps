#!/usr/bin/env node
import args from 'args';
import * as clack from '@clack/prompts';
import pc from 'picocolors';
import { init } from './commands/init.js';
import { status } from './commands/status.js';
import { destroy } from './commands/destroy.js';
import { verify } from './commands/verify.js';
import { connect } from './commands/connect.js';
import { restore } from './commands/restore.js';
import { upgrade } from './commands/upgrade.js';
import { handleCLIError } from './utils/errors.js';
import { setupTabCompletion, printCompletionScript } from './utils/completion.js';

// Setup tab completion
setupTabCompletion();

// Configure args
args.options([
  {
    name: 'provider',
    description: 'Hosting provider (vercel, aws, railway, other)',
    defaultValue: undefined,
  },
  {
    name: 'region',
    description: 'AWS region',
    defaultValue: undefined,
  },
  {
    name: 'domain',
    description: 'Domain to verify',
    defaultValue: undefined,
  },
  {
    name: 'account',
    description: 'AWS account ID or alias',
    defaultValue: undefined,
  },
  {
    name: 'enhanced',
    description: 'Use enhanced integration (Lambda, DynamoDB, SNS)',
    defaultValue: undefined,
  },
  {
    name: 'yes',
    description: 'Skip confirmation prompts',
    defaultValue: false,
  },
]);

// Get command and flags
const flags = args.parse(process.argv);
const [command] = args.sub;

// Show help if no command
if (!command) {
  clack.intro(pc.bold('BYO CLI'));
  console.log('Deploy email infrastructure to your AWS account\n');
  console.log('Usage: byo <command> [options]\n');
  console.log('Commands:');
  console.log(`  ${pc.cyan('init')}        Deploy new email infrastructure`);
  console.log(`  ${pc.cyan('connect')}     Connect to existing AWS SES infrastructure`);
  console.log(`  ${pc.cyan('upgrade')}     Add features to existing connection`);
  console.log(`  ${pc.cyan('status')}      Show current infrastructure status`);
  console.log(`  ${pc.cyan('verify')}      Verify domain DNS records and SES status`);
  console.log(`  ${pc.cyan('restore')}     Restore original AWS configuration`);
  console.log(`  ${pc.cyan('destroy')}     Remove all deployed infrastructure`);
  console.log(`  ${pc.cyan('completion')}  Generate shell completion script\n`);
  console.log('Options:');
  console.log(`  ${pc.dim('--provider')}  Hosting provider (vercel, aws, railway, other)`);
  console.log(`  ${pc.dim('--region')}    AWS region`);
  console.log(`  ${pc.dim('--domain')}    Domain to verify`);
  console.log(`  ${pc.dim('--account')}   AWS account ID or alias\n`);
  console.log(`Run ${pc.cyan('byo <command> --help')} for more information on a command.\n`);
  process.exit(0);
}

// Route to appropriate command
async function run() {
  try {
    switch (command) {
      case 'init':
        await init({
          provider: flags.provider,
          region: flags.region,
          domain: flags.domain,
          enhanced: flags.enhanced,
          yes: flags.yes,
        });
        break;

      case 'status':
        await status({
          account: flags.account,
        });
        break;

      case 'verify':
        if (!flags.domain) {
          clack.log.error('--domain flag is required');
          console.log(`\nUsage: ${pc.cyan('byo verify --domain yourapp.com')}\n`);
          process.exit(1);
        }
        await verify({
          domain: flags.domain,
        });
        break;

      case 'connect':
        await connect({
          provider: flags.provider,
          region: flags.region,
          yes: flags.yes,
        });
        break;

      case 'upgrade':
        await upgrade({
          region: flags.region,
          yes: flags.yes,
        });
        break;

      case 'restore':
        await restore({
          region: flags.region,
          yes: flags.yes,
        });
        break;

      case 'destroy':
        await destroy({
          yes: flags.yes,
        });
        break;

      case 'completion':
        printCompletionScript();
        break;

      default:
        clack.log.error(`Unknown command: ${command}`);
        console.log(`\nRun ${pc.cyan('byo --help')} for available commands.\n`);
        process.exit(1);
    }
  } catch (error) {
    handleCLIError(error);
  }
}

run();
