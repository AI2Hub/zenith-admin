import { Divider } from '@douyinfe/semi-ui';
import { Keyboard } from 'lucide-react';
import { AppModal } from '@/components/AppModal';

// 快捷键说明 Modal
export function ShortcutsModal({
  shortcutsVisible,
  setShortcutsVisible,
}: Readonly<{
  shortcutsVisible: boolean;
  setShortcutsVisible: (visible: boolean) => void;
}>) {
  return (
    <AppModal
      title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Keyboard size={16} />快捷键</span>}
      visible={shortcutsVisible}
      onCancel={() => setShortcutsVisible(false)}
      footer={null}
      width={560}
    >
      {([
        {
          group: '全局',
          items: [
            { keys: ['Ctrl / ⌘', 'K'], desc: '打开命令面板' },
            { keys: ['Alt', 'S'], desc: '展开/折叠侧边栏' },
            { keys: ['Alt', 'C'], desc: '内容全屏/退出' },
            { keys: ['Alt', 'L'], desc: '锁定屏幕（需开启锁屏功能）' },
          ],
        },
        {
          group: '多标签页',
          items: [
            { keys: ['中键单击'], desc: '关闭当前标签页' },
            { keys: ['右键'], desc: '打开标签页上下文菜单' },
          ],
        },
        {
          group: '表格',
          items: [
            { keys: ['Esc'], desc: '退出全屏模式' },
          ],
        },
        {
          group: '工作流设计器',
          items: [
            { keys: ['Ctrl / ⌘', 'Z'], desc: '撤销' },
            { keys: ['Ctrl / ⌘', 'Shift', 'Z'], desc: '重做' },
            { keys: ['Ctrl / ⌘', 'Y'], desc: '重做（备用）' },
          ],
        },
        {
          group: 'AI 聊天',
          items: [
            { keys: ['Enter'], desc: '发送消息' },
            { keys: ['Shift', 'Enter'], desc: '换行' },
          ],
        },
      ] as { group: string; items: { keys: string[]; desc: string }[] }[]).map(({ group, items }, index, arr) => (
        <div key={group}>
          <Divider align="left" style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--semi-color-text-2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{group}</Divider>
          <div className="auto-grid" style={{ ['--auto-grid-min' as string]: '240px', ['--auto-grid-cols' as string]: 2, ['--auto-grid-row-gap' as string]: '2px', marginBottom: index < arr.length - 1 ? 12 : 0 }}>
            {items.map(({ keys, desc }) => (
              <div key={desc} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                <span style={{ color: 'var(--semi-color-text-1)', fontSize: 12, marginRight: 8 }}>{desc}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                  {keys.map((k, i) => (
                    <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      {i > 0 && <span style={{ color: 'var(--semi-color-text-3)', fontSize: 10 }}>+</span>}
                      <kbd style={{ display: 'inline-flex', alignItems: 'center', padding: '1px 5px', background: 'var(--surface-card)', border: '1px solid var(--semi-color-border)', borderRadius: 'var(--semi-border-radius-small)', fontSize: 11, fontFamily: 'inherit', color: 'var(--semi-color-text-0)', boxShadow: '0 1px 0 var(--semi-color-border)', whiteSpace: 'nowrap' }}>{k}</kbd>
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </AppModal>
  );
}
