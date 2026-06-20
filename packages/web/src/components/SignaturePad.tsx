import { useRef } from 'react';
import { Button } from '@douyinfe/semi-ui';
import { Eraser } from 'lucide-react';

interface Props {
  value?: string;
  onChange?: (dataUrl: string) => void;
  width?: number;
  height?: number;
  disabled?: boolean;
}

/** 轻量手写签名板：基于 canvas，输出 PNG data URL */
export default function SignaturePad({ value, onChange, width = 360, height = 140, disabled }: Readonly<Props>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  const getCtx = () => canvasRef.current?.getContext('2d') ?? null;
  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    drawing.current = true;
    const ctx = getCtx();
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    canvasRef.current?.setPointerCapture(e.pointerId);
  };

  const handleMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || disabled) return;
    const ctx = getCtx();
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.strokeStyle = '#1d1d1d';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();
  };

  const handleUp = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange?.(canvasRef.current?.toDataURL('image/png') ?? '');
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    onChange?.('');
  };

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 6 }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerLeave={handleUp}
        style={{
          border: '1px dashed var(--semi-color-border)',
          borderRadius: 6,
          background: '#fff',
          touchAction: 'none',
          cursor: disabled ? 'not-allowed' : 'crosshair',
        }}
      />
      <div>
        <Button theme="borderless" size="small" icon={<Eraser size={14} />} onClick={handleClear} disabled={disabled}>
          清除{value ? '（已签名）' : ''}
        </Button>
      </div>
    </div>
  );
}
