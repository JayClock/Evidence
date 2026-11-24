import type { ValidationResult } from '@evidence-poc/evidence-schema';
import type { DomainGraphLayout } from '@evidence-poc/evidence-canvas-interaction';
import type { SensorReport } from '@evidence-poc/evidence-agent/browser';
import type {
  AcceptanceSyncStatus,
  ContextDeliveryStatus,
} from '@evidence-poc/desktop-contracts/delivery';

interface BottomStatusBarProps {
  layout: DomainGraphLayout;
  validation: ValidationResult;
  /** Latest sensor verdict; null until the first run finishes. */
  report: SensorReport | null;
  reportStale?: boolean;
  sensorLoading: boolean;
  sensorError: string | null;
  diagnosticsOpen: boolean;
  onToggleDiagnostics: () => void;
  onRerunSensors: () => void;
  deliverySync: ContextDeliveryStatus | null;
  acceptanceSync: AcceptanceSyncStatus | null;
  onOpenDelivery: () => void;
  persistence: import('@evidence-poc/desktop-contracts/projects').PersistenceState;
  reloadError: string | null;
  onReload: () => void;
  onRetryPersistence: () => void;
}

const issueSummary = (validation: ValidationResult): string => {
  if (validation.valid) {
    return 'FM 一致性检查通过';
  }

  const first = validation.issues[0];

  return `${validation.issues.length} 个一致性问题${
    first === undefined ? '' : `：${first.path} ${first.message}`
  }`;
};

const gateLabel = (report: SensorReport): string => {
  if (report.unavailableSensors.length > 0) {
    return '检查器不可用';
  }

  if (!report.passed) {
    return '门禁：不闭合';
  }

  if (
    report.apiSummary &&
    (report.apiSummary.uncoveredEntities.length > 0 ||
      report.apiSummary.breakingChangeCount > 0)
  )
    return '门禁：等待 API 契约审查';
  return report.isStageGateReady ? '门禁：可交下游' : '门禁：等待台账决议';
};

const SensorSummary = ({
  report,
  stale,
  loading,
  error,
  onToggle,
  onRerun,
}: {
  report: SensorReport | null;
  stale: boolean;
  loading: boolean;
  error: string | null;
  onToggle: () => void;
  onRerun: () => void;
}) => {
  if (loading && report === null) {
    return <span>正在运行检查器…</span>;
  }

  if (error !== null) {
    return (
      <span className="flex items-center gap-1.5 text-[#b42318]">
        {error}
        <button
          type="button"
          onClick={onRerun}
          className="rounded border border-[#b42318]/40 px-1.5 py-0.5 text-[10px] hover:bg-[#b42318]/10"
        >
          重试
        </button>
      </span>
    );
  }

  if (report === null) {
    return <span>尚未运行检查器</span>;
  }

  return (
    <span className="flex min-w-0 items-center gap-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2 rounded border border-evidence-line px-1.5 py-0.5 hover:bg-[#f1f3f6]"
        title="展开检查结果"
      >
        <span className="flex items-center gap-1">
          <span
            className={[
              'inline-block h-1.5 w-1.5 rounded-full',
              stale
                ? 'bg-[#c4c9d2]'
                : report.blockCount > 0
                  ? 'bg-[#b42318]'
                  : report.warnCount > 0
                    ? 'bg-[#8d6200]'
                    : 'bg-[#3d7553]',
            ].join(' ')}
          />
          阻塞 {report.blockCount}
        </span>
        <span className={report.warnCount > 0 ? 'text-[#8d6200]' : undefined}>
          警告 {report.warnCount}
        </span>
        <span>提示 {report.infoCount}</span>
        <span
          className={
            report.isStageGateReady && !stale
              ? 'text-evidence-participant'
              : 'text-[#8d6200]'
          }
        >
          {stale ? '检查结果已过期' : gateLabel(report)}
        </span>
      </button>
      {report.apiSummary === undefined ? null : (
        <span className="text-evidence-muted">
          API {report.apiSummary.totalRoutes} 路由 · 覆盖{' '}
          {(report.apiSummary.coverageRatio * 100).toFixed(0)}%
          {stale ? '（旧结果）' : ''}
        </span>
      )}
      <button
        type="button"
        onClick={onRerun}
        className="rounded border border-evidence-line px-1.5 py-0.5 text-[10px] text-evidence-muted hover:bg-[#f1f3f6]"
      >
        重新检查
      </button>
    </span>
  );
};

