import { serverEndpoint } from './config.js';
import { showModal, showModalConfirm } from './common.js';
let allProducts = []; // Globální pole všech produktů

async function loadProducts() {
    try {
        const response = await fetch(`${serverEndpoint}/products`);
        if (!response.ok) {
            throw new Error('Chyba při načítání produktů');
        }
        const products = await response.json();
        allProducts = products; // Ulož do globální proměnné
        console.log('Načtené produkty:', products); // Ověření načtených dat

        if (!Array.isArray(products)) {
            console.warn('Žádné produkty nebyly načteny.');
            return;
        }

        renderInventory(products); // Volání funkce k vykreslení
    } catch (error) {
        console.error('Chyba při načítání produktů:', error);
    }
}

// Funkce pro vykreslení inventáře podle kategorií
function formatCurrency(value) {
    if (value === null || value === undefined || value === '') {
        return '0 Kč';
    }

    const normalised = typeof value === 'string'
        ? value.replace(/[^0-9,.-]/g, '').replace(',', '.')
        : value;

    const number = Number(normalised);

    if (!Number.isFinite(number)) {
        return `${value} Kč`;
    }

    return `${number.toLocaleString('cs-CZ', {
        minimumFractionDigits: number % 1 === 0 ? 0 : 2,
        maximumFractionDigits: 2
    })} Kč`;
}

function renderInventory(products) {
    const inventoryContainer = document.getElementById('inventory-list');
    if (!inventoryContainer) {
        console.error('❌ Element s ID "inventory-list" nebyl nalezen.');
        return;
    }

    inventoryContainer.innerHTML = '';

    if (!Array.isArray(products) || products.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'inventory-empty-state';
        emptyState.innerHTML = 'Žádné položky neodpovídají aktuálnímu filtrování.';
        inventoryContainer.appendChild(emptyState);
        return;
    }

    const categories = products.reduce((acc, product) => {
        const category = product.category || 'Nezařazeno';
        if (!acc[category]) acc[category] = [];
        acc[category].push(product);
        return acc;
    }, {});

    Object.keys(categories)
        .sort((a, b) => a.localeCompare(b, 'cs', { sensitivity: 'base' }))
        .forEach((category) => {
            const items = categories[category];
            const categoryCard = document.createElement('div');
            categoryCard.className = 'inventory-category';

            const header = document.createElement('div');
            header.className = 'inventory-category-header';
            header.innerHTML = `
                <h3 class="inventory-category-title">${category}</h3>
                <span class="inventory-category-count">${items.length} položek</span>
            `;

            const tableWrapper = document.createElement('div');
            tableWrapper.className = 'inventory-table-wrapper';

            const table = document.createElement('table');
            table.classList.add('inventory-table');
            table.innerHTML = `
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Název</th>
                        <th>Popis</th>
                        <th>Kategorie</th>
                        <th>Množství</th>
                        <th>Cena</th>
                        <th>Akce</th>
                    </tr>
                </thead>
                <tbody></tbody>
            `;

            const tbody = table.querySelector('tbody');

            items.forEach((product) => {
                if (!product || !product.id || !product.name) return;

                const row = document.createElement('tr');
                row.className = 'inventory-row';
                row.dataset.id = product.id;
                row.dataset.color = product.color || '';
                row.dataset.name = product.name || '';
                row.dataset.description = product.description || '';
                row.dataset.category = product.category || '';
                row.dataset.quantity = product.quantity ?? '';
                row.dataset.price = product.price ?? '';
                row.dataset.active = product.active === 'false' ? 'false' : 'true';

                if (product.color) {
                    row.style.setProperty('--product-color', product.color);
                    row.setAttribute('data-color', product.color);
                }

                const isDeactivated = product.active === 'false';
                if (isDeactivated) {
                    row.classList.add('is-inactive');
                }

                const statusChip = `<span class="status-chip">${isDeactivated ? 'Neaktivní' : 'Aktivní'}</span>`;

                row.innerHTML = `
                    <td>${product.id}</td>
                    <td>
                        <div class="inventory-product-name">${product.name}</div>
                        ${statusChip}
                    </td>
                    <td>${product.description || 'Bez popisu'}</td>
                    <td>${product.category || 'Nezařazeno'}</td>
                    <td>${product.quantity}</td>
                    <td>${formatCurrency(product.price)}</td>
                    <td>
                        <div class="inventory-actions">
                            <button class="btn btn-secondary btn-sm edit-btn" type="button">Upravit</button>
                            ${isDeactivated
                                ? `<button class="btn btn-success btn-sm activateProduct-btn" type="button" data-id="${product.id}">Aktivovat</button>`
                                : `<button class="btn btn-warning btn-sm deactivateProduct-btn" type="button" data-id="${product.id}">Deaktivovat</button>`
                            }
                        </div>
                    </td>
                `;

                tbody.appendChild(row);
            });

            tableWrapper.appendChild(table);
            categoryCard.append(header, tableWrapper);
            inventoryContainer.appendChild(categoryCard);
        });

    inventoryContainer.querySelectorAll('.deactivateProduct-btn').forEach(button => {
        button.addEventListener('click', async (event) => {
            const productId = event.currentTarget.getAttribute('data-id');
            await deactivateProduct(productId);
        });
    });

    inventoryContainer.querySelectorAll('.activateProduct-btn').forEach(button => {
        button.addEventListener('click', async (event) => {
            const productId = event.currentTarget.getAttribute('data-id');
            await activateProduct(productId);
        });
    });

    inventoryContainer.querySelectorAll('.edit-btn').forEach(button => {
        button.addEventListener('click', function () {
            const row = this.closest('tr');
            enableEditing(row);
        });
    });
}

