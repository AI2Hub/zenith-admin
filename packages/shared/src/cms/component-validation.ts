import * as z from 'zod';
import { entityStatusSchema, partialForUpdate } from '../core';
import { cmsNestedFieldDefinitionSchema, validateCmsFieldDefinitions } from './model-design';
import { CMS_MODEL_MAX_FIELDS } from './constants';

export const cmsComponentFieldsSchema = z.array(cmsNestedFieldDefinitionSchema).max(CMS_MODEL_MAX_FIELDS).superRefine((fields, context) => {
  for (const issue of validateCmsFieldDefinitions(fields)) context.addIssue({ code: 'custom', message: `${issue.fieldPath}: ${issue.message}` });
});
export const createCmsComponentSchema = z.object({
  ownerSiteId: z.int().positive().nullable().optional(),
  code: z.string().regex(/^[a-z][a-z0-9-]*$/).max(50), name: z.string().min(1).max(100),
  description: z.string().max(1000).nullable().optional(),
  status: entityStatusSchema.default('enabled'), fields: cmsComponentFieldsSchema.default([]),
});
export const updateCmsComponentSchema = partialForUpdate(createCmsComponentSchema.omit({ ownerSiteId: true })).extend({ expectedVersion: z.int().positive() });
export const publishCmsComponentSchema = z.object({ expectedVersion: z.int().positive() });
