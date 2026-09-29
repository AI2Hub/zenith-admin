import type { CSSProperties } from 'react';
import { Form, Typography, useFormApi, useFormState, withField } from '@douyinfe/semi-ui';
import { CMS_PAGE_IMAGE_RATIO_OPTIONS, CMS_RESOURCE_URI_PREFIX, cmsPageImageDefaults, cmsPageImagePresentation, isValidCmsAssetUrl } from '@zenith/shared/cms';
import { useCmsResourceSelection } from '@/hooks/queries/cms-resources';
import { usePermission } from '@/hooks/usePermission';
import { SliderInput } from '@/components/SliderInput';
import { CmsAssetField } from './components/CmsAssetField';
import './page-image-editor.css';

const FormAsset = withField(CmsAssetField);
const FormFocalAxis = withField(({ value, onChange, inputLabel }: { value?: number; onChange?: (value: number) => void; inputLabel: string }) =>
  <SliderInput value={(value ?? 0.5) * 100} onChange={next => onChange?.(next / 100)} min={0} max={100} step={1} suffix="%" aria-label={inputLabel} />);

function useImageSource(siteId: number | undefined, value: unknown) {
  const { hasPermission } = usePermission(); const source = typeof value === 'string' ? value : '';
  const resource = useCmsResourceSelection(siteId, source, 'image', hasPermission('cms:resource:list'));
  return resource.data?.url ?? (source && !source.startsWith(CMS_RESOURCE_URI_PREFIX) && isValidCmsAssetUrl(source) ? source : '');
}

/**
 * Crop previews use exactly the same aspect ratio and object-position values as public block rendering.
 * Semi 的 withField 以字段自身的 initValue 优先于外层 Form 的 initValues，因此这里一律用 presentation
 * （已存值优先、缺省回落到 cmsPageImageDefaults）作为 initValue：否则编辑已保存区块时会被默认值覆盖，
 * 保存回去就把替代文本、裁切比例与焦点丢掉。
 */
export default function CmsPageImageEditor({ type, siteId, allowUpload }: Readonly<{ type: 'hero' | 'image'; siteId?: number; allowUpload: boolean }>) {
  const form = useFormApi(); const state = useFormState(); const props = state.values as Record<string, unknown>;
  const defaults = cmsPageImageDefaults(type); const presentation = cmsPageImagePresentation(props, type);
  const desktopSource = useImageSource(siteId, props[type === 'hero' ? 'image' : 'src']);
  const mobileSource = useImageSource(siteId, props.mobileImage) || desktopSource;
  const decorative = typeof props.imageDecorative === 'boolean' ? props.imageDecorative : defaults.imageDecorative;
  return <>
    <FormAsset field="mobileImage" label="手机图片" initValue={presentation.mobileImage} siteId={siteId} type="image" allowUpload={allowUpload} extraText="可选；不选择时复用桌面图片，可分别为桌面 / 手机设置裁切焦点" />
    <Form.Switch field="imageDecorative" label="装饰图片" initValue={presentation.imageDecorative} extraText="不传达正文信息时开启；开启后发布采用空替代文本，辅助阅读工具会跳过这张图片" />
    <Form.Input field="imageAlt" label="图片替代文本" initValue={presentation.imageAlt} maxLength={500} disabled={decorative} extraText={decorative ? '发布时采用空替代文本，辅助阅读工具会跳过这张装饰图片。' : '说明图片表达的内容或用途，供看不到图片的读者使用。发布前必填。'} />
    {type === 'image' && decorative ? <Form.Input field="linkLabel" label="图片链接说明" initValue={presentation.linkLabel} maxLength={200} extraText="装饰图片带点击链接时填写，例如“查看活动日程”。" /> : null}
    <div className="auto-grid cms-page-image-editor" style={{ '--auto-grid-cols': 2 } as CSSProperties}>
      {(['desktop', 'mobile'] as const).map(device => {
        const label = device === 'desktop' ? '桌面' : '手机'; const source = device === 'desktop' ? desktopSource : mobileSource;
        const ratio = device === 'desktop' ? presentation.desktopAspectRatio : presentation.mobileAspectRatio;
        const position = device === 'desktop' ? presentation.desktopObjectPosition : presentation.mobileObjectPosition;
        const point = device === 'desktop' ? presentation.desktopFocalPoint : presentation.mobileFocalPoint;
        return <div key={device} className="cms-page-image-editor__device">
          <Typography.Text strong>{label}裁切预览</Typography.Text>
          <Form.Select field={`${device}Ratio`} label={`${label}图片比例`} initValue={device === 'desktop' ? presentation.desktopRatio : presentation.mobileRatio} optionList={CMS_PAGE_IMAGE_RATIO_OPTIONS} style={{ width: '100%' }} />
          {source ? <>
            <div className={`cms-page-image-editor__preview${ratio === 'auto' ? ' cms-page-image-editor__preview--auto' : ''}`} style={{ aspectRatio: ratio }}>
              <img src={source} alt={`${label}裁切预览`} style={{ objectPosition: position }} />
            </div>
            <Typography.Paragraph type="tertiary" size="small">在原图上点击主体，或调节下方焦点位置。</Typography.Paragraph>
            <button type="button" className="cms-page-image-editor__focus" aria-label={`在原图设置${label}焦点，回车居中`} onClick={event => {
              const rect = event.currentTarget.getBoundingClientRect();
              const x = event.detail === 0 ? 0.5 : Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
              const y = event.detail === 0 ? 0.5 : Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
              form.setValue(`${device}FocalPoint.x`, Math.round(x * 100) / 100); form.setValue(`${device}FocalPoint.y`, Math.round(y * 100) / 100);
            }}><img src={source} alt="" /><span aria-hidden="true" className="cms-page-image-editor__point" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} /></button>
          </> : <Typography.Paragraph type="tertiary">选择图片后可预览裁切效果。</Typography.Paragraph>}
          <FormFocalAxis field={`${device}FocalPoint.x`} label={`${label}水平焦点`} inputLabel={`${label}水平焦点`} initValue={point.x} />
          <FormFocalAxis field={`${device}FocalPoint.y`} label={`${label}垂直焦点`} inputLabel={`${label}垂直焦点`} initValue={point.y} />
        </div>;
      })}
    </div>
  </>;
}
