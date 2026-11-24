import { cac, type CAC } from 'cac';
import { initCommand } from './commands/init.js';
import { testCommand } from './commands/test.js';
import { exportCommand } from './commands/export.js';
import { checkCommand } from './commands/check.js';
import { diffCommand } from './commands/diff.js';
import { modelCommand } from './commands/model.js';
import { storyCommand } from './commands/story.js';
import {
  stringOption,
  type CommandContext,
  type CommandOptions,
} from './context.js';

const defaultContext = (): CommandContext => ({
  cwd: process.cwd(),
  stdout: (text) => process.stdout.write(`${text}\n`),
  stderr: (text) => process.stderr.write(`${text}\n`),
  color: Boolean(process.stdout.isTTY) && !('NO_COLOR' in process.env),
});

export function createCli(context: CommandContext = defaultContext()): CAC {
  const cli = cac('evidence');
  cli.option(
    '--workspace <dir>',
    'Target workspace root (default: discover from current directory)',
  );
  cli
    .command('init', 'Initialize .evidence in an existing directory')
    .option('--name <name>', 'Model name')
    .action((options: CommandOptions) => initCommand(options, context));
  cli
    .command('check', 'Static model consistency and scope checks')
    .option('--scope <id>', 'Context responsibility scope (repeatable)', {
      type: [],
    })
    .option('--json', 'Machine-readable report')
    .action((options: CommandOptions) => checkCommand(options, context));
  cli
    .command('story', 'Project declared flow scenarios into business stories')
    .option('--flow <id>', 'Filter by exact flow ID')
    .option('--format <type>', 'Output format: markdown | json | text', {
      default: 'markdown',
    })
    .option('--export', 'Write to .evidence/stories')
    .option('--no-ai', 'Offline fact cards without LLM expansion')
    .option('--compact', 'Compact stories (single-line JSON)')
    .action((options: CommandOptions) => storyCommand(options, context));
  cli
    .command('test', 'Run black-box HTTP acceptance suites')
    .option('--target <url>', 'Backend service base URL (required)')
    .option('--as-of <utc>', 'Business timestamp')
    .option('--timeout <ms>', 'Request timeout', { default: '5000' })
    .option('--verbose', 'Detailed failures')
    .option('--json', 'Machine-readable report')
    .option('--gate <gate>', 'regression | dod')
    .option(
      '--baseline-workspace <dir>',
      'Baseline Evidence workspace for the gate',
    )
    .option('--filter <pattern>', 'Filter acceptance flows')
    .option('--tag <label>', 'Filter tags (repeatable)', { type: [] })
    .option('--detect-drift', 'Report response contract drift')
    .option('--strict-drift', 'Fail on response contract drift')
    .option(
      '--allow-pending',
      'Allow pending DoD results (never turn failures green)',
    )
    .option('--report <format>', 'markdown | junit')
    .option('--write-reports', 'Write reports to .evidence/reports')
    .action((options: CommandOptions) => testCommand(options, context));
  cli
    .command('export', 'Export OpenAPI 3.1 and HTTP acceptance suites')
    .option('--openapi', 'Export only the contract')
    .option('--tests', 'Export only the Bruno acceptance collection')
    .option('--verify', 'Read-only exact byte verification')
    .option(
      '--only-unblocked',
      'Sync unblocked business-context OpenAPI drafts',
    )
    .option('--watch', 'Continuously sync context drafts from the saved model')
    .action((options: CommandOptions) => exportCommand(options, context));
  cli
    .command('diff <base> <target>', 'Compare contracts')
    .option('--format <format>', 'json | markdown (default: markdown)')
    .action((base: string, target: string, options: CommandOptions) =>
      diffCommand(base, target, options, context),
    );
  for (const [command, description] of [
    ['compile', 'Compile a checked model snapshot'],
    ['inspect', 'Inspect model files and counts'],
    ['lineage', 'Generate attribute lineage'],
  ] as const) {
    const registered = cli
      .command(command, description)
      .action((options: CommandOptions) =>
        modelCommand(command, options, context),
      );
    if (command === 'inspect')
      registered.option('--json', 'Machine-readable summary');
    else registered.option('--compact', 'Compact JSON');
  }
  cli.help();
  cli.version('0.0.1');
  // cac's default printer writes to console. Render its registered metadata to
  // the injected output instead, keeping dispatch embeddable and JSON clean.
  cli.outputHelp = () => {
    const command = cli.matchedCommand;
    const commands = command ? [command] : cli.commands;
    const options = [...(command?.options ?? []), ...cli.globalCommand.options];
    context.stdout(
      [
        'Evidence — model-driven contracts and black-box acceptance',
        `Usage: evidence ${command?.rawName ?? '<command> [options]'}`,
        ...commands.map((entry) => `  ${entry.rawName}  ${entry.description}`),
        'Options:',
        ...options.map(
          (option) =>
            `  ${option.rawName}  ${option.description}${option.config.default === undefined ? '' : ` (default: ${option.negated ? !option.config.default : option.config.default})`}`,
        ),
      ].join('\n'),
    );
  };
  cli.outputVersion = () => context.stdout('evidence/0.0.1');
  return cli;
}

