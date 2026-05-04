import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getLogger,
  setLogLevel,
  enableDebugLogging,
  disableLogging,
  enableLogging,
} from '../../src/core/logger.js';

describe('logger', () => {
  beforeEach(() => {
    // Reset to known state
    enableLogging();
    setLogLevel('INFO');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should log info messages at INFO level', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const logger = getLogger();
    logger.info('test message');
    expect(spy).toHaveBeenCalledWith('[neatlogs] test message');
  });

  it('should log warn messages at INFO level', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logger = getLogger();
    logger.warn('warning message');
    expect(spy).toHaveBeenCalledWith('[neatlogs] warning message');
  });

  it('should log error messages at INFO level', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = getLogger();
    logger.error('error message');
    expect(spy).toHaveBeenCalledWith('[neatlogs] error message');
  });

  it('should NOT log debug messages at INFO level', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const logger = getLogger();
    logger.debug('debug message');
    expect(spy).not.toHaveBeenCalled();
  });

  it('should log debug messages after enableDebugLogging', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    enableDebugLogging();
    const logger = getLogger();
    logger.debug('debug message');
    expect(spy).toHaveBeenCalledWith('[neatlogs] debug message');
  });

  it('should suppress all messages after disableLogging', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    disableLogging();
    const logger = getLogger();
    logger.info('should not appear');
    logger.error('should not appear');
    expect(infoSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('should resume logging after enableLogging', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    disableLogging();
    enableLogging();
    const logger = getLogger();
    logger.info('visible again');
    expect(spy).toHaveBeenCalledWith('[neatlogs] visible again');
  });

  it('should respect setLogLevel(ERROR)', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setLogLevel('ERROR');
    const logger = getLogger();
    logger.info('info');
    logger.warn('warn');
    logger.error('error');
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith('[neatlogs] error');
  });

  it('should suppress everything at NONE level', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setLogLevel('NONE');
    const logger = getLogger();
    logger.error('should not appear');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('should pass additional args to console methods', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const logger = getLogger();
    logger.info('message with args', { key: 'value' }, 42);
    expect(spy).toHaveBeenCalledWith('[neatlogs] message with args', { key: 'value' }, 42);
  });
});
