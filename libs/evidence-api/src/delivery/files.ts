import type { DeliveryBundle } from './delivery.js';
import { canonicalJson } from '../canonicalJson.js';
import { serviceContractsOf } from './modelDelivery.js';

/** One file a delivery hand-off writes, relative to the chosen directory. */
export interface DeliveryFile {
  path: string;
  content: string;
}

/**
 * The files a hand-off writes.
 *
 * The contract is machine-read, the topology is read by whoever deploys it, and
 * the limitations are prose because they are the part a reviewer has to act on.
 * Every file is a serialization of one projection, so the tree cannot drift from
 * the document it was built from.
 */
export const deliveryFilesOf = (bundle: DeliveryBundle): DeliveryFile[] => {
  const json = canonicalJson;
  const files: DeliveryFile[] = [
    { path: 'openapi.json', content: json(bundle.openapi) },
    {
      path: 'topology.json',
      content: json({
        schemaVersion: bundle.schemaVersion,
        modelId: bundle.modelId,
        modelName: bundle.modelName,
        modelVersion: bundle.modelVersion,
        services: bundle.services,
        links: bundle.links,
        limitations: bundle.limitations,
      }),
    },
    { path: 'routes.json', content: json(bundle.routes) },

    { path: 'projection.json', content: json(bundle) },
    {
      path: 'http-journeys.json',
      content: json({
        runtimeValidated: false,
        journeys: bundle.journeys,
        hypermedia: bundle.hypermedia,
      }),
    },
  ];

  for (const { serviceId, contract } of serviceContractsOf(bundle)) {
    const directory = `services/${serviceId}`;
    const service = bundle.services.find(({ id }) => id === serviceId);
    if (service === undefined) throw new Error(`Unknown service: ${serviceId}`);
    files.push({ path: `${directory}/openapi.json`, content: json(contract) });
    files.push({
      path: `${directory}/README.md`,
      content: [
        `# ${service.name.replace(/[\r\n]+/g, ' ')}`,
        '',
        `- 上下文：\`${service.contextRef}\``,
        `- 能力类型：\`${service.kind}\``,
        `- 操作数：${service.routes.length}`,
        '',
        service.notes,
        '',
        '此契约与聚合视图共享 URI，不指定部署方式。',
        '',
      ].join('\n'),
    });
  }

  if (bundle.limitations.length > 0) {
    files.push({
      path: 'limitations.md',
      content: [
        `# ${bundle.modelName} · 尚未闭环的能力`,
        '',
        '以下内容模型尚未给出答案，交付物按缺口保留，不做推测：',
        '',
        ...bundle.limitations.map((limitation) => `- ${limitation}`),
        '',
      ].join('\n'),
    });
  }

  return files;
};
