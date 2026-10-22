import { describe, expect, it } from 'vitest';
import { preferenceSearchMatches } from './preference-search';

describe('preferenceSearchMatches', () => {
  it('整词查询命中偏好目录里的名称，而不只是手写关键词', () => {
    expect(preferenceSearchMatches(['多选框', '布局'], '多选框布局', 'multiSelectLayout')).toBe(true);
    expect(preferenceSearchMatches(['文件视图'], '文件列表默认视图', 'filesViewMode')).toBe(true);
    expect(preferenceSearchMatches(['表格', '列设置'], '显示表格列设置按钮', 'showTableColumnSettings')).toBe(true);
  });

  it('不会因为查询里包含别的行关键词而误命中', () => {
    // 旧实现用「查询包含关键词」兜底时，这个查询会同时命中导航布局
    expect(preferenceSearchMatches(['导航布局', '布局'], '多选框布局', 'navLayout')).toBe(false);
  });

  it('忽略空白，支持选项名与拆分后的多词查询', () => {
    expect(preferenceSearchMatches(['Logo'], '显示Logo图标', 'showLogo')).toBe(true);
    expect(preferenceSearchMatches([], '自动换行', 'multiSelectLayout')).toBe(true);
    expect(preferenceSearchMatches(['多选框', '布局'], '多选框 布局', 'multiSelectLayout')).toBe(true);
    expect(preferenceSearchMatches(['多选框', '布局'], '多选框 不存在', 'multiSelectLayout')).toBe(false);
  });

  it('一组控件可以共用多个 path', () => {
    const tablePaths = ['tableBordered', 'tableStriped', 'tableSize', 'tablePageSize', 'showTableColumnSettings'] as const;
    expect(preferenceSearchMatches([], '启用表格斑马纹', tablePaths)).toBe(true);
    expect(preferenceSearchMatches([], '显示表格边框', tablePaths)).toBe(true);
  });

  it('保留手写别名，空查询始终命中', () => {
    expect(preferenceSearchMatches(['keepalive'], 'keepalive')).toBe(true);
    expect(preferenceSearchMatches([], '   ', 'multiSelectLayout')).toBe(true);
    expect(preferenceSearchMatches([], '不存在的偏好', 'multiSelectLayout')).toBe(false);
  });
});
