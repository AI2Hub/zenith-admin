import {} from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {

  workflowDefinitionNameColumn,
  workflowInitiatorColumn,
  workflowInstanceStatusColumn,
  workflowInstanceTitleColumn,
  workflowSerialNoColumn,
} from './WorkflowInstanceListColumns';

describe('WorkflowInstanceListColumns', () => {
  it('exposes shared column titles', () => {
    expect(workflowInstanceTitleColumn().title).toBe('申请标题');
    expect(workflowSerialNoColumn().title).toBe('业务编号');
    expect(workflowDefinitionNameColumn().title).toBe('流程名称');
    expect(workflowInitiatorColumn().title).toBe('发起人');
    expect(workflowInstanceStatusColumn().title).toBe('状态');
    expect(workflowInstanceStatusColumn({ title: '流程状态' }).title).toBe('流程状态');
  });
});
