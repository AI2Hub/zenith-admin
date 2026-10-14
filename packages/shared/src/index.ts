/**
 * 根入口仅供枚举导出的元编程场景；业务代码须使用 `@zenith/shared/{域}` 子路径，
 * 避免将无关领域拉入依赖图（server / web 由 ESLint 约束）。
 * 本入口不覆盖所有域，跨域契约校验应基于装配后的 OpenAPI，见 server/src/app.contract.test.ts。
 * 种子数据只供 db/seed.ts 与 MSW mock 使用，经 `@zenith/shared/seed` 单独导出。
 */
export * from './ai';
export * from './analytics';
export * from './biz';
export * from './chat';
export * from './cms';
export * from './core';
export * from './identity';
export * from './member';
export * from './messaging';
export * from './mp';
export * from './open-platform';
export * from './ops';
export * from './payment';
export * from './platform';
export * from './report';
export * from './rules';
export * from './tasks';
export * from './workflow';
