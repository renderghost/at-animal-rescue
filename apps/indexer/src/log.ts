import type { Logger } from './processor';

/** One JSON object per line, for log collectors. */
export const jsonLogger: Logger = {
  info: (message, fields) => console.log(JSON.stringify({ level: 'info', message, ...fields })),
  warn: (message, fields) => console.warn(JSON.stringify({ level: 'warn', message, ...fields })),
};
