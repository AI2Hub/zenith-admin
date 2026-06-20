import { http, HttpResponse } from 'msw';

interface PortEntry {
  protocol: string;
  localAddress: string;
  localPort: number;
  state: string;
  pid: number | null;
  processName: string | null;
  serviceName: string | null;
}

const mockPorts: PortEntry[] = [
  { protocol: 'tcp', localAddress: '0.0.0.0', localPort: 80, state: 'LISTEN', pid: 1280, processName: 'nginx', serviceName: 'http' },
  { protocol: 'tcp', localAddress: '0.0.0.0', localPort: 443, state: 'LISTEN', pid: 1280, processName: 'nginx', serviceName: 'https' },
  { protocol: 'tcp', localAddress: '127.0.0.1', localPort: 5432, state: 'LISTEN', pid: 980, processName: 'postgres', serviceName: 'postgresql' },
  { protocol: 'tcp', localAddress: '127.0.0.1', localPort: 6379, state: 'LISTEN', pid: 1024, processName: 'redis-server', serviceName: 'redis' },
  { protocol: 'tcp', localAddress: '0.0.0.0', localPort: 3000, state: 'LISTEN', pid: 4521, processName: 'node', serviceName: null },
  { protocol: 'tcp', localAddress: '::', localPort: 22, state: 'LISTEN', pid: 712, processName: 'sshd', serviceName: 'ssh' },
  { protocol: 'udp', localAddress: '0.0.0.0', localPort: 53, state: '', pid: 640, processName: 'systemd-resolve', serviceName: 'domain' },
  { protocol: 'tcp', localAddress: '0.0.0.0', localPort: 9000, state: 'LISTEN', pid: 5210, processName: 'minio', serviceName: null },
];

export const portsHandlers = [
  http.get('/api/ports', () => HttpResponse.json({ code: 0, message: 'ok', data: mockPorts })),

  http.delete('/api/ports/:pid', ({ params }) => {
    const pid = Number(params.pid);
    const idx = mockPorts.findIndex((p) => p.pid === pid);
    if (idx !== -1) mockPorts.splice(idx, 1);
    return HttpResponse.json({ code: 0, message: '进程已结束', data: null });
  }),
];
