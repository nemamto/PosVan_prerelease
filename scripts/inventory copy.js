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
    `; // Záhlaví tabulky

    products.forEach((product) => {
        if (!product || !product.name) {
            console.warn('⚠️ Neplatný produkt:', product);
            return;
        }

        const row = document.createElement('tr');
        row.style.backgroundColor = product.color || '#fff';

        row.innerHTML = `
            <td>${product.name}</td>
            <td>${product.description || 'Bez popisu'}</td>
            <td>${product.quantity}</td>
            <td>${product.price} Kč</td>
            <td>
                <button class="delete-button" data-id="${product.id}">Smazat</button>
            </td>
        `;

        inventoryContainer.appendChild(row);
    });

    
    document.querySelectorAll('.delete-button').forEach(button => {
        button.addEventListener('click', (event) => {
            const productId = event.target.getAttribute('data-id');
            openDeleteModal(productId);
        });
    });
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
        cancelDeleteButton.addEventListener('click', closeDeleteModal);
    } else {
        console.error("❌ Tlačítka pro potvrzení a zrušení mazání nebyla nalezena.");
    }

    // Skryjeme modální okna při načtení stránky
    const deleteModal = document.getElementById('deleteModal');
    if (deleteModal) {
        deleteModal.style.display = 'none';
    }
});

function handleDeleteConfirmed() {
    if (productIdToDelete) {
        fetch(`${serverEndpoint}/deleteProduct`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: productIdToDelete })
        })
        .then(response => response.json())
        .then(data => {
            console.log("✅ Produkt smazán:", data.message);
            loadProducts(); // Aktualizujeme sklad
            closeDeleteModal();
        })
        .catch(error => console.error('❌ Chyba při odstraňování produktu:', error));
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
    productIdToDelete = id;
    const modal = document.getElementById('deleteModal');
    modal.classList.add('visible');
}

// 🟢 Zavření modálního okna
function closeDeleteModal() {
    const modal = document.getElementById('deleteModal');
    modal.classList.remove('visible');
}

// 🟢 Potvrzení smazání produktu
async function handleDeleteConfirmed() {
    if (!productIdToDelete) return;

    try {
        const response = await fetch(`${serverEndpoint}/deleteProduct`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: productIdToDelete })
        });

        if (!response.ok) {
            throw new Error("Chyba při mazání produktu.");
        }

        console.log(`✅ Produkt ${productIdToDelete} smazán.`);
        openModal("Produkt úspěšně smazán!");

        loadProducts(); // 🟢 Aktualizace tabulky
    } catch (error) {
        console.error("❌ Chyba při mazání produktu:", error);
        openModal("Chyba při mazání produktu!");
    } finally {
        closeDeleteModal();
    }
}

// 🟢 Event listenery pro tlačítka v modalu
document.getElementById('confirmDelete').addEventListener('click', handleDeleteConfirmed);
document.getElementById('cancelDelete').addEventListener('click', closeDeleteModal);

// 🟢 Přidání listenerů k tlačítkům smazání v tabulce
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.delete-button').forEach(button => {
        button.addEventListener('click', (event) => {
            const productId = event.target.getAttribute('data-id');
            openDeleteModal(productId);
        });
    });
});


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
                fetch(`${serverEndpoint}/deleteProduct`, {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ id: productIdToDelete })
                })
                .then(response => response.json())
                .then(data => {
                    console.log("Zpráva o smazání:", data.message);
                    loadProducts(); // Obnoví inventář po smazání
                    closeDeleteModal();
                })
                .catch(error => console.error('Chyba při odstraňování produktu:', error));
            }
        });

        cancelDeleteButton.addEventListener('click', closeDeleteModal);
    } else {
        console.error("Prvky confirmDelete nebo cancelDelete nebyly nalezeny v DOM.");
    }
});


function enableEditing(row) {
    // Načteme ID produktu z atributu data-id na řádku
    const id = row.getAttribute('data-id'); 

    // Získáme buňky pro název, popis, množství a cenu
    const nameCell = row.querySelector('td:nth-child(2)');
    const descriptionCell = row.querySelector('td:nth-child(3)');
    const quantityCell = row.querySelector('td:nth-child(4)');
    const priceCell = row.querySelector('td:nth-child(5)');

    // Přidáme logování pro kontrolu
    console.log("Buňky pro úpravy:", { nameCell, descriptionCell, quantityCell, priceCell });

    // Změna obsahu buněk na editovatelné pole
    nameCell.innerHTML = `<input type="text" value="${nameCell.textContent.trim()}">`;
    descriptionCell.innerHTML = `<input type="text" value="${descriptionCell.textContent.trim()}">`;
    quantityCell.innerHTML = `<input type="number" value="${quantityCell.textContent.trim()}">`;
    priceCell.innerHTML = `<input type="number" step="0.01" value="${priceCell.textContent.trim()}">`;

    // Přepnutí tlačítek
    const saveButton = row.querySelector('.save-btn');
    const deleteButton = row.querySelector('.delete-btn');
    saveButton.style.display = 'inline';
    deleteButton.textContent = 'Zrušit';
    deleteButton.addEventListener('click', () => {
        // Obnovení původních hodnot a ukončení režimu úprav
        loadProducts();
    });

    // Přidáme obsluhu události pro uložení změn
    saveButton.addEventListener('click', () => {
        handleSaveInline(
            id,
            nameCell.querySelector('input').value,
            descriptionCell.querySelector('input').value,
            quantityCell.querySelector('input').value,
            priceCell.querySelector('input').value,
            row
        );
    });
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
function handleSaveInline(event) {
    const row = event.target.closest('tr');
    const id = row.getAttribute('data-id');
    
    console.log("Řádek ID při ukládání:", id); // Logování ID při ukládání

    if (!id) {
        console.error("ID produktu není k dispozici");
        return;
    }

    const name = row.querySelector('td:nth-child(2) input').value;
    const description = row.querySelector('td:nth-child(3) input').value;
    const quantity = parseInt(row.querySelector('td:nth-child(4) input').value);
    const price = parseFloat(row.querySelector('td:nth-child(5) input').value);

    console.log("Upravované hodnoty:", { id, name, description, quantity, price });

    fetch(`${serverEndpoint}/updateProduct`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            id,
            name,
            description,
            quantity,
            price
        })
    })
    .then(response => response.json())
    .then(data => {
        console.log("Aktualizace produktu:", data.message);
        loadProducts(); 
    })
    .catch(error => console.error('Chyba při úpravě produktu:', error));
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