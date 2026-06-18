import { Check } from 'lucide-react';
import { useMemberTheme } from '../hooks/useMemberTheme';

export function ThemeColorPicker() {
  const { themeColor, setThemeColor, presets } = useMemberTheme();

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--m-text-secondary)', marginBottom: 16 }}>
        选择你喜欢的主题色，偏好会保存在本设备
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {presets.map((preset) => {
          const selected = themeColor === preset.color;
          return (
            <div key={preset.name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                title={preset.label}
                onClick={() => setThemeColor(preset.color)}
                aria-label={preset.label}
                aria-pressed={selected}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: preset.color,
                  border: selected ? '3px solid #fff' : '3px solid transparent',
                  boxShadow: selected ? `0 0 0 2px ${preset.color}` : '0 1px 4px rgba(0,0,0,0.15)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  transition: 'box-shadow 0.15s, transform 0.15s',
                  flexShrink: 0,
                }}
              >
                {selected && <Check size={16} color="#fff" strokeWidth={3} />}
              </button>
              <span
                style={{
                  fontSize: 11,
                  color: selected ? preset.color : 'var(--m-text-tertiary)',
                  fontWeight: selected ? 600 : 400,
                  whiteSpace: 'nowrap',
                }}
              >
                {preset.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
