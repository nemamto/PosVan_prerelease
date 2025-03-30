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
        alert("Nepodařilo se načíst zákazníky.");
    }
}

// Funkce pro získání souhrnu objednávek zákazníka
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
                <button class="pay-order" data-name="${customer.name}">Zaplatit</button>
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

    document.querySelectorAll('.pay-order').forEach(button => {
        button.addEventListener('click', e => {
            const customerName = e.target.getAttribute('data-name');
            payOrder(customerName);
        });
    });

}
function normalizeCustomerName(name) {
    return name.replace(/\s+/g, "_");
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
        const normalizedCustomer = normalizeCustomerName(customerName); // ✅ Normalizujeme jméno

        const response = await fetch(`${serverEndpoint}/customerOrders?customer=${encodeURIComponent(normalizedCustomer)}`);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        let orders = await response.json();
        console.log("Načtené objednávky:", orders);

        // ✅ Oprava filtru - odstranění zaplacených objednávek (řešíme '@true' i 'true')
        orders = orders.filter(order => 
            order.payed !== "true" && 
            order.payed !== "@true" && 
            order['@payed'] !== "true" && 
            order['@payed'] !== "@true"
        );

        const orderDetails = document.getElementById('orderDetails');
        orderDetails.innerHTML = `<h3>Nezaplacené objednávky zákazníka: ${customerName}</h3>`;

        if (orders.length === 0) {
            orderDetails.innerHTML += `<p>Žádné nezaplacené objednávky.</p>`;
            return;
        }

        let totalAmount = 0; // Celková cena všech nezaplacených objednávek

        orders.forEach(order => {
            const orderId = order['@id'] || 'N/A';
            const totalPrice = orders.reduce((sum, order) => {
                const price = Number(order.TotalPrice || 0);
                return sum + (isNaN(price) ? 0 : price);
            }, 0);
            
            const products = order.Products ? order.Products.trim() : 'N/A';
            const orderDate = order.Date ? order.Date : 'N/A';

            totalAmount += Number(totalPrice); // ✅ Sčítáme pouze nezaplacené objednávky

            const orderElement = document.createElement('div');
            orderElement.innerHTML = `
                <p>
                  <strong>ID:</strong> ${orderId}, 
                  <strong>Celková cena:</strong> ${totalPrice} Kč, 
                  <strong>Datum:</strong> ${orderDate}
                </p>
                <p><strong>Produkty:</strong> ${products}</p>
                <hr>
            `;
            orderDetails.appendChild(orderElement);
        });

        // ✅ Přidání celkové ceny na konec
        orderDetails.innerHTML += `<p><strong>Celkový součet nezaplacených objednávek:</strong> ${totalAmount} Kč</p>`;

        document.getElementById('orderOverview').style.display = 'block';
    } catch (error) {
        console.error('Chyba při načítání objednávek:', error);
        alert('Nepodařilo se načíst objednávky zákazníka.');
    }
}


// 🟢 Funkce pro provedení platby objednávky zákazníka s potvrzením
async function payOrder(customerName) {
    console.log(`📤 Odesílám platbu pro zákazníka: "${customerName}"`);

    if (!customerName) {
        console.error("❌ Chyba: Chybí jméno zákazníka!");
        alert("❌ Nelze provést platbu, chybí jméno zákazníka!");
        return;
    }

    try {
        const response = await fetch(`${serverEndpoint}/payOrder`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ customerName }), // ✅ Opravený klíč na `customerName`
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! Status: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        console.log(`✅ Platba úspěšná:`, result);
        loadCustomers()
    } catch (error) {
        console.error("❌ Chyba při platbě objednávky:", error);
        alert("❌ Chyba při platbě objednávky!");
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
