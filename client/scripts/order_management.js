import { serverEndpoint } from './config.js';

document.addEventListener('DOMContentLoaded', function() {
    
    const orderList = document.getElementById('order-list'); // Element pro renderování (může mít id order-list i když jde o směny)
    const prevPageButton = document.getElementById('prev-page');
    const nextPageButton = document.getElementById('next-page');
    const pageInfo = document.getElementById('page-info');

    let currentPage = 1;
    let totalPages = 1;

    // Tlačítka stránkování
    prevPageButton.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            fetchShifts();
        }
    });
    nextPageButton.addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            fetchShifts();
        }
    });

    function updatePagination() {
        pageInfo.textContent = `Stránka ${currentPage} z ${totalPages}`;
    
        // ✅ Schová tlačítka, pokud jsme na okrajích
prevPageButton.classList.toggle('hidden', currentPage === 1);
    nextPageButton.classList.toggle('hidden', currentPage === totalPages);
}

    // Funkce pro načtení směn ze serveru

    const shiftsPerPage = 10; // ✅ Počet směn na stránku
    
    async function fetchShifts() {
        console.log(`📥 Načítání směn pro stránku ${currentPage}...`);
    
        // Uchování stavu otevřených řádků
        const openShiftIds = Array.from(document.querySelectorAll('.shift-detail'))
            .filter(row => row.style.display !== 'none')
            .map(row => row.getAttribute('data-shift-id'));
    
        try {
            const response = await fetch(`${serverEndpoint}/shifts?page=${currentPage}&limit=${shiftsPerPage}`);
            if (!response.ok) throw new Error('Chyba při načítání směn!');
    
            const responseData = await response.json();
            console.log('📩 Odpověď ze serveru:', responseData);
    
            const { shifts, currentPage: serverPage, totalPages: serverTotalPages } = responseData;
            currentPage = serverPage;
            totalPages = serverTotalPages;
    
            renderShifts({ shifts, currentPage, totalPages });
    
            // Obnovení stavu otevřených řádků
            openShiftIds.forEach(id => {
                const detailRow = document.querySelector(`.shift-detail[data-shift-id="${id}"]`);
                if (detailRow) {
                    detailRow.style.display = 'table-row';
                }
            });
    
            updatePagination();
        } catch (error) {
            console.error('❌ Chyba při načítání směn:', error);
        }
    }
    
    // Definice funkce renderShifts – musí být definována před tím, než ji voláme ve fetchShifts
    function renderShifts({ shifts, currentPage, totalPages }) {
        console.log(`Vykresluji směny – stránka ${currentPage} z ${totalPages}`);
        orderList.innerHTML = '';
    
        if (!shifts || shifts.length === 0) {
            orderList.innerHTML = '<tr><td colspan="5">Žádné směny nebyly nalezeny.</td></tr>';
            return;
        }
    
        shifts.forEach(shift => {
            // Vytvoříme header řádek se základními informacemi o směně
            const headerRow = document.createElement('tr');
            headerRow.classList.add('shift-header');
            headerRow.style.cursor = 'pointer'; // Nastavíme kurzor na pointer
            headerRow.innerHTML = `
                <td>${shift.id}</td>
                <td>${shift.startTime}</td>
                <td>${shift.endTime}</td>
                <td>${shift.orderCount}</td>
            `;
    
            // Vytvoříme detailní řádek s objednávkami (skrytý na začátku)
            const detailRow = document.createElement('tr');
            detailRow.classList.add('shift-detail');
            detailRow.setAttribute('data-shift-id', shift.id); // Přidáme atribut pro identifikaci
            detailRow.style.display = 'none';
            const detailCell = document.createElement('td');
            detailCell.colSpan = 4; // Spojíme buňky přes všechny sloupce
            let detailHtml = '';
    
            if (shift.orderItems && shift.orderItems.length > 0) {
                detailHtml += '<table style="width:100%; border-collapse: collapse;">';
                detailHtml += `
                    <thead>
                        <tr>
                            <th>ID objednávky</th>
                            <th>Čas</th>
                            <th>Způsob platby</th>
                            <th>Cena</th>
                            <th>Produkty</th>
                            <th>Akce</th>
                        </tr>
                    </thead>
                    <tbody>
                `;
    
                // Inicializace součtů
                let totalCash = 0;
                let totalCard = 0;
                let totalPaid = 0;
                let totalRevenue = 0;
    
                // Řazení objednávek od nejnovějších po nejstarší
                shift.orderItems
                    .sort((a, b) => new Date(b.time) - new Date(a.time))
                    .forEach(order => {
                        const isCancelled = String(order['@cancelled']).toLowerCase() === 'true';
                        const totalPrice = Number(order.totalPrice || order.TotalPrice || order.Price || 0);
    
                        // Do souhrnu přičti jen nestornované objednávky
                        if (!isCancelled) {
                            totalRevenue += totalPrice;
    
                            if (order.paymentMethod === 'Hotovost' || order.paymentMethod === 'cash') {
                                totalCash += totalPrice;
                                totalPaid += totalPrice;
                            } else if (order.paymentMethod === 'Karta' || order.paymentMethod === 'card') {
                                totalCard += totalPrice;
                                totalPaid += totalPrice;
                            }
                        }
    
                        // Vykresli řádek vždy (i pro stornované)
                        detailHtml += `
                            <tr ${isCancelled ? 'class="cancelled-order"' : ''}>
                                <td>${order['@id']}</td>
                                <td>${order.time}</td>
                                <td>${order.paymentMethod}</td>
                                <td>${totalPrice} Kč</td>
                                <td class="products-column">${order.products}</td>
                                <td>
                                    ${isCancelled
                                        ? `<button class="restore-order" data-id="${order['@id']}">Obnovit</button>`
                                        : `<button class="cancell-order" data-id="${order['@id']}">Stornovat</button>`
                                    }
                                </td>
                            </tr>
                        `;
                    });
    
                // Přidání řádku shrnutí
                detailHtml += `
                    <tr class="shift-summary">
                        <td colspan="2"><strong>Souhrn směny:</strong></td>
                        <td><strong>Hotovost:</strong> ${totalCash} Kč</td>
                        <td><strong>Karta:</strong> ${totalCard} Kč</td>
                        <td><strong>Celkem zaplaceno:</strong> ${totalPaid} Kč</td>
                        <td></td>
                        <td><strong>Celkem:</strong> ${totalRevenue} Kč</td>
                        <td></td>
                    </tr>
                `;
    
                detailHtml += '</tbody></table>';
            } else {
                detailHtml = 'Žádné objednávky nejsou k dispozici.';
            }
            detailCell.innerHTML = detailHtml;
            detailRow.appendChild(detailCell);
    
            // Event listener pro kliknutí na řádek
            headerRow.addEventListener('click', function () {
                detailRow.style.display = (detailRow.style.display === 'none') ? 'table-row' : 'none';
            });
    
            orderList.appendChild(headerRow);
            orderList.appendChild(detailRow);
    
            // Připojení listenerů na tlačítka "Stornovat" a "Obnovit"
            setTimeout(() => {
                detailRow.querySelectorAll('.cancell-order').forEach(button => {
                    button.addEventListener('click', function (e) {
                        e.stopPropagation(); // Zabráníme zavření detailního řádku
                        const orderId = this.getAttribute('data-id');
                        console.log(`Klik na "Stornovat" pro objednávku ID: ${orderId}`);
                        showModalConfirm(`Opravdu chcete stornovat objednávku ${orderId}?`, () => {
                            deleteOrder(orderId);
                        });
                    });
                });
    
                detailRow.querySelectorAll('.restore-order').forEach(button => {
                    button.addEventListener('click', function (e) {
                        e.stopPropagation(); // Zabráníme zavření detailního řádku
                        const orderId = this.getAttribute('data-id');
                        console.log(`Klik na "Obnovit" pro objednávku ID: ${orderId}`);
                        showModalConfirm(`Opravdu chcete obnovit objednávku ${orderId}?`, () => {
                            restoreOrder(orderId);
                        });
                    });
                });
            }, 0);
        });
    }
    // Příklad funkce pro potvrzení akce pomocí confirm()
