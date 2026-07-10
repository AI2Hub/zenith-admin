import jsep from 'jsep';
import { HTTPException } from 'hono/http-exception';

type MetricFormulaNode = jsep.CoreExpression;
type IdentifierNode = jsep.Identifier;
type MetricAggregate = 'sum' | 'avg' | 'max' | 'min' | 'count' | 'distinct_count';

const AGGREGATES = new Set<MetricAggregate>(['sum', 'avg', 'max', 'min', 'count', 'distinct_count']);
const OPERATORS = new Set(['+', '-', '*', '/', '%']);
const CORE_EXPRESSION_TYPES = new Set([
  'ArrayExpression', 'BinaryExpression', 'CallExpression', 'Compound', 'SequenceExpression',
  'ConditionalExpression', 'Identifier', 'Literal', 'MemberExpression', 'ThisExpression', 'UnaryExpression',
]);

function toCoreExpression(node: jsep.Expression): MetricFormulaNode {
  if (!CORE_EXPRESSION_TYPES.has(node.type)) {
    throw new HTTPException(400, { message: `指标公式不支持的语法：${node.type}` });
  }
  return node as MetricFormulaNode;
}

function parseMetricFormula(formula: string): MetricFormulaNode {
  let node: MetricFormulaNode;
  try {
    node = toCoreExpression(jsep(formula));
  } catch (error) {
    throw new HTTPException(400, { message: `指标公式语法错误：${error instanceof Error ? error.message : String(error)}` });
  }
  assertSupported(node);
  return node;
}

function assertSupported(node: MetricFormulaNode): void {
  switch (node.type) {
    case 'Literal':
      if (typeof node.value !== 'number') throw new HTTPException(400, { message: '指标公式仅支持数字字面量' });
      return;
    case 'Identifier':
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(node.name)) {
        throw new HTTPException(400, { message: `指标公式标识符不合法：${node.name}` });
      }
      return;
    case 'UnaryExpression':
      if (node.operator !== '+' && node.operator !== '-') {
        throw new HTTPException(400, { message: `指标公式不支持一元运算符：${node.operator}` });
      }
      assertSupported(toCoreExpression(node.argument));
      return;
    case 'BinaryExpression':
      if (!OPERATORS.has(node.operator)) {
        throw new HTTPException(400, { message: `指标公式不支持运算符：${node.operator}` });
      }
      assertSupported(toCoreExpression(node.left));
      assertSupported(toCoreExpression(node.right));
      return;
    case 'CallExpression': {
      const callee = toCoreExpression(node.callee);
      if (callee.type !== 'Identifier' || !AGGREGATES.has(callee.name as MetricAggregate)) {
        throw new HTTPException(400, { message: '指标公式仅允许 sum/avg/max/min/count/distinct_count 聚合函数' });
      }
      const aggregate = callee.name as MetricAggregate;
      const validCount = aggregate === 'count' && (node.arguments.length === 0 || node.arguments.length === 1);
      if (!validCount && node.arguments.length !== 1) {
        throw new HTTPException(400, { message: `${aggregate} 聚合函数参数数量不正确` });
      }
      if (node.arguments.length === 1 && toCoreExpression(node.arguments[0]).type !== 'Identifier') {
        throw new HTTPException(400, { message: '聚合函数参数必须是数据集字段名' });
      }
      return;
    }
    default:
      throw new HTTPException(400, { message: `指标公式不支持的语法：${(node as { type: string }).type}` });
  }
}

function toFiniteNumber(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new HTTPException(400, { message: `指标公式 ${label} 的结果不是有效数字` });
  return number;
}

export function aggregateMetricRows(
  rows: Record<string, unknown>[],
  field: string | null | undefined,
  aggregate: MetricAggregate,
): number {
  if (aggregate === 'count' && !field) return rows.length;
  if (!field) throw new HTTPException(400, { message: `${aggregate} 聚合必须指定字段` });
  const raw = rows.map((row) => row[field]).filter((value) => value !== null && value !== undefined && value !== '');
  if (aggregate === 'count') return raw.length;
  if (aggregate === 'distinct_count') return new Set(raw.map((value) => String(value))).size;
  const values = raw.map((value) => Number(value)).filter(Number.isFinite);
  if (values.length === 0) return 0;
  if (aggregate === 'avg') return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (aggregate === 'max') return Math.max(...values);
  if (aggregate === 'min') return Math.min(...values);
  return values.reduce((sum, value) => sum + value, 0);
}

export interface MetricFormulaAnalysis {
  metricCodes: string[];
  fields: string[];
}

export function analyzeMetricFormula(formula: string): MetricFormulaAnalysis {
  const root = parseMetricFormula(formula);
  const metricCodes = new Set<string>();
  const fields = new Set<string>();
  const walk = (node: MetricFormulaNode, aggregateArgument = false): void => {
    if (node.type === 'Identifier') {
      (aggregateArgument ? fields : metricCodes).add(node.name);
      return;
    }
    if (node.type === 'UnaryExpression') walk(toCoreExpression(node.argument));
    if (node.type === 'BinaryExpression') {
      walk(toCoreExpression(node.left));
      walk(toCoreExpression(node.right));
    }
    if (node.type === 'CallExpression') {
      node.arguments.forEach((argument) => walk(toCoreExpression(argument), true));
    }
  };
  walk(root);
  return { metricCodes: [...metricCodes], fields: [...fields] };
}

export async function evaluateMetricFormula(
  formula: string,
  rows: Record<string, unknown>[],
  resolveMetricCode: (code: string) => Promise<number>,
): Promise<number> {
  const root = parseMetricFormula(formula);
  const evaluate = async (node: MetricFormulaNode): Promise<number> => {
    switch (node.type) {
      case 'Literal':
        return toFiniteNumber(node.value, '字面量');
      case 'Identifier':
        return toFiniteNumber(await resolveMetricCode(node.name), node.name);
      case 'UnaryExpression': {
        const value = await evaluate(toCoreExpression(node.argument));
        return node.operator === '-' ? -value : value;
      }
      case 'BinaryExpression': {
        const [left, right] = await Promise.all([
          evaluate(toCoreExpression(node.left)),
          evaluate(toCoreExpression(node.right)),
        ]);
        let result: number;
        switch (node.operator) {
          case '+': result = left + right; break;
          case '-': result = left - right; break;
          case '*': result = left * right; break;
          case '/':
            if (right === 0) throw new HTTPException(400, { message: '指标公式除数不能为 0' });
            result = left / right;
            break;
          case '%':
            if (right === 0) throw new HTTPException(400, { message: '指标公式取模除数不能为 0' });
            result = left % right;
            break;
          default:
            throw new HTTPException(400, { message: `指标公式不支持运算符：${node.operator}` });
        }
        return toFiniteNumber(result, '运算');
      }
      case 'CallExpression': {
        const aggregate = (node.callee as IdentifierNode).name as MetricAggregate;
        const fieldNode = node.arguments[0] ? toCoreExpression(node.arguments[0]) : undefined;
        return aggregateMetricRows(rows, fieldNode?.type === 'Identifier' ? fieldNode.name : null, aggregate);
      }
      default:
        throw new HTTPException(400, { message: `指标公式不支持的语法：${node.type}` });
    }
  };
  return evaluate(root);
}
