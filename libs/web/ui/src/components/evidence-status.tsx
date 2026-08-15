import type { ComponentProps } from 'react';
import {
  CircleCheckIcon,
  CircleDotIcon,
  CircleXIcon,
  Clock3Icon,
  LockKeyholeIcon,
  SparklesIcon,
  type LucideIcon,
} from 'lucide-react';

import { Badge } from './ui/badge';

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

export { EvidenceStatusBadge };
export type { EvidenceStatus };
