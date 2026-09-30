import { and, asc, eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { CmsModelDefinitionError, resolveCmsFieldDefinitions, type CmsFieldDefinition } from '@zenith/shared/cms';
import type { DbExecutor } from '../../db/types';
import { cmsComponents, cmsComponentVersions } from '../../db/schema/cms-components';
import { dicts, dictItems } from '../../db/schema/dicts';

/** Resolve component/dictionary I/O inside the owner's transaction; expansion remains shared. */
export async function compileCmsFieldDefinitions<T extends CmsFieldDefinition>(executor: DbExecutor, input: readonly T[], options: { ownerSiteId: number | null; componentId?: number }) {
  try {
    return await resolveCmsFieldDefinitions(input, options, {
      dictionary: code => executor.select({ label: dictItems.label, value: dictItems.value }).from(dictItems)
        .innerJoin(dicts, eq(dicts.id, dictItems.dictId)).where(and(eq(dicts.code, code), eq(dicts.status, 'enabled'), eq(dictItems.status, 'enabled'))).orderBy(asc(dictItems.sort), asc(dictItems.id)),
      componentVersion: async versionId => {
        const [entry] = await executor.select({ version: cmsComponentVersions, component: cmsComponents }).from(cmsComponentVersions)
          .innerJoin(cmsComponents, eq(cmsComponents.id, cmsComponentVersions.componentId)).where(eq(cmsComponentVersions.id, versionId)).limit(1);
        return entry ?? null;
      },
    });
  } catch (error) {
    if (error instanceof CmsModelDefinitionError) throw new HTTPException(400, { message: error.message });
    throw error;
  }
}
