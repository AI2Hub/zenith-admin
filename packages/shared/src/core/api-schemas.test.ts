import { describe, it, expect, expectTypeOf } from 'vitest';
import * as z from 'zod';
import { dateRangeBound, dateRangeQuery, entityStatusQuery, idQuery, keywordQuery, paginated, paginationQuery, queryBool, queryEnum } from './api-schemas';
import { filterMetaMap, filterMetaOf } from './filter-meta';

describe('queryBool', () => {
  const schema = z.object({ enabled: queryBool() });

  it('parses the accepted string spellings and treats the empty string as absent', () => {
    expect(schema.parse({ enabled: 'true' })).toEqual({ enabled: true });
    expect(schema.parse({ enabled: '0' })).toEqual({ enabled: false });
    expect(schema.parse({ enabled: '' })).toEqual({ enabled: undefined });
    expect(schema.parse({})).toEqual({});
    expect(schema.safeParse({ enabled: 'maybe' }).success).toBe(false);
  });
});

describe('queryEnum', () => {
  const STATUSES = ['enabled', 'disabled'] as const;
  const schema = z.object({ status: queryEnum(STATUSES, '状态') });

  it('accepts listed values, maps the empty string to undefined and rejects others', () => {
    expect(schema.parse({ status: 'enabled' })).toEqual({ status: 'enabled' });
    expect(schema.parse({ status: '' })).toEqual({ status: undefined });
    expect(schema.parse({})).toEqual({});
    expect(schema.safeParse({ status: 'archived' }).success).toBe(false);
    expectTypeOf<z.output<typeof schema>['status']>().toEqualTypeOf<'enabled' | 'disabled' | undefined>();
  });

  it('documents the value set in OpenAPI metadata', () => {
    expect(queryEnum(STATUSES, '状态').meta()).toMatchObject({ type: 'string', enum: ['enabled', 'disabled'], description: '状态' });
  });

  it('records the label source as x-filter metadata', () => {
    expect(filterMetaOf(queryEnum(STATUSES, '状态'))).toEqual({ kind: 'enum', values: ['enabled', 'disabled'] });
    expect(filterMetaOf(queryEnum(STATUSES, { description: '状态', dict: 'common_status' }))).toEqual({ kind: 'enum', values: ['enabled', 'disabled'], dict: 'common_status' });
    const options = [{ value: 'enabled', label: '启用' }, { value: 'disabled', label: '禁用' }];
    expect(filterMetaOf(queryEnum(STATUSES, { options }))).toEqual({ kind: 'enum', values: ['enabled', 'disabled'], options });
    expect(queryEnum(STATUSES, { description: '状态' }).meta()?.description).toBe('状态');
  });

  it('entityStatusQuery is the shared enabled / disabled filter with empty string meaning "all"', () => {
    const schema = z.object({ status: entityStatusQuery });
    expect(schema.parse({ status: 'disabled' })).toEqual({ status: 'disabled' });
    expect(schema.parse({ status: '' })).toEqual({ status: undefined });
    expect(schema.safeParse({ status: 'archived' }).success).toBe(false);
    expect(filterMetaOf(entityStatusQuery)).toEqual({ kind: 'enum', values: ['enabled', 'disabled'], dict: 'common_status' });
    expectTypeOf<z.output<typeof schema>['status']>().toEqualTypeOf<'enabled' | 'disabled' | undefined>();
  });
});

