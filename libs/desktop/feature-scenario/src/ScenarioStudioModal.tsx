import { projectAcceptanceTests } from '@evidence-poc/evidence-acceptance/projection';
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import {
  allowedCallerRoleRefs,
  buildDeliveryRoutes,
} from '@evidence-poc/evidence-api/delivery';
import {
  createStory,
  replaceStory,
  deleteStory,
  reorderStorySteps,
  removeStoryStep,
  resolveStorySteps,
  evaluateScenario,
  type ModelSession,
} from '@evidence-poc/evidence-model-core';
import { validateTypedValue } from '@evidence-poc/evidence-cel';
import {
  isDomainId,
  STORY_KIND_LABELS,
  type DomainStoryAST,
  type StoryStepAST,
} from '@evidence-poc/evidence-schema';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@evidence-poc/desktop-ui-kit';

const fieldClass =
  'rounded border border-evidence-line bg-white px-2 py-1 text-[12px]';
const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
const parseField = (value: string, type: string): unknown => {
  if (type === 'bool') return value === 'true';
  if (['int', 'uint', 'double', 'decimal'].includes(type)) {
    const number = Number(value);
    return value.trim() &&
      Number.isFinite(number) &&
      (!['int', 'uint'].includes(type) || Number.isSafeInteger(number))
      ? number
      : value;
  }
  if (['map', 'list', 'money', 'dynamic'].includes(type)) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
};

