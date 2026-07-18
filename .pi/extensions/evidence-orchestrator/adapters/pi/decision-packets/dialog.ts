import {
  DynamicBorder,
  type ExtensionCommandContext,
} from '@earendil-works/pi-coding-agent';
import {
  Container,
  type SelectItem,
  SelectList,
  Text,
  truncateToWidth,
  visibleWidth,
} from '@earendil-works/pi-tui';
import { validateDecisionPacket, type HumanDecisionPacket } from './contract';
import {
  renderDecisionPacketViewport,
  type DecisionPacketLineTone,
} from './renderer';

const REVIEW_HEIGHT = 14;
const CANCEL_VALUE = '__decision_packet_cancel__';

type DialogKeybinding =
  | 'tui.select.up'
  | 'tui.select.down'
  | 'tui.select.pageUp'
  | 'tui.select.pageDown'
  | 'tui.select.confirm'
  | 'tui.select.cancel';

interface DialogKeybindings {
  matches(data: string, keybinding: DialogKeybinding): boolean;
  getKeys(keybinding: DialogKeybinding): readonly string[];
}

function displayKey(key: string): string {
  const known: Record<string, string> = {
    up: '↑',
    down: '↓',
    pageUp: 'PgUp',
    pageDown: 'PgDn',
    enter: 'Enter',
    escape: 'Esc',
  };
  if (known[key]) return known[key];
  return key
    .split('+')
    .map((part) =>
      part.length === 1
        ? part.toUpperCase()
        : `${part[0]?.toUpperCase()}${part.slice(1)}`,
    )
    .join('+');
}

function keyText(
  keybindings: DialogKeybindings,
  keybinding: DialogKeybinding,
): string {
  return keybindings.getKeys(keybinding).map(displayKey).join('/');
}

function actionItems<TAction extends string>(
  packet: HumanDecisionPacket<TAction>,
): SelectItem[] {
  return [
    {
      value: CANCEL_VALUE,
      label: '暂不决定（不写入任何状态）',
      description:
        'Close this read-only projection without recording authority.',
    },
    ...packet.actions
      .filter(({ enabled }) => enabled)
      .map((action) => ({
        value: action.id,
        label: action.label,
        description: `${action.description} Effect: ${action.effect}`,
      })),
  ];
}

