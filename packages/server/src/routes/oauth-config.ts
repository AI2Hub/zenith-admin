import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { oauthConfigs } from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import { guard } from '../middleware/guard';
import type { JwtPayload } from '../middleware/auth';
import type { OAuthProviderType } from '@zenith/shared';
import { apiResponse, ErrorResponse, jsonContent } from '../lib/openapi-schemas';

// 本地 v4 schema（与 @zenith/shared 中的 v3 schema 等价；避免跨 zod v3/v4 类型冲突）
const updateOauthConfigSchema = z.object({
  clientId: z.string().max(256).default(''),
  clientSecret: z.string().max(512).default(''),
  agentId: z.string().max(128).nullable().optional(),
  corpId: z.string().max(128).nullable().optional(),
  enabled: z.boolean().default(false),
});

const VALID_PROVIDERS: OAuthProviderType[] = ['github', 'dingtalk', 'wechat_work'];

const oauthConfigRouter = new OpenAPIHono<{ Variables: { user: JwtPayload } }>();
oauthConfigRouter.use('*', authMiddleware);

// ─── Schemas ───────────────────────────────────────────────────────────────
const OAuthConfigItem = z
  .object({
    id: z.number(),
    provider: z.string(),
    clientId: z.string().nullable(),
    clientSecret: z.string(),
    enabled: z.boolean(),
    agentId: z.string().nullable().optional(),
    corpId: z.string().nullable().optional(),
    createdAt: z.union([z.string(), z.date()]).nullable().optional(),
    updatedAt: z.union([z.string(), z.date()]).nullable().optional(),
  })
  .openapi('OAuthConfigItem');

// ─── Routes ────────────────────────────────────────────────────────────────
const listRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['OAuthConfig'],
  summary: '获取所有 OAuth 配置',
  security: [{ BearerAuth: [] }],
  middleware: [guard({ permission: 'system:oauth-config:view' })] as const,
  responses: {
    200: {
      content: jsonContent(apiResponse(z.array(OAuthConfigItem))),
      description: 'OAuth 配置列表',
    },
  },
});

oauthConfigRouter.openapi(listRoute, async (c) => {
  // 确保三个 provider 都有记录
  for (const p of VALID_PROVIDERS) {
    const [existing] = await db.select().from(oauthConfigs).where(eq(oauthConfigs.provider, p)).limit(1);
    if (!existing) {
      await db.insert(oauthConfigs).values({ provider: p }).onConflictDoNothing();
    }
  }

  const configs = await db.select().from(oauthConfigs);
  const safeConfigs = configs.map(({ clientSecret, ...rest }) => ({
    ...rest,
    clientSecret: clientSecret ? '******' : '',
  }));
  return c.json({ code: 0 as const, message: 'success', data: safeConfigs }, 200);
});

const updateRoute = createRoute({
  method: 'put',
  path: '/{provider}',
  tags: ['OAuthConfig'],
  summary: '更新指定 provider 的 OAuth 配置',
  security: [{ BearerAuth: [] }],
  middleware: [
    guard({
      permission: 'system:oauth-config:update',
      audit: { description: '更新OAuth配置', module: 'OAuth配置' },
    }),
  ] as const,
  request: {
    params: z.object({ provider: z.string() }),
    body: {
      content: jsonContent(updateOauthConfigSchema),
      required: true,
    },
  },
  responses: {
    200: {
      content: jsonContent(apiResponse(OAuthConfigItem.nullable())),
      description: '保存成功',
    },
    400: { content: jsonContent(ErrorResponse), description: '不支持的 provider' },
  },
});

oauthConfigRouter.openapi(updateRoute, async (c) => {
  const provider = c.req.param('provider') as OAuthProviderType;
  if (!VALID_PROVIDERS.includes(provider)) {
    return c.json({ code: 400, message: '不支持的提供方', data: null }, 400);
  }

  const data = c.req.valid('json');

  const updateData: Record<string, unknown> = {
    clientId: data.clientId,
    enabled: data.enabled,
    agentId: data.agentId ?? null,
    corpId: data.corpId ?? null,
    updatedAt: new Date(),
  };
  if (data.clientSecret && data.clientSecret !== '******') {
    updateData.clientSecret = data.clientSecret;
  }

  const [existing] = await db.select().from(oauthConfigs).where(eq(oauthConfigs.provider, provider)).limit(1);
  if (!existing) {
    const [created] = await db
      .insert(oauthConfigs)
      .values({ provider, ...updateData } as typeof oauthConfigs.$inferInsert)
      .returning();
    return c.json({ code: 0 as const, message: '保存成功', data: created }, 200);
  }

  const [updated] = await db
    .update(oauthConfigs)
    .set(updateData)
    .where(eq(oauthConfigs.provider, provider))
    .returning();
  return c.json({ code: 0 as const, message: '保存成功', data: updated }, 200);
});

export default oauthConfigRouter;
