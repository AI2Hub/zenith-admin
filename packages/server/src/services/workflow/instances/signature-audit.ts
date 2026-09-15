/** 签名图片只进入业务快照；审计保留签署元信息，不复制 PNG 内容。 */
export function redactWorkflowSignatureImages<T>(value: T): T {
  if (typeof value === 'string' && value.startsWith('data:image/png;base64,')) return '[签名图片已隐藏]' as T;
  if (Array.isArray(value)) return value.map(redactWorkflowSignatureImages) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactWorkflowSignatureImages(item)])) as T;
  }
  return value;
}
