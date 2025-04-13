const serverEndpoint = 'http://localhost:3000'; // Změňte podle potřeby na cloudovou adresu

// Načítání seznamu zákazníků
async function loadCustomers() {
    try {
        const response = await fetch(`${serverEndpoint}/customers`);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const customers = await response.json();
        await renderCustomerList(customers);
    } catch (error) {
        console.error("Chyba při načítání zákazníků:", error);
        //alert("Nepodařilo se načíst zákazníky.");
    }
}

// Funkce pro získání souhrnu objednávek zákazníka
let orders
async function getOrderSummary(customerName) {
    try {
        const sanitizedCustomerName = customerName.replace(/\s+/g, "_");
        const response = await fetch(`${serverEndpoint}/customerOrders?customer=${encodeURIComponent(sanitizedCustomerName)}`);

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        let orders = await response.json(); // ✅ Ujisti se, že orders existuje

        if (!orders || orders.length === 0) {
            return { lastOrderDate: 'Žádné', totalPrice: '0.00 Kč' };
        }

        // ✅ Filtrujeme pouze nezaplacené objednávky
        orders = orders.filter(order => 
            order.payed?.toString().replace("@", "") !== "true" &&  
            order['@payed']?.toString().replace("@", "") !== "true"
        );

        // ✅ Seřadíme objednávky podle data od nejnovější
        orders = orders.sort((a, b) => new Date(b.Date) - new Date(a.Date));

        const lastOrder = orders.length > 0 ? orders[0] : { Date: 'Neznámé datum' };

        // ✅ Oprava sčítání cen objednávek
        const totalPrice = orders.reduce((sum, order) => {
            const price = Number(order.TotalPrice || 0);
            return sum + (isNaN(price) ? 0 : price);
        }, 0);

        return {
            lastOrderDate: lastOrder.Date,
            totalPrice: `${totalPrice.toFixed(2)} Kč`
        };
    } catch (error) {
        console.error("❌ Chyba při získávání souhrnu objednávek:", error);
        return { lastOrderDate: 'Chyba', totalPrice: 'Chyba' };
    }
}


