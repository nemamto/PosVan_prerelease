import { serverEndpoint } from './config.js';
import { showModal, showModalConfirm, closeModal } from './common.js';

let currentShiftID = null;
let shiftUpdateInterval = null;

// DOM elementy
const elements = {
    revenueTotalCard: null,
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
    elements.revenueTotalCard = document.querySelector('.revenue-total');
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
    // Aktivovat zelenou barvu na kartě celkové tržby
    if (elements.revenueTotalCard) {
        elements.revenueTotalCard.classList.add('active');
    }

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
    // Deaktivovat zelenou barvu na kartě celkové tržby
    if (elements.revenueTotalCard) {
        elements.revenueTotalCard.classList.remove('active');
    }

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

// � Ukončení směny
async function handleEndShift() {
    if (!currentShiftID) {
        showModal("❌ Není aktivní žádná směna.", "", true);
        return;
    }

    elements.endButton.disabled = true;

    try {
        // Nejdřív načteme aktuální souhrn pro výpočet mzdy
        const summaryResponse = await fetch(`${serverEndpoint}/shiftSummary?shiftID=${currentShiftID}`);
        if (!summaryResponse.ok) {
            throw new Error('Chyba při načítání souhrnu');
        }
        const summary = await summaryResponse.json();
        const calculatedWage = Math.round(Number(summary.durationHours) * 200);

        // Zobrazit modal s možností upravit mzdu
        const bartenderWage = await showEndShiftModal(summary, calculatedWage);
        
        if (bartenderWage === null) {
            // Uživatel zrušil
            elements.endButton.disabled = false;
            return;
        }

        // Ukončit směnu s nastaveno mzdou
        const response = await fetch(`${serverEndpoint}/endShift`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                shiftID: currentShiftID,
                bartenderWage: bartenderWage
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Chyba při ukončení směny');
        }

        // Uložíme ID směny před vynulováním
        const endedShiftID = currentShiftID;
        console.log('✅ Směna ukončena, ID:', endedShiftID);
        
        currentShiftID = null;
        
        // Aktualizujeme UI (vypneme aktivní směnu)
        await loadShiftStatus();

        // Krátké zpoždění před zobrazením souhrnu (aby se stihl aktualizovat UI)
        console.log('⏳ Čekám 500ms před zobrazením souhrnu...');
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Zobrazit finální souhrn ukončené směny
        console.log('📊 Zobrazuji souhrn směny:', endedShiftID);
        await showShiftSummaryModal(endedShiftID);
        console.log('✅ Souhrn byl zobrazen');

    } catch (error) {
        console.error("❌ Chyba při ukončení směny:", error);
        showModal("❌ Chyba při ukončení směny!", "", true);
        elements.endButton.disabled = false;
    }
}

// Zobrazení souhrnu směny v modalu
async function showShiftSummaryModal(shiftID) {
    console.log('🔍 showShiftSummaryModal zavoláno s ID:', shiftID);
    try {
        console.log('📡 Načítám data z backendu...');
        const response = await fetch(`${serverEndpoint}/shiftSummary?shiftID=${shiftID}`);
        
        if (!response.ok) {
            console.error('❌ Backend vrátil chybu:', response.status);
            throw new Error('Chyba při načítání přehledu');
        }

        const summary = await response.json();
        console.log('✅ Data načtena:', summary);

        const message = `
            <div class="shift-summary-modal">
                <table class="shift-summary-table">
                    <thead>
                        <tr>
                            <th colspan="2">Základní údaje</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>👤 Barman/ka</td>
                            <td class="summary-amount">${summary.bartender || '—'}</td>
                        </tr>
                        <tr>
                            <td>🕐 Zahájení</td>
                            <td class="summary-amount">${formatDateTime(summary.startTime)}</td>
                        </tr>
                        <tr>
                            <td>🕐 Ukončení</td>
                            <td class="summary-amount">${summary.endTime ? formatDateTime(summary.endTime) : 'Probíhá'}</td>
                        </tr>
                        <tr>
                            <td>⏱️ Délka směny</td>
                            <td class="summary-amount">${Number(summary.durationHours || 0).toFixed(2)} h</td>
                        </tr>
                        <tr class="summary-wage-row">
                            <td><strong>💰 Mzda barmana</strong></td>
                            <td class="summary-amount"><strong>${formatCurrency(summary.bartenderWage || 0)}</strong></td>
                        </tr>
                    </tbody>
                </table>
                
                <table class="shift-summary-table">
                    <thead>
                        <tr>
                            <th colspan="2">Tržby</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr class="summary-total-row">
                            <td><strong>Celková tržba</strong></td>
                            <td class="summary-amount"><strong>${formatCurrency(summary.totalRevenue || 0)}</strong></td>
                        </tr>
                        <tr>
                            <td>💵 Hotovost</td>
                            <td class="summary-amount">${formatCurrency(summary.cashRevenue || 0)}</td>
                        </tr>
                        <tr>
                            <td>💳 Karta</td>
                            <td class="summary-amount">${formatCurrency(summary.cardRevenue || 0)}</td>
                        </tr>
                        <tr>
                            <td>👤 Účty zákazníků</td>
                            <td class="summary-amount">${formatCurrency(summary.employeeAccountRevenue || 0)}</td>
                        </tr>
                    </tbody>
                </table>

                <table class="shift-summary-table">
                    <thead>
                        <tr>
                            <th colspan="2">Statistiky</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Počet objednávek</td>
                            <td class="summary-amount">${summary.orderCount || 0}</td>
                        </tr>
                        <tr>
                            <td>Stornované objednávky</td>
                            <td class="summary-amount">${summary.cancelledCount || 0}</td>
                        </tr>
                        <tr>
                            <td>Průměrná objednávka</td>
                            <td class="summary-amount">${formatCurrency(summary.averageOrderValue || 0)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;

        console.log('🎨 Zobrazuji modal s daty...');
        const result = await showModalConfirm(message, { 
            title: `📊 Souhrn směny #${shiftID}`,
            allowHtml: true, 
            confirmText: 'Zavřít',
            size: 'large',
            showCancel: false
        });
        console.log('✅ Modal zavřen, výsledek:', result);

    } catch (error) {
        console.error("❌ Chyba při načítání souhrnu:", error);
        await showModal("❌ Nepodařilo se načíst souhrn směny", { 
            title: 'Chyba',
            isError: true 
        });
    }
}

