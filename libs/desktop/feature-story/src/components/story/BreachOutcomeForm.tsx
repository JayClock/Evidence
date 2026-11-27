import { useId, useState } from 'react';
import { Button } from '@evidence-poc/desktop-ui-kit';
import {
  TERMINAL_REMEDY_KINDS,
  type TerminalRemedyKind,
} from '@evidence-poc/evidence-schema';
import type { StoryPlaybackController } from '../../state/useStoryPlayback';

const remedies: Record<TerminalRemedyKind, string> = {
  lawsuit: '诉讼',
  arbitration: '仲裁',
  contract_termination: '解除合同',
};
const fieldClass =
  'w-full rounded border border-evidence-line bg-evidence-surface px-2 py-1';

const OutcomeChoice = ({
  label,
  description,
  checked,
  onSelect,
}: {
  label: string;
  description: string;
  checked: boolean;
  onSelect: () => void;
}) => {
  const id = useId();
  return (
    <label className="grid flex-1 cursor-pointer grid-cols-[auto_1fr] items-baseline gap-x-2 gap-y-1 rounded-md border border-evidence-line p-2 has-checked:border-evidence-accent">
      <input
        type="radio"
        name="kind"
        checked={checked}
        aria-labelledby={id}
        aria-describedby={`${id}-help`}
        onChange={onSelect}
      />
      <span id={id} className="font-medium">
        {label}
      </span>
      <span id={`${id}-help`} className="col-start-2 text-evidence-muted">
        {description}
      </span>
    </label>
  );
};

function outcomeError(cause: unknown) {
  const message = cause instanceof Error ? cause.message : '';
  if (message.includes('已有处理分支'))
    return '这个触发条件已有处置分支，请核对已有约定。';
  if (message.includes('已变化'))
    return '模型或当前步骤已变化，请重新推演后保存。';
  return '分支未能保存，请复核触发条件和处置约定后重试。';
}

const BreachOutcomeForm = ({
  formId,
  playback,
}: {
  formId: string;
  playback: StoryPlaybackController;
}) => {
  const id = useId();
  const [compensation, setCompensation] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const requests = playback.promotionRequests;
  const singleRequest = requests.length === 1 ? requests[0] : undefined;
  const chooseCompensation = (selected: boolean) => {
    setCompensation(selected);
    setError('');
  };
  return (
    <form
      id={formId}
      aria-labelledby={id}
      className="flex w-full flex-col gap-2 rounded-lg border border-evidence-line p-3"
      onFocus={() => {
        if (playback.isPlaying) playback.togglePlaying();
      }}
      onSubmit={async (event) => {
        event.preventDefault();
        if (submitting) return;
        const data = new FormData(event.currentTarget);
        const value = (name: string) => String(data.get(name) ?? '').trim();
        const requestRef = singleRequest?.id ?? value('requestRef');
        const branch = crypto.randomUUID();
        const remedy = TERMINAL_REMEDY_KINDS.find(
          (option) => option === value('remedy'),
        );
        if (!compensation && !remedy) return;
        setError('');
        setSubmitting(true);
        try {
          await playback.promoteBreachOutcome({
            requestRef,
            condition: value('condition'),
            outcome: remedy
              ? {
                  kind: 'terminal_escalation',
                  remedyKind: remedy,
                  handoff: {
                    id: `evidence.handoff-${branch}`,
                    label: `${remedies[remedy]}移交凭证`,
                  },
                }
              : {
                  kind: 'compensation_pair',
                  request: {
                    id: `request.compensation-${branch}`,
                    label: value('requestLabel'),
                  },
                  confirmation: {
                    id: `confirmation.compensation-${branch}`,
                    label: value('confirmationLabel'),
                  },
                },
          });
        } catch (cause) {
          setError(outcomeError(cause));
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <h3 id={id} className="font-medium">
        固化违约分支
      </h3>
      <p className="text-evidence-muted">
        填写双方已确认的触发条件和处置约定，提交后可复核或撤销。
      </p>
      <fieldset disabled={submitting} className="flex min-w-0 flex-col gap-2">
        <legend className="sr-only">处置约定</legend>
        {singleRequest ? (
          <p>原履约请求：{singleRequest.label}</p>
        ) : (
          <label className="flex flex-col gap-1">
            原履约请求
            <select
              name="requestRef"
              defaultValue=""
              required
              className={fieldClass}
            >
              <option value="" disabled>
                选择本次处置的请求
              </option>
              {requests.map(({ id, label }) => (
                <option value={id} key={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1">
          已确认的触发条件
          <input
            name="condition"
            required
            pattern=".*\S.*"
            className={fieldClass}
          />
        </label>
        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-1">处置方式</legend>
          <OutcomeChoice
            label="约定履约补救"
            description="约定补交、展期或支付滞纳金，并记录如何确认补救完成。"
            checked={compensation}
            onSelect={() => chooseCompensation(true)}
          />
          <OutcomeChoice
            label="启动终极救济"
            description="按约定解除合同，或将争议移交仲裁机构、法院。"
            checked={!compensation}
            onSelect={() => chooseCompensation(false)}
          />
        </fieldset>
        {compensation ? (
          <>
            <label className="flex flex-col gap-1">
              补救请求名称
              <input
                name="requestLabel"
                required
                pattern=".*\S.*"
                className={fieldClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              补救确认名称
              <input
                name="confirmationLabel"
                required
                pattern=".*\S.*"
                className={fieldClass}
              />
            </label>
          </>
        ) : (
          <label className="flex flex-col gap-1">
            救济方式
            <select
              name="remedy"
              defaultValue=""
              required
              className={fieldClass}
            >
              <option value="" disabled>
                选择已约定的方式
              </option>
              {TERMINAL_REMEDY_KINDS.map((option) => (
                <option key={option} value={option}>
                  {remedies[option]}
                </option>
              ))}
            </select>
          </label>
        )}
        <Button type="submit" variant="default" className="self-start">
          {compensation ? '保存补救分支' : '保存救济分支'}
        </Button>
      </fieldset>
      {error ? (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      ) : null}
    </form>
  );
};

export const BreachOutcomeDisclosure = ({
  playback,
}: {
  playback: StoryPlaybackController;
}) => {
  const id = useId();
  const [expanded, setExpanded] = useState(playback.breachedStep !== undefined);
  return (
    <div className="flex flex-col items-start gap-2 border-t border-evidence-line pt-3">
      {!expanded ? <p>已触发违约，可约定履约补救或启动终极救济。</p> : null}
      <Button
        type="button"
        aria-expanded={expanded}
        aria-controls={expanded ? id : undefined}
        onClick={() => {
          if (!expanded && playback.isPlaying) playback.togglePlaying();
          setExpanded(!expanded);
        }}
      >
        {expanded ? '收起分支表单' : '固化违约分支…'}
      </Button>
      {expanded ? <BreachOutcomeForm formId={id} playback={playback} /> : null}
    </div>
  );
};
