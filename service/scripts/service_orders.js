const fs = require('fs');
const path = require('path');
const { create, convert } = require('xmlbuilder2');
const common = require('./service_common');
const baseDir = path.join(__dirname, '..');
const shiftsDir = path.join(baseDir, 'data', 'shifts');
const productsPath = path.join(baseDir, 'data', 'products.xml');
const customersFolder = path.join(baseDir, 'data', 'customer_accounts');


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

module.exports = {
    cancelOrder, savecustomerOrderAsXML
};