import { Input, Space } from '@douyinfe/semi-ui';
import CmsAssetField from './components/CmsAssetField';

/**
 * 友链 Logo：外链地址手填与素材上传/选择共用同一字段值（`logo` 列同时接受
 * `cms://` 素材引用与 http(s) 外链，校验与入库已支持双形态，不另加字段）。
 * 上传/选择写入素材引用并回显预览；手填外链同样可预览；删除则两边一起清空。
 */
export function FriendLinkLogoField({ value, onChange, siteId, allowUpload = true, disabled = false }: Readonly<{
  value?: string | null; onChange?: (value: string) => void; siteId?: number; allowUpload?: boolean; disabled?: boolean;
}>) {
  const text = value ?? '';
  return (
    <Space vertical align="start" spacing={8} style={{ width: '100%' }}>
      <Input value={text} showClear disabled={disabled} placeholder="外链图片地址（可选），或下方上传/选择" onChange={(next) => onChange?.(next)} />
      <CmsAssetField siteId={siteId} type="image" value={text} onChange={(next) => onChange?.(next)} label="Logo" disabled={disabled} allowUpload={allowUpload} />
    </Space>
  );
}

export default FriendLinkLogoField;
