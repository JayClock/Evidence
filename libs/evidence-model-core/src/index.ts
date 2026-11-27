export {
  scenarioExamples,
  cloneScenarioExamples,
  replaceScenarioExamples,
  evaluateScenario,
  type ScenarioExample,
  type ScenarioEvaluation,
} from './scenario/scenarioStudio.js';
export * from './ingestion/index.js';
export {
  getBusinessArchetype,
  instantiateArchetypeMutator,
  listBusinessArchetypes,
} from './model/businessArchetypes.js';
export {
  CONTEXT_MAP_LINK_LABELS,
  deriveContextMapGraph,
  type ContextMapGraph,
} from './model/contextMap.js';
export {
  translateBusinessFormula,
  replaceBusinessFormulaToken,
  type BusinessFormula,
  type BusinessFormulaToken,
} from './cel/celFormulaTranslator.js';
export {
  evaluateRuleOnExample,
  type ExampleRuleInputs,
} from './cel/transientSandbox.js';

export { timeoutExpressionFor } from './model/fulfillmentTime.js';
export {
  createDomainGraph,
  type BreachChainNode,
  type BreachOutcomeBranch,
  type ClassifiedConfirmation,
  type DomainGraph,
  type FulfillmentPair,
  type PreContractPair,
} from './model/graph.js';
export {
  HEALTH_DIMENSIONS,
  inspectModelHealth,
  type HealthDimensionSummary,
  type ModelHealthIssue,
  type ModelHealthReport,
} from './model/modelHealth.js';

export * from './mutations/index.js';
export {
  applyModelPatches,
  createModelPatch,
  prepareModelPatchBatch,
  toJsonPatches,
} from './session/jsonPatches.js';
export type {
  HistoryEntry,
  ModelRecipe,
  ModelSelection,
  ModelSessionEvent,
} from './session/types.js';

export {
  diffDomainModels,
  type AttributeDiff,
  type DiffChangeType,
  type EntityDiff,
  type KeyDataDiff,
  type ModelDiff,
  type ModelDiffSummary,
  type RelationshipDiff,
  type RuleDiff,
} from './diff/modelDiff.js';

export {
  buildKeyDataLedger,
  keyDataEntryOf,
  type KeyDataEntry,
  type KeyDataLedger,
  type KeyDataProvider,
} from './keyData/keyDataLedger.js';

export {
  analyzeCelExpression,
  type CelAnalysis,
  type CelCandidate,
  type CelDiagnostic,
  type CelDiagnosticCode,
} from './cel/celAnalysis.js';

export {
  celValueToJson,
  compileCelExpression,
  evaluateCelExpression,
  type CompiledCel,
} from './cel/celEvaluator.js';

export {
  aliasFor,
  bindingsForAliases,
  collectCelCandidates,
  derivationRuleOf,
} from './cel/celCandidates.js';

export {
  ModelSessionValidationError,
  createModelSession,
  type ModelSession,
  type ModelSessionOptions,
} from './session/createModelSession.js';

export {
  MODEL_MANIFEST_PATH,
  MODEL_VERSION_ISSUE_CODE,
  MODEL_NON_SOURCE_TREES,
  MODEL_SOURCE_TREES,
  modelSourcePaths,
  parseModelSourceFiles,
  serializeDomainModel,
  stringifyModelJson,
  type ModelSourceFile,
  type ModelSourceIssue,
  type ModelSourceParseResult,
  type ParseOptions,
  type SerializeOptions,
} from './adapters/modelSourceFiles.js';

export {
  isTimestampText,
  jsonValuesEqual,
  normalizeJsonValue,
  validateTypedValue,
} from './validation/typedValues.js';

export { digestOf } from './validation/modelDigest.js';

export {
  collectFlowScenarios,
  computeStepHash,
  FlowScenarioError,
  type FlowScenarioErrorCode,
} from './trace/flowAggregator.js';
export type {
  FlowScenarioTrace,
  FlowStepTrace,
  StepFingerprintInput,
} from './trace/types.js';
export {
  isWhatIfFulfillmentEvidence,
  whatIfDecisionRules,
} from './trace/whatIfRules.js';
export {
  createWhatIfScenario,
  type WhatIfHypothesis,
} from './trace/whatIfScenario.js';
export {
  createRequestRehearsal,
  createScenarioTimeline,
  MAX_REHEARSAL_HOURS,
  type StoryTimeline,
  type StoryTimelineMark,
  type TimelineObligation,
} from './trace/storyTimeline.js';

export {
  compiledDocument,
  type CompiledModelDocument,
} from './model/compiledDocument.js';

export {
  ReadyScopeError,
  readyScope,
  type ReadyScopeReport,
  ScopeSelectionError,
  completenessGaps,
  completenessIssues,
  completenessFindings,
  fulfillmentResults,
  pairingGaps,
  referencesOf,
  selectScope,
} from './validation/scope.js';

export {
  analyzeTraceability,
  attributePath,
  extractRuleAttributeAccesses,
  type AttributeAccess,
  type TraceabilityConstraint,
  type TraceabilityDocument,
  type TraceabilityEdge,
  type TraceabilityNode,
} from './validation/traceability.js';

export {
  FM_CHECK_VERSION,
  buildFmCheckReport,
  type FmCheckOutcome,
  type FmCheckReport,
  type FmCheckRequest,
} from './validation/fmCheck.js';

export {
  auditDomainComponentNaming,
  type ModelAdvisory,
  type ModelAdvisoryCode,
} from './validation/lintRules.js';

export { derivedTraceability } from './derive/derivedDocuments.js';
