const fs = require('fs');
const path = require('path');
const { create, convert } = require('xmlbuilder2');
const common = require('./service_common');
const shift = require('./service_shift');
const baseDir = path.join(__dirname, '..');
const shiftsDir = path.join(baseDir, 'data', 'shifts');
const productsPath = path.join(baseDir, 'data', 'products.xml');
const customersFolder = path.join(baseDir, 'data', 'customer_accounts');




function savecustomerOrderAsXML(orderLog, selectedCustomer, orderID, totalAmount) {
    try {
        console.log("📦 Ukládám objednávku do zákaznického souboru:", orderLog, selectedCustomer, orderID, totalAmount);

        // 📌 Nastavení složky pro zákaznické účty
        //const customersFolder = path.join(__dirname, '..', 'data', 'customer_accounts');
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
            "Products": orderLog.OrderDetails.map(p => `${p.Quantity}x ${p.Product} (ID: ${p.ProductID}, ${p.TotalProductPrice} Kč)`).join(", ")
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



function cancelOrder(req, res) {
    const orderId = req.params.id;


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

                    const productRegex = /(\d+x .+? \(ID: \d+, [\d.]+ Kč\))/g;
                    const matches = order.products.match(productRegex) || [];
                    
                    matches.forEach(productEntry => {
                        console.log(`📦 Parsování produktu: ${productEntry}`);
                        const match = productEntry.match(/^(\d+)x (.+?) \(ID: (\d+), ([\d.]+) Kč\)$/);
                        console.log(`🔍 Výsledek parsování:`, match);
                        if (match) {
                            const quantity = parseInt(match[1], 10);
                            const productName = match[2].trim();
                            const productId = match[3];
                            const productPrice = parseFloat(match[4]);
                            orderProducts.push({
                                id: productId,
                                name: productName,
                                quantity: quantity,
                                price: productPrice
                            });
                            console.log(`↩️ Připraveno k vrácení: ${quantity}x ${productName} (ID: ${productId}, Cena: ${productPrice} Kč)`);
                        } else {
                            console.warn(`⚠️ Chyba při parsování produktu: ${productEntry}`);
                        }
                    });
                    

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
                    p['@id'] === returnedProduct.id
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
}
function getNextOrderID() {
    const idsDir = path.join(__dirname, '..', 'data', 'ids');
    common.ensureDirectoryExistence(idsDir);
    const idPath = path.join(idsDir, 'order_id.json');
    let currentID = 1;
    if (fs.existsSync(idPath)) {
        const idData = fs.readFileSync(idPath, 'utf8');
        currentID = parseInt(idData, 10) + 1;
    }
    fs.writeFileSync(idPath, currentID.toString());
    return currentID;
}


function payOrder({ customerName, totalPrice, paymentMethod }) {
    if (!customerName || !totalPrice || !paymentMethod) {
        throw new Error("Chybí povinné údaje (customerName, totalPrice nebo paymentMethod)!");
    }

    const customerFilePath = path.join(customersFolder, `${customerName.replace(/\s+/g, "_")}.xml`);

    if (!fs.existsSync(customerFilePath)) {
        throw new Error("Soubor zákazníka neexistuje.");
    }

    try {
        // Načti XML a převeď na JSON
        const xmlData = fs.readFileSync(customerFilePath, 'utf8');
        let jsonData = convert(xmlData, { format: 'object', trim: true, ignoreAttributes: false });

        if (!jsonData.customer || !jsonData.customer.orders || !jsonData.customer.orders.order) {
            return { message: "Žádné neuhrazené objednávky k aktualizaci." };
        }

        let updated = false;

        // Zajistíme, že `order` je vždy pole
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
            return { message: "Všechny objednávky již byly uhrazeny." };
        }

        // Převod zpět do XML a uložení
        const updatedXml = create({ version: '1.0' }).ele(jsonData).end({ prettyPrint: true });
        fs.writeFileSync(customerFilePath, updatedXml);

        // Přidání objednávky do aktuální směny
        const shiftFilePath = shift.findShiftFileByID();
        if (!shiftFilePath) {
            throw new Error("Nebyla nalezena aktuální směna.");
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

        // Uložení zpět do směny
        const updatedShiftXml = create(shiftJsonData).end({ prettyPrint: true });
        fs.writeFileSync(shiftFilePath, updatedShiftXml);

        return { message: "Objednávky byly aktualizovány jako zaplacené a přidány do aktuální směny." };
    } catch (error) {
        console.error("❌ Chyba při aktualizaci objednávek:", error);
        throw new Error("Interní chyba serveru při aktualizaci objednávek.");
    }
}

function logOrder({ order, paymentMethod, totalAmount, selectedCustomer, shiftID }) {
    if (!shiftID) {
        throw new Error('❌ Shift ID není definováno!');
    }

    const orderID = getNextOrderID();
    const paymentInfo = paymentMethod === 'Účet zákazníka' ? selectedCustomer : paymentMethod;

    const orderLog = {
        OrderID: orderID,
        PaymentMethod: paymentInfo,
        TotalPrice: totalAmount,
        OrderDetails: order.map(product => ({
            ProductID: product.id,
            Product: product.name,
            Quantity: product.quantity,
            UnitPrice: product.price,
            TotalProductPrice: product.totalPrice
        }))
    };

    // 🟢 Uložení objednávky do směny
    saveOrderToShift(orderLog, shiftID);

    // 🟢 Uložení do zákaznického účtu, pokud platba je "Účet zákazníka"
    if (paymentMethod === 'Účet zákazníka' || (paymentMethod === selectedCustomer && selectedCustomer)) {
        console.log(`💾 Ukládám zákaznickou objednávku pro: ${selectedCustomer}`);
        savecustomerOrderAsXML(orderLog, selectedCustomer, orderID, totalAmount);
    }

    // 🟢 Aktualizace skladu
    const productsPath = path.join(__dirname, '..', 'data', 'products.xml');
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
            throw new Error('Chyba při aktualizaci skladu.');
        }
    } else {
        console.error(`❌ Soubor ${productsPath} neexistuje!`);
        throw new Error('Soubor skladu neexistuje.');
    }

    return { message: `✅ Objednávka ID ${orderID} byla uložena do směny ${shiftID} a sklad byl aktualizován.` };
}


