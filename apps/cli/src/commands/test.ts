import path from 'node:path';
import {
  openWorkspace,
  checkWorkspacePath,
  writeWorkspaceFile,
} from '@evidence-poc/evidence-model-io';
import {
  runAcceptanceSuite,
  type AcceptanceGate,
  validateAsOf,
  validateTargetUrl,
} from '@evidence-poc/evidence-acceptance/runner';
import { compileAcceptanceBaseline } from '@evidence-poc/evidence-acceptance';
import { getWorkspace, loadModel } from '../model.js';
import { markdownReport, junitReport } from '../ui/markdownReporter.js';
import {
  stringOption,
  type CommandContext,
  type CommandOptions,
} from '../context.js';
import {
  trafficLightReport,
  type AcceptanceReport,
} from '../ui/trafficLightReporter.js';

async function healthProbe(target: string, timeoutMs: number): Promise<void> {
  try {
    // Any HTTP response (including 404/405) proves reachability. Never require a
    // private health endpoint, follow redirects, or mutate state with a POST.
    const response = await fetch(target, {
      method: 'HEAD',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    await response.body?.cancel();
  } catch (error) {
    throw new Error(
      `Target ${target} is unreachable. Ensure your backend service is running.\n${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function testCommand(
  values: CommandOptions,
  context: CommandContext,
): Promise<number> {
  const gate = stringOption(values.gate);
  if (gate !== undefined && gate !== 'regression' && gate !== 'dod')
    throw new Error('--gate must be regression or dod');
  if (values.allowPending && gate !== 'dod')
    throw new Error('--allow-pending is only valid for --gate dod');
  const baselinePath = stringOption(values.baselineWorkspace);
  if (baselinePath && !gate)
    throw new Error('--baseline-workspace requires --gate');
  const format = stringOption(values.report);
  if (format && !['markdown', 'junit'].includes(format))
    throw new Error('--report must be markdown or junit');
  if (format && values.json)
    throw new Error('--report and --json are mutually exclusive');
  const target = stringOption(values.target);
  if (target === undefined) throw new Error('--target is required');
  const targetUrl = validateTargetUrl(target);
  const clock = stringOption(values.asOf);
  const asOf = clock === undefined ? undefined : validateAsOf(clock);
  const timeoutMs = Number(stringOption(values.timeout));
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > 2147483647
  )
    throw new Error(
      '--timeout must be a positive integer <= 2147483647 milliseconds',
    );
  const workspace = getWorkspace(context, values);
  const suitePath = workspace.acceptance;
  checkWorkspacePath(workspace.root, suitePath, 'directory');
  const baseline = baselinePath
    ? await compileAcceptanceBaseline(
        await loadModel(
          openWorkspace(path.resolve(context.cwd, baselinePath)).model,
        ),
      )
    : undefined;
  const suite = await runAcceptanceSuite({
    suitePath,
    targetUrl,
    preflight: () => healthProbe(targetUrl, timeoutMs),
    ...(asOf === undefined ? {} : { asOf }),
    timeoutMs,
    ...(gate ? { gate: gate as AcceptanceGate } : {}),
    ...(baseline === undefined ? {} : { baseline }),
    ...(values.filter === undefined
      ? {}
      : { filter: stringOption(values.filter)! }),
    ...(values.tag === undefined ? {} : { tags: values.tag as string[] }),
    detectDrift: values.detectDrift === true || values.strictDrift === true,
    strictDrift: values.strictDrift === true,
  });
  const report: AcceptanceReport = {
    passed: suite.passed,
    targetUrl,
    ...(asOf === undefined ? {} : { asOf }),
    totalDurationMs: suite.totalDurationMs,
    suites: [suite],
    ...(gate ? { gate: gate as AcceptanceGate } : {}),
    pending:
      values.allowPending === true &&
      !suite.passed &&
      !suite.steps.some(
        (step) =>
          step.errored || (values.strictDrift && step.driftIssues?.length),
      ),
  };
  if (values.writeReports) {
    const directory = workspace.reports;
    const name = gate ?? 'acceptance';
    for (const extension of ['json', 'md', 'xml'])
      checkWorkspacePath(
        workspace.root,
        path.join(directory, `${name}.${extension}`),
        'file',
      );
    await Promise.all([
      writeWorkspaceFile(
        workspace.root,
        path.join(directory, `${name}.json`),
        JSON.stringify(report, null, 2) + '\n',
      ),
      writeWorkspaceFile(
        workspace.root,
        path.join(directory, `${name}.md`),
        markdownReport(report) + '\n',
      ),
      writeWorkspaceFile(
        workspace.root,
        path.join(directory, `${name}.xml`),
        junitReport(report) + '\n',
      ),
    ]);
  }
  context.stdout(
    values.json
      ? JSON.stringify(report, null, 2)
      : format === 'markdown'
        ? markdownReport(report)
        : format === 'junit'
          ? junitReport(report)
          : trafficLightReport(report, {
              color: context.color,
              verbose: values.verbose === true,
            }),
  );
  return report.passed || report.pending ? 0 : 1;
}
