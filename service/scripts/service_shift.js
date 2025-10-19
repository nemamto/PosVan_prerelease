const fs = require('fs');
const path = require('path');
const { create, convert } = require('xmlbuilder2');
const common = require('./service_common');
const { get } = require('http');

// Utility functions for consistent datetime formatting
function getISODateTime(date = new Date()) {
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function getFileSafeDateTime(date = new Date()) {
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

function startShift(req, res) {
    try {
        const { bartender, initialCash } = req.body;
        if (!bartender) {
            return res.status(400).json({ message: "❌ Jméno barmana je povinné!" });
        }

        const cashAmount = Number(initialCash) || 0;

        const newShiftID = getNextShiftID();

        const now = new Date();
        const formattedDateTime = getISODateTime(now); // ISO 8601 formát
        const fileSafeDateTime = getFileSafeDateTime(now); // Pro název souboru

        const shiftsDir = path.join(__dirname, '..', 'data', 'shifts');
        common.ensureDirectoryExistence(shiftsDir);

        // Vytvoření XML dokumentu s novým ID a pokladnou
        const xmlDoc = create({ version: '1.0' })
            .ele('shift', { id: newShiftID, startTime: formattedDateTime })
                .ele('bartender').txt(bartender).up()
                .ele('cashRegister')
                    .ele('initialAmount').txt(cashAmount).up()
                    .ele('deposits').up()
                    .ele('withdrawals').up()
                .up()
                .ele('orders').up()
            .up();

        const fileName = `${fileSafeDateTime}_${newShiftID}.xml`;
        const filePath = path.join(shiftsDir, fileName);
        fs.writeFileSync(filePath, xmlDoc.end({ prettyPrint: true }));

        console.log(`✅ Vytvořena nová směna: ${fileName} (ID: ${newShiftID}, Barman: ${bartender}, Pokladna: ${cashAmount} Kč)`);
        res.json({
            message: `✅ Směna ${newShiftID} byla zahájena.`,
            shiftID: newShiftID,
            bartender,
            startTime: formattedDateTime,
            initialCash: cashAmount
        });
    } catch (error) {
        console.error('❌ Chyba při zahájení směny:', error);
        res.status(500).json({ message: 'Interní chyba serveru při zahájení směny.' });
    }
}

function endShift(req, res) {
    try {
        console.log('🔚 Ukončení směny:', req.body);
        const { shiftID, bartenderWage } = req.body;
        if (!shiftID) {
            return res.status(400).json({ message: "❌ ID směny je povinné!" });
        }

        const shiftsDir = path.join(__dirname, '..', 'data', 'shifts');
        common.ensureDirectoryExistence(shiftsDir);

        const shiftFile = fs.readdirSync(shiftsDir).find(file => file.includes(`_${shiftID}.xml`));
        if (!shiftFile) {
            return res.status(404).json({ message: "❌ Směna nebyla nalezena!" });
        }

        const filePath = path.join(shiftsDir, shiftFile);
        const xmlData = fs.readFileSync(filePath, 'utf8');
        const jsonData = convert(xmlData, { format: 'object' });

        if (!jsonData.shift) {
            return res.status(400).json({ message: "❌ Neplatný formát směny!" });
        }

        if (jsonData.shift.endTime) {
            return res.status(400).json({ message: "❌ Směna již byla ukončena!" });
        }

        const now = new Date();
        const endTimeISO = getISODateTime(now);

        jsonData.shift.endTime = endTimeISO;
        
        // Pokud byla zadána mzda barmana, uložíme ji
        if (bartenderWage !== undefined && bartenderWage !== null) {
            jsonData.shift.bartenderWage = Number(bartenderWage);
        }

        const updatedXmlData = create(jsonData).end({ prettyPrint: true });
        fs.writeFileSync(filePath, updatedXmlData);

        console.log(`✅ Směna ID ${shiftID} byla ukončena v ${endTimeISO}.`);

        res.json({ message: `✅ Směna ID ${shiftID} byla ukončena.`, endTime: endTimeISO });
    } catch (error) {
        console.error('❌ Chyba při ukončení směny:', error);
        res.status(500).json({ message: 'Interní chyba serveru při ukončení směny.' });
    }
}

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
        const formattedDateTime = getISODateTime(now);
        const fileSafeDateTime = getFileSafeDateTime(now);

        // Nastavení nového ID směny (inkrementace posledního známého ID)
        const newShiftID = lastShiftID ? parseInt(lastShiftID, 10) + 1 : 1;
        const newFileName = `${fileSafeDateTime}_${newShiftID}.xml`;
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

function getShiftSummary(req, res) {
    const { shiftID } = req.query;

    if (!shiftID) {
        return res.status(400).json({ message: "❌ Shift ID není definováno!" });
    }

    const shiftsDir = path.join(__dirname, '..', 'data', 'shifts');
    const files = fs.readdirSync(shiftsDir);
    const matchingFile = files.find(name => name.endsWith(`_${shiftID}.xml`));

    if (!matchingFile) {
        return res.status(404).json({ message: "❌ Směna nebyla nalezena." });
    }

    try {
        const filePath = path.join(shiftsDir, matchingFile);
        const xmlData = fs.readFileSync(filePath, 'utf8');
        const jsonData = convert(xmlData, { format: 'object' });

        // === 💡 Načtení všech objednávek, ať už jsou ve <orders> nebo přímo pod <shift> ===
        let orderList = [];

        // Z vnořeného <orders><order>...</order></orders>
        if (jsonData.shift?.orders?.order) {
            const nestedOrders = jsonData.shift.orders.order;
            orderList = Array.isArray(nestedOrders) ? nestedOrders : [nestedOrders];
        }

        // Z přímých <order> tagů mimo <orders>
        if (jsonData.shift?.order) {
            const flatOrders = Array.isArray(jsonData.shift.order)
                ? jsonData.shift.order
                : [jsonData.shift.order];
            orderList = orderList.concat(flatOrders);
        }

        // === 🔢 Výpočty tržeb a statistik ===
        let totalRevenue = 0;
        let cashRevenue = 0;
        let cardRevenue = 0;
        let employeeAccountRevenue = 0;
        let orderCount = 0;
        let cancelledCount = 0;

        orderList.forEach(order => {
            const isCancelled = String(order['@cancelled']).toLowerCase() === 'true';
            
            if (isCancelled) {
                cancelledCount++;
                return;
            }
            
            orderCount++;
            
            const paymentMethod = order.paymentMethod || "Neznámé";
            const totalPrice = Number(order.totalPrice || 0);

            if (isNaN(totalPrice)) return;

            totalRevenue += totalPrice;

            if (paymentMethod === "Hotovost") {
                cashRevenue += totalPrice;
            } else if (paymentMethod === "Karta") {
                cardRevenue += totalPrice;
            } else  {
                employeeAccountRevenue += totalPrice;
            }
        });

        const averageOrderValue = orderCount > 0 ? (totalRevenue / orderCount) : 0;

        // === ⏱️ Načtení základních údajů směny ===
        const shiftId = jsonData.shift['@id'] || shiftID;
        // startTime může být atribut (@startTime) nebo element (startTime)
        const startTime = jsonData.shift['@startTime'] || jsonData.shift.startTime;
        const endTime = jsonData.shift.endTime;
        const bartender = jsonData.shift.bartender || 'Neznámý';
        
        // === ⏱️ Pomocná funkce pro parsování data ===
        function parseDateTime(dateStr) {
            if (!dateStr) return null;
            
            // Formát: "2025-10-18 15-00-40" -> "2025-10-18T15:00:40"
            if (typeof dateStr === 'string' && dateStr.match(/^\d{4}-\d{2}-\d{2}\s+\d{2}-\d{2}-\d{2}$/)) {
                const [datePart, timePart] = dateStr.split(' ');
                const isoTime = timePart.replace(/-/g, ':');
                return new Date(`${datePart}T${isoTime}`);
            }
            
            // Formát: "18. 10. 2025 16:22:51" (český)
            if (typeof dateStr === 'string' && dateStr.match(/^\d{1,2}\.\s*\d{1,2}\.\s*\d{4}/)) {
                const parts = dateStr.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/);
                if (parts) {
                    const [, day, month, year, hour, minute, second] = parts;
                    return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute}:${second}`);
                }
            }
            
            // Pokus o standardní parsování
            return new Date(dateStr);
        }
        
        // === ⏱️ Výpočet doby trvání směny ===
        let durationHours = 0;
        let start = null;
        let end = null;
        
        if (startTime) {
            start = parseDateTime(startTime);
        }
        
        if (endTime) {
            end = parseDateTime(endTime);
        } else if (start) {
            // Pokud směna ještě není ukončena, použijeme aktuální čas
            end = new Date();
        }
        
        if (start && end && !isNaN(start.getTime()) && !isNaN(end.getTime())) {
            const durationMs = end - start;
            durationHours = durationMs / (1000 * 60 * 60); // Převod na hodiny
        }

        // === 💰 Výpočet mzdy barmana (200 Kč/h * délka směny) ===
        const bartenderWage = jsonData.shift.bartenderWage 
            ? Number(jsonData.shift.bartenderWage) 
            : Math.round(durationHours * 200);

        // === 💵 Výpočet stavu pokladny ===
        let initialCash = 0;
        let totalDeposits = 0;
        let totalWithdrawals = 0;

        if (jsonData.shift.cashRegister) {
            initialCash = Number(jsonData.shift.cashRegister.initialAmount) || 0;

            // Sečteme všechny vklady
            if (jsonData.shift.cashRegister.deposits?.deposit) {
                const deposits = Array.isArray(jsonData.shift.cashRegister.deposits.deposit)
                    ? jsonData.shift.cashRegister.deposits.deposit
                    : [jsonData.shift.cashRegister.deposits.deposit];
                
                totalDeposits = deposits.reduce((sum, dep) => sum + (Number(dep.amount) || 0), 0);
            }

            // Sečteme všechny výběry
            if (jsonData.shift.cashRegister.withdrawals?.withdrawal) {
                const withdrawals = Array.isArray(jsonData.shift.cashRegister.withdrawals.withdrawal)
                    ? jsonData.shift.cashRegister.withdrawals.withdrawal
                    : [jsonData.shift.cashRegister.withdrawals.withdrawal];
                
                totalWithdrawals = withdrawals.reduce((sum, wd) => sum + (Number(wd.amount) || 0), 0);
            }
        }

        // Aktuální stav = počáteční + příjem hotovosti + vklady - výběry
        const currentCashState = initialCash + cashRevenue + totalDeposits - totalWithdrawals;
        // Finální stav po výplatě barmana
        const finalCashState = currentCashState - bartenderWage;

        res.json({
            shiftID: shiftId,
            bartender: bartender,
            startTime: startTime || null,
            endTime: endTime || null,
            durationHours: durationHours.toFixed(2),
            bartenderWage: bartenderWage,
            totalRevenue: totalRevenue.toFixed(2),
            cashRevenue: cashRevenue.toFixed(2),
            cardRevenue: cardRevenue.toFixed(2),
            employeeAccountRevenue: employeeAccountRevenue.toFixed(2),
            orderCount: orderCount,
            cancelledCount: cancelledCount,
            averageOrderValue: averageOrderValue.toFixed(2),
            // Pokladna
            initialCash: initialCash.toFixed(2),
            totalDeposits: totalDeposits.toFixed(2),
            totalWithdrawals: totalWithdrawals.toFixed(2),
            currentCashState: currentCashState.toFixed(2),
            finalCashState: finalCashState.toFixed(2)
        });

    } catch (error) {
        console.error("❌ Chyba při načítání směny:", error);
        res.status(500).json({ message: "❌ Interní chyba serveru." });
    }
}

// Vklad do pokladny
function addDeposit(req, res) {
    try {
        const { shiftID, amount, note } = req.body;

        if (!shiftID || amount === undefined) {
            return res.status(400).json({ message: "❌ ID směny a částka jsou povinné!" });
        }

        const depositAmount = Number(amount);
        if (depositAmount <= 0) {
            return res.status(400).json({ message: "❌ Částka vkladu musí být kladná!" });
        }

        const shiftFile = findShiftFileByID(shiftID);
        if (!shiftFile) {
            return res.status(404).json({ message: `❌ Směna ${shiftID} nebyla nalezena.` });
        }

        const xmlContent = fs.readFileSync(shiftFile, 'utf-8');
        const jsonData = convert(xmlContent, { format: 'object' });

        // Ujistíme se, že cashRegister existuje
        if (!jsonData.shift.cashRegister) {
            jsonData.shift.cashRegister = {
                initialAmount: 0,
                deposits: {},
                withdrawals: {}
            };
        }

        // Ujistíme se, že deposits existuje
        if (!jsonData.shift.cashRegister.deposits) {
            jsonData.shift.cashRegister.deposits = {};
        }

        // Přidáme nový vklad
        const depositData = {
            time: getISODateTime(),
            amount: depositAmount,
            note: note || ''
        };

        if (!jsonData.shift.cashRegister.deposits.deposit) {
            jsonData.shift.cashRegister.deposits.deposit = [];
        } else if (!Array.isArray(jsonData.shift.cashRegister.deposits.deposit)) {
            jsonData.shift.cashRegister.deposits.deposit = [jsonData.shift.cashRegister.deposits.deposit];
        }

        jsonData.shift.cashRegister.deposits.deposit.push(depositData);

        // Uložíme zpět do XML
        const xmlDoc = create(jsonData);
        fs.writeFileSync(shiftFile, xmlDoc.end({ prettyPrint: true }));

        console.log(`✅ Přidán vklad ${depositAmount} Kč do směny ${shiftID}`);
        res.json({ 
            message: "✅ Vklad byl zaznamenán.",
            amount: depositAmount,
            note: note || ''
        });

    } catch (error) {
        console.error("❌ Chyba při přidávání vkladu:", error);
        res.status(500).json({ message: "❌ Interní chyba serveru." });
    }
}

// Výběr z pokladny
function addWithdrawal(req, res) {
    try {
        const { shiftID, amount, note } = req.body;

        if (!shiftID || amount === undefined) {
            return res.status(400).json({ message: "❌ ID směny a částka jsou povinné!" });
        }

        const withdrawalAmount = Number(amount);
        if (withdrawalAmount <= 0) {
            return res.status(400).json({ message: "❌ Částka výběru musí být kladná!" });
        }

        const shiftFile = findShiftFileByID(shiftID);
        if (!shiftFile) {
            return res.status(404).json({ message: `❌ Směna ${shiftID} nebyla nalezena.` });
        }

        const xmlContent = fs.readFileSync(shiftFile, 'utf-8');
        const jsonData = convert(xmlContent, { format: 'object' });

        // Ujistíme se, že cashRegister existuje
        if (!jsonData.shift.cashRegister) {
            jsonData.shift.cashRegister = {
                initialAmount: 0,
                deposits: {},
                withdrawals: {}
            };
        }

        // Ujistíme se, že withdrawals existuje
        if (!jsonData.shift.cashRegister.withdrawals) {
            jsonData.shift.cashRegister.withdrawals = {};
        }

        // Přidáme nový výběr
        const withdrawalData = {
            time: getISODateTime(),
            amount: withdrawalAmount,
            note: note || ''
        };

        if (!jsonData.shift.cashRegister.withdrawals.withdrawal) {
            jsonData.shift.cashRegister.withdrawals.withdrawal = [];
        } else if (!Array.isArray(jsonData.shift.cashRegister.withdrawals.withdrawal)) {
            jsonData.shift.cashRegister.withdrawals.withdrawal = [jsonData.shift.cashRegister.withdrawals.withdrawal];
        }

        jsonData.shift.cashRegister.withdrawals.withdrawal.push(withdrawalData);

        // Uložíme zpět do XML
        const xmlDoc = create(jsonData);
        fs.writeFileSync(shiftFile, xmlDoc.end({ prettyPrint: true }));

        console.log(`✅ Přidán výběr ${withdrawalAmount} Kč ze směny ${shiftID}`);
        res.json({ 
            message: "✅ Výběr byl zaznamenán.",
            amount: withdrawalAmount,
            note: note || ''
        });

    } catch (error) {
        console.error("❌ Chyba při přidávání výběru:", error);
        res.status(500).json({ message: "❌ Interní chyba serveru." });
    }
}

module.exports = {
    findShiftFileByID,
    getNextShiftID,
    getShiftSummary,
    startShift,
    endShift,
    addDeposit,
    addWithdrawal
};