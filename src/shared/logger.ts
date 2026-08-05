/// <reference types="vite/client" />

type LogMethod = (message: string, ...args: unknown[]) => void;

const prefix = '[slopfilter]';

export const logger: Record<'debug' | 'info' | 'warn' | 'error', LogMethod> = {
  debug(message, ...args) {
    if (import.meta.env.DEV) console.debug(prefix, message, ...args);
  },
  info(message, ...args) {
    console.info(prefix, message, ...args);
  },
  warn(message, ...args) {
    console.warn(prefix, message, ...args);
  },
  error(message, ...args) {
    console.error(prefix, message, ...args);
  },
};
