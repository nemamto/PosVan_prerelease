import { serverEndpoint } from './config.js';
import { showModal, showModalConfirm, closeModal } from './common.js';

let currentShiftID = null;
let shiftUpdateInterval = null;
let bartendersList = []; // Seznam barmanů pro autocomplete

const CASH_METHODS = ['hotovost', 'cash'];
const CARD_METHODS = ['karta', 'card'];
const currencyFormatter = new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
    maximumFractionDigits: 0
});

// DOM elementy
const elements = {
    activeOrdersSection: null,
    activeOrdersLabel: null,
    activeOrdersTable: null,
    activeOrdersBody: null,
    activeOrdersEmpty: null,
    revenueTotalCard: null,
    noShiftState: null,
    activeShiftInfo: null,
    bartenderInput: null,
    initialCashInput: null,
    startButton: null,
    endButton: null,
    refreshButton: null,
    depositButton: null,
    withdrawalButton: null,
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
    bartenderInputGroup: null,
    cashRegisterInputGroup: null,
    initialCashDisplay: null,
    cashIncomeDisplay: null,
    depositsDisplay: null,
    withdrawalsDisplay: null,
    currentCashDisplay: null
};

document.addEventListener('DOMContentLoaded', async () => {
    initializeElements();
    setupEventListeners();
    await loadBartenders(); // Načti seznam barmanů
    setupBartenderAutocomplete(); // Nastav autocomplete
    await loadShiftStatus();
});

function initializeElements() {
    elements.activeOrdersSection = document.getElementById('active-shift-orders-section');
    elements.activeOrdersLabel = document.getElementById('active-shift-orders-label');
    elements.activeOrdersTable = document.getElementById('active-shift-orders-table');
    elements.activeOrdersBody = document.getElementById('active-shift-orders-body');
    elements.activeOrdersEmpty = document.getElementById('active-shift-orders-empty');
    elements.revenueTotalCard = document.querySelector('.revenue-total');
    elements.noShiftState = document.getElementById('no-shift-state');
    elements.activeShiftInfo = document.getElementById('active-shift-info');
    elements.bartenderInput = document.getElementById('bartender-name');
    elements.initialCashInput = document.getElementById('initial-cash');
    elements.startButton = document.getElementById('start-shift-button');
    elements.endButton = document.getElementById('end-shift-button');
    elements.refreshButton = document.getElementById('refresh-button');
    elements.depositButton = document.getElementById('deposit-button');
    elements.withdrawalButton = document.getElementById('withdrawal-button');
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
    elements.cashRegisterInputGroup = document.getElementById('cash-register-input-group');
    elements.initialCashDisplay = document.getElementById('initial-cash-display');
    elements.cashIncomeDisplay = document.getElementById('cash-income-display');
    elements.depositsDisplay = document.getElementById('deposits-display');
    elements.withdrawalsDisplay = document.getElementById('withdrawals-display');
    elements.currentCashDisplay = document.getElementById('current-cash-display');
}

function setupEventListeners() {
    elements.startButton.addEventListener('click', handleStartShift);
    elements.endButton.addEventListener('click', handleEndShift);
    elements.refreshButton.addEventListener('click', () => loadShiftStatus(true));
    elements.depositButton.addEventListener('click', handleDeposit);
    elements.withdrawalButton.addEventListener('click', handleWithdrawal);
}

// 📋 Načtení seznamu barmanů ze serveru
async function loadBartenders() {
    try {
        const response = await fetch(`${serverEndpoint}/bartenders`);
        if (response.ok) {
            const data = await response.json();
            bartendersList = data.bartenders || [];
            console.log(`📋 Načteno ${bartendersList.length} barmanů`);
        }
    } catch (error) {
        console.error('❌ Chyba při načítání barmanů:', error);
        bartendersList = [];
    }
}

