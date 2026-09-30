import { afterEach, describe, expect, it } from 'vitest';
import { cmsComponentContract, type CmsComponent, type CmsComponentImpact, type CmsComponentVersion, type CmsFieldDefinition, type CmsModelField } from '@zenith/shared/cms';
import { mockCmsModels } from './data/cms';
import { resetMockCmsComponents } from './data/cms-components';
import { cmsComponentHandlers } from './handlers/cms-components';
import { getMockCmsPublishedModelFields, publishMockCmsModelVersion, resetMockCmsModelVersions } from './handlers/cms-editorial';
import { compileMockCmsFields } from './utils/cms-model-compiler';

const initialModels = structuredClone(mockCmsModels);
afterEach(() => {
  resetMockCmsComponents(); resetMockCmsModelVersions();
  mockCmsModels.splice(0, mockCmsModels.length, ...structuredClone(initialModels));
});
async function call<T>(method: string, path: string, body?: unknown) {
  const request = new Request(`${window.location.origin}${cmsComponentContract.basePath}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  for (const handler of cmsComponentHandlers) {
    const result = await (handler as unknown as { run(args: unknown): Promise<{ response?: Response } | null> }).run({ request, requestId: `component-${crypto.randomUUID()}` });
    if (result?.response) return { status: result.response.status, data: (await result.response.json() as { data: T }).data };
  }
  throw new Error(`No component handler for ${path}`);
}
const sourceFields = [{ name: 'title', label: '标题', fieldType: 'text', defaultValue: '默认标题' }];
async function createPublishedComponent() {
  const created = await call<CmsComponent>('POST', '/', { code: 'qa-card', name: '卡片', fields: sourceFields });
  expect(created.status).toBe(200);
  const published = await call<CmsComponent>('POST', `/${created.data.id}/publish`, { expectedVersion: created.data.version });
  expect(published.status).toBe(200);
  return published.data;
}

describe('CMS component Demo lifecycle', () => {
  it('enforces optimistic concurrency, publishes once for equivalent input, and retains published versions', async () => {
    const component = await createPublishedComponent();
    expect((await call('PUT', `/${component.id}`, { expectedVersion: component.version - 1, name: '过期编辑' })).status).toBe(409);
    const again = await call<CmsComponent>('POST', `/${component.id}/publish`, { expectedVersion: component.version });
    expect(again.data.publishedVersionId).toBe(component.publishedVersionId);
    expect((await call<CmsComponentVersion[]>('GET', `/${component.id}/versions`)).data).toHaveLength(1);
    expect((await call('DELETE', `/${component.id}`)).status).toBe(409);
  });

  it('keeps lookup and old references frozen until a new component version is explicitly selected', async () => {
    const component = await createPublishedComponent(); const oldVersionId = component.publishedVersionId!;
    const changed = await call<CmsComponent>('PUT', `/${component.id}`, { expectedVersion: component.version, fields: [{ name: 'count', label: '数量', fieldType: 'number', defaultValue: 2 }] });
    expect((await call<CmsComponent[]>('GET', '/all')).data[0].fields[0].name).toBe('title');
    await call<CmsComponent>('POST', `/${component.id}/publish`, { expectedVersion: changed.data.version });
    expect((await call<CmsComponent[]>('GET', '/all')).data[0].fields[0].name).toBe('count');
    const resolved = await compileMockCmsFields<CmsFieldDefinition>([{ name: 'card', label: '卡片', fieldType: 'object', configuration: { componentVersionId: oldVersionId } }], null);
    expect(resolved.fields[0].configuration?.fields?.[0].name).toBe('title');
  });

  it('reports the referencing model without mutating its immutable published field schema', async () => {
    const component = await createPublishedComponent();
    const modelId = Math.max(...mockCmsModels.map(row => row.id)) + 1;
    const field: CmsModelField = { id: 123456, modelId, name: 'card', label: '卡片', fieldType: 'object', configuration: { componentVersionId: component.publishedVersionId! },
      required: false, searchable: false, showInList: false, showInDetail: false, detailGroup: null, detailSort: 0, placeholder: null, defaultValue: null,
      optionSource: 'manual', dictCode: null, options: null, sort: 0, createdAt: '2026-09-30 10:00:00', updatedAt: '2026-09-30 10:00:00' };
    mockCmsModels.push({ ...initialModels[0], id: modelId, name: '引用模型', ownerSiteId: null, fields: [field], publishedVersionId: null });
    await publishMockCmsModelVersion(modelId);
    const frozenBefore = getMockCmsPublishedModelFields(modelId);
    await call('PUT', `/${component.id}`, { expectedVersion: component.version, fields: [{ name: 'count', label: '数量', fieldType: 'number' }] });
    const impact = await call<CmsComponentImpact>('GET', `/${component.id}/impact`);
    expect(impact.data.breaking).toBe(true);
    expect(impact.data.models).toContainEqual({ id: modelId, name: '引用模型', ownerSiteId: null, workingCopy: true, publishedVersion: true });
    expect(getMockCmsPublishedModelFields(modelId)).toEqual(frozenBefore);
  });
});
