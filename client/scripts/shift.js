import { serverEndpoint } from './config.js';
import { showModal, closeModal } from './common.js';

let currentShiftID = null;
let shiftUpdateInterval = null;

// DOM elementy
const elements = {
    statusBadge: null,
    noShiftState: null,
    activeShiftInfo: null,
    bartenderInput: null,
    startButton: null,
    endButton: null,
    refreshButton: null,
    currentBartender: null,
    currentShiftId: null,
    shiftStartTime: null,
    shiftDuration: null,
    totalRevenue: null,
    cashRevenue: null,
    cardRevenue: null,
    customerRevenue: null,
    orderCount: null,
    cancelledCount: null,
    avgOrderValue: null,
    controlTitle: null,
    bartenderInputGroup: null
};

document.addEventListener('DOMContentLoaded', async () => {
    initializeElements();
    setupEventListeners();
    await loadShiftStatus();
});

function initializeElements() {
    elements.statusBadge = document.getElementById('shift-status-badge');
    elements.noShiftState = document.getElementById('no-shift-state');
    elements.activeShiftInfo = document.getElementById('active-shift-info');
    elements.bartenderInput = document.getElementById('bartender-name');
    elements.startButton = document.getElementById('start-shift-button');
    elements.endButton = document.getElementById('end-shift-button');
    elements.refreshButton = document.getElementById('refresh-button');
    elements.currentBartender = document.getElementById('current-bartender');
    elements.currentShiftId = document.getElementById('current-shift-id');
    elements.shiftStartTime = document.getElementById('shift-start-time');
    elements.shiftDuration = document.getElementById('shift-duration');
    elements.totalRevenue = document.getElementById('total-revenue');
    elements.cashRevenue = document.getElementById('cash-revenue');
    elements.cardRevenue = document.getElementById('card-revenue');
    elements.customerRevenue = document.getElementById('customer-revenue');
    elements.orderCount = document.getElementById('order-count');
    elements.cancelledCount = document.getElementById('cancelled-count');
    elements.avgOrderValue = document.getElementById('avg-order-value');
    elements.controlTitle = document.getElementById('control-title');
    elements.bartenderInputGroup = document.getElementById('bartender-input-group');
}

function setupEventListeners() {
    elements.startButton.addEventListener('click', handleStartShift);
    elements.endButton.addEventListener('click', handleEndShift);
    elements.refreshButton.addEventListener('click', () => loadShiftStatus(true));
}

// 🟢 Načtení stavu směny
async function loadShiftStatus(showRefreshFeedback = false) {
    try {
        if (showRefreshFeedback) {
            elements.refreshButton.disabled = true;
            elements.refreshButton.innerHTML = '<svg class="btn-icon spinning" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>';
        }

        const response = await fetch(`${serverEndpoint}/currentShift`);
        const shiftData = await response.json();
        
        console.log("📥 Načítám stav směny:", shiftData);

        if (!response.ok) {
            throw new Error(shiftData.message || "Chyba při načítání směny.");
        }

        if (shiftData.shiftID && !shiftData.endTime) {
            // Aktivní směna
            currentShiftID = shiftData.shiftID;
            await displayActiveShift(shiftData);
            startDurationTimer(shiftData.startTime);
        } else {
            // Žádná aktivní směna
            currentShiftID = null;
            displayNoShift();
            stopDurationTimer();
        }

        if (showRefreshFeedback) {
            setTimeout(() => {
                elements.refreshButton.disabled = false;
                elements.refreshButton.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>';
            }, 500);
        }

    } catch (error) {
        console.error("❌ Chyba při načítání směny:", error);
        showModal("❌ Chyba při načítání směny!", "", true);
        displayNoShift();
    }
}

