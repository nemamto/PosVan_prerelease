let customers = []; 
let order = [];
let totalAmount = 0;
let selectedPaymentMethod = '';
let selectedCustomer = '';
let currentShiftID = null; 
let shiftID 
//const serverEndpoint = 'https://posven00-707895647386.us-central1.run.app';
const serverEndpoint = 'http://127.0.0.1:3000';
let loadedCategories = [];

// 🟢 Zavoláme při načtení stránky
document.addEventListener('DOMContentLoaded', async () => {
    await checkActiveShift(); // ✅ Kontrola směny při načítání
    await fetchProducts(); // ✅ Načtení produktů
});

document.addEventListener('DOMContentLoaded', async () => {
    await fetchProducts(); // Načtení produktů při načítání stránky
});
// Přidání produktu do objednávky
function addProductToOrder(product) {
    const existingProduct = order.find(item => item.id === product.id); // Hledáme podle ID

    if (existingProduct) {
        existingProduct.quantity += 1;
        existingProduct.totalPrice = existingProduct.quantity * product.price;
    } else {
        order.push({ ...product, quantity: 1, totalPrice: product.price }); // Přidáme ID produktu
    }

    totalAmount = order.reduce((sum, item) => sum + Number(item.totalPrice), 0);
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
            <button class="remove-button" data-name="${product.name}">🗑️ Odebrat</button>
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

// Odeslání objednávky - tlačítko "Odeslat objednávku" - nepoužívá se
/* document.getElementById('submit-order').addEventListener('click', function() {
    submitOrder();
}) */
//reset objednavky
document.getElementById('reset-order').addEventListener('click', function() {
    resetOrder();
});

// Funkce pro zobrazení modálního okna (univerzální)
function showModal(contentHtml, center = true) {
    // Odstranění případného starého modalu
    closeModal();

    // Vytvoření overlay
    let overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = 0;
    overlay.style.left = 0;
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.background = 'rgba(0,0,0,0.25)';
    overlay.style.zIndex = 9999;
    overlay.style.display = 'flex';
    overlay.style.alignItems = center ? 'center' : 'flex-start';
    overlay.style.justifyContent = 'center';

    // Vytvoření modalu
    let modal = document.createElement('div');
    modal.className = 'modal-content';
    modal.style.background = '#fff';
    modal.style.borderRadius = '12px';
    modal.style.boxShadow = '0 4px 16px rgba(0,0,0,0.18)';
    modal.style.color = '#222';
    modal.style.padding = '24px 18px';
    modal.style.maxWidth = '400px';
    modal.style.width = '90%';
    modal.style.textAlign = 'center';
    modal.innerHTML = contentHtml;

    // Přidání do overlay
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Zavření kliknutím mimo modal (použijte 'click', ne 'mousedown')
    overlay.addEventListener('click', function(e) {
        if (!modal.contains(e.target)) {
            closeModal();
        }
    });

    // Zabrání zavření při kliknutí uvnitř modalu
    modal.addEventListener('click', function(e) {
        e.stopPropagation();
    });

    window._currentModalOverlay = overlay;
}

// Funkce pro zavření modalu
function closeModal() {
    if (window._currentModalOverlay) {
        window._currentModalOverlay.remove();
        window._currentModalOverlay = null;
    }
}

// Úprava showCustomerSelectionModal – NEpřidávejte tlačítko Zavřít!
async function showCustomerSelectionModal() {
    await fetchCustomersIfNeeded();

    if (customers.length === 0) {
        showModal('Seznam zákazníků není k dispozici!', true);
        return;
    }

    let customerOptions = `
        <h3>Vyberte zákazníka</h3>
        <input type="text" id="customer-search" placeholder="Hledat zákazníka..." style="width:90%;padding:6px;margin-bottom:8px;">
        <select class="styled-select" id="customer-select" size="8" style="width:95%">
            ${customers.map(customer => `<option value="${customer.name}">${customer.name}</option>`).join('')}
        </select>
        <br><br>
        <button class="button" id="confirm-customer">Potvrdit</button>
    `;

    showModal(customerOptions, true);

    setTimeout(() => {
        const searchInput = document.getElementById('customer-search');
        const select = document.getElementById('customer-select');
        const confirmButton = document.getElementById('confirm-customer');

        // Filtrování zákazníků podle vyhledávání
        searchInput.addEventListener('input', function () {
            const filter = this.value.toLowerCase();
            Array.from(select.options).forEach(option => {
                option.style.display = option.value.toLowerCase().includes(filter) ? '' : 'none';
            });
        });

        // Výběr zákazníka kliknutím nebo enterem
        select.addEventListener('dblclick', () => confirmButton.click());
        select.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') confirmButton.click();
        });

        // Potvrzení výběru
        confirmButton.addEventListener('click', function () {
            selectedCustomer = select.value;
            if (selectedCustomer) {
                closeModal();
                submitOrder();
            } else {
                showModal('⚠️ Prosím vyberte zákazníka!', true);
            }
        });
    }, 100);
}

