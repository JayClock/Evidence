import type { DomainGraph } from '@evidence-poc/evidence-model-core';
import {
  evidenceStageOf,
  isContextEntity,
  isFulfillmentConfirmation,
  isPartyRole,
  timeAttributeOf,
  type EvidenceEntityAST,
} from '@evidence-poc/evidence-schema';

type NextQuestion =
  | 'clarify_channel_response'
  | 'clarify_agreement_and_parties'
  | 'clarify_fulfillment'
  | 'clarify_time_window'
  | 'clarify_change_point';

const named = ({ id, label }: { id: string; label: string }) => ({ id, label });
const fulfillmentMoment = (entity: EvidenceEntityAST) => ({
  ...named(entity),
  responsibleRoleRef: entity.responsibleRoleRef,
});

/** Graph facts and one suggested question, never an interview state or gate. */
export const focusedBusinessContext = (
  graph: DomainGraph,
  entity: EvidenceEntityAST,
) => {
  const stage = evidenceStageOf(entity);
  const context = entity.contextRef && graph.getEntity(entity.contextRef);
  const contract =
    entity.kind === 'contract'
      ? entity
      : context && isContextEntity(context) && context.kind === 'contract'
        ? graph.rootContractOf(context.id)
        : undefined;
  const parties = (contract?.roleRefs ?? [])
    .map((id) => graph.getEntity(id))
    .filter(isPartyRole)
    .map((role) => ({
      ...named(role),
      participantRefs: graph
        .incoming(role.id)
        .filter(({ kind }) => kind === 'plays_role')
        .map(({ sourceRef }) => sourceRef),
    }));
  const channelResponses =
    stage === 'rfp' || stage === 'proposal'
      ? graph
          .preContractPairs()
          .flatMap(({ rfp, proposals }) =>
            rfp.id === entity.id || proposals.some(({ id }) => id === entity.id)
              ? [{ rfp: named(rfp), proposals: proposals.map(named) }]
              : [],
          )
      : [];
  const pairs =
    stage === 'fulfillment'
      ? graph
          .fulfillmentPairs()
          .filter(
            ({ request, confirmations, proofs }) =>
              request.id === entity.id ||
              confirmations.some(({ id }) => id === entity.id) ||
              proofs.some(({ id }) => id === entity.id),
          )
      : [];
  const fulfillments = pairs.map(({ request, confirmations }) => ({
    request: fulfillmentMoment(request),
    deadline: timeAttributeOf(request, 'deadline'),
    confirmations: confirmations.map(fulfillmentMoment),
    breachOutcomes: graph.breachOutcomesOf(request.id).map((branch) => ({
      kind: branch.kind,
      condition: branch.edge.notes,
      ...(branch.kind === 'compensation_pair'
        ? { requestRef: branch.compensation.request.id }
        : { handoffRef: branch.handoff.id, remedyKind: branch.remedyKind }),
    })),
  }));
  const subjectMatters = graph.subjectMattersOf(entity.id).map(named);
  const outgoing = graph.outgoing(entity.id);
  const isTerminalHandoff = outgoing.some(
    (edge) =>
      edge.flowKind === 'escalation' && edge.terminalRemedyKind !== undefined,
  );
  const socketIds =
    entity.contextRef === undefined
      ? new Set<string>()
      : new Set(
          graph.socketRolesInContext(entity.contextRef).map(({ id }) => id),
        );
  const referenced = outgoing
    .filter(
      ({ kind, flowKind }) =>
        kind === 'references' &&
        (flowKind === undefined || flowKind === 'primary'),
    )
    .map(({ targetRef }) => targetRef);
  const socketRoleRefs = referenced.filter((id) => socketIds.has(id));
  const externalConfirmations =
    isFulfillmentConfirmation(entity) && entity.contextRef !== undefined
      ? referenced
          .map((id) => graph.getEntity(id))
          .filter(isFulfillmentConfirmation)
          .filter(
            ({ contextRef }) =>
              contextRef !== undefined && contextRef !== entity.contextRef,
          )
          .map(named)
      : [];

  let suggestedNextStep: NextQuestion | undefined;
  if (stage === 'rfp' || stage === 'proposal') {
    if (channelResponses.length === 0)
      suggestedNextStep = 'clarify_channel_response';
  } else if (!isTerminalHandoff) {
    if (stage === 'contract' && parties.length < 2) {
      suggestedNextStep = 'clarify_agreement_and_parties';
    } else if (stage === 'fulfillment') {
      if (
        pairs.length === 0 ||
        fulfillments.some(({ confirmations }) => confirmations.length === 0)
      ) {
        suggestedNextStep = 'clarify_fulfillment';
      } else if (
        !contract ||
        parties.length < 2 ||
        fulfillments.some(
          ({ request, confirmations }) =>
            request.responsibleRoleRef === undefined ||
            confirmations.some(
              ({ responsibleRoleRef }) => responsibleRoleRef === undefined,
            ),
        )
      ) {
        suggestedNextStep = 'clarify_agreement_and_parties';
      } else if (fulfillments.some(({ deadline }) => deadline === undefined)) {
        suggestedNextStep = 'clarify_time_window';
      } else if (externalConfirmations.length > 0) {
        suggestedNextStep = 'clarify_change_point';
      }
    }
  }

  return {
    stage,
    context:
      context && isContextEntity(context)
        ? { ...named(context), kind: context.kind }
        : null,
    contract: contract ? named(contract) : null,
    parties,
    channelResponses,
    fulfillments,
    subjectMatters,
    isTerminalHandoff,
    externalConfirmations,
    socketRoleRefs,
    suggestedNextStep,
  };
};
