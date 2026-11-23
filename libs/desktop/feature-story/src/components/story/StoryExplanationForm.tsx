import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@evidence-poc/desktop-ui-kit';

export const StoryExplanationForm = ({
  initialText,
  onSave,
  onCancel,
}: {
  initialText: string;
  onSave: (text: string) => void;
  onCancel: () => void;
}) => {
  const id = useId();
  const input = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(initialText);
  const [error, setError] = useState<string>();
  const [invalid, setInvalid] = useState(false);
  useEffect(() => input.current?.focus({ preventScroll: true }), []);

  return (
    <form
      aria-label="审阅业务解释"
      className="mt-3 flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const explanation = text.trim();
        if (!explanation) {
          setError('请输入业务解释。');
          setInvalid(true);
          input.current?.focus();
          return;
        }
        try {
          onSave(explanation);
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : '未能应用业务解释，请重试。',
          );
        }
      }}
    >
      <label htmlFor={id} className="font-medium">
        业务解释（必填）
      </label>
      <textarea
        id={id}
        ref={input}
        rows={4}
        required
        aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
        aria-invalid={invalid || undefined}
        className="min-w-0 w-full resize-y rounded border border-evidence-line bg-evidence-surface px-2 py-1"
        value={text}
        onChange={(event) => {
          setText(event.currentTarget.value);
          if (error) setError(undefined);
          if (invalid) setInvalid(false);
        }}
      />
      <p id={`${id}-hint`} className="text-evidence-muted">
        只说明当前案例的单据、权责和依据。采纳只更新示例说明，不会新增规则；请用「保存模型」写入项目。
      </p>
      {error ? (
        <p id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="xs">
          应用到示例
        </Button>
        <Button type="button" variant="ghost" size="xs" onClick={onCancel}>
          取消
        </Button>
      </div>
    </form>
  );
};
