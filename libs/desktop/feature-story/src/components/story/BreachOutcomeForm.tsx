import { useId, useState } from 'react';
import { Button } from '@evidence-poc/desktop-ui-kit';
import {
  TERMINAL_REMEDY_KINDS,
  type RecordBreachOutcomeInput,
  type TerminalRemedyKind,
} from '@evidence-poc/evidence-schema';
import type { StoryPlaybackController } from '../../state/useStoryPlayback';

const remedies: Record<TerminalRemedyKind, string> = {
  lawsuit: '诉讼',
  arbitration: '仲裁',
  contract_termination: '合同终止',
};
const fieldClass =
  'w-full rounded border border-evidence-line bg-evidence-surface px-2 py-1';

const BreachOutcomeForm = ({
  formId,
  playback,
}: {
  formId: string;
  playback: StoryPlaybackController;
}) => {
  const id = useId();
  const [kind, setKind] =
    useState<RecordBreachOutcomeInput['outcome']['kind']>('compensation_pair');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const requests = playback.promotionRequests;
  const singleRequest = requests.length === 1 ? requests[0] : undefined;
  const compensation = kind === 'compensation_pair';
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
          setError(cause instanceof Error ? cause.message : String(cause));
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
        <fieldset className="flex flex-wrap gap-x-4 gap-y-1">
          <legend className="mb-1">处置方式</legend>
          <label>
            <input
              type="radio"
              name="kind"
              value="compensation_pair"
              checked={compensation}
              onChange={() => {
                setKind('compensation_pair');
                setError('');
              }}
            />{' '}
            补偿履约
          </label>
          <label>
            <input
              type="radio"
              name="kind"
              value="terminal_escalation"
              checked={!compensation}
              onChange={() => {
                setKind('terminal_escalation');
                setError('');
              }}
            />{' '}
            争议终结
          </label>
        </fieldset>
        {compensation ? (
          <>
            <label className="flex flex-col gap-1">
              补偿请求名称
              <input
                name="requestLabel"
                required
                pattern=".*\S.*"
                className={fieldClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              补偿确认名称
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
            争议终结方式
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
          {compensation ? '固化为违约补偿履约' : '固化为争议终结'}
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
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="flex flex-col items-start gap-2 border-t border-evidence-line pt-3">
      <p>当前推演已触发违约条件，可记录双方约定的处置方式。</p>
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
