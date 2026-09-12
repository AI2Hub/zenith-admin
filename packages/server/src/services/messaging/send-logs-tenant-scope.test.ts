/**
 * 发送日志单条读取 / 删除的租户隔离：列表已带 tenantScope，按 ID 读取（删除复用它）同样必须带，
 * 否则租户管理员能按 ID 读到并删除其他租户的记录。短信与邮件两条链路同口径。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HTTPException } from 'hono/http-exception';

const { select, del, tenantScope } = vi.hoisted(() => ({
  select: vi.fn(),
  del: vi.fn(),
  tenantScope: vi.fn(() => 'TENANT_SCOPE_MARKER' as unknown),
}));

vi.mock('../../db', () => ({ db: { select, delete: del } }));
vi.mock('../../lib/tenant', () => ({ tenantScope, currentCreateTenantId: vi.fn(() => null) }));
vi.mock('../../lib/context', () => ({ currentUser: vi.fn(() => ({ id: 1 })) }));
vi.mock('../../lib/sms-sender', () => ({ sendSmsByProvider: vi.fn(), renderTemplate: vi.fn() }));
vi.mock('../../lib/email', () => ({ sendMail: vi.fn() }));
vi.mock('./sms-templates.service', () => ({ ensureSmsTemplateExists: vi.fn() }));
vi.mock('./sms-configs.service', () => ({ findDefaultSmsConfig: vi.fn() }));
vi.mock('./email-templates.service', () => ({ ensureEmailTemplateExists: vi.fn() }));

import { smsSendLogs, emailSendLogs } from '../../db/schema';
import { deleteSmsSendLog, getSmsSendLog } from './sms-send-logs.service';
import { deleteEmailSendLog, getEmailSendLog } from './email-send-logs.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeSelectChain(rows: unknown[]): any {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.limit = vi.fn(async () => rows);
  return chain;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeDeleteChain(): any {
  const chain: Record<string, unknown> = {};
  chain.where = vi.fn(async () => undefined);
  return chain;
}

describe('发送日志按 ID 读取 / 删除的租户隔离', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['短信', smsSendLogs, getSmsSendLog],
    ['邮件', emailSendLogs, getEmailSendLog],
  ] as const)('%s：getXxxSendLog 对该表应用 tenantScope', async (_label, table, getOne) => {
    select.mockReturnValue(makeSelectChain([{ id: 7 }]));
    await expect(getOne(7)).resolves.toEqual({ id: 7 });
    expect(tenantScope).toHaveBeenCalledTimes(1);
    expect(tenantScope).toHaveBeenCalledWith(table);
  });

  it.each([
    ['短信', getSmsSendLog],
    ['邮件', getEmailSendLog],
  ] as const)('%s：越过租户范围的 ID 读不到即 404，不泄露存在性', async (_label, getOne) => {
    select.mockReturnValue(makeSelectChain([]));
    await expect(getOne(7)).rejects.toBeInstanceOf(HTTPException);
  });

  it.each([
    ['短信', deleteSmsSendLog],
    ['邮件', deleteEmailSendLog],
  ] as const)('%s：deleteXxxSendLog 先经带 tenantScope 的读取，读不到就不执行删除', async (_label, deleteOne) => {
    select.mockReturnValue(makeSelectChain([]));
    del.mockReturnValue(makeDeleteChain());
    await expect(deleteOne(7)).rejects.toBeInstanceOf(HTTPException);
    expect(tenantScope).toHaveBeenCalledTimes(1);
    expect(del).not.toHaveBeenCalled();
  });
});
