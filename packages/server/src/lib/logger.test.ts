import { describe, it, expect } from 'vitest';
import logger from './logger';

describe('logger', () => {
  it('should not throw when logging a plain message', () => {
    expect(() => logger.info('Test info message')).not.toThrow();
    expect(() => logger.error('Test error message')).not.toThrow();
    expect(() => logger.warn('Test warn message')).not.toThrow();
    expect(() => logger.debug('Test debug message')).not.toThrow();
  });
});
