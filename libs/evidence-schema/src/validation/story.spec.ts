import { describe, expect, it } from 'vitest';
import {
  strictValidateDomainModel,
  StoryStepASTSchema,
  type StoryStepAST,
  type DomainStoryAST,
} from '../index.js';
import { loadFixtureModel } from '../../tests/support/fixtures.js';

const step: StoryStepAST = {
  id: 'pay',
  sequence: 1,
  actorRef: 'role.buyer',
  activity: '发起',
  workObjectRef: 'request.payment',
  targetActorRef: 'role.seller',
  asOf: '2026-03-31T10:00:00Z',
  basedOn: [],
  values: {},
};
const parent: DomainStoryAST = {
  type: 'story',
  id: 'payment',
  title: '付款',
  kind: 'primary',
  steps: [step, { ...step, id: 'finish', sequence: 2, basedOn: ['pay'] }],
};
const child: DomainStoryAST = {
  ...parent,
  id: 'late',
  kind: 'breach_branch',
  forkedFrom: { storyId: 'payment', stepId: 'pay' },
  steps: [
    {
      ...step,
      basedOn: ['payment#pay'],
      expectedStatus: 422,
      inputs: { amount: -1 },
      expect: { '$.error': 'INVALID' },
    },
  ],
};
const validate = (...stories: DomainStoryAST[]) =>
  strictValidateDomainModel({ ...loadFixtureModel(), stories });

describe('domain story validation', () => {
  it('scopes equal step IDs to their owner and permits inherited inputs', () => {
    expect(validate(parent, child).issues).toEqual([]);
  });
  it('refuses a missing anchor, sibling, forward, rejected, or later dependency', () => {
    for (const ref of ['payment#finish', 'unknown', 'pay', 'other#pay'])
      expect(
        validate(parent, { ...child, steps: [{ ...step, basedOn: [ref] }] })
          .issues[0]?.code,
      ).toBe('story.dependency');
    for (const source of [
      { ...step, expectedStatus: 400 },
      { ...step, asOf: '2027-01-01T00:00:00Z' },
    ])
      expect(
        validate({ ...parent, steps: [source] }, child).issues[0]?.code,
      ).toBe('story.dependency');
    expect(
      validate(parent, {
        ...child,
        forkedFrom: { storyId: 'payment', stepId: 'absent' },
      }).issues[0]?.code,
    ).toBe('story.fork');
    expect(
      validate(
        { ...parent, forkedFrom: { storyId: 'late', stepId: 'pay' } },
        child,
      ).issues[0]?.code,
    ).toBe('story.fork');
  });
  it('validates roles, evidence, values, trigger rules and capture sources', () => {
    for (const patch of [
      { actorRef: 'request.payment' },
      { targetActorRef: 'role.missing' },
      { workObjectRef: 'role.buyer' },
      { values: { missing: true } },
      { values: { started_at: 'yesterday' } },
      { pathParameters: { id: { stepRef: 'absent', jsonpath: '$.id' } } },
    ])
      expect(
        validate({ ...parent, steps: [{ ...step, ...patch }] }).valid,
      ).toBe(false);
    expect(
      validate(parent, {
        ...child,
        forkedFrom: { ...child.forkedFrom!, triggerRuleRef: 'rule.ghost' },
      }).valid,
    ).toBe(false);
  });
  it('requires unique story and step identities and sequence numbers', () => {
    expect(validate(parent, parent).valid).toBe(false);
    for (const extra of [
      { ...step, id: 'also-pay' },
      { ...step, sequence: 2 },
    ])
      expect(validate({ ...parent, steps: [step, extra] }).valid).toBe(false);
  });
  it('checks clocks, JSON facts and negative HTTP overrides', () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    for (const patch of [
      { inputs: {} },
      { asOf: 'yesterday' },
      { asOf: '2026-02-30T00:00:00Z' },
      { values: cycle },
      { values: { amount: Infinity } },
      { expect: { error: true } },
      { basedOn: ['a', 'a'] },
      { expectedStatus: 201.5 },
    ])
      expect(StoryStepASTSchema.safeParse({ ...step, ...patch }).success).toBe(
        false,
      );
  });
});
