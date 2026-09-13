import { OpenAPIHono } from '@hono/zod-openapi';
import { dictContract } from '@zenith/shared/platform';
import { authMiddleware } from '../../middleware/auth';
import { guard, setAuditBeforeData } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import {
  listDictItems,
  listDictItemsByCode,
  createDictItem,
  updateDictItem,
  deleteDictItem,
  getDictItemBeforeAudit,
  dictService,
  getDictItem,
} from '../../services/platform/dicts.service';
import { mountCrud } from '../_crud';

const dictsRouter = new OpenAPIHono({ defaultHook: validationHook });

const read = [authMiddleware, guard({ permission: 'system:dict:list' })] as const;
const listItemsRoute = defineContractRoute(dictContract.items, {
  middleware: read,
  handler: async (c) => {
    const { id } = c.req.valid('param');
    return c.json(okBody(await listDictItems(id)), 200);
  },
});

const getItemsByCodeRoute = defineContractRoute(dictContract.itemsByCode, {
  middleware: [authMiddleware],
  handler: async (c) => {
    const { code } = c.req.valid('param');
    return c.json(okBody(await listDictItemsByCode(code)), 200);
  },
});

const createItemRoute = defineContractRoute(dictContract.createItem, {
  middleware: [authMiddleware, guard({ permission: 'system:dict:item', audit: { description: '创建字典项', module: '字典管理' } })],
  handler: async (c) => {
    const { id } = c.req.valid('param');
    return c.json(okBody(await createDictItem(id, c.req.valid('json')), '创建成功'), 200);
  },
});

const getItemRoute = defineContractRoute(dictContract.itemDetail, {
  middleware: [authMiddleware, guard({ permission: 'system:dict:item' })],
  handler: async (c) => {
    const { id, itemId } = c.req.valid('param');
    return c.json(okBody(await getDictItem(id, itemId)), 200);
  },
});

const updateItemRoute = defineContractRoute(dictContract.updateItem, {
  middleware: [authMiddleware, guard({ permission: 'system:dict:item', audit: { description: '更新字典项', module: '字典管理' } })],
  handler: async (c) => {
    const { itemId } = c.req.valid('param');
    const before = await getDictItemBeforeAudit(itemId);
    if (before) setAuditBeforeData(c, before);
    return c.json(okBody(await updateDictItem(itemId, c.req.valid('json')), '更新成功'), 200);
  },
});

const deleteItemRoute = defineContractRoute(dictContract.removeItem, {
  middleware: [authMiddleware, guard({ permission: 'system:dict:item', audit: { description: '删除字典项', module: '字典管理' } })],
  handler: async (c) => {
    const { itemId } = c.req.valid('param');
    const before = await getDictItemBeforeAudit(itemId);
    if (before) setAuditBeforeData(c, before);
    await deleteDictItem(itemId);
    return c.json(okBody(null, '删除成功'), 200);
  },
});

mountCrud(dictsRouter, dictContract,
  dictService,
  { permission: 'system:dict', label: '字典' },
  [listItemsRoute, getItemsByCodeRoute, getItemRoute, createItemRoute, updateItemRoute, deleteItemRoute],
);

export default dictsRouter;
