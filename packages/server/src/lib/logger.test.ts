import { describe, it, expect } from 'vitest';
import logger from './logger';

describe('logger', () => {
  it('should not throw when logging a plain message', () => {
    expect(() => logger.info('Test info message')).not.toThrow();
    expect(() => logger.error('Test error message')).not.toThrow();
    expect(() => logger.warn('Test warn message')).not.toThrow();
    expect(() => logger.debug('Test debug message')).not.toThrow();
  });

  it('should not throw when logging with an object meta', () => {
    expect(() => logger.info('with meta', { userId: 42 })).not.toThrow();
  });

  it('should not throw when logging with an Error meta', () => {
    expect(() => logger.error('failed', new Error('boom'))).not.toThrow();
  });

  it('should not throw when logging with a primitive meta', () => {
    expect(() => logger.warn('odd meta', 'raw-string')).not.toThrow();
  });
});
