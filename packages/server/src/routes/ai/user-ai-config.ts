import { OpenAPIHono, createRoute, defineOpenAPIRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth';
import {
  jsonContent,
  validationHook,
  commonErrorResponses,
  ok,
  okMsg,
  okBody,
  IdParam,
} from '../../lib/openapi-schemas';
import { UserAiConfigDTO } from '../../lib/openapi-dtos';
import {
  getUserAiConfigs,
  createUserAiConfig,
  updateUserAiConfig,
  deleteUserAiConfig,
} from '../../services/ai/user-ai-config.service';
import { saveUserAiConfigSchema } from '@zenith/shared';

const router = new OpenAPIHono({ defaultHook: validationHook });

const getConfigs = defineOpenAPIRoute({
  route: createRoute({
    method: 'get',
    path: '/',
    tags: ['AI'],
    summary: '获取我的 AI 配置列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware] as const,
    responses: { ...commonErrorResponses, ...ok(z.array(UserAiConfigDTO), '我的 AI 配置列表') },
  }),
  handler: async (c) => c.json(okBody(await getUserAiConfigs()), 200),
});

const createConfig = defineOpenAPIRoute({
  route: createRoute({
    method: 'post',
    path: '/',
    tags: ['AI'],
    summary: '新增我的 AI 配置',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware] as const,
    request: { body: { content: jsonContent(saveUserAiConfigSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(UserAiConfigDTO, '创建成功') },
  }),
  handler: async (c) => c.json(okBody(await createUserAiConfig(c.req.valid('json')), '创建成功'), 200),
});

const updateConfig = defineOpenAPIRoute({
  route: createRoute({
    method: 'put',
    path: '/:id',
    tags: ['AI'],
    summary: '更新指定 AI 配置',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware] as const,
    request: {
      params: IdParam,
      body: { content: jsonContent(saveUserAiConfigSchema), required: true },
    },
    responses: { ...commonErrorResponses, ...ok(UserAiConfigDTO, '更新成功') },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    return c.json(okBody(await updateUserAiConfig(id, c.req.valid('json')), '更新成功'), 200);
  },
});

const deleteConfig = defineOpenAPIRoute({
  route: createRoute({
    method: 'delete',
    path: '/:id',
    tags: ['AI'],
    summary: '删除指定 AI 配置',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...okMsg('删除成功') },
  }),
  handler: async (c) => {
    const { id } = c.req.valid('param');
    await deleteUserAiConfig(id);
    return c.json(okBody(null, '删除成功'), 200);
  },
});

router.openapiRoutes([getConfigs, createConfig, updateConfig, deleteConfig] as const);

export default router;
