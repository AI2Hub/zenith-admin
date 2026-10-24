/**
 * 顶栏按钮显隐（偏好设置「导航与工具栏」）：全局搜索与主题切换默认显示，
 * 关闭后分别写入 showMenuSearch / showThemeToggle。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PreferencesContext } from '@/hooks/usePreferences';
import { createPreferencesContext } from '@/test-utils/preferences';
import { PrefsNavToolbarSection } from './PreferencesSections';

function renderNav(overrides: Parameters<typeof createPreferencesContext>[0] = {}) {
  const base = createPreferencesContext(overrides);
  const setPreferences = vi.fn();
  render(
    <PreferencesContext.Provider value={{ ...base, setPreferences }}>
      <PrefsNavToolbarSection
        prefSection={(label) => <span>{label}</span>}
        matchesPref={() => true}
        preferences={base.preferences}
        setPreferences={setPreferences}
        prefsSearch=""
        quickChatEnabled={false}
      />
    </PreferencesContext.Provider>,
  );
  const rowSwitch = (label: string) => {
    const control = screen.getByText(label).closest('.preference-control');
    const toggle = control?.querySelector('.semi-switch');
    if (!toggle) throw new Error(`未找到「${label}」开关`);
    return toggle as HTMLElement;
  };
  // Semi 把交互挂在内部原生控件上，直接点根节点不会触发 onChange
  const clickSwitch = (label: string) => {
    const native = rowSwitch(label).querySelector('.semi-switch-native-control');
    if (!native) throw new Error(`未找到「${label}」开关控件`);
    fireEvent.click(native);
  };
  return { rowSwitch, clickSwitch, setPreferences };
}

describe('顶栏按钮显隐偏好', () => {
  it('全局搜索与主题切换默认开启，关闭时写入对应偏好', () => {
    const { rowSwitch, clickSwitch, setPreferences } = renderNav();

    expect(rowSwitch('显示全局搜索').className).toContain('semi-switch-checked');
    expect(rowSwitch('显示主题切换').className).toContain('semi-switch-checked');

    clickSwitch('显示全局搜索');
    expect(setPreferences).toHaveBeenCalledWith({ showMenuSearch: false });

    clickSwitch('显示主题切换');
    expect(setPreferences).toHaveBeenCalledWith({ showThemeToggle: false });
  });

  it('已有个人选择时按当前值呈现开关状态', () => {
    const { rowSwitch } = renderNav({ showThemeToggle: false, showMenuSearch: false });

    expect(rowSwitch('显示全局搜索').className).not.toContain('semi-switch-checked');
    expect(rowSwitch('显示主题切换').className).not.toContain('semi-switch-checked');
  });
});
