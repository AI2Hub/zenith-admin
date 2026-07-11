import '@testing-library/jest-dom/vitest';

// Mock Canvas for Semi-UI lottie
const getContextMock = () => {
  return {
    fillStyle: '',
    fillRect: Object,
    clearRect: Object,
    getImageData: Object,
    putImageData: Object,
    createImageData: Object,
    setTransform: Object,
    drawImage: Object,
    save: Object,
    fillText: Object,
    restore: Object,
    beginPath: Object,
    moveTo: Object,
    lineTo: Object,
    closePath: Object,
    stroke: Object,
    translate: Object,
    scale: Object,
    rotate: Object,
    arc: Object,
    fill: Object,
    measureText: () => ({ width: 0 }),
    transform: Object,
    rect: Object,
    clip: Object,
  } as unknown as CanvasRenderingContext2D;
};

HTMLCanvasElement.prototype.getContext = getContextMock as unknown as typeof HTMLCanvasElement.prototype.getContext;

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {}, // deprecated
    removeListener: () => {}, // deprecated
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Mock ResizeObserver
class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserver;

// jsdom 未实现 Range.getBoundingClientRect/getClientRects，Semi Typography 的 ellipsis 测量逻辑依赖它们
// （异步 rAF/microtask 中调用，测试卸载后仍可能触发，未 polyfill 会产生 unhandled rejection 噪音）。
Range.prototype.getBoundingClientRect = () => ({
  x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0, toJSON: () => ({}),
});
Range.prototype.getClientRects = () => ({
  length: 0,
  item: () => null,
  [Symbol.iterator]: function* () {},
}) as unknown as DOMRectList;
