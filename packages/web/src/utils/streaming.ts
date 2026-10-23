/**
 * 流式响应读取：配合 `request.fetchRaw()` 返回的原生 Response 使用。
 * 中断由 fetch 的 AbortSignal 负责，读取过程中的 AbortError 原样抛出，调用方按需忽略。
 */
import { request } from '@/utils/request';

export interface SseEvent {
  /** `event:` 字段，未声明时为空串 */
  readonly event: string;
  /** `data:` 字段；多行 data 按 SSE 规范以 `\n` 拼接 */
  readonly data: string;
  /** 不透明的续传游标；未声明时 undefined，空串表示清除游标。 */
  readonly id?: string;
}

/** 逐块读取文本流（tail -f、ping 等纯文本输出），每次读到的片段原样回调 */
export async function readTextStream(res: Response, onChunk: (text: string) => void): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk(decoder.decode(value, { stream: true }));
  }
}

/** 带鉴权拉取纯文本流并逐块回调；非 2xx 时把状态码写入输出，认证失效由 request 层处理 */
export async function streamText(url: string, onChunk: (text: string) => void, signal: AbortSignal): Promise<void> {
  const res = await request.fetchRaw(url, { signal, silent: true });
  if (!res) return;
  if (!res.ok) {
    onChunk(`\nHTTP ${res.status}\n`);
    return;
  }
  await readTextStream(res, onChunk);
}

function parseSseFrame(frame: string): SseEvent | null {
  let event = '';
  let id: string | undefined;
  const data: string[] = [];
  for (const rawLine of frame.split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    else if (line === 'id') id = '';
    else if (line.startsWith('id:')) {
      const value = line.slice(3).replace(/^ /, '');
      if (!value.includes('\0')) id = value;
    }
  }
  if (data.length === 0) return null;
  return id === undefined ? { event, data: data.join('\n') } : { event, data: data.join('\n'), id };
}

/**
 * 读取 SSE 流：按空行切帧，解析 `event:` / `data:` 字段。
 * 每次网络分块中解析出的完整帧以数组形式一次回调，便于高频推送场景合并一次状态更新。
 */
export async function readSseStream(res: Response, onEvents: (events: SseEvent[]) => void): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() ?? '';
    const events: SseEvent[] = [];
    for (const frame of frames) {
      const parsed = parseSseFrame(frame);
      if (parsed) events.push(parsed);
    }
    if (events.length > 0) onEvents(events);
  }
}
