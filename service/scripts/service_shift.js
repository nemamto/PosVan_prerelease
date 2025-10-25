const fs = require('fs');
const path = require('path');
const { create, convert } = require('xmlbuilder2');
const common = require('./service_common');
const { createShiftBackup } = require('./shift_backup');
function getISODateTime(date = new Date()) {
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function getFileSafeDateTime(date = new Date()) {
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

function toAmount(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function toOptionalAmount(value) {
    if (value === undefined || value === null || value === '') {
        return null;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function computeShiftFinancials(shiftNode) {
    if (!shiftNode) {
        return {
            orderItems: [],
            totalRevenue: 0,
            cashRevenue: 0,
            cardRevenue: 0,
            employeeAccountRevenue: 0,
            orderCount: 0,
            cancelledCount: 0,
            initialCash: 0,
            totalDeposits: 0,
            totalWithdrawals: 0,
            currentCashState: 0,
            averageOrderValue: 0,
        };
    }

    const orderItems = normaliseOrderList(shiftNode);

    let totalRevenue = 0;
    let cashRevenue = 0;
    let cardRevenue = 0;
    let employeeAccountRevenue = 0;
    let orderCount = 0;
    let cancelledCount = 0;

    orderItems.forEach(order => {
        const isCancelled = String(order['@cancelled']).toLowerCase() === 'true';

        if (isCancelled) {
            cancelledCount += 1;
            return;
        }

        orderCount += 1;

        const paymentMethod = order.paymentMethod || 'Neznámé';
        const totalPrice = toAmount(order.totalPrice, NaN);

        if (!Number.isFinite(totalPrice)) {
            return;
        }

        totalRevenue += totalPrice;

        if (paymentMethod === 'Hotovost' || paymentMethod === 'Hotově') {
            cashRevenue += totalPrice;
        } else if (paymentMethod === 'Karta' || paymentMethod === 'Card') {
            cardRevenue += totalPrice;
        } else {
            employeeAccountRevenue += totalPrice;
        }
    });

    let initialCash = 0;
    let totalDeposits = 0;
    let totalWithdrawals = 0;

    if (shiftNode.cashRegister) {
        initialCash = toAmount(shiftNode.cashRegister.initialAmount, 0);

        const depositsNode = shiftNode.cashRegister.deposits;
        if (depositsNode && depositsNode.deposit) {
            const deposits = Array.isArray(depositsNode.deposit) ? depositsNode.deposit : [depositsNode.deposit];
            totalDeposits = deposits.reduce((sum, dep) => sum + toAmount(dep.amount, 0), 0);
        }

        const withdrawalsNode = shiftNode.cashRegister.withdrawals;
        if (withdrawalsNode && withdrawalsNode.withdrawal) {
            const withdrawals = Array.isArray(withdrawalsNode.withdrawal) ? withdrawalsNode.withdrawal : [withdrawalsNode.withdrawal];
            totalWithdrawals = withdrawals.reduce((sum, wd) => sum + toAmount(wd.amount, 0), 0);
        }
    }

    const currentCashState = initialCash + cashRevenue + totalDeposits - totalWithdrawals;

    return {
        orderItems,
        totalRevenue,
        cashRevenue,
        cardRevenue,
        employeeAccountRevenue,
        orderCount,
        cancelledCount,
        initialCash,
        totalDeposits,
        totalWithdrawals,
        currentCashState,
        averageOrderValue: orderCount > 0 ? totalRevenue / orderCount : 0,
    };
}

function startShift(req, res) {
    try {
        const { bartender, initialCash } = req.body;

        if (!bartender) {
            return res.status(400).json({ message: '❌ Jméno barmana je povinné!' });
        }

        const cashAmount = Number(initialCash) || 0;
        const newShiftID = getNextShiftID();
        const now = new Date();
        const formattedDateTime = getISODateTime(now);
        const fileSafeDateTime = getFileSafeDateTime(now);

        const shiftsDir = path.join(__dirname, '..', 'data', 'shifts');
        common.ensureDirectoryExistence(shiftsDir);

        const shiftFileName = `${fileSafeDateTime}_${newShiftID}.xml`;
        const shiftFilePath = path.join(shiftsDir, shiftFileName);

        const shiftDoc = create({ version: '1.0' })
            .ele('shift', { id: newShiftID, startTime: formattedDateTime })
                .ele('bartender').txt(bartender).up()
                .ele('cashRegister')
                    .ele('initialAmount').txt(cashAmount.toFixed(2)).up()
                    .ele('deposits').up()
                    .ele('withdrawals').up()
                .up()
                .ele('orders').up()
            .up()
            .end({ prettyPrint: true });

        fs.writeFileSync(shiftFilePath, shiftDoc);

        console.log(`✅ Směna ID ${newShiftID} byla zahájena.`);

        res.json({
            message: `✅ Směna ID ${newShiftID} byla zahájena.`,
            shiftID: newShiftID,
            startTime: formattedDateTime,
            bartender,
            initialCash: cashAmount,
            fileName: shiftFileName,
        });
    } catch (error) {
        console.error('❌ Chyba při zahájení směny:', error);
        res.status(500).json({ message: 'Interní chyba serveru při zahájení směny.' });
    }
}

async function endShift(req, res) {
    try {
        console.log('🔚 Ukončení směny:', req.body);

        const { shiftID, bartenderWage } = req.body;
        if (!shiftID) {
            return res.status(400).json({ message: '❌ ID směny je povinné!' });
        }

        const shiftsDir = path.join(__dirname, '..', 'data', 'shifts');
        common.ensureDirectoryExistence(shiftsDir);

        const matchingFiles = fs.readdirSync(shiftsDir)
            .filter(file => file.endsWith(`_${shiftID}.xml`))
            .sort((a, b) => b.localeCompare(a));

        if (matchingFiles.length === 0) {
            return res.status(404).json({ message: '❌ Směna nebyla nalezena!' });
        }

        let selected = null;

        for (const fileName of matchingFiles) {
            const candidatePath = path.join(shiftsDir, fileName);
            const xmlData = fs.readFileSync(candidatePath, 'utf8');
            const jsonData = convert(xmlData, { format: 'object' });

            if (!jsonData.shift) {
                continue;
            }

            const existingEndTime = normaliseShiftEndTime(jsonData.shift.endTime || jsonData.shift['@endTime']);

            if (!selected) {
                selected = { filePath: candidatePath, jsonData, endTime: existingEndTime };
            }

            if (!existingEndTime) {
                selected = { filePath: candidatePath, jsonData, endTime: null };
                break;
            }
        }

        if (!selected) {
            return res.status(400).json({ message: '❌ Neplatný formát směny!' });
        }

        if (selected.endTime) {
            return res.status(400).json({ message: '❌ Směna již byla ukončena!' });
        }

        const { filePath, jsonData } = selected;

        const baseWageInput = toOptionalAmount(req.body.bartenderBaseWage);
        const tipsInput = toOptionalAmount(req.body.bartenderTips);
        const finalWageInput = toOptionalAmount(bartenderWage);
    const countedCashInput = toOptionalAmount(req.body.countedCash);
    const actualCashInput = toOptionalAmount(req.body.actualCashFinal);
        const actualCardInput = toOptionalAmount(req.body.actualCardTotal);
        const cashTipInput = toOptionalAmount(req.body.cashTips);
        const cardTipInput = toOptionalAmount(req.body.cardTips);
        const financials = computeShiftFinancials(jsonData.shift);

        const baseWage = baseWageInput !== null
            ? baseWageInput
            : (finalWageInput !== null ? finalWageInput : 0);

            let cardTipAmount = null;
            if (actualCardInput !== null) {
                cardTipAmount = actualCardInput - financials.cardRevenue;
            } else if (cardTipInput !== null) {
                cardTipAmount = cardTipInput;
            }

            let cashTipAmount = null;
            if (countedCashInput !== null) {
                cashTipAmount = countedCashInput - financials.currentCashState;
            } else if (cashTipInput !== null) {
                cashTipAmount = cashTipInput;
            }

            let tipTotal = null;
            if (cashTipAmount !== null || cardTipAmount !== null) {
                tipTotal = (cashTipAmount ?? 0) + (cardTipAmount ?? 0);
            } else if (tipsInput !== null) {
                tipTotal = tipsInput;
            }

            let finalWageAmount = finalWageInput !== null ? finalWageInput : baseWage;
            if (tipTotal !== null) {
                finalWageAmount = baseWage + tipTotal;
        }

        const now = new Date();
        const endTimeISO = getISODateTime(now);

        jsonData.shift.endTime = endTimeISO;
        jsonData.shift.bartenderBaseWage = baseWage.toFixed(2);
        jsonData.shift.bartenderWage = finalWageAmount.toFixed(2);

        if (tipTotal !== null) {
            jsonData.shift.bartenderTips = tipTotal.toFixed(2);
        }

        if (actualCashInput !== null) {
            jsonData.shift.cashRegister = jsonData.shift.cashRegister || {};
            jsonData.shift.cashRegister.actualEndAmount = actualCashInput.toFixed(2);
            jsonData.shift.closingCash = actualCashInput.toFixed(2);
        }

        if (countedCashInput !== null) {
            jsonData.shift.cashRegister = jsonData.shift.cashRegister || {};
            jsonData.shift.cashRegister.countedBeforePayout = countedCashInput.toFixed(2);
        }

        if (actualCardInput !== null) {
            jsonData.shift.payments = jsonData.shift.payments || {};
            jsonData.shift.payments.cardTerminalTotal = actualCardInput.toFixed(2);
            jsonData.shift.closingCard = actualCardInput.toFixed(2);
        }

        if (tipTotal !== null) {
            jsonData.shift.tips = jsonData.shift.tips || {};
            if (cashTipAmount !== null) {
                jsonData.shift.tips.cash = cashTipAmount.toFixed(2);
            }
            if (cardTipAmount !== null) {
                jsonData.shift.tips.card = cardTipAmount.toFixed(2);
            }
            jsonData.shift.tips.total = tipTotal.toFixed(2);
        }

        const updatedXmlData = create(jsonData).end({ prettyPrint: true });
        fs.writeFileSync(filePath, updatedXmlData);

        let backupResult = null;

        if (process.env.SHIFT_BACKUP_DISABLED === '1') {
            console.log('Shift backup preskocen (SHIFT_BACKUP_DISABLED=1).');
        } else {
            try {
                backupResult = await createShiftBackup();

                if (backupResult.uploaded) {
                    console.log(`Shift backup pripraven a nahran na GDrive (${backupResult.archiveName}).`);
                } else if (backupResult.uploadError) {
                    console.warn(`Shift backup ulozen lokalne, ale nahrani na GDrive selhalo: ${backupResult.uploadError}`);

                    if (backupResult.uploadErrorCode === 'OAUTH_TOKEN_MISSING') {
                        console.warn('Spustte autorizaci na strance GDrive zaloh a pote akci zopakujte.');
                    }

                    if (backupResult.uploadErrorCode === 'OAUTH_CLIENT_CONFIG_MISSING') {
                        console.warn('Chybi soubor service/local-configs/oauth-client.json s udaji OAuth klienta.');
                    }
                } else {
                    console.log(`Shift backup pripraven lokalne (${backupResult.archiveName}).`);
                }
            } catch (backupError) {
                const message = backupError && backupError.message ? backupError.message : String(backupError);
                console.error('Shift backup selhal:', message);
                backupResult = {
                    uploaded: false,
                    uploadError: message,
                    uploadErrorCode: backupError && backupError.code ? backupError.code : undefined,
                };
            }
        }

        console.log(`✅ Směna ID ${shiftID} byla ukončena v ${endTimeISO}.`);

        const tipSummary = tipTotal !== null ? {
            cash: cashTipAmount !== null ? cashTipAmount.toFixed(2) : null,
            card: cardTipAmount !== null ? cardTipAmount.toFixed(2) : null,
            total: tipTotal.toFixed(2),
        } : null;

        res.json({
            message: `✅ Směna ID ${shiftID} byla ukončena.`,
            endTime: endTimeISO,
            tips: tipSummary,
            backup: backupResult ? {
                uploaded: Boolean(backupResult.uploaded),
                uploadError: backupResult.uploadError ?? null,
                uploadErrorCode: backupResult.uploadErrorCode ?? null,
                archiveName: backupResult.archiveName ?? null,
                destination: backupResult.destination ?? null,
                baseFolderUrl: backupResult.baseFolderUrl ?? null,
            } : null,
        });
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

        const shiftNode = jsonData.shift;
        const financials = computeShiftFinancials(shiftNode);
        const {
            totalRevenue,
            cashRevenue,
            cardRevenue,
            employeeAccountRevenue,
            orderCount,
            cancelledCount,
            averageOrderValue,
            initialCash,
            totalDeposits,
            totalWithdrawals,
            currentCashState,
        } = financials;

        const shiftId = shiftNode['@id'] || shiftID;
        const startTime = shiftNode['@startTime'] || shiftNode.startTime || null;
        const rawEndTime = shiftNode.endTime || shiftNode['@endTime'] || null;
        const endTime = normaliseShiftEndTime(rawEndTime);
        const bartender = shiftNode.bartender || 'Neznámý';
        
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

        // === 💰 Výpočet mzdy barmana ===
        const wageParsed = toOptionalAmount(shiftNode.bartenderWage);
        let bartenderBaseWage = toOptionalAmount(shiftNode.bartenderBaseWage);
        let bartenderTips = toOptionalAmount(shiftNode.bartenderTips);

        if (bartenderBaseWage === null) {
            bartenderBaseWage = Number((totalRevenue * 0.10).toFixed(2));
        }

        let bartenderWage = wageParsed;
        if (bartenderWage === null && bartenderBaseWage !== null && bartenderTips !== null) {
            bartenderWage = Number((bartenderBaseWage + bartenderTips).toFixed(2));
        }

        if (bartenderWage === null) {
            bartenderWage = Math.round(durationHours * 200);
        }

        const countedBeforePayoutRaw = (shiftNode.cashRegister && shiftNode.cashRegister.countedBeforePayout) || null;
        const countedCashBeforePayout = toOptionalAmount(countedBeforePayoutRaw);

        const actualCashRaw = (shiftNode.cashRegister && shiftNode.cashRegister.actualEndAmount) || shiftNode.actualCashFinal || null;
        const actualCashFinal = toOptionalAmount(actualCashRaw);
        const actualCardRaw = (shiftNode.payments && shiftNode.payments.cardTerminalTotal) || shiftNode.actualCardTotal || null;
        const actualCardTotal = toOptionalAmount(actualCardRaw);

        const tipNode = shiftNode.tips || {};
        let cashDifference = toOptionalAmount(tipNode.cash);
        let cardDifference = toOptionalAmount(tipNode.card);
        let tipAmount = toOptionalAmount(tipNode.total);

        if (cardDifference === null && actualCardTotal !== null) {
            cardDifference = Number((actualCardTotal - cardRevenue).toFixed(2));
        }

        const baseWageValue = bartenderBaseWage ?? Number((totalRevenue * 0.10).toFixed(2));
        const cardTipPortion = cardDifference ?? 0;
        const finalCashState = Number((currentCashState - (baseWageValue + cardTipPortion)).toFixed(2));

        if (cashDifference === null && actualCashFinal !== null) {
            cashDifference = Number((actualCashFinal - finalCashState).toFixed(2));
        }

        if (tipAmount === null && (cashDifference !== null || cardDifference !== null)) {
            tipAmount = Number(((cashDifference ?? 0) + (cardDifference ?? 0)).toFixed(2));
        }

        if (bartenderTips === null && tipAmount !== null) {
            bartenderTips = tipAmount;
        }

        res.json({
            shiftID: shiftId,
            bartender: bartender,
            startTime: startTime || null,
            endTime: endTime || null,
            durationHours: durationHours.toFixed(2),
            bartenderWage: bartenderWage,
            bartenderBaseWage: bartenderBaseWage !== null ? bartenderBaseWage.toFixed(2) : null,
            bartenderTips: bartenderTips !== null ? bartenderTips.toFixed(2) : null,
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
            finalCashState: finalCashState.toFixed(2),
            countedCashBeforePayout: countedCashBeforePayout !== null ? countedCashBeforePayout.toFixed(2) : null,
            actualCashFinal: actualCashFinal !== null ? actualCashFinal.toFixed(2) : null,
            actualCardTotal: actualCardTotal !== null ? actualCardTotal.toFixed(2) : null,
            cashDifference: cashDifference !== null ? cashDifference.toFixed(2) : null,
            cardDifference: cardDifference !== null ? cardDifference.toFixed(2) : null,
            tipAmount: tipAmount !== null ? tipAmount.toFixed(2) : null,
            cashTips: cashDifference !== null ? cashDifference.toFixed(2) : null,
            cardTips: cardDifference !== null ? cardDifference.toFixed(2) : null,
        });

    } catch (error) {
        console.error("❌ Chyba při načítání směny:", error);
        res.status(500).json({ message: "❌ Interní chyba serveru." });
    }
}

function normaliseOrderList(shiftNode) {
    if (!shiftNode) {
        return [];
    }

    let orderItems = [];

    if (shiftNode.order) {
        orderItems = shiftNode.order;
    } else if (shiftNode.orders && shiftNode.orders.order) {
        orderItems = shiftNode.orders.order;
    }

    if (!Array.isArray(orderItems)) {
        orderItems = orderItems ? [orderItems] : [];
    }

    return orderItems;
}

function extractShiftId(shiftNode, fallback) {
    if (!shiftNode) {
        return fallback ?? null;
    }

    if (shiftNode['@id'] !== undefined) {
        return shiftNode['@id'];
    }

    if (shiftNode.id !== undefined) {
        return shiftNode.id;
    }

    return fallback ?? null;
}

function normaliseShiftEndTime(endTime) {
    if (endTime === undefined || endTime === null) {
        return null;
    }

    if (typeof endTime === 'object' && endTime['#text'] !== undefined) {
        return String(endTime['#text']);
    }

    return String(endTime);
}

function getShiftDetail(req, res) {
    try {
        const { shiftID, active } = req.query;
        const wantActive = active === '1' || active === 'true';
        const requestedId = shiftID ? String(shiftID) : null;

        if (!wantActive && !requestedId) {
            return res.status(400).json({ message: 'Musí být zadáno shiftID nebo aktivní směna.' });
        }

        const shiftsDir = path.join(__dirname, '..', 'data', 'shifts');
        common.ensureDirectoryExistence(shiftsDir);

        const files = fs.readdirSync(shiftsDir)
            .filter(file => file.match(/_\d+\.xml$/))
            .sort((a, b) => b.localeCompare(a));

        if (files.length === 0) {
            return res.status(404).json({ message: 'Nebyla nalezena žádná směna.' });
        }

        let fallbackClosedShift = null;

        for (const file of files) {
            const filePath = path.join(shiftsDir, file);
            const xmlData = fs.readFileSync(filePath, 'utf8');
            const jsonData = convert(xmlData, { format: 'object' });

            if (!jsonData.shift) {
                continue;
            }

            const shiftNode = jsonData.shift;
            const extractedId = extractShiftId(shiftNode, requestedId);
            const startTime = shiftNode['@startTime'] || shiftNode.startTime || null;
            const bartender = shiftNode.bartender || 'Neznámý';
            const endTimeRaw = shiftNode.endTime || shiftNode['@endTime'];
            const normalisedEndTime = normaliseShiftEndTime(endTimeRaw);
            const isActive = !normalisedEndTime || normalisedEndTime.trim() === '';
            const orderItems = normaliseOrderList(shiftNode);

            const resultPayload = {
                id: extractedId,
                startTime,
                endTime: isActive ? null : normalisedEndTime,
                bartender,
                orderCount: orderItems.length,
                orderItems,
                isActive,
                fileName: file
            };

            if (wantActive) {
                if (isActive) {
                    return res.json(resultPayload);
                }

                if (!fallbackClosedShift) {
                    fallbackClosedShift = resultPayload;
                }

                continue;
            }

            if (requestedId && extractedId !== null && String(extractedId) === requestedId) {
                return res.json(resultPayload);
            }
        }

        if (wantActive && fallbackClosedShift) {
            return res.json(fallbackClosedShift);
        }

        return res.status(404).json({ message: 'Směna nebyla nalezena.' });
    } catch (error) {
        console.error('❌ Chyba při čtení detailu směny:', error);
        res.status(500).json({ message: 'Interní chyba serveru při načítání detailu směny.' });
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

function getBartenders(req, res) {
    try {
        const shiftsDir = path.join(__dirname, '..', 'data', 'shifts');
        
        if (!fs.existsSync(shiftsDir)) {
            return res.json({ bartenders: [] });
        }

        const files = fs.readdirSync(shiftsDir);
        const bartendersSet = new Set();

        // Projdi všechny soubory směn
        files.forEach(file => {
            if (!file.endsWith('.xml')) return;

            try {
                const filePath = path.join(shiftsDir, file);
                const xmlData = fs.readFileSync(filePath, 'utf8');
                const jsonData = convert(xmlData, { format: 'object' });

                // Získej jméno barmana
                const bartender = jsonData.shift?.bartender;
                if (bartender && typeof bartender === 'string' && bartender.trim()) {
                    bartendersSet.add(bartender.trim());
                }
            } catch (err) {
                // Ignoruj chybné soubory
                console.warn(`⚠️ Nelze načíst barmana ze souboru ${file}`);
            }
        });

        // Převeď Set na pole a seřaď abecedně
        const bartenders = Array.from(bartendersSet).sort((a, b) => 
            a.localeCompare(b, 'cs', { sensitivity: 'base' })
        );

        res.json({ bartenders });

    } catch (error) {
        console.error("❌ Chyba při načítání barmanů:", error);
        res.status(500).json({ message: "❌ Interní chyba serveru." });
    }
}

module.exports = {
    findShiftFileByID,
    getNextShiftID,
    getShiftSummary,
    getShiftDetail,
    startShift,
    endShift,
    addDeposit,
    addWithdrawal,
    getBartenders
};