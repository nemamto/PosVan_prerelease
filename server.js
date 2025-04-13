const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { create, convert } = require('xmlbuilder2');
const { timeStamp } = require('console');

const app = express();
const PORT = process.env.PORT || '3000';  // Fallback na 3000 při lokálním běhu

app.use(cors());
app.use(express.json());

// Obsluha statických souborů (např. index.html, style.css, atd.)
app.use(express.static(path.join(__dirname,)));

// Otevření `index.html` při přístupu na `/`
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Pomocná funkce pro zajištění existence složky
function ensureDirectoryExistence(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function getNextOrderID() {
    const idsDir = path.join(__dirname, 'data', 'ids');
    ensureDirectoryExistence(idsDir);
    const idPath = path.join(idsDir, 'order_id.json');
    let currentID = 1;
    if (fs.existsSync(idPath)) {
        const idData = fs.readFileSync(idPath, 'utf8');
        currentID = parseInt(idData, 10) + 1;
    }
    fs.writeFileSync(idPath, currentID.toString());
    return currentID;
}

function getNextShiftID() {
    const idsDir = path.join(__dirname, 'data', 'ids');
    ensureDirectoryExistence(idsDir);
    const idPath = path.join(idsDir, 'shift_id.json');
    let currentID = 1;
    if (fs.existsSync(idPath)) {
        const idData = fs.readFileSync(idPath, 'utf8');
        currentID = parseInt(idData, 10) + 1;
    }
    fs.writeFileSync(idPath, currentID.toString());
    return currentID;
}
function ensureProductsXML() {
    const dataPath = path.join(__dirname, 'data');
    const productsPath = path.join(dataPath, 'products.xml');
    if (!fs.existsSync(dataPath)) {
        fs.mkdirSync(dataPath, { recursive: true });
    }
    if (!fs.existsSync(productsPath)) {
        const xmlDoc = create({ version: '1.0' }).ele('products');
        fs.writeFileSync(productsPath, xmlDoc.end({ prettyPrint: true, indent: '\t' }));
    }
    return productsPath;
}

function getNextProductID() {
    const idsDir = path.join(__dirname, 'data', 'ids');
    ensureDirectoryExistence(idsDir);
    const idPath = path.join(idsDir, 'product_id.json');
    let currentID = 1;
    if (fs.existsSync(idPath)) {
        const idData = fs.readFileSync(idPath, 'utf8');
        currentID = parseInt(idData, 10) + 1;
    }
    fs.writeFileSync(idPath, currentID.toString());
    return currentID;
}

// Zajistíme, že složka `data/shifts` existuje
const shiftsDir = path.join(__dirname, 'data', 'shifts');
if (!fs.existsSync(shiftsDir)) {
    fs.mkdirSync(shiftsDir, { recursive: true });
    console.log(`✅ Složka ${shiftsDir} byla vytvořena.`);
}

// Přidání zákazníka
app.post('/addCustomer', (req, res) => {
    const { name } = req.body;
    const dataPath = path.join(__dirname, 'data', 'customer_accounts');
    const customerFilePath = path.join(dataPath, `${name.replace(/\s/g, '_')}.xml`);

    ensureDirectoryExistence(dataPath);

    if (fs.existsSync(customerFilePath)) {
        return res.status(400).json({ message: 'Zákazník již existuje.' });
    }

    const xmlDoc = create({ version: '1.0' }).ele('customer', { name }).end({ prettyPrint: true });
    fs.writeFileSync(customerFilePath, xmlDoc);
    res.json({ message: 'Zákazník byl úspěšně přidán.' });
});

app.put('/activateProduct', (req, res) => {
    const { id } = req.body;
    const productsPath = path.join(__dirname, 'data', 'products.xml');

    if (!id) {
        return res.status(400).json({ message: "❌ Neplatné ID produktu." });
    }

    try {
        const xmlData = fs.readFileSync(productsPath, 'utf8');
        let jsonData = convert(xmlData, { format: 'object' });

        let products = jsonData.products?.product || [];
        if (!Array.isArray(products)) {
            products = products ? [products] : [];
        }

        const productToUpdate = products.find(p => p['@id'] === id);

        if (!productToUpdate) {
            return res.status(404).json({ message: `⚠️ Produkt s ID ${id} nebyl nalezen.` });
        }

        if (productToUpdate['@active'] === 'true') {
            return res.status(400).json({ message: `⚠️ Produkt ID ${id} je již aktivní.` });
        }

        // ✅ **Aktivujeme produkt**
        productToUpdate['@active'] = 'true';

        const updatedXml = create(jsonData).end({ prettyPrint: true });
        fs.writeFileSync(productsPath, updatedXml);

        console.log(`✅ Produkt ID ${id} byl úspěšně aktivován.`);
        res.json({ message: `✅ Produkt ID ${id} byl úspěšně aktivován.` });
    } catch (error) {
        console.error("❌ Chyba při aktivaci produktu:", error);
        res.status(500).json({ message: "❌ Chyba při aktivaci produktu." });
    }
});


app.put('/deleteProduct', (req, res) => {
    const { id } = req.body;
    const productsPath = ensureProductsXML();

    if (!id) {
        return res.status(400).json({ message: "Neplatné ID produktu." });
    }

    try {
        const xmlData = fs.readFileSync(productsPath, 'utf8');
        let jsonData = convert(xmlData, { format: 'object' });

        let products = jsonData.products?.product || [];
        if (!Array.isArray(products)) {
            products = products ? [products] : [];
        }

        const productToUpdate = products.find(p => p['@id'] === id);

        if (!productToUpdate) {
            return res.status(404).json({ message: "Produkt nebyl nalezen." });
        }

        if (productToUpdate['@used'] === 'false') {
            return res.status(400).json({ message: "Produkt je již označen jako nepoužitý." });
        }

        // Nastavíme atribut used na "false"
        productToUpdate['@used'] = 'false';

        const updatedXml = create(jsonData).end({ prettyPrint: true });
        fs.writeFileSync(productsPath, updatedXml);

        console.log(`✅ Produkt ID ${id} označen jako nepoužitý.`);
        res.json({ message: `Produkt ID ${id} označen jako nepoužitý.` });
    } catch (error) {
        console.error("❌ Chyba při aktualizaci produktu:", error);
        res.status(500).json({ message: "Chyba při aktualizaci produktu." });
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


app.delete('/orders/:id', (req, res) => {
    const orderId = req.params.id;
    const shiftsDir = path.join(__dirname, 'data', 'shifts');
    const productsPath = path.join(__dirname, 'data', 'products.xml');
    const customersFolder = path.join(__dirname, 'data', 'customer_accounts');

    let orderFound = false;
    let customerName = null;
    let orderProducts = [];

    console.log(`🛠 Zahajuji storno objednávky ID: ${orderId}`);

    // Projdeme všechny směny a hledáme objednávku
    const files = fs.readdirSync(shiftsDir).filter(file => file.endsWith('.xml'));

    files.forEach(file => {
        const filePath = path.join(shiftsDir, file);
        const xmlData = fs.readFileSync(filePath, 'utf8');
        let jsonData = convert(xmlData, { format: 'object' });

        if (jsonData.shift && jsonData.shift.order) {
            let orders = Array.isArray(jsonData.shift.order) ? jsonData.shift.order : [jsonData.shift.order];

            orders.forEach(order => {
                if (order['@id'] === orderId) {
                    console.log(`✅ Nalezena objednávka v souboru ${file}`);
                    order['@cancelled'] = 'true';
                    orderFound = true;

                    // 📌 Parsování produktů pro vrácení do skladu
                    if (order.products) {
                        const productsList = order.products.trim().split(', ');
                        productsList.forEach(productEntry => {
                            const match = productEntry.match(/^(\d+)x (.+) \(\d+ Kč\)$/);
                            if (match) {
                                const quantity = parseInt(match[1], 10);
                                const productName = match[2].trim();

                                orderProducts.push({
                                    name: productName,
                                    quantity: quantity
                                });
                                console.log(`↩️ Připraveno k vrácení: ${quantity}x ${productName}`);
                            } else {
                                console.warn(`⚠️ Chyba při parsování produktu: ${productEntry}`);
                            }
                        });
                    }

                    // 📌 Získání zákaznického jména
                    if (order.paymentMethod) {
                        customerName = order.paymentMethod.trim();
                        console.log(`📌 Jméno zákazníka získáno z paymentMethod: ${customerName}`);
                    } else {
                        console.warn('⚠️ Jméno zákazníka nebylo nalezeno v paymentMethod.');
                    }
                }
            });

            if (orderFound) {
                const updatedXml = create(jsonData).end({ prettyPrint: true });
                fs.writeFileSync(filePath, updatedXml);
                console.log(`✅ Soubor ${file} aktualizován, objednávka stornována.`);
            }
        }
    });

    // ✅ Vrácení produktů do skladu
    if (fs.existsSync(productsPath)) {
        try {
            const xmlData = fs.readFileSync(productsPath, 'utf8');
            let productsDoc = convert(xmlData, { format: 'object' });

            if (!Array.isArray(productsDoc.products.product)) {
                productsDoc.products.product = [productsDoc.products.product];
            }

            orderProducts.forEach(returnedProduct => {
                const productInXml = productsDoc.products.product.find(p =>
                    p.Name.trim().toLowerCase() === returnedProduct.name.trim().toLowerCase()
                );

                if (productInXml) {
                    const currentQuantity = parseInt(productInXml.Quantity, 10) || 0;
                    const updatedQuantity = currentQuantity + returnedProduct.quantity;
                    productInXml.Quantity = updatedQuantity.toString();
                    console.log(`🔄 Aktualizován sklad: ${returnedProduct.name} -> nové množství: ${updatedQuantity}`);
                } else {
                    console.warn(`⚠️ Produkt '${returnedProduct.name}' nenalezen v XML skladu!`);
                }
            });

            const updatedProductsXml = create(productsDoc).end({ prettyPrint: true });
            fs.writeFileSync(productsPath, updatedProductsXml);
            console.log('✅ Sklad úspěšně aktualizován po stornu objednávky.');

        } catch (error) {
            console.error('❌ Chyba při aktualizaci skladu:', error);
        }
    } else {
        console.error('❌ Skladový soubor neexistuje, produkty nelze vrátit.');
    }

    // ✅ Úprava zákaznického účtu
    if (!customerName) {
        console.warn('⚠️ Jméno zákazníka nebylo nalezeno, přeskočena aktualizace zákaznického účtu.');
    } else {
        console.log(`📌 Aktualizuji účet zákazníka: ${customerName}`);
        const customerFilePath = path.join(customersFolder, `${customerName.replace(/\s/g, '_')}.xml`);
        if (fs.existsSync(customerFilePath)) {
            try {
                const xmlData = fs.readFileSync(customerFilePath, 'utf8');
                let customerDoc = convert(xmlData, { format: 'object' });

                let orders = customerDoc.customer.orders?.order || [];
                if (!Array.isArray(orders)) {
                    orders = [orders];
                }

                // Nastavení atributu `cancelled` na "true"
                orders.forEach(order => {
                    if (order['@id'] === orderId) {
                        order['@cancelled'] = 'true';
                        console.log(`✅ Objednávka ID ${orderId} označena jako stornovaná v souboru zákazníka ${customerName}.`);
                    }
                });

                const updatedCustomerXml = create(customerDoc).end({ prettyPrint: true });
                fs.writeFileSync(customerFilePath, updatedCustomerXml);
            } catch (error) {
                console.error('❌ Chyba při aktualizaci zákaznického účtu:', error);
            }
        } else {
            console.warn(`⚠️ Soubor pro zákazníka ${customerName} neexistuje!`);
        }
    }

    if (!orderFound) {
        console.error(`❌ Objednávka ID ${orderId} nebyla nalezena.`);
        return res.status(404).json({ message: `Objednávka ${orderId} nebyla nalezena.` });
    }

    res.status(200).json({ message: `✅ Objednávka ${orderId} byla stornována a produkty vráceny do skladu.` });
});
app.put('/orders/:id/restore', (req, res) => {
    const orderId = req.params.id;
    const shiftsDir = path.join(__dirname, 'data', 'shifts');
    const productsPath = path.join(__dirname, 'data', 'products.xml');
    const customersFolder = path.join(__dirname, 'data', 'customer_accounts');

    let orderFound = false;
    let orderProducts = [];
    let customerName = null;

    const files = fs.readdirSync(shiftsDir).filter(file => file.endsWith('.xml'));

    files.forEach(file => {
        const filePath = path.join(shiftsDir, file);
        const xmlData = fs.readFileSync(filePath, 'utf8');
        const jsonData = convert(xmlData, { format: 'object' });

        if (jsonData.shift) {
            let orders = jsonData.shift.order || jsonData.shift.orders?.order || [];
            if (!Array.isArray(orders)) orders = [orders];

            orders.forEach(order => {
                if (order['@id'] === orderId && order['@cancelled'] === 'true') {
                    order['@cancelled'] = 'false'; // Obnovíme objednávku
                    orderFound = true;

                    // Získání jména zákazníka z paymentMethod
                    if (order.paymentMethod) {
                        customerName = order.paymentMethod.trim();
                        console.log(`📌 Jméno zákazníka získáno z paymentMethod: ${customerName}`);
                    }

                    // Parsujeme produkty pro odečtení ze skladu
                    if (order.products) {
                        const productsList = order.products.trim().split(', ');
                        productsList.forEach(productEntry => {
                            const parts = productEntry.split('x ');
                            if (parts.length >= 2) {
                                const quantity = parseInt(parts[0].trim(), 10) || 0;
                                const productName = parts.slice(1).join('x ').trim().replace(/\(.+\)/, '').trim();
                                orderProducts.push({ name: productName, quantity });
                            }
                        });
                    }
                }
            });

            if (orderFound) {
                const updatedXml = create(jsonData).end({ prettyPrint: true });
                fs.writeFileSync(filePath, updatedXml);
                console.log(`✅ Objednávka ID ${orderId} obnovena v souboru ${file}`);
            }
        }
    });

    // 🔽 **ODEČÍTÁNÍ PRODUKTŮ ZE SKLADU PO OBNOVENÍ OBJEDNÁVKY**
    if (orderFound && fs.existsSync(productsPath)) {
        try {
            const xmlData = fs.readFileSync(productsPath, 'utf8');
            let productsDoc = convert(xmlData, { format: 'object' });

            if (!Array.isArray(productsDoc.products.product)) {
                productsDoc.products.product = [productsDoc.products.product];
            }

            console.log("♻️ Odečítám produkty ze skladu po obnovení objednávky:", orderProducts);

            orderProducts.forEach(product => {
                const productInXml = productsDoc.products.product.find(p => 
                    p.Name.trim().toLowerCase() === product.name.trim().toLowerCase()
                );
                if (productInXml) {
                    const currentQuantity = parseInt(productInXml.Quantity, 10) || 0;
                    if (currentQuantity >= product.quantity) {
                        const newQuantity = currentQuantity - product.quantity;
                        productInXml.Quantity = newQuantity.toString();
                        console.log(`✅ Odečítám ${product.quantity} ks produktu ${product.name} -> nové množství: ${newQuantity}`);
                    } else {
                        console.warn(`⚠️ Pokus o odečtení více než dostupného množství (${product.name}).`);
                    }
                } else {
                    console.warn(`⚠️ Produkt ${product.name} nebyl nalezen ve skladu!`);
                }
            });

            const updatedProductsXml = create(productsDoc).end({ prettyPrint: true });
            fs.writeFileSync(productsPath, updatedProductsXml);
            console.log('✅ Sklad úspěšně aktualizován po obnovení objednávky.');
        } catch (error) {
            console.error('❌ Chyba při aktualizaci skladu:', error);
        }
    }

    // 🔽 **Úprava zákaznického účtu**
    if (customerName) {
        const customerFilePath = path.join(customersFolder, `${customerName.replace(/\s/g, '_')}.xml`);
        if (fs.existsSync(customerFilePath)) {
            try {
                const xmlData = fs.readFileSync(customerFilePath, 'utf8');
                let customerDoc = convert(xmlData, { format: 'object' });

                let orders = customerDoc.customer.orders?.order || [];
                if (!Array.isArray(orders)) {
                    orders = [orders];
                }

                // Nastavení atributu `cancelled` na "false"
                orders.forEach(order => {
                    if (order['@id'] === orderId) {
                        order['@cancelled'] = 'false';
                        console.log(`✅ Objednávka ID ${orderId} označena jako obnovená v souboru zákazníka ${customerName}.`);
                    }
                });

                const updatedCustomerXml = create(customerDoc).end({ prettyPrint: true });
                fs.writeFileSync(customerFilePath, updatedCustomerXml);
            } catch (error) {
                console.error('❌ Chyba při aktualizaci zákaznického účtu:', error);
            }
        } else {
            console.warn(`⚠️ Soubor pro zákazníka ${customerName} neexistuje!`);
        }
    }

    if (!orderFound) {
        return res.status(404).json({ message: `Objednávka ${orderId} nebyla nalezena nebo již není stornovaná.` });
    }

    res.status(200).json({ message: `Objednávka ${orderId} byla obnovena a produkty odečteny ze skladu.` });
});
app.get('/shiftSummary', (req, res) => {
    const { shiftID } = req.query;

    if (!shiftID) {
        return res.status(400).json({ message: "❌ Shift ID není definováno!" });
    }

    const shiftsDir = path.join(__dirname, 'data', 'shifts');
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

        const customerFilePath = path.join(__dirname, 'data', 'customer_accounts', `${customerName.replace(/\s+/g, "_")}.xml`);

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

        const newShiftID = getNewShiftID();

        const now = new Date();
        const datePart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const timePart = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
        const formattedDateTime = `${datePart} ${timePart}`;

        const shiftsDir = path.join(__dirname, 'data', 'shifts');
        ensureDirectoryExistence(shiftsDir);

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
        ensureDirectoryExistence(shiftsDir);

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

    const productsPath = ensureProductsXML(); // Ujistíme se, že soubor existuje
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
function findShiftFileByID(shiftID) {
    try {
        const shiftsDir = path.join(__dirname, 'data', 'shifts');
        ensureDirectoryExistence(shiftsDir);

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

async function saveOrderToShift(orderLog, shiftID) {
    const filePath = findShiftFileByID(shiftID);
    if (!filePath) {
        throw new Error(`Soubor pro směnu s ID ${shiftID} nebyl nalezen.`);
    }
    
    let xmlDoc = create(fs.readFileSync(filePath, 'utf8')).root();
    const now = new Date();
    const formattedDateTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    
    const orderNode = xmlDoc.ele('order', { id: orderLog.OrderID });
    orderNode.ele('time').txt(formattedDateTime);
    orderNode.ele('paymentMethod').txt(orderLog.PaymentMethod);
    orderNode.ele('totalPrice').txt(orderLog.TotalPrice);
    
    const productsSummary = orderLog.OrderDetails.map(product =>
        `${product.Quantity}x ${product.Product} (${product.TotalProductPrice} Kč)`
    ).join(', ');
    orderNode.ele('products').txt(productsSummary);
    
    fs.writeFileSync(filePath, xmlDoc.end({ prettyPrint: true }));
    console.log(`Objednávka ID ${orderLog.OrderID} byla uložena do směny ${shiftID} (lokálně).`);
}
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

function savecustomerOrderAsXML(orderLog, selectedCustomer, orderID, totalAmount) {
    try {
        console.log("📦 Ukládám objednávku do zákaznického souboru:", orderLog, selectedCustomer, orderID, totalAmount);

        // 📌 Nastavení složky pro zákaznické účty
        const customersFolder = path.join(__dirname, 'data', 'customer_accounts');
        if (!fs.existsSync(customersFolder)) {
            fs.mkdirSync(customersFolder, { recursive: true });
        }

        // 📌 Oprava názvu souboru (mezery -> podtržítka)
        const sanitizeFileName = (name) => name.replace(/\s+/g, "_");
        const customerFileName = sanitizeFileName(selectedCustomer) + ".xml";
        const customerFilePath = path.join(customersFolder, customerFileName);

        let xmlDoc;

        // 🟢 Pokud soubor existuje, načteme ho
        if (fs.existsSync(customerFilePath)) {
            const existingData = fs.readFileSync(customerFilePath, 'utf8');

            try {
                xmlDoc = convert(existingData, { format: 'object', trim: true, ignoreComments: false });
            } catch (parseError) {
                console.error("❌ Chyba při parsování XML souboru zákazníka:", parseError);
                xmlDoc = { customer: { "@name": selectedCustomer, orders: { order: [] } } };
            }
        } else {
            // 🟢 Pokud neexistuje, vytvoříme nový
            xmlDoc = { customer: { "@name": selectedCustomer, orders: { order: [] } } };
        }

        // 📌 Zkontrolujeme, zda `orders` existuje
        if (!xmlDoc.customer.orders) {
            xmlDoc.customer.orders = { order: [] };
        }
        if (!Array.isArray(xmlDoc.customer.orders.order)) {
            xmlDoc.customer.orders.order = xmlDoc.customer.orders.order ? [xmlDoc.customer.orders.order] : [];
        }

        // 📌 Vytvoření nové objednávky
        const now = new Date();
        const formattedDateTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

        const newOrder = {
            "@id": orderID,
            "@payed": false,
            "Date": formattedDateTime,
            "TotalPrice": totalAmount.toString(),
            "Products": orderLog.OrderDetails.map(p => `${p.Quantity}x ${p.Product} (${p.TotalProductPrice} Kč)`).join(", "),
            
        };

        // 📌 Přidání nové objednávky do XML
        xmlDoc.customer.orders.order.push(newOrder);

        // 📌 Uložení zpět do souboru
        const updatedXml = create(xmlDoc).end({ prettyPrint: true });
        fs.writeFileSync(customerFilePath, updatedXml);

        console.log(`✅ Objednávka ID ${orderID} byla přidána do zákaznického účtu: ${customerFilePath}`);
    } catch (error) {
        console.error("❌ Chyba při ukládání objednávky do zákaznického souboru:", error);
    }
}


app.put('/updateProduct', (req, res) => {
    const { id, name, description, price, quantity, color } = req.body;

    if (!id) {
        return res.status(400).json({ message: "❌ Neplatné ID produktu." });
    }

    const productsPath = ensureProductsXML();

    try {
        const xmlData = fs.readFileSync(productsPath, 'utf8');
        let jsonData = convert(xmlData, { format: 'object' });

        let products = jsonData.products?.product || [];
        if (!Array.isArray(products)) {
            products = [products];
        }

        const productToUpdate = products.find(p => p['@id'] === id);

        if (!productToUpdate) {
            return res.status(404).json({ message: "❌ Produkt nebyl nalezen." });
        }

        // ✅ Aktualizace pouze odeslaných vlastností
        if (name !== undefined) productToUpdate.Name = name;
        if (description !== undefined) productToUpdate.Description = description || ''; // Ponecháme prázdný řetězec, pokud není description
        if (price !== undefined) productToUpdate.Price = price.toString();
        if (quantity !== undefined) productToUpdate.Quantity = quantity.toString();
        if (color !== undefined) productToUpdate.Color = color || '#FFFFFF'; // Ponecháme výchozí barvu, pokud není color

        // Zápis zpět do XML
        const updatedXml = create(jsonData).end({ prettyPrint: true });
        fs.writeFileSync(productsPath, updatedXml);

        console.log(`✅ Produkt ID ${id} byl úspěšně aktualizován.`);
        res.json({ message: `✅ Produkt ID ${id} byl úspěšně aktualizován.` });

    } catch (error) {
        console.error("❌ Chyba při aktualizaci produktu:", error);
        res.status(500).json({ message: "❌ Chyba při aktualizaci produktu." });
    }
});
/*
function addOrUpdateProduct(product) {
    const dataPath = path.join(__dirname, 'data');
    const productsPath = path.join(dataPath, 'products.xml');
    ensureDirectoryExistence(dataPath);

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

    const orderID = getNextOrderID();
    const paymentInfo = paymentMethod === 'Účet zákazníka' ? selectedCustomer : paymentMethod;

    const orderLog = {
        OrderID: orderID,
        PaymentMethod: paymentInfo, // 🔄 Uloží jméno zákazníka místo "Účet zákazníka"
        TotalPrice: totalAmount,
        OrderDetails: order.map(product => ({
            Product: product.name,
            Quantity: product.quantity,
            UnitPrice: product.price,
            TotalProductPrice: product.totalPrice
        }))
    };

    // 🟢 Uložení objednávky do směny
    saveOrderToShift(orderLog, shiftID);

    // 🟢 Uložení do zákaznického účtu, pokud platba je "Účet zákazníka"
    if (paymentMethod === 'Účet zákazníka' || paymentMethod === selectedCustomer && selectedCustomer) {
        console.log(`💾 Ukládám zákaznickou objednávku pro: ${selectedCustomer}`);
        savecustomerOrderAsXML(orderLog, selectedCustomer, orderID, totalAmount);
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
                const productInXml = products.find(p => p.Name === orderedProduct.name);
                if (productInXml) {
                    const currentQuantity = parseInt(productInXml.Quantity, 10) || 0;
                    const newQuantity = Math.max(0, currentQuantity - orderedProduct.quantity);
                    console.log(`🔽 Odečítám produkt ${productInXml.Name}: ${currentQuantity} ➝ ${newQuantity}`);
                    productInXml.Quantity = newQuantity.toString();
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
app.get('/currentShift', (req, res) => {
    const shiftsDir = path.join(__dirname, 'data', 'shifts');
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

});
// Funkce pro získání nového ID směny z externího souboru shift_id.json
function getNewShiftID() {
    const idsDir = path.join(__dirname, 'data', 'ids');
    ensureDirectoryExistence(idsDir);
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


app.get('/products', (req, res) => {
    const productsPath = ensureProductsXML();

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

ensureProductsXML();

app.listen(PORT, () => {
    console.log(`Server běží na portu ${PORT}`);
});
