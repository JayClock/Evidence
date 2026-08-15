import type { ComponentProps } from 'react';
import {
  CircleCheckIcon,
  CircleDotIcon,
  CircleXIcon,
  Clock3Icon,
  FileInputIcon,
  ListChecksIcon,
  LockKeyholeIcon,
  NetworkIcon,
  PresentationIcon,
  RefreshCwIcon,
  SparklesIcon,
  TerminalIcon,
  type LucideIcon,
} from 'lucide-react';

import { Badge } from './ui/badge';

type EvidenceKnowledgePosition =
  | 'pair'
  | 'problem-intake'
  | 'run-respond'
  | 'scenario-model'
  | 'showcase'
  | 'tasking';

type EvidenceStatus =
  | 'decision'
  | 'invalidated'
  | 'locked'
  | 'proposed'
  | 'running'
  | 'verified';

type StatusDefinition = {
  icon: LucideIcon;
  label: string;
  variant:
    | 'decision'
    | 'info'
    | 'invalidated'
    | 'locked'
    | 'proposal'
    | 'verified';
};

const positionIcons: Record<EvidenceKnowledgePosition, LucideIcon> = {
  'problem-intake': FileInputIcon,
  'scenario-model': NetworkIcon,
  tasking: ListChecksIcon,
  pair: TerminalIcon,
  showcase: PresentationIcon,
  'run-respond': RefreshCwIcon,
};

const statusDefinitions: Record<EvidenceStatus, StatusDefinition> = {
  proposed: {
    icon: SparklesIcon,
    label: '提案',
    variant: 'proposal',
  },
  locked: {
    icon: LockKeyholeIcon,
    label: '已锁定',
    variant: 'locked',
  },
  verified: {
    icon: CircleCheckIcon,
    label: '已验证',
    variant: 'verified',
  },
  decision: {
    icon: Clock3Icon,
    label: '需要人工决策',
    variant: 'decision',
  },
  invalidated: {
    icon: CircleXIcon,
    label: '已失效',
    variant: 'invalidated',
  },
  running: {
    icon: CircleDotIcon,
    label: '执行中',
    variant: 'info',
  },
};

function EvidencePositionIcon({
  position,
  ...props
}: Omit<ComponentProps<typeof FileInputIcon>, 'children'> & {
  position: EvidenceKnowledgePosition;
}) {
  const Icon = positionIcons[position];
  return <Icon aria-hidden {...props} />;
}

function EvidenceStatusBadge({
  label,
  status,
  ...props
}: Omit<ComponentProps<typeof Badge>, 'children' | 'variant'> & {
  label?: string;
  status: EvidenceStatus;
}) {
  const definition = statusDefinitions[status];
  const Icon = definition.icon;

  return (
    <Badge variant={definition.variant} {...props}>
      <Icon aria-hidden data-icon="inline-start" />
      {label ?? definition.label}
    </Badge>
  );
}

export { EvidencePositionIcon, EvidenceStatusBadge };
export type { EvidenceKnowledgePosition, EvidenceStatus };
