import {
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from '@earendil-works/pi-tui';
import {
  DECISION_PACKET_LIMITS,
  validateDecisionPacket,
  type DecisionCheckStatus,
  type HumanDecisionPacket,
} from './contract';

export type DecisionPacketLineTone =
  | 'plain'
  | 'title'
  | 'muted'
  | DecisionCheckStatus;

export interface DecisionPacketRenderLine {
  text: string;
  tone: DecisionPacketLineTone;
}

export interface DecisionPacketViewport {
  lines: DecisionPacketRenderLine[];
  offset: number;
  total_lines: number;
  visible_lines: number;
  has_above: boolean;
  has_below: boolean;
}

export interface BoundedDecisionList {
  shown: string[];
  omitted_count: number;
  omission_notice?: string;
}

export function boundDecisionList(
  values: readonly string[],
  limit: number,
  completePath: string,
): BoundedDecisionList {
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw new Error(
      'Decision list display limit must be a non-negative integer.',
    );
  }
  const shown = values.slice(0, limit);
  const omittedCount = Math.max(0, values.length - shown.length);
  return {
    shown,
    omitted_count: omittedCount,
    ...(omittedCount > 0
      ? {
          omission_notice: `${omittedCount} item(s) omitted; review the complete artifact: ${completePath}`,
        }
      : {}),
  };
}

function references(labels: string[] | undefined): string {
  return labels?.length ? ` [evidence: ${labels.join(', ')}]` : '';
}

function statusLabel(status: DecisionCheckStatus): string {
  if (status === 'pass') return 'PASS';
  if (status === 'warning') return 'WARNING';
  return 'BLOCKED';
}

function reviewLines(packet: HumanDecisionPacket): DecisionPacketRenderLine[] {
  const lines: DecisionPacketRenderLine[] = [
    {
      text: `Evidence Decision Packet · ${packet.loop} / ${packet.stage}`,
      tone: 'title',
    },
    { text: packet.title, tone: 'title' },
    {
      text: `${packet.iteration_id} · ${packet.subject_label} · sha256:${packet.subject_sha256.slice(0, 12)}`,
      tone: 'muted',
    },
    {
      text: 'READ-ONLY PROJECTION · NOT AN AUTHORITY ARTIFACT',
      tone: 'warning',
    },
    { text: '', tone: 'plain' },
    { text: `Authority requested: ${packet.authority_request}`, tone: 'plain' },
    { text: 'Approval includes:', tone: 'title' },
    ...packet.authority_scope.map((scope) => ({
      text: `  INCLUDE · ${scope}`,
      tone: 'plain' as const,
    })),
    { text: 'Approval excludes:', tone: 'title' },
    ...packet.authority_exclusions.map((exclusion) => ({
      text: `  EXCLUDE · ${exclusion}`,
      tone: 'plain' as const,
    })),
  ];

  for (const section of packet.sections) {
    lines.push({ text: '', tone: 'plain' });
    lines.push({ text: section.title, tone: 'title' });
    for (const item of section.items) {
      lines.push({
        text: `${item.label}: ${item.value}${references(item.evidence_ref_labels)}`,
        tone: 'plain',
      });
      if (item.detail) {
        lines.push({ text: `  ${item.detail}`, tone: 'muted' });
      }
    }
  }

  lines.push({ text: '', tone: 'plain' });
  lines.push({ text: 'Readiness checks', tone: 'title' });
  for (const check of packet.checks) {
    lines.push({
      text: `${statusLabel(check.status)} · ${check.label} — ${check.detail}${references(check.evidence_ref_labels)}`,
      tone: check.status,
    });
  }

  lines.push({ text: '', tone: 'plain' });
  lines.push({ text: 'Evidence references', tone: 'title' });
  for (const reference of packet.evidence_refs) {
    lines.push({
      text: `${reference.label}: ${reference.path}${reference.sha256 ? ` · sha256:${reference.sha256.slice(0, 12)}` : ''}`,
      tone: 'muted',
    });
  }
  return lines;
}

/** Produce bounded logical lines without applying terminal colors or Markdown. */
export function renderDecisionPacketReview(
  packet: HumanDecisionPacket,
): DecisionPacketRenderLine[] {
  validateDecisionPacket(packet);
  const lines = reviewLines(packet);
  const bytes = Buffer.byteLength(lines.map(({ text }) => text).join('\n'));
  if (bytes > DECISION_PACKET_LIMITS.renderedBytes) {
    throw new Error(
      `Decision Packet review exceeds ${DECISION_PACKET_LIMITS.renderedBytes} rendered bytes.`,
    );
  }
  return lines;
}

function physicalLines(
  packet: HumanDecisionPacket,
  width: number,
): DecisionPacketRenderLine[] {
  if (!Number.isSafeInteger(width) || width < 1) {
    throw new Error('Decision Packet width must be a positive integer.');
  }
  return renderDecisionPacketReview(packet).flatMap((line) => {
    const wrapped = line.text.length
      ? wrapTextWithAnsi(line.text, width)
      : [''];
    return wrapped.map((text) => ({
      text:
        visibleWidth(text) > width ? truncateToWidth(text, width, '') : text,
      tone: line.tone,
    }));
  });
}

/** Wrap and page review lines while guaranteeing every line fits the terminal. */
export function renderDecisionPacketViewport(
  packet: HumanDecisionPacket,
  options: { width: number; height: number; offset?: number },
): DecisionPacketViewport {
  if (!Number.isSafeInteger(options.height) || options.height < 1) {
    throw new Error(
      'Decision Packet viewport height must be a positive integer.',
    );
  }
  const lines = physicalLines(packet, options.width);
  const maxOffset = Math.max(0, lines.length - options.height);
  const requestedOffset = Number.isSafeInteger(options.offset)
    ? (options.offset ?? 0)
    : 0;
  const offset = Math.max(0, Math.min(requestedOffset, maxOffset));
  return {
    lines: lines.slice(offset, offset + options.height),
    offset,
    total_lines: lines.length,
    visible_lines: options.height,
    has_above: offset > 0,
    has_below: offset < maxOffset,
  };
}
