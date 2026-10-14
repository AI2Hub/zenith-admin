/**
 * 各域在 routes/<domain>/index.ts 用 defineRouteDomain 声明挂载清单，
 * routes/index.ts 声明域顺序。
 *
 * 1. mounts 的数组顺序即挂载顺序；同一路径多次挂载时顺序影响匹配语义，须保持。
 * 2. 全局兜底（如 CMS SSR 的 `/`）必须放进 fallback，放在 mounts 末尾只能保证域内靠后。
 * 3. app.contract.test.ts 快照检测端点及路径变更，但按 method + path 排序去重，
 *    不验证挂载顺序；调整顺序须人工核对约束 1 的匹配结果。
 */
import type { Hono } from 'hono';
import { isLicenseFeatureKey, type LicenseFeatureKey } from '@zenith/shared/licensing';

/**
 * 可挂载的子路由器。
 *
 * 各域子路由器的泛型槽互不相同（`OpenAPIHono` / 裸 `Hono` / 带 Variables 的变体），
 * 放进同一个数组需要存在类型（existential type），TypeScript 无此能力。
 * `app.route()` 本身是泛型方法，对实参的泛型不作约束，故此处在泛型槽放宽为 any——
 * 仅影响这一处类型标注，运行时与各路由文件内部的类型安全均不受影响。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MountableRouter = Hono<any, any, any>;

/** 一条挂载：[挂载路径, 子路由器, 可选挂载配置] */
export type Mount = readonly [path: string, router: MountableRouter, options?: MountOptions];

export type MountOptions =
  | { feature: LicenseFeatureKey; licenseExempt?: never }
  | { licenseExempt: string; feature?: never };

/** 每个域必须明确默认授权分类；公开入口的例外必须在挂载上注明原因。 */
export type RouteLicensePolicy =
  | { feature: LicenseFeatureKey; core?: never }
  | { core: string; feature?: never };

export interface RouteDomain {
  /** 域名，用于日志与按域裁剪装载 */
  name: string;
  /** 新挂载继承此分类，避免新增 API 忘记接入 License 门控。 */
  licensing: RouteLicensePolicy;
  /** 常规挂载，按数组顺序注册 */
  mounts: () => Mount[];
  /** 兜底挂载，在**全部**域的 mounts 与文档路由之后注册 */
  fallback?: () => Mount[];
}

export function defineRouteDomain(domain: RouteDomain): RouteDomain {
  const policy = domain.licensing;
  if (!policy || (policy.feature === undefined && !policy.core?.trim())) {
    throw new Error(`路由域「${domain.name}」必须声明 License 功能或核心能力原因`);
  }
  if (policy.feature !== undefined && (!isLicenseFeatureKey(policy.feature) || policy.core !== undefined)) {
    throw new Error(`路由域「${domain.name}」的 License 分类无效：${policy.feature}`);
  }

  const classify = (mounts: Mount[], fallback = false): Mount[] => mounts.map(([path, router, options]) => {
    if (options?.licenseExempt !== undefined) {
      if (!options.licenseExempt.trim() || options.feature !== undefined) {
        throw new Error(`路由挂载「${domain.name}:${path}」必须提供明确且独立的 License 豁免原因`);
      }
      return [path, router, options];
    }
    if (options?.feature !== undefined && !isLicenseFeatureKey(options.feature)) {
      throw new Error(`路由挂载「${domain.name}:${path}」的 License 功能未登记：${options.feature}`);
    }
    if (fallback && (options?.feature || policy.feature)) {
      throw new Error(`兜底挂载「${domain.name}:${path}」必须明确声明 License 豁免原因`);
    }
    const feature = options?.feature ?? policy.feature;
    return feature ? [path, router, { feature }] : [path, router];
  });

  return {
    ...domain,
    mounts: () => classify(domain.mounts()),
    ...(domain.fallback ? { fallback: () => classify(domain.fallback!(), true) } : {}),
  };
}
