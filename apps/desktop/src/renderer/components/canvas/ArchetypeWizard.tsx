import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import {
  createModelPatch,
  getBusinessArchetype,
  instantiateArchetypeMutator,
  listBusinessArchetypes,
} from '@evidence-poc/evidence-model-core';
import {
  InstantiateArchetypeInputSchema,
  type BusinessArchetypeId,
  type DomainModelDocument,
  type InstantiateArchetypeInput,
  type JsonPatchOperation,
  type TerminalRemedyKind,
} from '@evidence-poc/evidence-schema';
import {
  Button,
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@evidence-poc/desktop-ui-kit';

const library = listBusinessArchetypes();
const fieldClass =
  'w-full rounded border border-evidence-border bg-evidence-panel px-2 py-1.5 text-sm focus-visible:outline-evidence-accent';
const remedies = {
  lawsuit: '移交诉讼',
  arbitration: '移交仲裁',
  contract_termination: '解除合同',
} satisfies Record<TerminalRemedyKind, string>;

export interface ArchetypePreview {
  base: DomainModelDocument;
  label: string;
  input: InstantiateArchetypeInput;
  patches: readonly JsonPatchOperation[];
  result: ReturnType<typeof instantiateArchetypeMutator>;
}

interface WizardProps {
  document: DomainModelDocument;
  disabled: boolean;
  onApply: (preview: ArchetypePreview) => void;
}

const WizardSteps = ({ document, disabled, onApply }: WizardProps) => {
  const [archetypeId, setArchetypeId] =
    useState<BusinessArchetypeId>('matching-escrow');
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<Record<string, string>>({});
  const [compensationEnabled, setCompensationEnabled] = useState(false);
  const [preview, setPreview] = useState<ArchetypePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const errorSummary = useRef<HTMLParagraphElement>(null);
  const fieldHelpId = useId();
  const remedyEnabled = Boolean(form.remedyKind);
  const archetype = getBusinessArchetype(archetypeId);
  const stale = preview !== null && preview.base !== document;
  const setField = (name: string, value: string) => {
    setError(null);
    setForm((current) => ({ ...current, [name]: value }));
  };

  useLayoutEffect(() => {
    if (step !== 1) heading.current?.focus();
  }, [step]);
  useLayoutEffect(() => {
    if (error !== null) errorSummary.current?.focus();
  }, [error]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled) return;
    setError(null);
    if (step === 1) {
      setStep(2);
      return;
    }
    try {
      if (step === 3) {
        if (!preview || stale)
          throw new Error('模型已变化，请返回并重新预览。');
        onApply(preview);
        return;
      }
      const parsed = InstantiateArchetypeInputSchema.safeParse({
        archetypeId,
        idPrefix: form.idPrefix?.trim(),
        variationValues: {
          ...Object.fromEntries(
            archetype.fields.map(({ key, required }) => [
              key,
              required ? (form[key] ?? '') : form[key]?.trim() || undefined,
            ]),
          ),
          ...(compensationEnabled
            ? {
                compensation: {
                  requester: form.compensationRequester ?? 'customer',
                  condition: form.compensationCondition ?? '',
                  requestLabel: form.compensationRequestLabel ?? '',
                  confirmationLabel: form.compensationConfirmationLabel ?? '',
                  fulfillmentAction:
                    form.compensationAction?.trim() || undefined,
                  window: form.compensationWindow?.trim() || undefined,
                },
              }
            : {}),
          ...(remedyEnabled
            ? {
                remedy: {
                  kind: form.remedyKind,
                  condition: form.remedyCondition ?? '',
                  ...(compensationEnabled && form.remedyScope === 'compensation'
                    ? { appliesTo: 'compensation' }
                    : {}),
                },
              }
            : {}),
        },
      });
      if (!parsed.success) {
        const path = parsed.error.issues[0]?.path;
        if (path?.[0] === 'idPrefix')
          throw new Error('请输入有效的实例前缀，例如 membership。');
        const field = archetype.fields.find(({ key }) => key === path?.[1]);
        throw new Error(
          `请检查${field?.label ?? '异常处置约定'}：内容不能只有空格，且不得超过 200 字。`,
        );
      }
      const input = parsed.data;
      const prepared = createModelPatch(document, (draft) =>
        instantiateArchetypeMutator(draft, input),
      );
      setPreview({
        base: document,
        label: archetype.label,
        input,
        ...prepared,
      });
      setStep(3);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法应用此模式。');
    }
  };

  return (
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
      <SheetBody className="overscroll-contain">
        <nav aria-label="模板应用进度">
          <ol className="flex flex-wrap gap-2 text-xs text-workbench-label">
            {['权责骨架', '配置变化点', '复核与应用'].map((label, index) => (
              <li
                key={label}
                aria-current={step === index + 1 ? 'step' : undefined}
              >
                {index + 1}. {label}
              </li>
            ))}
          </ol>
        </nav>
        <h3 tabIndex={-1} ref={heading} className="my-3 text-sm font-semibold">
          {step === 1
            ? '选择业务模式'
            : step === 2
              ? '填写已确认的业务约定'
              : '确认追加到当前模型'}
        </h3>
        {step === 1 && (
          <div className="flex flex-col gap-3">
            <fieldset className="flex flex-col gap-2">
              <legend className="sr-only">可复用的业务模式</legend>
              {library.map(({ id, label }) => (
                <label key={id} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="archetype"
                    value={id}
                    checked={id === archetypeId}
                    onChange={() => setArchetypeId(id)}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            <p className="text-sm text-workbench-label">{archetype.summary}</p>
            <ol
              aria-label="模板权责骨架"
              className="flex list-decimal flex-col gap-1 pl-5 text-sm"
            >
              {archetype.outline.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ol>
            <p className="text-xs text-workbench-label">
              模板不是业务事实。未确认的时限、结算依据和争议处置留空。
            </p>
          </div>
        )}
        {step === 2 && (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              实例前缀
              <input
                className={fieldClass}
                name="idPrefix"
                required
                maxLength={60}
                spellCheck={false}
                autoCapitalize="none"
                aria-describedby={fieldHelpId}
                value={form.idPrefix ?? ''}
                onChange={(event) => setField('idPrefix', event.target.value)}
              />
              <span id={fieldHelpId} className="text-xs text-workbench-label">
                以小写字母开头，可用小写字母、数字、点和连字符。例如
                membership。
              </span>
            </label>
            {archetype.fields.map(({ key, label, required }) => (
              <label key={key} className="flex flex-col gap-1 text-sm">
                {label}
                <input
                  className={fieldClass}
                  name={key}
                  required={required}
                  maxLength={200}
                  value={form[key] ?? ''}
                  onChange={(event) => setField(key, event.target.value)}
                />
              </label>
            ))}
            <fieldset className="flex flex-col gap-2 border-t border-evidence-border pt-2">
              <legend className="text-sm font-medium">违约补偿（可选）</legend>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="includeCompensation"
                  checked={compensationEnabled}
                  onChange={(event) => {
                    setError(null);
                    setCompensationEnabled(event.target.checked);
                  }}
                />
                已确认主履约违约后的新补偿权责
              </label>
              {compensationEnabled && (
                <>
                  <label className="flex flex-col gap-1 text-sm">
                    谁主张补偿
                    <select
                      className={fieldClass}
                      name="compensationRequester"
                      value={form.compensationRequester ?? 'customer'}
                      onChange={(event) =>
                        setField('compensationRequester', event.target.value)
                      }
                    >
                      <option value="customer">需求方</option>
                      <option value="operator">运营方</option>
                    </select>
                  </label>
                  {(
                    [
                      ['compensationCondition', '已确认的补偿触发条件', true],
                      ['compensationRequestLabel', '补偿请求名称', true],
                      ['compensationConfirmationLabel', '补偿确认名称', true],
                      ['compensationAction', '补偿动作（可选）', false],
                      ['compensationWindow', '补偿时限（可选）', false],
                    ] as const
                  ).map(([key, label, required]) => (
                    <label key={key} className="flex flex-col gap-1 text-sm">
                      {label}
                      <input
                        name={key}
                        required={required}
                        maxLength={200}
                        className={fieldClass}
                        value={form[key] ?? ''}
                        onChange={(event) => setField(key, event.target.value)}
                      />
                    </label>
                  ))}
                </>
              )}
            </fieldset>
            <label className="flex flex-col gap-1 text-sm">
              争议终点（可选）
              <select
                className={fieldClass}
                name="remedyKind"
                value={form.remedyKind ?? ''}
                onChange={(event) => setField('remedyKind', event.target.value)}
              >
                <option value="">未约定</option>
                {Object.entries(remedies).map(([kind, label]) => (
                  <option key={kind} value={kind}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {remedyEnabled && compensationEnabled && (
              <label className="flex flex-col gap-1 text-sm">
                争议来自哪一项履约
                <select
                  name="remedyScope"
                  className={fieldClass}
                  value={form.remedyScope ?? 'primary'}
                  onChange={(event) =>
                    setField('remedyScope', event.target.value)
                  }
                >
                  <option value="primary">主履约</option>
                  <option value="compensation">补偿履约</option>
                </select>
              </label>
            )}
            {remedyEnabled && (
              <label className="flex flex-col gap-1 text-sm">
                已确认的争议触发条件
                <input
                  className={fieldClass}
                  name="remedyCondition"
                  required
                  maxLength={200}
                  value={form.remedyCondition ?? ''}
                  onChange={(event) =>
                    setField('remedyCondition', event.target.value)
                  }
                />
              </label>
            )}
          </div>
        )}
        {step === 3 && preview && (
          <div className="flex flex-col gap-2 text-sm">
            <p>
              {preview.label} · {preview.input.idPrefix} · 新增{' '}
              {preview.result.createdIds.length} 个模型对象
            </p>
            <dl className="grid grid-cols-2 gap-2">
              {archetype.fields.map(({ key, label }) => (
                <div key={key}>
                  <dt className="text-workbench-label">{label}</dt>
                  <dd className="wrap-break-word">
                    {preview.input.variationValues[key] ?? '未约定'}
                  </dd>
                </div>
              ))}
            </dl>
            {preview.input.variationValues.compensation && (
              <p>
                补偿履约：{preview.input.variationValues.compensation.condition}{' '}
                → {preview.input.variationValues.compensation.requestLabel} →{' '}
                {preview.input.variationValues.compensation.confirmationLabel}
              </p>
            )}
            <p>
              争议终点：
              {preview.input.variationValues.remedy
                ? `${preview.input.variationValues.remedy.appliesTo === 'compensation' ? '补偿履约' : '主履约'} · ${remedies[preview.input.variationValues.remedy.kind]}（${preview.input.variationValues.remedy.condition}）`
                : '未约定'}
            </p>
            <p className="text-workbench-label">
              只追加设计骨架，不覆盖已有对象。应用后可一步撤销。
            </p>
            {stale && <p role="status">模型已变化，请返回并重新预览。</p>}
          </div>
        )}
        {error && (
          <p
            role="alert"
            tabIndex={-1}
            ref={errorSummary}
            className="mt-3 wrap-break-word text-sm text-evidence-evidence"
          >
            {error}
          </p>
        )}
      </SheetBody>
      <SheetFooter>
        <SheetClose asChild>
          <Button type="button" size="sm" variant="ghost">
            取消
          </Button>
        </SheetClose>
        {step > 1 && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setError(null);
              setStep(step - 1);
            }}
          >
            上一步
          </Button>
        )}
        <Button
          type="submit"
          size="sm"
          disabled={disabled || (step === 3 && stale)}
        >
          {step === 1 ? '配置变化点' : step === 2 ? '预览变更' : '应用到画布'}
        </Button>
      </SheetFooter>
    </form>
  );
};

export const ArchetypeWizard = (props: WizardProps) => {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={props.disabled}
        >
          业务模式模板
        </Button>
      </SheetTrigger>
      <SheetContent data-evidence-capture-hide="">
        <SheetHeader>
          <SheetTitle>业务模式模板</SheetTitle>
          <SheetDescription>
            预览骨架、填写业务变化点，再将模型追加到当前项目。
          </SheetDescription>
        </SheetHeader>
        {open && (
          <WizardSteps
            {...props}
            onApply={(preview) => {
              props.onApply(preview);
              setOpen(false);
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
};
