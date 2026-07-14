import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  eightXValidationIssues,
  validateEightXModel,
  type EightXModelSource,
} from './eight-x';

function entity(id: string, content: string): EightXModelSource {
  return {
    path: `.evidence/entities/${id}.yaml`,
    content: `id: ${id}\n${content.trim()}\n`,
  };
}

function association(id: string, content: string): EightXModelSource {
  return {
    path: `.evidence/associations/${id}.yaml`,
    content: `id: ${id}\nkind: association\n${content.trim()}\n`,
  };
}

function validEightXModel(): EightXModelSource[] {
  return [
    entity(
      'context-contract',
      'name: ContractContext\ntype: CONTEXT\nsubType: bounded_context\ncontextKind: contract',
    ),
    entity(
      'context-fulfillment',
      'name: FulfillmentContext\ntype: CONTEXT\nsubType: bounded_context\ncontextKind: fulfillment',
    ),
    entity(
      'buyer-role',
      'name: BuyerRole\ntype: ROLE\nsubType: party\nparent: context-contract',
    ),
    entity(
      'laptop',
      'name: Laptop\ntype: PARTICIPANT\nsubType: thing\nparent: context-contract',
    ),
    entity(
      'purchase-contract',
      'name: PurchaseContract\ntype: EVIDENCE\nsubType: contract\nparent: context-contract',
    ),
    entity(
      'delivery-request',
      'name: DeliveryRequest\ntype: EVIDENCE\nsubType: fulfillment_request\nparent: context-fulfillment\ntimeConstraint: P2D\ntimeoutOutcome: breach',
    ),
    entity(
      'delivery-confirmation',
      'name: DeliveryConfirmation\ntype: EVIDENCE\nsubType: fulfillment_confirmation\nparent: context-fulfillment',
    ),
    association(
      'contract-governs-buyer',
      'name: ContractGovernsBuyer\nsource: purchase-contract\ntarget: buyer-role\nrelationshipType: governed_role',
    ),
    association(
      'contract-subject-laptop',
      'name: ContractSubjectLaptop\nsource: purchase-contract\ntarget: laptop\nrelationshipType: contract_subject',
    ),
    association(
      'confirmation-confirms-request',
      'name: ConfirmationConfirmsRequest\nsource: delivery-confirmation\ntarget: delivery-request\nrelationshipType: confirms_request',
    ),
  ];
}

const eightXProfile = {
  subject: 'business' as const,
  method: 'eight_x_flow' as const,
};

describe('8X Flow method validator', () => {
  it('ships project-owned Working Knowledge with a positive example and counterexample', () => {
    const skill = readFileSync(
      join(process.cwd(), '.pi/skills/evidence-8x-flow/SKILL.md'),
      'utf8',
    );

    expect(skill).toContain('name: evidence-8x-flow');
    expect(skill).toContain('## Positive example');
    expect(skill).toContain('## Counterexample');
    expect(skill).toContain('examples/laptop-procurement/.evidence/');
    expect(skill).not.toContain('AI 时代的软件工程/');
    expect(skill).not.toContain('如何落地业务建模/');
  });

  it('accepts a contract and Request-Confirmation business chain', () => {
    expect(() =>
      validateEightXModel(eightXProfile, validEightXModel()),
    ).not.toThrow();
  });

  it('does not run for non-8X Profiles', () => {
    const invalid = [
      entity(
        'orphan-confirmation',
        'type: EVIDENCE\nsubType: fulfillment_confirmation',
      ),
    ];

    expect(
      eightXValidationIssues({ subject: 'domain', method: 'object' }, invalid),
    ).toEqual([]);
  });

  it('rejects an isolated Confirmation in business language', () => {
    const sources = validEightXModel().filter(
      ({ path }) => !path.endsWith('confirmation-confirms-request.yaml'),
    );

    expect(() => validateEightXModel(eightXProfile, sources)).toThrow(
      '履约确认 delivery-confirmation 必须通过 relationshipType=confirms_request 追溯到对应履约请求',
    );
  });

  it('rejects a Request without a business context, deadline, or timeout outcome', () => {
    const sources = validEightXModel().map((source) =>
      source.path.endsWith('delivery-request.yaml')
        ? entity(
            'delivery-request',
            'name: DeliveryRequest\ntype: EVIDENCE\nsubType: fulfillment_request',
          )
        : source,
    );

    const issues = eightXValidationIssues(eightXProfile, sources);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('明确业务上下文'),
        expect.stringContaining('业务履约时限'),
        expect.stringContaining('不能用技术重试替代'),
      ]),
    );
  });

  it('requires explicit evidence-role semantics across contexts', () => {
    const sources = validEightXModel().map((source) =>
      source.path.endsWith('delivery-confirmation.yaml')
        ? entity(
            'delivery-confirmation',
            'name: DeliveryConfirmation\ntype: EVIDENCE\nsubType: fulfillment_confirmation\nparent: context-contract',
          )
        : source,
    );

    expect(() => validateEightXModel(eightXProfile, sources)).toThrow(
      'crossContext=true 且 evidenceRole=fulfillment_confirmation',
    );
  });

  it('requires a Contract to name governed roles and its subject', () => {
    const sources = validEightXModel().filter(
      ({ path }) =>
        !path.endsWith('contract-governs-buyer.yaml') &&
        !path.endsWith('contract-subject-laptop.yaml'),
    );

    expect(() => validateEightXModel(eightXProfile, sources)).toThrow(
      '合同 purchase-contract 必须关联 governed_role 的参与角色和 contract_subject 的标的',
    );
  });
});
