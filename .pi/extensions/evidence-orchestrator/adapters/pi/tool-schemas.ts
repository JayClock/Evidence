type JsonSchema = Record<string, unknown> & { __optional?: boolean };

export const Type = {
  String(options: Record<string, unknown> = {}): JsonSchema {
    return { type: 'string', ...options };
  },
  Optional(schema: JsonSchema): JsonSchema {
    return { ...schema, __optional: true };
  },
  Array(items: JsonSchema): JsonSchema {
    const { __optional, ...rest } = items;
    return {
      type: 'array',
      items: rest,
      ...(__optional ? { __optional } : {}),
    };
  },
  Object(properties: Record<string, JsonSchema>): JsonSchema {
    const cleaned: Record<string, Record<string, unknown>> = {};
    const required: string[] = [];
    for (const [key, schema] of Object.entries(properties)) {
      const { __optional, ...rest } = schema;
      cleaned[key] = rest;
      if (!__optional) required.push(key);
    }
    return {
      type: 'object',
      properties: cleaned,
      required,
      additionalProperties: false,
    };
  },
};

export const candidateSourceParam = Type.Object({
  candidateId: Type.String({
    description: 'Ready Inbox Story candidate id, for example CAND-0001.',
  }),
});

export const inboxStoryCandidatesParam = Type.Object({
  sourceIds: Type.Array(
    Type.String({ description: 'Exact selected INBOX-xxxx source id.' }),
  ),
  candidates: Type.Array(
    Type.Object({
      title: Type.String({ description: 'Short candidate Story title.' }),
      problem: Type.String({
        description: 'One user or business problem without an implementation.',
      }),
      role: Type.String({ description: 'The user or business role.' }),
      goal: Type.String({ description: 'One negotiable outcome.' }),
      value: Type.String({ description: 'The user or business value.' }),
      cognitiveMode: Type.String({
        enum: ['clear', 'complicated', 'complex'],
      }),
      citations: Type.Array(
        Type.Object({
          inboxId: Type.String({ description: 'Exact INBOX-xxxx id.' }),
          revisionSha256: Type.String({
            description: 'Exact selected source revision sha256.',
          }),
          locator: Type.String({
            description: 'Heading, paragraph, or whole-source locator.',
          }),
        }),
      ),
    }),
  ),
});

export const activityRunParam = Type.Object({
  instructions: Type.Optional(
    Type.String({
      description: 'Extra instructions for the current activity subagent.',
    }),
  ),
});

export const kickoffCandidateParam = Type.Object({
  title: Type.String({ description: 'Short candidate Story title.' }),
  problem: Type.String({
    description: 'One user or business problem, without an implementation.',
  }),
  role: Type.String({
    description: 'The user or business role that benefits.',
  }),
  goal: Type.String({
    description:
      'The negotiable outcome the role wants, without an inferred internal implementation choice.',
  }),
  value: Type.String({ description: 'The business or user value produced.' }),
  cognitiveMode: Type.String({
    description: 'Current team cognitive behavior, not a permanent label.',
    enum: ['clear', 'complicated', 'complex'],
  }),
  sourceRefs: Type.Array(
    Type.String({
      description:
        'Issue or stable product-context path and heading reference.',
    }),
  ),
});

export const scenarioDraftParam = Type.Object({
  storyId: Type.String({ description: 'The active Story id.' }),
  candidates: Type.Array(
    Type.Object({
      title: Type.String({ description: 'Short business Scenario title.' }),
      given: Type.Array(
        Type.String({ description: 'Concrete starting business fact.' }),
      ),
      when: Type.String({
        description:
          'One business action or event; a confirmed product interaction is allowed, but not an internal implementation step.',
      }),
      then: Type.Array(
        Type.String({ description: 'Observable business result.' }),
      ),
      businessData: Type.Array(
        Type.String({ description: 'Concrete key business datum.' }),
      ),
    }),
  ),
});

