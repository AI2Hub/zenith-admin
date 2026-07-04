import { describe, expect, it } from 'vitest';
import { ApiError, LOOKUP_STALE_TIME, toQueryString, unwrap } from './query';

describe('unwrap', () => {
  it('code 为 0 时返回 data', () => {
    expect(unwrap({ code: 0, message: 'success', data: { id: 1 } })).toEqual({ id: 1 });
  });

  it('data 为 null 时原样返回', () => {
    expect(unwrap({ code: 0, message: 'success', data: null })).toBeNull();
  });

  it('code 非 0 时抛出 ApiError（携带 code 与 message）', () => {
    try {
      unwrap({ code: 400, message: '参数错误', data: null });
      expect.unreachable('应当抛出 ApiError');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).code).toBe(400);
      expect((err as ApiError).message).toBe('参数错误');
      expect((err as ApiError).name).toBe('ApiError');
    }
  });

  it('message 为空时生成默认错误信息', () => {
    expect(() => unwrap({ code: 500, message: '', data: null })).toThrowError('请求失败（code=500）');
  });
});

describe('toQueryString', () => {
  it('拼接普通参数并带 ? 前缀', () => {
    expect(toQueryString({ page: 1, pageSize: 10 })).toBe('?page=1&pageSize=10');
  });

  it('过滤 undefined / null / 空字符串', () => {
    expect(toQueryString({ page: 1, keyword: '', status: undefined, type: null })).toBe('?page=1');
  });

  it('全部参数为空时返回空字符串', () => {
    expect(toQueryString({ keyword: '', status: undefined })).toBe('');
  });

  it('对特殊字符进行 URL 编码', () => {
    expect(toQueryString({ keyword: '张三&李四' })).toBe(`?keyword=${encodeURIComponent('张三&李四').replaceAll('%20', '+')}`);
  });

  it('boolean 与 number 转为字符串', () => {
    expect(toQueryString({ enabled: true, count: 0 })).toBe('?enabled=true&count=0');
  });
});

describe('LOOKUP_STALE_TIME', () => {
  it('为 5 分钟', () => {
    expect(LOOKUP_STALE_TIME).toBe(5 * 60 * 1000);
  });
});
