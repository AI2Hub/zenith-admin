import { defineContract, op } from '../../core/contract';
import { submitTaskDemoSchema } from '../validation';
import { asyncTaskSchema } from './async-tasks';

/** 业务示例：演示任务提交；进度 / 明细 / 取消等复用任务中心契约 */
export const taskDemoContract = defineContract('/api/task-demo', {
  submit: op.post('/submit', { access: { permission: 'biz:task-demo:submit' }, audit: '提交演示异步任务', body: submitTaskDemoSchema, response: asyncTaskSchema, summary: '提交演示异步任务' }),
}, { auditModule: '业务示例', tags: ['TaskDemo'] });
