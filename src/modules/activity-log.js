// ── ACTIVITY LOG RING BUFFER ──────────────────────────────────────────────────
const { LOG_LIMIT } = require('./config');

const activityLog = [];
const logClients = new Set();

function logActivity(level, msg) {
  const entry = { ts: new Date().toISOString(), level, msg };
  activityLog.push(entry);
  if (activityLog.length > LOG_LIMIT) activityLog.shift();
  const line = `data: ${JSON.stringify(entry)}\n\n`;
  logClients.forEach(res => { try { res.write(line); } catch {} });
}

// Intercept console so all server output also feeds activity log
const _origLog  = console.log.bind(console);
const _origWarn = console.warn.bind(console);
console.log  = (...a) => { _origLog(...a);  logActivity('info', a.join(' ')); };
console.warn = (...a) => { _origWarn(...a); logActivity('warn', a.join(' ')); };

function getActivityLog() {
  return [...activityLog];
}

function getLogClients() {
  return logClients;
}

function clearLogClients() {
  logClients.clear();
}

module.exports = { logActivity, getActivityLog, getLogClients, clearLogClients };