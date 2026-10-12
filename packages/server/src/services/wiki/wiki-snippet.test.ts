import { describe, expect, it } from 'vitest';
import { extractSnippet } from './docs.service';

describe('extractSnippet（全文检索命中片段保真度）', () => {
  it('链接语法只保留 label，不残留 URL', () => {
    const snippet = extractSnippet('相关文档 [新员工入职指南](/wiki/docs?docId=1) 请查收', '入职');
    expect(snippet).toContain('新员工入职指南');
    expect(snippet).not.toContain('/wiki/docs?docId=');
  });

  it('图片语法只保留 alt', () => {
    const snippet = extractSnippet('见图 ![架构图](/files/1.png) 说明', '架构');
    expect(snippet).toContain('架构图');
    expect(snippet).not.toContain('/files/1.png');
  });

  it('保留 - 与 : 等标点（时间段与日期不断裂）', () => {
    expect(extractSnippet('标准工时为 9:00-18:00，午休 1.5 小时', '工时')).toContain('9:00-18:00');
    expect(extractSnippet('版本发布于 2026-10-12，请知悉', '发布')).toContain('2026-10-12');
  });

  it('去掉加粗等行内标记但保留文字', () => {
    const snippet = extractSnippet('**年假**：入职满一年 5 天', '入职');
    expect(snippet).toContain('年假');
    expect(snippet).not.toContain('**');
  });

  it('未命中时返回正文前 120 字符', () => {
    expect(extractSnippet('abcdef', 'xyz')).toBe('abcdef');
  });
});
