/**
 * 剪贴板统一入口。
 *
 * `navigator.clipboard` 只在安全上下文（HTTPS / localhost）存在，内网以 `http://ip` 访问时为 undefined；
 * 写文本可以回退到隐藏 textarea + `document.execCommand('copy')`（需处于用户手势内，复制按钮天然满足），
 * 读文本 / 写图片则没有回退手段，调用方需按结果降级。
 *
 * 不做成 `navigator.clipboard` 的 polyfill：残缺对象会误导第三方库（如 @univerjs/ui 以
 * `navigator.clipboard.readText` 是否存在决定走 Clipboard API 还是自身兼容路径）。
 */
import { Toast } from '@douyinfe/semi-ui';

function copyViaExecCommand(text: string): boolean {
  const active = document.activeElement as HTMLElement | null;
  const selection = document.getSelection();
  const originalRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.readOnly = true; // 避免移动端弹出键盘
  textarea.setAttribute('aria-hidden', 'true');
  Object.assign(textarea.style, { position: 'fixed', top: '0', left: '0', opacity: '0', pointerEvents: 'none' });
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, text.length);
  try {
    return document.execCommand('copy');
  } finally {
    // 还原用户原有的选区与焦点（如终端 / 表格里先选中再点右键复制）
    textarea.remove();
    if (originalRange && selection) {
      selection.removeAllRanges();
      selection.addRange(originalRange);
    }
    active?.focus?.();
  }
}

/** 复制文本到剪贴板：优先 Clipboard API，不可用或失败时回退 execCommand；返回是否成功 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard) {
    try {
      // eslint-disable-next-line no-restricted-syntax -- 唯一允许直接调用 Clipboard API 的位置
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 权限被拒 / 文档失焦等，落到回退路径
    }
  }
  try {
    return copyViaExecCommand(text);
  } catch {
    return false;
  }
}

export interface CopyFeedback {
  /** 成功提示，默认「已复制」 */
  success?: string;
  /** 失败提示，默认「复制失败，请手动复制」 */
  error?: string;
}

export async function copyTextWithToast(text: string, feedback: CopyFeedback = {}): Promise<boolean> {
  const ok = await copyText(text);
  if (ok) Toast.success(feedback.success ?? '已复制');
  else Toast.error(feedback.error ?? '复制失败，请手动复制');
  return ok;
}

/** 读取剪贴板文本；Clipboard API 不可用（非安全上下文）或被拒绝时返回 null，调用方提示改用 Ctrl+V */
export async function readClipboardText(): Promise<string | null> {
  if (!navigator.clipboard) return null;
  try {
    // eslint-disable-next-line no-restricted-syntax -- 唯一允许直接调用 Clipboard API 的位置
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}

/** 是否能写入富内容（图片 / 文件）：需 Clipboard API 与 ClipboardItem，非安全上下文为 false，调用方自行降级 */
export function canWriteClipboardItems(): boolean {
  return typeof ClipboardItem !== 'undefined' && typeof navigator.clipboard?.write === 'function';
}
