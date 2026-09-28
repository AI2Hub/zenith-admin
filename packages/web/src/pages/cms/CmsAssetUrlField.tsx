import { Input, Space } from '@douyinfe/semi-ui';
import CmsAssetField from './components/CmsAssetField';

/**
 * 图片 URL 字段：外链地址手填与素材上传/选择共用同一字段值。
 * 值同时接受 `cms://` 素材引用与 http(s) 外链（CMS 校验与入库已支持双形态，
 * 不另加字段）；上传/选择写入素材引用并回显预览，手填外链同样可预览，删除则两边一起清空。
 */
export function CmsAssetUrlField({ value, onChange, siteId, allowUpload = true, disabled = false, label = '图片', urlPlaceholder }: Readonly<{
  value?: string | null; onChange?: (value: string) => void; siteId?: number; allowUpload?: boolean; disabled?: boolean;
  /** 素材选择按钮与上传按钮的文案（默认「图片」） */
  label?: string;
  /** 外链输入框占位，缺省「外链图片地址（可选），或下方上传/选择」 */
  urlPlaceholder?: string;
}>) {
  const text = value ?? '';
  return (
    <Space vertical align="start" spacing={8} style={{ width: '100%' }}>
      <Input value={text} showClear disabled={disabled} placeholder={urlPlaceholder ?? '外链图片地址（可选），或下方上传/选择'} onChange={(next) => onChange?.(next)} />
      <CmsAssetField siteId={siteId} type="image" value={text} onChange={(next) => onChange?.(next)} label={label} disabled={disabled} allowUpload={allowUpload} />
    </Space>
  );
}

export default CmsAssetUrlField;
