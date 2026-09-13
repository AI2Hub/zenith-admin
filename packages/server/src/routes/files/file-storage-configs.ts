import { OpenAPIHono } from '@hono/zod-openapi';
import { fileStorageConfigContract } from '@zenith/shared/platform';
import { authMiddleware } from '../../middleware/auth';
import { guard, setAuditBeforeData } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { ErrorResponse, jsonContent, okBody, validationHook } from '../../lib/openapi-schemas';
import {
  listFileStorageConfigs,
  getDefaultFileStorageConfig,
  createFileStorageConfig,
  updateFileStorageConfig,
  setDefaultFileStorageConfig,
  deleteFileStorageConfig,
  getFileStorageConfigBeforeAudit,
  getFileStorageConfig,
  testFileStorageConfig,
  testExistingFileStorageConfig,
} from '../../services/files/file-storage-configs.service';
import { mountCrud } from '../_crud';

const fileStorageConfigsRouter = new OpenAPIHono({ defaultHook: validationHook });

const read = [authMiddleware, guard({ permission: 'system:file:config' })] as const;

const testFailedResponse = { 400: { content: jsonContent(ErrorResponse), description: '测试失败' } } as const;
const defaultRoute = defineContractRoute(fileStorageConfigContract.defaultConfig, {
  middleware: read,
  handler: async (c) => c.json(okBody(await getDefaultFileStorageConfig()), 200),
});
const testRoute = defineContractRoute(fileStorageConfigContract.test, {
  middleware: [authMiddleware, guard({ permission: 'system:file:config', audit: { description: '测试文件存储连接', module: '文件存储配置', recordBody: false } })],
  responses: testFailedResponse,
  handler: async (c) => {
    const result = await testFileStorageConfig(c.req.valid('json'));
    return c.json(okBody(null, result.message), 200);
  },
});

const testExistingRoute = defineContractRoute(fileStorageConfigContract.testExisting, {
  middleware: [authMiddleware, guard({ permission: 'system:file:config', audit: { description: '测试文件存储连接', module: '文件存储配置', recordBody: false } })],
  responses: testFailedResponse,
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const result = await testExistingFileStorageConfig(id, c.req.valid('json'));
    return c.json(okBody(null, result.message), 200);
  },
});
const setDefaultRoute = defineContractRoute(fileStorageConfigContract.setDefault, {
  middleware: [authMiddleware, guard({ permission: 'system:file:config:default', audit: { description: '设置默认文件存储', module: '文件存储配置', recordBody: false } })],
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const before = await getFileStorageConfigBeforeAudit(id);
    if (before) setAuditBeforeData(c, before);
    return c.json(okBody(await setDefaultFileStorageConfig(id), '默认文件服务已更新'), 200);
  },
});

mountCrud(fileStorageConfigsRouter, fileStorageConfigContract,
  {
    list: listFileStorageConfigs,
    get: getFileStorageConfig,
    create: createFileStorageConfig,
    update: updateFileStorageConfig,
    remove: deleteFileStorageConfig,
  },
  {
    permission: { read: 'system:file:config', create: 'system:file:config:create', update: 'system:file:config:update', remove: 'system:file:config:delete' },
    label: '文件存储配置',
    module: '文件存储配置',
  },
  [defaultRoute, testRoute, testExistingRoute, setDefaultRoute],
);

export default fileStorageConfigsRouter;
