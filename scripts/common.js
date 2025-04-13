// Funkce pro zobrazení jednoduchého modálního okna
function showModalpure(content, isHTML = false) {
    const modal = document.getElementById('modal');
    const modalMessage = document.getElementById('modal-message');

    if (isHTML) {
        modalMessage.innerHTML = content;
    } else {
        modalMessage.textContent = content;
    }

    modal.style.display = 'flex'; // Zobrazení modálního okna
}



// Event listener pro tlačítko OK

// Zajisti, že modal je skrytý při načtení stránky
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('modal');
    if (modal) {
        modal.style.display = 'none';
    }
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

document.getElementById('customer-accounts-button').addEventListener('click', function() {
    window.location.href = 'customer_accounts.html'; // Přesměruje na stránku s ucty zakazniku
});
document.getElementById('shift-button').addEventListener('click', function() {
    window.location.href = 'shift.html'; // Přesměruje na stránku s ucty zakazniku
});


/*
document.addEventListener('DOMContentLoaded', function() {
    const cancelButton = document.getElementById('cancel-action');
    if (cancelButton) {
        cancelButton.addEventListener('click', function() {
            document.getElementById('modal').style.display = 'none';
        });
    } else {
        console.error("Element s ID 'cancel-action' nebyl nalezen.");
    }
});
*/

document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('modal');
    const closeModalButton = document.getElementById('close-modal');

    if (modal && closeModalButton) {
        closeModalButton.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }
});

// Zavření modálu kliknutím mimo obsah (volitelné)
window.addEventListener('click', (event) => {
    const modal = document.getElementById('modal');
    if (event.target === modal) {
        closeModal();
    }
});
/*
// Při kliknutí na tlačítko "OK" modál zavře
document.getElementById('confirm-action').addEventListener('click', () => {
    closeModal();
    // Můžete zde také provést další akce, například reload stránky nebo aktualizaci dat
    // location.reload();
});
*/
// Ověř, že kód se spustí po načtení DOM
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('modal');
    if (modal) {
        modal.style.display = 'none'; // Skryj modál při načtení
    }
    
    // Přidej event listener na tlačítko pro zavření modálu
    const closeButton = document.getElementById('close-modal');
    if (closeButton) {
        closeButton.addEventListener('click', () => {
            closeModal();
        });
    } else {
        console.error("Element s ID 'close-modal' nebyl nalezen.");
    }
});

// Ujistíme se, že kód běží po načtení DOM
document.addEventListener('DOMContentLoaded', () => {
    // Skryj modální okno při načtení
    const modal = document.getElementById('modal');
    if (modal) {
        modal.style.display = 'none';
    }
    
    // Přidáme event listener na tlačítko zavření (s ID 'close-modal')
    const closeButton = document.getElementById('close-modal');
    if (closeButton) {
        closeButton.addEventListener('click', () => {
            closeModal();
        });
    } else {
        console.error("Element s ID 'close-modal' nebyl nalezen.");
    }
});

function showModal(message, isError = false) {
    console.log(`🟢 Otevírám modal s obsahem:`, message);

    // Najdeme nebo vytvoříme modal overlay
    let modalOverlay = document.getElementById("modal-overlay");
    if (!modalOverlay) {
        modalOverlay = document.createElement("div");
        modalOverlay.id = "modal-overlay";
        modalOverlay.classList.add("modal-overlay");
        document.body.appendChild(modalOverlay);

        // Přidání modalu do overlaye
        modalOverlay.innerHTML = `
            <div id="modal-content" class="modal-content" onclick="event.stopPropagation();">
                <p id="modal-message"></p>
                <button id="modal-close" class="modal-close">Zavřít</button>
            </div>
        `;

        // Zavření modalu při kliknutí na overlay nebo tlačítko
        modalOverlay.addEventListener("click", (event) => {
            if (event.target === modalOverlay) {
                closeModal();
            }
        });

        document.getElementById("modal-close").addEventListener("click", closeModal);
    }

    // ✅ Správně vložíme zprávu do modal-content
    const modalMessage = document.getElementById("modal-message");
    if (modalMessage) {
        modalMessage.innerHTML = message;
    } else {
        console.error("❌ Chyba: Element #modal-message nebyl nalezen!");
    }

    // ✅ Nastavíme modal jako chybový, pokud je potřeba
    if (isError) {
        modalOverlay.classList.add("error");
    } else {
        modalOverlay.classList.remove("error");
    }

    // ✅ Otevřeme modal
    modalOverlay.style.display = "flex";
}

