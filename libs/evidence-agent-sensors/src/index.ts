export {
  checkNativeApiSensor,
  type ApiSensorInput,
  type ApiSensorOutcome,
} from './sensors/native/nativeApiSensor.js';

export {
  buildSensorReport,
  finalizeSensorReport,
  fmCheckIssues,
  keyDataSummaryOf,
  stageGateSummaryOf,
  type ApiCoverageSummary,
  type FmCheckReport,
  type KeyDataAuditReport,
  type KeyDataDecision,
  type KeyDataSummary,
  type SensorIssue,
  type SensorReport,
  type SensorSeverity,
  type SensorSource,
  type StageGateReport,
  type StageGateSummary,
} from './sensors/sensorReport.js';

export {
  createSensorsEngine,
  type RunSensorsInput,
  type SensorOutcome,
  type SensorsEngine,
  type SensorsEngineOptions,
  type StageGateInput,
} from './sensors/sensorsEngine.js';

export {
  checkNativeStageGate,
  filterFmCheckErrors,
  isGateReadyReport,
  loadModelSources,
  runNativeFmCheck,
  runNativeKeyDataAudit,
  runNativeSensors,
  type ModelSources,
  type NativeFmCheckOptions,
  type NativeFmCheckOutcome,
  type NativeSensorsInput,
  type NativeSensorsOutcome,
  type StageGateInput as NativeStageGateInput,
} from './sensors/native/index.js';
