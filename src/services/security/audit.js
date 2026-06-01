const fs = require('fs');
const path = require('path');

const logDir = path.resolve(__dirname, '../../../security/logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const auditLogFile = path.join(logDir, 'audit.log');

const logEvent = async (eventType, details) => {
  const timestamp = new Date().toISOString();
  const logEntry = JSON.stringify({
    timestamp,
    event: eventType,
    ...details
  }) + '\n';
  
  fs.appendFile(auditLogFile, logEntry, (err) => {
    if (err) console.error('Failed to write to audit log:', err);
  });
};

module.exports = {
  logEvent
};
