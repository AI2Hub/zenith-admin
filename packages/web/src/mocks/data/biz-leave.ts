import type { BizLeave } from '@zenith/shared/biz';
import { mockDate, mockDateTime } from '@/mocks/utils/date';
import { allocateMockBusinessNumber, attachMockBusinessNumber } from '@/mocks/utils/numbering';

export const mockBizLeaves: BizLeave[] = [
  {
    id: 1, leaveNo: null, leaveType: 'annual', startDate: '2026-06-20', endDate: '2026-06-22', days: 3,
    reason: '家庭旅行', status: 'approved', workflowInstanceId: 9001, workflowStatus: 'approved',
    applicantId: 1, applicantName: '管理员', tenantId: 1, createdAt: '2026-06-15 09:00:00', updatedAt: '2026-06-16 10:00:00',
  },
  {
    id: 2, leaveNo: null, leaveType: 'sick', startDate: mockDate(), endDate: mockDate(), days: 1,
    reason: '感冒发烧', status: 'pending', workflowInstanceId: 9002, workflowStatus: 'running',
    applicantId: 1, applicantName: '管理员', tenantId: 1, createdAt: mockDateTime(), updatedAt: mockDateTime(),
  },
  {
    id: 3, leaveNo: null, leaveType: 'personal', startDate: '2026-07-01', endDate: '2026-07-02', days: 2,
    reason: '办理证件', status: 'draft', workflowInstanceId: null, workflowStatus: null,
    applicantId: 1, applicantName: '管理员', tenantId: 1, createdAt: mockDateTime(), updatedAt: mockDateTime(),
  },
];

for (const leave of mockBizLeaves) {
  leave.leaveNo = allocateMockBusinessNumber({ scene: 'biz.leave', tenantId: leave.tenantId, allocationKey: String(leave.id),
    context: { categoryCode: leave.leaveType, departmentId: 2, departmentCode: 'HR', departmentName: '人事部', username: 'admin', nickname: '管理员', tenantCode: 'demo' },
    at: new Date(`${leave.createdAt.replace(' ', 'T')}+08:00`),
  });
  attachMockBusinessNumber({ scene: 'biz.leave', tenantId: leave.tenantId, number: leave.leaveNo, businessKey: String(leave.id) });
}

let nextLeaveId = 100;
let nextLeaveInstanceId = 9100;
export function getNextLeaveId() { return nextLeaveId++; }
export function getNextLeaveInstanceId() { return nextLeaveInstanceId++; }
