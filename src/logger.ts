/**
 * Simple logging utility for Pattern
 */

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

class Logger {
  private debugEnabled: boolean = false;

  setDebug(enabled: boolean): void {
    this.debugEnabled = enabled;
  }

  log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (level === LogLevel.DEBUG && !this.debugEnabled) {
      return;
    }

    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level}]`;

    switch (level) {
      case LogLevel.ERROR:
        console.error(prefix, message, ...args);
        break;
      case LogLevel.WARN:
        console.warn(prefix, message, ...args);
        break;
      default:
        // INFO and DEBUG
        // eslint-disable-next-line no-console
        console.log(prefix, message, ...args);
        break;
    }
  }

  debug(message: string, ...args: unknown[]): void {
    this.log(LogLevel.DEBUG, message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.log(LogLevel.INFO, message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.log(LogLevel.WARN, message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    this.log(LogLevel.ERROR, message, ...args);
  }
}

export const logger = new Logger();

/**
 * Create a named logger instance (for component-specific logging)
 * For now, just returns the global logger with a prefix
 */
export function createLogger(_component: string): Logger {
  // For simplicity, we return the same logger instance
  // In the future, this could create separate instances with component prefixes
  return logger;
}
