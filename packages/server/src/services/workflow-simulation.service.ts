/**
 * 流程仿真服务：复用真实 DAG 引擎做 dry-run，不落库、不外呼、不创建真实实例。
 */
import { and, eq, inArray } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { db } from '../db';
import { users, workflowDefinitions } from '../db/schema';
import { currentUser } from '../lib/context';
import { advanceFlow, getInitialTasks, validateFlowData, type AdvanceResult, type TaskAction } from '../lib/workflow-engine';
import { tenantCondition } from '../lib/tenant';
import { buildStarterContext, resolveAdminUserId, resolveAssigneeIds } from './workflow-assignee-resolver.service';
import type {
  SimulateWorkflowInput,
  WorkflowFlowData,
  WorkflowNodeConfig,
  WorkflowSimulationEdgeResult,
  WorkflowSimulationNodeState,
  WorkflowSimulationResult,
  WorkflowSimulationTimelineItem,
} from '@zenith/shared';

type SimulatedRuntimeStatus = 'pending' | 'waiting' | 'approved' | 'rejected' | 'skipped';

interface SimulatedTask {
  nodeKey: string;
  nodeName: string;
  nodeType: WorkflowNodeConfig['type'];
  assigneeId: number | null;
  status: SimulatedRuntimeStatus;
  nodeConfig: WorkflowNodeConfig;
  reason?: string;
}

interface SimulationContext {
  flowData: WorkflowFlowData;
  formData: Record<string, unknown>;
  initiatorId: number;
  maxSteps: number;
  timeline: WorkflowSimulationTimelineItem[];
  nodeStates: Record<string, WorkflowSimulationNodeState>;
  completedKeys: Set<string>;
  pendingTasks: SimulatedTask[];
  warnings: string[];
  visitedNodeKeys: Set<string>;
}

const BLOCKING_NODE_TYPES = new Set<WorkflowNodeConfig['type']>(['delay', 'trigger', 'subProcess']);

function isWorkflowFlowData(value: unknown): value is WorkflowFlowData {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<WorkflowFlowData>;
  return Array.isArray(data.nodes) && Array.isArray(data.edges);
}

async function resolveFlowData(input: SimulateWorkflowInput): Promise<WorkflowFlowData> {
  if (input.flowData) {
    if (!isWorkflowFlowData(input.flowData)) {
      throw new HTTPException(400, { message: '流程数据格式错误' });
    }
    return input.flowData;
  }

  const definitionId = input.definitionId;
  if (!definitionId) {
    throw new HTTPException(400, { message: '请选择流程定义或传入流程数据' });
  }
  const user = currentUser();
  const tc = tenantCondition(workflowDefinitions, user);
  const conds = [eq(workflowDefinitions.id, definitionId)];
  if (tc) conds.push(tc);
  const [def] = await db.select().from(workflowDefinitions).where(and(...conds)).limit(1);
  if (!def) throw new HTTPException(404, { message: '流程定义不存在' });
  const flowData = def.flowData as WorkflowFlowData | null;
  if (!flowData?.nodes?.length) throw new HTTPException(400, { message: '流程未配置，无法仿真' });
  return flowData;
}

async function resolveUserNames(ids: number[]): Promise<Map<number, string>> {
  const uniqueIds = [...new Set(ids)].filter((id) => Number.isInteger(id) && id > 0);
  const nameMap = new Map<number, string>();
  if (uniqueIds.length === 0) return nameMap;
  const rows = await db.select({ id: users.id, nickname: users.nickname, username: users.username })
    .from(users)
    .where(inArray(users.id, uniqueIds));
  for (const row of rows) {
    nameMap.set(row.id, row.nickname ?? row.username);
  }
  return nameMap;
}

function appendTimeline(
  ctx: SimulationContext,
  item: Omit<WorkflowSimulationTimelineItem, 'step'>,
): void {
  ctx.timeline.push({ step: ctx.timeline.length + 1, ...item });
}

function markNode(
  ctx: SimulationContext,
  nodeKey: string,
  state: WorkflowSimulationNodeState,
): void {
  ctx.nodeStates[nodeKey] = state;
}

