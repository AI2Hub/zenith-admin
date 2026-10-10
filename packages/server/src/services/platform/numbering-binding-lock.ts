import { sql } from 'drizzle-orm';
import type { DbTransaction } from '../../db/types';

/** 所有绑定写入先锁稳定业务键，再读绑定并锁规则；不能先锁绑定行而反转规则锁顺序。 */
export async function lockNumberingBinding(tx: DbTransaction, input: { tenantId: number | null; scene: string; ownerKey: string }) {
  const key = JSON.stringify(['numbering-binding', input.tenantId, input.scene, input.ownerKey]);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
}
