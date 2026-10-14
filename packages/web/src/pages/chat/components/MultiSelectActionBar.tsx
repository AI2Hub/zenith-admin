import { Button, Typography } from '@douyinfe/semi-ui';
import { Bookmark, Forward, Trash2 } from 'lucide-react';

const { Text } = Typography;

/** 多选模式操作条：转发/收藏/删除/退出 */
export function MultiSelectActionBar({
  selectedMessageIds, handleForwardSelected, handleFavoriteSelected, handleDeleteSelected, handleExitMultiSelect,
}: Readonly<{
  selectedMessageIds: number[];
  handleForwardSelected: (mode: 'merge' | 'individual') => void;
  handleFavoriteSelected: () => void;
  handleDeleteSelected: () => void;
  handleExitMultiSelect: () => void;
}>) {
  return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', flexWrap: 'wrap' }}>
                <Text style={{ flex: 1, fontSize: 13, minWidth: 80 }}>
                  已选 <Text strong>{selectedMessageIds.length}</Text> 条消息
                </Text>
                <Button
                  size="small" type="primary" theme="light" icon={<Forward size={14} />}
                  disabled={selectedMessageIds.length === 0}
                  onClick={() => handleForwardSelected('individual')}
                >
                  逐条转发
                </Button>
                <Button
                  size="small" type="primary" icon={<Forward size={14} />}
                  disabled={selectedMessageIds.length === 0}
                  onClick={() => handleForwardSelected('merge')}
                >
                  合并转发
                </Button>
                <Button
                  size="small" type="primary" theme="light" icon={<Bookmark size={14} />}
                  disabled={selectedMessageIds.length === 0}
                  onClick={() => { void handleFavoriteSelected(); }}
                >
                  收藏
                </Button>
                <Button
                  size="small" type="danger" theme="light" icon={<Trash2 size={14} />}
                  disabled={selectedMessageIds.length === 0}
                  onClick={() => { void handleDeleteSelected(); }}
                >
                  删除
                </Button>
                <Button size="small" type="tertiary" onClick={handleExitMultiSelect}>取消多选</Button>
              </div>
  );
}
