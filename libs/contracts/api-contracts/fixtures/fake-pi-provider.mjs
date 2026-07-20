import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROVIDER_ID = 'evidence-contract';
const MODEL_ID = 'contract-model';

export async function startFakePiProvider(options = {}) {
  const host = options.host ?? '127.0.0.1';
  const responseText = options.responseText ?? 'contract proposal';
  const server = createServer((request, response) => {
    if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
      response.writeHead(404).end();
      return;
    }

    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      try {
        const input = JSON.parse(body);
        if (input.model !== MODEL_ID || input.stream !== true) {
          response.writeHead(400).end();
          return;
        }
        response.writeHead(200, {
          'cache-control': 'no-cache',
          connection: 'keep-alive',
          'content-type': 'text/event-stream',
        });
        const base = {
          id: 'chatcmpl-evidence-contract',
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1_000),
          model: MODEL_ID,
        };
        sendChunk(response, {
          ...base,
          choices: [
            {
              index: 0,
              delta: { role: 'assistant' },
              finish_reason: null,
            },
          ],
        });
        sendChunk(response, {
          ...base,
          choices: [
            {
              index: 0,
              delta: { content: responseText },
              finish_reason: null,
            },
          ],
        });
        sendChunk(response, {
          ...base,
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          usage: {
            prompt_tokens: 1,
            completion_tokens: 2,
            total_tokens: 3,
          },
        });
        response.end('data: [DONE]\n\n');
      } catch {
        response.writeHead(400).end();
      }
    });
  });

  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, host, resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Could not start the fake Pi provider.');
  }

  return {
    baseUrl: `http://${host}:${address.port}/v1`,
    close: () =>
      new Promise((resolveClose, reject) => {
        server.close((error) => (error ? reject(error) : resolveClose()));
      }),
  };
}

export async function writeFakePiAgentConfig(agentDir, baseUrl) {
  await mkdir(agentDir, { recursive: true });
  await Promise.all([
    writeFile(
      resolve(agentDir, 'settings.json'),
      `${JSON.stringify(
        {
          defaultProvider: PROVIDER_ID,
          defaultModel: MODEL_ID,
          defaultThinkingLevel: 'off',
          defaultProjectTrust: 'never',
          enableInstallTelemetry: false,
          compaction: { enabled: false },
          retry: { enabled: false },
        },
        null,
        2,
      )}\n`,
      'utf8',
    ),
    writeFile(
      resolve(agentDir, 'models.json'),
      `${JSON.stringify(
        {
          providers: {
            [PROVIDER_ID]: {
              baseUrl,
              api: 'openai-completions',
              apiKey: 'contract-key',
              models: [
                {
                  id: MODEL_ID,
                  name: 'Evidence contract model',
                  reasoning: false,
                  input: ['text'],
                  contextWindow: 128_000,
                  maxTokens: 4_096,
                  cost: {
                    input: 0,
                    output: 0,
                    cacheRead: 0,
                    cacheWrite: 0,
                  },
                  compat: {
                    supportsDeveloperRole: false,
                    supportsReasoningEffort: false,
                    supportsUsageInStreaming: true,
                    maxTokensField: 'max_tokens',
                  },
                },
              ],
            },
          },
        },
        null,
        2,
      )}\n`,
      'utf8',
    ),
  ]);
}

function sendChunk(response, value) {
  response.write(`data: ${JSON.stringify(value)}\n\n`);
}

async function runStandalone() {
  const agentDir = process.env.PI_CODING_AGENT_DIR;
  if (!agentDir) {
    throw new Error('PI_CODING_AGENT_DIR is required.');
  }
  const runtime = await startFakePiProvider({
    port: Number(process.env.EVIDENCE_FAKE_PI_PORT ?? 0),
  });
  await writeFakePiAgentConfig(agentDir, runtime.baseUrl);
  process.stdout.write(`EVIDENCE_FAKE_PI_READY ${runtime.baseUrl}\n`);

  const stop = async () => {
    await runtime.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void stop());
  process.once('SIGTERM', () => void stop());
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await runStandalone();
}