/** Show a transient, read-only packet and return one existing action or null. */
export async function showDecisionPacket<TAction extends string>(
  ctx: ExtensionCommandContext,
  packet: HumanDecisionPacket<TAction>,
): Promise<TAction | null> {
  validateDecisionPacket(packet);
  if (ctx.mode !== 'tui') {
    throw new Error('Decision Packet custom UI requires TUI mode.');
  }

  const result = await ctx.ui.custom<TAction | null>(
    (tui, theme, injectedKeybindings, done) => {
      const keybindings = injectedKeybindings as DialogKeybindings;
      const items = actionItems(packet);
      const enabledActions = packet.actions.filter(({ enabled }) => enabled);
      let selectedIndex = 0;
      let reviewOffset = 0;
      let disposed = false;
      let settled = false;
      const selectList = new SelectList(
        items,
        Math.min(items.length, 9),
        {
          selectedPrefix: (text) => theme.fg('accent', text),
          selectedText: (text) => theme.fg('accent', text),
          description: (text) => theme.fg('muted', text),
          scrollInfo: (text) => theme.fg('dim', text),
          noMatch: (text) => theme.fg('warning', text),
        },
        { minPrimaryColumnWidth: 28, maxPrimaryColumnWidth: 42 },
      );
      selectList.setSelectedIndex(0);

      const finish = (value: TAction | null) => {
        if (settled || disposed) return;
        settled = true;
        done(value);
      };

      const tone = (lineTone: DecisionPacketLineTone, text: string) => {
        if (lineTone === 'title') return theme.fg('accent', theme.bold(text));
        if (lineTone === 'muted') return theme.fg('muted', text);
        if (lineTone === 'pass') return theme.fg('success', text);
        if (lineTone === 'warning') return theme.fg('warning', text);
        if (lineTone === 'blocked') return theme.fg('error', text);
        return theme.fg('text', text);
      };

      const component = {
        render(width: number): string[] {
          const safeWidth = Math.max(1, width);
          const contentWidth = Math.max(1, safeWidth - 2);
          const viewport = renderDecisionPacketViewport(packet, {
            width: contentWidth,
            height: REVIEW_HEIGHT,
            offset: reviewOffset,
          });
          reviewOffset = viewport.offset;
          const container = new Container();
          container.addChild(
            new DynamicBorder((text: string) => theme.fg('accent', text)),
          );
          container.addChild(
            new Text(
              theme.fg(
                'accent',
                theme.bold('Evidence Decision Packet · Human review'),
              ),
              1,
              0,
            ),
          );
          const blockedApproval = packet.actions.find(
            ({ tone: actionTone, enabled }) =>
              actionTone === 'approve' && !enabled,
          );
          if (blockedApproval) {
            container.addChild(
              new Text(
                theme.fg(
                  'error',
                  `Approval blocked: ${blockedApproval.disabled_reason ?? 'readiness check failed'}`,
                ),
                1,
                0,
              ),
            );
          }
          container.addChild(
            new Text(
              viewport.lines
                .map((line) => tone(line.tone, line.text))
                .join('\n'),
              1,
              0,
            ),
          );
          const firstVisible =
            viewport.total_lines === 0 ? 0 : viewport.offset + 1;
          const lastVisible = Math.min(
            viewport.total_lines,
            viewport.offset + viewport.lines.length,
          );
          container.addChild(
            new Text(
              theme.fg(
                'dim',
                `${keyText(keybindings, 'tui.select.pageUp')}/${keyText(keybindings, 'tui.select.pageDown')} review · lines ${firstVisible}-${lastVisible}/${viewport.total_lines}`,
              ),
              1,
              0,
            ),
          );
          container.addChild(
            new DynamicBorder((text: string) => theme.fg('muted', text)),
          );
          container.addChild(
            new Text(theme.fg('accent', theme.bold('Human action')), 1, 0),
          );
          container.addChild(selectList);
          container.addChild(
            new Text(
              theme.fg(
                'dim',
                `${keyText(keybindings, 'tui.select.up')}/${keyText(keybindings, 'tui.select.down')} action · ${keyText(keybindings, 'tui.select.confirm')} select · ${keyText(keybindings, 'tui.select.cancel')} cancel`,
              ),
              1,
              0,
            ),
          );
          container.addChild(
            new DynamicBorder((text: string) => theme.fg('accent', text)),
          );
          return container
            .render(safeWidth)
            .map((line) =>
              visibleWidth(line) > safeWidth
                ? truncateToWidth(line, safeWidth, '')
                : line,
            );
        },
        handleInput(data: string): void {
          if (disposed || settled) return;
          if (keybindings.matches(data, 'tui.select.pageUp')) {
            reviewOffset = Math.max(0, reviewOffset - REVIEW_HEIGHT);
          } else if (keybindings.matches(data, 'tui.select.pageDown')) {
            reviewOffset += REVIEW_HEIGHT;
          } else if (keybindings.matches(data, 'tui.select.up')) {
            selectedIndex =
              selectedIndex === 0 ? items.length - 1 : selectedIndex - 1;
            selectList.setSelectedIndex(selectedIndex);
          } else if (keybindings.matches(data, 'tui.select.down')) {
            selectedIndex =
              selectedIndex === items.length - 1 ? 0 : selectedIndex + 1;
            selectList.setSelectedIndex(selectedIndex);
          } else if (keybindings.matches(data, 'tui.select.confirm')) {
            finish(
              selectedIndex === 0
                ? null
                : (enabledActions[selectedIndex - 1]?.id ?? null),
            );
            return;
          } else if (keybindings.matches(data, 'tui.select.cancel')) {
            finish(null);
            return;
          } else {
            return;
          }
          tui.requestRender();
        },
        invalidate(): void {
          selectList.invalidate();
        },
        dispose(): void {
          disposed = true;
        },
      };
      return component;
    },
  );
  return result ?? null;
}
