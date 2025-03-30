let customers = []; 
let order = [];
let totalAmount = 0;
let selectedPaymentMethod = '';
let selectedCustomer = '';
let currentShiftID = null; 
let shiftID 
//const serverEndpoint = 'https://posven00-707895647386.us-central1.run.app';
const serverEndpoint = 'http://127.0.0.1:3000';
// Seznam zakazniku
/*
async function getCustomers() {
    try {
        const response = await fetch({serverEndpoint}'/customers');
        if (!response.ok) {
            throw new Error('Chyba při načítání zakazniku');
        }
        const customers = await response.json();
        console.log('Zakaznici:', customers);
    } catch (error) {
        console.error(error);
    }
}


getCustomers(); // Načtení zakazniku při načítání stránky
*/



// 🟢 Zavoláme při načtení stránky
document.addEventListener('DOMContentLoaded', async () => {
    await checkActiveShift(); // ✅ Kontrola směny při načtení
    await fetchProducts(); // ✅ Načtení produktů
});

document.addEventListener('DOMContentLoaded', async () => {
    await fetchProducts(); // Načtení produktů při načtení stránky
});
// Přidání produktu do objednávky
function addProductToOrder(product) {
    const existingProduct = order.find(item => item.name === product.name);

    if (existingProduct) {
        existingProduct.quantity += 1;
        existingProduct.totalPrice = existingProduct.quantity * product.price; // Celková cena
    } else {
        order.push({ ...product, quantity: 1, totalPrice: product.price }); // Přidání celého objektu produktu
    }

    totalAmount = order.reduce((sum, item) => sum + Number(item.totalPrice), 0); // Přepočet celkové částky
    updateOrderSummary();
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

// Aktualizace zobrazení objednávky
function updateOrderSummary() {
    const productListSummary = document.getElementById('product-list-summary');
    const totalAmountElement = document.getElementById('total-amount');
    productListSummary.innerHTML = ''; // Vyčištění seznamu

    order.forEach(product => {
        const productElement = document.createElement('p');
        productElement.innerHTML = `
            ${product.name} (${product.quantity}x) - ${product.totalPrice} Kč
            <button class="remove-button">🗑️ Odebrat</button>

        `;
        productListSummary.appendChild(productElement);
    });

    totalAmountElement.textContent = `Celkový součet: ${totalAmount} Kč`;

    // Přidání event listeneru pro odstranění produktů z objednávky
    document.querySelectorAll('.remove-button').forEach(button => {
        button.addEventListener('click', function() {
            const productName = this.getAttribute('data-name');
            removeProductFromOrder(productName);
        });
    });
}

// Funkce pro odstranění produktu z objednávky
function removeProductFromOrder(productName) {
    const productIndex = order.findIndex(item => item.name === productName);

    if (productIndex !== -1) {
        const product = order[productIndex];
        totalAmount -= product.totalPrice; // Odejmutí ceny odebraného produktu
        order.splice(productIndex, 1);
    }

    updateOrderSummary();
}

// Odeslání objednávky - tlačítko "Odeslat objednávku"
document.getElementById('submit-order').addEventListener('click', function() {
    submitOrder();
});



async function showCustomerSelectionModal() {
    await fetchCustomersIfNeeded(); // Zajistí načtení zákazníků

    if (customers.length === 0) {
        showModal('Seznam zákazníků není k dispozici!', true, true);
        return;
    }

    let customerOptions = '<h3>Vyberte zákazníka</h3>';
    customerOptions += '<select class="styled-select" id="customer-select"><option value="">Vyberte...</option>';

    customers.forEach(customer => {
        customerOptions += `<option value="${customer.name}">${customer.name}</option>`;
    });

    customerOptions += '</select><br><br><button class="button" id="confirm-customer">Potvrdit</button>';
    
    showModal(customerOptions, true); // Otevře modální okno s výběrem

    // Přidání event listeneru až po zobrazení modálního okna
    setTimeout(() => {
        const confirmButton = document.getElementById('confirm-customer');
        if (confirmButton) {
            confirmButton.addEventListener('click', function () {
                const customerSelect = document.getElementById('customer-select');
                selectedCustomer = customerSelect.value;

                if (selectedCustomer) {
                    console.log(`✅ Vybraný zákazník: ${selectedCustomer}`);
                    closeModal(); // Zavře modální okno
                    submitOrder(); // Pokračuje v procesu objednávky
                } else {
                    showModal('⚠️ Prosím vyberte zákazníka!', true, true);
                }
            });
        }
    }, 100); // Zajistí, že tlačítko existuje před přiřazením event listeneru
}


function initializeShift() {
    let shiftID = localStorage.getItem("shiftID");

    if (!shiftID) {
        console.warn("⚠️ Žádná aktivní směna. Načítám aktuální směnu...");
        fetch(`${serverEndpoint}/currentShift`)
            .then(response => response.json())
            .then(data => {
                if (data.active) {
                    localStorage.setItem("shiftID", data.shiftID);
                    currentShiftID = data.shiftID;
                    console.log(`✅ Načtená směna ID: ${data.shiftID}`);
                } else {
                    console.warn("⚠️ Žádná aktivní směna nalezena.");
                    currentShiftID = null;
                }
            })
            .catch(error => console.error("❌ Chyba při načítání směny:", error));
    } else {
        currentShiftID = shiftID;
        console.log(`✅ Aktivní směna ID: ${shiftID}`);
    }
}

// Zavoláme při načtení stránky
initializeShift();


// 🟢 Funkce pro odeslání objednávky
async function submitOrder() {
    console.log(`📤 Odesílám objednávku:`, order);

    // ✅ Kontrola, zda objednávka není prázdná
    if (!order || order.length === 0) {
        console.error("❌ Chyba: Objednávka je prázdná!");
        showModal("❌ Nelze odeslat prázdnou objednávku!", true);
        return;
    }

    // ✅ Kontrola, zda byl vybrán způsob platby
    if (!selectedPaymentMethod) {
        console.error("❌ Chyba: Nebyl vybrán způsob platby!");
        showModal("❌ Vyberte způsob platby!", true);
        return;
    }

    // ✅ Pokud je platba na účet zákazníka, musí být vybrán zákazník
    if (selectedPaymentMethod === "account" && !selectedCustomer) {
        console.error("❌ Chyba: Nebyl vybrán zákazník!");
        showModal("❌ Vyberte zákazníka pro platbu na účet!", true);
        return;
    }

    // Získáme ID aktuálně otevřené směny
    const shiftID = getShiftID(); 

    if (!shiftID) {
        console.error("❌ Chyba: Směna není otevřená!");
        // Vyvoláme modální okno s upozorněním – nová směna se nevytvoří
        showModal("❌ Nemáte aktivní směnu. Prosím, zahajte směnu před odesláním objednávky!", true, true);
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
// 🟢 Funkce pro resetování objednávky po odeslání
function resetOrder() {
    order = [];
    totalAmount = 0;
    selectedPaymentMethod = '';
    selectedCustomer = '';
    updateOrderSummary();

    document.querySelectorAll('.payment-button').forEach(button => {
        button.classList.remove('active');
    });
}


// Výběr produktu - simulace kliknutí na produkt
document.querySelectorAll('.product-button').forEach(button => {
    button.addEventListener('click', function() {
        const productData = this.getAttribute('data-value').split(',');
        const productName = productData[0];
        const productPrice = parseInt(productData[1]);
        addProductToOrder(productName, productPrice);
    });
});
async function fetchProducts() {
    try {
        
        const response = await fetch(`${serverEndpoint}/products`);
        if (!response.ok) {
            throw new Error('Chyba při načítání produktů');
        }
        const products = await response.json();
        renderProducts(products);
    } catch (error) {
        console.error('Chyba:', error);
    }
}

function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

function renderProducts(products) {
    const productContainer = document.querySelector('.product-container');
    productContainer.innerHTML = ''; // Vyčistí předchozí obsah

    // Dynamické nastavení sloupců podle šířky okna
    function setGridColumns() {
        const containerWidth = window.innerWidth;
        let columns = Math.floor(containerWidth / 220); // Např. produkty široké 200px
        columns = Math.max(columns, 1); // Minimálně 1 sloupec
        productContainer.style.gridTemplateColumns = `repeat(${columns}, 1fr)`; // Nastavení počtu sloupců
    }

    setGridColumns(); // Nastavení sloupců při načtení
    window.addEventListener('resize', setGridColumns); // Aktualizace při změně velikosti okna

    products.forEach(product => {
            // ✅ Kontrola, zda je produkt aktivní
        if (product.active !== "true") {
            return; // Pokud není aktivní, přeskočíme ho
    }
        const productDiv = document.createElement('div');
        productDiv.className = 'product';

        const productButton = document.createElement('div');
        productButton.className = 'product-button';
        productButton.style.backgroundColor = product.color || '#ccc'; // Defaultní barva

        productButton.innerHTML = `<span>${product.name} - ${product.price} Kč</span>`;
        productDiv.appendChild(productButton);
        productContainer.appendChild(productDiv);

        // Přidání event listeneru pro přidání produktu do objednávky
        productButton.addEventListener('click', () => addProductToOrder(product));
    });
}



// Funkce pro zavření modálního okna
document.getElementById('close-modal').addEventListener('click', function() {
    document.getElementById('modal').style.display = 'none';
});


// Způsoby platby - Aktivace výběru platby
document.querySelectorAll('.payment-button').forEach(button => {
    button.addEventListener('click', function() {
        document.querySelectorAll('.payment-button').forEach(btn => {
            btn.classList.remove('active');
        });

        this.classList.add('active');

        const method = this.getAttribute('data-method');
        if (method === 'customer') {
            selectedPaymentMethod = 'Účet zákazníka';
            showCustomerSelectionModal(); // Zobrazit modální okno s roletkou
        } else {
            selectedPaymentMethod = method === 'cash' ? 'Hotovost' : 'Karta';
        }
    });
});


// Funkce pro zobrazení modálního okna s výběrem zákazníka
async function fetchCustomersIfNeeded() {
    if (!customers || customers.length === 0) {
        console.log('Načítáme seznam zakazniku...');
        await fetchCustomers(); // Počkáme na dokončení načítání zakazniku
    }
}


async function fetchCustomers() {
    console.log('Načítání seznamu zakazniku...');
    try {
        const response = await fetch(`${serverEndpoint}/customers`);
        if (!response.ok) {
            throw new Error('Chyba při načítání zakazniku!');
        }
        customers = await response.json(); // Uloží data do globální proměnné
        console.log('Seznam zakazniku byl načten:', customers);
    } catch (error) {
        console.error('Chyba při načítání:', error);
    }
}

