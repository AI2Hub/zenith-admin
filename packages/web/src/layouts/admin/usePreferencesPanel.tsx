import { useCallback, useState } from 'react';
import { Toast } from '@douyinfe/semi-ui';
import { textMatches } from '@/utils/pinyin';
import { copyTextWithToast } from '@/utils/clipboard';
import { sanitizeImportedPreferences, type UserPreferences } from '@/hooks/usePreferences';

// 偏好设置面板：搜索过滤、分区标题、复制 / 导入偏好
export function usePreferencesPanel(
  preferences: UserPreferences,
  setPreferences: (prefs: Partial<UserPreferences>) => void,
) {
  const [prefsVisible, setPrefsVisible] = useState(false);
  const [prefsSearch, setPrefsSearch] = useState('');

  const matchesPref = useCallback((keywords: string[]): boolean => {
    if (!prefsSearch.trim()) return true;
    return keywords.some((kw) => textMatches(kw, prefsSearch));
  }, [prefsSearch]);

  // 偏好面板分区标题：搜索时隐藏（搜索结果为扁平列表）
  const prefSection = useCallback((label: string) => (
    prefsSearch.trim() ? null : <div className="prefs-section-title">{label}</div>
  ), [prefsSearch]);

  const handleCopyPreferences = useCallback(() => {
    void copyTextWithToast(JSON.stringify(preferences, null, 2), { success: '偏好设置已复制到剪贴板', error: '复制失败，请重试' });
  }, [preferences]);

  // ─── 导入偏好 ─────────────────────────────────────────────────────────────
  const [importPrefsVisible, setImportPrefsVisible] = useState(false);
  const [importPrefsText, setImportPrefsText] = useState('');
  const handleImportPreferences = useCallback(() => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(importPrefsText);
    } catch {
      Toast.error('JSON 解析失败，请检查格式');
      return;
    }
    const sanitized = sanitizeImportedPreferences(parsed);
    if (!sanitized) {
      Toast.error('未识别到有效的偏好设置字段');
      return;
    }
    setPreferences(sanitized);
    setImportPrefsVisible(false);
    setImportPrefsText('');
    Toast.success(`已导入 ${Object.keys(sanitized).length} 项设置`);
  }, [importPrefsText, setPreferences]);

  return {
    prefsVisible, setPrefsVisible,
    prefsSearch, setPrefsSearch,
    matchesPref, prefSection, handleCopyPreferences,
    importPrefsVisible, setImportPrefsVisible,
    importPrefsText, setImportPrefsText,
    handleImportPreferences,
  };
}