// 🔍 Nastavení autocomplete pro input barmana
function setupBartenderAutocomplete() {
    const input = elements.bartenderInput;
    if (!input) return;

    // Vytvoř dropdown kontejner
    let dropdown = document.getElementById('bartender-autocomplete');
    if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.id = 'bartender-autocomplete';
        dropdown.className = 'bartender-autocomplete-dropdown';
        input.parentNode.style.position = 'relative';
        input.parentNode.appendChild(dropdown);
    }

    // Funkce pro zobrazení návrhů
    const showSuggestions = () => {
        const inputValue = input.value.toLowerCase().trim();
        dropdown.innerHTML = '';

        let suggestions = [];
        
        if (inputValue.length === 0) {
            // Zobraz všechny barmany když je input prázdný
            suggestions = bartendersList;
        } else {
            // Filtruj podle zadaného textu
            suggestions = bartendersList.filter(bartender => 
                bartender.toLowerCase().includes(inputValue)
            );
        }

        if (suggestions.length === 0) {
            dropdown.style.display = 'none';
            return;
        }

        // Vytvoř položky dropdownu
        suggestions.forEach(bartender => {
            const item = document.createElement('div');
            item.className = 'bartender-autocomplete-item';
            item.textContent = bartender;
            
            // Zvýrazni shodu
            if (inputValue.length > 0) {
                const regex = new RegExp(`(${inputValue})`, 'gi');
                item.innerHTML = bartender.replace(regex, '<strong>$1</strong>');
            }
            
            // Jednotný handler - použijeme mousedown místo click
            // mousedown se spustí před blur eventem inputu
            const selectBartender = (e) => {
                e.preventDefault(); // Zabraň blur eventu
                input.value = bartender;
                dropdown.style.display = 'none';
                input.blur(); // Explicitně zavři klávesnici pokud je otevřená
            };
            
            // mousedown funguje na desktop i touch zařízeních
            item.addEventListener('mousedown', selectBartender);
            
            dropdown.appendChild(item);
        });

        dropdown.style.display = 'block';
    };

    // Funkce pro skrytí dropdownu
    const hideSuggestions = () => {
        setTimeout(() => {
            dropdown.style.display = 'none';
        }, 200);
    };

    // Event listenery
    input.addEventListener('focus', showSuggestions);
    input.addEventListener('input', showSuggestions);
    input.addEventListener('blur', hideSuggestions);

    // Zavři dropdown při kliknutí mimo
    document.addEventListener('click', (e) => {
        if (e.target !== input && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function isValidDateParts(year, month, day, hour, minute, second) {
    const y = Number(year);
    const m = Number(month);
    const d = Number(day);
    const h = Number(hour);
    const min = Number(minute);
    const s = Number(second);

    return (
        !Number.isNaN(y) && y > 1900 &&
        !Number.isNaN(m) && m >= 1 && m <= 12 &&
        !Number.isNaN(d) && d >= 1 && d <= 31 &&
        !Number.isNaN(h) && h >= 0 && h <= 23 &&
        !Number.isNaN(min) && min >= 0 && min <= 59 &&
        !Number.isNaN(s) && s >= 0 && s <= 59
    );
}

function parseOrderDateTime(dateString) {
    if (typeof dateString !== 'string' || !dateString.trim()) {
        return null;
    }

    const trimmed = dateString.trim();

    let date = new Date(trimmed);
    if (!Number.isNaN(date.getTime())) {
        return date;
    }

    const dashFormat = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2})-(\d{2})-(\d{2})$/);
    if (dashFormat) {
        const [, year, month, day, hour, minute, second] = dashFormat;
        if (isValidDateParts(year, month, day, hour, minute, second)) {
            date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
            if (!Number.isNaN(date.getTime())) {
                return date;
            }
        }
    }

    const czFormat = trimmed.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/);
    if (czFormat) {
        let [, day, month, year, hour, minute, second] = czFormat;
        day = day.padStart(2, '0');
        month = month.padStart(2, '0');
        hour = hour.padStart(2, '0');
        if (isValidDateParts(year, month, day, hour, minute, second)) {
            date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
            if (!Number.isNaN(date.getTime())) {
                return date;
            }
        }
    }

    return null;
}

function normalisePayment(method = '') {
    const trimmed = method.trim().toLowerCase();
    if (CASH_METHODS.includes(trimmed)) {
        return 'Hotově';
    }
    if (CARD_METHODS.includes(trimmed)) {
        return 'Kartou';
    }
    return method || '—';
}

