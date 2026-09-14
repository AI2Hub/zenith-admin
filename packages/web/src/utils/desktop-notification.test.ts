import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  desktopNotificationPermission,
  requestDesktopNotificationPermission,
  showDesktopNotification,
} from './desktop-notification';

type NotificationCtor = typeof Notification;
const original = (globalThis as { Notification?: NotificationCtor }).Notification;

function installFakeNotification(permission: NotificationPermission, requestResult: NotificationPermission = permission) {
  const instances: Array<{ title: string; options?: NotificationOptions; onclick: (() => void) | null; close: () => void }> = [];
  class FakeNotification {
    static permission: NotificationPermission = permission;
    static requestPermission = vi.fn(async () => {
      FakeNotification.permission = requestResult;
      return requestResult;
    });
    onclick: (() => void) | null = null;
    close = vi.fn();
    constructor(public title: string, public options?: NotificationOptions) {
      instances.push(this);
    }
  }
  (globalThis as { Notification?: unknown }).Notification = FakeNotification;
  return { FakeNotification, instances };
}

beforeEach(() => {
  vi.spyOn(globalThis, 'focus').mockImplementation(() => {});
});

afterEach(() => {
  (globalThis as { Notification?: NotificationCtor }).Notification = original;
  vi.restoreAllMocks();
});

describe('desktop notification helpers', () => {
  it('reports unsupported when the API is missing', async () => {
    delete (globalThis as { Notification?: unknown }).Notification;
    expect(desktopNotificationPermission()).toBe('unsupported');
    expect(await requestDesktopNotificationPermission()).toBe('unsupported');
    expect(showDesktopNotification({ title: 'x' })).toBe(false);
  });

  it('only prompts when permission is still default', async () => {
    const granted = installFakeNotification('granted');
    expect(await requestDesktopNotificationPermission()).toBe('granted');
    expect(granted.FakeNotification.requestPermission).not.toHaveBeenCalled();

    const pending = installFakeNotification('default', 'denied');
    expect(await requestDesktopNotificationPermission()).toBe('denied');
    expect(pending.FakeNotification.requestPermission).toHaveBeenCalledTimes(1);
  });

  it('shows a notification when granted and wires focus + click + close', () => {
    const { instances } = installFakeNotification('granted');
    const onClick = vi.fn();
    expect(showDesktopNotification({ title: '新消息', body: '正文', tag: 't', onClick })).toBe(true);
    expect(instances).toHaveLength(1);
    expect(instances[0].options).toEqual({ body: '正文', tag: 't' });
    instances[0].onclick?.();
    expect(globalThis.focus).toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(instances[0].close).toHaveBeenCalledTimes(1);
  });

  it('stays silent without permission', () => {
    const { instances } = installFakeNotification('denied');
    expect(showDesktopNotification({ title: '新消息' })).toBe(false);
    expect(instances).toHaveLength(0);
  });
});
