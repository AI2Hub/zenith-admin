import { eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { oauthConfigs } from '../db/schema';
import type { OAuthProviderType } from '@zenith/shared';
import { AppError } from '../lib/errors';

export const VALID_OAUTH_PROVIDERS: OAuthProviderType[] = ['github', 'dingtalk', 'wechat_work'];

export async function listOauthConfigs() {
  const existing = await db.select({ provider: oauthConfigs.provider }).from(oauthConfigs).where(inArray(oauthConfigs.provider, VALID_OAUTH_PROVIDERS));
  const existingSet = new Set(existing.map((e) => e.provider));
  const missing = VALID_OAUTH_PROVIDERS.filter((p) => !existingSet.has(p));
  if (missing.length > 0) {
    await db.insert(oauthConfigs).values(missing.map((p) => ({ provider: p }))).onConflictDoNothing();
  }
  const configs = await db.select().from(oauthConfigs).where(inArray(oauthConfigs.provider, VALID_OAUTH_PROVIDERS));
  return configs.map(({ clientSecret, ...rest }) => ({ ...rest, clientSecret: clientSecret ? '******' : '' }));
}

export interface UpdateOauthConfigData {
  clientId: string;
  clientSecret?: string;
  enabled: boolean;
  agentId?: string | null;
  corpId?: string | null;
}

export async function updateOauthConfig(provider: OAuthProviderType, data: UpdateOauthConfigData) {
  if (!VALID_OAUTH_PROVIDERS.includes(provider)) throw new AppError('不支持的提供方', 400);

  const updateData: Record<string, unknown> = {
    clientId: data.clientId,
    enabled: data.enabled,
    agentId: data.agentId ?? null,
    corpId: data.corpId ?? null,
  };
  if (data.clientSecret && data.clientSecret !== '******') {
    updateData.clientSecret = data.clientSecret;
  }

  const [existing] = await db.select().from(oauthConfigs).where(eq(oauthConfigs.provider, provider)).limit(1);
  if (!existing) {
    const [created] = await db.insert(oauthConfigs).values({ provider, ...updateData } as typeof oauthConfigs.$inferInsert).returning();
    return created;
  }
  const [updated] = await db.update(oauthConfigs).set(updateData).where(eq(oauthConfigs.provider, provider)).returning();
  return updated;
}