async function saveOrderToShift(orderLog, shiftID) {
    const filePath = shift.findShiftFileByID(shiftID);
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
        `${product.Quantity}x ${product.Product} (ID: ${product.ProductID}, ${product.TotalProductPrice} Kč)`
    ).join(', ');
    orderNode.ele('products').txt(productsSummary);
    
    fs.writeFileSync(filePath, xmlDoc.end({ prettyPrint: true }));
    console.log(`Objednávka ID ${orderLog.OrderID} byla uložena do směny ${shiftID} (lokálně).`);
}

function restoreOrder(req, res) {
    const orderId = req.params.id;
    const shiftsDir = path.join(__dirname, '..', 'data', 'shifts');
    const productsPath = path.join(__dirname, '..', 'data', 'products.xml');
    const customersFolder = path.join(__dirname, '..', 'data', 'customer_accounts');

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
                    order['@cancelled'] = 'false'; // Restore order
                    orderFound = true;

                    // Get customer name from paymentMethod
                    if (order.paymentMethod) {
                        customerName = order.paymentMethod.trim();
                        console.log(`📌 Customer name from paymentMethod: ${customerName}`);
                    }

                    // Parse products for stock deduction
                    if (order.products) {
                        const productRegex = /(\d+x .+? \(ID: \d+, [\d.]+ Kč\))/g;
                        const matches = order.products.match(productRegex) || [];

                        matches.forEach(productEntry => {
                            const match = productEntry.match(/^(\d+)x (.+?) \(ID: (\d+), ([\d.]+) Kč\)$/);
                            if (match) {
                                const quantity = parseInt(match[1], 10);
                                const productName = match[2].trim();
                                const productId = match[3];
                                const productPrice = parseFloat(match[4]);
                                orderProducts.push({
                                    id: productId,
                                    name: productName,
                                    quantity: quantity,
                                    price: productPrice
                                });
                                console.log(`↩️ To deduct: ${quantity}x ${productName} (ID: ${productId}, Price: ${productPrice} Kč)`);
                            } else {
                                console.warn(`⚠️ Error parsing product: ${productEntry}`);
                            }
                        });
                    }
                }
            });

            if (orderFound) {
                const updatedXml = create(jsonData).end({ prettyPrint: true });
                fs.writeFileSync(filePath, updatedXml);
                console.log(`✅ Order ID ${orderId} restored in file ${file}`);
            }
        }
    });

    // Deduct products from stock after restoring order
    if (orderFound && fs.existsSync(productsPath)) {
        try {
            const xmlData = fs.readFileSync(productsPath, 'utf8');
            let productsDoc = convert(xmlData, { format: 'object' });

            if (!Array.isArray(productsDoc.products.product)) {
                productsDoc.products.product = [productsDoc.products.product];
            }

            console.log("♻️ Deducting products from stock after restoring order:", orderProducts);

            orderProducts.forEach(product => {
                const productInXml = productsDoc.products.product.find(p =>
                    p['@id'] === product.id
                );
                if (productInXml) {
                    const currentQuantity = parseInt(productInXml.Quantity, 10) || 0;
                    if (currentQuantity >= product.quantity) {
                        const newQuantity = currentQuantity - product.quantity;
                        productInXml.Quantity = newQuantity.toString();
                        console.log(`✅ Deducted ${product.quantity} pcs of product (ID: ${product.id}) -> new quantity: ${newQuantity}`);
                    } else {
                        console.warn(`⚠️ Attempt to deduct more than available (ID: ${product.id}).`);
                    }
                } else {
                    console.warn(`⚠️ Product with ID ${product.id} not found in stock!`);
                }
            });

            const updatedProductsXml = create(productsDoc).end({ prettyPrint: true });
            fs.writeFileSync(productsPath, updatedProductsXml);
            console.log('✅ Stock updated after restoring order.');
        } catch (error) {
            console.error('❌ Error updating stock:', error);
        }
    }

    // Update customer account
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

                // Set attribute `cancelled` to "false"
                orders.forEach(order => {
                    if (order['@id'] === orderId) {
                        order['@cancelled'] = 'false';
                        console.log(`✅ Order ID ${orderId} marked as restored in customer file ${customerName}.`);
                    }
                });

                const updatedCustomerXml = create(customerDoc).end({ prettyPrint: true });
                fs.writeFileSync(customerFilePath, updatedCustomerXml);
            } catch (error) {
                console.error('❌ Error updating customer account:', error);
            }
        } else {
            console.warn(`⚠️ Customer file for ${customerName} does not exist!`);
        }
    }

    if (!orderFound) {
        return res.status(404).json({ message: `Order ${orderId} not found or is not cancelled.` });
    }

    res.status(200).json({ message: `Order ${orderId} has been restored and products deducted from stock.` });
}




module.exports = {
    cancelOrder, restoreOrder, savecustomerOrderAsXML, getNextOrderID, saveOrderToShift,
     payOrder, logOrder
    
};