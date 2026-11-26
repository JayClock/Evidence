import {
  describeStoryExpectation,
  type DocumentCardField,
  type StoryScene,
} from '@evidence-poc/evidence-agent/browser';
import { Button, Card } from '@evidence-poc/desktop-ui-kit';
import type { SceneChecklist } from '../../state/sceneChecklist';

export type ClarifyStoryGap = (
  nodeId: string,
  gap: 'contract' | 'completion' | 'request',
) => void;

const AttributeGroup = ({
  heading,
  fields,
}: {
  heading: string;
  fields: readonly DocumentCardField[];
}) =>
  fields.length ? (
    <div className="flex flex-col gap-1.5">
      <h4 className="font-medium">{heading}</h4>
      <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-3 gap-y-1">
        {fields.map(({ name, label, value }) => (
          <div key={name} className="col-span-2 grid grid-cols-subgrid">
            <dt className="break-words text-evidence-muted">{label}</dt>
            <dd className="break-words whitespace-pre-wrap">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  ) : null;

export const StorySceneSheet = ({
  scene,
  checklist,
  ready,
  onClarifyGap,
  onExplore,
}: {
  scene: StoryScene;
  checklist: SceneChecklist;
  ready: boolean;
  onClarifyGap?: ClarifyStoryGap;
  onExplore?: () => void;
}) => {
  const { activity, documentCard, timing, expectation, narrative } = scene;
  const requests = activity.fulfillment?.requests;
  const firstObligor = requests?.[0]?.obligor;
  const obligor = requests?.every(
    ({ obligor }) => obligor?.roleId === firstObligor?.roleId,
  )
    ? firstObligor
    : undefined;
  const recipient = activity.recipient ?? obligor;
  const recipientLabel =
    activity.workObject.entityKind === 'contract'
      ? '签约方'
      : !activity.recipient && obligor
        ? '义务方'
        : '接收方';
  const { keyData, contractContext } = checklist;
  const { generalAttributes, clauseRef } = documentCard;
  const sources = [...keyData, ...generalAttributes].flatMap(
    ({ name, label, sourceOrigin }) =>
      sourceOrigin ? [{ name, label, value: sourceOrigin }] : [],
  );
  const hasArchive =
    generalAttributes.length > 0 || sources.length > 0 || Boolean(clauseRef);
  return (
    <div className="flex flex-col gap-4">
      <article
        aria-label="本幕叙事"
        aria-busy={narrative.status === 'enriching'}
        className="flex flex-col gap-2"
      >
        <h3 className="break-words text-sm font-semibold leading-relaxed">
          经办方：{activity.actor.roleLabel} <span aria-hidden="true">→</span>{' '}
          {activity.actionPhrase} <span aria-hidden="true">→</span>{' '}
          {recipientLabel}：{recipient?.roleLabel ?? '待明确'}
        </h3>
        <time
          dateTime={timing.rawIso}
          className="text-[11px] text-evidence-muted"
        >
          业务时点：{timing.displayDate}
          {timing.relativeTime ? ` · ${timing.relativeTime}` : ''}
        </time>
        {narrative.prose.split(/\r?\n\s*\r?\n/u).map((paragraph, i) => (
          <p key={i} className="whitespace-pre-wrap break-words leading-6">
            {paragraph}
          </p>
        ))}
      </article>
      <Card asChild className="p-3">
        <article aria-label="业务单据" className="flex flex-col gap-3">
          <h3 className="break-words text-sm font-semibold">
            《{documentCard.title}》
          </h3>
          <AttributeGroup heading="核心商业要素" fields={keyData} />
          {hasArchive ? (
            <details className="border-t border-evidence-line pt-1">
              <summary className="cursor-pointer py-1 text-evidence-muted">
                单据归档与字段依据
              </summary>
              <div className="flex flex-col gap-3 pt-2">
                <AttributeGroup
                  heading="业务归档要素"
                  fields={generalAttributes}
                />
                <AttributeGroup heading="字段依据" fields={sources} />
                {clauseRef ? <p>条款依据：{clauseRef}</p> : null}
              </div>
            </details>
          ) : null}
          {!keyData.length && !generalAttributes.length ? (
            <p className="text-evidence-muted">该示例没有列出单据明细。</p>
          ) : null}
        </article>
      </Card>
      {activity.fulfillment || contractContext || expectation || onExplore ? (
        <section aria-label="本步注解" className="flex flex-col gap-2">
          <h3 className="font-semibold">本步注解</h3>
          {contractContext || activity.fulfillment ? (
            <p>
              合同归属：{contractContext ?? '待明确'}{' '}
              {!contractContext && onClarifyGap ? (
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={!ready}
                  onClick={() =>
                    onClarifyGap(activity.workObject.entityId, 'contract')
                  }
                >
                  补齐合同归属
                </Button>
              ) : null}
            </p>
          ) : null}
          {checklist.requests.map((request) => (
            <div
              key={request.stepIndex}
              className="flex flex-col gap-1 border-s-2 border-workbench-border ps-3"
            >
              <h4 className="font-medium">
                {request.label}
                {request.isGap ? (
                  <small className="ms-2 text-evidence-muted">待补齐</small>
                ) : null}
              </h4>
              <p className="flex flex-wrap gap-x-3">
                <span>权利方：{request.rightHolder ?? '待明确'}</span>
                <span>义务方：{request.obligor ?? '待明确'}</span>
              </p>
              <p>约定交付：{request.action ?? '待明确'}</p>
              <p>标的物：{request.subjectMatters.join('、') || '待明确'}</p>
              <p>
                完成规则：{request.completionRules.join('、') || '待明确'}{' '}
                {!request.completionRules.length && onClarifyGap ? (
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={!ready}
                    onClick={() => onClarifyGap(request.id, 'completion')}
                  >
                    补齐完成规则
                  </Button>
                ) : null}
              </p>
            </div>
          ))}
          {activity.fulfillment && !checklist.requests.length ? (
            <p>
              本步骤未能定位对应的履约请求。{' '}
              {onClarifyGap ? (
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={!ready}
                  onClick={() =>
                    onClarifyGap(activity.workObject.entityId, 'request')
                  }
                >
                  澄清关联请求
                </Button>
              ) : null}
            </p>
          ) : null}
          {expectation ? <p>{describeStoryExpectation(expectation)}</p> : null}
          {onExplore ? (
            <Button
              type="button"
              variant="outline"
              className="self-start"
              disabled={!ready}
              onClick={onExplore}
            >
              推演此步异常 →
            </Button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
};
