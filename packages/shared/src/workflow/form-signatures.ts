import { signatureInputSchema, signatureSnapshotSchema, type SignatureInput, type SignaturePolicy, type SignatureSnapshot } from '../core/signatures';
import type { WorkflowFormField } from './types';

type Values = Record<string, unknown>;
const record = (value: unknown): Values => value && typeof value === 'object' && !Array.isArray(value) ? value as Values : {};
export class WorkflowFormSignatureError extends Error {}

function sameSignatureSnapshot(value: unknown, previous: SignatureSnapshot): boolean {
  const parsed = signatureSnapshotSchema.safeParse(value);
  return parsed.success && (Object.keys(previous) as Array<keyof SignatureSnapshot>).every((key) => parsed.data[key] === previous[key]);
}

/** 布局与明细中的签名统一遍历；同路径已有证据可保留，其余输入交由宿主验证身份并签署。 */
export async function mapWorkflowFormSignatures(
  fields: WorkflowFormField[], values: Values, previous: Values,
  resolveSignature: (input: SignatureInput, policy: SignaturePolicy) => SignatureSnapshot | Promise<SignatureSnapshot>,
): Promise<Values> {
  async function walk(fields: WorkflowFormField[], source: Values, prior: Values): Promise<Values> {
    let out = { ...source };
    for (const field of fields) {
      if (field.type === 'row') {
        for (const column of field.columns ?? []) out = await walk(column.fields, out, prior);
      } else if (field.type === 'tabs' || field.type === 'steps') {
        for (const pane of field.panes ?? []) out = await walk(pane.fields, out, prior);
      } else if (field.type === 'group') {
        out = await walk(field.children ?? [], out, prior);
      } else if (field.type === 'detail' && Array.isArray(out[field.key])) {
        const rows = out[field.key] as unknown[];
        const oldRows = Array.isArray(prior[field.key]) ? prior[field.key] as unknown[] : [];
        out[field.key] = await Promise.all(rows.map((row, index) => walk(field.children ?? [], record(row), record(oldRows[index]))));
      } else if (field.type === 'signature' && Object.hasOwn(out, field.key)) {
        const value = out[field.key];
        if (value == null || value === '') { out[field.key] = null; continue; }
        const saved = signatureSnapshotSchema.safeParse(prior[field.key]);
        if (saved.success && sameSignatureSnapshot(value, saved.data)) {
          if (field.signaturePolicy === 'handwritten' && saved.data.source !== 'drawn') {
            throw new WorkflowFormSignatureError(`「${field.label}」要求手写，请重新签署`);
          }
          out[field.key] = saved.data;
          continue;
        }
        const input = signatureInputSchema.safeParse(value);
        if (!input.success) throw new WorkflowFormSignatureError(`请重新签署「${field.label}」，不能提交或修改签署凭据`);
        out[field.key] = await resolveSignature(input.data, field.signaturePolicy ?? 'reusable');
      }
    }
    return out;
  }
  return walk(fields, values, previous);
}

/** 新申请不可沿用另一实例的签署证据；保留业务资料并递归清空签名。 */
export function clearWorkflowFormSignaturesData(fields: WorkflowFormField[], values: Values): Values {
  function clear(fields: WorkflowFormField[], source: Values): Values {
    let out = { ...source };
    for (const field of fields) {
      if (field.type === 'signature') delete out[field.key];
      else if (field.type === 'row') for (const column of field.columns ?? []) out = clear(column.fields, out);
      else if (field.type === 'tabs' || field.type === 'steps') for (const pane of field.panes ?? []) out = clear(pane.fields, out);
      else if (field.type === 'group') out = clear(field.children ?? [], out);
      else if (field.type === 'detail' && Array.isArray(out[field.key])) out[field.key] = (out[field.key] as unknown[]).map((row) => clear(field.children ?? [], record(row)));
    }
    return out;
  }
  return clear(fields, values);
}
