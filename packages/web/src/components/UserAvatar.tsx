import { Avatar } from '@douyinfe/semi-ui';

/** 根据名称字符串生成稳定的背景色（循环取 Semi 语义色） */
function getAvatarColor(name: string): string {
  const colors = [
    'var(--semi-color-primary)',
    'var(--semi-color-success)',
    'var(--semi-color-warning)',
    'var(--semi-color-danger)',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (name.codePointAt(i) ?? 0) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

interface UserAvatarProps {
  /** 用户昵称，用于生成首字母和背景色 */
  name: string;
  /** 头像图片 URL，有值时显示图片 */
  avatar?: string | null;
  /** 像素尺寸，默认 36 */
  size?: number;
  /** 传递给 Avatar 的额外 style */
  style?: React.CSSProperties;
  /** Semi Avatar size 预设，不传时用 size 数值控制 */
  semiSize?: 'extra-extra-small' | 'extra-small' | 'small' | 'default' | 'medium' | 'large' | 'extra-large';
}

/**
 * 通用用户头像组件。
 * - 有 avatar URL → 显示图片
 * - 无头像 → 显示首字母 + 哈希背景色
 */
export function UserAvatar({ name, avatar, size = 36, style, semiSize = 'small' }: Readonly<UserAvatarProps>) {
  const sizeStyle: React.CSSProperties = { width: size, height: size, flexShrink: 0, ...style };

  if (avatar) {
    return (
      <Avatar
        src={avatar}
        alt={name}
        size={semiSize}
        style={sizeStyle}
      />
    );
  }

  return (
    <Avatar
      size={semiSize}
      alt={name}
      style={{ backgroundColor: getAvatarColor(name), color: '#fff', ...sizeStyle }}
    >
      {name.slice(0, 1).toUpperCase() || '?'}
    </Avatar>
  );
}
