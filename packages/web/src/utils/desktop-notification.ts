/**
 * 浏览器桌面通知（Notification API）的统一入口：权限探测 / 申请 / 发送。
 * 站内信、公告与聊天的桌面提醒都从这里发，点击通知时聚焦窗口并执行调用方给的跳转。
 */

export type DesktopNotificationPermission = NotificationPermission | 'unsupported';

export function desktopNotificationPermission(): DesktopNotificationPermission {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

/** 申请权限；已授权直接返回 granted，浏览器不支持返回 unsupported */
export async function requestDesktopNotificationPermission(): Promise<DesktopNotificationPermission> {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

export interface DesktopNotificationOptions {
  readonly title: string;
  readonly body?: string;
  /** 同 tag 的通知互相替换，避免同一会话连续弹出多条 */
  readonly tag?: string;
  readonly icon?: string;
  /** 点击通知：已先 focus 窗口并关闭通知 */
  readonly onClick?: () => void;
}

/** 已授权时弹出系统通知；未授权 / 不支持 / 构造失败均静默返回 false */
export function showDesktopNotification(options: DesktopNotificationOptions): boolean {
  if (desktopNotificationPermission() !== 'granted') return false;
  try {
    const notification = new Notification(options.title, {
      ...(options.body ? { body: options.body } : {}),
      ...(options.tag ? { tag: options.tag } : {}),
      ...(options.icon ? { icon: options.icon } : {}),
    });
    notification.onclick = () => {
      globalThis.focus();
      options.onClick?.();
      notification.close();
    };
    return true;
  } catch {
    return false;
  }
}
