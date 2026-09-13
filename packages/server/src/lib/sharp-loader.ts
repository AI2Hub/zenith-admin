import { createRequire } from 'node:module';

/**
 * `sharp` 的惰性加载入口：含原生二进制、模块图大，只在首次处理图片时加载。
 * 以 CJS `require` 取其 default 导出（可直接调用），类型对应 d.mts 的 default。
 * 图片处理相关的服务一律从这里取，不要各自 `createRequire` 再 require('sharp')。
 */
const require = createRequire(import.meta.url);

type Sharp = typeof import('sharp')['default'];

export const sharp: Sharp = ((...args: Parameters<Sharp>) => (require('sharp') as unknown as Sharp)(...args)) as Sharp;
