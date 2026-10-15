import type { ReactNode } from 'react';
import { Descriptions } from '@douyinfe/semi-ui';
import AppModal from '@/components/AppModal';

/**
 * 详情弹窗的一行：`key` 为字段名、`value` 为已渲染内容，`span` 跨列（缺省 1）。
 * 可选字段（设备分辨率 / GPU / 内存）由调用方按有无值决定是否入列，避免空行占位。
 */
export interface LoginLogDetailItem {
  readonly key: string;
  readonly value: ReactNode;
  readonly span?: number;
}

interface LoginLogDetailModalProps {
  readonly title: string;
  readonly visible: boolean;
  readonly onCancel: () => void;
  readonly items: readonly LoginLogDetailItem[];
  /** 缺省 560；字段较多（含设备信息）时由调用方加宽 */
  readonly width?: number;
}

/**
 * 登录日志详情弹窗：后台登录日志（`LoginLogsTable`）与会员登录日志（`MemberLoginLogsPage`）
 * 共用同一套外壳与两列只读 `Descriptions` 排布，字段清单由各自实体拼装后传入。
 */
export function LoginLogDetailModal({ title, visible, onCancel, items, width = 560 }: LoginLogDetailModalProps) {
  return (
    <AppModal
      title={title}
      visible={visible}
      onCancel={onCancel}
      footer={null}
      width={width}
      style={{ top: 40 }}
    >
      {visible && <Descriptions data={[...items]} column={2} layout="horizontal" align="left" />}
    </AppModal>
  );
}

export default LoginLogDetailModal;
