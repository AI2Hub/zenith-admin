# 数据库事务

本页介绍 Zenith Admin 中使用 Drizzle ORM 管理 PostgreSQL 事务的完整规范，包括何时需要事务、常见模式、副作用处理和错误处理。

## 基本用法

`db.transaction()` 接受一个异步回调，回调内的所有操作使用同一个 `tx`（事务对象）执行。回调正常返回时自动 **COMMIT**，抛出异常时自动 **ROLLBACK**：

```ts
const result = await db.transaction(async (tx) => {
  const [created] = await tx.insert(mainTable).values(data).returning();
  await tx.insert(relTable).values({ parentId: created.id, ...extra });
  return created; // 返回值会作为 db.transaction() 的结果
});
```

## 何时需要事务

| 场景 | 示例 | 是否需要事务 |
| ---- | ---- | ------------ |
| **replace 模式**（先 delete 再 insert） | 保存角色菜单、保存通知接收人 | ✅ 必须 |
| **多表联写**（写入主表 + 关联表） | 创建用户同时设置角色和岗位 | ✅ 必须 |
| **互斥写入**（先读再写，保证状态一致） | 切换默认存储配置：先清 isDefault，再设新默认 | ✅ 必须 |
| **级联删除**（递归查找子节点再批量删除） | 删除菜单及其所有子菜单 | ✅ 必须 |
| **单表单次写入** | 普通 create / update / delete | ❌ 不需要 |

## 常见模式

### 模式一：多表联写（创建主记录 + 关联关系）

最常见的场景：创建一条主记录，同时写入多张关联表，要求三者同时成功或同时回滚。

```ts
// 来自 users.service.ts：创建用户时，同步设置角色和岗位
const created = await db.transaction(async (tx) => {
  const [u] = await tx.insert(users).values({
    ...rest,
    password: hashedPassword,
    departmentId: departmentId ?? null,
  }).returning();
  await setUserRoles(tx, u.id, nextRoleIds);        // 写 user_roles
  await setUserPositions(tx, u.id, nextPositionIds); // 写 user_positions
  return u;
});
```