async function checkActiveShift() {
    try {
        const response = await fetch(`${serverEndpoint}/currentShift`);
        if (!response.ok) {
            throw new Error("Chyba při načítání směny.");
        }

        const shiftData = await response.json();
        console.log(`✅ Aktivní směna nalezena: ID ${shiftData.shiftID}, Barman: ${shiftData.bartender}`);

        // Pokud směna není aktivní, vytvoříme nebo aktualizujeme element #shiftStatus
        if (!shiftData.active) {
            let shiftStatusElement = document.getElementById('shiftStatus');
            if (!shiftStatusElement) {
                console.warn("⚠️ Element #shiftStatus nebyl nalezen. Vytvářím nový element.");
                shiftStatusElement = document.createElement('p');
                shiftStatusElement.id = 'shiftStatus';
                document.body.prepend(shiftStatusElement); // Přidáme na začátek těla stránky
            }

            shiftStatusElement.textContent = "🔴 Žádná aktivní směna!";
            shiftStatusElement.style.color = 'red';
        } else {
            // Pokud směna je aktivní, odstraníme element #shiftStatus, pokud existuje
            const shiftStatusElement = document.getElementById('shiftStatus');
            if (shiftStatusElement) {
                shiftStatusElement.remove();
            }
        }
    } catch (error) {
        console.error("❌ Chyba při načítání směny:", error);
    }
}

// ✅ Funkce pro zavření modalu
function closeModal() {
    const modalOverlay = document.getElementById("modal-overlay");

    if (!modalOverlay) {
        console.error("❌ Chyba: Modal nebyl nalezen.");
        return;
    }

    modalOverlay.classList.add("closing");

    setTimeout(() => {
        modalOverlay.classList.remove("visible", "closing");
        modalOverlay.style.display = "none";
    }, 300);
}


// Přidání event listeneru pro zavření tlačítkem
document.addEventListener('DOMContentLoaded', () => {
    const closeModalButton = document.getElementById('close-modal');
    if (closeModalButton) {
        closeModalButton.addEventListener('click', closeModal);
    }
});
function showModalConfirm(message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        const modalMessage = document.getElementById('confirm-modal-message');
        const confirmButton = document.getElementById('confirm-modal-yes');
        const cancelButton = document.getElementById('confirm-modal-no');

        if (!modal || !modalMessage || !confirmButton || !cancelButton) {
            console.error("❌ Chyba: Potvrzovací modal nebyl nalezen v DOM!");
            resolve(false);
            return;
        }

        modalMessage.textContent = message;
        modal.style.display = 'block';  // ✅ Zobrazíme modal
        modal.style.opacity = '1';      // ✅ Ujistíme se, že je viditelný
        modal.style.zIndex = '1000';    // ✅ Posuneme nad ostatní prvky

        confirmButton.onclick = () => {
            modal.style.display = 'none';
            resolve(true);
        };

        cancelButton.onclick = () => {
            modal.style.display = 'none';
            resolve(false);
        };
    });
}


async function submitOrder(order) {
    console.log(`📤 Odesílám objednávku:`, order);

    const shiftID = await getShiftID(); // ✅ Funkce, která zjistí aktuální směnu

    const requestBody = {
        order: order.items,
        paymentMethod: order.paymentMethod,
        totalAmount: order.totalAmount,
        selectedCustomer: order.selectedCustomer,
        shiftID: shiftID // ✅ Přidání shiftID
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
    } catch (error) {
        console.error("❌ Chyba při odesílání objednávky:", error);
    }
}
async function getShiftID() {
    try {
        const response = await fetch(`${serverEndpoint}/currentShift`);
        const data = await response.json();
        return data.shiftID || null;
    } catch (error) {
        console.error("❌ Chyba při získávání shiftID:", error);
        return null;
    }
}

async function checkCurrentShift() {
    try {
        const response = await fetch(`${serverEndpoint}/currentShift`);
        if (!response.ok) {
            throw new Error("Chyba při načítání směny.");
        }
        return await response.json();
    } catch (error) {
        console.error("❌ Chyba při načítání směny:", error);
        return null;
    }
}
