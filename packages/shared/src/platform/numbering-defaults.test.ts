import { describe, expect, it } from 'vitest';
import { numberingDefaultContract, numberingRuleContract } from './contracts/numbering';
import { resetNumberingDefaultSchema, updateNumberingDefaultSchema } from './numbering-validation';

describe('业务类型默认编号契约', () => {
  it('固定按业务类型路径更新，必须携带自己的预期版本且拒绝owner和字段映射', () => {
    expect(numberingDefaultContract.update.fullPath).toBe('/api/numbering-defaults/{scene}');
    const input = { ruleId: 7, versionId: 19, expectedVersionId: null };
    expect(updateNumberingDefaultSchema.parse(input)).toEqual(input);
    expect(updateNumberingDefaultSchema.safeParse({ ruleId: 7, versionId: 19 }).success).toBe(false);
    expect(updateNumberingDefaultSchema.safeParse({ ...input, ownerKey: '5' }).success).toBe(false);
    expect(updateNumberingDefaultSchema.safeParse({ ...input, parameterMapping: { categoryCode: 'formData.category' } }).success).toBe(false);
  });
  it('恢复默认同样要求乐观版本，使用位置归属于规则的只读查询', () => {
    expect(numberingDefaultContract.reset.method).toBe('delete');
    expect(resetNumberingDefaultSchema.parse({ expectedVersionId: 19 })).toEqual({ expectedVersionId: 19 });
    expect(resetNumberingDefaultSchema.safeParse({}).success).toBe(false);
    expect(numberingRuleContract.usages.fullPath).toBe('/api/numbering-rules/{id}/usages');
    expect(numberingRuleContract.usages.method).toBe('get');
  });
});
