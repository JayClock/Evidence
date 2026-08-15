import { Badge } from '@evidence/ui';
import { Node as AiNode, NodeContent } from '@evidence/ui/ai-elements/node';
import {
  Handle,
  Position,
  type NodeProps,
  useEdges,
  useNodes,
} from '@xyflow/react';
import {
  BadgeCheckIcon,
  BoxIcon,
  BoxesIcon,
  FileInputIcon,
  FileTextIcon,
  MapPinIcon,
  MegaphoneIcon,
  MonitorCogIcon,
  ScrollTextIcon,
  SendIcon,
  SparklesIcon,
  UserRoundCogIcon,
  UsersRoundIcon,
  type LucideIcon,
} from 'lucide-react';
import { useMemo } from 'react';

import {
  EVIDENCE_SOURCE_HANDLE_RIGHT,
  EVIDENCE_TARGET_HANDLE_LEFT,
  FULFILLMENT_SOURCE_HANDLE_BOTTOM,
  FULFILLMENT_SOURCE_HANDLE_TOP,
  FULFILLMENT_TARGET_HANDLE_BOTTOM,
  FULFILLMENT_TARGET_HANDLE_TOP,
} from '../calculate-evidence-edge-handles';
import type { DiagramCanvasNode } from '../diagram-types';
import { resolveEvidencePartyRoleName } from '../resolve-evidence-party-role-names';

type FulfillmentNodeType = DiagramCanvasNode & { type: 'fulfillment-node' };

type NodePalette = {
  accentClassName: string;
  icon: LucideIcon;
};

function normalized(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/evidence:/g, '')
    .replace(/participant:/g, '')
    .replace(/role:/g, '')
    .replace(/[^a-z0-9]+/g, '-');
}

function fulfillmentSubtype(type: unknown, subType: unknown): string {
  const semanticType = normalized(type);
  const semanticSubType = normalized(subType);

  if (semanticType !== 'evidence') {
    return semanticType;
  }

  return semanticSubType;
}

function isEvidenceLikeData(data: DiagramCanvasNode['data']): boolean {
  const semanticType = normalized(data.type);
  const semanticSubType = normalized(data.subType);

  return (
    semanticType === 'evidence' ||
    semanticType === 'rfp' ||
    semanticType === 'proposal' ||
    semanticType === 'contract' ||
    semanticType === 'request' ||
    semanticType.includes('fulfillment-request') ||
    semanticType === 'confirmation' ||
    semanticType.includes('fulfillment-confirmation') ||
    semanticSubType.includes('evidence') ||
    semanticSubType.includes('rfp') ||
    semanticSubType.includes('proposal') ||
    semanticSubType.includes('contract') ||
    semanticSubType.includes('request') ||
    semanticSubType.includes('confirmation')
  );
}

function isPrimaryFulfillmentData(data: DiagramCanvasNode['data']): boolean {
  const semanticType = normalized(data.type);
  const semanticSubType = normalized(data.subType);

  return (
    semanticType === 'rfp' ||
    semanticType === 'proposal' ||
    semanticType === 'contract' ||
    semanticType === 'request' ||
    semanticType.includes('fulfillment-request') ||
    semanticType === 'confirmation' ||
    semanticType.includes('fulfillment-confirmation') ||
    semanticSubType.includes('rfp') ||
    semanticSubType.includes('proposal') ||
    semanticSubType.includes('contract') ||
    semanticSubType.includes('fulfillment-request') ||
    semanticSubType.includes('fulfillment-confirmation')
  );
}

function isGenericEvidenceData(data: DiagramCanvasNode['data']): boolean {
  return isEvidenceLikeData(data) && !isPrimaryFulfillmentData(data);
}

function isThingData(data: DiagramCanvasNode['data']): boolean {
  const semanticType = normalized(data.type);
  const semanticSubType = normalized(data.subType);

  return (
    (semanticType === 'participant' && semanticSubType.includes('thing')) ||
    semanticType === 'thing'
  );
}

function isDomainData(data: DiagramCanvasNode['data']): boolean {
  const semanticType = normalized(data.type);
  const semanticSubType = normalized(data.subType);

  return (
    semanticType === 'domain' ||
    (semanticType === 'role' && semanticSubType.includes('domain'))
  );
}

function getNodePalette(type: unknown, subType: unknown): NodePalette {
  const semanticType = normalized(type);
  const semanticSubType = normalized(subType);
  const fulfillmentType = fulfillmentSubtype(type, subType);

  if (
    semanticType === 'evidence' ||
    fulfillmentType === 'rfp' ||
    fulfillmentType === 'proposal' ||
    fulfillmentType === 'contract' ||
    fulfillmentType === 'request' ||
    fulfillmentType.includes('fulfillment-request') ||
    fulfillmentType === 'confirmation' ||
    fulfillmentType.includes('fulfillment-confirmation')
  ) {
    return {
      accentClassName: 'border-l-status-info',
      icon:
        fulfillmentType === 'rfp'
          ? MegaphoneIcon
          : fulfillmentType === 'proposal'
            ? SparklesIcon
            : fulfillmentType === 'contract'
              ? ScrollTextIcon
              : fulfillmentType.includes('request')
                ? SendIcon
                : fulfillmentType.includes('confirmation')
                  ? BadgeCheckIcon
                  : FileTextIcon,
    };
  }

  if (semanticType === 'role') {
    return {
      accentClassName: 'border-l-status-locked',
      icon: UserRoundCogIcon,
    };
  }

  if (
    semanticType === 'participant' ||
    semanticType === 'party' ||
    semanticType === 'thing' ||
    semanticType === 'place' ||
    semanticType === 'domain' ||
    semanticType === 'third-system' ||
    semanticType === 'thirdsystem' ||
    semanticType === '3rd-system'
  ) {
    return {
      accentClassName: 'border-l-ev-line-strong',
      icon: semanticSubType.includes('place')
        ? MapPinIcon
        : semanticSubType.includes('domain')
          ? BoxesIcon
          : semanticSubType.includes('thing')
            ? BoxIcon
            : semanticSubType.includes('third') ||
                semanticSubType.includes('3rd')
              ? MonitorCogIcon
              : UsersRoundIcon,
    };
  }

  if (semanticType === 'context') {
    return {
      accentClassName: 'border-l-status-info',
      icon: BoxesIcon,
    };
  }

  return {
    accentClassName: 'border-l-ev-line-strong',
    icon: FileInputIcon,
  };
}

