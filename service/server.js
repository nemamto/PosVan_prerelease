const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { create, convert } = require('xmlbuilder2');
const { timeStamp } = require('console');
const products = require('./scripts/service_products');
const orders = require('./scripts/service_orders');
const shifts = require('./scripts/service_shift');
const { listDriveBackupInventory } = require('./scripts/drive_inventory');
const {
    getLocalBackupInventory,
    restoreLocalBackupByName,
    restoreDataFromDrive,
} = require('./scripts/shift_backup');
const {
    generateAuthUrl,
    completeOAuthWithCode,
    hasStoredTokens,
    OAuthTokenMissingError,
    OAuthClientConfigMissingError,
} = require('./scripts/googleDriveClient');
const common = require('./scripts/service_common');
const categoriesService = require('./scripts/service_categories');
const app = express();
const PORT = process.env.PORT || '666';  // Fallback na 3000 při lokálním běhu

const {
    validateProductIds,
    reassignProductIds
} = require('./scripts/service_products_ids');

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}


const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
/*
function getLogFilePath() {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
    return path.join(logDir, `${dateStr}.log`);
}
*/

const origLog = console.log;
const origWarn = console.warn;
const origError = console.error;

console.log = (...args) => { common.appendLog('INFO', ...args); origLog(...args); };
console.warn = (...args) => { common.appendLog('WARN', ...args); origWarn(...args); };
console.error = (...args) => { common.appendLog('ERROR', ...args); origError(...args); };

app.use(cors());
app.use(express.json());

