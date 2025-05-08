const fs = require('fs');
const path = require('path');

// Zajištění existence složky
function ensureDirectoryExistence(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

// Získání cesty k log souboru podle data
function getLogFilePath() {
    const logDir = path.join(__dirname, '..', 'logs');
    ensureDirectoryExistence(logDir);
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
    return path.join(logDir, `${dateStr}.log`);
}

// Logování do souboru
function appendLog(level, ...args) {
    const msg = `[${new Date().toISOString()}] [${level}] ${args.map(a => (typeof a === 'object' ? JSON.stringify(a) : a)).join(' ')}\n`;
    fs.appendFileSync(getLogFilePath(), msg);
}

// Další obecné utility podle potřeby...

module.exports = {
    ensureDirectoryExistence,
    getLogFilePath,
    appendLog,
    // ...další utility
};