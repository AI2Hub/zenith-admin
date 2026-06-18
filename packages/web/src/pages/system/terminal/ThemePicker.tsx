import { useState, useEffect, useRef } from 'react';
import type { TerminalThemeDef } from './themes';

function Line({ w, color, op = 0.85 }: { w: number; color: string; op?: number }) {
  return (
    <div
      style={{
        width: w,
        height: 4,
        borderRadius: 2,
        background: color,
        opacity: op,
        flexShrink: 0,
      }}
    />
  );
}

function ThemeCard({
  theme,
  selected,
  onClick,
}: {
  theme: TerminalThemeDef;
  selected: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  const ansiColors = [
    theme.red,
    theme.yellow,
    theme.green,
    theme.cyan,
    theme.blue,
    theme.magenta,
    theme.brightRed,
    theme.brightGreen,
  ];

  const borderColor = selected
    ? 'var(--semi-color-primary)'
    : hovered
      ? 'var(--semi-color-primary-light-active)'
      : 'var(--semi-color-border)';

  return (
    <div
      role="button"
      tabIndex={0}
      data-selected={selected ? 'true' : undefined}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        cursor: 'pointer',
        borderRadius: 8,
        overflow: 'hidden',
        border: `2px solid ${borderColor}`,
        transition: 'border-color 0.15s',
        display: 'flex',
        flexDirection: 'column',
        outline: 'none',
      }}
    >
      {/* Terminal preview */}
      <div style={{ background: theme.background, padding: '6px 8px 0' }}>
        {/* Window chrome */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 5 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ff5f56' }} />
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ffbd2e' }} />
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#27c93f' }} />
          <div style={{ flex: 1 }} />
          <div style={{ width: 20, height: 4, borderRadius: 3, background: theme.blue, opacity: 0.7 }} />
          <div style={{ width: 28, height: 4, borderRadius: 3, background: theme.green, opacity: 0.7 }} />
        </div>

        {/* Fake syntax lines */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3.5 }}>
          <div style={{ display: 'flex', gap: 3 }}>
            <Line w={40} color={theme.magenta} />
            <Line w={24} color={theme.yellow} />
          </div>
          <div style={{ display: 'flex', gap: 3, paddingLeft: 8 }}>
            <Line w={16} color={theme.red} />
            <Line w={46} color={theme.foreground} op={0.4} />
          </div>
          <div style={{ display: 'flex', gap: 3, paddingLeft: 8 }}>
            <Line w={10} color={theme.cyan} />
            <Line w={30} color={theme.green} />
            <Line w={36} color={theme.cyan} />
          </div>
          <div style={{ display: 'flex', gap: 3, paddingLeft: 8 }}>
            <Line w={10} color={theme.cyan} />
            <Line w={24} color={theme.foreground} op={0.35} />
          </div>
          <div style={{ display: 'flex', gap: 5, marginTop: 2 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: theme.blue, opacity: 0.75 }} />
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: theme.yellow, opacity: 0.75 }} />
          </div>
        </div>

        {/* ANSI color swatch bar */}
        <div style={{ display: 'flex', height: 4, marginTop: 5, overflow: 'hidden' }}>
          {ansiColors.map((color, i) => (
            <div key={i} style={{ flex: 1, background: color }} />
          ))}
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 7px',
          background: theme.background,
          borderTop: `1px solid ${theme.type === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: theme.foreground,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            lineHeight: '16px',
          }}
        >
          {theme.name}
        </span>
        {selected && (
          <span
            style={{
              fontSize: 10,
              padding: '1px 5px',
              borderRadius: 8,
              background: 'var(--semi-color-primary)',
              color: '#fff',
              lineHeight: '14px',
              flexShrink: 0,
              marginLeft: 4,
            }}
          >
            当前
          </span>
        )}
      </div>
    </div>
  );
}

interface ThemePickerProps {
  themes: TerminalThemeDef[];
  value: string;
  onChange: (id: string) => void;
}

export default function ThemePicker({ themes, value, onChange }: ThemePickerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll selected theme into view on mount
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const selected = container.querySelector<HTMLElement>('[data-selected="true"]');
    if (selected) {
      const top = selected.offsetTop - container.clientHeight / 2 + selected.clientHeight / 2;
      container.scrollTop = Math.max(0, top);
    }
  }, []);

  return (
    <div
      ref={scrollRef}
      style={{
        maxHeight: 220,
        overflowY: 'auto',
        overflowX: 'hidden',
        paddingRight: 2,
        marginRight: -2,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {themes.map((theme) => (
          <ThemeCard
            key={theme.id}
            theme={theme}
            selected={theme.id === value}
            onClick={() => onChange(theme.id)}
          />
        ))}
      </div>
    </div>
  );
}
