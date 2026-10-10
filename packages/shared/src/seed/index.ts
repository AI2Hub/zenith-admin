/**
 * 种子数据聚合入口 —— 仅供 db/seed.ts 与 MSW mock 使用。
 * 业务代码请勿引用：域 index 刻意不导出 seed，避免种子数据进入生产依赖图。
 */
export * from './menus';
export * from './ai';
export * from './analytics';
export * from './app-releases';
export * from './cms';
export * from './identity';
export * from './iot';
export * from './member';
export * from './marketing';
export * from './messaging';
export * from './mp';
export * from './open-platform';
export * from './payment';
export * from './platform';
export * from './numbering';
export * from './report';
export * from './rules';
export * from './short-link';
export * from './wiki';
export * from './workflow';
