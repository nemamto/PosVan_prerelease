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
const shiftsDir = common.ensureDirectoryExistence(__dirname, '..', 'data', 'shifts');

// Přidání zákazníka
app.post('/addCustomer', (req, res) => {
    const { name } = req.body;
    const dataPath = path.join(__dirname, '..', 'data', 'customer_accounts');
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

/*
app.put('/orders/:id', (req, res) => {
    const orderId = req.params.id;
    const { payed } = req.body;

    if (!orderId || payed === undefined) {
        return res.status(400).json({ message: "Chybí povinné údaje (orderId nebo payed)." });
    }

    const shiftsDir = path.join(__dirname, 'data', 'shifts');
    const files = fs.readdirSync(shiftsDir).filter(file => file.endsWith('.xml'));

    let orderFound = false;

    files.forEach(file => {
        const filePath = path.join(shiftsDir, file);
        const xmlData = fs.readFileSync(filePath, 'utf8');
        let jsonData = convert(xmlData, { format: 'object', trim: true, ignoreAttributes: false });

        if (jsonData.shift && jsonData.shift.orders && jsonData.shift.orders.order) {
            let orders = Array.isArray(jsonData.shift.orders.order)
                ? jsonData.shift.orders.order
                : [jsonData.shift.orders.order];

            orders.forEach(order => {
                if (order['@id'] === orderId) {
                    order.payed = payed.toString();
                    orderFound = true;
                }
            });

            if (orderFound) {
                const updatedXml = create(jsonData).end({ prettyPrint: true });
                fs.writeFileSync(filePath, updatedXml);
            }
        }
    });

    if (!orderFound) {
        return res.status(404).json({ message: `Objednávka ID ${orderId} nebyla nalezena.` });
    }

    res.json({ message: `Objednávka ID ${orderId} byla aktualizována.` });
});
*/

app.delete('/deleteProduct', (req, res) => {
    products.deleteProduct(req, res); 
});

app.delete('/orders/:id', (req, res) => {
    orders.cancelOrder(req, res);
});



app.put('/orders/:id/restore', (req, res) => {
    orders.restoreOrder(req, res);
});

app.get('/shiftSummary', (req, res) => {
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

    const filePath = path.join(shiftsDir, matchingFile);

    try {
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

        // === 🔢 Výpočty tržeb ===
        let totalRevenue = 0;
        let cashRevenue = 0;
        let cardRevenue = 0;
        let employeeAccountRevenue = 0;

        orderList.forEach(order => {
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

        res.json({
            totalRevenue: totalRevenue.toFixed(2),
            cashRevenue: cashRevenue.toFixed(2),
            cardRevenue: cardRevenue.toFixed(2),
            employeeAccountRevenue: employeeAccountRevenue.toFixed(2)
        });

    } catch (error) {
        console.error("❌ Chyba při načítání směny:", error);
        res.status(500).json({ message: "❌ Interní chyba serveru." });
    }
});



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
        const { customerName, totalPrice, paymentMethod } = req.body;

        if (!customerName || !totalPrice || !paymentMethod) {
            console.error("❌ Chybí povinné údaje v requestu!");
            return res.status(400).json({ message: "Chybí povinné údaje (customerName, totalPrice nebo paymentMethod)!" });
        }

        const customerFilePath = path.join(__dirname, '..', 'data', 'customer_accounts', `${customerName.replace(/\s+/g, "_")}.xml`);

        if (!fs.existsSync(customerFilePath)) {
            console.error(`❌ Soubor zákazníka '${customerFilePath}' neexistuje!`);
            return res.status(404).json({ message: "Soubor zákazníka neexistuje." });
        }

        // ✅ Načti XML a převeď na JSON
        const xmlData = fs.readFileSync(customerFilePath, 'utf8');
        let jsonData = convert(xmlData, { format: 'object', trim: true, ignoreAttributes: false });

        console.log("🔍 Převedený JSON zákazníka:", JSON.stringify(jsonData, null, 2));

        if (!jsonData.customer || !jsonData.customer.orders || !jsonData.customer.orders.order) {
            console.warn("⚠️ Žádné objednávky nenalezeny.");
            return res.json({ message: "Žádné neuhrazené objednávky k aktualizaci." });
        }

        let updated = false;

        // ✅ Zajistíme, že `order` je vždy pole
        let orders = Array.isArray(jsonData.customer.orders.order)
            ? jsonData.customer.orders.order
            : [jsonData.customer.orders.order];

        orders.forEach(order => {
            if (order.payed === "false" || order["@payed"] === "false") {
                order.payed = "true"; // Nastavíme `payed="true"`
                updated = true;
            }
        });

        if (!updated) {
            console.log("❌ Žádné objednávky nebyly aktualizovány!");
            return res.json({ message: "Všechny objednávky již byly uhrazeny." });
        }

        // ✅ Převod zpět do XML a uložení
        const updatedXml = create({ version: '1.0' }).ele(jsonData).end({ prettyPrint: true });
        fs.writeFileSync(customerFilePath, updatedXml);

        console.log(`✅ Objednávky zákazníka '${customerName}' byly úspěšně aktualizovány jako zaplacené.`);

        // ✅ Přidání objednávky do aktuální směny
        const shiftFilePath = findShiftFileByID(); // Najdeme nebo vytvoříme aktuální směnu
        if (!shiftFilePath) {
            console.error("❌ Nebylo možné najít nebo vytvořit aktuální směnu!");
            return res.status(500).json({ message: "Nebyla nalezena aktuální směna." });
        }

        const shiftXmlData = fs.readFileSync(shiftFilePath, 'utf8');
        let shiftJsonData = convert(shiftXmlData, { format: 'object', trim: true, ignoreAttributes: false });

        if (!shiftJsonData.shift || !shiftJsonData.shift.orders) {
            shiftJsonData.shift.orders = { order: [] };
        }
        if (!Array.isArray(shiftJsonData.shift.orders.order)) {
            shiftJsonData.shift.orders.order = [shiftJsonData.shift.orders.order];
        }

        const now = new Date();
        const formattedDateTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
        const newOrderId = getNextOrderID();

        const newOrder = {
            "@id": newOrderId.toString(),
            "time": formattedDateTime,
            "paymentMethod": paymentMethod,
            "totalPrice": totalPrice.toString(),
            "products": `Účet zákazníka: ${customerName}`
        };

        shiftJsonData.shift.orders.order.push(newOrder);

        // ✅ Uložení zpět do směny
        const updatedShiftXml = create(shiftJsonData).end({ prettyPrint: true });
        fs.writeFileSync(shiftFilePath, updatedShiftXml);

        console.log(`✅ Platba účtu zákazníka '${customerName}' byla přidána do směny jako objednávka ID ${newOrderId}.`);

        res.json({ message: "Objednávky byly aktualizovány jako zaplacené a přidány do aktuální směny." });

    } catch (error) {
        console.error("❌ Chyba při aktualizaci objednávek:", error);
        res.status(500).json({ message: "Interní chyba serveru při aktualizaci objednávek." });
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
                startTime: shift.startTime || '---',
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
const { uploadFile, downloadFile } = require('./scripts/googleCloudStorage');
const os = require('os');

app.post('/startShift', async (req, res) => {
    try {
        const { bartender } = req.body;
        if (!bartender) {
            return res.status(400).json({ message: "❌ Jméno barmana je povinné!" });
        }

        const newShiftID = shifts.getNextShiftID();

        const now = new Date();
        const datePart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const timePart = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
        const formattedDateTime = `${datePart} ${timePart}`;

        const shiftsDir = path.join(__dirname, 'data', 'shifts');
        common.ensureDirectoryExistence(shiftsDir);

        // Vytvoření XML dokumentu s novým ID
        const xmlDoc = create({ version: '1.0' })
            .ele('shift', { id: newShiftID })
                .ele('startTime').txt(formattedDateTime).up()
                .ele('bartender').txt(bartender).up()
                .ele('orders').up()
            .up();

        const fileName = `${datePart}_${timePart}_${newShiftID}.xml`;
        const filePath = path.join(shiftsDir, fileName);
        fs.writeFileSync(filePath, xmlDoc.end({ prettyPrint: true }));

        console.log(`✅ Vytvořena nová směna: ${fileName} (ID: ${newShiftID}, Barman: ${bartender})`);
        res.json({
            message: `✅ Směna ${newShiftID} byla zahájena.`,
            shiftID: newShiftID,
            bartender,
            startTime: formattedDateTime
        });
    } catch (error) {
        console.error('❌ Chyba při zahájení směny:', error);
        res.status(500).json({ message: 'Interní chyba serveru při zahájení směny.' });
    }
});


// Endpoint pro ukončení směny
app.post('/endShift', async (req, res) => {
    try {
        console.log('🔚 Ukončení směny:', req.body);
        const { shiftID } = req.body;
        if (!shiftID) {
            return res.status(400).json({ message: "❌ ID směny je povinné!" });
        }

        const shiftsDir = path.join(__dirname, 'data', 'shifts');
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
        const localTime = now.toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' });

        jsonData.shift.endTime = localTime;

        const updatedXmlData = create(jsonData).end({ prettyPrint: true });
        fs.writeFileSync(filePath, updatedXmlData);

        console.log(`✅ Směna ID ${shiftID} byla ukončena v ${localTime}.`);

        res.json({ message: `✅ Směna ID ${shiftID} byla ukončena.`, endTime: localTime });
    } catch (error) {
        console.error('❌ Chyba při ukončení směny:', error);
        res.status(500).json({ message: 'Interní chyba serveru při ukončení směny.' });
    }
});

//přidání produktu
app.post('/addProduct', (req, res) => {
    const { name, description, quantity, price, color } = req.body;
    const productColor = color || "#ccc";

    if (!name || quantity <= 0 || price <= 0) {
        return res.status(400).json({ message: "Neplatné vstupy." });
    }

    const productsPath = products.ensureProductsXML(); // Ujistíme se, že soubor existuje
    const newProduct = {
        '@id': getNextProductID().toString(),
        Name: name,
        Description: description ? description.toString() : '',
        Quantity: quantity.toString(),
        Price: price.toString(),
        Color: productColor
    };

    try {
        // Načíst existující produkty
        const xmlData = fs.readFileSync(productsPath, 'utf8');
        let jsonData = convert(xmlData, { format: 'object' });

        if (!jsonData.products) {
            jsonData.products = { product: [] };
        }
        if (!Array.isArray(jsonData.products.product)) {
            jsonData.products.product = [jsonData.products.product];
        }

        // Přidání nového produktu
        jsonData.products.product.push(newProduct);

        // Zápis zpět do XML
        const updatedXml = create(jsonData).end({ prettyPrint: true });
        fs.writeFileSync(productsPath, updatedXml);

        console.log("✅ Produkt přidán do XML:", newProduct);
        res.status(201).json({ message: "Produkt přidán", product: newProduct });

    } catch (error) {
        console.error('❌ Chyba při zápisu do XML:', error);
        res.status(500).json({ message: "Chyba při ukládání produktu." });
    }
});
// Pomocná funkce pro nalezení souboru směny podle shiftID nebo vytvoření nové směny


app.put('/markCustomerOrderAsPaid', (req, res) => {
    const { customerName, orderId } = req.body;

    if (!customerName || !orderId) {
        return res.status(400).json({ message: 'Chybí jméno zákazníka nebo ID objednávky.' });
    }

    const customersFolder = path.join(__dirname, 'data', 'customer_accounts');
    const fileName = customerName.replace(/\s+/g, '_') + '.xml';
    const customerFilePath = path.join(customersFolder, fileName);

    if (!fs.existsSync(customerFilePath)) {
        return res.status(404).json({ message: `Soubor pro zákazníka ${customerName} neexistuje.` });
    }

    try {
        const xmlData = fs.readFileSync(customerFilePath, 'utf8');
        const customerDoc = convert(xmlData, { format: 'object' });

        let orders = customerDoc.customer.orders?.order || [];

        if (!Array.isArray(orders)) {
            orders = [orders];
        }

        const order = orders.find(o => o['@id'] === orderId);
        if (!order) {
            return res.status(404).json({ message: `Objednávka ID ${orderId} nebyla nalezena.` });
        }

        order['@payed'] = 'true';

        const updatedXml = create(customerDoc).end({ prettyPrint: true });
        fs.writeFileSync(customerFilePath, updatedXml);

        console.log(`✅ Objednávka ID ${orderId} označena jako zaplacená pro zákazníka ${customerName}`);
        res.status(200).json({ message: `Objednávka ${orderId} označena jako zaplacená.` });
    } catch (error) {
        console.error('❌ Chyba při aktualizaci zákaznického účtu:', error);
        res.status(500).json({ message: 'Interní chyba serveru.' });
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
/*
function addOrUpdateProduct(product) {
    const dataPath = path.join(__dirname, 'data');
    const productsPath = path.join(dataPath, 'products.xml');
    common.ensureDirectoryExistence(dataPath);

    let xmlDoc;
    if (fs.existsSync(productsPath)) {
        const existingData = fs.readFileSync(productsPath, 'utf8');
        xmlDoc = create(existingData).root();
    } else {
        xmlDoc = create({ version: '1.0' }).ele('products');
    }

    let productNode = xmlDoc.find((node) => node.get('id') === product.id.toString());

    if (productNode) {
        productNode.ele('Name').txt(product.name);
        productNode.ele('Description').txt(product.description);
        productNode.ele('Price').txt(product.price);
    } else {
        productNode = xmlDoc.ele('product', { id: product.id });
        productNode.ele('Name').txt(product.name);
        productNode.ele('Description').txt(product.description);
        productNode.ele('Price').txt(product.price);
    }

    fs.writeFileSync(productsPath, xmlDoc.end({ prettyPrint: true, indent: '\t' }));
}
*/
app.post('/logOrder', (req, res) => {
    console.log("📥 Přijatý request body:", req.body); // Debug
    const { order, paymentMethod, totalAmount, selectedCustomer, shiftID } = req.body;

    if (!shiftID) {
        return res.status(400).json({ message: '❌ Shift ID není definováno!' });
    }

    const orderID = orders.getNextOrderID();
    const paymentInfo = paymentMethod === 'Účet zákazníka' ? selectedCustomer : paymentMethod;

    const orderLog = {
        OrderID: orderID,
        PaymentMethod: paymentInfo,
        TotalPrice: totalAmount,
        OrderDetails: order.map(product => ({
            ProductID: product.id, // Přidáme ID produktu
            Product: product.name,
            Quantity: product.quantity,
            UnitPrice: product.price,
            TotalProductPrice: product.totalPrice
        }))
    };

    // 🟢 Uložení objednávky do směny
    orders.saveOrderToShift(orderLog, shiftID);

    // 🟢 Uložení do zákaznického účtu, pokud platba je "Účet zákazníka"
    if (paymentMethod === 'Účet zákazníka' || paymentMethod === selectedCustomer && selectedCustomer) {
        console.log(`💾 Ukládám zákaznickou objednávku pro: ${selectedCustomer}`);
        orders.savecustomerOrderAsXML(orderLog, selectedCustomer, orderID, totalAmount);
    }

    // 🟢 Aktualizace skladu
    const productsPath = path.join(__dirname, 'data', 'products.xml');
    if (fs.existsSync(productsPath)) {
        try {
            const xmlData = fs.readFileSync(productsPath, 'utf8');
            let xmlDoc = convert(xmlData, { format: 'object' });

            let products = xmlDoc.products?.product || [];
            if (!Array.isArray(products)) products = [products];

            order.forEach(orderedProduct => {
                if (!orderedProduct.id) {
                    console.error(`❌ Chybí ID pro produkt: ${orderedProduct.name}`);
                    return;
                }
            
                const productInXml = products.find(p => p['@id'] === orderedProduct.id.toString());
                if (productInXml) {
                    const currentQuantity = parseInt(productInXml.Quantity, 10) || 0;
                    const newQuantity = Math.max(0, currentQuantity - orderedProduct.quantity);
                    console.log(`🔽 Odečítám produkt ${productInXml.Name}: ${currentQuantity} ➝ ${newQuantity}`);
                    productInXml.Quantity = newQuantity.toString();
                } else {
                    console.warn(`⚠️ Produkt s ID ${orderedProduct.id} nebyl nalezen ve skladu!`);
                }
            });

            const updatedXml = create(xmlDoc).end({ prettyPrint: true });
            fs.writeFileSync(productsPath, updatedXml);
            console.log('✅ Sklad úspěšně aktualizován.');
        } catch (error) {
            console.error('❌ Chyba při aktualizaci skladu:', error);
        }
    } else {
        console.error(`❌ Soubor ${productsPath} neexistuje!`);
    }

    res.json({ message: `✅ Objednávka ID ${orderID} byla uložena do směny ${shiftID} a sklad byl aktualizován.` });
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
