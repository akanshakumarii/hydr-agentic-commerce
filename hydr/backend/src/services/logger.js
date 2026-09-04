function log(level, msg, meta = {}) {
  console.log(JSON.stringify({ level, msg, ts: new Date().toISOString(), ...meta }));
}

export const logger = {
  info: (msg, meta) => log('info', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  error: (msg, meta) => log('error', msg, meta),
};
