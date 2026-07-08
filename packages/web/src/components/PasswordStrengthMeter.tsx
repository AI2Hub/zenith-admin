import { useMemo } from 'react';
import { CheckCircle, Circle } from 'lucide-react';
import type { PasswordPolicy } from '@/utils/password-policy';

interface PasswordStrengthMeterProps {
  /** 当前密码输入值；为空时组件不渲染任何内容 */
  readonly password: string;
  /** 密码策略（可选）；提供时在强度条下方展示策略达标清单 */
  readonly policy?: PasswordPolicy | null;
}

type Level = 0 | 1 | 2 | 3 | 4;

const LEVEL_CONFIG: Record<Level, { label: string; color: string }> = {
  0: { label: '',    color: 'transparent' },
  1: { label: '弱',  color: 'var(--semi-color-danger)' },
  2: { label: '一般', color: 'var(--semi-color-warning)' },
  3: { label: '良好', color: 'var(--semi-color-info)' },
  4: { label: '强',  color: 'var(--semi-color-success)' },
};

function calcStrength(pwd: string): Level {
  if (!pwd) return 0;
  if (pwd.length < 6) return 1;

  let score = 0;
  if (/[a-z]/.test(pwd)) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/\d/.test(pwd)) score++;
  if (/[^a-zA-Z0-9]/.test(pwd)) score++;
  if (pwd.length >= 10) score++;

  if (score <= 1) return 1;
  if (score === 2) return 2;
  if (score === 3) return 3;
  return 4;
}

/**
 * 密码强度指示器。
 *
 * - `password` 为空时不渲染任何内容，可作为 `helpText` 直接传入 Semi `Form.Input`。
 * - 提供 `policy` 时，在强度条下方展示策略达标清单（✓ / ○）。
 */
export function PasswordStrengthMeter({ password, policy }: PasswordStrengthMeterProps) {
  const strength = useMemo(() => calcStrength(password), [password]);

  if (!password) return null;

  const { label, color } = LEVEL_CONFIG[strength];

  const policyChecks = policy
    ? [
        ...(policy.requireUppercase
          ? [{ label: '含大写字母', ok: /[A-Z]/.test(password) }]
          : []),
        ...(policy.requireSpecialChar
          ? [{ label: '含特殊字符', ok: /[^a-zA-Z0-9]/.test(password) }]
          : []),
      ]
    : null;

  // 最小长度单独提出，与强度条同行显示
  const minLengthOk = policy ? password.length >= policy.minLength : null;
  const minLengthLabel = policy ? `至少 ${policy.minLength} 位` : null;

  return (
    <div style={{ padding: '4px 0' }}>
      {/* 强度分段条 + 标签 + 最小位数（同行） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', gap: 3, flex: 1 }}>
          {([1, 2, 3, 4] as Level[]).map((i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                background: i <= strength ? color : 'var(--semi-color-fill-2)',
                transition: 'background 0.25s ease',
              }}
            />
          ))}
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color, minWidth: 28, textAlign: 'right' }}>
          {label}
        </span>
        {minLengthLabel !== null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
            {minLengthOk
              ? <CheckCircle size={11} style={{ flexShrink: 0, color: 'var(--semi-color-success)' }} />
              : <Circle size={11} style={{ flexShrink: 0, color: 'var(--semi-color-text-3)' }} />}
            <span style={{
              fontSize: 12,
              color: minLengthOk ? 'var(--semi-color-success)' : 'var(--semi-color-text-3)',
              transition: 'color 0.2s',
            }}>
              {minLengthLabel}
            </span>
          </div>
        )}
      </div>

      {/* 其他策略达标项（大写/特殊字符等），仍在下方 */}
      {policyChecks && policyChecks.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 14px', marginTop: 5 }}>
          {policyChecks.map(({ label: l, ok }) => (
            <div
              key={l}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 12,
                color: ok ? 'var(--semi-color-success)' : 'var(--semi-color-text-3)',
                transition: 'color 0.2s',
              }}
            >
              {ok
                ? <CheckCircle size={11} style={{ flexShrink: 0 }} />
                : <Circle size={11} style={{ flexShrink: 0 }} />}
              <span>{l}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