// Funkce pro aktualizaci barvy produktu
/*
async function updateProductColor(productId, color) {
    if (!productId || !color) {
        console.error("❌ Chyba: ID produktu nebo barva není definována.");
        return;
    }

    try {
        const response = await fetch(`${serverEndpoint}/updateProductColor`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: productId, color })
        });

        if (!response.ok) {
            throw new Error("❌ Chyba při aktualizaci barvy produktu.");
        }

        console.log(`✅ Barva produktu ID ${productId} byla úspěšně aktualizována.`);
        loadProducts(); // Aktualizace seznamu produktů
    } catch (error) {
        console.error("❌ Chyba při aktualizaci barvy produktu:", error);
    }
}*/
document.addEventListener('DOMContentLoaded', () => {
    const toggleButton = document.getElementById('toggleAddItemForm');
    const addItemForm = document.getElementById('addItemForm');

    if (!toggleButton || !addItemForm) {
        return;
    }

    const setVisibility = (visible) => {
        if (visible) {
            addItemForm.classList.add('is-visible');
            toggleButton.textContent = 'Skrýt formulář';
            toggleButton.setAttribute('aria-expanded', 'true');
        } else {
            addItemForm.classList.remove('is-visible');
            toggleButton.textContent = 'Přidat novou položku';
            toggleButton.setAttribute('aria-expanded', 'false');
        }
    };

    setVisibility(false);

    toggleButton.addEventListener('click', () => {
        const isVisible = addItemForm.classList.contains('is-visible');
        setVisibility(!isVisible);
        if (!isVisible) {
            addItemForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
});


async function activateProduct(productId) {
    try {
        const response = await fetch(`${serverEndpoint}/activateProduct`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: productId }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText);
        }

        const result = await response.json();
        await loadProducts();
        console.log(`✅ Produkt ID ${productId} byl úspěšně aktivován:`, result);
    } catch (error) {
        console.error("❌ Chyba při aktivaci produktu:", error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const colorSelect = document.getElementById('productColor');

    if (!colorSelect) {
        return;
    }

    // Nastavení barvy pozadí při změně výběru
    colorSelect.addEventListener('change', () => {
        const selectedColor = colorSelect.value;
        if (selectedColor) {
            colorSelect.style.backgroundColor = selectedColor;
        } else {
            colorSelect.style.backgroundColor = ''; // Výchozí barva
        }
    });

    // Nastavení výchozí barvy při načtení stránky
    const initialColor = colorSelect.value;
    if (initialColor) {
        colorSelect.style.backgroundColor = initialColor;
    }
});

async function loadCategories() {
    try {
        const response = await fetch(`${serverEndpoint}/categories`);
        if (!response.ok) {
            throw new Error('Chyba při načítání kategorií.');
        }

        const categories = await response.json();
        const categorySelect = document.getElementById('productCategory');

        if (!categorySelect) {
            console.error('❌ Element s ID "productCategory" nebyl nalezen.');
            return;
        }

        // Vyčistíme roletku a přidáme kategorie
        categorySelect.innerHTML = '<option value="">Vyberte kategorii</option>';
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category.name;
            option.textContent = category.name;
            categorySelect.appendChild(option);
        });

        console.log('✅ Kategorie byly úspěšně načteny a přidány do roletky.');
    } catch (error) {
        console.error('❌ Chyba při načítání kategorií:', error);
    }
}

