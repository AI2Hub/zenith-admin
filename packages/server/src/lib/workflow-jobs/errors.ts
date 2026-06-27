/**
 * 作业 handler 的控制流异常。
 * 与普通 Error 区分：用于让 handler 精确表达"无需重试"或"立即死信"的语义。
 */

/** 工作已被其它路径完成 / 目标已不在可处理状态 —— 按成功收敛，不重试、不进死信 */
export class WorkflowJobSkip extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowJobSkip';
  }
}

/** 永久失败（配置缺失、非法状态等）—— 直接进死信，重试无意义 */
export class WorkflowJobPermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowJobPermanentError';
  }
}
