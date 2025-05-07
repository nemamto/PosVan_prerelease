import { serverEndpoint } from './config.js';

async function loadProducts() {
    try {
        const response = await fetch(`${serverEndpoint}/products`);
        if (!response.ok) {
            throw new Error('Chyba při načítání produktů');
        }
        const products = await response.json();
        console.log('Načtené produkty:', products); // Ověření načtených dat

        if (!Array.isArray(products) || products.length === 0) {
            console.warn('Žádné produkty nebyly načteny.');
            return;
        }

        renderInventory(products); // Volání funkce k vykreslení
    } catch (error) {
        console.error('Chyba při načítání produktů:', error);
    }
}

// Funkce pro vykreslení inventáře podle kategorií
function renderInventory(products) {
    const inventoryContainer = document.getElementById('inventory-list');
    if (!inventoryContainer) {
        console.error('❌ Element s ID "inventory-list" nebyl nalezen.');
        return;
    }

    // Skupina produktů podle kategorií
    const categories = products.reduce((acc, product) => {
        const category = product.category || 'Nezařazeno';
        if (!acc[category]) acc[category] = [];
        acc[category].push(product);
        return acc;
    }, {});

    inventoryContainer.innerHTML = '';

    Object.keys(categories).forEach((category) => {
        const categoryHeader = document.createElement('h3');
        categoryHeader.textContent = category;
        inventoryContainer.appendChild(categoryHeader);

        const table = document.createElement('table');
        table.classList.add('inventory-table');
        table.innerHTML = `
            <tr>
                <th>ID</th>
                <th>Název</th>
                <th>Popis</th>
                <th>Kategorie</th>
                <th>Množství</th>
                <th>Cena</th>
                <th>Barva</th>
                <th>Akce</th>
            </tr>
        `;

        categories[category].forEach((product) => {
            if (!product || !product.id || !product.name) return;

            const row = document.createElement('tr');
            row.setAttribute('data-id', product.id);

            const isDeactivated = product.active === "false";
            row.style.backgroundColor = isDeactivated ? "#ccc" : product.color || "#fff";
            row.style.opacity = isDeactivated ? "0.5" : "1";

            row.innerHTML = `
                <td>${product.id}</td>
                <td>${product.name}</td>
                <td>${product.description || 'Bez popisu'}</td>
                <td>${product.category || 'Nezařazeno'}</td>
                <td>${product.quantity}</td>
                <td>${product.price} Kč</td>
                <td>
                    <div style="width: 32px; height: 32px; border-radius: 4px; border: 1px solid #ccc; background: ${product.color || '#fff'}"></div>
                </td>
                <td>
                    <div class="btn-container">
                        <button class="edit-btn">Upravit</button>
                        ${product.active === "false" 
                            ? `<button class="activateProduct-btn" data-id="${product.id}">Aktivovat</button>`
                            : `<button class="deactivateProduct-btn" data-id="${product.id}">Deaktivovat</button>`
                        }
                    </div>
                </td>
            `;

            table.appendChild(row);
        });

        inventoryContainer.appendChild(table);
    });

    // Event listenery
    document.querySelectorAll('.deactivateProduct-btn').forEach(button => {
        button.addEventListener('click', (event) => {
            const productId = event.target.getAttribute('data-id');
            deactivateProduct(productId);
        });
    });

    document.querySelectorAll('.activateProduct-btn').forEach(button => {
        button.addEventListener('click', (event) => {
            const productId = event.target.getAttribute('data-id');
            activateProduct(productId);
        });
    });

    document.querySelectorAll('.edit-btn').forEach(button => {
        button.addEventListener('click', function () {
            const row = this.closest('tr');
            enableEditing(row);
        });
    });
}

