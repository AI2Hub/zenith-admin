import { useState } from 'react';
import { Button, Radio, RadioGroup, Space, TagInput, Tooltip, Typography } from '@douyinfe/semi-ui';
import { filesSettingsSchema } from '@zenith/shared/settings';
import type { SchemaFieldControlProps } from '@/components/settings/SchemaForm';
import { applyMimePreset, UPLOAD_MIME_PRESETS, type MimePresetMode } from './upload-mime-presets';

export function UploadMimeTypesInput({ value, disabled, onChange }: SchemaFieldControlProps) {
  const [mode, setMode] = useState<MimePresetMode>('append');
  const [failure, setFailure] = useState<{ value: unknown; message: string } | null>(null);
  // 恢复继承 / 回填新版本后，旧值上的校验失败不再显示。
  const error = failure && failure.value === value ? failure.message : '';
  const types = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  const allowsAll = types.some((type) => type.trim() === '*' || type.trim() === '*/*');

  function update(next: string[]) {
    if (disabled) return;
    const result = filesSettingsSchema.shape.uploadAllowedTypes.safeParse(next);
    if (!result.success) {
      setFailure({ value, message: result.error.issues[0]?.message ?? 'MIME 类型不符合要求' });
      return;
    }
    setFailure(null);
    onChange(result.data);
  }

  return (
    <div style={{ width: '100%' }}>
      <TagInput
        aria-label="允许的 MIME 类型"
        style={{ width: '100%' }}
        disabled={disabled}
        value={types}
        allowDuplicates={false}
        separator={[',', ' ', '\n']}
        addOnBlur
        placeholder="输入 MIME 类型后按回车添加"
        validateStatus={error ? 'error' : 'default'}
        onChange={(next) => update(applyMimePreset([], next, 'replace'))}
      />
      <Space wrap spacing={8} style={{ marginTop: 8 }}>
        <Typography.Text size="small" type="tertiary">快捷填入</Typography.Text>
        <RadioGroup type="button" buttonSize="small" aria-label="快捷填入方式" value={mode} disabled={disabled}
          onChange={(event) => setMode(event.target.value === 'replace' ? 'replace' : 'append')}>
          <Radio value="append">追加</Radio>
          <Radio value="replace">覆盖</Radio>
        </RadioGroup>
        <Typography.Text size="small" type="tertiary">
          {mode === 'append' ? '保留现有类型，自动去重' : '用所选类型替换当前列表'}
        </Typography.Text>
      </Space>
      <Space wrap spacing={6} style={{ marginTop: 8 }}>
        {UPLOAD_MIME_PRESETS.map((preset) => (
          <Tooltip key={preset.label} content={<span style={{ overflowWrap: 'anywhere' }}>{preset.types.join('、')}</span>}>
            <Button size="small" theme="light" disabled={disabled}
              onClick={() => update(applyMimePreset(types, preset.types, mode))}>{preset.label}</Button>
          </Tooltip>
        ))}
      </Space>
      {allowsAll && <Typography.Text size="small" type="tertiary" style={{ display: 'block', marginTop: 8 }}>当前列表包含通配符，允许全部类型；如需限定范围，请选择「覆盖」后填入。</Typography.Text>}
      {error && <span role="alert" style={{ display: 'block', marginTop: 8, color: 'var(--semi-color-danger)' }}>{error}</span>}
    </div>
  );
}