// Nahrazuje standardní confirm() modálním oknem
function showModalConfirm(message, onConfirm) {
    console.log("🟢 Otevírám potvrzovací modal...");

    const modal = document.getElementById('deleteModal');
    const modalMessage = document.getElementById('delete-modal-message');
    const confirmButton = document.getElementById('confirmDelete');
    const cancelButton = document.getElementById('cancelDelete');

    // 🛑 Zkontroluj, zda jsou prvky dostupné
    if (!modal) {
        console.error("❌ Chyba: Element 'deleteModal' nebyl nalezen v DOM.");
        return;
    }
    if (!modalMessage) {
        console.error("❌ Chyba: Element 'delete-modal-message' nebyl nalezen.");
        return;
    }
    if (!confirmButton) {
        console.error("❌ Chyba: Element 'confirmDelete' nebyl nalezen.");
        return;
    }
    if (!cancelButton) {
        console.error("❌ Chyba: Element 'cancelDelete' nebyl nalezen.");
        return;
    }

    // Nastavení zprávy do modalu
    modalMessage.textContent = message;

    // Zobrazení modalu s animací
    modal.style.display = 'flex';
    setTimeout(() => {
        modal.style.opacity = '1';
    }, 10);

    // ✅ Odebrání starých event listenerů (aby se nekumulovaly)
    confirmButton.replaceWith(confirmButton.cloneNode(true));
    cancelButton.replaceWith(cancelButton.cloneNode(true));

    const newConfirmButton = document.getElementById('confirmDelete');
    const newCancelButton = document.getElementById('cancelDelete');

    // ✅ Přidání nových listenerů
    newConfirmButton.addEventListener('click', function () {
        console.log("🟢 Potvrzeno: Probíhá mazání...");
        closeDeleteModal();
        if (onConfirm) onConfirm();
    });

    newCancelButton.addEventListener('click', function () {
        console.log("🛑 Storno: Zavírám modal.");
        closeDeleteModal();
    });

    console.log("✅ Potvrzovací modal byl úspěšně zobrazen.");
}

