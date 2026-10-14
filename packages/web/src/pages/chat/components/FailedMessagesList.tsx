import { Button, List as SemiList } from '@douyinfe/semi-ui';
import { AlertCircle } from 'lucide-react';
import { removeFailedMessageById } from '../utils-state';
import type { FailedMessage, Setter } from '../types';

/** 发送失败消息提示列表：重试编辑 / 移除 */
export function FailedMessagesList({
  isQuick, failedMessages, activeConvId, setFailedMessages, setInput, inputRef,
}: Readonly<{
  isQuick: boolean;
  failedMessages: FailedMessage[];
  activeConvId: number | null;
  setFailedMessages: Setter<FailedMessage[]>;
  setInput: Setter<string>;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}>) {
  return (
                <div style={{ padding: isQuick ? '0 12px 8px' : '0 20px 8px', flexShrink: 0 }}>
                  <SemiList
                    split={false}
                    dataSource={failedMessages.filter((m) => m.convId === activeConvId)}
                    renderItem={(failed) => (
                      <SemiList.Item
                        key={failed.id}
                        style={{
                          padding: '8px 12px', margin: '4px 0',
                          background: 'var(--semi-color-danger-light-default)',
                          border: '1px solid var(--semi-color-danger-light-active)',
                          borderRadius: 'var(--semi-border-radius-medium)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <AlertCircle size={14} style={{ color: 'var(--semi-color-danger)', marginTop: 2, flexShrink: 0 }} />
                          <span style={{ flex: 1, fontSize: 13, wordBreak: 'break-word', color: 'var(--semi-color-text-0)' }}>
                            {failed.content}
                          </span>
                          <Button
                            size="small"
                            type="danger"
                            theme="borderless"
                            onClick={() => {
                              setFailedMessages(removeFailedMessageById(failed.id));
                              setInput(failed.content);
                              requestAnimationFrame(() => inputRef.current?.focus());
                            }}
                          >
                            重试
                          </Button>
                          <Button
                            size="small"
                            theme="borderless"
                            type="tertiary"
                            onClick={() => setFailedMessages(removeFailedMessageById(failed.id))}
                          >
                            忽略
                          </Button>
                        </div>
                      </SemiList.Item>
                    )}
                  />
                </div>
  );
}