/** Structurally valid edits go straight into the model. Invalid input remains local to the form. */
export const ScenarioStudioModal = ({
  session,
  onClose,
  onPlay,
}: {
  session: ModelSession;
  onClose: () => void;
  onPlay: (flow: string) => void;
}) => {
  const subscribe = useCallback(
    (notify: () => void) =>
      session.subscribe((event) => {
        if (event.type === 'document-changed') notify();
      }),
    [session],
  );
  const base = useSyncExternalStore(subscribe, session.getDocument);
  const flows = useMemo(() => base.stories.map((s) => s.id).sort(), [base]);
  const [flow, setFlow] = useState(flows[0] ?? '');
  const [pendingTitle, setPendingTitle] = useState('');
  const story = base.stories.find((s) => s.id === flow);
  const [input, setInput] = useState<{
    base: typeof base;
    flow: string;
    items: StoryStepAST[];
    error: string;
  }>();
  const incomplete =
    input?.base === base && input?.flow === flow ? input : undefined;
  const items = useMemo(
    () =>
      incomplete?.items ??
      [...(story?.steps ?? [])].sort((a, b) => a.sequence - b.sequence),
    [story, incomplete],
  );
  const [newName, setNewName] = useState('');
  const [selected, setSelected] = useState(0);
  const [entityRef, setEntityRef] = useState('');
  const [notice, setNotice] = useState('');

  const routes = useMemo(() => {
    try {
      return {
        values: buildDeliveryRoutes(base).filter((r) => r.method === 'POST'),
      };
    } catch (error) {
      return { values: [], error: message(error) };
    }
  }, [base]);
  const candidate = useMemo(() => {
    try {
      if (incomplete) return { error: incomplete.error, results: [] };
      return { model: base, results: flow ? evaluateScenario(base, flow) : [] };
    } catch (error) {
      return { error: message(error), results: [] };
    }
  }, [base, flow, incomplete]);
  const item = items[selected];
  const entity = base.entities.find((e) => e.id === item?.workObjectRef);
  const route = routes.values.find((r) => r.entityRef === item?.workObjectRef);
  const negative = (item?.expectedStatus ?? 201) >= 400;
  const enteredValues = negative
    ? (item?.inputs ?? item?.values)
    : item?.values;
  const editField = (
    step: StoryStepAST,
    name: string,
    value: string,
    type: string,
  ) => {
    const values = negative
      ? (step.inputs ??= structuredClone(step.values))
      : step.values;
    if (!value) delete values[name];
    else values[name] = parseField(value, type);
  };
  const apply = (
    targetFlow: string,
    next: StoryStepAST[],
    meta?: DomainStoryAST,
  ) => {
    if (base !== session.getDocument()) return;
    setNotice('');
    if (
      !next.length &&
      !base.stories.some((story) => story.id === targetFlow)
    ) {
      setInput(undefined);
      return;
    }
    try {
      session.mutate((draft) => {
        const existing = draft.stories.find((s) => s.id === targetFlow);
        if (!next.length && existing) {
          deleteStory(draft, targetFlow);
          return;
        }
        const data: DomainStoryAST = {
          type: 'story',
          kind: 'primary',
          title: pendingTitle || targetFlow,
          ...(meta ?? existing),
          id: targetFlow,
          steps: next,
        };
        if (existing) replaceStory(draft, data);
        else createStory(draft, data);
      }, '更新业务场景');
      setInput(undefined);
    } catch (error) {
      setInput({ base, flow: targetFlow, items: next, error: message(error) });
    }
  };
  const patch = (change: (step: StoryStepAST) => void) => {
    apply(
      flow,
      items.map((entry, i) => {
        if (i !== selected) return entry;
        const next = structuredClone(entry);
        change(next);
        return next;
      }),
    );
  };
  const create = (clone: boolean) => {
    const name = newName.trim();
    if (!name || base.stories.some((s) => s.title === name)) {
      setNotice('请填写未使用的场景名称。');
      return;
    }
    const occupied = new Set(
      [
        ...base.entities,
        ...base.relationships,
        ...base.rules,
        ...base.stories,
      ].map((item) => item.id),
    );
    let serial = 1;
    let id = isDomainId(name) ? name : 'story-1';
    while (occupied.has(id)) id = 'story-' + ++serial;
    setInput(undefined);
    setFlow(id);
    setPendingTitle(name);
    setSelected(0);
    setNewName('');
    setNotice('');
    if (clone && story) {
      const copy = structuredClone(story);
      const localRef = (ref: string) =>
        ref.startsWith(story.id + '#') ? ref.slice(story.id.length + 1) : ref;
      for (const step of copy.steps) {
        step.basedOn = (step.basedOn ?? []).map(localRef);
        for (const capture of Object.values(step.pathParameters ?? {}))
          capture.stepRef = localRef(capture.stepRef);
      }
      apply(id, copy.steps, { ...copy, id, title: name });
    }
  };
  const inherited = useMemo(
    () =>
      story?.forkedFrom
        ? resolveStorySteps(base, story.id).filter((s) => s.inherited)
        : [],
    [base, story],
  );
  const roles = base.entities.filter((e) => e.category === 'role');
  const labels = useMemo(
    () => new Map(base.entities.map((entity) => [entity.id, entity.label])),
    [base.entities],
  );
  const stepLabel = (step: StoryStepAST) =>
    `${step.activity}《${labels.get(step.workObjectRef) ?? step.workObjectRef}》`;
  const prerequisites = [
    ...inherited.map((step) => ({ ref: step.ref, label: stepLabel(step) })),
    ...items
      .slice(0, selected)
      .map((step) => ({ ref: step.id, label: stepLabel(step) })),
  ];
  const moveStep = (offset: number) => {
    const next = selected + offset;
    const order = items.map((step) => step.id);
    [order[selected], order[next]] = [order[next]!, order[selected]!];
    try {
      session.mutate(
        (draft) => reorderStorySteps(draft, flow, order),
        '调整故事步骤顺序',
      );
      setSelected(next);
      setNotice('');
    } catch (error) {
      setNotice(message(error));
    }
  };
  const removeStep = () => {
    if (!item) return;
    if (incomplete)
      apply(
        flow,
        items.filter((step) => step.id !== item.id),
      );
    else {
      try {
        session.mutate((draft) => {
          if (items.length === 1) deleteStory(draft, flow);
          else removeStoryStep(draft, flow, item.id);
        }, '删除故事步骤');
        setNotice('');
      } catch (error) {
        setNotice(message(error));
        return;
      }
    }
    setSelected(Math.max(0, selected - 1));
  };
  const allFlows = flows.includes(flow) || !flow ? flows : [...flows, flow];
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="flex max-h-[90vh] max-w-5xl flex-col overflow-hidden"
        onKeyDown={(event) => event.stopPropagation()}
      >
        <header className="space-y-2 border-b p-4">
          <DialogTitle>业务场景推演</DialogTitle>
          <DialogDescription>
            可写入的场景修改会自动同步到本地。无效输入仅留在当前表单，关闭或切换场景后不保留。推演不是
            HTTP 验收。
          </DialogDescription>
        </header>
        <div className="space-y-2 border-b p-3">
          <label>
            当前场景{' '}
            <select
              aria-label="当前推演场景"
              className={fieldClass}
              value={flow}
              onChange={(e) => {
                setFlow(e.target.value);
                setPendingTitle('');
                setInput(undefined);
                setSelected(0);
                setNotice('');
              }}
            >
              {!allFlows.length ? (
                <option value="">尚无场景，请创建</option>
              ) : null}
              {allFlows.map((f) => (
                <option key={f} value={f}>
                  {base.stories.find((story) => story.id === f)?.title ??
                    pendingTitle}
                </option>
              ))}
            </select>
          </label>
          <input
            aria-label="新场景名称"
            className={`${fieldClass} ml-2`}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="例如：超时未付款"
          />
          <button
            type="button"
            className={`${fieldClass} ml-2`}
            onClick={() => create(false)}
          >
            创建空白场景
          </button>
          <button
            type="button"
            className={`${fieldClass} ml-2`}
            disabled={!flows.includes(flow)}
            onClick={() => create(true)}
          >
            复制当前场景
          </button>
          <label className="ml-2">
            场景类型{' '}
            <select
              aria-label="场景类型"
              className={fieldClass}
              disabled={!items.length}
              value={story?.kind ?? 'primary'}
              onChange={(event) => {
                if (story)
                  apply(flow, items, {
                    ...story,
                    kind: event.target.value as DomainStoryAST['kind'],
                  });
              }}
            >
              {Object.entries(STORY_KIND_LABELS).map(([id, label]) => (
                <option
                  key={id}
                  value={id}
                  disabled={id === 'breach_branch' && !story?.forkedFrom}
                >
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[200px_1fr_280px] overflow-auto text-[12px]">
          <aside className="space-y-2 border-r p-3">
            <h3>场景步骤</h3>
            {inherited.length > 0 && (
              <details>
                <summary>继承的前置步骤（{inherited.length}）</summary>
                <ol>
                  {inherited.map((s) => (
                    <li key={s.ref}>
                      {s.sequence}. {stepLabel(s)}
                    </li>
                  ))}
                </ol>
              </details>
            )}
            {items.map((entry, i) => (
              <button
                key={entry.id}
                type="button"
                aria-pressed={i === selected}
                className={`${fieldClass} block w-full text-left`}
                onClick={() => setSelected(i)}
              >
                {stepLabel(entry)}
              </button>
            ))}
            <label>
              添加业务操作
              <select
                aria-label="添加业务操作"
                className={`${fieldClass} w-full`}
                value={entityRef}
                onChange={(e) => setEntityRef(e.target.value)}
              >
                <option value="">选择单据</option>
                {base.entities
                  .filter((e) => e.category === 'evidence')
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.label}
                    </option>
                  ))}
              </select>
            </label>
            <button
              type="button"
              className={fieldClass}
              disabled={!flow || !entityRef}
              onClick={() => {
                const chosen = routes.values.find(
                  (r) => r.entityRef === entityRef,
                );
                let serial = items.length + 1;
                while (items.some((s) => s.id === 'step-' + serial)) serial++;
                apply(flow, [
                  ...items,
                  {
                    id: 'step-' + serial,
                    sequence: (items.at(-1)?.sequence ?? 0) + 1,
                    workObjectRef: entityRef,
                    actorRef:
                      (chosen && allowedCallerRoleRefs(chosen)[0]) ||
                      roles[0]?.id ||
                      '',
                    activity: '记录',
                    values: {},
                    asOf: '',
                    basedOn: [],
                  },
                ]);
                setSelected(items.length);
              }}
            >
              添加步骤
            </button>
            {routes.error ? (
              <p role="alert">无法投影操作：{routes.error}</p>
            ) : null}
          </aside>
          <section className="space-y-3 p-3" aria-label="场景事实录入">
            {!item ? (
              <p>
                没有自动生成的业务事实。请选择单据添加步骤，或复制已有场景。
              </p>
            ) : (
              <>
                <label className="block">
                  业务动作
                  <input
                    className={fieldClass}
                    aria-label="业务动作"
                    value={item.activity}
                    onChange={(e) =>
                      patch((step) => {
                        step.activity = e.target.value;
                      })
                    }
                  />
                </label>
                <label className="block">
                  承接角色
                  <select
                    className={fieldClass}
                    aria-label="承接角色"
                    value={item.targetActorRef ?? ''}
                    onChange={(e) =>
                      patch((step) => {
                        if (e.target.value)
                          step.targetActorRef = e.target.value;
                        else delete step.targetActorRef;
                      })
                    }
                  >
                    <option value="">无</option>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  业务背景
                  <textarea
                    aria-label="业务背景"
                    className={`${fieldClass} w-full`}
                    value={item.description ?? ''}
                    onChange={(e) =>
                      patch((x) => {
                        if (e.target.value) x.description = e.target.value;
                        else delete x.description;
                      })
                    }
                  />
                </label>
                <label className="block">
                  业务时刻（含时区）
                  <input
                    className={`${fieldClass} w-full`}
                    aria-label="业务时刻"
                    placeholder="2026-01-01T10:00:00Z"
                    value={item.asOf ?? ''}
                    onChange={(e) =>
                      patch((x) => {
                        x.asOf = e.target.value;
                      })
                    }
                  />
                </label>
                <label className="block">
                  操作角色
                  <select
                    className={`${fieldClass} w-full`}
                    aria-label="操作角色"
                    value={item.actorRef ?? ''}
                    onChange={(e) =>
                      patch((x) => {
                        x.actorRef = e.target.value;
                      })
                    }
                  >
                    {[
                      ...new Set([
                        ...roles.map((role) => role.id),
                        ...(route === undefined
                          ? []
                          : allowedCallerRoleRefs(route)),
                      ]),
                    ].map((ref) => (
                      <option key={ref} value={ref}>
                        {base.entities.find((e) => e.id === ref)?.label ?? ref}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  预期 HTTP 状态（仅声明）
                  <input
                    aria-label="预期HTTP状态"
                    className={fieldClass}
                    type="number"
                    min="200"
                    max="599"
                    value={item.expectedStatus ?? ''}
                    placeholder="使用路由默认成功状态"
                    onChange={(e) =>
                      patch((x) => {
                        if (!e.target.value) {
                          delete x.expectedStatus;
                          delete x.inputs;
                        } else {
                          x.expectedStatus = Number(e.target.value);
                          if (x.expectedStatus < 400) delete x.inputs;
                        }
                      })
                    }
                  />
                </label>
                <fieldset className="space-y-1">
                  <legend>前置凭证（明确选择，不猜测业务顺序）</legend>
                  {prerequisites.map(({ ref, label }) => (
                    <label key={ref} className="block">
                      <input
                        type="checkbox"
                        checked={(item.basedOn ?? []).some(
                          (key) => key === ref || key === flow + '#' + ref,
                        )}
                        onChange={(event) =>
                          patch((s) => {
                            s.basedOn = (s.basedOn ?? []).filter(
                              (key) => key !== ref && key !== flow + '#' + ref,
                            );
                            if (event.target.checked) s.basedOn.push(ref);
                          })
                        }
                      />{' '}
                      {label}
                    </label>
                  ))}
                </fieldset>
                <table className="w-full">
                  <thead>
                    <tr>
                      <th>业务字段</th>
                      <th>事实 / 人工预期</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entity?.attributes?.map((attribute) => {
                      const value = enteredValues?.[attribute.name];
                      const problem =
                        value === undefined
                          ? null
                          : validateTypedValue(
                              value,
                              attribute.valueType ?? 'dynamic',
                            );
                      return (
                        <tr key={attribute.name}>
                          <td className="pr-2">
                            {attribute.label}
                            {attribute.derivedByRuleRef && !negative
                              ? '（预期派生值，可空）'
                              : attribute.required
                                ? ' *'
                                : ''}
                          </td>
                          <td>
                            {attribute.valueType === 'bool' ? (
                              <select
                                className={fieldClass}
                                aria-label={attribute.label}
                                value={value === undefined ? '' : String(value)}
                                onChange={(e) =>
                                  patch((x) =>
                                    editField(
                                      x,
                                      attribute.name,
                                      e.target.value,
                                      'bool',
                                    ),
                                  )
                                }
                              >
                                <option value="">未填写</option>
                                <option value="true">是</option>
                                <option value="false">否</option>
                              </select>
                            ) : (
                              <input
                                className={`${fieldClass} w-full`}
                                aria-label={attribute.label}
                                value={
                                  value === undefined
                                    ? ''
                                    : typeof value === 'object'
                                      ? JSON.stringify(value)
                                      : String(value)
                                }
                                onChange={(e) =>
                                  patch((x) =>
                                    editField(
                                      x,
                                      attribute.name,
                                      e.target.value,
                                      attribute.valueType ?? 'dynamic',
                                    ),
                                  )
                                }
                              />
                            )}
                            {problem ? (
                              <p className="text-amber-700">{problem}</p>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <button
                  type="button"
                  className={fieldClass}
                  disabled={!!incomplete || selected === 0}
                  onClick={() => moveStep(-1)}
                >
                  上移一步
                </button>
                <button
                  type="button"
                  className={fieldClass}
                  disabled={!!incomplete || selected === items.length - 1}
                  onClick={() => moveStep(1)}
                >
                  下移一步
                </button>
                <button
                  type="button"
                  className={fieldClass}
                  onClick={removeStep}
                >
                  删除当前步骤
                </button>
              </>
            )}
          </section>
          <aside
            className="space-y-3 border-l p-3"
            aria-label="本地规则推演结果"
          >
            <h3 className="font-semibold">本地规则推演 · 非 HTTP 验收</h3>
            {candidate.error ? (
              <p role="status" className="break-words text-amber-700">
                请补齐用例：{candidate.error}
              </p>
            ) : null}
            {candidate.results.map((result) => (
              <article
                key={result.ref}
                className="space-y-1 break-words border-b pb-2"
              >
                <h4>{result.ref}</h4>
                {result.gaps.map((gap) => (
                  <p key={gap} className="text-amber-700">
                    {gap}
                  </p>
                ))}
                {result.rules.map((r) => (
                  <p
                    key={r.ruleRef}
                    className={r.error ? 'text-amber-700' : ''}
                  >
                    {r.label}：{r.error ?? JSON.stringify(r.value)}
                  </p>
                ))}
              </article>
            ))}
          </aside>
        </div>
        <footer className="space-y-2 border-t p-3 text-[12px]">
          <div className="flex gap-2">
            <button
              type="button"
              className={fieldClass}
              disabled={!!incomplete || !candidate.model || !items.length}
              onClick={() => onPlay(flow)}
            >
              放映当前场景
            </button>
            <button
              type="button"
              className={fieldClass}
              disabled={!!incomplete || !candidate.model || !items.length}
              onClick={() => {
                try {
                  const result = projectAcceptanceTests(
                    candidate.model!,
                    undefined,
                    flow,
                  );
                  setNotice(
                    `可生成 ${result.flows.reduce((n, f) => n + f.steps.length, 0)} 步 HTTP 验收；模型同步后自动生成 Bruno 集合。尚未运行后端。`,
                  );
                } catch (error) {
                  setNotice(`验收投影尚未就绪：${message(error)}`);
                }
              }}
            >
              检查 HTTP 验收投影
            </button>
            <button type="button" className={fieldClass} onClick={onClose}>
              关闭场景工作台
            </button>
          </div>
          {notice ? (
            <p role="status" className="break-words">
              {notice}
            </p>
          ) : null}
        </footer>
      </DialogContent>
    </Dialog>
  );
};