export const modelingProfileParam = Type.Object({
  subject: Type.String({
    description: 'Modeling subject: business, domain, or tool.',
    enum: ['business', 'domain', 'tool'],
  }),
  method: Type.String({
    description:
      'Modeling method: none, object, event, four_color, eight_x_flow, or algorithmic.',
    enum: [
      'none',
      'object',
      'event',
      'four_color',
      'eight_x_flow',
      'algorithmic',
    ],
  }),
  modelChangeRequired: Type.String({
    description:
      'Whether the canonical model needs change: true, false, unknown.',
    enum: ['true', 'false', 'unknown'],
  }),
  reason: Type.String({ description: 'Business modeling rationale.' }),
});

export const modelOperationParam = Type.Object({
  action: Type.String({ enum: ['add', 'update', 'remove'] }),
  kind: Type.String({ enum: ['entity', 'association'] }),
  id: Type.String({ description: 'Stable lowercase model id.' }),
  path: Type.String({ description: 'Exact canonical .evidence YAML path.' }),
  content: Type.Optional(
    Type.String({ description: 'Complete candidate YAML for add/update.' }),
  ),
  expected_sha256: Type.Optional(
    Type.String({ description: 'Expected current hash for update/remove.' }),
  ),
});

const scenarioModelExpansionParam = Type.Object({
  scenarioId: Type.String({ description: 'Exact confirmed SC-xxx id.' }),
  modelRefs: Type.Object({
    entities: Type.Array(Type.String()),
    associations: Type.Array(Type.String()),
  }),
  given: Type.Object({
    entities: Type.Array(Type.String()),
    relationships: Type.Array(Type.String()),
  }),
  when: Type.String({ description: 'Business command or event.' }),
  then: Type.Object({
    createdEntities: Type.Array(Type.String()),
    changedEntities: Type.Array(Type.String()),
    createdRelationships: Type.Array(Type.String()),
    removedRelationships: Type.Array(Type.String()),
  }),
  invariants: Type.Array(Type.String()),
  timeline: Type.Array(Type.String()),
});

export const modelAnalysisParam = Type.Object({
  reason: Type.String({
    description:
      'Why one candidate model consistently explains the complete Scenario Set.',
  }),
  scenarios: Type.Array(scenarioModelExpansionParam, {
    description: 'One expansion for every confirmed Scenario.',
  }),
  operations: Type.Array(modelOperationParam),
});

export const modelChallengeParam = Type.Object({
  outcome: Type.String({
    description: 'Challenge outcome.',
    enum: ['pass', 'scenario_gap', 'model_gap', 'method_gap'],
  }),
  summary: Type.String({
    description: 'Concrete business reason for the challenge outcome.',
  }),
});

export const taskingDraftParam = Type.Object({
  runtimes: Type.Array(
    Type.Object({
      id: Type.String({ description: 'Unique RUNTIME-xxx plan id.' }),
      runtime: Type.String({ enum: ['rust', 'typescript', 'tauri'] }),
      functionalContexts: Type.Array(
        Type.String({ description: 'Stable business capability.' }),
      ),
      technicalBoundaries: Type.Array(
        Type.String({ description: 'Independent technical boundary.' }),
      ),
      testFilter: Type.String({
        description: 'Whitelist-safe focused test identifier.',
      }),
    }),
  ),
  tests: Type.Array(
    Type.Object({
      id: Type.String({ description: 'Unique TEST-xxx id.' }),
      quadrant: Type.String({ enum: ['Q1', 'Q2'] }),
      intent: Type.String({ description: 'Reviewable behavior intent.' }),
      runtimePlanId: Type.String({ description: 'Owning RUNTIME-xxx id.' }),
      stepId: Type.String({ description: 'Exact ordered v2 process step id.' }),
      supportedBy: Type.Array(
        Type.String({ description: 'Q1 TEST-xxx supporting a Q2 item.' }),
      ),
      scenarioIds: Type.Array(
        Type.String({
          description: 'Confirmed SC-xxx exercised by this test.',
        }),
      ),
      scenarioOutcome: Type.Optional(
        Type.String({ description: 'Exact confirmed Then outcome.' }),
      ),
      businessData: Type.Array(
        Type.String({ description: 'Exact confirmed business datum.' }),
      ),
      modelRefs: Type.Object({
        entities: Type.Array(
          Type.String({ description: 'Confirmed canonical model entity id.' }),
        ),
        associations: Type.Array(
          Type.String({
            description: 'Confirmed canonical model association id.',
          }),
        ),
      }),
    }),
  ),
  tasks: Type.Array(
    Type.Object({
      id: Type.String({ description: 'Unique TASK-xxx id.' }),
      description: Type.String({ description: 'Implementation task intent.' }),
      testIds: Type.Array(Type.String({ description: 'Linked TEST-xxx id.' })),
      dependsOn: Type.Array(
        Type.String({ description: 'Earlier TASK-xxx dependency.' }),
      ),
    }),
  ),
});

