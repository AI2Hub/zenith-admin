import * as z from 'zod';
import { auditFieldsSchema, idParam, keywordQuery, paginated, paginationQuery } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { createIotDeviceGroupSchema, updateIotDeviceGroupSchema } from '../validation';

// ─── 实体 ────────────────────────────────────────────────────────────────────

export const iotDeviceGroupSchema = z.object({
  id: z.int(),
  name: z.string(),
  description: z.string().nullable(),
  deviceCount: z.int(),
  deviceIds: z.array(z.int()).meta({ description: '组内设备 id（详情返回；列表与下拉源为空数组）' }),
  ...auditFieldsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'IotDeviceGroup' });

export type IotDeviceGroup = z.infer<typeof iotDeviceGroupSchema>;

// ─── 入参 ────────────────────────────────────────────────────────────────────

export const iotDeviceGroupListQuery = paginationQuery.extend({
  keyword: keywordQuery('按名称 / 描述模糊匹配'),
});

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const iotDeviceGroupContract = defineContract('/api/iot/groups', {
  list: op.get('/', { query: iotDeviceGroupListQuery, response: paginated(iotDeviceGroupSchema), summary: '设备分组列表（含设备数）' }),
  all: op.get('/all', { response: z.array(iotDeviceGroupSchema), summary: '全部分组（供筛选与批量操作圈选）' }),
  detail: op.get('/{id}', { params: idParam, response: iotDeviceGroupSchema, summary: '分组详情（含成员设备 id）' }),
  create: op.post('/', { body: createIotDeviceGroupSchema, response: iotDeviceGroupSchema, summary: '创建分组' }),
  update: op.put('/{id}', { params: idParam, body: updateIotDeviceGroupSchema, response: iotDeviceGroupSchema, summary: '更新分组（含成员全量替换）' }),
  remove: op.delete('/{id}', { params: idParam, summary: '删除分组（设备本身不受影响）' }),
}, { tags: ['IoT 分组'] });
