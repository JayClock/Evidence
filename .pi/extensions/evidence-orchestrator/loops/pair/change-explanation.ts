import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  executionEvidencePaths,
  validateExecutionEvidence,
} from '../../capabilities/execution-evidence/manifest';
import {
  artifactPath,
  artifactRelativePath,
} from '../../iteration/artifact-layout';
import { readState } from '../../iteration/state-repository';
import type { WorkflowState } from '../../iteration/state';

const MAX_HTML_BYTES = 2 * 1024 * 1024;
const EXPLANATION_DIRECTORY = 'evidence-explanations';

export interface HtmlChangeExplanationRequest {
  version: 1;
  story_id: string;
  scenario_ids: string[];
  git_baseline: string;
  git_head: string;
  code_content_sha256: string;
  execution_manifest_path: string;
  execution_manifest_sha256: string;
  execution_summary_path: string;
  output_path: string;
  metadata_path: string;
  prepared_at: string;
  task: string;
}

export interface HtmlChangeExplanationRecord {
  version: 1;
  story_id: string;
  scenario_ids: string[];
  git_baseline: string;
  git_head: string;
  code_content_sha256: string;
  execution_manifest_path: string;
  execution_manifest_sha256: string;
  output_path: string;
  html_sha256: string;
  artifact_path: string;
  generated_by: 'change-explainer';
  generated_at: string;
}

