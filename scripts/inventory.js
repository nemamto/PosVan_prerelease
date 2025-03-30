// Funkce pro načtení produktů ze serveru
//const serverEndpoint = 'https://posven00-707895647386.us-central1.run.app';
const serverEndpoint = 'http://127.0.0.1:3000';

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


// Funkce pro vykreslení inventáře v HTML
function renderInventory(products) {
    const inventoryContainer = document.getElementById('inventory-list');

    if (!inventoryContainer) {
        console.error('❌ Element s ID "inventory-list" nebyl nalezen.');
        return;
    }

    inventoryContainer.innerHTML = `
        <tr>
            <th>Název</th>
            <th>Popis</th>
            <th>Množství</th>
            <th>Cena</th>
            <th>Akce</th>
        </tr>
    `;

    products.forEach((product) => {
        if (!product || !product.id || !product.name) {
            console.warn('⚠️ Neplatný produkt:', product);
            return;
        }

        const row = document.createElement('tr');
        row.setAttribute('data-id', product.id); // ✅ PŘIDÁME `data-id`

        const isDeactivated = product.active === "false";
        row.style.backgroundColor = isDeactivated ? "#ccc" : product.color || "#fff";
        row.style.opacity = isDeactivated ? "0.5" : "1";

        // 🛑 Přidáme kontejner na tlačítka, aby zůstala na jednom řádku
        row.innerHTML = `
            <td>${product.name}</td>
            <td>${product.description || 'Bez popisu'}</td>
            <td>${product.quantity}</td>
            <td>${product.price} Kč</td>
            <td>
                <div class="btn-container">
                    <button class="edit-btn">Upravit</button>
                    ${product.active === "false" 
                        ? `<button class="confirm-btn" data-id="${product.id}">Aktivovat</button>`
                        : `<button class="cancel-btn" data-id="${product.id}">Deaktivovat</button>`
                    }
                </div>
            </td>
        `;

        inventoryContainer.appendChild(row);
    });

    // Připojení event listenerů
    document.querySelectorAll('.cancel-btn').forEach(button => {
        button.addEventListener('click', (event) => {
            const productId = event.target.getAttribute('data-id');
            openDeleteModal(productId);
        });
    });

    document.querySelectorAll('.confirm-btn').forEach(button => {
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

async function activateProduct(productId) {
    console.log(`🔄 Aktivuji produkt ID: ${productId}...`);

    try {
        const response = await fetch(`${serverEndpoint}/activateProduct`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: productId })  // 🔹 ID produktu v těle
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(`⚠️ ${data.message}`);
        }

        console.log(`✅ Produkt ${productId} byl úspěšně aktivován.`);
        
        // 🟢 Aktualizace inventáře
        await new Promise(resolve => setTimeout(resolve, 500));
        await loadProducts();
    } catch (error) {
        console.error("❌ Chyba při aktivaci produktu:", error);
    }
}


// 🟢 Zavřít modal při kliknutí na tlačítka
document.getElementById('confirm-action').addEventListener('click', closeModal);



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
    if (!productIdToDelete) {
        console.error("❌ Chyba: Žádný produkt k deaktivaci.");
        return;
    }

    console.log(`🛑 Deaktivuji produkt ID: ${productIdToDelete}...`);

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
        // Zobrazíme potvrzení, modal použijeme jen při chybě – nebo volitelně i při úspěchu
        // openModal("✅ Produkt úspěšně přidán!");
        loadProducts(); // Aktualizace seznamu produktů
    } catch (error) {
        console.error("❌ Chyba při přidávání produktu:", error);
        openModal("❌ Chyba při přidávání produktu!");
    }
}