// Otevření `index.html` při přístupu na `/`
app.get('/', (req, res, next) => {
    const code = typeof req.query.code === 'string' ? req.query.code.trim() : '';
    if (code) {
        console.log('🔁 OAuth redirect zachycen na /, dokončuji autorizaci...');
        const scope = typeof req.query.scope === 'string' ? req.query.scope : '';
        const escapedScope = escapeHtml(scope);
        const html = [
            '<!DOCTYPE html>',
            '<html lang="cs">',
            '<head>',
            '    <meta charset="utf-8">',
            '    <title>Google Drive autorizace</title>',
            '    <meta name="viewport" content="width=device-width, initial-scale=1">',
            '    <style>',
                    '        body { font-family: Arial, sans-serif; margin: 0; padding: 24px; background: #f6f7fb; color: #1f2333; }',
                    '        .card { max-width: 520px; margin: 8vh auto; background: #fff; border-radius: 12px; padding: 28px; box-shadow: 0 12px 30px -12px rgba(19, 23, 56, 0.25); }',
                    '        h1 { font-size: 22px; margin-top: 0; }',
                    '        p { line-height: 1.55; margin-bottom: 12px; }',
                    '        .status { padding: 12px 16px; background: #eef2ff; border-radius: 8px; margin: 20px 0; font-size: 16px; }',
                    '        .status--error { background: #fdecea; color: #b3261e; }',
                    '        .status--success { background: #e6f4ea; color: #0b6b2b; }',
                    '        .hint { font-size: 14px; color: #555; }',
            '    </style>',
            '</head>',
            '<body>',
            '    <main class="card">',
            '        <h1>Dokončujeme autorizaci Google Drive</h1>',
            '        <p>Prosím chvíli strpení, odesílám ověřovací kód zpět do aplikace.</p>',
            '        <div id="status" class="status">Odesílám ověřovací kód...</div>',
            scope ? '        <p class="hint">Rozsah oprávnění: ' + escapedScope + '</p>' : '',
            '        <p class="hint">Okno se za okamžik přesměruje zpět na přehled záloh. Pokud k tomu nedojde, vrať se do aplikace ručně.</p>',
            '    </main>',
            '    <script>',
            '        const statusEl = document.getElementById("status");',
            '        const code = ', JSON.stringify(code), ';',
            '        async function finishAuth() {',
            '            try {',
            '                const response = await fetch("/gdrive/oauth/complete", {',
            '                    method: "POST",',
            '                    headers: { "Content-Type": "application/json" },',
            '                    body: JSON.stringify({ code }),',
            '                });',
            '                const payload = await response.json().catch(() => ({}));',
            '                if (!response.ok) {',
            '                    throw new Error(payload.message || "Server vrátil chybu");',
            '                }',
            '                statusEl.textContent = "Autorizace dokončena, vracím tě zpět do přehledu záloh...";',
            '                statusEl.classList.add("status--success");',
            '                setTimeout(() => { window.location.href = "/gdrive.html?auth=success"; }, 1200);',
            '            } catch (error) {',
            '                statusEl.textContent = "Autorizaci se nepodařilo dokončit: " + error.message;',
            '                statusEl.classList.add("status--error");',
            '            }',
            '        }',
            '        finishAuth();',
            '    </script>',
            '</body>',
            '</html>'
        ].join('\n');

        res.status(200).type('html').send(html);
        return;
    }

    res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

// Obsluha statických souborů (např. index.html, style.css, atd.)
app.use(express.static(path.join(__dirname, '..', 'client')));





// Zajistíme, že složka `data/shifts` existuje
const shiftsDir = common.ensureDirectoryExistence(__dirname, 'data', 'shifts');

// Přidání zákazníka
app.post('/addCustomer', (req, res) => {
    const { name } = req.body;
    const dataPath = path.join(__dirname, 'data', 'customer_accounts');
    const customerFilePath = path.join(dataPath, `${name.replace(/\s/g, '_')}.xml`);

    common.ensureDirectoryExistence(dataPath);

    if (fs.existsSync(customerFilePath)) {
        return res.status(400).json({ message: 'Zákazník již existuje.' });
    }

    const xmlDoc = create({ version: '1.0' }).ele('customer', { name }).end({ prettyPrint: true });
    fs.writeFileSync(customerFilePath, xmlDoc);
    res.json({ message: 'Zákazník byl úspěšně přidán.' });
});

app.put('/activateProduct', (req, res) => {
    try {
        const { id } = req.body;
        const result = products.activateProduct(id);
        res.json(result);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});


app.put('/deactivateProduct', (req, res) => {
    const { id } = req.body;

    try {
        const result = products.deactivateProduct(id); // použij products.deactivateProduct
        res.json(result);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});


app.delete('/deleteProduct', (req, res) => {
    products.deleteProduct(req, res); 
});

app.delete('/orders/:id', (req, res) => {
    orders.cancelOrder(req, res);
});



app.put('/orders/:id/restore', (orders.restoreOrder));


app.get('/shiftSummary', shifts.getShiftSummary);
app.get('/shiftDetail', shifts.getShiftDetail);


// Smazání zákazníka
app.delete('/deleteCustomer', (req, res) => {
    const { name } = req.body;
    const customerFilePath = path.join(__dirname, 'data', 'customer_accounts', `${name.replace(/\s/g, '_')}.xml`);

    if (!fs.existsSync(customerFilePath)) {
        return res.status(404).json({ message: 'Zákazník neexistuje.' });
    }

    fs.unlinkSync(customerFilePath);
    res.json({ message: `Zákazník ${name} byl smazán.` });
});


// Endpoint pro získání objednávek zákazníka
app.get('/customerOrders', (req, res) => {
    try {
        let customerName = req.query.customer;
        console.log(`📥 Přijatý požadavek na načtení objednávek pro zákazníka: ${customerName}`);

        // ✅ Nahrazení mezer podtržítkem pro správný název souboru
        const sanitizeFileName = (name) => name.replace(/\s+/g, "_");
        const customerFileName = sanitizeFileName(customerName);
        const customerFilePath = path.join(__dirname, 'data', 'customer_accounts', `${customerFileName}.xml`);

        if (!fs.existsSync(customerFilePath)) {
            console.error(`❌ Soubor zákazníka '${customerFilePath}' neexistuje!`);
            return res.status(404).json({ message: "Soubor zákazníka neexistuje." });
        }

        const xmlData = fs.readFileSync(customerFilePath, 'utf8');
        console.log(`✅ Načtený XML soubor: \n${xmlData}`);

        let jsonData;
        try {
            jsonData = convert(xmlData, { format: 'object', trim: true, ignoreComments: false });
            console.log('🔍 Převedený JSON:', JSON.stringify(jsonData, null, 2));
        } catch (xmlError) {
            console.error('❌ Chyba při parsování XML:', xmlError);
            return res.status(500).json({ message: "Chyba při parsování XML." });
        }

        let orders = jsonData.customer?.orders?.order || [];

        // ✅ Pokud je orders objekt, převedeme ho na pole
        if (!Array.isArray(orders)) {
            orders = [orders];
        }

        // ✅ Filtrování objednávek (nezrušené objednávky)
        const activeOrders = orders.filter(order => order['@cancelled'] !== 'true');

        console.log(`✅ Vrácené objednávky:`, activeOrders);
        res.json(activeOrders);

    } catch (error) {
        console.error("❌ Chyba při načítání objednávek:", error);
        res.status(500).json({ message: "Interní chyba serveru.", error: error.toString() });
    }
});

app.post('/payOrder', (req, res) => {
    try {
        const result = orders.payOrder(req.body);
        res.status(200).json(result);
    } catch (error) {
        console.error("❌ Chyba při zpracování platby objednávky:", error.message);
        res.status(400).json({ message: error.message });
    }
});

// Endpoint pro načítání směn
app.get('/shifts', (req, res) => {
    const shiftsDir = path.join(__dirname, 'data', 'shifts');
    const page = parseInt(req.query.page) || 1;
    const itemsPerPage = 10;

    if (!fs.existsSync(shiftsDir)) {
        fs.mkdirSync(shiftsDir, { recursive: true });
        return res.json({ currentPage: page, totalPages: 0, totalFiles: 0, shifts: [] });
    }

    try {
        const files = fs.readdirSync(shiftsDir)
            .filter(file => file.match(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_\d+\.xml$/))
            .sort((a, b) => b.localeCompare(a));

        const totalFiles = files.length;
        const totalPages = Math.ceil(totalFiles / itemsPerPage);
        const paginatedFiles = files.slice((page - 1) * itemsPerPage, page * itemsPerPage);

        const allShifts = paginatedFiles.map(file => {
            const filePath = path.join(shiftsDir, file);
            const xmlData = fs.readFileSync(filePath, 'utf8');
            const jsonData = convert(xmlData, { format: 'object' });
            const shift = jsonData.shift;
            
            let orderItems = [];
            if (shift.order) {
                orderItems = shift.order;
            } else if (shift.orders && shift.orders.order) {
                orderItems = shift.orders.order;
            }
            if (!Array.isArray(orderItems)) {
                orderItems = orderItems ? [orderItems] : [];
            }
            
            let rawEndTime = shift.endTime ?? shift['@endTime'] ?? '';
            if (rawEndTime && typeof rawEndTime === 'object' && rawEndTime['#text'] !== undefined) {
                rawEndTime = rawEndTime['#text'];
            }
            const endTimeString = rawEndTime === null || rawEndTime === undefined ? '' : String(rawEndTime);
            const trimmedEndTime = endTimeString.trim();
            const isActive = trimmedEndTime.length === 0;

            const orderCount = orderItems.length;
            return {
                id: shift['@id'] || '---',
                startTime: shift['@startTime'] || shift.startTime || '---',
                endTime: isActive ? 'Probíhá' : trimmedEndTime,
                isActive,
                orderCount,
                orderItems, // Detailní objednávky
                fileName: file
            };
        });

        res.json({
            currentPage: page,
            totalPages,
            totalFiles,
            shifts: allShifts,
        });
    } catch (error) {
        console.error('❌ Chyba při načítání směn:', error);
        res.status(500).json({ message: 'Chyba při načítání směn.' });
    }
});


// Endpoint pro zahájení směny
//const { uploadFile, downloadFile } = require('./scripts/googleCloudStorage');
const os = require('os');

app.post('/startShift', shifts.startShift);
app.post('/endShift', shifts.endShift);
app.post('/deposit', shifts.addDeposit);
app.post('/withdrawal', shifts.addWithdrawal);
app.get('/bartenders', shifts.getBartenders);

app.get('/gdrive/backups', async (req, res) => {
    const localBackups = getLocalBackupInventory();

    try {
        const inventory = await listDriveBackupInventory();

        if (inventory.errorCode === 'OAUTH_TOKEN_MISSING') {
            return res.json({
                needsAuth: true,
                message: 'Google Drive neni autorizovan. Dokoncete prihlaseni.',
                baseFolderUrl: inventory.baseFolderUrl || null,
                localBackups,
            });
        }

        if (inventory.errorCode === 'OAUTH_CLIENT_CONFIG_MISSING') {
            return res.json({
                needsAuth: true,
                missingClient: true,
                message: 'Chybi konfigurace OAuth klienta (service/local-configs/oauth-client.json).',
                baseFolderUrl: inventory.baseFolderUrl || null,
                localBackups,
            });
        }

        if (inventory.error) {
            return res.status(500).json({
                message: inventory.error,
                localBackups,
            });
        }

        res.json({
            ...inventory,
            localBackups,
        });
    } catch (error) {
        if (error instanceof OAuthTokenMissingError) {
            return res.json({
                needsAuth: true,
                message: 'Google Drive neni autorizovan. Dokoncete prihlaseni.',
                baseFolderUrl: null,
                localBackups,
            });
        }

        if (error instanceof OAuthClientConfigMissingError) {
            return res.json({
                needsAuth: true,
                missingClient: true,
                message: 'Chybi konfigurace OAuth klienta (service/local-configs/oauth-client.json).',
                baseFolderUrl: null,
                localBackups,
            });
        }

        console.error('Chyba pri nacitani GDrive zaloh:', error);
        res.status(500).json({
            message: 'Nelze nacist GDrive zalohy.',
            error: error && error.message ? error.message : String(error),
            localBackups,
        });
    }
});

app.get('/products/ids/check', (req, res) => {
    try {
        const report = validateProductIds();
        res.json(report);
    } catch (error) {
        console.error('❌ Kontrola ID produktů selhala:', error);
        res.status(500).json({
            message: 'Kontrola ID produktů selhala.',
            error: error && error.message ? error.message : String(error)
        });
    }
});

app.post('/products/ids/reassign', (req, res) => {
    try {
        const report = reassignProductIds();
        res.json(report);
    } catch (error) {
        console.error('❌ Obnova ID produktů selhala:', error);
        res.status(500).json({
            message: 'Obnova ID produktů selhala.',
            error: error && error.message ? error.message : String(error)
        });
    }
});

app.get('/gdrive/oauth/status', (req, res) => {
    res.json({ hasToken: hasStoredTokens() });
});

app.get('/gdrive/oauth/url', (req, res) => {
    try {
        const authUrl = generateAuthUrl();
        res.json({ authUrl });
    } catch (error) {
        if (error instanceof OAuthClientConfigMissingError) {
            res.status(400).json({ message: 'Chybi konfigurace OAuth klienta (service/local-configs/oauth-client.json).' });
        } else {
            res.status(500).json({ message: error && error.message ? error.message : String(error) });
        }
    }
});

app.post('/gdrive/oauth/complete', async (req, res) => {
    const code = req.body && typeof req.body.code === 'string' ? req.body.code.trim() : '';
    if (!code) {
        return res.status(400).json({ message: 'Chybi overovaci kod.' });
    }

    try {
        console.log('🔁 Přijatý OAuth kód z prohlížeče');
        await completeOAuthWithCode(code);
        console.log('✅ OAuth token úspěšně uložen');
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Dokončení OAuth selhalo:', error);
        if (error instanceof OAuthClientConfigMissingError) {
            res.status(400).json({ message: 'Chybi konfigurace OAuth klienta (service/local-configs/oauth-client.json).' });
            return;
        }

        res.status(400).json({ message: error && error.message ? error.message : String(error) });
    }
});

app.post('/gdrive/backups/restore', async (req, res) => {
    const payload = req.body || {};

    if (!payload || typeof payload !== 'object') {
        return res.status(400).json({ message: 'Chybi data s informacemi o zaloze.' });
    }

    const deviceName = typeof payload.deviceLabel === 'string' ? payload.deviceLabel : (typeof payload.deviceName === 'string' ? payload.deviceName : null);
    const createSafetyBackup = payload.createSafetyBackup !== false;

    try {
        let result;

        if (payload.sourceType === 'local') {
            if (!payload.fileName || typeof payload.fileName !== 'string') {
                return res.status(400).json({ message: 'Pro lokalni obnovu je nutne zadat fileName.' });
            }
            console.log(`🔁 Obnova lokalni zalohy ${payload.fileName}`);
            result = await restoreLocalBackupByName(payload.fileName, { deviceName, createSafetyBackup });
        } else if (payload.sourceType === 'drive') {
            if (!payload.fileId || typeof payload.fileId !== 'string') {
                return res.status(400).json({ message: 'Pro vzdalenou obnovu je nutne zadat fileId.' });
            }
            console.log(`🔁 Obnova vzdalené zalohy ${payload.fileId} (${payload.fileName || 'bez nazvu'})`);
            result = await restoreDataFromDrive(payload.fileId, {
                fileName: payload.fileName,
                deviceName,
                deviceLabel: payload.deviceLabel,
                dateGroup: payload.dateGroup,
                createSafetyBackup,
            });
        } else {
            return res.status(400).json({ message: 'Neznamy typ zalohy. Ocekavam "local" nebo "drive".' });
        }

        res.json({
            success: true,
            restoredAt: result.restoredAt,
            sourceArchive: result.sourceArchive,
            sourceType: result.sourceType || payload.sourceType,
            safetyDataPath: result.safetyDataPath || null,
            safetyBackup: result.safetyBackup ? {
                archivePath: result.safetyBackup.archivePath,
                uploaded: Boolean(result.safetyBackup.uploaded),
            } : null,
        });
    } catch (error) {
        console.error('❌ Obnova zalohy selhala:', error);
        res.status(500).json({
            message: error && error.message ? error.message : String(error),
        });
    }
});

app.post('/addProduct', (req, res) => {
    console.log("📥 Přijatý požadavek na přidání produktu:", req.body); // Debug log
    try {
        const result = products.addProduct(req.body);
        res.status(201).json(result);
    } catch (error) {
        console.error('❌ Chyba při přidávání produktu:', error);
        res.status(400).json({ message: error.message });
    }
});

app.put('/markCustomerOrderAsPaid', (req, res) => {
    try {
        const { customerName, orderId } = req.body;

        if (!customerName || !orderId) {
            console.error('❌ Chybí jméno zákazníka nebo ID objednávky.');
            return res.status(400).json({ message: 'Chybí jméno zákazníka nebo ID objednávky.' });
        }

        const result = products.markCustomerOrderAsPaid(req.body);
        console.log(`✅ Objednávka ID ${orderId} zákazníka ${customerName} označena jako zaplacená.`);
        res.status(200).json(result);
    } catch (error) {
        console.error('❌ Chyba při označování objednávky jako zaplacené:', error.message);
        res.status(400).json({ message: error.message });
    }
});

app.put('/updateProduct', (req, res) => {
    console.log("PUT /updateProduct", req.body);
    try {
        const result = products.updateProduct(req.body);
        res.json(result);
    } catch (error) {
        console.error("Chyba v updateProduct:", error);
        res.status(400).json({ message: error.message });
    }
});

app.post('/logOrder', (req, res) => {
    console.log("📥 Přijatý request body:", req.body); // Debug
    try {
        const result = orders.logOrder(req.body);
        res.status(200).json(result);
    } catch (error) {
        console.error("❌ Chyba při logování objednávky:", error.message);
        res.status(400).json({ message: error.message });
    }
});


const shiftsFile = path.join(__dirname, 'data', 'shifts.json');

// 🟢 Načtení aktuální směny
app.get('/currentShift', common.currentShift);


// Správa kategorií
app.get('/categories', (req, res) => {
    try {
        const categories = categoriesService.readCategories();
        res.json(categories);
    } catch (error) {
        res.status(500).json({ message: error.message || 'Chyba při načítání kategorií.' });
    }
});

app.post('/categories', (req, res) => {
    try {
        const category = categoriesService.addCategory(req.body || {});
        res.status(201).json({ message: 'Kategorie byla přidána.', category });
    } catch (error) {
        const message = error.message || 'Chyba při přidávání kategorie.';
        const status = message.includes('existuje') ? 409 : 400;
        res.status(status).json({ message });
    }
});

app.put('/categories/:originalName', (req, res) => {
    const { originalName } = req.params;
    try {
        const category = categoriesService.updateCategory(originalName, req.body || {});
        res.json({ message: 'Kategorie byla aktualizována.', category });
    } catch (error) {
        const message = error.message || 'Chyba při aktualizaci kategorie.';
        const status = message.includes('nebyla nalezena') ? 404 : 400;
        res.status(status).json({ message });
    }
});

app.get('/products', (req, res) => {
    const productsPath = products.ensureProductsXML();

    try {
        const xmlData = fs.readFileSync(productsPath, 'utf8');
        const jsonData = convert(xmlData, { format: 'object' });

        let products = jsonData.products?.product || [];
        if (!Array.isArray(products)) {
            products = [products];
        }

        //console.log('Odesílané produkty:', products);

        res.json(products.map(product => ({
            id: product['@id'],
            name: product.Name || '',
            price: product.Price || '',
            description: product.Description || '',
            quantity: product.Quantity || 0,
            color: product.Color || '#ccc',
            category: product.Category || 'Nezařazeno',
            active: product['@active'] === "false" ? "false" : "true" // ✅ Oprava: správné načítání `active`
        })));
    } catch (error) {
        console.error('Chyba při načítání produktů:', error);
        res.status(500).json({ message: 'Chyba při načítání produktů' });
    }
});



app.get('/customers', (req, res) => {
    const customerDir = path.join(__dirname, 'data', 'customer_accounts');
    const customers = [];

    if (!fs.existsSync(customerDir)) {
        console.error(`Složka ${customerDir} neexistuje!`);
        return res.status(404).json({ message: 'Složka se zakazniky nebyla nalezena.' });
    }

    const files = fs.readdirSync(customerDir).filter(file => file.endsWith('.xml'));

    files.forEach((file, index) => {
        const name = file.replace(/_/g, ' ').replace('.xml', '');
        customers.push({ id: index + 1, name });
    });

    res.json(customers);
});

products.ensureProductsXML();

app.listen(PORT, () => {
    console.log(`Server běží na portu ${PORT}`);
});
