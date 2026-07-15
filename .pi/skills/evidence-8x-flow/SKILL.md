---
name: evidence-8x-flow
description: >-
  Model Evidence business systems with 8X Flow semantics: pre-contract evidence,
  contracts, roles and things, fulfillment request/confirmation, deadlines,
  breach, compensation, and cross-context evidence. Use whenever the confirmed
  modeling Profile is business/eight_x_flow or the Scenario involves procurement,
  agreements, obligations, SLA/KPI fulfillment, auditable confirmations, or
  request-confirmation evidence chains. Do not use for a domain system or tool
  merely because it contains events or files.
---

# Evidence 8X Flow Modeling

Use this skill only after the human-confirmed Profile says:

```text
subject: business
method: eight_x_flow
```

8X Flow explains how a business accepts commitments and proves fulfillment. It is not a generic entity checklist and should not be forced onto domain algorithms, editors, infrastructure, or glue code.

## Modeling sequence

1. **Find the contract boundary**
   - Identify what each party promises, the governed roles, the subject/thing, KPI or acceptance condition, and the consequence of non-fulfillment.
   - Separate contract language from technical API or job execution details.

2. **Separate business contexts**
   - `pre_contract`: RFP, proposal, negotiation, and contract formation evidence.
   - `contract`: accepted rights, obligations, roles, subjects, and governing terms.
   - `fulfillment`: requests, confirmations, deadlines, breach, and compensation.
   - `domain`: reusable domain capability that is not itself a business commitment.

3. **Build the evidence chain**
   - When pre-contract evidence exists, preserve `RFP → Proposal → Contract` using `responds_to` and `forms_contract` relationships.
   - A `fulfillment_request` is the entitled party's business claim under a contract. Record its business deadline and timeout consequence.
   - A `fulfillment_confirmation` is auditable evidence that answers a request. Connect it with `confirms_request`.

4. **Model participants, roles, and things separately**
   - A participant is a party or thing.
   - A role expresses how a participant takes part in one context; do not replace a role with a user/account implementation type.
   - A contract normally links governed roles and its subject/thing. If the Scenario genuinely has neither, explain that explicitly instead of silently omitting them.

5. **Expose cross-context variation**
   - Evidence produced in one context may serve as fulfillment confirmation in another.
   - Mark that boundary explicitly. Cross-context confirmation is often where business variation, asynchronous handling, audit, or compensation appears.

6. **Expand time and failure behavior**
   - Show intermediate states between Request and Confirmation.
   - Express timeout as `breach`, `compensation`, or `manual_review`; a queue retry is an implementation mechanism, not the business outcome.
   - Include late confirmation, rejected evidence, partial fulfillment, and compensation only when the confirmed Scenario requires them.

## Optional `.evidence` metadata

Use these fields only for an 8X candidate; other modeling methods do not need them.

| Element                          | Field                              | Values / meaning                                    |
| -------------------------------- | ---------------------------------- | --------------------------------------------------- |
| Context entity                   | `contextKind`                      | `pre_contract`, `contract`, `fulfillment`, `domain` |
| Fulfillment Request              | `timeConstraint`                   | Business deadline or time window                    |
| Fulfillment Request              | `timeoutOutcome`                   | `breach`, `compensation`, `manual_review`           |
| Contract                         | `participantAndThingNotApplicable` | `true` only with an explicit business reason        |
| Confirmation→Request association | `relationshipType`                 | `confirms_request`                                  |
| Cross-context confirmation       | `crossContext`                     | `true`                                              |
| Cross-context confirmation       | `evidenceRole`                     | `fulfillment_confirmation`                          |
| Contract→Role association        | `relationshipType`                 | `governed_role`                                     |
| Contract→Thing association       | `relationshipType`                 | `contract_subject`                                  |
| Proposal→RFP association         | `relationshipType`                 | `responds_to`                                       |
| Contract→Proposal association    | `relationshipType`                 | `forms_contract`                                    |

## Positive example

```yaml
# entities/delivery-request.yaml
id: delivery-request
type: EVIDENCE
subType: fulfillment_request
parent: context-fulfillment
timeConstraint: P2D
timeoutOutcome: breach

# entities/delivery-confirmation.yaml
id: delivery-confirmation
type: EVIDENCE
subType: fulfillment_confirmation
parent: context-fulfillment

# associations/confirmation-confirms-request.yaml
id: confirmation-confirms-request
source: delivery-confirmation
target: delivery-request
relationshipType: confirms_request
```

This model states the business claim, deadline, timeout result, and auditable answering evidence. The project reference at `examples/laptop-procurement/.evidence/` contains a larger procurement example; read only the files relevant to the current Scenario.

## Counterexample

```yaml
id: delivery-confirmation
type: EVIDENCE
subType: fulfillment_confirmation
parent: technical-job-context
retryCount: 3
```

This is not sufficient: no fulfillment Request can be traced, the parent is not a declared contract/fulfillment business context, and retries replace the missing business timeout result.

## Candidate output

1. Try the existing model first.
2. Add only the minimum entities, relationships, and method metadata needed by the confirmed Scenario.
3. Keep model operations structured and candidate-only during Understand; never edit `.evidence` directly.
4. Include Request/Confirmation timeline, business data, invariants, and cross-context semantics in the model expansion.
5. Let the deterministic 8X validator and independent Model Challenger test the candidate. Do not self-approve it.