// Zobrazení aktivní směny
async function displayActiveShift(shiftData) {
    // Status badge
    elements.statusBadge.classList.add('active');
    elements.statusBadge.querySelector('.status-text').textContent = 'Aktivní směna';

    // Skrýt prázdný stav, zobrazit info
    elements.noShiftState.hidden = true;
    elements.activeShiftInfo.hidden = false;

    // Základní info
    elements.currentBartender.textContent = shiftData.bartender || '—';
    elements.currentShiftId.textContent = shiftData.shiftID || '—';
    elements.shiftStartTime.textContent = formatDateTime(shiftData.startTime);

    // Načíst statistiky
    await loadShiftStatistics(shiftData.shiftID);

    // Tlačítka
    elements.bartenderInput.value = shiftData.bartender;
    elements.bartenderInput.disabled = true;
    elements.startButton.disabled = true;
    elements.endButton.disabled = false;
    elements.controlTitle.textContent = 'Ukončit směnu';
    elements.bartenderInputGroup.style.display = 'none';
}

// Zobrazení stavu bez směny
function displayNoShift() {
    // Status badge
    elements.statusBadge.classList.remove('active');
    elements.statusBadge.querySelector('.status-text').textContent = 'Žádná aktivní směna';

    // Zobrazit prázdný stav
    elements.noShiftState.hidden = false;
    elements.activeShiftInfo.hidden = true;

    // Tlačítka
    elements.bartenderInput.value = '';
    elements.bartenderInput.disabled = false;
    elements.startButton.disabled = false;
    elements.endButton.disabled = true;
    elements.controlTitle.textContent = 'Zahájit směnu';
    elements.bartenderInputGroup.style.display = 'block';
}

// Načtení statistik směny
async function loadShiftStatistics(shiftID) {
    try {
        const response = await fetch(`${serverEndpoint}/shiftSummary?shiftID=${shiftID}`);
        
        if (!response.ok) {
            throw new Error('Chyba při načítání statistik');
        }

        const summary = await response.json();
        
        // Tržby
        elements.totalRevenue.textContent = formatCurrency(summary.totalRevenue || 0);
        elements.cashRevenue.textContent = formatCurrency(summary.cashRevenue || 0);
        elements.cardRevenue.textContent = formatCurrency(summary.cardRevenue || 0);
        elements.customerRevenue.textContent = formatCurrency(summary.employeeAccountRevenue || 0);

        // Statistiky
        const totalOrders = (summary.orderCount || 0);
        const cancelledOrders = (summary.cancelledCount || 0);
        const avgValue = totalOrders > 0 ? (summary.totalRevenue || 0) / totalOrders : 0;

        elements.orderCount.textContent = totalOrders;
        elements.cancelledCount.textContent = cancelledOrders;
        elements.avgOrderValue.textContent = formatCurrency(avgValue);

    } catch (error) {
        console.error("❌ Chyba při načítání statistik:", error);
        // Nastavit nulové hodnoty
        elements.totalRevenue.textContent = '0 Kč';
        elements.cashRevenue.textContent = '0 Kč';
        elements.cardRevenue.textContent = '0 Kč';
        elements.customerRevenue.textContent = '0 Kč';
        elements.orderCount.textContent = '0';
        elements.cancelledCount.textContent = '0';
        elements.avgOrderValue.textContent = '0 Kč';
    }
}

// Timer pro trvání směny
function startDurationTimer(startTime) {
    stopDurationTimer();
    
    updateDuration(startTime);
    
    shiftUpdateInterval = setInterval(() => {
        updateDuration(startTime);
        // Občas obnovit i statistiky
        if (currentShiftID && Math.random() > 0.9) {
            loadShiftStatistics(currentShiftID);
        }
    }, 1000);
}

function stopDurationTimer() {
    if (shiftUpdateInterval) {
        clearInterval(shiftUpdateInterval);
        shiftUpdateInterval = null;
    }
}

function updateDuration(startTime) {
    const start = new Date(startTime);
    const now = new Date();
    const diff = now - start;
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    elements.shiftDuration.textContent = `${hours}h ${minutes}m ${seconds}s`;
}

