import { Button, Space } from '@douyinfe/semi-ui';
import { Eraser } from 'lucide-react';
import { useSignaturePad } from '@/hooks/useSignaturePad';

export interface SignaturePadProps {
  value?: string;
  onChange?: (dataUrl: string) => void;
  width?: number;
  height?: number;
  disabled?: boolean;
}

/** 轻量手写签名板：基于 canvas，输出 PNG data URL */
export default function SignaturePad({ value, onChange, width = 360, height = 140, disabled }: Readonly<SignaturePadProps>) {
  const { canvasRef, handlePointerDown, handlePointerMove, handlePointerUp, clear } = useSignaturePad({
    value,
    onChange,
    disabled,
    echoValue: true,
  });

  return (
    <Space vertical align="start" spacing={6} style={{ width: '100%', maxWidth: width }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onPointerCancel={handlePointerUp}
        aria-label="手写签名画布"
        style={{
          border: '1px dashed var(--semi-color-border)',
          borderRadius: 'var(--semi-border-radius-medium)',
          background: '#fff',
          touchAction: 'none',
          cursor: disabled ? 'not-allowed' : 'crosshair',
          display: 'block',
          maxWidth: '100%',
          height: 'auto',
        }}
      />
      <div>
        <Button theme="borderless" size="small" icon={<Eraser size={14} />} onClick={clear} disabled={disabled}>
          清除{value ? '（已签名）' : ''}
        </Button>
      </div>
    </Space>
  );
}
