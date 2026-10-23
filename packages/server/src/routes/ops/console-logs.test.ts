import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../middleware/guard', () => ({
  guard: () => async (_c: unknown, next: () => Promise<void>) => { await next(); },
}));
vi.mock('../../middleware/auth', () => ({ authMiddleware: async (_c: unknown, next: () => Promise<void>) => { await next(); } }));
vi.mock('../../middleware/platform-admin', () => ({ platformAdminOnly: () => async (_c: unknown, next: () => Promise<void>) => { await next(); } }));

const service = vi.hoisted(() => ({
  getConsoleLogSources: vi.fn(async () => ({ currentRole: 'api', hostname: 'local', pid: 12, sources: [{ role: 'api', label: 'API', available: true }] })),
  readConsoleLogLines: vi.fn(async () => ['application output']),
  tailConsoleLogLines: vi.fn(async (
    _query: unknown, _signal: AbortSignal,
    emit: (record: { line: string; id: string }) => Promise<void>, _cursor?: string,
  ) => { await emit({ line: '应用日志', id: 'resume-position' }); }),
}));
vi.mock('../../services/ops/console-logs.service', () => service);

const { default: router } = await import('./console-logs');

beforeEach(() => { vi.clearAllMocks(); });

describe('应用日志 API', () => {
  it('读取接口采用应用日志来源与统一行协议', async () => {
    const response = await router.request('/content?role=worker&lines=30&keyword=task&context=2');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { lines: ['application output'] } });
    expect(service.readConsoleLogLines).toHaveBeenCalledWith(expect.objectContaining({ role: 'worker', lines: 30, keyword: 'task', context: 2 }));
  });

  it.each(['/content?role=nginx', '/content?lines=5001', '/tail?role=../../secret'])('拒绝无效来源和超限读取：%s', async (url) => {
    const response = await router.request(url);
    expect(response.status).toBe(400);
    expect(service.readConsoleLogLines).not.toHaveBeenCalled();
    expect(service.tailConsoleLogLines).not.toHaveBeenCalled();
  });

  it('SSE 将续传位置传给服务并输出完整日志帧', async () => {
    const response = await router.request('/tail?role=api', { headers: { 'Last-Event-ID': 'previous-position' } });
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const body = await response.text();
    expect(body).toContain('event: log');
    expect(body).toContain('id: resume-position');
    expect(body).toContain('data: 应用日志');
    expect(service.tailConsoleLogLines).toHaveBeenCalledWith({ role: 'api' }, expect.any(AbortSignal), expect.any(Function), 'previous-position');
  });

  it('超长续传头按契约拒绝，不打开日志读取', async () => {
    const response = await router.request('/tail', { headers: { 'Last-Event-ID': 'x'.repeat(2049) } });
    expect(response.status).toBe(400);
    expect(service.tailConsoleLogLines).not.toHaveBeenCalled();
  });

  it('读取失败发送受控错误帧，不暴露服务端绝对路径', async () => {
    service.tailConsoleLogLines.mockRejectedValueOnce(new Error('EACCES C:/private/logs/app.log'));
    const response = await router.request('/tail');
    const body = await response.text();
    expect(body).toContain('event: error');
    expect(body).toContain('无法读取后端运行日志');
    expect(body).not.toContain('C:/private');
  });

  it('Request 中止会终止追踪和响应流，即使客户端未继续读取', async () => {
    let connected!: () => void;
    const ready = new Promise<void>((resolve) => { connected = resolve; });
    let streamSignal: AbortSignal | undefined;
    service.tailConsoleLogLines.mockImplementationOnce(async (_query, signal, emit) => {
      streamSignal = signal;
      connected();
      await emit({ line: 'one', id: 'one' });
      if (!signal.aborted) await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
    });
    const controller = new AbortController();
    const response = await router.request('/tail', { signal: controller.signal });
    await ready;
    controller.abort();
    expect(streamSignal?.aborted).toBe(true);
    await expect(response.text()).resolves.toBeTypeOf('string');
  });
});
