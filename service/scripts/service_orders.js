const fs = require('fs');
const path = require('path');
const { create, convert } = require('xmlbuilder2');
const common = require('./service_common');
const shift = require('./service_shift');
const baseDir = path.join(__dirname, '..');
const shiftsDir = path.join(baseDir, 'data', 'shifts');
const productsPath = path.join(baseDir, 'data', 'products.xml');
const customersFolder = path.join(baseDir, 'data', 'customer_accounts');

/**
 * Kontroluje, zda objednávka je platba zákaznického účtu
 * Takové objednávky nesmí být stornovány přes běžné storno
 */
function isCustomerAccountSettlement(order) {
    if (!order) {
        console.log('🔍 isCustomerAccountSettlement: order je null/undefined');
        return false;
    }
    
    console.log('🔍 isCustomerAccountSettlement: Kontroluji objednávku', {
        hasMetadata: !!order.metadata,
        hasCustomerOrderIds: !!order.customerOrderIds,
        products: order.products,
        productsType: typeof order.products
    });
    
    // Kontrola podle metadata
    if (order.metadata) {
        try {
            const meta = typeof order.metadata === 'string' ? JSON.parse(order.metadata) : order.metadata;
            if (meta && meta.type === 'customer-account-payment') {
                console.log('✅ Detekována platba účtu podle metadata');
                return true;
            }
        } catch (e) {
            console.warn('⚠️ Chyba při parsování metadata:', e);
        }
    }
    
    // Kontrola podle ID zákaznických objednávek
    if (order.customerOrderIds && String(order.customerOrderIds).trim()) {
        console.log('✅ Detekována platba účtu podle customerOrderIds');
        return true;
    }
    
    // Kontrola podle obsahu products - pokud obsahuje "customer-order-"
    if (order.products && typeof order.products === 'string') {
        const hasCustomerOrder = order.products.includes('customer-order-');
        const hasUhrada = order.products.includes('Úhrada objednávky');
        const hasUcet = order.products.includes('Účet zákazníka:');
        const hasZakaznik = order.products.includes('Zákazník:');
        
        console.log('🔍 Kontrola products:', {
            hasCustomerOrder,
            hasUhrada,
            hasUcet,
            hasZakaznik,
            productsPreview: order.products.substring(0, 100)
        });
        
        if (hasCustomerOrder || hasUhrada || hasUcet || hasZakaznik) {
            console.log('✅ Detekována platba účtu podle obsahu products');
            return true;
        }
    }
    
    console.log('❌ Objednávka NENÍ platba účtu');
    return false;
}