function handleEditProduct(event) {
    const row = event.target.closest('tr');
    const id = event.target.getAttribute('data-id');

    const cells = Array.from(row.children);
    const [idCell, nameCell, quantityCell, priceCell, actionCell] = cells;

    // Vložíme vstupy do buňky
    nameCell.innerHTML = `<input type="text" value="${nameCell.textContent}">`;
    quantityCell.innerHTML = `<input type="number" value="${quantityCell.textContent}">`;
    priceCell.innerHTML = `<input type="number" step="0.01" value="${parseFloat(priceCell.textContent)}">`;

    // Nastavíme tlačítko "Uložit"
    const saveButton = document.createElement('button');
    saveButton.textContent = 'Uložit';
    saveButton.classList.add('save-btn');
    saveButton.addEventListener('click', () => handleSaveInline(id, nameCell, quantityCell, priceCell, row));

    // Nastavíme tlačítko "Zrušit"
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Zrušit';
    cancelButton.classList.add('cancel-btn');
    cancelButton.addEventListener('click', () => loadProducts());

    // Vymazání starých tlačítek a vložení "Uložit"/"Zrušit"
    actionCell.innerHTML = ''; 
    actionCell.appendChild(saveButton);
    actionCell.appendChild(cancelButton);
}

// Funkce pro odstranění produktu
let productIdToDelete = null; // Uchování ID pro smazání

// 🟢 Otevření modálního okna
function openDeleteModal(id) {
    console.log(`🟢 Otevření modalu pro produkt ID: ${id}`);

    productIdToDelete = id;
    const modal = document.getElementById('deleteModal');
    const modalMessage = document.getElementById('delete-modal-message');
    const confirmButton = document.getElementById('confirmDelete');
    const cancelButton = document.getElementById('cancelDelete');

    if (!modal || !modalMessage || !confirmButton || !cancelButton) {
        console.error("❌ Chyba: Modální okno neobsahuje všechny potřebné prvky.");
        return;
    }

    modalMessage.textContent = `Opravdu chcete odstranit tento produkt?`;
    modal.style.display = 'flex';
    modal.style.opacity = '1';

    console.log("🟢 Modal byl úspěšně zobrazen: opacity = 1");

    confirmButton.onclick = function () {
        console.log("🟢 Kliknuto na potvrzení smazání.");
        handleDeleteConfirmed();
    };

    cancelButton.onclick = function () {
        console.log("🟢 Kliknuto na zrušení mazání.");
        closeDeleteModal();
    };
}

async function handleDeleteConfirmed() {
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

        // 🟢 **Správná interpretace odpovědi backendu**
        if (data.alreadyDeactivated) {
            console.warn(`⚠️ Produkt ID ${productIdToDelete} byl už dříve deaktivován.`);
            showModal("⚠️ Tento produkt byl už dříve deaktivován.", loadProducts);
        } else {
            console.log(`✅ Produkt ${productIdToDelete} deaktivován: ${data.message}`);
            showModal("✅ Produkt byl úspěšně deaktivován!", loadProducts);
        }

    } catch (error) {
        console.error("❌ Chyba při deaktivaci produktu:", error);
        showModal("❌ Chyba při deaktivaci produktu!");
    } finally {
        closeDeleteModal();
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



// 🟢 Event listenery pro tlačítka v modalu
document.getElementById('confirmDelete').addEventListener('click', handleDeleteConfirmed);
document.getElementById('cancelDelete').addEventListener('click', closeModal);

// 🟢 Přidání listenerů k tlačítkům smazání v tabulce
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.remove-button').forEach(button => {
        button.addEventListener('click', (event) => {
            const productId = event.target.getAttribute('data-id');
            openDeleteModal(productId);
        });
    });
});

// Při kliknutí na tlačítko "OK" modál zavře
document.getElementById('confirm-action').addEventListener('click', () => {
    closeModal();
    // Můžete zde také provést další akce, například reload stránky nebo aktualizaci dat
    // location.reload();
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

        // ✅ Odstraníme staré listenery (aby se nevolaly dvakrát)
        confirmButton.replaceWith(confirmButton.cloneNode(true));
        cancelButton.replaceWith(cancelButton.cloneNode(true));

        const newConfirmButton = document.getElementById('confirmDelete');
        const newCancelButton = document.getElementById('cancelDelete');

        // ✅ Přidání nových listenerů
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

            // ✅ Počkej 300ms na aktualizaci a pak zavři modal
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


document.addEventListener('DOMContentLoaded', () => {
    loadProducts(); // Načíst produkty při načtení stránky

    // Přidat event listener na tlačítko přidání produktu
    document.getElementById('addProductButton').addEventListener('click', handleAddProduct);

    // Nastavení listenerů pro potvrzení a zrušení mazání
    const confirmDeleteButton = document.getElementById('confirmDelete');
    const cancelDeleteButton = document.getElementById('cancelDelete');

    if (confirmDeleteButton && cancelDeleteButton) {
        confirmDeleteButton.addEventListener('click', () => {
            if (productIdToDelete) {
                fetch(`${serverEndpoint}/deactivateProduct`, {
                    method: 'put',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ id: productIdToDelete })
                })
                .then(response => response.json())
                .then(data => {
                    console.log("Zpráva o smazání:", data.message);
                    loadProducts(); // Obnoví inventář po smazání
                    closeModal();
                })
                .catch(error => console.error('Chyba při odstraňování produktu:', error));
            }
        });

        cancelDeleteButton.addEventListener('click', closeModal);
    } else {
        console.error("Prvky confirmDelete nebo cancelDelete nebyly nalezeny v DOM.");
    }
});