export const respondProposalParam = Type.Object({
  promotions: Type.Array(
    Type.Object({
      source: Type.String({ description: 'Iteration evidence source path.' }),
      kind: Type.String({
        enum: [
          'product',
          'model',
          'architecture',
          'contract',
          'test_process',
          'skill',
          'prompt',
          'other',
        ],
      }),
      decision: Type.String({
        enum: ['promoted', 'deferred', 'rejected'],
      }),
      reason: Type.String({ description: 'Evidence-based decision reason.' }),
      validationEvidence: Type.Array(
        Type.String({ description: 'Existing validation evidence path.' }),
      ),
      canonicalTarget: Type.Optional(
        Type.String({ description: 'Required only for promoted knowledge.' }),
      ),
    }),
  ),
  noPromotionReason: Type.Optional(
    Type.String({
      description: 'Required when promotions is empty; otherwise omitted.',
    }),
  ),
  observedOutcomes: Type.Array(
    Type.String({ description: 'Observed iteration outcome.' }),
  ),
  residualRisks: Type.Array(
    Type.String({ description: 'Residual risk retained after Showcase.' }),
  ),
  nextProbe: Type.Object({
    question: Type.String({ description: 'Concrete next learning question.' }),
    whyNow: Type.String({ description: 'Why this question matters next.' }),
    evidenceRefs: Type.Array(
      Type.String({ description: 'Existing evidence path.' }),
    ),
    firstAction: Type.String({ description: 'First executable probe action.' }),
  }),
});

export const showcaseReviewParam = Type.Object({
  observedFacts: Type.Array(
    Type.String({ description: 'Directly reproducible observed fact.' }),
  ),
  productDomainFeedback: Type.Array(
    Type.String({ description: 'Product or domain feedback, if any.' }),
  ),
  technicalQualityFeedback: Type.Array(
    Type.String({ description: 'Technical quality feedback, if any.' }),
  ),
  unresolvedAssumptions: Type.Array(
    Type.String({ description: 'Unverified assumption, if any.' }),
  ),
  recommendation: Type.String({
    description: 'Reviewer recommendation; only a human decides.',
    enum: ['accept', 'revise'],
  }),
});

export const clarificationQuestionParam = Type.Object({
  storyId: Type.String({
    description:
      'The US-xxx story whose business uncertainty is being clarified.',
  }),
  question: Type.String({
    description:
      'One high-value business-facing question for the domain expert. It may clarify a product-confirmed channel or external interaction, but must not ask for an internal implementation choice. Ask only one question, then stop.',
  }),
  target: Type.String({
    description:
      'Where an answer belongs: business_context, story, or history. Use story only when the role, negotiable goal, or value needs revision.',
  }),
});

export const clarificationAnswerParam = Type.Object({
  answer: Type.String({
    description:
      'The domain expert’s explicit answer to the sole pending clarification question.',
  }),
});