// 🟢 Zahájení směny
async function handleStartShift() {
    const bartenderName = elements.bartenderInput.value.trim();

    if (!bartenderName) {
        showModal("❌ Musíte zadat jméno barmana!", "", true);
        return;
    }

    elements.startButton.disabled = true;

    try {
        const response = await fetch(`${serverEndpoint}/startShift`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bartender: bartenderName })
        });

        if (!response.ok) {
            throw new Error("Chyba při zahájení směny.");
        }

        const shiftData = await response.json();
        console.log(`✅ Směna zahájena:`, shiftData);

        showModal(`✅ Směna zahájena pro: ${shiftData.bartender}`, "", false);
        await loadShiftStatus();

    } catch (error) {
        console.error("❌ Chyba při zahájení směny:", error);
        showModal("❌ Chyba při zahájení směny!", "", true);
        elements.startButton.disabled = false;
    }
}

// 🛑 Ukončení směny
async function handleEndShift() {
    if (!currentShiftID) {
        showModal("❌ Není aktivní žádná směna.", "", true);
        return;
    }

    // Zobrazit potvrzovací modal
    const confirmed = await showConfirmModal(
        'Ukončit směnu',
        'Opravdu chcete ukončit aktuální směnu? Zobrazí se souhrn tržeb.'
    );

    if (!confirmed) return;

    elements.endButton.disabled = true;

    try {
        const response = await fetch(`${serverEndpoint}/endShift`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shiftID: currentShiftID })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Chyba při ukončení směny');
        }

        // Načíst finální statistiky a zobrazit
        await showShiftSummaryModal(currentShiftID);
        
        currentShiftID = null;
        await loadShiftStatus();

    } catch (error) {
        console.error("❌ Chyba při ukončení směny:", error);
        showModal("❌ Chyba při ukončení směny!", "", true);
        elements.endButton.disabled = false;
    }
}

// Zobrazení souhrnu směny v modalu
async function showShiftSummaryModal(shiftID) {
    try {
        const response = await fetch(`${serverEndpoint}/shiftSummary?shiftID=${shiftID}`);
        
        if (!response.ok) {
            throw new Error('Chyba při načítání přehledu');
        }

        const summary = await response.json();

        const message = `
            <div style="text-align: left;">
                <h3 style="margin-bottom: 1rem;">📊 Souhrn směny #${shiftID}</h3>
                <div style="margin-bottom: 1rem;">
                    <strong>Celková tržba:</strong> ${formatCurrency(summary.totalRevenue || 0)}
                </div>
                <div style="margin-bottom: 0.5rem;">
                    💵 Hotovost: ${formatCurrency(summary.cashRevenue || 0)}
                </div>
                <div style="margin-bottom: 0.5rem;">
                    💳 Karta: ${formatCurrency(summary.cardRevenue || 0)}
                </div>
                <div style="margin-bottom: 1rem;">
                    👤 Účty zákazníků: ${formatCurrency(summary.employeeAccountRevenue || 0)}
                </div>
                <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #ddd;">
                    <strong>Objednávek:</strong> ${summary.orderCount || 0}<br>
                    <strong>Stornovaných:</strong> ${summary.cancelledCount || 0}
                </div>
            </div>
        `;

        showModal(message, "", false);

    } catch (error) {
        console.error("❌ Chyba při načítání souhrnu:", error);
        showModal("❌ Nepodařilo se načíst souhrn směny", "", true);
    }
}

// Potvrzovací modal
function showConfirmModal(title, message) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('modal-overlay');
        const modalTitle = document.getElementById('modal-title');
        const modalMessage = document.getElementById('modal-message');
        const confirmBtn = document.getElementById('modal-confirm');
        const cancelBtn = document.getElementById('modal-cancel');

        modalTitle.textContent = title;
        modalMessage.textContent = message;
        overlay.hidden = false;

        const handleConfirm = () => {
            cleanup();
            resolve(true);
        };

        const handleCancel = () => {
            cleanup();
            resolve(false);
        };

        const cleanup = () => {
            overlay.hidden = true;
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
        };

        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);
    });
}

// Pomocné funkce
function formatCurrency(amount) {
    return `${Math.round(amount)} Kč`;
}

function formatDateTime(dateString) {
    if (!dateString) return '—';
    
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${day}.${month}.${year} ${hours}:${minutes}`;
}