function enableEditing(row) {
    const id = row.getAttribute('data-id');
    const descriptionCell = row.querySelector('td:nth-child(2)');
    const quantityCell = row.querySelector('td:nth-child(3)');
    const priceCell = row.querySelector('td:nth-child(4)');
    const actionCell = row.querySelector('td:nth-child(5)');

    if (!id) {
        console.error("❌ Chyba: ID produktu nebylo nalezeno.");
        return;
    }

    console.log(`📝 Editace produktu ID: ${id}`);

    // Původní hodnoty
    const currentDescription = descriptionCell.textContent.trim();
    const currentQuantity = parseInt(quantityCell.textContent.trim());
    const currentPrice = parseFloat(priceCell.textContent.replace(' Kč', '').trim());

    // Pole pro editaci
    descriptionCell.innerHTML = `<input type="text" value="${currentDescription}">`;
    quantityCell.innerHTML = `<input type="number" min="0" value="${currentQuantity}">`;
    priceCell.innerHTML = `<input type="number" min="0" step="0.01" value="${currentPrice}">`;

    // Tlačítka uložit/zrušit uvnitř flexboxu
    actionCell.innerHTML = `
        <div class="btn-container">
            <button class="save-btn">Uložit</button>
            <button class="cancel-btn">Zrušit</button>
        </div>
    `;

    actionCell.querySelector('.save-btn').addEventListener('click', () => handleSaveInline(id, row));
    actionCell.querySelector('.cancel-btn').addEventListener('click', () => loadProducts());
}


async function handleSaveInline(id, row) {
    if (!id) {
        console.error("❌ Chyba: ID produktu je null nebo undefined.");
        return;
    }

    const descriptionInput = row.children[1].querySelector('input');
    const quantityInput = row.children[2].querySelector('input');
    const priceInput = row.children[3].querySelector('input');

    if (!descriptionInput || !quantityInput || !priceInput) {
        console.error("❌ Chyba: Některé vstupy nebyly nalezeny.");
        return;
    }

    const description = descriptionInput.value.trim();
    const quantity = parseInt(quantityInput.value);
    const price = parseFloat(priceInput.value);

    if (isNaN(quantity) || quantity < 0 || isNaN(price) || price < 0) {
        alert("❌ Neplatná hodnota pro množství nebo cenu!");
        return;
    }

    console.log(`📝 Ukládám změny pro produkt ID: ${id}`);

    try {
        const response = await fetch(`${serverEndpoint}/updateProduct`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, description, quantity, price })
        });

        if (!response.ok) {
            throw new Error("❌ Chyba při aktualizaci produktu.");
        }

        console.log(`✅ Produkt ${id} byl úspěšně aktualizován.`);
        loadProducts();
    } catch (error) {
        console.error("❌ Chyba při aktualizaci produktu:", error);
    }
}
function handleEditInline(event) {
    const row = event.target.closest('tr');
    row.querySelectorAll('td').forEach((cell, index) => {
        if (index > 0 && index < 5) { // Přeskočíme ID a jiné nepodstatné buňky
            const originalValue = cell.innerText.replace(' Kč', ''); // odstraní Kč, pokud je uvedeno
            cell.innerHTML = `<input type="text" value="${originalValue}" />`;
        }
    });

    // Přepnutí tlačítek
    row.querySelector('.edit-btn').style.display = 'none';
    row.querySelector('.save-btn').style.display = 'inline';
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