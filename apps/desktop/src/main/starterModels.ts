import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DomainModelDocumentSyntaxSchema,
  type DomainModelDocument,
} from '@evidence-poc/evidence-schema';
import type {
  ProjectTemplateId,
  ProjectTemplateMeta,
} from '@evidence-poc/desktop-contracts/projects';

/** Manifest fields a caller supplies when a project is created. */
export interface StarterContext {
  /** Business name the manifest carries and the dashboard shows. */
  name: string;
  /** Manifest id, unique inside one workspace. */
  modelId: string;
}

/** Manifest version every starter is written with. */
export const STARTER_MODEL_VERSION = '0.1.0';

const TEMPLATES: readonly Pick<
  ProjectTemplateMeta,
  'id' | 'name' | 'description' | 'source'
>[] = [
  {
    id: 'blank',
    name: '空白模型',
    description:
      '只有 model.json 的空源树，适合已经想清楚业务边界的建模者从零开始。',
    source: '履约建模法元模型',
  },
  {
    id: 'procurement',
    name: '公对公商品采购履约',
    description:
      '询价与报价、采购协议，加上发货、支付、开票三组履约项与对应凭证。',
    source: '直播案例：商品采购协议履约',
  },
  {
    id: 'subscription',
    name: '专栏订阅与断更补偿',
    description:
      '订阅付款与内容访问两组履约项，断更退款作为违约触发项，付款由支付协议上下文支撑。',
    source: '直播案例：极客时间专栏订阅',
  },
  {
    id: 'service_blueprint',
    name: '服务蓝图起点',
    description:
      '把服务蓝图的阶段与活动落成一条最小链路：方案征询、服务合同、交付验收。',
    source: '直播讲义：服务蓝图变种作为建模输入',
  },
];

// Source (src/main) and the Forge main bundle (.vite/build) are both two levels below the app root.
const templateDirectory = resolve(import.meta.dirname, '../../starter-models');
const documents = new Map<ProjectTemplateId, DomainModelDocument>();

const templateDocument = (id: ProjectTemplateId): DomainModelDocument => {
  const cached = documents.get(id);
  if (cached) return cached;
  const source = readFileSync(resolve(templateDirectory, id + '.json'), 'utf8');
  const document = DomainModelDocumentSyntaxSchema.parse(JSON.parse(source));
  documents.set(id, document);
  return document;
};

/** Manifest id a caller gets when it does not name one. */
export const deriveModelId = (fallback: string, now = Date.now()): string => {
  const slug = fallback
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');

  const candidate = slug.length > 0 ? slug : `model-${now.toString(36)}`;

  return /^[a-z]/.test(candidate) ? candidate : `model-${candidate}`;
};

export const createStarterDocument = (
  templateId: ProjectTemplateId,
  context: StarterContext,
): DomainModelDocument => {
  const id =
    TEMPLATES.find((template) => template.id === templateId)?.id ?? 'blank';
  const document = structuredClone(templateDocument(id));
  document.manifest.id = context.modelId;
  document.manifest.name = context.name;
  document.manifest.version = STARTER_MODEL_VERSION;
  return document;
};

export const listProjectTemplates = (): readonly ProjectTemplateMeta[] =>
  TEMPLATES.map((template) => {
    const document = templateDocument(template.id);
    return {
      ...template,
      entityCount: document.entities.length,
      relationshipCount: document.relationships.length,
      ruleCount: document.rules.length,
    };
  });
