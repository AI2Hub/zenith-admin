export const PUBLISHABLE_STATUS_META: Record<
  string,
  { text: string; color: 'grey' | 'green' | 'red' }
> = {
  draft: { text: '草稿', color: 'grey' },
  published: { text: '已发布', color: 'green' },
  disabled: { text: '已禁用', color: 'red' },
};