// Vykreslení seznamu zákazníků ve formátu tabulky
async function renderCustomerList(customers) {
    const tbody = document.getElementById('customerTableBody');
    tbody.innerHTML = '';

    const promises = customers.map(async customer => {
        const summary = await getOrderSummary(customer.name);
        return { customer, summary };
    });

    const results = await Promise.all(promises);

    results.forEach(({ customer, summary }) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${customer.name}</td>
            <td>${summary.lastOrderDate}</td>
            <td>${summary.totalPrice} Kč</td>
            <td>
                <button class="view-orders" data-name="${customer.name}">Zobrazit</button>
                <button class="pay-all-orders" data-name="${customer.name}">Zaplatit vše</button>
            </td>
        `;
        tbody.appendChild(row);
    });

    document.querySelectorAll('.view-orders').forEach(button => {
        button.addEventListener('click', e => {
            const customerName = e.target.getAttribute('data-name');
            loadOrders(customerName);
        });
    });

    document.querySelectorAll('.pay-all-orders').forEach(button => {
        button.addEventListener('click', e => {
            const customerName = e.target.getAttribute('data-name');
            payAllOrders(customerName);
        });
    });
}
function normalizeCustomerName(name) {
    return name.replace(/\s+/g, "_");
}
async function showPaymentModalForAllOrders(totalAmount, customerName) {
    return new Promise((resolve) => {
        const modal = document.getElementById('payment-modal');
        const modalMessage = document.getElementById('payment-modal-message');
        const closeButton = document.getElementById('close-payment-modal');

        // Kontrola, zda jsou všechny elementy přítomné
        if (!modal || !modalMessage || !closeButton) {
            console.error("❌ Chybí elementy modálního okna.");
            resolve(null); // Vrátí null, pokud elementy chybí
            return;
        }

        // Zobrazení modálního okna
        modal.style.display = 'block';
        modalMessage.textContent = `Zákazník: ${customerName}\nCelková částka: ${Number(totalAmount).toFixed(2)} Kč\nVyberte způsob platby:`;

        // Přidání event listenerů na tlačítka způsobu platby
        document.querySelectorAll('.payment-method-button').forEach(button => {
            const newButton = button.cloneNode(true); // Klonování tlačítka
            button.replaceWith(newButton); // Nahrazení starého tlačítka novým
            newButton.onclick = function () {
                const paymentMethod = this.getAttribute('data-method');
                modal.style.display = 'none'; // Zavření modálního okna
                resolve(paymentMethod);
            };
        });

        // Zavření modálního okna
        const newCloseButton = closeButton.cloneNode(true); // Klonování tlačítka zavření
        closeButton.replaceWith(newCloseButton); // Nahrazení starého tlačítka novým
        newCloseButton.onclick = function () {
            modal.style.display = 'none';
            resolve(null); // Vrátí null, pokud uživatel zavře okno
        };
    });
}

async function payAllOrders(customerName) {
    try {
        const normalizedCustomer = normalizeCustomerName(customerName);

        const response = await fetch(`${serverEndpoint}/customerOrders?customer=${encodeURIComponent(normalizedCustomer)}`);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

        let orders = await response.json();
        const unpaidOrders = orders.filter(order =>
            (order.payed !== true && order.payed !== "true" && order['@payed'] !== "true") &&
            (order.cancelled !== true && order.cancelled !== "true" && order['@cancelled'] !== "true")
        );

        if (unpaidOrders.length === 0) {
            alert(`Zákazník ${customerName} nemá žádné nezaplacené objednávky.`);
            return;
        }

        console.log("📋 Nezaplacené objednávky:", unpaidOrders);

        // 💰 Sečteme celkovou částku
        const total = unpaidOrders.reduce((sum, order) => sum + Number(order.TotalPrice || 0), 0);

        // 🟢 Zobrazíme modální okno pro výběr způsobu platby
        const paymentMethod = await showPaymentModalForAllOrders(total, customerName);
        if (!paymentMethod) {
            //alert("Platba byla zrušena.");
            return;
        }

        // ✅ Označíme každou objednávku jako zaplacenou
        for (const order of unpaidOrders) {
            if (!order['@id']) {
                console.error("❌ Objednávka nemá ID:", order);
                continue; // Přeskočíme objednávky bez ID
            }
            await markCustomerOrderAsPaid(customerName, order['@id']);
        }

        // 💳 Zaznamenáme platbu do směny
        await addPaymentToShift(customerName, total, paymentMethod);

        alert(`✅ ${unpaidOrders.length} objednávek bylo zaplaceno. Celkem ${total.toFixed(2)} Kč.`);
        loadOrders(customerName); // Aktualizace

    } catch (error) {
        console.error('❌ Chyba při placení všech objednávek:', error);
        alert('Nepodařilo se zaplatit všechny objednávky.');
    }
}
async function addPaymentToShift(customerName, total, paymentMethod) {
    try {
        const shiftID = getShiftID(); // Získání aktuálního ID směny
        if (!shiftID) {
            throw new Error("❌ Směna není otevřená!");
        }

        const response = await fetch(`${serverEndpoint}/logOrder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                order: [
                    {
                        name: `Platba zákazníka ${customerName}`,
                        quantity: 1,
                        price: total,
                        totalPrice: total
                    }
                ],
                paymentMethod: paymentMethod,
                totalAmount: total,
                selectedCustomer: customerName,
                shiftID: shiftID
            })
        });

        if (!response.ok) {
            throw new Error('Chyba při zaznamenávání platby do směny.');
        }

        console.log(`✅ Platba zákazníka ${customerName} ve výši ${total} Kč byla úspěšně zaznamenána do směny.`);
    } catch (error) {
        console.error('❌ Chyba při zaznamenávání platby do směny:', error);
        throw error;
    }
}
async function submitOrder() {
    console.log(`📤 Odesílám objednávku:`, order);

    const shiftID = getShiftID(); // 🟢 Kontrola aktuální směny

    if (!shiftID) {
        console.error("❌ Chyba: Směna není otevřená!");
        showModal("❌ Nelze zpracovat objednávku: Směna není otevřená!", true, true);
        return;
    }

    const requestBody = {
        order: order.map(item => ({
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            totalPrice: item.totalPrice
        })),
        paymentMethod: selectedPaymentMethod,
        totalAmount: totalAmount,
        selectedCustomer: selectedCustomer,
        shiftID: shiftID // ✅ Přidáno shiftID
    };

    try {
        const response = await fetch(`${serverEndpoint}/logOrder`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! Status: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        console.log(`✅ Objednávka úspěšně odeslána:`, result);
        resetOrder(); // ✅ Po odeslání vyčistí objednávku
    } catch (error) {
        console.error("❌ Chyba při odesílání objednávky:", error);
        showModal("❌ Chyba při odesílání objednávky!", true, true);
    }
}


// Přidání zákazníka
document.getElementById('addCustomerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const customerName = document.getElementById('customerName').value.trim();
    if (!customerName) {
        return alert("Zadejte prosím jméno zákazníka.");
    }

    try {
        const response = await fetch(`${serverEndpoint}/addCustomer`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: customerName })
        });

        const result = await response.json();
        alert(result.message);
        loadCustomers(); // Aktualizace seznamu
    } catch (error) {
        console.error("Chyba při přidávání zákazníka:", error);
        alert("Nepodařilo se přidat zákazníka.");
    }
});

