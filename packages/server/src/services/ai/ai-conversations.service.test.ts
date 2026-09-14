import { describe, expect, it } from 'vitest';
import { db } from '../../db';
import { aiConversations } from '../../db/schema';
import { conversationListWhere } from './ai-conversations.service';

/**
 * 会话列表关键词搜索的 SQL 形状：消息侧必须是关联到当前会话的 EXISTS。
 * 非关联的 `id IN (SELECT conversation_id FROM ai_messages WHERE content ILIKE …)` 处在 OR 里无法转 semi-join，
 * 规划器只能对全表消息做一次 ILIKE 扫描（200 万条消息实测 779ms），关联写法按会话走索引探测（同数据 5ms）。
 */
describe('conversationListWhere', () => {
  function render(where: ReturnType<typeof conversationListWhere>) {
    return db.select({ id: aiConversations.id }).from(aiConversations).where(where).toSQL();
  }

  it('关键词命中消息内容时使用关联到当前会话的 EXISTS 子查询', () => {
    const { sql, params } = render(conversationListWhere(7, { keyword: 'foo', archived: false }));
    expect(sql).toMatch(/exists \(select 1 from "ai_messages" where \("ai_messages"\."conversation_id" = "ai_conversations"\."id" and "ai_messages"\."content" ilike /);
    expect(sql).not.toMatch(/ in \(select /);
    // 标题匹配与消息匹配是 OR 关系，且都在用户 / 归档条件之内
    expect(sql).toMatch(/"ai_conversations"\."user_id" = \$1 and "ai_conversations"\."is_archived" = \$2 and \("ai_conversations"\."title" ilike \$3 or exists/);
    expect(params).toEqual([7, false, '%foo%', '%foo%']);
  });

  it('无关键词时不带消息子查询', () => {
    const { sql, params } = render(conversationListWhere(7, { archived: true }));
    expect(sql).not.toContain('ai_messages');
    expect(params).toEqual([7, true]);
  });

  it('空白关键词与无关键词等价', () => {
    const { sql } = render(conversationListWhere(7, { keyword: '   ', archived: false }));
    expect(sql).not.toContain('ai_messages');
  });
});
