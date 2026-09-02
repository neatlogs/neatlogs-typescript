/**
 * Centralized logging configuration for Neatlogs SDK.
 * Provides structured logging with configurable levels.
 */

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'NONE';

const LOG_LEVELS: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4,
};

let _logLevel: LogLevel = 'INFO';
let _disabled = false;

function _getConfiguredLevel(): LogLevel {
  const envLevel = process.env.NEATLOGS_LOG_LEVEL?.toUpperCase();
  if (envLevel && envLevel in LOG_LEVELS) {
    return envLevel as LogLevel;
  }
  return 'INFO';
}

// Initialize from env on first import
_logLevel = _getConfiguredLevel();

export function getLogger() {
  return {
    debug(message: string, ...args: any[]) {
      if (!_disabled && LOG_LEVELS[_logLevel] <= LOG_LEVELS.DEBUG) {
        console.debug(`[neatlogs] ${message}`, ...args);
      }
    },
    info(message: string, ...args: any[]) {
      if (!_disabled && LOG_LEVELS[_logLevel] <= LOG_LEVELS.INFO) {
        console.info(`[neatlogs] ${message}`, ...args);
      }
    },
    warn(message: string, ...args: any[]) {
      if (!_disabled && LOG_LEVELS[_logLevel] <= LOG_LEVELS.WARN) {
        console.warn(`[neatlogs] ${message}`, ...args);
      }
    },
    error(message: string, ...args: any[]) {
      if (!_disabled && LOG_LEVELS[_logLevel] <= LOG_LEVELS.ERROR) {
        console.error(`[neatlogs] ${message}`, ...args);
      }
    },
  };
}

export function setLogLevel(level: LogLevel): void {
  _logLevel = level;
}

export function enableDebugLogging(): void {
  _logLevel = 'DEBUG';
}

export function disableLogging(): void {
  _disabled = true;
}

export function enableLogging(): void {
  _disabled = false;
}