function validateInvocation(cli: CAC): void {
  const command = cli.matchedCommand;
  if (!command)
    throw new Error(
      `Unknown command: ${cli.args[0] ?? ''}. Run evidence --help.`,
    );
  // mri may overwrite mixed aliases or repeated negations instead of
  // preserving an array.
  const raw = cli.rawArgs.slice(2);
  const end = raw.indexOf('--');
  const flags = end < 0 ? raw : raw.slice(0, end);
  for (const option of command.options.filter(
    (entry) => entry.names.length > 1 || entry.negated,
  )) {
    const count = flags.filter((token) =>
      option.names.some((name) => {
        const flag = `${name.length === 1 ? '-' : '--'}${name}`;
        const spellings = [flag, ...(option.negated ? [`--no-${name}`] : [])];
        return spellings.some(
          (spelling) => token === spelling || token.startsWith(`${spelling}=`),
        );
      }),
    ).length;
    if (count > 1) throw new Error(`Duplicate option: --${option.name}`);
  }
  // cac uses arrays for repeated options; only explicitly repeatable flags may
  // accept them.
  for (const [name, value] of Object.entries(cli.options)) {
    if (name === '--') {
      if ((value as unknown[]).length)
        throw new Error('Unexpected arguments after --');
      continue;
    }
    if (Array.isArray(value) && value.every((item) => item === undefined)) {
      delete cli.options[name];
      continue;
    }
    const option = command.options.find((entry) => entry.names.includes(name));
    if (Array.isArray(value) && !Array.isArray(option?.config.type))
      throw new Error(`Duplicate option: --${name}`);
    if (Array.isArray(value)) {
      if (value.some((item) => item === true || item === false))
        throw new Error(`Expected a nonempty option value: --${name}`);
      cli.options[name] = value.map(stringOption);
    }
  }
  if (cli.args.length > command.args.length)
    throw new Error(`Unexpected arguments. Usage: evidence ${command.rawName}`);
}

export async function dispatch(
  argv: readonly string[],
  context: CommandContext = defaultContext(),
): Promise<number> {
  try {
    const args = [...argv];
    if (args.length === 0 || args[0] === 'help') args.splice(0, 1, '--help');
    const cli = createCli(context);
    cli.parse(['node', 'evidence', ...args], { run: false });
    if (cli.options.help || cli.options.version) return 0;
    cli.args = [...cli.args, ...cli.options['--']];
    cli.options['--'] = [];
    validateInvocation(cli);
    return (await cli.runMatchedCommand()) as number;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (argv.includes('--json'))
      context.stdout(JSON.stringify({ passed: false, error: message }));
    else context.stderr(`Error: ${message}`);
    return 1;
  }
}
