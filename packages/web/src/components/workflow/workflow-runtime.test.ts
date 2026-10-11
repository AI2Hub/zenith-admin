/**
 * 任务状态展示口径单测：抄送任务送达即完成，引擎以 skipped 落库，
 * 展示层必须显示「已抄送」而不是「已跳过」（后者会被读成任务作废）。
 */
import { describe, expect, it } from 'vitest';
import { taskStatusDisplay } from './workflow-runtime';

describe('taskStatusDisplay', () => {
  it('抄送任务显示已抄送', () => {
    expect(taskStatusDisplay({ status: 'skipped', nodeType: 'ccNode' })).toEqual({ text: '已抄送', color: 'green' });
    expect(taskStatusDisplay({ status: 'approved', nodeType: 'ccNode' })).toEqual({ text: '已抄送', color: 'green' });
  });

  it('非抄送任务保持原有状态文案', () => {
    expect(taskStatusDisplay({ status: 'skipped', nodeType: 'approve' }).text).toBe('已跳过');
    expect(taskStatusDisplay({ status: 'pending', nodeType: 'approve' }).text).toBe('待审批');
    expect(taskStatusDisplay({ status: 'waiting', nodeType: 'handler' }).text).toBe('等待中');
  });

  it('未知状态回退为原始值且不抛错', () => {
    expect(taskStatusDisplay({ status: 'unknown', nodeType: null })).toEqual({ text: 'unknown', color: 'grey' });
    expect(taskStatusDisplay({}).text).toBe('');
  });
});
