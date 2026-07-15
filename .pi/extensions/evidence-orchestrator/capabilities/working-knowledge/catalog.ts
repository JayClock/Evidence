import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';

export const WORKING_KNOWLEDGE_CATALOG =
  'engineering/evidence-orchestrator/working-knowledge-catalog.json';

export type CognitiveBehavior = 'clear' | 'complicated' | 'complex';

export interface WorkingKnowledgeEntry {
  id: string;
  version: string;
  owner: string;
  cognitive_behaviors: CognitiveBehavior[];
  skill_path: string | null;
  prompt_paths: string[];
  validated_scenarios: string[];
  latest_feedback: string;
  supersedes: string[];
}

export interface WorkingKnowledgeCatalog {
  version: 1;
  owner: string;
  entries: WorkingKnowledgeEntry[];
}

interface Frontmatter {
  name?: string;
  description?: string;
}

function object(value: unknown, subject: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${subject} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, subject: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${subject} must be a non-empty string.`);
  }
  return value;
}

function texts(value: unknown, subject: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${subject} must be a string array.`);
  }
  return value as string[];
}

function projectPath(cwd: string, path: string, subject: string): string {
  if (path.startsWith('/') || path.includes('\\')) {
    throw new Error(`${subject} must be a project-relative POSIX path.`);
  }
  const absolute = resolve(cwd, path);
  const fromRoot = relative(resolve(cwd), absolute);
  if (fromRoot.startsWith('..') || fromRoot === '') {
    throw new Error(`${subject} escapes or aliases the project root.`);
  }
  return absolute;
}

function frontmatter(path: string): Frontmatter {
  const source = readFileSync(path, 'utf8');
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error(`${path} has no YAML frontmatter.`);
  const result: Frontmatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^(name|description):\s*(.+)$/);
    if (field) result[field[1] as keyof Frontmatter] = field[2].trim();
  }
  return result;
}

function discoverSkillPaths(cwd: string): string[] {
  const root = join(cwd, '.pi/skills');
  if (!existsSync(root)) return [];
  const found: string[] = [];
  const visit = (directory: string) => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      if (!statSync(path).isDirectory()) continue;
      const skill = join(path, 'SKILL.md');
      if (existsSync(skill)) found.push(relative(cwd, skill));
      else visit(path);
    }
  };
  visit(root);
  return found.sort();
}

function discoverPromptPaths(cwd: string): string[] {
  const root = join(cwd, '.pi/prompts');
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter(
      (name) => extname(name) === '.md' && statSync(join(root, name)).isFile(),
    )
    .sort()
    .map((name) => relative(cwd, join(root, name)));
}

function validateSkill(cwd: string, entry: WorkingKnowledgeEntry): void {
  const path = entry.skill_path;
  if (!path) return;
  if (!/^\.pi\/skills\/.+\/SKILL\.md$/.test(path)) {
    throw new Error(
      `${entry.id} skill_path is not a discoverable project Skill.`,
    );
  }
  const absolute = projectPath(cwd, path, `${entry.id} skill_path`);
  if (!existsSync(absolute))
    throw new Error(`${entry.id} Skill is missing: ${path}.`);
  const metadata = frontmatter(absolute);
  const name = text(metadata.name, `${entry.id} Skill name`);
  text(metadata.description, `${entry.id} Skill description`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64) {
    throw new Error(`${entry.id} has an invalid Skill name: ${name}.`);
  }
  const evalPath = join(dirname(absolute), 'evals/evals.json');
  if (!existsSync(evalPath)) {
    throw new Error(`${entry.id} must provide reviewable evals/evals.json.`);
  }
  const evaluation = object(
    JSON.parse(readFileSync(evalPath, 'utf8')) as unknown,
    `${entry.id} evals`,
  );
  if (evaluation.skill_name !== name) {
    throw new Error(`${entry.id} eval skill_name must match ${name}.`);
  }
  if (!Array.isArray(evaluation.evals) || evaluation.evals.length === 0) {
    throw new Error(`${entry.id} must provide at least one reviewable eval.`);
  }
  for (const [index, item] of evaluation.evals.entries()) {
    const candidate = object(item, `${entry.id} eval ${index + 1}`);
    text(candidate.prompt, `${entry.id} eval ${index + 1} prompt`);
    text(
      candidate.expected_output,
      `${entry.id} eval ${index + 1} expected_output`,
    );
  }
}

function validatePrompt(
  cwd: string,
  entry: WorkingKnowledgeEntry,
  path: string,
): void {
  if (!/^\.pi\/prompts\/[^/]+\.md$/.test(path)) {
    throw new Error(
      `${entry.id} prompt is not directly discoverable by Pi: ${path}.`,
    );
  }
  const absolute = projectPath(cwd, path, `${entry.id} prompt path`);
  if (!existsSync(absolute))
    throw new Error(`${entry.id} Prompt is missing: ${path}.`);
  text(frontmatter(absolute).description, `${entry.id} Prompt description`);
  if (entry.skill_path || entry.cognitive_behaviors.join(',') !== 'clear') {
    throw new Error(
      `${entry.id} Clear Prompt must be prompt-only and declare cognitive_behaviors=["clear"].`,
    );
  }
}

