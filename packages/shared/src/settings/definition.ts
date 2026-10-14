import * as z from 'zod';
import { isPlainObject } from '../core/json';
import { SETTINGS_MODULES, type SettingsModuleKey } from './registry';

export const settingsFieldDescriptorSchema = z.object({
  path: z.string(),
  title: z.string(),
  type: z.string(),
  description: z.string().optional(),
  enumValues: z.array(z.unknown()).optional(),
}).meta({ id: 'SettingsFieldDescriptor' });
export type SettingsFieldDescriptor = z.infer<typeof settingsFieldDescriptorSchema>;

/** 随版本保存校验定义与展示元数据；默认值也是定义的一部分。 */
export function getSettingsDefinition(module: SettingsModuleKey): Record<string, unknown> {
  return z.toJSONSchema(SETTINGS_MODULES[module].schema);
}

/** 从历史定义读取叶子描述，不依赖当前注册表中是否仍存在该字段。 */
export function describeSettingsDefinition(definition: Record<string, unknown>): SettingsFieldDescriptor[] {
  const fields: SettingsFieldDescriptor[] = [];
  const dereference = (schema: Record<string, unknown>): Record<string, unknown> => {
    if (typeof schema.$ref !== 'string' || !schema.$ref.startsWith('#/')) return schema;
    let target: unknown = definition;
    for (const part of schema.$ref.slice(2).split('/')) {
      target = isPlainObject(target) ? target[part.replaceAll('~1', '/').replaceAll('~0', '~')] : undefined;
    }
    return isPlainObject(target) ? { ...target, ...schema } : schema;
  };
  const walk = (input: Record<string, unknown>, prefix: string, parents: string[]) => {
    const schema = dereference(input);
    if (!isPlainObject(schema.properties)) return;
    for (const [key, value] of Object.entries(schema.properties)) {
      if (!isPlainObject(value)) continue;
      const field = dereference(value);
      const path = prefix ? `${prefix}.${key}` : key;
      const title = typeof field.title === 'string' ? field.title : key;
      if (isPlainObject(field.properties)) walk(field, path, [...parents, title]);
      else {
        const types = Array.isArray(field.type) ? field.type.filter((type) => type !== 'null') : [field.type];
        fields.push({
          path,
          title: [...parents, title].join(' / '),
          type: Array.isArray(field.enum) ? 'enum' : typeof types[0] === 'string' ? types[0] : 'unknown',
          ...(typeof field.description === 'string' ? { description: field.description } : {}),
          ...(Array.isArray(field.enum) ? { enumValues: field.enum } : {}),
        });
      }
    }
  };
  walk(definition, '', []);
  return fields;
}

export function describeSettingsFields(module: SettingsModuleKey): SettingsFieldDescriptor[] {
  return describeSettingsDefinition(getSettingsDefinition(module));
}
