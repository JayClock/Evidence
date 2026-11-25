import {
  describeStoryExpectation,
  type DocumentCardField,
  type StoryScene,
} from '@evidence-poc/evidence-agent/browser';
import { Button, Card } from '@evidence-poc/desktop-ui-kit';

const narrativeStatus: Record<StoryScene['narrative']['status'], string> = {
  authored: '已确认的业务解释',
  ready: '智能连贯叙事 · 待核对',
  enriching: '正在润色 · 仍可阅读',
  baseline: '业务事实',
};

const AttributeGroup = ({
  heading,
  fields,
}: {
  heading: string;
  fields: readonly DocumentCardField[];
}) =>
  fields.length ? (
    <div className="flex flex-col gap-2">
      <h4 className="font-medium">{heading}</h4>
      <dl className="grid grid-cols-[minmax(5rem,1fr)_2fr] gap-x-3 gap-y-2">
        {fields.map(({ name, label, value, sourceOrigin }) => (
          <div key={name} className="col-span-2 grid grid-cols-subgrid">
            <dt className="break-words text-evidence-muted">{label}</dt>
            <dd className="min-w-0 break-words whitespace-pre-wrap">
              {value}
              {sourceOrigin ? (
                <small className="block text-evidence-muted">
                  依据：{sourceOrigin}
                </small>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  ) : null;

export const StorySceneSheet = ({
  scene,
  ready,
  stale,
  stepNumber,
  stepCount,
  onJumpToStep,
}: {
  scene: StoryScene;
  ready: boolean;
  stale: boolean;
  stepNumber: number;
  stepCount: number;
  onJumpToStep: (sequence: number) => void;
}) => {
  const {
    activity,
    documentCard,
    timing,
    prerequisites,
    expectation,
    narrative,
  } = scene;
  return (
    <div className="flex flex-col gap-4" lang="zh-CN">
      <header className="flex flex-wrap items-center justify-between gap-2 text-evidence-muted">
        <p>
          第 {stepNumber} 步 / 共 {stepCount} 步 · 单据流转
        </p>
        <time dateTime={timing.rawIso}>
          {timing.displayDate}
          {timing.relativeTime ? ` · ${timing.relativeTime}` : ''}
        </time>
      </header>
      {prerequisites.length ? (
        <section className="flex flex-col gap-2 border-s-2 border-workbench-border ps-3">
          <h3 className="font-medium">承前流转</h3>
          {/* Safari drops the implicit semantics of CSS-reset lists. */}
          {/* eslint-disable-next-line jsx-a11y/no-redundant-roles */}
          <ul role="list" className="flex flex-col gap-1">
            {prerequisites.map(({ previousStepIndex, businessSummary }) => (
              <li
                key={previousStepIndex}
                className="flex flex-wrap items-center gap-2"
              >
                <Button
                  size="xs"
                  variant="outline"
                  disabled={!ready}
                  onClick={() => onJumpToStep(previousStepIndex)}
                >
                  第 {previousStepIndex} 步
                </Button>
                <span>{businessSummary}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <Card asChild className="flex flex-col gap-3 p-4">
        <article aria-label="领域故事">
          <header className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="text-sm font-semibold">{narrative.headline}</h3>
            <p className="text-[11px] text-evidence-muted">
              {stale
                ? '上一版本 · 请等待更新'
                : narrativeStatus[narrative.status]}
            </p>
          </header>
          <div
            key={narrative.prose}
            className={
              narrative.status === 'ready'
                ? 'motion-safe:animate-[evidence-fade-in_140ms_ease-out]'
                : undefined
            }
          >
            {narrative.prose.split(/\r?\n\s*\r?\n/u).map((paragraph, i) => (
              <p
                key={i}
                className="mb-2 whitespace-pre-wrap break-words leading-6 last:mb-0"
              >
                {paragraph}
              </p>
            ))}
          </div>
        </article>
      </Card>
      <Card asChild className="flex flex-col gap-4 p-4">
        <article aria-label="业务单据">
          <header className="flex flex-col gap-1">
            <p className="text-[11px] text-evidence-muted">
              业务示例 · 非真实凭证
            </p>
            <h3 className="text-sm font-semibold">《{documentCard.title}》</h3>
            <p>
              经办方：{activity.actor.roleLabel}
              {activity.recipient ? (
                <>
                  {' '}
                  <span aria-hidden="true">
                    {activity.fulfillment ? '·' : '→'}
                  </span>{' '}
                  {activity.fulfillment?.phase === 'request'
                    ? '义务方'
                    : activity.fulfillment?.phase === 'confirmation'
                      ? '权利方'
                      : activity.workObject.entityKind === 'contract'
                        ? '签约方'
                        : '接收方'}
                  ：{activity.recipient.roleLabel}
                </>
              ) : null}
            </p>
          </header>
          <AttributeGroup
            heading="核心商业要素"
            fields={documentCard.keyAttributes}
          />
          <AttributeGroup
            heading="业务归档要素"
            fields={documentCard.generalAttributes}
          />
          {documentCard.clauseRef ? (
            <p>条款依据：{documentCard.clauseRef}</p>
          ) : null}
          {!documentCard.keyAttributes.length &&
          !documentCard.generalAttributes.length ? (
            <p className="text-evidence-muted">该示例没有列出单据明细。</p>
          ) : null}
        </article>
      </Card>
      {expectation ? (
        <Card asChild className="flex flex-col gap-1 p-4">
          <aside aria-label="协同闭环">
            <h3 className="font-medium">
              {expectation.isControlGap ? '协同闭环待补' : '协同待办'}
            </h3>
            <p>{describeStoryExpectation(expectation)}</p>
          </aside>
        </Card>
      ) : null}
    </div>
  );
};