// Načtení kategorií při načtení stránky
document.addEventListener('DOMContentLoaded', () => {
    loadCategories();
});

// Funkce pro přidání nového produktu
async function handleAddProduct() {
    const nameInput = document.getElementById('productName');
    const descriptionInput = document.getElementById('productDescription');
    const quantityInput = document.getElementById('productQuantity');
    const priceInput = document.getElementById('productPrice');
    const colorSelect = document.getElementById('productColor');
    const categorySelect = document.getElementById('productCategory');

    const name = nameInput.value.trim();
    const description = descriptionInput.value.trim();
    const quantityRaw = quantityInput.value.trim();
    const priceRaw = priceInput.value.trim();
    const color = colorSelect.value;
    const category = categorySelect.value;

    const normalisedQuantity = Number(quantityRaw);
    const normalisedPrice = Number(priceRaw.replace(',', '.'));

    if (!name) {
        await showModal('❌ Název produktu je povinný!', {
            isError: true,
            title: 'Neplatná data',
            confirmVariant: 'danger'
        });
        return;
    }

    const isQuantityValid = quantityRaw !== '' && Number.isFinite(normalisedQuantity) && Number.isInteger(normalisedQuantity) && normalisedQuantity > 0;
    if (!isQuantityValid) {
        await showModal('❌ Množství musí být kladné celé číslo!', {
            isError: true,
            title: 'Neplatná data',
            confirmVariant: 'danger'
        });
        return;
    }

    const isPriceValid = priceRaw !== '' && Number.isFinite(normalisedPrice) && normalisedPrice > 0;
    if (!isPriceValid) {
        await showModal('❌ Cena musí být kladné číslo!', {
            isError: true,
            title: 'Neplatná data',
            confirmVariant: 'danger'
        });
        return;
    }

    if (!color) {
        await showModal('❌ Vyberte barvu produktu!', {
            isError: true,
            title: 'Neplatná data',
            confirmVariant: 'danger'
        });
        return;
    }

    if (!category) {
        await showModal('❌ Vyberte kategorii produktu!', {
            isError: true,
            title: 'Neplatná data',
            confirmVariant: 'danger'
        });
        return;
    }

    console.log('🛒 Přidávám nový produkt:', {
        name,
        description,
        quantity: normalisedQuantity,
        price: normalisedPrice,
        color,
        category
    });

    try {
        const response = await fetch(`${serverEndpoint}/addProduct`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                description,
                quantity: normalisedQuantity,
                price: normalisedPrice,
                color,
                category
            })
        });

        let data = null;
        try {
            data = await response.json();
        } catch (parseError) {
            console.warn('⚠️ Nepodařilo se zpracovat JSON odpovědi při přidávání produktu.', parseError);
        }

        if (!response.ok) {
            throw new Error(data?.message || 'Chyba při přidávání produktu.');
        }

        console.log('✅ Produkt přidán:', data?.product ?? '(bez detailů)');

        nameInput.value = '';
        descriptionInput.value = '';
        quantityInput.value = '';
        priceInput.value = '';
        colorSelect.value = '';
        colorSelect.style.backgroundColor = '';
        categorySelect.value = '';

        await showModal('✅ Produkt byl úspěšně přidán!', {
            title: 'Hotovo',
            confirmVariant: 'success'
        });

        await loadProducts();
    } catch (error) {
        console.error('❌ Chyba při přidávání produktu:', error);
        await showModal(`❌ ${error.message}`, {
            isError: true,
            title: 'Přidání produktu selhalo',
            confirmVariant: 'danger'
        });
    }
}
// Funkce pro odstranění produktu
async function deactivateProduct(productId, { skipConfirm = false } = {}) {
    if (!productId) {
        console.error('❌ Chyba: ID produktu není definováno.');
        return false;
    }

    let success = false;

    try {
        console.log(`🛑 Deaktivuji produkt ID: ${productId}...`);

        const response = await fetch(`${serverEndpoint}/deactivateProduct`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: String(productId) })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data?.message || 'Chyba při deaktivaci produktu.');
        }

        success = true;

        if (data?.alreadyDeactivated) {
            console.warn(`⚠️ Produkt ID ${productId} byl už dříve deaktivován.`);
        } else {
            console.log(`✅ Produkt ${productId} deaktivován: ${data.message}`);
        }
    } catch (error) {
        console.error('❌ Chyba při deaktivaci produktu:', error);
        await showModal(
            `❌ Chyba při deaktivaci produktu: ${error.message}`,
            { isError: true, title: 'Deaktivace selhala', confirmVariant: 'danger' }
        );
    } finally {
        await loadProducts();
    }

    return success;
}

