import { serverEndpoint } from './config.js';

// Zobrazí základní modální okno (#modal)
function showModalpure(content, isHTML = false) {
    const modal = document.getElementById('modal');
    const modalMessage = document.getElementById('modal-message');

    if (!modal || !modalMessage) {
        console.error("Modal nebo zpráva nejsou v DOM.");
        return;
    }

    if (isHTML) {
        modalMessage.innerHTML = content;
    } else {
        modalMessage.textContent = content;
    }

    modal.style.display = 'flex';
}


export function closeModal() {
    const modalOverlay = document.getElementById("modal-overlay");
    if (!modalOverlay) {
        console.error("Modal-overlay nenalezen.");
        return;
    }

    modalOverlay.classList.add("closing");
    setTimeout(() => {
        modalOverlay.classList.remove("visible", "closing");
        modalOverlay.style.display = "none";
    }, 300);
}

// Pokročilé modal okno s textem a volitelnou chybou
function showModal(message, isError = false) {
    let modalOverlay = document.getElementById("modal-overlay");
    if (!modalOverlay) {
        modalOverlay = document.createElement("div");
        modalOverlay.id = "modal-overlay";
        modalOverlay.classList.add("modal-overlay");
        document.body.appendChild(modalOverlay);

        modalOverlay.innerHTML = `
            <div id="modal-content" class="modal-content" onclick="event.stopPropagation();">
                <p id="modal-message"></p>
                <button id="modal-close" class="modal-close">Zavřít</button>
            </div>
        `;

        modalOverlay.addEventListener("click", (event) => {
            if (event.target === modalOverlay) closeModal();
        });

        document.getElementById("modal-close").addEventListener("click", closeModal);
    }

    const modalMessage = document.getElementById("modal-message");
    if (modalMessage) modalMessage.innerHTML = message;

    if (isError) {
        modalOverlay.classList.add("error");
    } else {
        modalOverlay.classList.remove("error");
    }

    modalOverlay.style.display = "flex";
}

// Zobrazí potvrzovací modal (#confirm-modal)
function showModalConfirm(message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        const modalMessage = document.getElementById('confirm-modal-message');
        const confirmButton = document.getElementById('confirm-modal-yes');
        const cancelButton = document.getElementById('confirm-modal-no');

        if (!modal || !modalMessage || !confirmButton || !cancelButton) {
            console.error("Potvrzovací modal není kompletní.");
            resolve(false);
            return;
        }

        modalMessage.textContent = message;
        modal.style.display = 'block';
        modal.style.opacity = '1';
        modal.style.zIndex = '1000';

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

// =================== DOMContentLoaded ===================

document.addEventListener('DOMContentLoaded', () => {
    // Skrytí základního modalu #modal
    const modal = document.getElementById('modal');
    if (modal) {
        modal.style.display = 'none';
    }

    // Zavření přes #close-modal
    const closeModalButton = document.getElementById('close-modal');
    if (closeModalButton) {
        closeModalButton.addEventListener('click', closeModal);
    }

    // Navigace mezi stránkami (ošetřena existence)
    const navButtons = {
        'cashier-button': 'cashier.html',
        'inventory-button': 'inventory.html',
        'order-management-button': 'order_management.html',
        'customer-accounts-button': 'customer_accounts.html',
        'shift-button': 'shift.html'
    };

    Object.entries(navButtons).forEach(([id, href]) => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('click', () => {
                window.location.href = href;
            });
        }
    });
});

// =================== SHIFT FUNKCE ===================

export async function checkActiveShift() {
    try {
        const response = await fetch(`${serverEndpoint}/currentShift`);
        if (!response.ok) throw new Error("Chyba při načítání směny.");

        const shiftData = await response.json();
        console.log(`Aktivní směna: ID ${shiftData.shiftID}, Barman: ${shiftData.bartender}`);

        const status = document.getElementById('shiftStatus');
        if (!shiftData.active) {
            if (!status) {
                const newStatus = document.createElement('p');
                newStatus.id = 'shiftStatus';
                newStatus.textContent = "Žádná aktivní směna!";
                newStatus.style.color = 'red';
                document.body.prepend(newStatus);
            } else {
                status.textContent = "Žádná aktivní směna!";
                status.style.color = 'red';
            }
        } else {
            if (status) status.remove();
        }
    } catch (error) {
        console.error("Chyba při kontrole směny:", error);
    }
}

async function getShiftID() {
    try {
        const response = await fetch(`${serverEndpoint}/currentShift`);
        const data = await response.json();
        return data.shiftID || null;
    } catch (error) {
        console.error("Chyba při získávání shiftID:", error);
        return null;
    }
}

async function checkCurrentShift() {
    try {
        const response = await fetch(`${serverEndpoint}/currentShift`);
        if (!response.ok) throw new Error("Chyba při načítání směny.");
        return await response.json();
    } catch (error) {
        console.error("Chyba při načítání směny:", error);
        return null;
    }
}

// =================== OBJEDNAVKY ===================

async function submitOrder(order) {
    console.log("Odesílám objednávku:", order);

    const shiftID = await getShiftID();

    const requestBody = {
        order: order.items,
        paymentMethod: order.paymentMethod,
        totalAmount: order.totalAmount,
        selectedCustomer: order.selectedCustomer,
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
            throw new Error(`HTTP error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        console.log("Objednávka odeslána:", result);
    } catch (error) {
        console.error("Chyba při odesílání objednávky:", error);
    }
}