describe('paginationQuery / dateRangeBound', () => {
  it('applies pagination defaults and accepts both date formats', () => {
    expect(paginationQuery.parse({})).toEqual({ page: 1, pageSize: 10 });
    const range = z.object({ startTime: dateRangeBound('起点') });
    expect(range.parse({ startTime: '2026-09-01' })).toEqual({ startTime: '2026-09-01' });
    expect(range.parse({ startTime: '2026-09-01 08:00:00' })).toEqual({ startTime: '2026-09-01 08:00:00' });
    expect(range.safeParse({ startTime: 'yesterday' }).success).toBe(false);
  });

  it('dateRangeQuery 展开为标准 startTime / endTime 端点，描述随 subject 生成', () => {
    const query = paginationQuery.extend({ ...dateRangeQuery('创建时间') });
    expect(query.parse({ startTime: '2026-09-01', endTime: '2026-09-30 23:59:59' })).toEqual({ page: 1, pageSize: 10, startTime: '2026-09-01', endTime: '2026-09-30 23:59:59' });
    expect(query.safeParse({ endTime: 'tomorrow' }).success).toBe(false);
    expect(query.shape.startTime.meta()?.description).toBe('创建时间起');
    expect(query.shape.endTime.meta()?.description).toBe('创建时间止');
    expect(filterMetaOf(query.shape.startTime)).toEqual({ kind: 'date-bound', bound: 'start' });
    expect(filterMetaOf(query.shape.endTime)).toEqual({ kind: 'date-bound', bound: 'end' });
    const generic = dateRangeQuery();
    expect(generic.startTime.meta()?.description).toBe('起始时间');
    expect(generic.endTime.meta()?.description).toBe('结束时间');
    expect(filterMetaOf(dateRangeBound('自定义止', 'end'))).toEqual({ kind: 'date-bound', bound: 'end' });
  });

  it('idQuery：查询串关联 ID 可选、字符串 coerce 为正整数，非法值 400', () => {
    const query = z.object({ channelId: idQuery('栏目'), taskId: idQuery() });
    expect(query.parse({})).toEqual({});
    expect(query.parse({ channelId: '12', taskId: 3 })).toEqual({ channelId: 12, taskId: 3 });
    expect(query.safeParse({ channelId: '0' }).success).toBe(false);
    expect(query.safeParse({ taskId: 'abc' }).success).toBe(false);
    expect(query.shape.channelId.meta()?.description).toBe('栏目');
    expect(query.shape.taskId.meta()?.description).toBeUndefined();
    expect(filterMetaOf(query.shape.taskId)).toEqual({ kind: 'id' });
  });

  it('keywordQuery：可选字符串原样通过，描述与匹配字段由 fields 派生', () => {
    const query = z.object({ keyword: keywordQuery('名称 / 编码'), q: keywordQuery(), special: keywordQuery('昵称', { description: '按昵称匹配；纯数字按 ID 精确匹配' }) });
    expect(query.parse({})).toEqual({});
    expect(query.parse({ keyword: ' abc ', q: '' })).toEqual({ keyword: ' abc ', q: '' });
    expect(query.safeParse({ keyword: 12 }).success).toBe(false);
    expect(query.shape.keyword.meta()?.description).toBe('按名称 / 编码模糊匹配');
    expect(query.shape.q.meta()?.description).toBe('关键字模糊匹配');
    expect(query.shape.special.meta()?.description).toBe('按昵称匹配；纯数字按 ID 精确匹配');
    expect(filterMetaOf(query.shape.keyword)).toEqual({ kind: 'keyword', fields: '名称 / 编码' });
    expect(filterMetaOf(query.shape.q)).toEqual({ kind: 'keyword' });
    expect(filterMetaOf(query.shape.special)).toEqual({ kind: 'keyword', fields: '昵称' });
    expectTypeOf<z.output<typeof query>['keyword']>().toEqualTypeOf<string | undefined>();
  });

  it('queryBool 与 filterMetaMap：整份查询 schema 的筛选语义可一次读出', () => {
    const query = paginationQuery.extend({ keyword: keywordQuery('名称'), enabled: queryBool('是否启用'), status: entityStatusQuery, ...dateRangeQuery('创建时间'), plain: z.string().optional() });
    expect(filterMetaOf(query.shape.enabled)).toEqual({ kind: 'bool' });
    expect(filterMetaMap(query)).toEqual({
      keyword: { kind: 'keyword', fields: '名称' },
      enabled: { kind: 'bool' },
      status: { kind: 'enum', values: ['enabled', 'disabled'], dict: 'common_status' },
      startTime: { kind: 'date-bound', bound: 'start' },
      endTime: { kind: 'date-bound', bound: 'end' },
    });
    expect(filterMetaOf(query.shape.plain)).toBeUndefined();
    expect(filterMetaOf(query.shape.page)).toBeUndefined();
  });

  it('filterMetaOf 沿包装层向内查找：外层 .optional() / .default() 不吞掉积木上的语义', () => {
    const inner = keywordQuery('名称');
    expect(filterMetaOf(z.optional(inner))).toEqual({ kind: 'keyword', fields: '名称' });
    expect(filterMetaOf(inner.default('x'))).toEqual({ kind: 'keyword', fields: '名称' });
    expect(filterMetaOf(inner.meta({ description: '外层覆盖了 description' }))).toEqual({ kind: 'keyword', fields: '名称' });
  });

  it('wraps items into the paginated payload shape', () => {
    const page = paginated(z.object({ id: z.int() }));
    expect(page.parse({ list: [{ id: 1 }], total: 1, page: 1, pageSize: 10 })).toEqual({ list: [{ id: 1 }], total: 1, page: 1, pageSize: 10 });
  });
});
