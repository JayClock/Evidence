let input = '';
let handled = false;
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  if (handled) return;
  input += chunk;
  if (!input.includes('\n')) return;
  handled = true;
  const command = JSON.parse(input.slice(0, input.indexOf('\n')));
  const emit = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);
  emit({
    id: command.id,
    type: 'response',
    command: 'prompt',
    success: true,
  });
  emit({ type: 'message_start', message: { role: 'assistant', content: [] } });
  emit({
    type: 'message_update',
    message: {},
    assistantMessageEvent: {
      type: 'text_delta',
      contentIndex: 0,
      delta: 'contract proposal',
    },
  });
  emit({
    type: 'message_end',
    message: { role: 'assistant', content: 'contract proposal' },
  });
  emit({
    type: 'agent_end',
    messages: [{ role: 'assistant', content: 'contract proposal' }],
  });
  emit({ type: 'agent_settled' });
});
