import { describe, expect, it, vi } from 'vitest';
import { readSseStream } from './streaming';

vi.mock('@/utils/request', () => ({ request: {} }));

describe('readSseStream', () => {
  it('跨网络分块保留中文、多行正文与不透明 id，并兼容无 id 的日志帧', async () => {
    const bytes = new TextEncoder().encode('id: role/file:42\r\nevent: log\r\ndata: 中文输出\r\ndata: 第二行\r\n\r\nevent: log\ndata: legacy\n\n');
    const stream = new ReadableStream({
      start(controller) {
        for (let index = 0; index < bytes.length; index += 2) controller.enqueue(bytes.slice(index, index + 2));
        controller.close();
      },
    });
    const events: unknown[] = [];
    await readSseStream(new Response(stream), (batch) => events.push(...batch));
    expect(events).toEqual([
      { event: 'log', data: '中文输出\n第二行', id: 'role/file:42' },
      { event: 'log', data: 'legacy' },
    ]);
  });

  it('忽略注释、半帧及包含空字符的 id，空 id 可清除续传游标', async () => {
    const frames = ': heartbeat\n\nid: invalid\0cursor\nevent: log\ndata: first\n\nid:\nevent: log\ndata:\n\nevent: log\ndata: incomplete';
    const events: unknown[] = [];
    await readSseStream(new Response(frames), (batch) => events.push(...batch));
    expect(events).toEqual([{ event: 'log', data: 'first' }, { event: 'log', data: '', id: '' }]);
  });
});
