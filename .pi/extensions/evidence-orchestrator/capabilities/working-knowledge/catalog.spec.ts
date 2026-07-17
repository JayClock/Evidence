import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  validateWorkingKnowledgeCatalog,
  WORKING_KNOWLEDGE_CATALOG,
} from './catalog';

const roots: string[] = [];

function fixture(): string {
  const cwd = mkdtempSync(join(tmpdir(), 'evidence-wk-'));
  roots.push(cwd);
  mkdirSync(join(cwd, '.pi'), { recursive: true });
  cpSync(join(process.cwd(), '.pi/skills'), join(cwd, '.pi/skills'), {
    recursive: true,
  });
  cpSync(join(process.cwd(), '.pi/prompts'), join(cwd, '.pi/prompts'), {
    recursive: true,
  });
  mkdirSync(join(cwd, 'engineering/evidence-orchestrator'), {
    recursive: true,
  });
  cpSync(
    join(process.cwd(), WORKING_KNOWLEDGE_CATALOG),
    join(cwd, WORKING_KNOWLEDGE_CATALOG),
  );
  return cwd;
}

function mutateCatalog(
  cwd: string,
  mutate: (catalog: Record<string, unknown>) => void,
): void {
  const path = join(cwd, WORKING_KNOWLEDGE_CATALOG);
  const catalog = JSON.parse(readFileSync(path, 'utf8')) as Record<
    string,
    unknown
  >;
  mutate(catalog);
  writeFileSync(path, `${JSON.stringify(catalog, null, 2)}\n`);
}

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe('Working Knowledge catalog', () => {
  it('catalogs every discoverable Skill and Prompt with review evidence', () => {
    const catalog = validateWorkingKnowledgeCatalog(process.cwd());

    expect(catalog.entries.map((entry) => entry.id)).toEqual(
      expect.arrayContaining([
        'WK-STORY-TQA',
        'WK-MODELING-ROUTER',
        'WK-MODEL-EXPANSION',
        'WK-8X-FLOW',
        'WK-TEST-PROCESS',
        'WK-PAIRING',
        'WK-CHANGE-EXPLANATION',
        'WK-PROMPT-MODEL-CHECK',
        'WK-PROMPT-TEST-LIST',
        'WK-PROMPT-DESK-CHECK',
        'WK-PROMPT-EXECUTION-SUMMARY',
      ]),
    );
    expect(
      catalog.entries
        .filter((entry) => entry.cognitive_behaviors.includes('clear'))
        .every(
          (entry) => entry.skill_path === null && entry.prompt_paths.length > 0,
        ),
    ).toBe(true);

    const commandSource = readFileSync(
      join(
        process.cwd(),
        '.pi/extensions/evidence-orchestrator/adapters/pi/commands.ts',
      ),
      'utf8',
    );
    const extensionCommands = new Set(
      [...commandSource.matchAll(/registerCommand\('([^']+)'/g)].map(
        (match) => match[1],
      ),
    );
    const promptCommands = catalog.entries.flatMap((entry) =>
      entry.prompt_paths.map((path) => basename(path, '.md')),
    );
    expect(
      promptCommands.filter((command) => extensionCommands.has(command)),
    ).toEqual([]);
  });

  it('keeps each activity agent bounded by Skill triggers and stop conditions', () => {
    for (const agent of [
      'requirements-analyst',
      'domain-modeler',
      'model-challenger',
      'architect',
      'test-driver',
      'production-driver',
      'change-explainer',
      'showcase-reviewer',
      'respond-learner',
    ]) {
      const source = readFileSync(
        join(process.cwd(), `.pi/agents/${agent}.md`),
        'utf8',
      );
      expect(source, agent).toContain('## Skill 触发');
      expect(source, agent).toContain('## 停止条件');
    }
  });

  it('rejects a Clear task implemented as a heavyweight Skill', () => {
    const cwd = fixture();
    mutateCatalog(cwd, (catalog) => {
      const entries = catalog.entries as Array<Record<string, unknown>>;
      entries[0].cognitive_behaviors = ['clear'];
    });

    expect(() => validateWorkingKnowledgeCatalog(cwd)).toThrow(
      'must use a Prompt rather than a Skill for Clear work',
    );
  });

  it('rejects uncataloged discoverable Skills', () => {
    const cwd = fixture();
    mkdirSync(join(cwd, '.pi/skills/hidden'), { recursive: true });
    writeFileSync(
      join(cwd, '.pi/skills/hidden/SKILL.md'),
      '---\nname: hidden\ndescription: Hidden working knowledge.\n---\n',
    );

    expect(() => validateWorkingKnowledgeCatalog(cwd)).toThrow(
      'Uncataloged project Skills: .pi/skills/hidden/SKILL.md.',
    );
  });

  it('rejects Prompt paths Pi cannot discover', () => {
    const cwd = fixture();
    mutateCatalog(cwd, (catalog) => {
      const entries = catalog.entries as Array<Record<string, unknown>>;
      const entry = entries.find(
        (candidate) => candidate.id === 'WK-PROMPT-MODEL-CHECK',
      );
      if (!entry) throw new Error('Expected model-check catalog entry.');
      entry.prompt_paths = ['.pi/prompts/nested/evidence-model-check.md'];
    });

    expect(() => validateWorkingKnowledgeCatalog(cwd)).toThrow(
      'prompt is not directly discoverable by Pi',
    );
  });
});
