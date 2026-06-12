import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { Button, Toast, Spin, Typography } from '@douyinfe/semi-ui';
import { Save } from 'lucide-react';
import type { editor } from 'monaco-editor';
import { request } from '@/utils/request';
import { useThemeController } from '@/providers/theme-controller';
import { useTerminalPreferences } from './useTerminalPreferences';
import { resolveTheme, toMonacoTheme, monacoThemeName } from './themes';

interface EditorTabProps {
  readonly filePath: string;
  readonly active: boolean;
  readonly onDirtyChange?: (dirty: boolean) => void;
}

interface FileContent {
  path: string;
  content: string;
  size: number;
}

const LANGUAGE_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  json: 'json', html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less',
  md: 'markdown', markdown: 'markdown', py: 'python', go: 'go', rs: 'rust', java: 'java',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp', cs: 'csharp', php: 'php', rb: 'ruby',
  sh: 'shell', bash: 'shell', zsh: 'shell', yml: 'yaml', yaml: 'yaml', xml: 'xml', sql: 'sql',
  toml: 'ini', ini: 'ini', conf: 'ini', env: 'ini', vue: 'html', svelte: 'html',
};

function detectLanguage(filePath: string): string {
  const name = (filePath.split(/[\\/]/).pop() ?? '').toLowerCase();
  if (name === 'dockerfile') return 'dockerfile';
  if (name === 'makefile') return 'plaintext';
  const ext = name.includes('.') ? name.split('.').pop() ?? '' : '';
  return LANGUAGE_MAP[ext] ?? 'plaintext';
}

export default function EditorTab({ filePath, active, onDirtyChange }: EditorTabProps) {
  const { isDark } = useThemeController();
  const { terminal } = useTerminalPreferences();

  const theme = useMemo(
    () => resolveTheme(isDark ? terminal.themeDark : terminal.themeLight, isDark ? 'dark' : 'light'),
    [isDark, terminal.themeDark, terminal.themeLight],
  );
  const themeName = monacoThemeName(theme);

  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const savedRef = useRef('');
  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;

  // 加载文件内容（仅依赖 filePath）
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    request
      .get<FileContent>(`/api/terminal-files/content?path=${encodeURIComponent(filePath)}`)
      .then((res) => {
        if (cancelled) return;
        const text = res.code === 0 && res.data ? res.data.content : '';
        savedRef.current = text;
        setContent(text);
        setDirty(false);
        onDirtyChangeRef.current?.(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filePath]);

  // 注册并应用自定义主题（与终端配色一致）
  useEffect(() => {
    const m = monacoRef.current;
    if (!m) return;
    m.editor.defineTheme(themeName, toMonacoTheme(theme));
    m.editor.setTheme(themeName);
  }, [theme, themeName]);

  // tab 激活时重新布局
  useEffect(() => {
    if (active) {
      const t = setTimeout(() => editorRef.current?.layout(), 50);
      return () => clearTimeout(t);
    }
  }, [active]);

  const handleSave = useCallback(async () => {
    const ed = editorRef.current;
    if (!ed) return;
    const value = ed.getValue();
    setSaving(true);
    const res = await request.put<FileContent>('/api/terminal-files/content', { path: filePath, content: value });
    setSaving(false);
    if (res.code === 0) {
      savedRef.current = value;
      setDirty(false);
      onDirtyChangeRef.current?.(false);
      Toast.success('已保存');
    }
  }, [filePath]);
  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  const handleMount: OnMount = (ed, monaco) => {
    editorRef.current = ed;
    monacoRef.current = monaco;
    monaco.editor.defineTheme(themeName, toMonacoTheme(theme));
    monaco.editor.setTheme(themeName);
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      void handleSaveRef.current();
    });
  };

  const handleChange = (v: string | undefined) => {
    const d = (v ?? '') !== savedRef.current;
    if (d !== dirty) {
      setDirty(d);
      onDirtyChangeRef.current?.(d);
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 8px',
          borderBottom: '1px solid var(--semi-color-border)',
          flexShrink: 0,
        }}
      >
        <Typography.Text size="small" type="tertiary" ellipsis={{ showTooltip: true }} style={{ flex: 1 }}>
          {filePath}
          {dirty ? ' ●' : ''}
        </Typography.Text>
        <Button
          size="small"
          theme="solid"
          type="primary"
          icon={<Save size={13} />}
          loading={saving}
          disabled={!dirty}
          onClick={() => void handleSave()}
        >
          保存
        </Button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {loading ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spin />
          </div>
        ) : (
          <Editor
            height="100%"
            language={detectLanguage(filePath)}
            theme={themeName}
            defaultValue={content ?? ''}
            onChange={handleChange}
            onMount={handleMount}
            options={{
              fontSize: terminal.fontSize,
              fontFamily: terminal.fontFamily,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
            }}
          />
        )}
      </div>
    </div>
  );
}