async function expandTaskAction(
  task: TaskAction,
  ctx: SimulationContext,
): Promise<SimulatedTask[]> {
  if (task.autoStatus) {
    return [{
      nodeKey: task.nodeKey,
      nodeName: task.nodeName,
      nodeType: task.nodeType,
      assigneeId: null,
      status: task.autoStatus,
      nodeConfig: task.nodeConfig,
      reason: task.autoStatus === 'approved' ? '节点配置为自动通过' : '节点配置为自动拒绝',
    }];
  }

  if (task.nodeType === 'delay') {
    return [{
      nodeKey: task.nodeKey,
      nodeName: task.nodeName,
      nodeType: task.nodeType,
      assigneeId: null,
      status: 'waiting',
      nodeConfig: task.nodeConfig,
      reason: '延迟器在仿真中按模拟等待处理',
    }];
  }

  if (task.nodeType === 'trigger') {
    const triggerType = task.nodeConfig.triggerConfig?.triggerType ?? 'webhook';
    return [{
      nodeKey: task.nodeKey,
      nodeName: task.nodeName,
      nodeType: task.nodeType,
      assigneeId: null,
      status: 'waiting',
      nodeConfig: task.nodeConfig,
      reason: `触发器(${triggerType})在仿真中不发起外呼`,
    }];
  }

  if (task.nodeType === 'subProcess') {
    return [{
      nodeKey: task.nodeKey,
      nodeName: task.nodeName,
      nodeType: task.nodeType,
      assigneeId: null,
      status: 'waiting',
      nodeConfig: task.nodeConfig,
      reason: '子流程在仿真中不创建真实子实例',
    }];
  }

  if (task.nodeType === 'ccNode') {
    const assigneeIds = await resolveAssigneeIds(task.nodeConfig, {
      initiatorId: ctx.initiatorId,
      formData: ctx.formData,
    });
    return assigneeIds.map((id) => ({
      nodeKey: task.nodeKey,
      nodeName: task.nodeName,
      nodeType: task.nodeType,
      assigneeId: id,
      status: 'skipped',
      nodeConfig: task.nodeConfig,
      reason: '抄送节点不阻塞流程',
    }));
  }

  if (task.nodeType !== 'approve' && task.nodeType !== 'handler') {
    return [{
      nodeKey: task.nodeKey,
      nodeName: task.nodeName,
      nodeType: task.nodeType,
      assigneeId: task.assigneeId,
      status: 'approved',
      nodeConfig: task.nodeConfig,
    }];
  }

  const assigneeIds = await resolveAssigneeIds(task.nodeConfig, {
    initiatorId: ctx.initiatorId,
    formData: ctx.formData,
  });
  if (assigneeIds.length > 0) {
    return assigneeIds.map((id) => ({
      nodeKey: task.nodeKey,
      nodeName: task.nodeName,
      nodeType: task.nodeType,
      assigneeId: id,
      status: 'pending',
      nodeConfig: task.nodeConfig,
    }));
  }

  const emptyStrategy = task.nodeConfig.emptyStrategy ?? 'autoApprove';
  const emptyAssignToIds = task.nodeConfig.emptyAssignToIds?.length
    ? task.nodeConfig.emptyAssignToIds
    : (task.nodeConfig.emptyAssignTo ? [task.nodeConfig.emptyAssignTo] : []);
  if (emptyStrategy === 'assignTo' && emptyAssignToIds.length > 0) {
    return emptyAssignToIds.map((id) => ({
      nodeKey: task.nodeKey,
      nodeName: task.nodeName,
      nodeType: task.nodeType,
      assigneeId: id,
      status: 'pending',
      nodeConfig: task.nodeConfig,
      reason: '审批人为空，按配置转交指定人员',
    }));
  }
  if (emptyStrategy === 'assignToAdmin') {
    const adminId = await resolveAdminUserId();
    if (adminId) {
      return [{
        nodeKey: task.nodeKey,
        nodeName: task.nodeName,
        nodeType: task.nodeType,
        assigneeId: adminId,
        status: 'pending',
        nodeConfig: task.nodeConfig,
        reason: '审批人为空，按配置转交管理员',
      }];
    }
    return [{
      nodeKey: task.nodeKey,
      nodeName: task.nodeName,
      nodeType: task.nodeType,
      assigneeId: null,
      status: 'rejected',
      nodeConfig: task.nodeConfig,
      reason: '审批人为空且未找到管理员，仿真按拒绝处理',
    }];
  }
  if (emptyStrategy === 'reject') {
    return [{
      nodeKey: task.nodeKey,
      nodeName: task.nodeName,
      nodeType: task.nodeType,
      assigneeId: null,
      status: 'rejected',
      nodeConfig: task.nodeConfig,
      reason: '审批人为空，按配置自动拒绝',
    }];
  }
  return [{
    nodeKey: task.nodeKey,
    nodeName: task.nodeName,
    nodeType: task.nodeType,
    assigneeId: null,
    status: 'approved',
    nodeConfig: task.nodeConfig,
    reason: '审批人为空，按配置自动通过',
  }];
}

