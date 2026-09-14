/**
 * 异常日志内核：前端错误上报与服务端异常采集共用的 Issue 落库（store）、服务端采集器（reporter）、
 * 归一化 / 指纹 / 脱敏工具。域中立，位于 lib 层；告警评估等副作用由上层经 `onErrorRecorded` 注册。
 */
export * from './types';
export { normalizeThrown } from './normalize';
export { computeServerFingerprint, extractInAppFrames, normalizeErrorMessage } from './fingerprint';
export { pickHeaders, scrubBody, snapshotRequest } from './scrub';
export { bumpErrorGroupCounts, recordErrorEvent, recordErrorEventBatch, recordErrorEventWithin } from './store';
export {
  captureException,
  currentErrorTrackingSettings,
  errorReporterStats,
  flushErrorReporter,
  isCaptured,
  markCaptured,
  onErrorRecorded,
  startErrorReporter,
  stopErrorReporter,
} from './reporter';
