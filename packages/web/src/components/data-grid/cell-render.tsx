import { memo } from 'react';
import { ArrowUpRight, Maximize2 } from 'lucide-react';
import type { CellKind } from './grid-format';
import { displayValue, hasDetail } from './grid-format';

interface CellContentProps {
  value: unknown;
  kind: CellKind;
  hasFk: boolean;
  onDetail?: () => void;
  onFk?: () => void;
}

/** 单元格内容：类型化展示 + hover 角标（详情 / FK 跳转） */
export const CellContent = memo(function CellContent({ value, kind, hasFk, onDetail, onFk }: CellContentProps) {
  let body: React.ReactNode;
  if (value === null || value === undefined) {
    body = <span className="dg-null">NULL</span>;
  } else if (kind === 'bool') {
    body = <span className={`dg-bool dg-bool--${value ? 'true' : 'false'}`}>{value ? 'true' : 'false'}</span>;
  } else if (kind === 'json' || typeof value === 'object') {
    body = <span className="dg-json">{displayValue(value, kind)}</span>;
  } else {
    body = displayValue(value, kind);
  }

  const showDetail = onDetail && hasDetail(value, kind);
  const showFk = onFk && hasFk && value !== null && value !== undefined;

  return (
    <>
      <span className="dg-cell-text">{body}</span>
      {(showDetail || showFk) && (
        <span className="dg-cell-actions">
          {showFk && (
            <button
              type="button"
              className="dg-cell-action"
              title="跳转到引用表"
              onClick={(e) => { e.stopPropagation(); onFk(); }}
              onMouseDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
            >
              <ArrowUpRight size={12} />
            </button>
          )}
          {showDetail && (
            <button
              type="button"
              className="dg-cell-action"
              title="查看详情"
              onClick={(e) => { e.stopPropagation(); onDetail(); }}
              onMouseDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
            >
              <Maximize2 size={12} />
            </button>
          )}
        </span>
      )}
    </>
  );
});
