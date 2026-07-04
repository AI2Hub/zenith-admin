import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface ServiceInfo {
  name: string;
  description: string;
  loadState: string;
  activeState: string;
  subState: string;
}

export async function isSystemdAvailable(): Promise<boolean> {
  try {
    await execFileAsync('systemctl', ['--version'], { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

export async function listServices(): Promise<ServiceInfo[]> {
  const { stdout } = await execFileAsync('systemctl', [
    'list-units', '--type=service', '--all', '--no-pager', '--plain', '--no-legend',
  ], { timeout: 15000 });

  return stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const parts = line.trim().split(/\s+/);
      return {
        name: (parts[0] ?? '').replace(/\.service$/, ''),
        loadState: parts[1] ?? '',
        activeState: parts[2] ?? '',
        subState: parts[3] ?? '',
        description: parts.slice(4).join(' '),
      };
    });
}

export type ServiceAction = 'start' | 'stop' | 'restart' | 'reload' | 'enable' | 'disable' | 'mask' | 'unmask';

export async function controlService(
  name: string,
  action: ServiceAction,
): Promise<void> {
  await execFileAsync('systemctl', [action, `${name}.service`], { timeout: 30000 });
}

/** 获取服务详情（systemctl show 选取关键字段） */
export async function getServiceDetail(name: string): Promise<Record<string, string>> {
  const props = [
    'Id', 'Description', 'LoadState', 'ActiveState', 'SubState', 'UnitFileState',
    'MainPID', 'ExecMainStartTimestamp', 'MemoryCurrent', 'CPUUsageNSec',
    'Restart', 'FragmentPath', 'TriggeredBy', 'Requires', 'WantedBy',
  ];
  try {
    const { stdout } = await execFileAsync('systemctl', [
      'show', `${name}.service`, '--no-pager', '-p', props.join(','),
    ], { timeout: 10000 });
    const detail: Record<string, string> = {};
    for (const line of stdout.trim().split('\n')) {
      const idx = line.indexOf('=');
      if (idx < 0) continue;
      detail[line.slice(0, idx)] = line.slice(idx + 1);
    }
    return detail;
  } catch {
    return {};
  }
}

export async function getServiceLogs(name: string, lines = 100): Promise<string> {
  try {
    const { stdout } = await execFileAsync('journalctl', [
      '-u', `${name}.service`, '-n', String(lines), '--no-pager', '--output=short-iso',
    ], { timeout: 10000 });
    return stdout;
  } catch {
    return '';
  }
}

/** 流式 journalctl -f（实时日志追踪） */
export function tailServiceLogs(name: string): { kill: () => void; lines: NodeJS.ReadableStream } {
  const proc = spawn('journalctl', [
    '-u', `${name}.service`, '-f', '--no-pager', '--output=short-iso',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  return {
    kill: () => { try { proc.kill('SIGTERM'); } catch { /* ignore */ } },
    lines: proc.stdout as NodeJS.ReadableStream,
  };
}