> `setUserRoles` / `setUserPositions` 等辅助函数的签名为 `(executor: DbExecutor, ...)` ，既可在事务内传 `tx`，也可直接传 `db`（见[模式三](#模式三辅助函数接受-dbexecutor推荐用于可复用的写操作)）。

### 模式二：replace 模式（先删后插）

对于"覆盖式更新"关联关系，直接先删全部再重新插入，事务保证中间状态不可见：

```ts
// 来自 roles.service.ts：保存角色的菜单权限
await db.transaction(async (tx) => {
  await tx.delete(roleMenus).where(eq(roleMenus.roleId, id));
  if (menuIds.length > 0) {
    await tx.insert(roleMenus).values(menuIds.map((menuId) => ({ roleId: id, menuId })));
  }
});
```

同样的模式也用于"保存通知接收人"：

```ts
// 来自 announcements.service.ts（saveRecipients 内部）
await tx.delete(announcementRecipients).where(eq(announcementRecipients.announcementId, announcementId));
if (recipientList.length > 0) {
  await tx.insert(announcementRecipients).values(recipientList.map((userId) => ({ announcementId, userId })));
}
```

### 模式三：辅助函数接受 `DbExecutor`（推荐用于可复用的写操作）

当一个写操作逻辑需要在多处调用（有时在事务内、有时独立调用）时，将 `db` 或 `tx` 抽象为 `DbExecutor` 参数：

```ts
import type { DbExecutor } from '../db/types';

// 辅助函数接受 executor，可在事务内和事务外都调用
async function setUserRoles(executor: DbExecutor, userId: number, roleIds: number[]) {
  await executor.delete(userRoles).where(eq(userRoles.userId, userId));
  if (roleIds.length > 0) {
    await executor.insert(userRoles).values(roleIds.map((roleId) => ({ userId, roleId })));
  }
}

// 调用方一：在事务内传 tx
await db.transaction(async (tx) => {
  const [u] = await tx.insert(users).values(data).returning();
  await setUserRoles(tx, u.id, roleIds);
  return u;
});

// 调用方二：独立执行时传 db
await setUserRoles(db, userId, roleIds);
```

### 模式四：互斥写入（先读后写保证唯一性）

当需要"先读取状态再修改，保证同一时刻只有一条记录满足某条件"时，整个读-写操作放入事务：

```ts
// 来自 file-storage-configs.service.ts：切换默认存储配置
await db.transaction(async (tx) => {
  await clearDefaultFlag(tx);                              // 先清除所有 isDefault=true
  const [row] = await tx
    .update(fileStorageConfigs)
    .set({ isDefault: true })
    .where(eq(fileStorageConfigs.id, id))
    .returning();
  return row;
});
```

### 模式五：级联递归操作

当删除一条记录需要先在事务内完成树形遍历，再批量删除，避免读到中间态：

```ts
// 来自 menus.service.ts：删除菜单及其所有子菜单（BFS 遍历）
await db.transaction(async (tx) => {
  const all = await tx.select({ id: menus.id, parentId: menus.parentId }).from(menus);
  const toDelete = new Set<number>();
  const queue = [id];
  while (queue.length) {
    const cur = queue.shift()!;
    toDelete.add(cur);
    all.filter((m) => m.parentId === cur).forEach((m) => queue.push(m.id));
  }
  await tx.delete(menus).where(inArray(menus.id, [...toDelete]));
});
```

## 副作用的处理原则

WebSocket 推送、邮件发送、缓存清除等**副作用操作必须放在事务之外**，在事务成功提交后执行：

```ts
// ✅ 正确：先完成事务，再执行副作用
const row = await db.transaction(async (tx) => {
  const [inserted] = await tx.insert(announcements).values(data).returning();
  await saveRecipients(tx, inserted.id, recipientList);  // 纯 DB 操作
  return inserted;
});
await broadcastAnnouncement(row);  // 副作用：事务成功后才推送 WebSocket

// ❌ 错误：副作用放在事务内（事务回滚后推送已发出，无法撤回）
await db.transaction(async (tx) => {
  const [inserted] = await tx.insert(announcements).values(data).returning();
  await broadcastAnnouncement(inserted); // 事务可能失败，但消息已发出
});
```

缓存清除（如 `clearUserPermissionCache()`）同理，在事务完成后调用：

```ts
await db.transaction(async (tx) => {
  await tx.delete(userRoles).where(eq(userRoles.roleId, id));
  await tx.insert(userRoles).values(newPairs);
});
clearUserPermissionCache(); // 事务提交后再清缓存
```

## 事务内的错误处理

事务回调内抛出 `HTTPException` 或普通 `Error`，Drizzle 都会自动 ROLLBACK。唯一约束冲突使用 `rethrowPgUniqueViolation` 统一映射：

```ts
// 来自 users.service.ts：创建用户并捕获唯一约束冲突
try {
  const created = await db.transaction(async (tx) => {
    const [u] = await tx.insert(users).values(data).returning();
    await setUserRoles(tx, u.id, roleIds);
    return u;
  });
} catch (err: unknown) {
  rethrowPgUniqueViolation(err, '用户名或邮箱已存在');
}
```

`rethrowPgUniqueViolation` 定义在 `packages/server/src/lib/db-errors.ts`：如果是 PG 唯一约束错误（`23505`）则抛 `HTTPException(400)`，否则原样重新抛出。

## 注意事项

- 事务内**不要** `await Promise.all()` 并发执行多条写语句，PostgreSQL 的 `postgres.js` 驱动在同一连接上串行执行事务 SQL，并发会导致连接竞争。需要并行时，把并行逻辑放在事务外。
- 事务内**可以** `Promise.all` 执行多条只读查询（如并行拉取几张表的数据再写入），这是安全的。
- 事务对象 `tx` 不可跨 `await` 边界传递给其他并发分支——保持线性调用链。

## 统一数据库类型（`src/db/types.ts`）

当 helper 需要同时接受 `db` 与事务里的 `tx` 执行器时，统一从 `packages/server/src/db/types.ts` 导入类型，避免手工从 `db.transaction()` 签名反推：

```ts
import type { Db, DbExecutor, DbTransaction } from '../db/types';

// 三种类型的含义：
// Db            — 顶层 db 实例（PostgresJsDatabase）
// DbTransaction — db.transaction() 回调中的 tx 对象
// DbExecutor    — Db | DbTransaction，函数兼容两种调用方式时使用

async function saveItems(executor: DbExecutor, parentId: number, items: Item[]) {
  // ...
}
```

**不要**再写这类手工推导：

```ts
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
```
