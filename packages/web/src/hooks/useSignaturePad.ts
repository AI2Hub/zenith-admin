import { useEffect, useRef } from 'react';

interface UseSignaturePadOptions {
  value?: string;
  onChange?: (dataUrl: string) => void;
  disabled?: boolean;
  /** 外部 value 变化时（如回显）是否绘制到画布 */
  echoValue?: boolean;
}

/** 手写签名板共享逻辑：canvas 指针绘制 + PNG data URL 导出 */
export function useSignaturePad({ value, onChange, disabled, echoValue }: UseSignaturePadOptions) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const strokeMoved = useRef(false);
  const imageEpoch = useRef(0);
  const lastExported = useRef<string | undefined>(undefined);

  const getCtx = () => canvasRef.current?.getContext('2d') ?? null;

  useEffect(() => {
    if (!echoValue) return;
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx) return;
    if (value === lastExported.current) return;
    const epoch = ++imageEpoch.current;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (value) {
      const img = new Image();
      img.onload = () => { if (imageEpoch.current === epoch) ctx.drawImage(img, 0, 0, canvas.width, canvas.height); };
      img.src = value;
    }
    lastExported.current = value;
    return () => { imageEpoch.current += 1; };
  }, [value, echoValue]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * canvasRef.current!.width / rect.width,
      y: (e.clientY - rect.top) * canvasRef.current!.height / rect.height,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    drawing.current = true;
    strokeMoved.current = false;
    imageEpoch.current += 1;
    const ctx = getCtx();
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    canvasRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || disabled) return;
    const ctx = getCtx();
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.strokeStyle = '#1d1d1d';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();
    strokeMoved.current = true;
  };

  const handlePointerUp = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (!strokeMoved.current) return;
    const dataUrl = canvasRef.current?.toDataURL('image/png');
    lastExported.current = dataUrl;
    onChange?.(dataUrl ?? '');
  };

  const clear = () => {
    if (disabled) return;
    imageEpoch.current += 1;
    drawing.current = false;
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    lastExported.current = '';
    onChange?.('');
  };

  return { canvasRef, handlePointerDown, handlePointerMove, handlePointerUp, clear };
}