function digest(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function readyPairState(cwd: string): WorkflowState {
  const state = readState(cwd);
  if (
    state.loop !== 'pair' ||
    state.pair_session?.checkpoint !== 'quality_gates_passed' ||
    state.pair_session.automation_exception ||
    !state.active_work_item
  ) {
    throw new Error(
      'HTML change explanation is available only after all Pair quality gates pass and before Story coding approval.',
    );
  }
  return state;
}

function isInside(root: string, candidate: string): boolean {
  const fromRoot = relative(resolve(root), resolve(candidate));
  return (
    fromRoot === '' ||
    (fromRoot !== '..' &&
      !fromRoot.startsWith(`..${sep}`) &&
      !isAbsolute(fromRoot))
  );
}

function explanationRoot(cwd: string, requestedRoot?: string): string {
  const configured =
    requestedRoot?.trim() || process.env.EVIDENCE_EXPLANATION_DIR?.trim();
  const root = resolve(configured || join(tmpdir(), EXPLANATION_DIRECTORY));
  if (isInside(resolve(cwd), root)) {
    throw new Error(
      'EVIDENCE_EXPLANATION_DIR must resolve outside the code repository.',
    );
  }
  mkdirSync(root, { recursive: true });
  const canonicalRoot = realpathSync(root);
  if (isInside(realpathSync(cwd), canonicalRoot)) {
    throw new Error(
      'EVIDENCE_EXPLANATION_DIR must resolve outside the code repository.',
    );
  }
  return canonicalRoot;
}

function timestampParts(now: string): {
  iso: string;
  date: string;
  time: string;
} {
  const instant = new Date(now);
  if (Number.isNaN(instant.getTime())) {
    throw new Error(`Invalid HTML change explanation timestamp: ${now}.`);
  }
  const iso = instant.toISOString();
  return {
    iso,
    date: iso.slice(0, 10),
    time: iso.slice(11, 23).replaceAll(':', '').replace('.', ''),
  };
}

function nextOutputPath(
  root: string,
  state: WorkflowState,
  date: string,
  time: string,
): string {
  const storyId = state.active_work_item?.story_id;
  if (!storyId) throw new Error('Pair has no active Story to explain.');
  const stem = `${date}-explanation-${state.iteration_id}-${storyId}-${time}`;
  let candidate = join(root, `${stem}.html`);
  for (let sequence = 2; existsSync(candidate); sequence += 1) {
    candidate = join(root, `${stem}-${sequence}.html`);
  }
  return candidate;
}

function buildTask(
  state: WorkflowState,
  request: Omit<HtmlChangeExplanationRequest, 'task'>,
): string {
  const scenarioPaths =
    state.confirmed_scenarios?.map(({ artifact_path }) => artifact_path) ?? [];
  const modelingDecision =
    state.modeling_profile?.method === 'none'
      ? state.model_expansion_path
      : state.model_decisions?.at(-1)?.artifact_path;
  return `生成 Evidence Pair 的只读 HTML 代码变更说明。

方法：加载并严格遵守 .pi/skills/evidence-change-explanation/SKILL.md。

稳定输入：
- Story：${request.story_id} / [${request.scenario_ids.join(', ')}]
- Git baseline：${request.git_baseline}
- Git HEAD：${request.git_head}
- 确认 Scenario：${scenarioPaths.join(', ')}
- 建模证据：${state.model_expansion_path ?? 'none'}
- 人工建模决定：${modelingDecision ?? 'none'}
- 批准计划：${state.approved_test_plan_path ?? 'missing'}
- 执行 manifest：${request.execution_manifest_path}
- 确定性 summary：${request.execution_summary_path}
- Code content SHA256：${request.code_content_sha256}

任务：广泛读取与变更相关的周边代码，并以 ${request.git_baseline} 到当前工作树的 apps/、libs/ diff 及 manifest 列出的模型变化为解释边界。生成一个自包含、响应式、单页 HTML，包含 Background、Intuition、Code、Quiz 四部分、目录、HTML/CSS 图示以及恰好五道可交互选择题。控制器将把最终 HTML 保存到：
${request.output_path}

不得修改仓库内外任何文件、Git HEAD、Git index、测试、模型、计划、状态或执行证据；不得运行测试或质量命令；不得把预期价值写成已观测价值。最终响应必须从 <!doctype html> 开始、以 </html> 结束，只返回完整 HTML，不加 Markdown 围栏、路径或解释文字。`;
}

export function prepareHtmlChangeExplanation(
  cwd: string,
  now = new Date().toISOString(),
  outputRoot?: string,
): HtmlChangeExplanationRequest {
  const state = readyPairState(cwd);
  const workItem = state.active_work_item;
  if (!workItem) throw new Error('Pair has no active work item.');
  const manifest = validateExecutionEvidence(cwd, workItem);
  const paths = executionEvidencePaths(cwd);
  if (!paths.manifest || !paths.summary) {
    throw new Error('Pair execution manifest and summary are required.');
  }
  const manifestContent = readFileSync(join(cwd, paths.manifest));
  const { iso, date, time } = timestampParts(now);
  const requestWithoutTask: Omit<HtmlChangeExplanationRequest, 'task'> = {
    version: 1,
    story_id: workItem.story_id,
    scenario_ids: [...workItem.scenario_ids],
    git_baseline: workItem.git_baseline,
    git_head: manifest.source.git_head,
    code_content_sha256: manifest.source.code_content_sha256,
    execution_manifest_path: paths.manifest,
    execution_manifest_sha256: digest(manifestContent),
    execution_summary_path: paths.summary,
    output_path: nextOutputPath(
      explanationRoot(cwd, outputRoot),
      state,
      date,
      time,
    ),
    metadata_path: artifactRelativePath(
      state,
      `artifacts/05-code/${workItem.story_id}/change-explanation.json`,
    ),
    prepared_at: iso,
  };
  return {
    ...requestWithoutTask,
    task: buildTask(state, requestWithoutTask),
  };
}

function countMatches(value: string, pattern: RegExp): number {
  return [...value.matchAll(pattern)].length;
}

export function validateHtmlChangeExplanation(html: string): void {
  if (!html.trim() || Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) {
    throw new Error(
      `HTML change explanation must be non-empty and at most ${MAX_HTML_BYTES} bytes.`,
    );
  }
  if (!/^\s*<!doctype html>/i.test(html) || !/<\/html>\s*$/i.test(html)) {
    throw new Error(
      'HTML change explanation must be one complete HTML document.',
    );
  }
  if (
    !/<meta\b[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/i.test(
      html,
    ) ||
    !/default-src\s+'none'/i.test(html)
  ) {
    throw new Error(
      "HTML change explanation must declare an inline-only Content Security Policy with default-src 'none'.",
    );
  }
  if (!/<style\b[^>]*>[\s\S]*<\/style>/i.test(html)) {
    throw new Error('HTML change explanation must contain inline CSS.');
  }
  const inlineStyles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((match) => match[1])
    .join('\n');
  if (
    !['header', 'nav', 'main'].every((tag) =>
      new RegExp(`<${tag}\\b`, 'i').test(html),
    )
  ) {
    throw new Error(
      'HTML change explanation must use a semantic header, navigation, and main content shell.',
    );
  }
  if (!/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*<\/script>/i.test(html)) {
    throw new Error('HTML change explanation must contain inline JavaScript.');
  }
  const inlineScripts = [
    ...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi),
  ]
    .map((match) => match[1])
    .join('\n');
  for (const section of ['background', 'intuition', 'code', 'quiz']) {
    const id = new RegExp(
      `<section\\b[^>]*\\bid=["']${section}["'][^>]*>`,
      'i',
    );
    const link = new RegExp(`href=["']#${section}["']`, 'i');
    if (!id.test(html) || !link.test(html)) {
      throw new Error(
        `HTML change explanation requires section #${section} and a table-of-contents link.`,
      );
    }
  }
  if (
    !/<pre\b/i.test(html) ||
    !/pre\s*\{[^}]*white-space\s*:\s*pre(?:-wrap)?\b/is.test(html)
  ) {
    throw new Error(
      'HTML change explanation must render code in <pre> elements with white-space: pre or pre-wrap.',
    );
  }
  const questionCount = countMatches(
    html,
    /<(?:article|section|div)\b[^>]*\bdata-quiz-question(?:\s*=\s*["'][^"']*["'])?[^>]*>/gi,
  );
  if (questionCount !== 5) {
    throw new Error(
      `HTML change explanation must contain exactly five data-quiz-question elements; found ${questionCount}.`,
    );
  }
  if (
    countMatches(
      html,
      /<button\b[^>]*\bdata-correct\s*=\s*["']true["'][^>]*>/gi,
    ) !== 5 ||
    countMatches(
      html,
      /<(?:p|div)\b[^>]*\bdata-quiz-feedback(?:\s*=\s*["'][^"']*["'])?[^>]*>/gi,
    ) !== 5 ||
    !/addEventListener\s*\(/i.test(html)
  ) {
    throw new Error(
      'HTML change explanation must provide one correct answer, feedback, and interaction logic for every quiz question.',
    );
  }
  if (
    /<script\b[^>]*\bsrc\s*=/i.test(html) ||
    /<link\b[^>]*\bhref\s*=/i.test(html) ||
    /<(?:img|source|video|audio)\b[^>]*\bsrc\s*=\s*["'](?!data:)[^"']+/i.test(
      html,
    ) ||
    /@import\s+/i.test(inlineStyles) ||
    /url\s*\(\s*["']?(?!data:)[^)]+\)/i.test(inlineStyles) ||
    /\b(?:fetch|WebSocket|EventSource|import)\s*\(/i.test(inlineScripts) ||
    /\bnew\s+XMLHttpRequest\b/i.test(inlineScripts) ||
    /<(?:iframe|object|embed)\b/i.test(html)
  ) {
    throw new Error(
      'HTML change explanation must be self-contained and cannot load external resources or embedded pages.',
    );
  }
}

export function readHtmlChangeExplanationRecord(
  cwd: string,
  state: WorkflowState = readState(cwd),
): HtmlChangeExplanationRecord | undefined {
  const storyId = state.active_work_item?.story_id;
  if (!storyId || state.pair_session?.checkpoint !== 'quality_gates_passed') {
    return undefined;
  }
  const expectedPath = artifactRelativePath(
    state,
    `artifacts/05-code/${storyId}/change-explanation.json`,
  );
  const absolutePath = join(cwd, expectedPath);
  if (!existsSync(absolutePath)) return undefined;
  const record = JSON.parse(
    readFileSync(absolutePath, 'utf8'),
  ) as HtmlChangeExplanationRecord;
  if (
    record.version !== 1 ||
    record.story_id !== storyId ||
    JSON.stringify(record.scenario_ids) !==
      JSON.stringify(state.active_work_item?.scenario_ids) ||
    record.git_baseline !== state.active_work_item?.git_baseline ||
    !record.git_head ||
    !record.execution_manifest_path ||
    !isAbsolute(record.output_path) ||
    isInside(cwd, record.output_path) ||
    !/^[a-f0-9]{64}$/.test(record.code_content_sha256) ||
    !/^[a-f0-9]{64}$/.test(record.execution_manifest_sha256) ||
    !/^[a-f0-9]{64}$/.test(record.html_sha256) ||
    record.artifact_path !== expectedPath ||
    record.generated_by !== 'change-explainer' ||
    Number.isNaN(new Date(record.generated_at).getTime())
  ) {
    throw new Error(
      `Invalid HTML change explanation metadata: ${expectedPath}.`,
    );
  }
  const paths = executionEvidencePaths(cwd);
  if (
    paths.manifest !== record.execution_manifest_path ||
    !existsSync(join(cwd, record.execution_manifest_path)) ||
    !existsSync(record.output_path)
  ) {
    return undefined;
  }
  const manifestContent = readFileSync(
    join(cwd, record.execution_manifest_path),
  );
  const manifest = JSON.parse(manifestContent.toString('utf8')) as {
    source?: { code_content_sha256?: string; git_head?: string };
  };
  if (
    digest(manifestContent) !== record.execution_manifest_sha256 ||
    manifest.source?.code_content_sha256 !== record.code_content_sha256 ||
    manifest.source?.git_head !== record.git_head ||
    digest(readFileSync(record.output_path)) !== record.html_sha256
  ) {
    return undefined;
  }
  return record;
}

export function recordHtmlChangeExplanation(
  cwd: string,
  request: HtmlChangeExplanationRequest,
  html: string,
  now = new Date().toISOString(),
): HtmlChangeExplanationRecord {
  const state = readyPairState(cwd);
  const workItem = state.active_work_item;
  if (
    !workItem ||
    request.version !== 1 ||
    request.story_id !== workItem.story_id ||
    JSON.stringify(request.scenario_ids) !==
      JSON.stringify(workItem.scenario_ids) ||
    request.git_baseline !== workItem.git_baseline ||
    request.git_head !== git(cwd, ['rev-parse', '--verify', 'HEAD'])
  ) {
    throw new Error(
      'HTML change explanation request drifted from the Pair work item.',
    );
  }
  if (isInside(cwd, request.output_path)) {
    throw new Error(
      'HTML change explanation output must remain outside the repository.',
    );
  }
  const manifest = validateExecutionEvidence(cwd, workItem);
  const paths = executionEvidencePaths(cwd);
  const expectedMetadataPath = artifactRelativePath(
    state,
    `artifacts/05-code/${workItem.story_id}/change-explanation.json`,
  );
  if (
    request.execution_manifest_path !== paths.manifest ||
    request.execution_summary_path !== paths.summary ||
    request.metadata_path !== expectedMetadataPath ||
    !request.output_path.endsWith('.html')
  ) {
    throw new Error(
      'HTML change explanation paths drifted from Pair evidence.',
    );
  }
  const manifestContent = readFileSync(
    join(cwd, request.execution_manifest_path),
  );
  if (
    digest(manifestContent) !== request.execution_manifest_sha256 ||
    manifest.source.code_content_sha256 !== request.code_content_sha256 ||
    manifest.source.git_head !== request.git_head
  ) {
    throw new Error(
      'HTML change explanation inputs changed after the explanation run started.',
    );
  }
  validateHtmlChangeExplanation(html);
  const generatedAt = timestampParts(now).iso;
  const record: HtmlChangeExplanationRecord = {
    version: 1,
    story_id: request.story_id,
    scenario_ids: [...request.scenario_ids],
    git_baseline: request.git_baseline,
    git_head: request.git_head,
    code_content_sha256: request.code_content_sha256,
    execution_manifest_path: request.execution_manifest_path,
    execution_manifest_sha256: request.execution_manifest_sha256,
    output_path: request.output_path,
    html_sha256: digest(html),
    artifact_path: request.metadata_path,
    generated_by: 'change-explainer',
    generated_at: generatedAt,
  };
  const metadataPath = artifactPath(
    cwd,
    state,
    `artifacts/05-code/${workItem.story_id}/change-explanation.json`,
  );
  if (metadataPath !== join(cwd, expectedMetadataPath)) {
    throw new Error('HTML change explanation metadata path drifted.');
  }
  mkdirSync(dirname(request.output_path), { recursive: true });
  writeFileSync(request.output_path, html);
  mkdirSync(dirname(metadataPath), { recursive: true });
  writeFileSync(metadataPath, `${JSON.stringify(record, null, 2)}\n`);
  return record;
}