// Odstranění zákazníka
async function deleteCustomer(name) {
    const confirmDelete = confirm(`Opravdu chcete smazat zákazníka ${name}?`);
    if (!confirmDelete) return;

    try {
        const response = await fetch(`${serverEndpoint}/deleteCustomer`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name })
        });

        const result = await response.json();
        alert(result.message);
        loadCustomers(); // Aktualizace seznamu
    } catch (error) {
        console.error("Chyba při mazání zákazníka:", error);
        alert("Nepodařilo se smazat zákazníka.");
    }
}

// Načtení a zobrazení objednávek zákazníka
async function loadOrders(customerName) {
    try {
        const normalizedCustomer = normalizeCustomerName(customerName);

        const response = await fetch(`${serverEndpoint}/customerOrders?customer=${encodeURIComponent(normalizedCustomer)}`);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        let orders = await response.json();
        console.log("Načtené objednávky:", orders);

        // Filtrujeme pouze objednávky, které nejsou zaplacené
        orders = orders.filter(order => {
            const payed = order.payed || order['@payed'];
            return payed !== true && payed !== "true";
        });

        const orderDetails = document.getElementById('orderDetails');
        orderDetails.innerHTML = `<h3>Objednávky zákazníka: ${customerName}</h3>`;

        if (orders.length === 0) {
            orderDetails.innerHTML += `<p>Žádné objednávky.</p>`;
            return;
        }

        let totalAmount = 0;

        orders.forEach(order => {
            const orderId = order['@id'] || 'N/A';
            const totalPrice = order.TotalPrice || 0;
            const products = order.Products || 'N/A';
            const orderDate = order.Date || 'N/A';

            totalAmount += Number(totalPrice);

            const orderElement = document.createElement('div');
            orderElement.style.marginBottom = '15px';
            orderElement.style.padding = '10px';
            orderElement.style.border = '1px solid #ddd';
            orderElement.style.borderRadius = '8px';
            orderElement.style.backgroundColor = '#f9f9f9';

            orderElement.innerHTML = `
                <p>
                  <strong>ID:</strong> ${orderId}, 
                  <strong>Celková cena:</strong> ${totalPrice} Kč, 
                  <strong>Datum:</strong> ${orderDate}
                </p>
                <p><strong>Produkty:</strong> ${products}</p>
                <button class="pay-order-button" data-id="${orderId}">Zaplatit</button>
                <hr>
            `;
            orderDetails.appendChild(orderElement);
        });

        orderDetails.innerHTML += `<p><strong>Celkový součet nezaplacených objednávek:</strong> ${totalAmount} Kč</p>`;
        document.getElementById('orderOverview').style.display = 'block';

        // Přidání event listenerů pro tlačítka "Zaplatit"
        document.querySelectorAll('.pay-order-button').forEach(button => {
            button.addEventListener('click', e => {
                const orderId = e.target.getAttribute('data-id');
                console.log(`Kliknuto na tlačítko Zaplatit pro objednávku ID: ${orderId}`);
                showPaymentModal(orderId, customerName);
            });
        });
    } catch (error) {
        console.error('Chyba při načítání objednávek:', error);
        alert('Nepodařilo se načíst objednávky zákazníka.');
    }
}

