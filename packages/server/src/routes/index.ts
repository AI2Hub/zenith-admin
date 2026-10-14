/**
 * 路由域注册表——数组顺序即挂载顺序。
 *
 * 域顺序**不在**
 * app.contract.test.ts 的路由表快照锁定范围内（快照按 method + path 排序去重），
 * 调整顺序前请自行确认不会造成路径遮蔽。
 */
import ops from './ops';
import identity from './identity';
import member from './member';
import platform from './platform';
import files from './files';
import tasks from './tasks';
import analytics from './analytics';
import report from './report';
import messaging from './messaging';
import payment from './payment';
import openPlatform from './open-platform';
import workflow from './workflow';
import chat from './chat';
import mp from './mp';
import bizDemo from './biz-demo';
import ai from './ai';
import shortLink from './short-link';
import marketing from './marketing';
import iot from './iot';
import cms from './cms';
import wiki from './wiki';
import drive from './drive';

export const ROUTE_DOMAINS = [
  ops,
  identity,
  member,
  platform,
  files,
  tasks,
  analytics,
  report,
  messaging,
  payment,
  openPlatform,
  workflow,
  chat,
  mp,
  bizDemo,
  ai,
  shortLink,
  marketing,
  iot,
  cms,
  wiki,
  drive,
] as const;