function fieldNames(data: DiagramCanvasNode['data']): string[] {
  if (Array.isArray(data.fields)) {
    return data.fields.filter(
      (field): field is string =>
        typeof field === 'string' && field.trim().length > 0,
    );
  }

  const semanticType = normalized(data.type);
  const semanticSubType = normalized(data.subType);

  if (semanticType === 'rfp' || semanticSubType.includes('rfp')) {
    return ['started_at', 'expired_at'];
  }

  if (semanticType === 'proposal' || semanticSubType.includes('proposal')) {
    return ['started_at', 'expired_at'];
  }

  if (semanticType === 'contract' || semanticSubType.includes('contract')) {
    return ['signed_at'];
  }

  if (
    semanticType === 'request' ||
    semanticType.includes('fulfillment-request') ||
    semanticSubType.includes('fulfillment-request')
  ) {
    return ['started_at', 'expired_at'];
  }

  if (
    semanticType === 'confirmation' ||
    semanticType.includes('fulfillment-confirmation') ||
    semanticSubType.includes('fulfillment-confirmation')
  ) {
    return ['confirmed_at'];
  }

  if (semanticType === 'evidence') {
    return ['created_at'];
  }

  return [];
}

export function FulfillmentNode({
  data,
  id,
  selected,
}: NodeProps<FulfillmentNodeType>) {
  const entityType = data.type;
  const entityLabel = data.label;
  const entitySubType = data.subType;
  const palette = getNodePalette(entityType, entitySubType);
  const Icon = palette.icon;
  const fields = fieldNames(data);
  const nodes = useNodes<DiagramCanvasNode>();
  const edges = useEdges();
  const partyRoleName = useMemo(
    () =>
      resolveEvidencePartyRoleName({
        edges,
        evidenceNodeId: id,
        nodes,
      }),
    [edges, id, nodes],
  );
  const showPartyRoleName =
    normalized(entityType) === 'evidence' &&
    !normalized(entitySubType).includes('contract') &&
    (partyRoleName?.length ?? 0) > 0;
  const isReference = data.isReference === true;
  const isEvidenceLike = isEvidenceLikeData(data);
  const isPrimaryFulfillment = isPrimaryFulfillmentData(data);
  const showTopSourceHandle = isPrimaryFulfillment;
  const showBottomSourceHandle = isEvidenceLike;
  const showTopTargetHandle = isThingData(data) || isGenericEvidenceData(data);
  const showBottomTargetHandle = isDomainData(data);

  return (
    <AiNode
      handles={{ source: true, target: true }}
      className={`h-full w-full overflow-visible rounded-lg border border-l-4 bg-card ${palette.accentClassName} ${
        selected ? 'ring-2 ring-ring/40' : ''
      }`}
    >
      {isPrimaryFulfillment ? (
        <Handle
          id={EVIDENCE_TARGET_HANDLE_LEFT}
          position={Position.Left}
          type="target"
        />
      ) : null}
      {isPrimaryFulfillment ? (
        <Handle
          id={EVIDENCE_SOURCE_HANDLE_RIGHT}
          position={Position.Right}
          type="source"
        />
      ) : null}
      {showTopTargetHandle ? (
        <Handle
          id={FULFILLMENT_TARGET_HANDLE_TOP}
          position={Position.Top}
          style={{ left: '50%' }}
          type="target"
        />
      ) : null}
      {showTopSourceHandle ? (
        <Handle
          id={FULFILLMENT_SOURCE_HANDLE_TOP}
          position={Position.Top}
          style={{ left: '50%' }}
          type="source"
        />
      ) : null}
      {showBottomTargetHandle ? (
        <Handle
          id={FULFILLMENT_TARGET_HANDLE_BOTTOM}
          position={Position.Bottom}
          style={{ left: '50%' }}
          type="target"
        />
      ) : null}
      {showBottomSourceHandle ? (
        <Handle
          id={FULFILLMENT_SOURCE_HANDLE_BOTTOM}
          position={Position.Bottom}
          style={{ left: '50%' }}
          type="source"
        />
      ) : null}
      {showPartyRoleName ? (
        <Badge
          className="absolute top-0 right-0 z-10 max-w-[75%] translate-x-1/2 -translate-y-1/2"
          variant="locked"
        >
          {partyRoleName}
        </Badge>
      ) : null}
      <NodeContent className="flex h-full min-w-0 flex-col gap-1 overflow-hidden px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 truncate text-sm font-semibold">
            {entityLabel}
          </div>
          {isReference ? <Badge variant="locked">Ref</Badge> : null}
        </div>
        {entitySubType ? (
          <div className="truncate text-xs text-muted-foreground">
            {entitySubType}
          </div>
        ) : null}
        {fields.length > 0 ? (
          <div className="mt-auto flex flex-wrap gap-1 pt-1">
            {fields.map((field) => (
              <span
                className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground"
                key={field}
              >
                {field}
              </span>
            ))}
          </div>
        ) : null}
      </NodeContent>
    </AiNode>
  );
}