// Funkce pro aktualizaci barvy produktu
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
}
document.addEventListener('DOMContentLoaded', () => {
    const toggleButton = document.getElementById('toggleAddItemForm');
    const addItemForm = document.getElementById('addItemForm');

    toggleButton.addEventListener('click', () => {
        // Přepínání viditelnosti formuláře
        if (addItemForm.style.display === 'none') {
            addItemForm.style.display = 'block';
            toggleButton.textContent = 'Skrýt formulář';
        } else {
            addItemForm.style.display = 'none';
            toggleButton.textContent = 'Přidat novou položku';
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
        showModal(`❌ Chyba při aktivaci produktu: ${error.message}`, true);

    }
}

document.addEventListener('DOMContentLoaded', () => {
    const addProductButton = document.getElementById('addProductButton');
    const confirmDeleteButton = document.getElementById('confirmDelete');
    const cancelDeleteButton = document.getElementById('cancelDelete');

    // Kontrola, zda tlačítka existují v DOM
    if (addProductButton) {
        addProductButton.addEventListener('click', handleAddProduct);
    } else {
        console.error("❌ Tlačítko pro přidání produktu nebylo nalezeno.");
    }

    if (confirmDeleteButton && cancelDeleteButton) {
        confirmDeleteButton.addEventListener('click', handleDeleteConfirmed);
        cancelDeleteButton.addEventListener('click', closeModal);
    } else {
        console.error("❌ Tlačítka pro potvrzení a zrušení mazání nebyla nalezena.");
    }

    // Skryjeme modální okna při načtení stránky
    const deleteModal = document.getElementById('deleteModal');
    if (deleteModal) {
        deleteModal.style.display = 'none';
    }
});

async function handleDeleteConfirmed() {
    try {
        const response = await fetch(`${serverEndpoint}/deactivateProduct`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: productIdToDelete })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(`⚠️ ${data.message}`);
        }

        console.log(`✅ Produkt ${productIdToDelete} deaktivován: ${data.message}`);

        // ✅ Počkej 500ms na aktualizaci inventáře
        await new Promise(resolve => setTimeout(resolve, 500));
        await loadProducts();
    } catch (error) {
        console.error("❌ Chyba při deaktivaci produktu:", error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const colorSelect = document.getElementById('productColor');

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
// Funkce pro přidání nového produktu
async function handleAddProduct() {
    const name = document.getElementById('productName').value.trim();
    const description = document.getElementById('productDescription').value.trim();
    const quantity = parseInt(document.getElementById('productQuantity').value, 10);
    const price = parseFloat(document.getElementById('productPrice').value);
    const color = document.getElementById('productColor').value;  // Získání vybrané barvy

    if (!name || isNaN(quantity) || isNaN(price) || quantity <= 0 || price <= 0 || !document.getElementById('productColor').value) {
        openModal("❌ Vyplňte všechna pole správně a vyberte barvu!");
        return;
    }

    console.log("🛒 Přidávám nový produkt:", { name, description, quantity, price, color });

    try {
        const response = await fetch(`${serverEndpoint}/addProduct`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description, quantity, price, color })
        });

        if (!response.ok) {
            throw new Error("Chyba při přidávání produktu.");
        }

        const data = await response.json();
        console.log("✅ Produkt přidán:", data.product);
        loadProducts(); // Aktualizace seznamu produktů
    } catch (error) {
        console.error("❌ Chyba při přidávání produktu:", error);
        openModal("❌ Chyba při přidávání produktu!");
    }
}

// Funkce pro odstranění produktu
let productIdToDelete = null; // Uchování ID pro smazání

async function deactivateProduct(productIdToDelete) {
    if (!productIdToDelete) {
        console.error("❌ Chyba: ID produktu není definováno.");
        return;
    }

    try {
        console.log(`🛑 Deaktivuji produkt ID: ${productIdToDelete}...`);

        const response = await fetch(`${serverEndpoint}/deactivateProduct`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: String(productIdToDelete) })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message);
        }

        if (data.alreadyDeactivated) {
            console.warn(`⚠️ Produkt ID ${productIdToDelete} byl už dříve deaktivován.`);
        } else {
            console.log(`✅ Produkt ${productIdToDelete} deaktivován: ${data.message}`);
        }

    } catch (error) {
        console.error("❌ Chyba při deaktivaci produktu:", error);
        showModal("❌ Chyba při deaktivaci produktu!");
    } finally {
        await loadProducts();
    }
}

function closeDeleteModal() {
    console.log("🛑 Zavírám modal pro mazání produktu...");
    
    const modal = document.getElementById('deleteModal');
    if (!modal) {
        console.error("❌ Modal neexistuje!");
        return;
    }

    modal.classList.add('closing'); // Přidáme animaci zavírání

    setTimeout(() => {
        modal.style.display = 'none';
        modal.classList.remove('visible', 'closing'); // Reset tříd
        console.log("✅ Modal úspěšně skryt.");
    }, 300); // Čekáme na dokončení animace
}

document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('deleteModal');
    if (!modal) {
        console.error("❌ Chyba: Modální okno 'deleteModal' neexistuje v HTML!");
    } else {
        console.log("🟢 Modální okno bylo úspěšně nalezeno v DOM.");
    }
});

// Event listenery pro tlačítka v modalu
document.getElementById('confirmDelete').addEventListener('click', handleDeleteConfirmed);
document.getElementById('cancelDelete').addEventListener('click', closeModal);

// Přidání listenerů k tlačítkům smazání v tabulce
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.deactivateProduct-btn').forEach(button => {
        button.addEventListener('click', (event) => {
            const productId = event.target.getAttribute('data-id');
            deactivateProduct(productId);
        });
    });
});

// Při kliknutí na tlačítko "OK" modál zavře
document.getElementById('confirm-action').addEventListener('click', () => {
    closeModal();
});

// Ujistěte se, že modál je skrytý při načtení stránky
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('modal');
    if (modal) {
        modal.style.display = 'none';
    }
});

