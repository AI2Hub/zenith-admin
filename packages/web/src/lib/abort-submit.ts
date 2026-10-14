/**
 * 提交中断标记：Semi Modal 的按钮 loading 由 `onOk` 的 Promise 驱动，
 * 校验失败须抛出而非 return（见 `useEditModal` 契约 1）。
 * `abortSubmit()` 抛出此类型，全局错误处理会忽略，不弹兜底 Toast、不上报；调用方先提示用户。
 *
 * @example
 * ```ts
 * beforeSave: (values) => {
 *   if (!contentHtml) {
 *     Toast.warning('请输入公告内容');  // 面向用户的提示由调用方负责
 *     abortSubmit();                    // 中断提交，不弹兜底 Toast、不上报
 *   }
 *   return { ...values, content: contentHtml };
 * }
 * ```
 */
export class SubmitAborted extends Error {
  constructor(reason = 'validation') {
    super(reason);
    this.name = 'SubmitAborted';
  }
}

/**
 * 中断当前提交；调用方须先给出表单错误或 Toast，本函数不重复提示。
 *
 * @param reason 仅用于调试，不会展示给用户
 */
export function abortSubmit(reason?: string): never {
  throw new SubmitAborted(reason);
}
