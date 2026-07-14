import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  collectCodeFiles,
  ensureProjectDirs,
  missingPaths,
} from '../evidence/artifact-index';
import { validateDomainModelEvidence } from '../evidence/model-and-code';
import { recordPhaseFailure } from '../workflow/gates';
import { iterationRoot } from '../workflow/iteration-paths';
import { DEFAULT_STATE } from '../workflow/phase-catalog';
import { readState, writeState } from '../workflow/state-store';
import {
  cleanupWorkspaces,
  initializeGitRepository,
  workspace,
  write,
} from './support';

afterEach(cleanupWorkspaces);

describe('monorepo evidence discovery', () => {
  it('collects apps and libs code while excluding generated output', () => {
    const cwd = workspace();
    write(cwd, 'apps/web/src/app.tsx');
    write(cwd, 'apps/web/out-tsc/app.js');
    write(cwd, 'apps/server/target/debug/generated.rs');
    write(cwd, 'libs/web/ui/src/button.spec.tsx');
    expect(collectCodeFiles(cwd)).toEqual([
      'apps/web/src/app.tsx',
      'libs/web/ui/src/button.spec.tsx',
    ]);
  });

  it('treats empty required directories as missing', () => {
    const cwd = workspace();
    write(cwd, 'empty.md', '');
    expect(missingPaths(cwd, ['apps/', 'empty.md'])).toEqual([
      'apps/',
      'empty.md',
    ]);
  });

  it('does not precreate empty stage-shaped artifact directories', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);
    const root = iterationRoot(cwd, DEFAULT_STATE);
    ensureProjectDirs(cwd, root);
    expect(readdirSync(root).sort()).toEqual(['feedback', 'gates']);
  });
});

describe('single-Story feedback loop integration', () => {
  it('rejects an obsolete phase instead of migrating it', () => {
    const cwd = workspace();
    write(
      cwd,
      'evidence-state.json',
      JSON.stringify({ ...DEFAULT_STATE, phase: 'clarify' }),
    );
    expect(() => readState(cwd)).toThrow(
      'Unsupported Evidence Orchestrator phase: clarify',
    );
  });

  it('validates canonical model evidence in the v2 artifact layout', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    write(
      cwd,
      '.evidence/model.json',
      JSON.stringify({
        version: 1,
        project_name: 'Evidence',
        purpose: 'Model the Evidence product domain.',
      }),
    );
    write(
      cwd,
      '.evidence/entities/contract.yaml',
      'id: contract\nname: Contract\ntype: EVIDENCE\n',
    );
    write(
      cwd,
      '.evidence/entities/request.yaml',
      'id: request\nname: Request\ntype: EVIDENCE\n',
    );
    write(
      cwd,
      '.evidence/associations/contract-to-request.yaml',
      'id: contract-to-request\nsource: contract\ntarget: request\n',
    );
    execFileSync('git', ['add', '.evidence'], { cwd });
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Evidence Test',
        '-c',
        'user.email=evidence@example.test',
        'commit',
        '--quiet',
        '-m',
        'canonical model',
      ],
      { cwd },
    );
    const baseline = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd,
      encoding: 'utf8',
    }).trim();
    write(
      cwd,
      'artifacts/02-discovery/examples/US-001-SC-001.md',
      'Given a contract\nWhen a request is created\nThen it is linked\n',
    );
    write(
      cwd,
      'artifacts/03-model/model-snapshot.json',
      JSON.stringify({
        version: 1,
        git_baseline: baseline,
        model_root: '.evidence/',
        included_paths: [
          '.evidence/associations/contract-to-request.yaml',
          '.evidence/entities/contract.yaml',
          '.evidence/entities/request.yaml',
        ],
      }),
    );
    write(
      cwd,
      'artifacts/03-model/model-delta.json',
      JSON.stringify({
        version: 1,
        git_baseline: baseline,
        added: [],
        changed: [],
        removed: [],
        reason: 'The current model explains the example.',
      }),
    );
    write(
      cwd,
      'artifacts/03-model/expansions/US-001-SC-001.json',
      JSON.stringify({
        version: 1,
        work_item: { story_id: 'US-001', scenario_id: 'SC-001' },
        source_scenario: 'artifacts/02-discovery/examples/US-001-SC-001.md',
        model_refs: {
          entities: ['contract'],
          associations: ['contract-to-request'],
        },
        given: { entities: ['contract'], relationships: [] },
        when: { command: 'CreateRequest' },
        then: {
          created_entities: ['request'],
          changed_entities: [],
          created_relationships: ['contract-to-request'],
          removed_relationships: [],
        },
        invariants: ['Contract exists first.'],
        timeline: ['Contract', 'Request'],
      }),
    );
    expect(() => validateDomainModelEvidence(cwd)).not.toThrow();
  });

  it('opens an emergency feedback Gate only after the retry limit', () => {
    const cwd = workspace();
    writeState(cwd, { ...DEFAULT_STATE, max_rounds: 2 });
    expect(recordPhaseFailure(cwd, 'kickoff', 'first').pending_gate).toBeNull();
    const failed = recordPhaseFailure(cwd, 'kickoff', 'second');
    expect(failed.pending_gate).toBe('GATE-EMERGENCY-kickoff');
    expect(
      existsSync(
        join(
          cwd,
          'artifacts/iterations/ITER-0001/gates/GATE-EMERGENCY-kickoff.md',
        ),
      ),
    ).toBe(true);
  });
});
