-- API Token 主体副本（middleware/auth.ts 的 apiTokenRows）的跨实例失效：令牌创建 / 删除 / 过期改写在事务提交后
-- 经 0001_extensions.sql 的通用触发器函数 notify_cache_invalidate() 向 cache_invalidate 频道广播 { topic: 表名, key: id }。
-- 副本按 token_hash 键、无 id 反向索引，订阅方收到即整段清空（令牌行变更极少）；所属用户 / 租户的活性
-- 复用 0005 的 users / tenants 触发器，与 JWT 路径同一条失效链路。
CREATE TRIGGER user_api_tokens_cache_invalidate
  AFTER INSERT OR UPDATE OR DELETE ON "user_api_tokens"
  FOR EACH ROW EXECUTE FUNCTION notify_cache_invalidate('id');