function showModalConfirm(message, onConfirm) {
    console.log("🟢 Otevírám potvrzovací modal...");

    setTimeout(() => {
        const modal = document.getElementById('deleteModal');
        const modalMessage = document.getElementById('delete-modal-message');
        const confirmButton = document.getElementById('confirmDelete');
        const cancelButton = document.getElementById('cancelDelete');

        if (!modal || !modalMessage || !confirmButton || !cancelButton) {
            console.error("❌ Chyba: Některé prvky modálního okna nejsou dostupné!");
            return;
        }

        modalMessage.textContent = message;
        modal.style.display = 'flex';
        setTimeout(() => { modal.style.opacity = '1'; }, 10);

        console.log("✅ Potvrzovací modal byl úspěšně zobrazen.");

        confirmButton.replaceWith(confirmButton.cloneNode(true));
        cancelButton.replaceWith(cancelButton.cloneNode(true));

        const newConfirmButton = document.getElementById('confirmDelete');
        const newCancelButton = document.getElementById('cancelDelete');

        newConfirmButton.addEventListener('click', async () => {
            console.log("🟢 Potvrzeno: Probíhá deaktivace...");
            await onConfirm();
            setTimeout(() => {
                closeDeleteModal();
            }, 300);
        });

        newCancelButton.addEventListener('click', function () {
            console.log("🛑 Storno: Zavírám modal.");
            closeDeleteModal();
        });

    }, 50);
}

async function deleteOrder(orderId) {
    console.log(`🟢 Požadavek na stornování objednávky ID: ${orderId}`);

    showModalConfirm(`Opravdu chcete stornovat objednávku ${orderId}?`, async () => {
        try {
            console.log("📡 Odesílám DELETE request na server...");

            const response = await fetch(`${serverEndpoint}/orders/${orderId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                throw new Error('Chyba při mazání objednávky.');
            }

            const data = await response.json();
            console.log(`✅ Server odpověděl: ${data.message}`);

            setTimeout(async () => {
                await refreshInventory();
                fetchShifts();
                closeDeleteModal();
            }, 300);
        } catch (error) {
            console.error('❌ Chyba při mazání objednávky:', error);
        }
    });
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
    const colorCell = row.children[6];
    const actionCell = row.children[7];

    if (!id) {
        console.error("❌ Chyba: ID produktu nebylo nalezeno.");
        return;
    }

    const currentName = nameCell.textContent.trim();
    const currentDescription = descriptionCell.textContent.trim();
    const currentCategory = categoryCell.textContent.trim();
    const currentQuantity = parseInt(quantityCell.textContent.trim());
    const currentPrice = parseFloat(priceCell.textContent.replace(' Kč', '').trim());
    const currentColor = row.style.backgroundColor ? rgbToHex(row.style.backgroundColor) : "#ffffff";

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
    colorCell.innerHTML = `<input type="color" value="${currentColor}">`;

    actionCell.innerHTML = `
        <div class="btn-container">
            <button class="save-btn">Uložit</button>
            <button class="cancel-btn">Zrušit</button>
        </div>
    `;

    actionCell.querySelector('.save-btn').addEventListener('click', () => handleSaveInline(id, row));
    actionCell.querySelector('.cancel-btn').addEventListener('click', () => loadProducts());
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
    const colorInput = row.children[6].querySelector('input[type="color"]');

    if (!nameInput || !descriptionInput || !categorySelect || !quantityInput || !priceInput || !colorInput) {
        console.error("❌ Chyba: Některé vstupy nebyly nalezeny.");
        return;
    }

    const name = nameInput.value.trim();
    const description = descriptionInput.value.trim();
    const category = categorySelect.value;
    const quantity = parseInt(quantityInput.value, 10);
    const price = parseFloat(priceInput.value);
    const color = colorInput.value;

    if (!name || isNaN(quantity) || quantity < 0 || isNaN(price) || price < 0) {
        alert("❌ Neplatná hodnota pro název, množství nebo cenu!");
        return;
    }

    try {
        const response = await fetch(`${serverEndpoint}/updateProduct`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, name, description, category, quantity, price, color })
        });
        if (!response.ok) throw new Error("Chyba při ukládání produktu.");
        await loadProducts();
    } catch (e) {
        alert("Chyba při ukládání produktu!");
        console.error(e);
    }
}

// Načíst a vykreslit inventář při načtení stránky a přidat event listener na tlačítko přidání
document.addEventListener('DOMContentLoaded', () => {
    loadProducts(); // Načíst produkty při načtení stránky

    // Přidat event listener na tlačítko přidání produktu
    document.getElementById('addProductButton').addEventListener('click', handleAddProduct);
});

// Přepínání mezi stránkami přes tlačítka ve footeru
document.getElementById('cashier-button').addEventListener('click', function() {
    window.location.href = 'cashier.html'; // Přesměruje na stránku Pokladna
});

document.getElementById('inventory-button').addEventListener('click', function() {
    window.location.href = 'inventory.html'; // Přesměruje na stránku Inventář
});

document.getElementById('order-management-button').addEventListener('click', function() {
    window.location.href = 'order_management.html'; // Přesměruje na stránku Správa objednávek
});