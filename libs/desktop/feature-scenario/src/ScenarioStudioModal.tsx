import { projectAcceptanceTests } from '@evidence-poc/evidence-acceptance/projection';
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import {
  allowedCallerRoleRefs,
  buildDeliveryRoutes,
} from '@evidence-poc/evidence-api/delivery';
import {
  cloneScenarioExamples,
  evaluateScenario,
  replaceScenarioExamples,
  scenarioExamples,
  type ScenarioExample,
  type ModelSession,
} from '@evidence-poc/evidence-model-core';
import { validateTypedValue } from '@evidence-poc/evidence-cel';
import type { ModelExampleAST } from '@evidence-poc/evidence-schema';
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
  if (type === 'decimal') return value;
  if (['int', 'uint', 'double'].includes(type)) {
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
  const flows = useMemo(
    () =>
      [
        ...new Set(
          base.entities.flatMap((e) =>
            (e.examples ?? []).flatMap((x) => (x.test ? [x.test.flow] : [])),
          ),
        ),
      ].sort(),
    [base],
  );
  const [flow, setFlow] = useState(flows[0] ?? '');
  const [input, setInput] = useState<{
    base: typeof base;
    flow: string;
    items: ScenarioExample[];
    error: string;
  }>();
  const incomplete =
    input?.base === base && input?.flow === flow ? input : undefined;
  const items = useMemo(
    () => incomplete?.items ?? scenarioExamples(base, flow),
    [base, flow, incomplete],
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
  const entity = base.entities.find((e) => e.id === item?.entityRef);
  const route = routes.values.find((r) => r.entityRef === item?.entityRef);
  const negative = (item?.example.test?.expectedStatus ?? 201) >= 400;
  const enteredValues = negative
    ? (item?.example.test?.inputs ?? item?.example.value)
    : item?.example.value;
  const editField = (
    example: ModelExampleAST,
    name: string,
    value: string,
    type: string,
  ) => {
    const values = negative
      ? (example.test!.inputs ??= structuredClone(example.value))
      : example.value;
    if (!value) delete values[name];
    else
      values[name] = parseField(
        value,
        type,
      ) as ModelExampleAST['value'][string];
  };
  const apply = (targetFlow: string, next: ScenarioExample[]) => {
    if (base !== session.getDocument()) return;
    setNotice('');
    try {
      session.mutate(
        (draft) => replaceScenarioExamples(draft, targetFlow, next),
        '更新业务场景',
      );
      setInput(undefined);
    } catch (error) {
      setInput({ base, flow: targetFlow, items: next, error: message(error) });
    }
  };
  const patch = (change: (example: ModelExampleAST) => void) => {
    apply(
      flow,
      items.map((entry, i) => {
        if (i !== selected) return entry;
        const next = structuredClone(entry);
        change(next.example);
        return next;
      }),
    );
  };
  const create = (clone: boolean) => {
    const name = newName.trim();
    if (!name || flows.includes(name) || name === flow) {
      setNotice('请填写未使用的场景名称。');
      return;
    }
    setInput(undefined);
    setFlow(name);
    setSelected(0);
    setNewName('');
    setNotice('');
    if (clone) apply(name, cloneScenarioExamples(base, flow, name));
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
                  {f}
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
              value={
                items[0]?.example.test?.tags?.find((tag) =>
                  [
                    'happy_path',
                    'breach_timeout',
                    'breach_compensation',
                    'custom',
                  ].includes(tag),
                ) ?? 'custom'
              }
              onChange={(e) => {
                apply(
                  flow,
                  items.map((entry) => {
                    const next = structuredClone(entry);
                    next.example.test!.tags = [
                      ...(next.example.test!.tags ?? []).filter(
                        (tag) =>
                          ![
                            'happy_path',
                            'breach_timeout',
                            'breach_compensation',
                            'custom',
                          ].includes(tag),
                      ),
                      e.target.value,
                    ];
                    return next;
                  }),
                );
              }}
            >
              <option value="custom">自定义</option>
              <option value="happy_path">正常履约</option>
              <option value="breach_timeout">超时场景</option>
              <option value="breach_compensation">补偿场景</option>
            </select>
          </label>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[200px_1fr_280px] overflow-auto text-[12px]">
          <aside className="space-y-2 border-r p-3">
            <h3>场景步骤（顺序由依据与业务时刻确定）</h3>
            {items.map((entry, i) => (
              <button
                key={`${entry.entityRef}:${i}`}
                type="button"
                aria-pressed={i === selected}
                className={`${fieldClass} block w-full text-left`}
                onClick={() => setSelected(i)}
              >
                {entry.example.label}
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
                {routes.values.map((r) => (
                  <option key={r.id} value={r.entityRef}>
                    {base.entities.find((e) => e.id === r.entityRef)?.label ??
                      r.entityRef}
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
                if (!chosen) return;
                const label = `${flow} · ${base.entities.find((e) => e.id === entityRef)?.label ?? entityRef} · ${items.length + 1}`;
                apply(flow, [
                  ...items,
                  {
                    entityRef,
                    example: {
                      label,
                      value: {},
                      test: {
                        flow,
                        actingRoleRef: allowedCallerRoleRefs(chosen)[0] ?? '',
                        asOf: '',
                      },
                    },
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
                  步骤名称
                  <input
                    className={`${fieldClass} w-full`}
                    aria-label="步骤名称"
                    value={item.example.label}
                    onChange={(e) => {
                      // Labels are canonical dependency identities: changing a referenced label would orphan later steps.
                      const previous = `${item.entityRef}#${item.example.label}`;
                      const next = `${item.entityRef}#${e.target.value}`;
                      apply(
                        flow,
                        items.map((entry, i) => {
                          const copy = structuredClone(entry);
                          if (i === selected)
                            copy.example.label = e.target.value;
                          if (copy.example.test?.basedOn)
                            copy.example.test.basedOn =
                              copy.example.test.basedOn.map((ref) =>
                                ref === previous ? next : ref,
                              );
                          if (copy.example.test?.pathParameters)
                            for (const source of Object.values(
                              copy.example.test.pathParameters,
                            ))
                              if (source.exampleRef === previous)
                                source.exampleRef = next;
                          return copy;
                        }),
                      );
                    }}
                  />
                </label>
                <label className="block">
                  业务背景
                  <textarea
                    aria-label="业务背景"
                    className={`${fieldClass} w-full`}
                    value={item.example.description ?? ''}
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
                    value={item.example.test?.asOf ?? ''}
                    onChange={(e) =>
                      patch((x) => {
                        x.test!.asOf = e.target.value;
                      })
                    }
                  />
                </label>
                <label className="block">
                  操作角色
                  <select
                    className={`${fieldClass} w-full`}
                    aria-label="操作角色"
                    value={item.example.test?.actingRoleRef ?? ''}
                    onChange={(e) =>
                      patch((x) => {
                        x.test!.actingRoleRef = e.target.value;
                      })
                    }
                  >
                    {[
                      ...new Set([
                        item.example.test?.actingRoleRef ?? '',
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
                    value={item.example.test?.expectedStatus ?? ''}
                    placeholder="使用路由默认成功状态"
                    onChange={(e) =>
                      patch((x) => {
                        if (!e.target.value) {
                          delete x.test!.expectedStatus;
                          delete x.test!.inputs;
                        } else {
                          x.test!.expectedStatus = Number(e.target.value);
                          if (x.test!.expectedStatus < 400)
                            delete x.test!.inputs;
                        }
                      })
                    }
                  />
                </label>
                <fieldset className="space-y-1">
                  <legend>前置凭证（明确选择，不猜测业务顺序）</legend>
                  {items.map((entry, i) =>
                    i === selected ? null : (
                      <label key={i} className="block">
                        <input
                          type="checkbox"
                          checked={
                            item.example.test?.basedOn?.includes(
                              `${entry.entityRef}#${entry.example.label}`,
                            ) ?? false
                          }
                          onChange={(e) =>
                            patch((x) => {
                              const ref = `${entry.entityRef}#${entry.example.label}`;
                              x.test!.basedOn = e.target.checked
                                ? [...(x.test!.basedOn ?? []), ref]
                                : (x.test!.basedOn ?? []).filter(
                                    (r) => r !== ref,
                                  );
                            })
                          }
                        />{' '}
                        {entry.example.label}
                      </label>
                    ),
                  )}
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
                  onClick={() => {
                    apply(
                      flow,
                      items.filter((_, i) => i !== selected),
                    );
                    setSelected(0);
                  }}
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
                  const scoped = structuredClone(candidate.model!);
                  for (const e of scoped.entities)
                    if (e.examples)
                      e.examples = e.examples.filter(
                        (x) => x.test?.flow === flow,
                      );
                  const result = projectAcceptanceTests(scoped);
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