async function deleteProduct(productId, { skipConfirm = false } = {}) {
    if (!productId) {
        console.error('❌ Chyba: ID produktu není definováno.');
        return false;
    }

    if (!skipConfirm) {
        const confirmed = await showModalConfirm(
            'Opravdu chcete produkt trvale odstranit?',
            {
                title: 'Odstranění produktu',
                confirmText: 'Odstranit',
                cancelText: 'Zrušit',
                variant: 'danger'
            }
        );

        if (!confirmed) {
            return false;
        }
    }

    let success = false;

    try {
        const response = await fetch(`${serverEndpoint}/deleteProduct`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: productId })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data?.message || 'Chyba při mazání produktu.');
        }

        success = true;

        await showModal('✅ Produkt byl trvale odstraněn.', {
            title: 'Hotovo',
            confirmVariant: 'success'
        });
    } catch (error) {
        console.error('❌ Chyba při mazání produktu:', error);
        await showModal(
            `❌ Chyba při mazání produktu: ${error.message}`,
            { isError: true, title: 'Mazání selhalo', confirmVariant: 'danger' }
        );
    } finally {
        await loadProducts();
    }

    return success;
}

let loadedCategories = [];

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

async function enableEditing(row) {
    const id = row.getAttribute('data-id');
    const idCell = row.children[0];
    const nameCell = row.children[1];
    const descriptionCell = row.children[2];
    const categoryCell = row.children[3];
    const quantityCell = row.children[4];
    const priceCell = row.children[5];
    const actionCell = row.children[6]; // POZOR: teď je actionCell na indexu 6!

    if (!id) {
        console.error("❌ Chyba: ID produktu nebylo nalezeno.");
        return;
    }

    const currentName = row.dataset.name || nameCell.querySelector('.inventory-product-name')?.textContent.trim() || '';
    const currentDescription = row.dataset.description || descriptionCell.textContent.trim();
    const currentCategory = row.dataset.category || categoryCell.textContent.trim();
    const currentQuantity = Number(row.dataset.quantity ?? quantityCell.textContent.trim());
    const priceText = row.dataset.price !== undefined ? String(row.dataset.price) : priceCell.textContent;
    const numericPrice = Number(priceText.replace(/[^0-9,.-]/g, '').replace(',', '.'));
    const currentPrice = Number.isFinite(numericPrice) ? numericPrice : 0;
    const currentColor = row.dataset.color || '#ffffff';

    if (loadedCategories.length === 0) await fetchCategories();

    nameCell.innerHTML = `<input type="text" value="${currentName}">`;
    descriptionCell.innerHTML = `<input type="text" value="${currentDescription}">`;
    categoryCell.innerHTML = `
        <select>
            ${loadedCategories.map(cat => `
                <option value="${cat.name}" ${currentCategory === cat.name ? 'selected' : ''}>${cat.name}</option>
            `).join('')}
        </select>
    `;
    quantityCell.innerHTML = `<input type="number" min="0" value="${currentQuantity}">`;
    priceCell.innerHTML = `<input type="number" min="0" step="0.01" value="${currentPrice}">`;

    // Color picker a tlačítka do jedné buňky
    actionCell.innerHTML = `
        <div class="inventory-inline-actions">
            <input type="color" class="inventory-color-picker" value="${currentColor}">
            <div class="inventory-actions">
                <button class="btn btn-success btn-sm save-btn" type="button">Uložit</button>
                <button class="btn btn-secondary btn-sm cancel-btn" type="button">Zrušit</button>
                <button class="btn btn-warning btn-sm deactivate-btn" type="button">Deaktivovat</button>
                <button class="btn btn-danger btn-sm delete-btn" type="button">Odstranit</button>
            </div>
        </div>
    `;

    actionCell.querySelector('.save-btn').addEventListener('click', () => handleSaveInline(id, row));
    actionCell.querySelector('.cancel-btn').addEventListener('click', () => loadProducts());
    actionCell.querySelector('.deactivate-btn').addEventListener('click', async () => {
        await deactivateProduct(id);
    });
    actionCell.querySelector('.delete-btn').addEventListener('click', async () => {
        await deleteProduct(id);
    });
}