export const BottomStatusBar = ({
  layout,
  validation,
  report,
  reportStale = false,
  sensorLoading,
  sensorError,
  diagnosticsOpen,
  onToggleDiagnostics,
  onRerunSensors,
  deliverySync,
  acceptanceSync,
  onOpenDelivery,
  persistence,
  reloadError,
  onReload,
  onRetryPersistence,
}: BottomStatusBarProps) => (
  <footer className="col-span-2 flex h-8 shrink-0 items-center justify-between gap-3 border-t border-evidence-line bg-white/85 px-3 text-[10px] text-evidence-muted">
    <div className="flex min-w-0 items-center gap-3">
      <span
        title={validation.valid ? undefined : issueSummary(validation)}
        data-diagnostics-open={diagnosticsOpen ? 'true' : 'false'}
      >
        <span
          className={[
            'mr-1 inline-block h-1.5 w-1.5 rounded-full',
            validation.valid ? 'bg-[#3d7553]' : 'bg-[#b42318]',
          ].join(' ')}
        />
        {validation.valid
          ? '静态检查通过'
          : `静态检查 ${validation.issues.length} 项`}
      </span>
      <SensorSummary
        report={report}
        stale={reportStale}
        loading={sensorLoading}
        error={sensorError}
        onToggle={onToggleDiagnostics}
        onRerun={onRerunSensors}
      />
      <span>业务对象 {layout.nodes.length}</span>
      <span>履约连线 {layout.fulfillmentPairs.length}</span>
      <span>上下文 {layout.contextGroups.length}</span>
      <button
        type="button"
        onClick={onOpenDelivery}
        className="shrink-0 rounded border border-evidence-line px-1.5 py-0.5"
        title="查看 API 自动同步详情"
      >
        {deliverySync?.kind === 'synced'
          ? `API 草稿：${deliverySync.synced} 已同步${deliverySync.blocked ? ` · ${deliverySync.blocked} 阻塞` : ''}`
          : deliverySync?.kind === 'failed'
            ? 'API 同步失败'
            : deliverySync?.kind === 'blocked'
              ? 'API 生成受阻'
              : deliverySync?.kind === 'running'
                ? 'API 草稿生成中'
                : 'API 草稿待同步'}
      </button>
      {acceptanceSync ? (
        <span
          className="shrink-0"
          title={
            acceptanceSync.kind === 'failed' ||
            acceptanceSync.kind === 'blocked'
              ? acceptanceSync.error
              : undefined
          }
        >
          {acceptanceSync.kind === 'synced'
            ? `验收用例：${acceptanceSync.flows} 个流`
            : acceptanceSync.kind === 'empty'
              ? '无验收场景'
              : acceptanceSync.kind === 'failed'
                ? '验收生成失败'
                : acceptanceSync.kind === 'blocked'
                  ? '验收生成受阻'
                  : '验收用例生成中'}
        </span>
      ) : null}
    </div>

    <div className="flex items-center gap-3">
      <span role="status" className="text-[#8d6200]">
        {reloadError ??
          (persistence.kind === 'failed' || persistence.kind === 'conflict'
            ? persistence.error
            : '')}
      </span>
      {persistence.kind === 'failed' ? (
        <button
          type="button"
          className="underline"
          onClick={onRetryPersistence}
        >
          重试同步
        </button>
      ) : null}
      {persistence.kind === 'conflict' || persistence.kind === 'failed' ? (
        <button
          type="button"
          onClick={onReload}
          title="采用当前磁盘模型并放弃尚未写入的编辑"
          className="rounded border border-[#8d6200]/40 px-1.5 py-0.5 text-[10px] hover:bg-[#8d6200]/10"
        >
          从磁盘重载
        </button>
      ) : null}
    </div>
  </footer>
);
