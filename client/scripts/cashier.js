let customers = []; 
let order = [];
let totalAmount = 0;
let selectedPaymentMethod = '';
let selectedCustomer = '';
let currentShiftID = null; 
let shiftID;
let isUpdating = false; // Flag pro prevenci duplicitních změn množství

// Logging configuration
const LOG_LEVEL = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    NONE: 4
};

const CURRENT_LOG_LEVEL = LOG_LEVEL.INFO; // Změň na DEBUG pro detailní logy, nebo WARN pro minimum

const log = {
    debug: (...args) => CURRENT_LOG_LEVEL <= LOG_LEVEL.DEBUG && console.log('🔍', ...args),
    info: (...args) => CURRENT_LOG_LEVEL <= LOG_LEVEL.INFO && console.log('ℹ️', ...args),
    warn: (...args) => CURRENT_LOG_LEVEL <= LOG_LEVEL.WARN && console.warn('⚠️', ...args),
    error: (...args) => CURRENT_LOG_LEVEL <= LOG_LEVEL.ERROR && console.error('❌', ...args)
};

import { serverEndpoint } from './config.js';
import { checkActiveShift, closeModal, getShiftID } from './common.js';
let loadedCategories = [];

// 🟢 Zavoláme při načtení stránky
document.addEventListener('DOMContentLoaded', async () => {
    log.info('Cashier inicializován');
    await checkActiveShift();
    await fetchProducts();
    await fetchCategories();
    
    // Event delegation pro tlačítka v objednávce - pouze jednou!
    const productListSummary = document.getElementById('product-list-summary');
    log.debug('Event delegation nastaven pro objednávku');
    productListSummary.addEventListener('click', (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        
        const productName = target.getAttribute('data-name');
        
        if (target.classList.contains('increase-qty')) {
            changeProductQuantity(productName, 1);
        } else if (target.classList.contains('decrease-qty')) {
            changeProductQuantity(productName, -1);
        } else if (target.classList.contains('remove-item-btn')) {
            removeProductFromOrder(productName);
        }
    });
});

// Přidání produktu do objednávky
function addProductToOrder(product) {
    const existingProduct = order.find(item => item.id === product.id); // Hledáme podle ID

    if (existingProduct) {
        existingProduct.quantity += 1;
        existingProduct.totalPrice = existingProduct.quantity * Number(product.price);
    } else {
        order.push({ ...product, quantity: 1, totalPrice: Number(product.price) }); // Přidáme ID produktu
    }

    totalAmount = order.reduce((sum, item) => sum + Number(item.totalPrice), 0);
    updateOrderSummary();
}


