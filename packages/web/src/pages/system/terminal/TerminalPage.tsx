import { useState, useCallback } from 'react';
import { Button, Tabs, Typography, Space } from '@douyinfe/semi-ui';
import { Plus, TerminalSquare } from 'lucide-react';
import TerminalTab from './TerminalTab';

const IS_DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

interface Session {
  id: string;
  title: string;
}

let sessionCounter = 1;

function DemoNotice() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 12,
        color: 'var(--semi-color-text-2)',
      }}
    >
      <TerminalSquare size={48} strokeWidth={1.2} style={{ opacity: 0.4 }} />
      <Typography.Title heading={5} style={{ margin: 0 }}>Web 终端</Typography.Title>
      <Typography.Text type="tertiary">演示模式下终端功能不可用</Typography.Text>
    </div>
  );
}

export default function TerminalPage() {
  const [sessions, setSessions] = useState<Session[]>([
    { id: String(sessionCounter), title: 'Terminal 1' },
  ]);
  const [activeId, setActiveId] = useState(String(sessionCounter));

  const addSession = useCallback(() => {
    sessionCounter += 1;
    const id = String(sessionCounter);
    setSessions((prev) => [...prev, { id, title: `Terminal ${prev.length + 1}` }]);
    setActiveId(id);
  }, []);

  const removeSession = (id: string) => {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (next.length === 0) {
        sessionCounter += 1;
        const newId = String(sessionCounter);
        setActiveId(newId);
        return [{ id: newId, title: 'Terminal 1' }];
      }
      return next;
    });
    setActiveId((prev) => {
      if (prev !== id) return prev;
      const idx = sessions.findIndex((s) => s.id === id);
      const remaining = sessions.filter((s) => s.id !== id);
      return remaining[Math.max(0, idx - 1)]?.id ?? remaining[0]?.id ?? prev;
    });
  };

  if (IS_DEMO) return <DemoNotice />;

  const tabBarExtra = (
    <Space style={{ paddingRight: 8 }}>
      <Button
        icon={<Plus size={13} />}
        size="small"
        theme="borderless"
        type="tertiary"
        onClick={addSession}
        title="新建终端"
      />
    </Space>
  );

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#1e1e2e',
        overflow: 'hidden',
      }}
    >
      <Tabs
        activeKey={activeId}
        onChange={setActiveId}
        onTabClose={removeSession}
        tabBarExtraContent={tabBarExtra}
        style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
        contentStyle={{ flex: 1, minHeight: 0, overflow: 'hidden', padding: 0 }}
        tabBarStyle={{
          background: '#181825',
          borderBottom: '1px solid #313244',
          padding: '0 8px',
          margin: 0,
          flexShrink: 0,
        }}
      >
        {sessions.map((s) => (
          <Tabs.TabPane
            key={s.id}
            itemKey={s.id}
            tab={
              <Space spacing={6}>
                <TerminalSquare size={12} />
                <span>{s.title}</span>
              </Space>
            }
            closable={sessions.length > 1}
          >
            <div style={{ width: '100%', height: '100%', padding: '8px 4px 4px' }}>
              <TerminalTab
                sessionId={s.id}
                active={activeId === s.id}
              />
            </div>
          </Tabs.TabPane>
        ))}
      </Tabs>
    </div>
  );
}