// Modal pro ukončení směny s nastavením mzdy
async function showEndShiftModal(summary, calculatedWage) {
    const durationHours = Number(summary.durationHours || 0).toFixed(2);
    
    const message = `
        <div class="end-shift-modal-content">
            <div style="display: flex; gap: 2rem; justify-content: center; align-items: center; margin-bottom: 1.5rem; padding: 1rem; background: var(--bg-secondary); border-radius: 8px;">
                <div style="text-align: center;">
                    <div style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Délka směny</div>
                    <div style="font-size: 1.5rem; font-weight: bold; color: var(--text-primary);">${durationHours} h</div>
                </div>
                <div style="font-size: 2rem; color: var(--text-secondary);">×</div>
                <div style="text-align: center;">
                    <div style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Sazba</div>
                    <div style="font-size: 1.5rem; font-weight: bold; color: var(--text-primary);">200 Kč/h</div>
                </div>
                <div style="font-size: 2rem; color: var(--text-secondary);">=</div>
                <div style="text-align: center;">
                    <div style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Celkem</div>
                    <div style="font-size: 1.5rem; font-weight: bold; color: #28a745;">${calculatedWage} Kč</div>
                </div>
            </div>
            <div class="form-group">
                <label for="wage-input-new" style="display: block; margin-bottom: 0.5rem; font-weight: bold;">Mzda barmana (Kč):</label>
                <input 
                    type="number" 
                    id="wage-input-new" 
                    class="form-input" 
                    value="${calculatedWage}" 
                    min="0"
                    step="10"
                    style="width: 100%; font-size: 1.1rem; padding: 0.75rem;"
                >
                <div style="margin-top: 0.5rem; color: var(--text-secondary); font-size: 0.85rem; text-align: center;">
                    Můžete upravit částku před ukončením směny
                </div>
            </div>
        </div>
    `;

    // Použijeme showModalConfirm pro potvrzovací dialog
    const confirmed = await showModalConfirm(message, {
        title: 'Ukončit směnu',
        allowHtml: true,
        confirmText: 'Ukončit směnu',
        cancelText: 'Zrušit',
        dismissible: true,
        focusSelector: '#wage-input-new'
    });

    if (!confirmed) {
        return null;
    }

    // Přečteme hodnotu z input pole
    const wageInput = document.getElementById('wage-input-new');
    const wage = wageInput ? Number(wageInput.value) || 0 : calculatedWage;
    
    return wage;
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
    if (!(date instanceof Date) || isNaN(date.getTime())) return '—';
    
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${day}. ${month}. ${year} ${hours}:${minutes}`;
}