async function showPaymentModal(orderId, customerName) {
    const paymentModal = document.getElementById('payment-modal');
    paymentModal.style.display = 'block';

    // Získání objednávek pro daného zákazníka
    const response = await fetch(`${serverEndpoint}/customerOrders?customer=${encodeURIComponent(normalizeCustomerName(customerName))}`);
    if (!response.ok) {
        alert("Nepodařilo se načíst objednávky zákazníka.");
        return;
    }
    const orders = await response.json();
    const thisOrder = orders.find(o => String(o['@id']) === String(orderId));
    const totalPrice = Number(thisOrder?.TotalPrice || 0);

    // Přidání event listenerů na tlačítka způsobu platby
    document.querySelectorAll('.payment-method-button').forEach(button => {
        button.addEventListener('click', async function () {
            const paymentMethod = this.getAttribute('data-method');
            console.log(`💳 Platím objednávku ID: ${orderId} způsobem: ${paymentMethod}, cena: ${totalPrice} Kč`);

            try {
                // Záznam platby do směny
                await payCustomerOrder(orderId, customerName, totalPrice, paymentMethod);


                paymentModal.style.display = 'none'; // Zavře modální okno
                console.log(`✅ Objednávka ID ${orderId} byla úspěšně zaplacena.`);
                loadOrders(customerName); // Obnoví seznam
            } catch (error) {
                console.error(`❌ Chyba při placení objednávky ID ${orderId}:`, error);
                alert(`Nepodařilo se zaplatit objednávku ID ${orderId}.`);
            }
        });
    });

    // Zavření modálního okna
    document.getElementById('close-payment-modal').addEventListener('click', () => {
        paymentModal.style.display = 'none';
    });
}
async function getShiftSummary() {
    try {
        const shiftID = getShiftID(); // Získání aktuálního ID směny
        if (!shiftID) {
            throw new Error("❌ Směna není otevřená!");
        }

        const response = await fetch(`${serverEndpoint}/shiftSummary?shiftID=${shiftID}`);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const orders = await response.json(); // Načtení objednávek směny
        console.log("📋 Načtené objednávky směny:", orders);

        // Inicializace souhrnných hodnot
        let totalRevenue = 0;
        let cashRevenue = 0;
        let cardRevenue = 0;
        let employeeAccountRevenue = 0;

        // Iterace přes objednávky a sčítání tržeb podle způsobu platby
        orders.forEach(order => {
            const paymentMethod = order.paymentMethod || "Neznámé";
            const totalPrice = Number(order.totalPrice || 0);

            totalRevenue += totalPrice;

            if (paymentMethod === "Hotovost") {
                cashRevenue += totalPrice;
            } else if (paymentMethod === "Karta") {
                cardRevenue += totalPrice;
            } else if (paymentMethod === "Účet zaměstnance") {
                employeeAccountRevenue += totalPrice;
            }
        });

        // Výpis souhrnu do konzole
        console.log("📊 Shrnutí směny:");
        console.log(`Celková tržba: ${totalRevenue.toFixed(2)} Kč`);
        console.log(`Hotovost: ${cashRevenue.toFixed(2)} Kč`);
        console.log(`Karta: ${cardRevenue.toFixed(2)} Kč`);
        console.log(`Účty zaměstnanců: ${employeeAccountRevenue.toFixed(2)} Kč`);

        // Vrácení souhrnu jako objekt
        return {
            totalRevenue: totalRevenue.toFixed(2),
            cashRevenue: cashRevenue.toFixed(2),
            cardRevenue: cardRevenue.toFixed(2),
            employeeAccountRevenue: employeeAccountRevenue.toFixed(2)
        };
    } catch (error) {
        console.error("❌ Chyba při získávání shrnutí směny:", error);
        return null;
    }
}

async function showShiftSummary() {
    const summary = await getShiftSummary();
    if (summary) {
        alert(`
            📊 Shrnutí směny:
            Celková tržba: ${summary.totalRevenue} Kč
            Hotovost: ${summary.cashRevenue} Kč
            Karta: ${summary.cardRevenue} Kč
            Účty zaměstnanců: ${summary.employeeAccountRevenue} Kč
        `);
    } else {
        alert("❌ Nepodařilo se získat shrnutí směny.");
    }
}


