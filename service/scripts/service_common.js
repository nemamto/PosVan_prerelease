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
function currentShift(req, res) {
    const shiftsDir = path.join(__dirname, 'data', 'shifts');
    ensureDirectoryExistence(shiftsDir); 
    const files = fs.readdirSync(shiftsDir)
        .filter(file => file.endsWith('.xml'))
        .sort((a, b) => fs.statSync(path.join(shiftsDir, b)).mtime - fs.statSync(path.join(shiftsDir, a)).mtime);

    if (files.length === 0) {
        return res.json({ active: false, message: "Žádná směna nenalezena." });
    }

    const latestShiftFile = path.join(shiftsDir, files[0]);
    const xmlData = fs.readFileSync(latestShiftFile, 'utf8');
    const jsonData = convert(xmlData, { format: 'object' });

    if (!jsonData.shift) {
        return res.json({ active: false, message: "Neplatná struktura směny." });
    }

    const shiftID = jsonData.shift['@id'];
    const startTime = jsonData.shift['@startTime'];
    const bartender = jsonData.shift.bartender || "Neznámý";
    const endTime = jsonData.shift.endTime;

    if (endTime) {
        return res.json({ active: false, endTime, message: `Poslední směna (${shiftID}) byla ukončena.` });
    }

    return res.json({
        active: true,
        shiftID,
        startTime,
        bartender,
        endTime
    });

}


module.exports = {
    ensureDirectoryExistence,
    getLogFilePath,
    appendLog,
    currentShift
    // ...další utility
};