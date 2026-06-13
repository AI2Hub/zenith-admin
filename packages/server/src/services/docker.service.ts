import Dockerode from 'dockerode';

let _docker: Dockerode | null = null;

function getDocker(): Dockerode {
  if (!_docker) {
    _docker = new Dockerode();
  }
  return _docker;
}

export interface ContainerInfo {
  id: string;
  shortId: string;
  names: string[];
  image: string;
  imageId: string;
  command: string;
  created: number;
  state: string;
  status: string;
  ports: Array<{ privatePort: number; publicPort: number | undefined; type: string }>;
}

export async function listContainers(): Promise<ContainerInfo[]> {
  const docker = getDocker();
  const containers = await docker.listContainers({ all: true });
  return containers.map((c) => ({
    id: c.Id,
    shortId: c.Id.slice(0, 12),
    names: c.Names.map((n) => n.replace(/^\//, '')),
    image: c.Image,
    imageId: c.ImageID.replace('sha256:', '').slice(0, 12),
    command: c.Command,
    created: c.Created,
    state: c.State,
    status: c.Status,
    ports: (c.Ports ?? []).map((p) => ({
      privatePort: p.PrivatePort,
      publicPort: p.PublicPort,
      type: p.Type,
    })),
  }));
}

export async function startContainer(id: string): Promise<void> {
  const container = getDocker().getContainer(id);
  await container.start();
}

export async function stopContainer(id: string): Promise<void> {
  const container = getDocker().getContainer(id);
  await container.stop({ t: 10 });
}

export async function restartContainer(id: string): Promise<void> {
  const container = getDocker().getContainer(id);
  await container.restart({ t: 10 });
}

export async function getContainerLogs(id: string, tail = 200): Promise<string> {
  const container = getDocker().getContainer(id);
  const stream = await container.logs({ stdout: true, stderr: true, tail, timestamps: false });
  // dockerode 返回 Buffer，去除 Docker 多路复用头（每条消息前 8 字节是头）
  return demuxDockerStream(stream as unknown as Buffer);
}

/** 去除 Docker 多路复用流的 8 字节头（stdin=0, stdout=1, stderr=2） */
function demuxDockerStream(buf: Buffer): string {
  let offset = 0;
  const chunks: string[] = [];
  while (offset + 8 <= buf.length) {
    const size = buf.readUInt32BE(offset + 4);
    const text = buf.subarray(offset + 8, offset + 8 + size).toString('utf8');
    chunks.push(text);
    offset += 8 + size;
  }
  return chunks.join('');
}

export async function getContainerStats(id: string): Promise<{ cpuPercent: number; memUsage: number; memLimit: number }> {
  const container = getDocker().getContainer(id);
  const stats = await container.stats({ stream: false }) as {
    cpu_stats: { cpu_usage: { total_usage: number }; system_cpu_usage: number; online_cpus?: number };
    precpu_stats: { cpu_usage: { total_usage: number }; system_cpu_usage: number };
    memory_stats: { usage: number; limit: number };
  };
  const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
  const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
  const numCpus = stats.cpu_stats.online_cpus ?? 1;
  const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * numCpus * 100 : 0;
  return {
    cpuPercent: Math.round(cpuPercent * 100) / 100,
    memUsage: stats.memory_stats.usage,
    memLimit: stats.memory_stats.limit,
  };
}