async function materializeResult(result: AdvanceResult, ctx: SimulationContext): Promise<void> {
  if (result.currentNodeKeys.length > 0) {
    for (const key of result.currentNodeKeys) markNode(ctx, key, { status: 'active' });
  }

  for (const taskAction of result.tasksToCreate) {
    const tasks = await expandTaskAction(taskAction, ctx);
    ctx.pendingTasks.push(...tasks);
    const hasRejected = tasks.some((task) => task.status === 'rejected');
    const hasWaiting = tasks.some((task) => task.status === 'waiting' || task.status === 'pending');
    if (hasRejected) {
      markNode(ctx, taskAction.nodeKey, { status: 'error', message: tasks.find((task) => task.status === 'rejected')?.reason });
    } else if (hasWaiting) {
      markNode(ctx, taskAction.nodeKey, { status: 'active', message: tasks[0]?.reason });
    } else {
      markNode(ctx, taskAction.nodeKey, { status: 'done', message: tasks[0]?.reason });
    }
  }
}

function getNodeByKey(flowData: WorkflowFlowData, nodeKey: string): WorkflowNodeConfig | null {
  return flowData.nodes.find((node) => node.data.key === nodeKey)?.data ?? null;
}

function buildEdgeResults(flowData: WorkflowFlowData, visitedNodeKeys: Set<string>): WorkflowSimulationEdgeResult[] {
  const nodeById = new Map(flowData.nodes.map((node) => [node.id, node.data]));
  return flowData.edges
    .filter((edge) => {
      const target = nodeById.get(edge.target);
      return !edge.isException && target?.type !== 'catchNode';
    })
    .map((edge) => {
      const sourceNode = nodeById.get(edge.source);
      const targetNode = nodeById.get(edge.target);
      const taken = !!sourceNode?.key && !!targetNode?.key
        && visitedNodeKeys.has(sourceNode.key)
        && visitedNodeKeys.has(targetNode.key);
      return {
        edgeId: edge.id,
        source: edge.source,
        target: edge.target,
        sourceKey: sourceNode?.key,
        targetKey: targetNode?.key,
        label: edge.label ?? null,
        taken,
        reason: taken ? '仿真路径经过此连线' : undefined,
      };
    });
}

async function completeTask(task: SimulatedTask, ctx: SimulationContext): Promise<AdvanceResult | null> {
  const nameMap = task.assigneeId ? await resolveUserNames([task.assigneeId]) : new Map<number, string>();
  const assignees = task.assigneeId
    ? [{ id: task.assigneeId, name: nameMap.get(task.assigneeId) ?? `用户#${task.assigneeId}` }]
    : [];

  ctx.visitedNodeKeys.add(task.nodeKey);

  if (task.status === 'rejected') {
    appendTimeline(ctx, {
      nodeKey: task.nodeKey,
      nodeName: task.nodeName,
      nodeType: task.nodeType,
      status: 'rejected',
      assignees,
      decision: 'auto',
      reason: task.reason ?? '节点自动拒绝',
    });
    markNode(ctx, task.nodeKey, { status: 'error', message: task.reason });
    return null;
  }

  if (task.status === 'approved' || task.status === 'skipped') {
    appendTimeline(ctx, {
      nodeKey: task.nodeKey,
      nodeName: task.nodeName,
      nodeType: task.nodeType,
      status: task.status === 'approved' ? 'autoApproved' : 'skipped',
      assignees,
      decision: 'auto',
      reason: task.reason,
    });
    ctx.completedKeys.add(task.nodeKey);
    markNode(ctx, task.nodeKey, { status: 'done', message: task.reason });
    return advanceFlow(ctx.flowData, task.nodeKey, ctx.formData, ctx.completedKeys, await buildStarterContext(ctx.initiatorId));
  }

  if (BLOCKING_NODE_TYPES.has(task.nodeType)) {
    appendTimeline(ctx, {
      nodeKey: task.nodeKey,
      nodeName: task.nodeName,
      nodeType: task.nodeType,
      status: 'waiting',
      assignees,
      reason: `${task.reason}，仿真已模拟继续`,
    });
    ctx.completedKeys.add(task.nodeKey);
    markNode(ctx, task.nodeKey, { status: 'done', message: '仿真模拟继续' });
    return advanceFlow(ctx.flowData, task.nodeKey, ctx.formData, ctx.completedKeys, await buildStarterContext(ctx.initiatorId));
  }

  appendTimeline(ctx, {
    nodeKey: task.nodeKey,
    nodeName: task.nodeName,
    nodeType: task.nodeType,
    status: 'approved',
    assignees,
    decision: 'approve',
    reason: '仿真默认通过',
  });
  ctx.completedKeys.add(task.nodeKey);
  markNode(ctx, task.nodeKey, { status: 'done' });
  return advanceFlow(ctx.flowData, task.nodeKey, ctx.formData, ctx.completedKeys, await buildStarterContext(ctx.initiatorId));
}