function parseEntry(value: unknown, index: number): WorkingKnowledgeEntry {
  const item = object(value, `Working Knowledge entry ${index + 1}`);
  const skill = item.skill_path;
  if (skill !== null && typeof skill !== 'string') {
    throw new Error(
      `Working Knowledge entry ${index + 1} skill_path must be a string or null.`,
    );
  }
  const behaviors = texts(
    item.cognitive_behaviors,
    `Working Knowledge entry ${index + 1} cognitive_behaviors`,
  );
  if (
    behaviors.length === 0 ||
    behaviors.some(
      (behavior) => !['clear', 'complicated', 'complex'].includes(behavior),
    )
  ) {
    throw new Error(
      `Working Knowledge entry ${index + 1} has invalid cognitive behaviors.`,
    );
  }
  return {
    id: text(item.id, `Working Knowledge entry ${index + 1} id`),
    version: text(item.version, `Working Knowledge entry ${index + 1} version`),
    owner: text(item.owner, `Working Knowledge entry ${index + 1} owner`),
    cognitive_behaviors: behaviors as CognitiveBehavior[],
    skill_path: skill as string | null,
    prompt_paths: texts(
      item.prompt_paths,
      `Working Knowledge entry ${index + 1} prompt_paths`,
    ),
    validated_scenarios: texts(
      item.validated_scenarios,
      `Working Knowledge entry ${index + 1} validated_scenarios`,
    ),
    latest_feedback: text(
      item.latest_feedback,
      `Working Knowledge entry ${index + 1} latest_feedback`,
    ),
    supersedes: texts(
      item.supersedes,
      `Working Knowledge entry ${index + 1} supersedes`,
    ),
  };
}

export function validateWorkingKnowledgeCatalog(
  cwd: string,
): WorkingKnowledgeCatalog {
  const absolute = join(cwd, WORKING_KNOWLEDGE_CATALOG);
  if (!existsSync(absolute)) {
    throw new Error(
      `Working Knowledge catalog is missing: ${WORKING_KNOWLEDGE_CATALOG}.`,
    );
  }
  const raw = object(
    JSON.parse(readFileSync(absolute, 'utf8')) as unknown,
    'Working Knowledge catalog',
  );
  if (raw.version !== 1)
    throw new Error('Working Knowledge catalog version must be 1.');
  const entriesRaw = raw.entries;
  if (!Array.isArray(entriesRaw) || entriesRaw.length === 0) {
    throw new Error('Working Knowledge catalog must contain entries.');
  }
  const catalog: WorkingKnowledgeCatalog = {
    version: 1,
    owner: text(raw.owner, 'Working Knowledge catalog owner'),
    entries: entriesRaw.map(parseEntry),
  };
  const ids = new Set<string>();
  const skillPaths = new Set<string>();
  const promptPaths = new Set<string>();
  for (const entry of catalog.entries) {
    if (ids.has(entry.id))
      throw new Error(`Duplicate Working Knowledge id: ${entry.id}.`);
    ids.add(entry.id);
    if (!/^WK-[A-Z0-9-]+$/.test(entry.id)) {
      throw new Error(`Invalid Working Knowledge id: ${entry.id}.`);
    }
    if (!/^\d+\.\d+\.\d+$/.test(entry.version)) {
      throw new Error(`${entry.id} version must use semantic x.y.z format.`);
    }
    if (entry.validated_scenarios.length === 0) {
      throw new Error(`${entry.id} must cite at least one validated Scenario.`);
    }
    if (!entry.skill_path && entry.prompt_paths.length === 0) {
      throw new Error(`${entry.id} must reference a Skill or Prompt.`);
    }
    if (entry.skill_path) {
      if (skillPaths.has(entry.skill_path)) {
        throw new Error(
          `Duplicate Working Knowledge Skill path: ${entry.skill_path}.`,
        );
      }
      skillPaths.add(entry.skill_path);
      if (entry.cognitive_behaviors.includes('clear')) {
        throw new Error(
          `${entry.id} must use a Prompt rather than a Skill for Clear work.`,
        );
      }
      validateSkill(cwd, entry);
    }
    for (const path of entry.prompt_paths) {
      if (promptPaths.has(path)) {
        throw new Error(`Duplicate Working Knowledge Prompt path: ${path}.`);
      }
      promptPaths.add(path);
      validatePrompt(cwd, entry, path);
    }
  }
  for (const entry of catalog.entries) {
    for (const predecessor of entry.supersedes) {
      if (predecessor === entry.id || !ids.has(predecessor)) {
        throw new Error(
          `${entry.id} supersedes unknown or self id ${predecessor}.`,
        );
      }
    }
  }
  const missingSkills = discoverSkillPaths(cwd).filter(
    (path) => !skillPaths.has(path),
  );
  const missingPrompts = discoverPromptPaths(cwd).filter(
    (path) => !promptPaths.has(path),
  );
  if (missingSkills.length > 0) {
    throw new Error(`Uncataloged project Skills: ${missingSkills.join(', ')}.`);
  }
  if (missingPrompts.length > 0) {
    throw new Error(
      `Uncataloged project Prompts: ${missingPrompts.join(', ')}.`,
    );
  }
  return catalog;
}

export function workingKnowledgeInstruction(cwd: string, id: string): string {
  const catalog = validateWorkingKnowledgeCatalog(cwd);
  const entry = catalog.entries.find((candidate) => candidate.id === id);
  if (!entry?.skill_path)
    throw new Error(`${id} is not an active Skill entry.`);
  return `Load and follow ${entry.skill_path}; keep method detail there rather than duplicating it in the activity task.`;
}

export function promptCommand(path: string): string {
  return `/${basename(path, '.md')}`;
}
