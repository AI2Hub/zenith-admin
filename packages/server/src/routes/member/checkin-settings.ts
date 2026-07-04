import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../../middleware/auth';
import { guard, setAuditBeforeData } from '../../middleware/guard';
import {
  ok,
  okBody,
  jsonContent,
  validationHook,
  commonErrorResponses,
} from '../../lib/openapi-schemas';
import { CheckinSettingsDTO } from '../../lib/openapi-dtos';
import { getCheckinSettings, updateCheckinSettings, getCheckinSettingsBeforeAudit } from '../../services/member/checkin-settings.service';

const checkinSettingsRouter = new OpenAPIHono({ defaultHook: validationHook });

const settingsBody = z.object({
  makeupEnabled: z.boolean().optional(),
  makeupCostPoints: z.number().int().min(0).optional(),
  makeupMaxDays: z.number().int().min(1).max(366).optional(),
});

const getRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get',
    path: '/',
    tags: ['会员签到'],
    summary: '获取签到设置',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'member:checkin:rule:list' })] as const,
    responses: { ...commonErrorResponses, ...ok(CheckinSettingsDTO, '签到设置') },
  }),
  handler: async (c) => c.json(okBody(await getCheckinSettings()), 200),
});

const updateRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'put',
    path: '/',
    tags: ['会员签到'],
    summary: '更新签到设置',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'member:checkin:setting:update', audit: { module: '会员签到', description: '更新签到设置' } })] as const,
    request: { body: { content: jsonContent(settingsBody), required: true } },
    responses: { ...commonErrorResponses, ...ok(CheckinSettingsDTO, '更新成功') },
  }),
  handler: async (c) => {
    setAuditBeforeData(c, await getCheckinSettingsBeforeAudit());
    return c.json(okBody(await updateCheckinSettings(c.req.valid('json')), '更新成功'), 200);
  },
});

checkinSettingsRouter.openapiRoutes([getRoute, updateRoute] as const);

export default checkinSettingsRouter;
