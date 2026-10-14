import { Space } from '@douyinfe/semi-ui';
import type { TypingUsersMap } from '../types';

/** 正在输入提示条 */
export function TypingIndicator({
  typingUsers,
}: Readonly<{
  typingUsers: TypingUsersMap;
}>) {
  return (
                <div style={{ fontSize: 11, color: 'var(--semi-color-text-3)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Space spacing={3}>
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        style={{
                          width: 4, height: 4, borderRadius: '50%',
                          background: 'var(--semi-color-text-3)',
                          display: 'inline-block',
                          animation: `chat-typing-bounce 1.2s ${i * 0.2}s ease-in-out infinite`,
                        }}
                      />
                    ))}
                  </Space>
                  {Object.values(typingUsers).length > 2
                    ? `${Object.values(typingUsers)[0].nickname}等${Object.values(typingUsers).length}人正在输入...`
                    : `${Object.values(typingUsers).map((u) => u.nickname).join('、')}正在输入...`}
                </div>
  );
}
