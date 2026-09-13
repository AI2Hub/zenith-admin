import * as z from 'zod';
import { queryBool } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { DOCKER_FILE_ENTRY_TYPES } from '../constants';
import { dockerCreateNetworkSchema, dockerCreateVolumeSchema, dockerPullImageSchema } from '../validation';

// ─── 实体 ────────────────────────────────────────────────────────────────────

export const dockerPortBindingSchema = z.object({
  privatePort: z.number(),
  publicPort: z.number().optional(),
  type: z.string(),
}).meta({ id: 'DockerPortBinding' });

export type DockerPortBinding = z.infer<typeof dockerPortBindingSchema>;

export const dockerContainerSchema = z.object({
  id: z.string(),
  shortId: z.string(),
  names: z.array(z.string()),
  image: z.string(),
  imageId: z.string(),
  command: z.string(),
  created: z.number().meta({ description: '创建时间（Unix 秒）' }),
  state: z.string(),
  status: z.string(),
  ports: z.array(dockerPortBindingSchema),
  composeProject: z.string().nullable().meta({ description: 'Docker Compose project label' }),
  composeService: z.string().nullable().meta({ description: 'Docker Compose service label' }),
}).meta({ id: 'DockerContainer' });

export type DockerContainer = z.infer<typeof dockerContainerSchema>;

export const dockerContainerStatsSchema = z.object({
  cpuPercent: z.number(),
  memUsage: z.number(),
  memLimit: z.number(),
}).meta({ id: 'DockerContainerStats' });

export type DockerContainerStats = z.infer<typeof dockerContainerStatsSchema>;

export const dockerImageSchema = z.object({
  id: z.string(),
  shortId: z.string(),
  repoTags: z.array(z.string()),
  size: z.number(),
  created: z.number().meta({ description: '创建时间（Unix 秒）' }),
  containers: z.number(),
}).meta({ id: 'DockerImage' });

export type DockerImage = z.infer<typeof dockerImageSchema>;

export const dockerNetworkSchema = z.object({
  id: z.string(),
  name: z.string(),
  driver: z.string(),
  scope: z.string(),
  ipam: z.object({ driver: z.string(), subnet: z.string().optional(), gateway: z.string().optional() }),
  internal: z.boolean(),
  created: z.string(),
  containers: z.number(),
}).meta({ id: 'DockerNetwork' });

export type DockerNetwork = z.infer<typeof dockerNetworkSchema>;

export const dockerVolumeSchema = z.object({
  name: z.string(),
  driver: z.string(),
  mountpoint: z.string(),
  scope: z.string(),
  created: z.string(),
  labels: z.record(z.string(), z.string()),
}).meta({ id: 'DockerVolume' });

export type DockerVolume = z.infer<typeof dockerVolumeSchema>;

export const dockerFileEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  type: z.enum(DOCKER_FILE_ENTRY_TYPES),
  size: z.number(),
}).meta({ id: 'DockerFileEntry' });

export type DockerFileEntry = z.infer<typeof dockerFileEntrySchema>;

export const dockerPruneResultSchema = z.object({
  containersDeleted: z.number().optional(),
  imagesDeleted: z.number().optional(),
  networksDeleted: z.number().optional(),
  volumesDeleted: z.number().optional(),
  spaceReclaimed: z.number().optional(),
}).meta({ id: 'DockerPruneResult' });

export type DockerPruneResult = z.infer<typeof dockerPruneResultSchema>;

// ─── 入参 ────────────────────────────────────────────────────────────────────

export const dockerContainerIdParam = z.object({
  id: z.string().min(1).meta({ description: '容器 ID 或名称' }),
});

export const dockerImageIdParam = z.object({
  id: z.string().min(1).meta({ description: '镜像 ID' }),
});

export const dockerNetworkIdParam = z.object({
  id: z.string().min(1).meta({ description: '网络 ID' }),
});

export const dockerVolumeNameParam = z.object({
  name: z.string().min(1).meta({ description: '存储卷名称' }),
});

export const dockerContainerLogsQuery = z.object({
  tail: z.coerce.number().int().min(10).max(5000).default(200).meta({ description: '返回末尾行数' }),
});

export const dockerContainerFilesQuery = z.object({
  path: z.string().optional().meta({ description: '容器内目录，缺省为根目录' }),
});

export const dockerContainerFileContentQuery = z.object({
  path: z.string().meta({ description: '容器内文件路径' }),
});