async function showCustomerOrders(customerName) {
    console.log(`📋 Zobrazuji objednávky zákazníka: ${customerName}`);

    /* Simulace načtení objednávek zákazníka (nahraďte skutečným API voláním)
    const orders = [
        { id: 23, totalPrice: 500, date: '2025-04-13 12:13:14', products: '1x Zonka zelena (50 Kč)', paid: false },
        { id: 24, totalPrice: 500, date: '2025-04-13 12:13:14', products: '1x Zonka zelena (50 Kč)', paid: false }
    ];*/

    const orderDetails = document.getElementById('orderDetails');
    orderDetails.innerHTML = `<h3>Nezaplacené objednávky zákazníka: ${customerName}</h3>`;

    if (orders.length === 0) {
        orderDetails.innerHTML += '<p>Žádné nezaplacené objednávky.</p>';
        return;
    }

    const orderList = document.createElement('ul');
    orderList.style.listStyle = 'none';
    orderList.style.padding = '0';

    orders.forEach(order => {
        const orderItem = document.createElement('li');
        orderItem.style.marginBottom = '15px';
        orderItem.style.padding = '10px';
        orderItem.style.border = '1px solid #ddd';
        orderItem.style.borderRadius = '8px';
        orderItem.style.backgroundColor = '#f9f9f9';
        orderItem.setAttribute('data-order-id', order.id);

        orderItem.innerHTML = `
            <p><strong>ID:</strong> ${order.id}</p>
            <p><strong>Celková cena:</strong> ${order.totalPrice} Kč</p>
            <p><strong>Datum:</strong> ${order.date}</p>
            <p><strong>Produkty:</strong> ${order.products}</p>
            ${order.payed !== "true" ? `<button class="pay-order-button" data-id="${order['@id']}">Zaplatit</button>` : '<span>Zaplaceno</span>'}
        `;

        orderList.appendChild(orderItem);
    });

    orderDetails.appendChild(orderList);
}

async function markCustomerOrderAsPaid(customerName, orderId) {
    try {
        const response = await fetch(`${serverEndpoint}/markCustomerOrderAsPaid`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customerName, orderId })
        });

        if (!response.ok) {
            throw new Error(`Chyba při označení objednávky ${orderId} jako zaplacené`);
        }

        console.log(`✅ Objednávka ${orderId} zákazníka ${customerName} označena jako zaplacená.`);
    } catch (error) {
        console.error(`❌ ${error}`);
        throw error;
    }
}

// 🟢 Funkce pro provedení platby objednávky zákazníka s potvrzením
async function payCustomerOrder(orderId, customerName, totalPrice, paymentMethod = "Účet zákazníka") {
    try {
        console.log(`🔄 Odesílám požadavek na zaplacení objednávky ID: ${orderId}...`);
        console.log(`Způsob platby: ${paymentMethod}`);
        console.log(`Celková částka: ${totalPrice} Kč`);

        // Převod způsobu platby na správný formát
        const formattedPaymentMethod = paymentMethod === "cash" ? "Hotovost" : paymentMethod === "card" ? "Karta" : paymentMethod;

        // Označení objednávky jako zaplacené


        // Přizpůsobení dat pro endpoint `/logOrder`
        const orderData = [
            {
                name: `Platba účtu zaměstnance ${customerName}`, // Popis produktu
                quantity: 1, // Jedna platba
                price: totalPrice, // Cena za jednotku
                totalPrice: totalPrice // Celková cena
            }
        ];

        // Zaznamenání platby do směny přes endpoint `/logOrder`
        const logResponse = await fetch(`${serverEndpoint}/logOrder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                order: orderData, // Pole produktů
                paymentMethod: formattedPaymentMethod, // Způsob platby
                totalAmount: totalPrice, // Celková částka
                selectedCustomer: customerName, // Jméno zákazníka
                shiftID: getShiftID() // Dynamické získání ID směny
            })
        });

        if (!logResponse.ok) {
            throw new Error('Chyba při zaznamenávání platby do směny.');
        }

        console.log(`✅ Platba objednávky ID ${orderId} byla úspěšně zaznamenána do směny.`);
        await markCustomerOrderAsPaid(customerName, orderId);       
        loadOrders(customerName); // Aktualizace zobrazení objednávek
    } catch (error) {
        console.error('❌ Chyba při zpracování platby objednávky:', error);
    }
}


// Získání elementů pro zobrazení a skrytí formuláře pro přidání zákazníka
const showFormButton = document.getElementById('showAddCustomerFormButton');
const addCustomerSection = document.getElementById('addCustomerSection');
const hideFormButton = document.getElementById('hideFormButton');

// Zobrazit formulář pro přidání zákazníka
showFormButton.addEventListener('click', () => {
    addCustomerSection.style.display = 'block';
    showFormButton.style.display = 'none';
});

// Skrýt formulář pro přidání zákazníka
hideFormButton.addEventListener('click', () => {
    addCustomerSection.style.display = 'none';
    showFormButton.style.display = 'block';
});

// Inicializace – načteme zákazníky při spuštění
loadCustomers();
