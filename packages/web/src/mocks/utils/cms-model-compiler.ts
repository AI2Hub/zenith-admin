import { stableStringify } from '@zenith/shared/core';
import { CmsModelDefinitionError, resolveCmsFieldDefinitions, type CmsFieldDefinition, type CmsModelField } from '@zenith/shared/cms';
import { mockCmsComponents, mockCmsComponentVersions } from '../data/cms-components';
import { mockDictItems, mockDicts } from '../data/dicts';
import { MockHttpError } from './contract';
import { badRequest } from './handlers';

export const mockCmsDefinitionHash = (value: unknown) => stableStringify(JSON.parse(JSON.stringify(value)));
export const mockCmsModelHash = (fields: readonly CmsModelField[]) => mockCmsDefinitionHash(fields.map(({ id: _id, modelId: _modelId, createdAt: _createdAt, updatedAt: _updatedAt, ...field }) => field));
export async function compileMockCmsFields<T extends CmsFieldDefinition>(input: readonly T[], ownerSiteId: number | null, componentId?: number) {
  try {
    return await resolveCmsFieldDefinitions(input, { ownerSiteId, componentId }, {
      dictionary: async code => {
        const dict = mockDicts.find(item => item.code === code && item.status === 'enabled');
        return dict ? mockDictItems.filter(item => item.dictId === dict.id && item.status === 'enabled').sort((a, b) => a.sort - b.sort || a.id - b.id).map(({ label, value }) => ({ label, value })) : [];
      },
      componentVersion: async id => {
        const version = mockCmsComponentVersions.find(item => item.id === id);
        const component = version ? mockCmsComponents.find(item => item.id === version.componentId) : null;
        return version && component ? { version, component } : null;
      },
    });
  } catch (error) {
    if (error instanceof CmsModelDefinitionError) throw new MockHttpError(badRequest(error.message, { status: 400 }));
    throw error;
  }
}
