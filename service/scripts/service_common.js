const fs = require('fs');
const path = require('path');
const { create, convert } = require('xmlbuilder2');

// Utility pro formátování data/času do ISO 8601 formátu
function getFormattedDateTime(date = new Date()) {
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

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

function normaliseShiftText(value) {
    if (value === null || value === undefined) {
        return '';
    }

    if (typeof value === 'object') {
        if (value['#text'] !== undefined) {
            return String(value['#text']).trim();
        }

        return String(value).trim();
    }

    return String(value).trim();
}

function parseShiftDate(value) {
    const text = normaliseShiftText(value);

    if (!text) {
        return null;
    }

    const direct = new Date(text);
    if (!Number.isNaN(direct.getTime())) {
        return direct;
    }

    const dashMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2})[-:](\d{2})[-:](\d{2})$/);
    if (dashMatch) {
        const [, year, month, day, hour, minute, second] = dashMatch;
        const isoCandidate = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
        const parsed = new Date(isoCandidate);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed;
        }
    }

    const czMatch = text.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/);
    if (czMatch) {
        const [, day, month, year, hour, minute, second] = czMatch;
        const yyyy = year.padStart(4, '0');
        const mm = month.padStart(2, '0');
        const dd = day.padStart(2, '0');
        const hh = hour.padStart(2, '0');
        const min = minute.padStart(2, '0');
        const sec = second.padStart(2, '0');
        const parsed = new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:${sec}`);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed;
        }
    }

    return null;
}
function getShiftProperty(shift, prop, fallback = undefined) {
    // Try attribute form, then element form, then fallback
    if (shift && shift[`@${prop}`] !== undefined) return shift[`@${prop}`];
    if (shift && shift[prop] !== undefined) return shift[prop];
    return fallback;
}

function currentShift(req, res) {
    const shiftsDir = path.join(__dirname, '..', 'data', 'shifts');
    ensureDirectoryExistence(shiftsDir);
    const files = fs.readdirSync(shiftsDir)
        .filter(file => file.endsWith('.xml'));

    if (files.length === 0) {
        return res.json({ active: false, message: "Žádná směna nenalezena." });
    }

    const entries = [];

    for (const file of files) {
        const filePath = path.join(shiftsDir, file);

        try {
            const xmlData = fs.readFileSync(filePath, 'utf8');
            const jsonData = convert(xmlData, { format: 'object' });

            if (!jsonData.shift) {
                continue;
            }

            const rawShiftId = getShiftProperty(jsonData.shift, 'id');
            const shiftIdText = normaliseShiftText(rawShiftId);
            const numericIdCandidate = shiftIdText ? Number(shiftIdText) : NaN;
            const shiftNumeric = Number.isFinite(numericIdCandidate) ? numericIdCandidate : null;

            const startValue = getShiftProperty(jsonData.shift, 'startTime');
            const startTime = normaliseShiftText(startValue) || null;
            const bartenderValue = getShiftProperty(jsonData.shift, 'bartender', 'Neznámý');
            const bartender = normaliseShiftText(bartenderValue) || 'Neznámý';
            const endValue = getShiftProperty(jsonData.shift, 'endTime');
            const endTimeText = normaliseShiftText(endValue);
            const endTime = endTimeText || null;

            const stats = fs.statSync(filePath);
            const startDate = parseShiftDate(startTime) || stats.mtime;
            const mtimeMs = typeof stats.mtimeMs === 'number' ? stats.mtimeMs : stats.mtime.getTime();

            entries.push({
                file,
                shiftID: shiftIdText || null,
                shiftNumeric,
                startTime,
                bartender,
                endTime,
                startTimestamp: startDate.getTime(),
                mtimeMs
            });
        } catch (error) {
            console.warn('⚠️ Nepodařilo se načíst směnu ze souboru', file, error);
        }
    }

    if (entries.length === 0) {
        return res.json({ active: false, message: "Směny nebyly načteny." });
    }

    entries.sort((a, b) => {
        const aHasNumeric = Number.isFinite(a.shiftNumeric);
        const bHasNumeric = Number.isFinite(b.shiftNumeric);

        if (aHasNumeric && bHasNumeric && a.shiftNumeric !== b.shiftNumeric) {
            return b.shiftNumeric - a.shiftNumeric;
        }

        if (b.startTimestamp !== a.startTimestamp) {
            return b.startTimestamp - a.startTimestamp;
        }

        if (b.mtimeMs !== a.mtimeMs) {
            return b.mtimeMs - a.mtimeMs;
        }

        return b.file.localeCompare(a.file);
    });

    const latestEntry = entries[0];

    if (latestEntry && !latestEntry.endTime) {
        return res.json({
            active: true,
            shiftID: latestEntry.shiftID,
            startTime: latestEntry.startTime,
            bartender: latestEntry.bartender,
            endTime: null
        });
    }

    const latestClosed = latestEntry;

    if (latestClosed) {
        const shiftLabel = latestClosed.shiftID ? ` (${latestClosed.shiftID})` : '';

        return res.json({
            active: false,
            shiftID: latestClosed.shiftID,
            startTime: latestClosed.startTime,
            bartender: latestClosed.bartender,
            endTime: latestClosed.endTime,
            message: `Poslední směna${shiftLabel} byla ukončena.`
        });
    }

    return res.json({ active: false, message: "Směny nebyly načteny." });

}


module.exports = {
    ensureDirectoryExistence,
    getLogFilePath,
    appendLog,
    currentShift,
    getFormattedDateTime
    // ...další utility
};