// Aktualizace zobrazení objednávky
function updateOrderSummary() {
    const productListSummary = document.getElementById('product-list-summary');
    const totalAmountElement = document.getElementById('total-amount');
    productListSummary.innerHTML = ''; // Vyčištění seznamu

    order.forEach(product => {
        const productElement = document.createElement('div');
        productElement.className = 'order-item';
        productElement.innerHTML = `
            <div class="order-item-info">
                <span class="order-item-name">${product.name}</span>
                <span class="order-item-details">${product.quantity}x × ${product.price} Kč = ${product.totalPrice} Kč</span>
            </div>
            <div class="order-item-controls">
                <div class="quantity-control">
                    <button class="quantity-btn increase-qty" data-name="${product.name}" title="Zvýšit množství">+</button>
                    <button class="quantity-btn decrease-qty" data-name="${product.name}" title="Snížit množství">−</button>
                </div>
                <button class="remove-item-btn" data-name="${product.name}" title="Odebrat">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        `;
        productListSummary.appendChild(productElement);
    });

    totalAmountElement.textContent = `${totalAmount} Kč`;
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

// Funkce pro změnu množství produktu v objednávce
function changeProductQuantity(productName, change) {
    if (isUpdating) {
        log.debug('Aktualizace již probíhá, ignoruji');
        return;
    }
    
    isUpdating = true;
    
    const product = order.find(item => item.name === productName);

    if (!product) {
        log.warn(`Produkt ${productName} nenalezen v objednávce`);
        isUpdating = false;
        return;
    }

    const oldQuantity = product.quantity;
    product.quantity += change;
    log.debug(`${productName}: ${oldQuantity} → ${product.quantity}`);

    if (product.quantity <= 0) {
        log.debug(`Odebírám ${productName} (množství <= 0)`);
        removeProductFromOrder(productName);
        isUpdating = false;
        return;
    }

    product.totalPrice = product.quantity * Number(product.price);
    
    const oldTotalAmount = totalAmount;
    totalAmount = order.reduce((sum, item) => sum + Number(item.totalPrice), 0);
    log.debug(`Celková částka: ${oldTotalAmount} → ${totalAmount} Kč`);

    updateOrderSummary();
    
    setTimeout(() => {
        isUpdating = false;
    }, 50);
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
    // Najdi overlay a message v DOM
    const overlay = document.getElementById('modal-overlay');
    const message = document.getElementById('modal-message');
    if (!overlay || !message) return;

    message.innerHTML = contentHtml;
    overlay.style.display = 'flex';
    overlay.style.alignItems = center ? 'center' : 'flex-start';
    overlay.style.justifyContent = 'center';

    // Zavření kliknutím mimo modal-content
    overlay.onclick = (e) => {
        if (e.target === overlay) closeModal();
    };
}

// Úprava showCustomerSelectionModal – NEpřidávejte tlačítko Zavřít!
async function showCustomerSelectionModal() {
    await fetchCustomersIfNeeded();

    if (customers.length === 0) {
        showModal('Seznam zákazníků není k dispozici!', true);
        return;
    }

    let customerOptions = `
        <div class="customer-selection-modal">
            <h3>Vyberte zákazníka</h3>
            <input 
                type="text" 
                id="customer-search" 
                placeholder="🔍 Hledat zákazníka..." 
                autocomplete="off"
            >
            <select id="customer-select" size="10">
                ${customers.map(customer => `<option value="${customer.name}">${customer.name}</option>`).join('')}
            </select>
            <button class="button" id="confirm-customer">✓ Potvrdit výběr</button>
        </div>
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
    let lastClickedButton = null;

    button.addEventListener('click', async function () {
        const method = this.getAttribute('data-method');

        // Pokud je tlačítko kliknuto podruhé
        if (lastClickedButton === this) {
            if (method === 'customer') {
                // Otevře modal pro výběr zákazníka, NEODESÍLÁ objednávku!
                showCustomerSelectionModal();
                return;
            }

            // Odeslání objednávky pouze pro jiné způsoby platby
            log.debug(`Odesílám objednávku: ${selectedPaymentMethod}`);
            try {
                await submitOrder();
            } catch (error) {
                log.error("Chyba při odesílání objednávky:", error);
            }
            lastClickedButton = null;
            return;
        }

        // Nastavení způsobu platby při prvním kliknutí
        document.querySelectorAll('.payment-button').forEach(btn => {
            btn.classList.remove('active');
        });

        this.classList.add('active');
        selectedPaymentMethod = method === 'cash' ? 'Hotovost' : method === 'card' ? 'Karta' : 'Účet zákazníka';
        log.info(`Platba: ${selectedPaymentMethod}`);

        if (method === 'customer') {
            showCustomerSelectionModal();
        }

        lastClickedButton = this;
    });
});

function initializeShift() {
    let shiftID = localStorage.getItem("shiftID");

    if (!shiftID) {
        log.debug("Načítám aktuální směnu");
        fetch(`${serverEndpoint}/currentShift`)
            .then(response => response.json())
            .then(data => {
                if (data.active) {
                    localStorage.setItem("shiftID", data.shiftID);
                    currentShiftID = data.shiftID;
                    log.info(`Směna načtena: ID ${data.shiftID}`);
                } else {
                    log.warn("Žádná aktivní směna");
                    currentShiftID = null;
                }
            })
            .catch(error => log.error("Chyba při načítání směny:", error));
    } else {
        currentShiftID = shiftID;
        log.debug(`Směna z localStorage: ID ${shiftID}`);
    }
}

export async function submitOrder() {
    log.debug('Odesílám objednávku:', order);

    const shiftID = await getShiftID();

    if (!shiftID) {
        log.error("Směna není otevřená");
        showModal("❌ Nelze zpracovat objednávku: Směna není otevřená!", true, true);
        return;
    }

    if (!order || order.length === 0) {
        log.warn("Pokus o odeslání prázdné objednávky");
        showModal("❌ Nelze odeslat prázdnou objednávku!", true);
        return;
    }

    if (!selectedPaymentMethod) {
        log.warn("Způsob platby nebyl vybrán");
        showModal("❌ Vyberte způsob platby!", true);
        return;
    }

    if (selectedPaymentMethod === "Účet zákazníka" && !selectedCustomer) {
        log.warn("Zákazník nebyl vybrán pro platbu na účet");
        showModal("❌ Vyberte zákazníka pro platbu na účet!", true);
        return;
    }

    const requestBody = {
        order: order.map(item => ({
            id: item.id,
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
        log.info(`Objednávka odeslána: ${totalAmount} Kč, ${order.length} položek`);
        resetOrder();
    } catch (error) {
        log.error("Chyba při odesílání objednávky:", error);
        showModal("❌ Chyba při odesílání objednávky!", true, true);
    }
}




// Zavoláme při načtení stránky
initializeShift();

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
        log.error('Chyba při načítání produktů:', error);
    }
}

async function fetchCategories() {
    try {
        const response = await fetch(`${serverEndpoint}/categories`);
        if (!response.ok) throw new Error('Chyba při načítání kategorií');
        loadedCategories = await response.json();
    } catch (e) {
        log.error('Chyba při načítání kategorií:', e);
        loadedCategories = [];
    }
}

// Funkce pro vykreslení kategorií
async function renderProducts(products) {
    await fetchCategories();
    const categoryContainer = document.querySelector('#category-container') || document.querySelector('.category-container');
    if (!categoryContainer) {
        log.error('Kontejner kategorií nenalezen v DOM');
        return;
    }

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
        categoryDiv.className = 'category-item';
        categoryDiv.textContent = cat.name;
        if (cat.color) {
            categoryDiv.style.backgroundColor = cat.color;
        }
        categoryDiv.addEventListener('click', () => {
            document.querySelectorAll('#category-container .category-item').forEach(el => el.classList.remove('active'));
            categoryDiv.classList.add('active');
            renderProductsByCategory(productsInCategory);
        });
        categoryContainer.appendChild(categoryDiv);
    });

    const firstCategoryItem = categoryContainer.querySelector('.category-item');
    if (firstCategoryItem) {
        firstCategoryItem.click();
    } else {
        productContainer && (productContainer.innerHTML = '<p class="text-secondary">Žádné aktivní produkty k zobrazení.</p>');
    }
}

// Funkce pro vykreslení produktů v kategorii
const productContainer = document.getElementById('product-container'); // Definice kontejneru

function renderProductsByCategory(products) {
    if (!productContainer) {
        log.error('Kontejner produktů nenalezen v DOM');
        return;
    }

    productContainer.innerHTML = ''; // Vyčistíme obsah kontejneru

    products.forEach(product => {
        const productDiv = document.createElement('div');
        productDiv.className = 'product-item';
        if (product.color) {
            productDiv.style.backgroundColor = product.color;
        }

        productDiv.innerHTML = `
            <div class="product-name">${product.name}</div>
            <div class="product-description">${product.description || 'Bez popisu'}</div>
            <div class="product-price">${product.price} Kč</div>
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
const closeModalBtn = document.getElementById('close-modal');
if (closeModalBtn) {
    closeModalBtn.addEventListener('click', function() {
        const modal = document.getElementById('modal');
        if (modal) modal.style.display = 'none';
    });
}
// Funkce pro zobrazení modálního okna s výběrem zákazníka
async function fetchCustomersIfNeeded() {
    if (!customers || customers.length === 0) {
        log.debug('Načítám seznam zákazníků');
        await fetchCustomers();
    }
}

async function fetchCustomers() {
    try {
        const response = await fetch(`${serverEndpoint}/customers`);
        if (!response.ok) {
            throw new Error('Chyba při načítání zákazníků');
        }
        customers = await response.json();
        log.debug(`Načteno ${customers.length} zákazníků`);
    } catch (error) {
        log.error('Chyba při načítání zákazníků:', error);
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

