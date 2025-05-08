const fs = require('fs');
const path = require('path');
const { create, convert } = require('xmlbuilder2');
const common = require('./service_common');
const { get } = require('http');

function findShiftFileByID(shiftID) {
    try {
        const shiftsDir = path.join(__dirname, '..', 'data', 'shifts');
        common.ensureDirectoryExistence(shiftsDir);

        // Hledání všech existujících směn
        const files = fs.readdirSync(shiftsDir)
            .filter(file => file.match(/_\d+\.xml$/))
            .sort((a, b) => b.localeCompare(a)); // Seřazení od nejnovější

        let activeShiftFile = null;
        let lastShiftID = null;

        // Projdeme všechny směny a zjistíme, zda existuje neuzavřená směna
        for (const file of files) {
            const filePath = path.join(shiftsDir, file);
            const xmlData = fs.readFileSync(filePath, 'utf8');
            const jsonData = convert(xmlData, { format: 'object' });

            if (jsonData.shift && !jsonData.shift.endTime) {
                console.warn(`⚠️ Neuzavřená směna nalezena: ${file}`);
                activeShiftFile = filePath;
                lastShiftID = jsonData.shift['@id'];
                break;
            }
        }

        // Pokud existuje aktivní směna, vrátíme ji (nezakládáme novou)
        if (activeShiftFile) {
            console.log(`✅ Používám aktuální otevřenou směnu: ${activeShiftFile}`);
            return activeShiftFile;
        }

        // Pokud neexistuje otevřená směna, vytvoříme novou směnu
        console.warn(`⚠️ Žádná aktivní směna neexistuje. Vytvářím novou.`);

        const now = new Date();
        const datePart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const timePart = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
        const formattedDateTime = `${datePart} ${timePart}`;

        // Nastavení nového ID směny (inkrementace posledního známého ID)
        const newShiftID = lastShiftID ? parseInt(lastShiftID, 10) + 1 : 1;
        const newFileName = `${datePart}_${timePart}_${newShiftID}.xml`;
        const filePath = path.join(shiftsDir, newFileName);

        // Vytvoření XML pro novou směnu
        const xmlDoc = create({ version: '1.0' })
            .ele('shift', { id: newShiftID })
            .ele('startTime').txt(formattedDateTime).up()
            .ele('orders');

        fs.writeFileSync(filePath, xmlDoc.end({ prettyPrint: true }));

        console.log(`✅ Vytvořena nová směna: ${newFileName} (ID: ${newShiftID})`);
        return filePath;

    } catch (error) {
        console.error("❌ Chyba ve funkci findShiftFileByID:", error);
        return null;
    }
}

// Funkce pro získání nového ID směny z externího souboru shift_id.json
function getNextShiftID() {
    const idsDir = path.join(__dirname, '..', 'data', 'ids');
    common.ensureDirectoryExistence(idsDir);
    const idFile = path.join(idsDir, 'shift_id.json');

    let lastId = 0;
    if (fs.existsSync(idFile)) {
        const idData = JSON.parse(fs.readFileSync(idFile, 'utf8')); // Načtení obsahu souboru
        lastId = idData.lastId || 0; // Získání posledního ID
    }

    const newId = lastId + 1; // Inkrementace ID
    fs.writeFileSync(idFile, JSON.stringify({ lastId: newId }, null, 4)); // Uložení nového ID
    return newId;
}

module.exports = {
    findShiftFileByID, getNextShiftID
};