export const dockerPruneImagesQuery = z.object({
  all: queryBool('true 清理全部未使用镜像；缺省仅清理悬空镜像'),
});

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const dockerContract = defineContract('/api/docker', {
  containers: op.get('/', { access: { permission: 'system:docker:view' }, response: z.array(dockerContainerSchema), summary: '容器列表' }),
  start: op.post('/{id}/start', { access: { permission: 'system:docker:manage' }, audit: '启动 Docker 容器', params: dockerContainerIdParam, summary: '启动容器' }),
  stop: op.post('/{id}/stop', { access: { permission: 'system:docker:manage' }, audit: '停止 Docker 容器', params: dockerContainerIdParam, summary: '停止容器' }),
  restart: op.post('/{id}/restart', { access: { permission: 'system:docker:manage' }, audit: '重启 Docker 容器', params: dockerContainerIdParam, summary: '重启容器' }),
  logs: op.get('/{id}/logs', { access: { permission: 'system:docker:view' }, params: dockerContainerIdParam, query: dockerContainerLogsQuery, response: z.object({ logs: z.string() }), summary: '获取容器日志' }),
  stats: op.get('/{id}/stats', { access: { permission: 'system:docker:view' }, params: dockerContainerIdParam, response: dockerContainerStatsSchema, summary: '获取容器资源占用' }),
  inspect: op.get('/{id}/inspect', { access: { permission: 'system:docker:view' }, params: dockerContainerIdParam, response: z.record(z.string(), z.unknown()).meta({ description: 'docker inspect 原始结构' }), summary: '容器详情（docker inspect）' }),
  images: op.get('/images', { access: { permission: 'system:docker:view' }, response: z.array(dockerImageSchema), summary: '镜像列表' }),
  removeImage: op.delete('/images/{id}', { access: { permission: 'system:docker:manage' }, audit: '删除 Docker 镜像', params: dockerImageIdParam, summary: '删除镜像' }),
  pullImage: op.post('/images/pull', { access: { permission: 'system:docker:manage' }, audit: '拉取 Docker 镜像', body: dockerPullImageSchema, summary: '拉取镜像' }),
  networks: op.get('/networks', { access: { permission: 'system:docker:view' }, response: z.array(dockerNetworkSchema), summary: '网络列表' }),
  removeNetwork: op.delete('/networks/{id}', { access: { permission: 'system:docker:manage' }, audit: '删除 Docker 网络', params: dockerNetworkIdParam, summary: '删除网络' }),
  createNetwork: op.post('/networks', { access: { permission: 'system:docker:manage' }, audit: '创建 Docker 网络', body: dockerCreateNetworkSchema, summary: '创建网络' }),
  volumes: op.get('/volumes', { access: { permission: 'system:docker:view' }, response: z.array(dockerVolumeSchema), summary: '存储卷列表' }),
  removeVolume: op.delete('/volumes/{name}', { access: { permission: 'system:docker:manage' }, audit: '删除 Docker 存储卷', params: dockerVolumeNameParam, summary: '删除存储卷' }),
  createVolume: op.post('/volumes', { access: { permission: 'system:docker:manage' }, audit: '创建 Docker 存储卷', body: dockerCreateVolumeSchema, summary: '创建存储卷' }),
  containerFiles: op.get('/{id}/files', { access: { permission: 'system:docker:view' }, params: dockerContainerIdParam, query: dockerContainerFilesQuery, response: z.array(dockerFileEntrySchema), summary: '列出容器内目录' }),
  containerFileContent: op.get('/{id}/files/content', { access: { permission: 'system:docker:view' }, params: dockerContainerIdParam, query: dockerContainerFileContentQuery, response: z.object({ content: z.string() }), summary: '读取容器内文件' }),
  pruneContainers: op.post('/prune/containers', { access: { permission: 'system:docker:manage' }, audit: '清理已停止 Docker 容器', response: dockerPruneResultSchema, summary: '清理已停止容器' }),
  pruneImages: op.post('/prune/images', { access: { permission: 'system:docker:manage' }, audit: '清理 Docker 镜像', query: dockerPruneImagesQuery, response: dockerPruneResultSchema, summary: '清理镜像（悬空 / 全部未用）' }),
  pruneNetworks: op.post('/prune/networks', { access: { permission: 'system:docker:manage' }, audit: '清理 Docker 网络', response: dockerPruneResultSchema, summary: '清理未使用网络' }),
  pruneVolumes: op.post('/prune/volumes', { access: { permission: 'system:docker:manage' }, audit: '清理 Docker 存储卷', response: dockerPruneResultSchema, summary: '清理未使用存储卷' }),
  pruneSystem: op.post('/prune/system', { access: { permission: 'system:docker:manage' }, audit: 'Docker 系统清理', response: dockerPruneResultSchema, summary: '系统清理（容器 + 悬空镜像 + 网络）' }),
}, { auditModule: '系统运维', tags: ['Docker'] });
