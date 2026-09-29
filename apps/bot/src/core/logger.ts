type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatMessage(level: LogLevel, message: string, meta?: unknown): string {
  const timestamp = formatTimestamp();
  const metaStr = meta !== undefined ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level}] ${message}${metaStr}`;
}

export const logger = {
  debug(message: string, meta?: unknown): void {
    if (process.env.NODE_ENV !== 'production' || process.env.DEBUG === 'true') {
      console.debug(formatMessage('DEBUG', message, meta));
    }
  },

  info(message: string, meta?: unknown): void {
    console.info(formatMessage('INFO', message, meta));
  },

  warn(message: string, meta?: unknown): void {
    console.warn(formatMessage('WARN', message, meta));
  },

  error(message: string, meta?: unknown): void {
    console.error(formatMessage('ERROR', message, meta));
  },
};
