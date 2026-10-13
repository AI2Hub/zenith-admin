/**
 * 托管产物（打包 zip、导出快照等）在应用内的落地页。
 *
 * 站内信的 link 契约是「深链地址（站内路由，点击消息跳转）」，消费方直接 `navigate(link)`：
 * 传 `/api/files/:id/content` 会被当成路由跳转，落到前端 404；而且裸链接带不上 bearer 令牌，
 * 就算强行新窗口打开也是 401 —— 裸 API 路径从来不是一条可用的下载链接。
 *
 * 落地页取托管文件库（`/system/files`），按产物文件名过滤直达（与 entity-relations 的深链同一
 * 形式），用户在那一行点「下载」即拿到带鉴权的文件。
 */
export function managedFileDeepLink(filename: string): string {
  return `/system/files?keyword=${encodeURIComponent(filename)}`;
}