export async function simulateWorkflow(input: SimulateWorkflowInput): Promise<WorkflowSimulationResult> {
  const flowData = await resolveFlowData(input);
  const validation = validateFlowData(flowData);
  const warnings: string[] = [];
  if (!validation.valid) {
    return {
      valid: false,
      warnings: validation.errors,
      result: 'invalid',
      timeline: [],
      edgeResults: buildEdgeResults(flowData, new Set()),
      nodeStates: {},
    };
  }

  const requestUser = currentUser();
  const initiatorId = input.starterUserId ?? requestUser.userId;
  const starter = await buildStarterContext(initiatorId);
  const maxSteps = input.options?.maxSteps ?? 100;
  const formData = { ...(input.formData ?? {}) };
  const startNodeKey = flowData.nodes.find((node) => node.data.type === 'start')?.data.key ?? 'start';
  const ctx: SimulationContext = {
    flowData,
    formData,
    initiatorId,
    maxSteps,
    timeline: [],
    nodeStates: {},
    completedKeys: new Set(['start', startNodeKey]),
    pendingTasks: [],
    warnings,
    visitedNodeKeys: new Set(['start', startNodeKey]),
  };

  const starterNameMap = await resolveUserNames([initiatorId]);
  appendTimeline(ctx, {
    nodeKey: startNodeKey,
    nodeName: '发起',
    nodeType: 'start',
    status: 'entered',
    assignees: [{ id: initiatorId, name: starterNameMap.get(initiatorId) ?? `用户#${initiatorId}` }],
    reason: '仿真开始',
  });
  markNode(ctx, startNodeKey, { status: 'done' });

  let result: WorkflowSimulationResult['result'] = 'waiting';
  let advanceResults: AdvanceResult[] = [getInitialTasks(flowData, formData, starter)];

  for (let step = 0; step < maxSteps; step++) {
    if (advanceResults.length > 0) {
      const next = advanceResults.shift();
      if (!next) continue;
      if (next.rejected) {
        result = 'rejected';
        break;
      }
      if (next.finished) {
        result = 'finished';
      }
      await materializeResult(next, ctx);
      if (next.finished && ctx.pendingTasks.length === 0 && advanceResults.length === 0) break;
      continue;
    }

    const task = ctx.pendingTasks.shift();
    if (!task) {
      if (result !== 'finished') result = 'blocked';
      break;
    }

    const nodeConfig = getNodeByKey(flowData, task.nodeKey);
    if (nodeConfig) ctx.visitedNodeKeys.add(nodeConfig.key);
    const completion = await completeTask(task, ctx);
    if (task.status === 'rejected') {
      result = 'rejected';
      break;
    }
    if (completion) advanceResults.push(completion);
  }

  if (ctx.timeline.length >= maxSteps && result !== 'finished' && result !== 'rejected') {
    result = 'stepLimit';
    ctx.warnings.push(`仿真超过最大步数 ${maxSteps}，已停止`);
  }

  for (const node of flowData.nodes) {
    if (!ctx.nodeStates[node.data.key]) {
      ctx.nodeStates[node.data.key] = { status: 'skipped' };
    }
  }

  return {
    valid: true,
    warnings: ctx.warnings,
    result,
    timeline: ctx.timeline,
    edgeResults: buildEdgeResults(flowData, ctx.visitedNodeKeys),
    nodeStates: ctx.nodeStates,
  };
}
