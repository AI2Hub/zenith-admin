import { Button, Popover, Switch, Tooltip, Typography } from '@douyinfe/semi-ui';
import { Bell, BellOff } from 'lucide-react';

const { Text } = Typography;

/** 通知设置浮层：桌面通知与提示音开关 */
export function NotifySettingsPopover({
  notifyDesktop, notifyPermission, notifySound, handleToggleNotifyDesktop, handleToggleNotifySound,
}: Readonly<{
  notifyDesktop: boolean;
  notifyPermission: NotificationPermission;
  notifySound: boolean;
  handleToggleNotifyDesktop: (checked: boolean) => void;
  handleToggleNotifySound: (checked: boolean) => void;
}>) {
  return (
                    <Tooltip content="通知设置">
                      <Popover
                        trigger="click"
                        position="bottomRight"
                        showArrow
                        content={(
                          <div style={{ padding: '10px 12px', width: 230 }}>
                            <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 10 }}>消息通知设置</Text>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                              <Text style={{ fontSize: 13 }}>桌面通知</Text>
                              <Switch
                                size="small"
                                checked={notifyDesktop && notifyPermission === 'granted'}
                                onChange={(v) => { void handleToggleNotifyDesktop(v); }}
                              />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <Text style={{ fontSize: 13 }}>新消息提示音</Text>
                              <Switch size="small" checked={notifySound} onChange={handleToggleNotifySound} />
                            </div>
                            {notifyPermission === 'denied' && (
                              <Text type="tertiary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
                                浏览器已禁用通知权限，请在浏览器设置中允许后重试
                              </Text>
                            )}
                            <Text type="tertiary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
                              仅在窗口处于后台时提醒，已免打扰的会话不提醒
                            </Text>
                          </div>
                        )}
                      >
                        <Button
                          size="small"
                          theme="borderless"
                          type={notifyDesktop && notifyPermission === 'granted' ? 'primary' : 'tertiary'}
                          icon={notifyDesktop && notifyPermission === 'granted' ? <Bell size={15} /> : <BellOff size={15} />}
                          aria-label="通知设置"
                        />
                      </Popover>
                    </Tooltip>
  );
}