function formatCurrencyDetailed(value) {
    const numeric = Number(value) || 0;
    return currencyFormatter.format(numeric);
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
    await loadActiveShiftOrders(shiftData.shiftID);

    // Tlačítka
    elements.bartenderInput.value = shiftData.bartender;
    elements.bartenderInput.disabled = true;
    elements.initialCashInput.disabled = true;
    elements.startButton.disabled = true;
    elements.endButton.disabled = false;
    elements.depositButton.disabled = false;
    elements.withdrawalButton.disabled = false;
    elements.controlTitle.textContent = 'Ukončit směnu';
    elements.bartenderInputGroup.style.display = 'none';
    elements.cashRegisterInputGroup.style.display = 'none';
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
    elements.initialCashInput.disabled = false;
    elements.startButton.disabled = false;
    elements.endButton.disabled = true;
    elements.depositButton.disabled = true;
    elements.withdrawalButton.disabled = true;
    elements.controlTitle.textContent = 'Zahájit směnu';
    elements.bartenderInputGroup.style.display = 'block';
    elements.cashRegisterInputGroup.style.display = 'block';

    hideActiveShiftOrders();
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

        // Pokladna
        if (elements.initialCashDisplay) {
            elements.initialCashDisplay.textContent = formatCurrency(summary.initialCash || 0);
        }
        if (elements.cashIncomeDisplay) {
            elements.cashIncomeDisplay.textContent = formatCurrency(summary.cashRevenue || 0);
        }
        if (elements.depositsDisplay) {
            elements.depositsDisplay.textContent = formatCurrency(summary.totalDeposits || 0);
        }
        if (elements.withdrawalsDisplay) {
            elements.withdrawalsDisplay.textContent = formatCurrency(summary.totalWithdrawals || 0);
        }
        if (elements.currentCashDisplay) {
            elements.currentCashDisplay.textContent = formatCurrency(summary.currentCashState || 0);
        }

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

async function loadActiveShiftOrders(shiftID) {
    if (!elements.activeOrdersSection || !elements.activeOrdersBody) {
        return;
    }

    if (!shiftID) {
        hideActiveShiftOrders();
        return;
    }

    if (elements.activeOrdersLabel) {
        elements.activeOrdersLabel.textContent = `#${shiftID}`;
    }

    if (elements.activeOrdersEmpty) {
        elements.activeOrdersEmpty.textContent = 'Načítám objednávky...';
        elements.activeOrdersEmpty.hidden = false;
    }

    elements.activeOrdersSection.hidden = false;

    try {
        const response = await fetch(`${serverEndpoint}/shiftDetail?shiftID=${encodeURIComponent(shiftID)}`);
        if (!response.ok) {
            throw new Error(`Server vrátil stav ${response.status}`);
        }

        const detail = await response.json();
        renderActiveShiftOrders(detail);
    } catch (error) {
        console.error('❌ Chyba při načítání objednávek aktivní směny:', error);
        if (elements.activeOrdersEmpty) {
            elements.activeOrdersEmpty.textContent = 'Nepodařilo se načíst objednávky této směny.';
            elements.activeOrdersEmpty.hidden = false;
        }
    }
}

function hideActiveShiftOrders() {
    if (elements.activeOrdersSection) {
        elements.activeOrdersSection.hidden = true;
    }
    if (elements.activeOrdersBody) {
        elements.activeOrdersBody.innerHTML = '';
    }
    if (elements.activeOrdersEmpty) {
        elements.activeOrdersEmpty.hidden = true;
    }
    if (elements.activeOrdersLabel) {
        elements.activeOrdersLabel.textContent = '—';
    }
}

function renderActiveShiftOrders(detail) {
    if (!elements.activeOrdersSection || !elements.activeOrdersBody) {
        return;
    }

    const tbody = elements.activeOrdersBody;
    const emptyState = elements.activeOrdersEmpty;

    tbody.innerHTML = '';

    if (!detail || !Array.isArray(detail.orderItems)) {
        if (emptyState) {
            emptyState.textContent = 'Tato směna zatím neobsahuje žádné objednávky.';
            emptyState.hidden = false;
        }
        elements.activeOrdersSection.hidden = false;
        return;
    }

    elements.activeOrdersSection.hidden = false;

    if (detail.id && elements.activeOrdersLabel) {
        elements.activeOrdersLabel.textContent = `#${detail.id}`;
    }

    const orders = detail.orderItems;

    if (!orders.length) {
        if (emptyState) {
            emptyState.textContent = 'Tato směna zatím neobsahuje žádné objednávky.';
            emptyState.hidden = false;
        }
        return;
    }

    if (emptyState) {
        emptyState.hidden = true;
    }

    const sortedOrders = [...orders].sort((a, b) => {
        const timeA = parseOrderDateTime(a.time ?? a.Time) ?? new Date(0);
        const timeB = parseOrderDateTime(b.time ?? b.Time) ?? new Date(0);
        return timeB - timeA;
    });

    let totalCash = 0;
    let totalCard = 0;
    let totalRevenue = 0;

    sortedOrders.forEach((order) => {
        const orderIdRaw = order['@id'] ?? order.id;
        const hasValidId = orderIdRaw !== undefined && orderIdRaw !== null && orderIdRaw !== '';
        const paymentMethodRaw = order.paymentMethod ?? '';
        const paymentMethod = normalisePayment(paymentMethodRaw);
        const timeValue = order.time ?? order.Time ?? '';
        const rawPrice = Number(order.totalPrice ?? order.TotalPrice ?? order.Price ?? 0);
        const productsValue = order.products ?? '';
        const isCancelled = String(order['@cancelled']).toLowerCase() === 'true';

        if (!isCancelled) {
            totalRevenue += rawPrice;
            const methodKey = paymentMethodRaw.trim().toLowerCase();
            if (CASH_METHODS.includes(methodKey)) {
                totalCash += rawPrice;
            } else if (CARD_METHODS.includes(methodKey)) {
                totalCard += rawPrice;
            }
        }

        const row = document.createElement('tr');
        if (hasValidId) {
            row.dataset.orderId = String(orderIdRaw);
        }
        if (isCancelled) {
            row.classList.add('is-cancelled');
        }

        const productsHtml = escapeHtml(productsValue).replace(/\n/g, '<br>');
        const orderIdDisplay = hasValidId ? escapeHtml(orderIdRaw) : '—';

        let actionHtml;
        if (!hasValidId) {
            actionHtml = '<span class="text-secondary">Nedostupné</span>';
        } else if (isCancelled) {
            actionHtml = `<button type="button" class="btn btn-success btn-sm order-action" data-action="restore" data-id="${escapeHtml(orderIdRaw)}">Obnovit</button>`;
        } else {
            actionHtml = `<button type="button" class="btn btn-warning btn-sm order-action" data-action="cancel" data-id="${escapeHtml(orderIdRaw)}">Stornovat</button>`;
        }

        row.innerHTML = `
            <td>${orderIdDisplay}</td>
            <td>${formatDateTime(timeValue)}</td>
            <td>${escapeHtml(paymentMethod)}</td>
            <td>${formatCurrencyDetailed(rawPrice)}</td>
            <td class="products-column">${productsHtml}</td>
            <td><div class="order-detail-actions">${actionHtml}</div></td>
        `;

        tbody.appendChild(row);
    });

    const summaryRow = document.createElement('tr');
    summaryRow.className = 'shift-summary';
    const totalPaid = totalCash + totalCard;
    summaryRow.innerHTML = `
        <td colspan="2">
            <strong>
                <span class="shift-summary-link" data-shift-id="${escapeHtml(detail.id ?? '')}" style="cursor: pointer; color: var(--primary, #007bff); text-decoration: underline;">
                    📊 Souhrn směny
                </span>
            </strong>
        </td>
        <td><strong>Hotově:</strong> ${formatCurrencyDetailed(totalCash)}</td>
        <td><strong>Kartou:</strong> ${formatCurrencyDetailed(totalCard)}</td>
        <td><strong>Zaplaceno:</strong> ${formatCurrencyDetailed(totalPaid)}</td>
        <td><strong>Obrat:</strong> ${formatCurrencyDetailed(totalRevenue)}</td>
    `;
    tbody.appendChild(summaryRow);

    tbody.querySelectorAll('.order-action').forEach((button) => {
        button.addEventListener('click', async (event) => {
            event.stopPropagation();
            const action = button.dataset.action;
            const orderId = button.dataset.id;
            if (!orderId) {
                return;
            }

            if (action === 'cancel') {
                await handleCancelOrder(orderId);
            } else if (action === 'restore') {
                await handleRestoreOrder(orderId);
            }
        });
    });

    tbody.querySelectorAll('.shift-summary-link').forEach((link) => {
        link.addEventListener('click', async (event) => {
            event.stopPropagation();
            const shiftId = link.dataset.shiftId;
            if (shiftId) {
                await showShiftSummaryModal(shiftId);
            }
        });
    });
}

async function handleCancelOrder(orderId) {
    if (!orderId) {
        return;
    }

    const confirmed = await showModalConfirm(`Opravdu chcete stornovat objednávku ${orderId}?`, {
        title: 'Stornování objednávky',
        confirmText: 'Stornovat',
        cancelText: 'Zrušit',
        variant: 'warning'
    });

    if (!confirmed) {
        return;
    }

    try {
        const response = await fetch(`${serverEndpoint}/orders/${orderId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`Server vrátil stav ${response.status}`);
        }

        if (currentShiftID) {
            await loadShiftStatistics(currentShiftID);
            await loadActiveShiftOrders(currentShiftID);
        }
    } catch (error) {
        console.error('❌ Chyba při stornování objednávky:', error);
        await showModal('Objednávku se nepodařilo stornovat. Zkuste to prosím znovu.', {
            isError: true,
            title: 'Stornování selhalo',
            confirmVariant: 'danger'
        });
    }
}

async function handleRestoreOrder(orderId) {
    if (!orderId) {
        return;
    }

    const confirmed = await showModalConfirm(`Opravdu chcete obnovit objednávku ${orderId}?`, {
        title: 'Obnovení objednávky',
        confirmText: 'Obnovit',
        cancelText: 'Zrušit',
        variant: 'success'
    });

    if (!confirmed) {
        return;
    }

    try {
        const response = await fetch(`${serverEndpoint}/orders/${orderId}/restore`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`Server vrátil stav ${response.status}`);
        }

        if (currentShiftID) {
            await loadShiftStatistics(currentShiftID);
            await loadActiveShiftOrders(currentShiftID);
        }
    } catch (error) {
        console.error('❌ Chyba při obnovení objednávky:', error);
        await showModal('Objednávku se nepodařilo obnovit. Zkuste to prosím znovu.', {
            isError: true,
            title: 'Obnovení selhalo',
            confirmVariant: 'danger'
        });
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
    const initialCash = Number(elements.initialCashInput.value) || 0;

    if (!bartenderName) {
        await showModal("❌ Musíte zadat jméno barmana!", { isError: true });
        return;
    }

    if (initialCash < 0) {
        await showModal("❌ Počáteční stav pokladny nemůže být záporný!", { isError: true });
        return;
    }

    elements.startButton.disabled = true;

    try {
        const response = await fetch(`${serverEndpoint}/startShift`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                bartender: bartenderName,
                initialCash: initialCash
            })
        });

        if (!response.ok) {
            throw new Error("Chyba při zahájení směny.");
        }

        const shiftData = await response.json();
        console.log(`✅ Směna zahájena:`, shiftData);

        await showModal(`✅ Směna zahájena pro: ${shiftData.bartender}\n💰 Počáteční stav pokladny: ${initialCash} Kč`, { 
            title: 'Směna zahájena' 
        });
        await loadShiftStatus();

    } catch (error) {
        console.error("❌ Chyba při zahájení směny:", error);
        await showModal("❌ Chyba při zahájení směny!", { isError: true });
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
        const summaryShiftId = summary.shiftID || currentShiftID;
        const alreadyEnded = summary.endTime !== null && summary.endTime !== undefined && String(summary.endTime).trim() !== '';

        if (alreadyEnded) {
            const formattedEndTime = formatDateTime(summary.endTime);
            await showModal(
                formattedEndTime !== '—'
                    ? `Směna ${summaryShiftId || ''} už byla ukončena (${formattedEndTime}). Zobrazím uložený souhrn.`
                    : `Směna ${summaryShiftId || ''} už byla ukončena. Zobrazím uložený souhrn.`,
                {
                    title: 'Směna již ukončena',
                    confirmText: 'Zobrazit souhrn',
                    confirmVariant: 'secondary'
                }
            );

            await loadShiftStatus();
            await new Promise(resolve => setTimeout(resolve, 500));

            if (summaryShiftId) {
                await showShiftSummaryModal(summaryShiftId);
            }

            return;
        }

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
        const backupInfo = data.backup || null;

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

        handleBackupNotification(backupInfo);

    } catch (error) {
        console.error("❌ Chyba při ukončení směny:", error);
        const errorMessage = (error && error.message) ? error.message : 'Nepodařilo se ukončit směnu.';
        await showModal(errorMessage, { isError: true, title: 'Ukončení směny selhalo' });
        elements.endButton.disabled = false;
    }
}

function handleBackupNotification(info) {
    if (!info) {
        return;
    }

    if (info.uploaded) {
        return;
    }

    if (info.uploadErrorCode === 'OAUTH_TOKEN_MISSING') {
        showModal(
            'Zaloha nebyla odeslana na Google Drive, protoze chybi autorizace. Otevri stranku "GDrive zalohy" a dokonci prihlaseni.',
            { confirmText: 'Rozumim', isError: false }
        );
        return;
    }

    if (info.uploadErrorCode === 'OAUTH_CLIENT_CONFIG_MISSING') {
        showModal(
            'Zaloha nebyla odeslana na Google Drive, protoze chybi soubor service/local-configs/oauth-client.json.',
            { confirmText: 'Rozumim', isError: true }
        );
        return;
    }

    if (info.uploadError) {
        showModal(`Zaloha na GDrive selhala: ${info.uploadError}`, { confirmText: 'Rozumim', isError: true });
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
                <div class="summary-grid">
                    <!-- Levý sloupec -->
                    <div class="summary-column">
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
                                    <td>⏱️ Délka</td>
                                    <td class="summary-amount">${Number(summary.durationHours || 0).toFixed(2)} h</td>
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
                                    <td><strong>Celkem</strong></td>
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
                                    <td>👤 Účty</td>
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
                                    <td>📋 Objednávek</td>
                                    <td class="summary-amount">${summary.orderCount || 0}</td>
                                </tr>
                                <tr>
                                    <td>❌ Stornovaných</td>
                                    <td class="summary-amount">${summary.cancelledCount || 0}</td>
                                </tr>
                                <tr>
                                    <td>📊 Průměr</td>
                                    <td class="summary-amount">${formatCurrency(summary.averageOrderValue || 0)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <!-- Pravý sloupec -->
                    <div class="summary-column">
                        <table class="shift-summary-table">
                            <thead>
                                <tr>
                                    <th colspan="2">💰 Pokladna</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>Počáteční stav</td>
                                    <td class="summary-amount">${formatCurrency(summary.initialCash || 0)}</td>
                                </tr>
                                <tr>
                                    <td>+ Příjem hotovosti</td>
                                    <td class="summary-amount positive">${formatCurrency(summary.cashRevenue || 0)}</td>
                                </tr>
                                <tr>
                                    <td>+ Vklady</td>
                                    <td class="summary-amount positive">${formatCurrency(summary.totalDeposits || 0)}</td>
                                </tr>
                                <tr>
                                    <td>− Výběry</td>
                                    <td class="summary-amount negative">${formatCurrency(summary.totalWithdrawals || 0)}</td>
                                </tr>
                                <tr class="summary-subtotal-row">
                                    <td><strong>Stav před výplatou</strong></td>
                                    <td class="summary-amount"><strong>${formatCurrency(summary.currentCashState || 0)}</strong></td>
                                </tr>
                                <tr class="summary-wage-row">
                                    <td>− Mzda barmana</td>
                                    <td class="summary-amount">${formatCurrency(summary.bartenderWage || 0)}</td>
                                </tr>
                                <tr class="summary-total-row">
                                    <td><strong>✅ Finální stav</strong></td>
                                    <td class="summary-amount"><strong>${formatCurrency(summary.finalCashState || 0)}</strong></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
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
    return formatCurrencyDetailed(amount);
}

function formatDateTime(dateString) {
    const date = parseOrderDateTime(dateString);
    if (!date) {
        return '—';
    }

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${day}. ${month}. ${year} ${hours}:${minutes}`;
}

// 💵 Vklad do pokladny
async function handleDeposit() {
    if (!currentShiftID) {
        await showModal("❌ Není aktivní žádná směna.", { isError: true });
        return;
    }

    const message = `
        <div style="padding: 1rem;">
            <div class="form-group">
                <label for="deposit-amount" style="display: block; margin-bottom: 0.5rem; font-weight: bold;">Částka vkladu (Kč):</label>
                <input 
                    type="number" 
                    id="deposit-amount" 
                    class="form-input" 
                    placeholder="Zadejte částku..."
                    min="0"
                    step="10"
                    style="width: 100%; font-size: 1.1rem; padding: 0.75rem; margin-bottom: 1rem;"
                >
            </div>
            <div class="form-group">
                <label for="deposit-note" style="display: block; margin-bottom: 0.5rem; font-weight: bold;">Poznámka (volitelné):</label>
                <input 
                    type="text" 
                    id="deposit-note" 
                    class="form-input" 
                    placeholder="Např. rozměnění bankovky..."
                    style="width: 100%; font-size: 1rem; padding: 0.75rem;"
                >
            </div>
        </div>
    `;

    const confirmed = await showModalConfirm(message, {
        title: '💵 Vklad do pokladny',
        allowHtml: true,
        confirmText: 'Přidat vklad',
        cancelText: 'Zrušit',
        focusSelector: '#deposit-amount'
    });

    if (!confirmed) return;

    const amountInput = document.getElementById('deposit-amount');
    const noteInput = document.getElementById('deposit-note');
    const amount = Number(amountInput?.value) || 0;
    const note = noteInput?.value?.trim() || '';

    if (amount <= 0) {
        await showModal("❌ Částka vkladu musí být větší než 0!", { isError: true });
        return;
    }

    try {
        const response = await fetch(`${serverEndpoint}/deposit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                shiftID: currentShiftID,
                amount: amount,
                note: note
            })
        });

        if (!response.ok) {
            throw new Error('Chyba při přidávání vkladu');
        }

        await showModal(`✅ Vklad ${amount} Kč byl zaznamenán.`, { 
            title: 'Vklad přidán'
        });
        await loadShiftStatus(true);

    } catch (error) {
        console.error("❌ Chyba při přidávání vkladu:", error);
        await showModal("❌ Chyba při přidávání vkladu!", { isError: true });
    }
}

// 💸 Výběr z pokladny
async function handleWithdrawal() {
    if (!currentShiftID) {
        await showModal("❌ Není aktivní žádná směna.", { isError: true });
        return;
    }

    const message = `
        <div style="padding: 1rem;">
            <div class="form-group">
                <label for="withdrawal-amount" style="display: block; margin-bottom: 0.5rem; font-weight: bold;">Částka výběru (Kč):</label>
                <input 
                    type="number" 
                    id="withdrawal-amount" 
                    class="form-input" 
                    placeholder="Zadejte částku..."
                    min="0"
                    step="10"
                    style="width: 100%; font-size: 1.1rem; padding: 0.75rem; margin-bottom: 1rem;"
                >
            </div>
            <div class="form-group">
                <label for="withdrawal-note" style="display: block; margin-bottom: 0.5rem; font-weight: bold;">Účel výběru (volitelné):</label>
                <input 
                    type="text" 
                    id="withdrawal-note" 
                    class="form-input" 
                    placeholder="Např. nákup zboží, provozní výdaje..."
                    style="width: 100%; font-size: 1rem; padding: 0.75rem;"
                >
            </div>
        </div>
    `;

    const confirmed = await showModalConfirm(message, {
        title: '💸 Výběr z pokladny',
        allowHtml: true,
        confirmText: 'Provést výběr',
        cancelText: 'Zrušit',
        focusSelector: '#withdrawal-amount'
    });

    if (!confirmed) return;

    const amountInput = document.getElementById('withdrawal-amount');
    const noteInput = document.getElementById('withdrawal-note');
    const amount = Number(amountInput?.value) || 0;
    const note = noteInput?.value?.trim() || '';

    if (amount <= 0) {
        await showModal("❌ Částka výběru musí být větší než 0!", { isError: true });
        return;
    }

    try {
        const response = await fetch(`${serverEndpoint}/withdrawal`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                shiftID: currentShiftID,
                amount: amount,
                note: note
            })
        });

        if (!response.ok) {
            throw new Error('Chyba při přidávání výběru');
        }

        await showModal(`✅ Výběr ${amount} Kč byl zaznamenán.`, { 
            title: 'Výběr proveden'
        });
        await loadShiftStatus(true);

    } catch (error) {
        console.error("❌ Chyba při přidávání výběru:", error);
        await showModal("❌ Chyba při přidávání výběru!", { isError: true });
    }
}
