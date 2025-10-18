const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { create, convert } = require('xmlbuilder2');
const { timeStamp } = require('console');
const products = require('./scripts/service_products');
const orders = require('./scripts/service_orders');
const shifts = require('./scripts/service_shift');
const common = require('./scripts/service_common');
const app = express();
const PORT = process.env.PORT || '666';  // Fallback na 3000 při lokálním běhu


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

// Obsluha statických souborů (např. index.html, style.css, atd.)
app.use(express.static(path.join(__dirname, '..', 'client')));

// Otevření `index.html` při přístupu na `/`
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});





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
            
            const orderCount = orderItems.length;
            return {
                id: shift['@id'] || '---',
                startTime: shift['@startTime'] || shift.startTime || '---',
                endTime: shift.endTime || 'Probíhá',
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


// Endpoint pro ukončení směny
app.post('/endShift', shifts.endShift);

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


// Endpoint pro načítání kategorií
app.get('/categories', (req, res) => {
    const categoriesPath = path.join(__dirname, 'data', 'categories.json');
    try {
        const data = fs.readFileSync(categoriesPath, 'utf8');
        const categories = JSON.parse(data);
        res.json(categories);
    } catch (error) {
        res.status(500).json({ message: "Chyba při načítání kategorií." });
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
