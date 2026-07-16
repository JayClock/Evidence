import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { extname, relative, resolve, sep } from 'node:path';
import type { CapturedInboxSource } from '../../capabilities/inbox/model';
import type { InboxSourceAdapter } from '../../capabilities/inbox/source';

export interface ManualTextInput {
  title: string;
  body: string;
}

export interface LocalMarkdownInput {
  path: string;
}

const MAX_LOCAL_SOURCE_BYTES = 1024 * 1024;

function requiredText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} must not be empty.`);
  return normalized;
}

function portable(path: string): string {
  return path.split(sep).join('/');
}

export const manualTextInboxSource: InboxSourceAdapter<ManualTextInput> = {
  kind: 'manual_text',
  async capture(input): Promise<CapturedInboxSource> {
    const title = requiredText(input.title, 'Manual source title');
    const body = requiredText(input.body, 'Manual source body').replace(
      /\r\n?/g,
      '\n',
    );
    const key = createHash('sha256')
      .update(JSON.stringify({ title, body }))
      .digest('hex');
    return {
      source_kind: 'manual_text',
      external_key: `manual:${key}`,
      title,
      body,
      content_type: 'text/plain',
      provider_metadata: {},
    };
  },
};

export const localMarkdownInboxSource: InboxSourceAdapter<LocalMarkdownInput> =
  {
    kind: 'local_markdown',
    async capture(input, cwd): Promise<CapturedInboxSource> {
      const requested = requiredText(input.path, 'Local Markdown path');
      const root = realpathSync(cwd);
      const absolute = realpathSync(resolve(cwd, requested));
      const pathFromRoot = relative(root, absolute);
      if (
        !pathFromRoot ||
        pathFromRoot === '..' ||
        pathFromRoot.startsWith(`..${sep}`) ||
        resolve(root, pathFromRoot) !== absolute
      ) {
        throw new Error(
          'Local Markdown source must be a file inside the project.',
        );
      }
      if (!['.md', '.markdown'].includes(extname(absolute).toLowerCase())) {
        throw new Error('Local Inbox sources must be Markdown files.');
      }
      const stats = statSync(absolute);
      if (!stats.isFile())
        throw new Error('Local Markdown source must be a file.');
      if (stats.size > MAX_LOCAL_SOURCE_BYTES) {
        throw new Error('Local Markdown source exceeds the 1MB Inbox limit.');
      }
      const body = readFileSync(absolute, 'utf8');
      if (!body.trim())
        throw new Error('Local Markdown source must not be empty.');
      const projectPath = portable(pathFromRoot);
      const heading = body.match(/^#\s+(.+?)\s*$/m)?.[1]?.trim();
      return {
        source_kind: 'local_markdown',
        external_key: `workspace:${projectPath}`,
        uri: `workspace://${projectPath}`,
        title: heading || projectPath,
        body: body.replace(/\r\n?/g, '\n'),
        content_type: 'text/markdown',
        provider_metadata: { path: projectPath },
        source_updated_at: stats.mtime.toISOString(),
      };
    },
  };
