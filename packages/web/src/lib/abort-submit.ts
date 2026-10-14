/**
 * 提交中断标记。
 *
 * ## 为什么需要它
 * 弹窗提交必须靠 **抛出** 来中断：Semi 的 Modal 用 `onOk` 返回的 Promise 状态驱动确定按钮的
 * loading，`return` 会让弹窗停在原地且按钮一直转圈（详见 `useEditModal` 文件头契约 1）。
 *
 * `abortSubmit()` 抛出 `SubmitAborted`，`useGlobalErrorHandler` 按类型识别并忽略，
 * 不弹兜底 Toast、不上报错误监控；面向用户的提示由调用方负责。
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
 * 中断当前提交流程。
 *
 * 调用前请确保**已经给出面向用户的提示**（表单内联错误或 Toast）——本函数刻意不弹提示，
 * 以免与调用方自己的文案叠成两个。
 *
 * @param reason 仅用于调试，不会展示给用户
 */
export function abortSubmit(reason?: string): never {
  throw new SubmitAborted(reason);
}
