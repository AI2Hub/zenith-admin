import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import { commonErrorResponses, jsonContent, ok, okBody, okPaginated, PaginationQuery, validationHook } from '../../lib/openapi-schemas';
import { getIdentitySecurityPolicy, listLoginRiskEvents, saveIdentitySecurityPolicy } from '../../services/identity/identity-security.service';

const identitySecurity = new OpenAPIHono({ defaultHook: validationHook });

const policySchema = z.object({
  password: z.object({
    minLength: z.number().int().min(6).max(64),
    requireUppercase: z.boolean(),
    requireSpecialChar: z.boolean(),
    expiryEnabled: z.boolean(),
    expiryDays: z.number().int().min(1).max(3650),
  }),
  lockout: z.object({
    maxAttempts: z.number().int().min(1).max(100),
    durationMinutes: z.number().int().min(1).max(1440),
  }),
  mfa: z.object({
    enabled: z.boolean(),
    mode: z.enum(['off', 'optional', 'required']),
    rememberDeviceDays: z.number().int().min(1).max(365),
  }),
  risk: z.object({
    enabled: z.boolean(),
    newDeviceAction: z.enum(['allow', 'challenge']),
  }),
});

const riskEventDTO = z.object({
  id: z.number().int(),
  userId: z.number().int().nullable(),
  username: z.string(),
  tenantId: z.number().int().nullable(),
  riskLevel: z.enum(['low', 'medium', 'high']),
  reason: z.string(),
  action: z.enum(['allow', 'challenge', 'block']),
  ip: z.string().nullable(),
  location: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: z.string(),
});

const getPolicyRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/policy', tags: ['IdentitySecurity'], summary: '获取身份安全策略',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'system:identity-security:manage' })] as const,
    responses: { ...commonErrorResponses, ...ok(policySchema, '身份安全策略') },
  }),
  handler: async (c) => c.json(okBody(await getIdentitySecurityPolicy()), 200),
});

const updatePolicyRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'put', path: '/policy', tags: ['IdentitySecurity'], summary: '更新身份安全策略',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'system:identity-security:manage', audit: { module: '身份安全', description: '更新身份安全策略' } })] as const,
    request: { body: { content: jsonContent(policySchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(policySchema, '更新成功') },
  }),
  handler: async (c) => c.json(okBody(await saveIdentitySecurityPolicy(c.req.valid('json')), '更新成功'), 200),
});

const riskEventsRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/risk-events', tags: ['IdentitySecurity'], summary: '登录风险事件',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'system:identity-security:manage' })] as const,
    request: { query: PaginationQuery.extend({ keyword: z.string().optional() }) },
    responses: { ...commonErrorResponses, ...okPaginated(riskEventDTO, '登录风险事件') },
  }),
  handler: async (c) => c.json(okBody(await listLoginRiskEvents(c.req.valid('query'))), 200),
});

identitySecurity.openapiRoutes([getPolicyRoute, updatePolicyRoute, riskEventsRoute] as const);

export default identitySecurity;