function rgbToHex(rgb) {
    const result = rgb.match(/\d+/g);
    if (!result) return "#ffffff";
    return (
        "#" +
        result
            .map(x => {
                const hex = parseInt(x).toString(16);
                return hex.length === 1 ? "0" + hex : hex;
            })
            .join("")
    );
}

async function handleSaveInline(id, row) {
    if (!id) {
        console.error("❌ Chyba: ID produktu je null nebo undefined.");
        return;
    }

    const nameInput = row.children[1].querySelector('input');
    const descriptionInput = row.children[2].querySelector('input');
    const categorySelect = row.children[3].querySelector('select');
    const quantityInput = row.children[4].querySelector('input');
    const priceInput = row.children[5].querySelector('input');
    const colorInput = row.children[6].querySelector('input[type="color"]'); // změna: index 6

    if (!nameInput || !descriptionInput || !categorySelect || !quantityInput || !priceInput || !colorInput) {
        console.error("❌ Chyba: Některé vstupy nebyly nalezeny.");
        return;
    }

    const name = nameInput.value.trim();
    const description = descriptionInput.value.trim();
    const category = categorySelect.value;
    const quantityRaw = quantityInput.value.trim();
    const priceRaw = priceInput.value.trim();
    const quantity = Number(quantityRaw);
    const price = Number(priceRaw.replace(',', '.'));
    const color = colorInput.value;

    if (!name) {
        await showModal('❌ Název produktu nesmí být prázdný.', {
            isError: true,
            title: 'Neplatná data',
            confirmVariant: 'danger'
        });
        return;
    }

    const isQuantityValid = quantityRaw !== '' && Number.isFinite(quantity) && Number.isInteger(quantity) && quantity >= 0;
    if (!isQuantityValid) {
        await showModal('❌ Množství musí být celé číslo větší nebo rovné nule.', {
            isError: true,
            title: 'Neplatná data',
            confirmVariant: 'danger'
        });
        return;
    }

    const isPriceValid = priceRaw !== '' && Number.isFinite(price) && price >= 0;
    if (!isPriceValid) {
        await showModal('❌ Cena musí být číslo větší nebo rovné nule.', {
            isError: true,
            title: 'Neplatná data',
            confirmVariant: 'danger'
        });
        return;
    }

    try {
        console.log('Odesílám na server:', {
            id,
            name,
            description,
            category,
            quantity,
            price,
            color
        });
        const response = await fetch(`${serverEndpoint}/updateProduct`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, name, description, category, quantity, price, color })
        });
        if (!response.ok) {
            throw new Error('Chyba při ukládání produktu.');
        }
        await loadProducts();
    } catch (e) {
        console.error(e);
        await showModal('❌ Chyba při ukládání produktu!', {
            isError: true,
            title: 'Uložení selhalo',
            confirmVariant: 'danger'
        });
    }
}

// Načíst a vykreslit inventář při načtení stránky a přidat event listener na tlačítko přidání
document.addEventListener('DOMContentLoaded', () => {
    loadProducts(); // Načíst produkty při načtení stránky

    // Přidat event listener na tlačítko přidání produktu
    const addProductButton = document.getElementById('addProductButton');
    if (addProductButton) {
        addProductButton.addEventListener('click', handleAddProduct);
    } else {
        console.warn('⚠️ Tlačítko pro přidání produktu nebylo nalezeno.');
    }
});

// Přidej tento kód pro vyhledávání:
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search');
    if (searchInput) {
        searchInput.addEventListener('input', function () {
            const query = this.value.trim().toLowerCase();
            const filtered = allProducts.filter(product =>
                (product.name && product.name.toLowerCase().includes(query)) ||
                (typeof product.description === "string" && product.description.toLowerCase().includes(query)) ||
                (product.category && product.category.toLowerCase().includes(query))
            );
            renderInventory(filtered);
        });
    }
});