function savecustomerOrderAsXML(orderLog, selectedCustomer, orderID, totalAmount) {
    try {
        console.log("📦 Ukládám objednávku do zákaznického souboru:", orderLog, selectedCustomer, orderID, totalAmount);

        if (!fs.existsSync(customersFolder)) {
            fs.mkdirSync(customersFolder, { recursive: true });
        }

        // Oprava názvu souboru (mezery -> podtržítka)
        const sanitizeFileName = (name) => name.replace(/\s+/g, "_");
        const customerFileName = sanitizeFileName(selectedCustomer) + ".xml";
        const customerFilePath = path.join(customersFolder, customerFileName);

        let xmlDoc;

        // Pokud soubor existuje, načteme ho
        if (fs.existsSync(customerFilePath)) {
            const existingData = fs.readFileSync(customerFilePath, 'utf8');

            try {
                xmlDoc = convert(existingData, { format: 'object', trim: true, ignoreComments: false });
            } catch (parseError) {
                console.error("❌ Chyba při parsování XML souboru zákazníka:", parseError);
                xmlDoc = { customer: { "@name": selectedCustomer, orders: { order: [] } } };
            }
        } else {
            // Pokud neexistuje, vytvoříme nový
            xmlDoc = { customer: { "@name": selectedCustomer, orders: { order: [] } } };
        }

        // Zkontrolujeme, zda `orders` existuje
        if (!xmlDoc.customer.orders) {
            xmlDoc.customer.orders = { order: [] };
        }
        if (!Array.isArray(xmlDoc.customer.orders.order)) {
            xmlDoc.customer.orders.order = xmlDoc.customer.orders.order ? [xmlDoc.customer.orders.order] : [];
        }

        // Vytvoření nové objednávky
        const now = new Date();
        const formattedDateTime = common.getFormattedDateTime();

        const newOrder = {
            "@id": orderID,
            "@payed": "false",
            "@cancelled": "false",
            "Date": formattedDateTime,
            "TotalPrice": totalAmount.toString(),
            "Products": orderLog.OrderDetails.map(p => `${p.Quantity}x ${p.Product} (ID: ${p.ProductID}, ${p.TotalProductPrice} Kč)`).join(", ")
        };

        // Přidání nové objednávky do XML
        xmlDoc.customer.orders.order.push(newOrder);

        // Uložení zpět do souboru
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
    const orderProducts = [];
    let jsonDataToWrite = null;
    let filePathToWrite = null;

    console.log(`� Zahajuji storno objednávky ID: ${orderId}`);

    const files = fs.readdirSync(shiftsDir).filter(file => file.endsWith('.xml'));

    outerLoop:
    for (const file of files) {
        const filePath = path.join(shiftsDir, file);
        const xmlData = fs.readFileSync(filePath, 'utf8');
        const jsonData = convert(xmlData, { format: 'object' });

        if (!jsonData.shift) {
            continue;
        }

        let orders = jsonData.shift.order || jsonData.shift.orders?.order || [];
        if (!Array.isArray(orders)) {
            orders = orders ? [orders] : [];
        }

        for (const order of orders) {
            if (String(order['@id']) !== String(orderId)) {
                continue;
            }

            // Debug: Vypíšeme celou objednávku
            console.log(`🔍 DEBUG: Kontroluji objednávku ${orderId}:`, JSON.stringify(order, null, 2));

            if (isCustomerAccountSettlement(order)) {
                console.warn(`⚠️ Pokus o storno platby zákaznického účtu (order ${orderId}) ve směně ${file}.`);
                
                // Vrátit objednávky zákazníka zpět na nezaplacené
                try {
                    const relatedOrderIds = [];
                    
                    // Získáme ID objednávek z customerOrderIds
                    if (order.customerOrderIds) {
                        const ids = String(order.customerOrderIds).split(',').map(id => id.trim()).filter(Boolean);
                        relatedOrderIds.push(...ids);
                    }
                    
                    // Pokud nemáme customerOrderIds, zkusíme parsovat z products
                    if (relatedOrderIds.length === 0 && order.products) {
                        const matches = order.products.match(/customer-order-(\d+)/g);
                        if (matches) {
                            matches.forEach(match => {
                                const id = match.replace('customer-order-', '');
                                if (id) relatedOrderIds.push(id);
                            });
                        }
                    }
                    
                    // Získáme jméno zákazníka
                    let targetCustomer = null;
                    if (order.customerName) {
                        targetCustomer = order.customerName.trim();
                    } else if (order.metadata) {
                        try {
                            const meta = typeof order.metadata === 'string' ? JSON.parse(order.metadata) : order.metadata;
                            if (meta && meta.customerName) {
                                targetCustomer = meta.customerName;
                            }
                        } catch (e) {
                            // Ignorujeme
                        }
                    }
                    
                    // Pokud máme zákazníka a ID objednávek, vrátíme je na nezaplacené
                    if (targetCustomer && relatedOrderIds.length > 0) {
                        console.log(`🔄 Vracím objednávky ${relatedOrderIds.join(', ')} zákazníka ${targetCustomer} zpět na nezaplacené`);
                        const customerFilePath = path.join(customersFolder, `${targetCustomer.replace(/\s/g, '_')}.xml`);
                        
                        if (fs.existsSync(customerFilePath)) {
                            const custXmlData = fs.readFileSync(customerFilePath, 'utf8');
                            let custDoc = convert(custXmlData, { format: 'object' });
                            
                            let custOrders = custDoc.customer.orders?.order || [];
                            if (!Array.isArray(custOrders)) {
                                custOrders = [custOrders];
                            }
                            
                            custOrders.forEach(custOrder => {
                                if (relatedOrderIds.includes(String(custOrder['@id']))) {
                                    custOrder['@payed'] = 'false';
                                    console.log(`✅ Objednávka ${custOrder['@id']} vrácena na nezaplacenou`);
                                }
                            });
                            
                            const updatedCustXml = create(custDoc).end({ prettyPrint: true });
                            fs.writeFileSync(customerFilePath, updatedCustXml);
                            console.log(`✅ Zákaznický účet ${targetCustomer} aktualizován`);
                        }
                    }
                } catch (error) {
                    console.error('❌ Chyba při vracení objednávek na nezaplacené:', error);
                }
                
                // Nyní stornujeme platební objednávku ve směně
                order['@cancelled'] = 'true';
                order.cancelled = 'true';
                orderFound = true;
                jsonDataToWrite = jsonData;
                filePathToWrite = filePath;
                
                // Platba účtu nemá skladové položky, takže je přeskočíme
                console.log('ℹ️ Platba zákaznického účtu stornována (bez vlivu na sklad)');
                break outerLoop;
            }

            console.log(`✅ Nalezena objednávka v souboru ${file}`);
            order['@cancelled'] = 'true';
            order.cancelled = 'true';
            orderFound = true;
            jsonDataToWrite = jsonData;
            filePathToWrite = filePath;

            const productsText = typeof order.products === 'string' ? order.products : '';
            const productRegex = /(\d+x .+? \(ID: [^,]+, [\d.,]+ Kč\))/g;
            const matches = productsText.match(productRegex) || [];

            matches.forEach((productEntry) => {
                const match = productEntry.match(/^(\d+)x (.+?) \(ID: ([^,]+), ([\d.,]+) Kč\)$/);
                if (!match) {
                    console.warn(`⚠️ Chyba při parsování produktu: ${productEntry}`);
                    return;
                }

                const quantity = parseInt(match[1], 10);
                const productName = match[2].trim();
                const productId = match[3].trim();
                const productPrice = parseFloat(match[4].replace(',', '.'));

                if (!/^\d+$/.test(productId)) {
                    console.log(`ℹ️ Položka ${productName} (ID: ${productId}) není skladová položka, přeskočeno.`);
                    return;
                }

                orderProducts.push({
                    id: productId,
                    name: productName,
                    quantity,
                    price: productPrice
                });
                console.log(`↩️ Připraveno k vrácení: ${quantity}x ${productName} (ID: ${productId}, Cena: ${productPrice} Kč)`);
            });

            if (order.customerName) {
                customerName = order.customerName.trim();
            }

            if (!customerName && order.metadata) {
                try {
                    const parsedMeta = typeof order.metadata === 'string'
                        ? JSON.parse(order.metadata)
                        : order.metadata;
                    if (parsedMeta && parsedMeta.customerName) {
                        customerName = String(parsedMeta.customerName).trim();
                    }
                } catch (error) {
                    console.warn('⚠️ Nepodařilo se parsovat metadata objednávky při stornu:', error);
                }
            }

            if (!customerName && order.paymentMethod) {
                customerName = order.paymentMethod.trim();
            }

            break outerLoop;
        }
    }

    if (customerName === '') {
        customerName = null;
    }

    // ✅ Vrácení produktů do skladu
    if (orderProducts.length > 0) {
        if (fs.existsSync(productsPath)) {
            try {
                const xmlData = fs.readFileSync(productsPath, 'utf8');
                let productsDoc = convert(xmlData, { format: 'object' });

                if (!Array.isArray(productsDoc.products.product)) {
                    productsDoc.products.product = [productsDoc.products.product];
                }

                orderProducts.forEach((returnedProduct) => {
                    const productInXml = productsDoc.products.product.find((p) =>
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
    } else {
        console.log('ℹ️ Žádné skladové položky k vrácení.');
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

    if (jsonDataToWrite && filePathToWrite) {
        const updatedXml = create(jsonDataToWrite).end({ prettyPrint: true });
        fs.writeFileSync(filePathToWrite, updatedXml);
        console.log(`✅ Soubor ${path.basename(filePathToWrite)} aktualizován, objednávka stornována.`);
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

function logOrder({ order, paymentMethod, totalAmount, selectedCustomer, shiftID, metadata }) {
    if (!shiftID) {
        throw new Error('❌ Shift ID není definováno!');
    }

    const orderID = getNextOrderID();
    const paymentInfo = paymentMethod === 'Účet zákazníka' ? selectedCustomer : paymentMethod;

    const normalizedOrder = Array.isArray(order) ? order : [];
    const metadataPayload = (typeof metadata === 'object' && metadata !== null) ? metadata : {};
    const customerOrderIds = Array.isArray(metadataPayload.orderIds)
        ? metadataPayload.orderIds.map((id) => String(id).trim()).filter(Boolean)
        : [];
    const metadataCustomerName = metadataPayload.customerName ? String(metadataPayload.customerName).trim() : null;

    const orderLog = {
        OrderID: orderID,
        PaymentMethod: paymentInfo,
        TotalPrice: totalAmount,
        OrderDetails: normalizedOrder.map(product => ({
            ProductID: product.id,
            Product: product.name,
            Quantity: product.quantity,
            UnitPrice: product.price,
            TotalProductPrice: product.totalPrice
        })),
        CustomerOrderIds: customerOrderIds,
        CustomerName: metadataCustomerName || selectedCustomer || null,
        Metadata: metadataPayload
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

            normalizedOrder.forEach(orderedProduct => {
                if (!orderedProduct.id) {
                    console.error(`❌ Chybí ID pro produkt: ${orderedProduct.name}`);
                    return;
                }

                if (!/^\d+$/.test(String(orderedProduct.id))) {
                    console.log(`ℹ️ Účetní položka ${orderedProduct.name} neovlivňuje sklad.`);
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
    const formattedDateTime = common.getFormattedDateTime();
    
    const orderNode = xmlDoc.ele('order', { id: orderLog.OrderID });
    orderNode.ele('time').txt(formattedDateTime);
    orderNode.ele('paymentMethod').txt(orderLog.PaymentMethod);
    orderNode.ele('totalPrice').txt(orderLog.TotalPrice);
    
    // Vytvoření popisu produktů - pokud jde o platbu účtu, přidáme jméno zákazníka
    let productsSummary = orderLog.OrderDetails.map(product =>
        `${product.Quantity}x ${product.Product} (ID: ${product.ProductID}, ${product.TotalProductPrice} Kč)`
    ).join(', ');
    
    // Pokud jde o platbu zákaznického účtu, přidáme jméno zákazníka na začátek
    const isAccountPayment = orderLog.Metadata && orderLog.Metadata.type === 'customer-account-payment';
    if (isAccountPayment && orderLog.CustomerName) {
        productsSummary = `Zákazník: ${orderLog.CustomerName} | ${productsSummary}`;
    }
    
    orderNode.ele('products').txt(productsSummary);

    if (orderLog.CustomerName) {
        orderNode.ele('customerName').txt(orderLog.CustomerName);
    }

    if (Array.isArray(orderLog.CustomerOrderIds) && orderLog.CustomerOrderIds.length > 0) {
        orderNode.ele('customerOrderIds').txt(orderLog.CustomerOrderIds.join(','));
    }

    if (orderLog.Metadata && Object.keys(orderLog.Metadata).length > 0) {
        try {
            orderNode.ele('metadata').txt(JSON.stringify(orderLog.Metadata));
        } catch (error) {
            console.warn('⚠️ Nepodařilo se serializovat metadata objednávky:', error);
        }
    }
    
    fs.writeFileSync(filePath, xmlDoc.end({ prettyPrint: true }));
    console.log(`Objednávka ID ${orderLog.OrderID} byla uložena do směny ${shiftID} (lokálně).`);
}

function restoreOrder(req, res) {
    const orderId = req.params.id;
    const shiftsDir = path.join(__dirname, '..', 'data', 'shifts');
    const productsPath = path.join(__dirname, '..', 'data', 'products.xml');
    const customersFolder = path.join(__dirname, '..', 'data', 'customer_accounts');

    let orderFound = false;
    const orderProducts = [];
    let customerName = null;
    let jsonDataToWrite = null;
    let filePathToWrite = null;

    const files = fs.readdirSync(shiftsDir).filter(file => file.endsWith('.xml'));

    outerLoop:
    for (const file of files) {
        const filePath = path.join(shiftsDir, file);
        const xmlData = fs.readFileSync(filePath, 'utf8');
        const jsonData = convert(xmlData, { format: 'object' });

        if (!jsonData.shift) {
            continue;
        }

        let orders = jsonData.shift.order || jsonData.shift.orders?.order || [];
        if (!Array.isArray(orders)) {
            orders = orders ? [orders] : [];
        }

        for (const order of orders) {
            if (String(order['@id']) !== String(orderId)) {
                continue;
            }

            if (String(order['@cancelled']).toLowerCase() !== 'true') {
                continue;
            }

            if (isCustomerAccountSettlement(order)) {
                console.log(`🔄 Obnovuji platbu zákaznického účtu (order ${orderId}) ve směně ${file}.`);
                
                // Vrátit objednávky zákazníka zpět na zaplacené
                try {
                    const relatedOrderIds = [];
                    
                    // Získáme ID objednávek z customerOrderIds
                    if (order.customerOrderIds) {
                        const ids = String(order.customerOrderIds).split(',').map(id => id.trim()).filter(Boolean);
                        relatedOrderIds.push(...ids);
                    }
                    
                    // Pokud nemáme customerOrderIds, zkusíme parsovat z products
                    if (relatedOrderIds.length === 0 && order.products) {
                        const matches = order.products.match(/customer-order-(\d+)/g);
                        if (matches) {
                            matches.forEach(match => {
                                const id = match.replace('customer-order-', '');
                                if (id) relatedOrderIds.push(id);
                            });
                        }
                    }
                    
                    // Získáme jméno zákazníka
                    let targetCustomer = null;
                    if (order.customerName) {
                        targetCustomer = order.customerName.trim();
                    } else if (order.metadata) {
                        try {
                            const meta = typeof order.metadata === 'string' ? JSON.parse(order.metadata) : order.metadata;
                            if (meta && meta.customerName) {
                                targetCustomer = meta.customerName;
                            }
                        } catch (e) {
                            // Ignorujeme
                        }
                    }
                    
                    // Pokud máme zákazníka a ID objednávek, vrátíme je na zaplacené
                    if (targetCustomer && relatedOrderIds.length > 0) {
                        console.log(`🔄 Vracím objednávky ${relatedOrderIds.join(', ')} zákazníka ${targetCustomer} zpět na zaplacené`);
                        const customerFilePath = path.join(customersFolder, `${targetCustomer.replace(/\s/g, '_')}.xml`);
                        
                        if (fs.existsSync(customerFilePath)) {
                            const custXmlData = fs.readFileSync(customerFilePath, 'utf8');
                            let custDoc = convert(custXmlData, { format: 'object' });
                            
                            let custOrders = custDoc.customer.orders?.order || [];
                            if (!Array.isArray(custOrders)) {
                                custOrders = [custOrders];
                            }
                            
                            custOrders.forEach(custOrder => {
                                if (relatedOrderIds.includes(String(custOrder['@id']))) {
                                    custOrder['@payed'] = 'true';
                                    console.log(`✅ Objednávka ${custOrder['@id']} vrácena na zaplacenou`);
                                }
                            });
                            
                            const updatedCustXml = create(custDoc).end({ prettyPrint: true });
                            fs.writeFileSync(customerFilePath, updatedCustXml);
                            console.log(`✅ Zákaznický účet ${targetCustomer} aktualizován`);
                        }
                    }
                } catch (error) {
                    console.error('❌ Chyba při vracení objednávek na zaplacené:', error);
                }
                
                // Nyní obnovíme platební objednávku ve směně
                order['@cancelled'] = 'false';
                order.cancelled = 'false';
                orderFound = true;
                jsonDataToWrite = jsonData;
                filePathToWrite = filePath;
                
                // Platba účtu nemá skladové položky, takže je přeskočíme
                console.log('ℹ️ Platba zákaznického účtu obnovena (bez vlivu na sklad)');
                break outerLoop;
            }

            order['@cancelled'] = 'false';
            order.cancelled = 'false';
            orderFound = true;
            jsonDataToWrite = jsonData;
            filePathToWrite = filePath;

            if (order.customerName) {
                customerName = order.customerName.trim();
            }

            if (!customerName && order.metadata) {
                try {
                    const parsedMeta = typeof order.metadata === 'string'
                        ? JSON.parse(order.metadata)
                        : order.metadata;
                    if (parsedMeta && parsedMeta.customerName) {
                        customerName = String(parsedMeta.customerName).trim();
                    }
                } catch (error) {
                    console.warn('⚠️ Nepodařilo se parsovat metadata objednávky při obnovení:', error);
                }
            }

            if (!customerName && order.paymentMethod) {
                customerName = order.paymentMethod.trim();
            }

            const productRegex = /(\d+x .+? \(ID: [^,]+, [\d.,]+ Kč\))/g;
            const productsText = typeof order.products === 'string' ? order.products : '';
            const matches = productsText.match(productRegex) || [];

            matches.forEach((productEntry) => {
                const match = productEntry.match(/^(\d+)x (.+?) \(ID: ([^,]+), ([\d.,]+) Kč\)$/);
                if (!match) {
                    console.warn(`⚠️ Error parsing product: ${productEntry}`);
                    return;
                }

                const quantity = parseInt(match[1], 10);
                const productName = match[2].trim();
                const productId = match[3].trim();
                const productPrice = parseFloat(match[4].replace(',', '.'));

                if (!/^\d+$/.test(productId)) {
                    console.log(`ℹ️ Položka ${productName} (ID: ${productId}) není skladová položka, přeskočeno.`);
                    return;
                }

                orderProducts.push({
                    id: productId,
                    name: productName,
                    quantity,
                    price: productPrice
                });
                console.log(`↩️ To deduct: ${quantity}x ${productName} (ID: ${productId}, Price: ${productPrice} Kč)`);
            });

            break outerLoop;
        }
    }

    if (!orderFound) {
        return res.status(404).json({ message: `Order ${orderId} not found or is not cancelled.` });
    }

    if (jsonDataToWrite && filePathToWrite) {
        const updatedXml = create(jsonDataToWrite).end({ prettyPrint: true });
        fs.writeFileSync(filePathToWrite, updatedXml);
        console.log(`✅ Order ID ${orderId} restored in file ${path.basename(filePathToWrite)}.`);
    }

    if (orderProducts.length > 0) {
        if (fs.existsSync(productsPath)) {
            try {
                const xmlData = fs.readFileSync(productsPath, 'utf8');
                let productsDoc = convert(xmlData, { format: 'object' });

                if (!Array.isArray(productsDoc.products.product)) {
                    productsDoc.products.product = [productsDoc.products.product];
                }

                console.log('♻️ Deducting products from stock after restoring order:', orderProducts);

                orderProducts.forEach((product) => {
                    const productInXml = productsDoc.products.product.find((p) =>
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
        } else {
            console.error('❌ Stock file does not exist, cannot deduct products.');
        }
    }

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
    } else {
        console.warn('ℹ️ Zákazník nebyl identifikován při obnově objednávky.');
    }

    res.status(200).json({ message: `Order ${orderId} has been restored and products deducted from stock.` });
}




module.exports = {
    cancelOrder, restoreOrder, savecustomerOrderAsXML, getNextOrderID, saveOrderToShift,
     payOrder, logOrder
    
};