function closeDeleteModal() {
    console.log("🛑 Zavírám modal pro mazání objednávky...");

    const modal = document.getElementById('deleteModal');
    if (!modal) {
        console.error("❌ Modal 'deleteModal' neexistuje!");
        return;
    }

    modal.style.opacity = '0';
    setTimeout(() => {
        modal.style.display = 'none';
        console.log("✅ Modal úspěšně skryt.");
    }, 300); // Čekáme na dokončení animace
}


async function restoreOrder(orderId) {
    try {
        console.log(`🔄 Obnovuji objednávku ${orderId}...`);
        const response = await fetch(`${serverEndpoint}/orders/${orderId}/restore`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            throw new Error('Chyba při obnovení objednávky.');
        }

        console.log(`✅ Objednávka ${orderId} byla úspěšně obnovena.`);
        
        // 🟢 Po obnovení objednávky aktualizujeme sklad i směny
        await new Promise(resolve => setTimeout(resolve, 500)); // Počkej na aktualizaci souboru
        await refreshInventory();
        fetchShifts();

    } catch (error) {
        console.error('❌ Chyba při obnovení objednávky:', error);
    }
}




// Příklad funkce pro smazání objednávky (stornování)
async function deleteOrder(orderId) {
    console.log(`🟢 Volám deleteOrder() pro objednávku ID: ${orderId}`);


        try {
            console.log("📡 Odesílám DELETE request na server...");
            const response = await fetch(`${serverEndpoint}/orders/${orderId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                throw new Error(`❌ Chyba při mazání objednávky. Server vrátil: ${response.status}`);
            }

            const data = await response.json();
            console.log(`✅ Server odpověděl: ${data.message}`);

            // ✅ Aktualizace
            await refreshInventory();
            fetchShifts();
        } catch (error) {
            console.error('❌ Chyba při mazání objednávky:', error);
        }
   
}



    // Inicializace – načteme směny při načtení stránky
    fetchShifts();
});

async function refreshInventory() {
    try {
        console.log('🔄 Aktualizuji sklad po stornování...');
        const response = await fetch(`${serverEndpoint}/products`);

        if (!response.ok) {
            throw new Error('Chyba při načítání skladu.');
        }

        const products = await response.json();
        console.log('✅ Načtené produkty po aktualizaci skladu:', products);

        // ✅ Ověření, že produkty mají správné hodnoty
        products.forEach(product => {
            console.log(`🛒 ${product.name} - Množství: ${product.quantity}`);
        });

        // Pokud je funkce pro vykreslení skladu, zavolej ji
        if (typeof renderInventory === 'function') {
            renderInventory(products);
        }

    } catch (error) {
        console.error('❌ Chyba při aktualizaci skladu:', error);
    }
}