document.querySelectorAll('.payment-button').forEach(button => {
    let lastClickedButton = null; // Sledování posledního kliknutého tlačítka

    button.addEventListener('click', async function () {
        const method = this.getAttribute('data-method');

        // Pokud je tlačítko kliknuto podruhé
        if (lastClickedButton === this) {
            if (method === 'customer') {
                console.log("🟢 Otevírám formulář pro výběr zákazníka.");
                showCustomerSelectionModal(); // Otevře formulář pro výběr zákazníka
                return;
            }

            console.log(`📤 Odesílám objednávku se způsobem platby: ${selectedPaymentMethod}`);
            try {
                await submitOrder(); // Odeslání objednávky
            } catch (error) {
                console.error("❌ Chyba při odesílání objednávky:", error);
            }
            lastClickedButton = null; // Reset stavu po zaplacení
            return;
        }

        // Nastavení způsobu platby při prvním kliknutí
        document.querySelectorAll('.payment-button').forEach(btn => {
            btn.classList.remove('active');
        });

        this.classList.add('active');
        selectedPaymentMethod = method === 'cash' ? 'Hotovost' : method === 'card' ? 'Karta' : 'Účet zákazníka';
        console.log(`✅ Zvolen způsob platby: ${selectedPaymentMethod}`);

        if (method === 'customer') {
            console.log("🟢 Otevírám formulář pro výběr zákazníka.");
            showCustomerSelectionModal(); // Otevře formulář pro výběr zákazníka
        }

        lastClickedButton = this; // Nastavení aktuálního tlačítka jako posledního kliknutého
    });
});
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

    // ✅ Kontrola, zda je aktivní směna
    try {
        const response = await fetch(`${serverEndpoint}/currentShift`);
        if (!response.ok) {
            throw new Error("Chyba při ověřování směny!");
        }

        const shiftData = await response.json();
        if (!shiftData.active) {
            console.error("❌ Chyba: Směna není otevřená!");
            showModal("❌ Nemáte aktivní směnu. Prosím, zahajte směnu před odesláním objednávky!", true, true);
            return;
        }

        // Nastavení shiftID z aktuální směny
        shiftID = shiftData.shiftID;
    } catch (error) {
        console.error("❌ Chyba při kontrole aktivní směny:", error);
        showModal("❌ Chyba při ověřování směny. Zkuste to znovu!", true, true);
        return;
    }

    const requestBody = {
        order: order.map(item => ({
            id: item.id, // Přidáme ID produktu
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            totalPrice: item.totalPrice
        })),
        paymentMethod: selectedPaymentMethod,
        totalAmount: totalAmount,
        selectedCustomer: selectedCustomer,
        shiftID: shiftID
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

async function fetchCategories() {
    try {
        const response = await fetch(`${serverEndpoint}/categories`);
        if (!response.ok) throw new Error('Chyba při načítání kategorií');
        loadedCategories = await response.json();
    } catch (e) {
        console.error(e);
        loadedCategories = [];
    }
}

// Funkce pro vykreslení kategorií
async function renderProducts(products) {
    await fetchCategories(); // načti kategorie ze serveru
    const categoryContainer = document.querySelector('.category-container');
    categoryContainer.innerHTML = '';

    // Seřaď kategorie podle pořadí
    loadedCategories.sort((a, b) => a.order - b.order);

    loadedCategories.forEach(cat => {
        // Filtrování produktů do této kategorie
        const productsInCategory = products.filter(
            p => (p.category || 'Nezařazeno') === cat.name && p.active === "true"
        );
        if (productsInCategory.length === 0) return; // Nezobrazuj prázdné kategorie

        const categoryDiv = document.createElement('div');
        categoryDiv.className = 'category';
        categoryDiv.textContent = cat.name;
        categoryDiv.style.backgroundColor = cat.color;
        categoryDiv.addEventListener('click', () => renderProductsByCategory(productsInCategory));
        categoryContainer.appendChild(categoryDiv);
    });
}

// Funkce pro vykreslení produktů v kategorii
const productContainer = document.getElementById('product-container'); // Definice kontejneru

function renderProductsByCategory(products) {
    productContainer.innerHTML = ''; // Vyčistíme obsah kontejneru

    products.forEach(product => {
        const productDiv = document.createElement('div');
        productDiv.className = 'product';
        productDiv.style.backgroundColor = product.color || '#ccc';
        productDiv.innerHTML = `
            <div class="product-content">
                <h3 class="product-name">${product.name}</h3>
                <p class="product-description">${product.description || 'Bez popisu'}</p>
                <span class="product-price">${product.price} Kč</span>
            </div>
        `;
        productDiv.addEventListener('click', () => addProductToOrder({
            id: product.id,
            name: product.name,
            price: product.price,
            description: product.description,
            color: product.color
        }));
        productContainer.appendChild(productDiv);
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

// Funkce pro vykreslení kategorií
async function renderCategories() {
    const response = await fetch('/categories');
    const categories = await response.json();

    // Seřazení podle pořadí
    categories.sort((a, b) => a.order - b.order);

    const categoryContainer = document.querySelector('.category-container');
    categoryContainer.innerHTML = '';

    categories.forEach(cat => {
        const div = document.createElement('div');
        div.className = 'category';
        div.textContent = cat.name;
        div.style.backgroundColor = cat.color;
        // ... další stylování, eventy atd.
        categoryContainer.appendChild(div);
    });
}

