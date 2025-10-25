import { serverEndpoint } from './config.js';
import { showModal, showModalConfirm } from './common.js';

const CASH_METHODS = ['hotovost', 'cash'];
const CARD_METHODS = ['karta', 'card'];
const currencyFormatter = new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
    maximumFractionDigits: 0
});
const EMPTY_VALUE = '—';

document.addEventListener('DOMContentLoaded', () => {
    const orderList = document.getElementById('order-list');
    const prevPageButton = document.getElementById('prev-page');
    const nextPageButton = document.getElementById('next-page');
    const pageInfo = document.getElementById('page-info');

    if (!orderList || !prevPageButton || !nextPageButton || !pageInfo) {
        console.error('❌ Chybí prvky pro stránku Historie objednávek, načtení se přerušuje.');
        return;
    }

    const shiftsPerPage = 10;
    let currentPage = 1;
    let totalPages = 1;

    prevPageButton.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage -= 1;
            fetchShifts();
        }
    });

    nextPageButton.addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage += 1;
            fetchShifts();
        }
    });

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatCurrency(value) {
        const numeric = Number(value) || 0;
        return currencyFormatter.format(numeric);
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

    /**
     * Attempts to parse a date string in one of the supported formats:
     * 1. ISO format:           2025-10-18T21:08:56
     * 2. Dash time format:     2025-10-18 21-06-39
     * 3. Czech format:         18. 10. 2025 21:06:29
     * Returns a Date object or null if parsing fails.
     */
    function parseDateTime(dateString) {
        if (typeof dateString !== 'string' || !dateString.trim() || dateString === EMPTY_VALUE) return null;

        // Pokus 1: ISO formát (2025-10-18T21:08:56)
        let date = new Date(dateString);
        if (!isNaN(date.getTime())) return date;

        // Pokus 2: Formát s pomlčkami v čase (2025-10-18 21-06-39)
        const dashFormat = dateString.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2})-(\d{2})-(\d{2})$/);
        if (dashFormat) {
            const [, year, month, day, hour, minute, second] = dashFormat;
            if (
                isValidDateParts(year, month, day, hour, minute, second)
            ) {
                date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
                if (!isNaN(date.getTime())) return date;
            }
        }

        // Pokus 3: Český formát (18. 10. 2025 21:06:29)
        const czFormat = dateString.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/);
        if (czFormat) {
            let [, day, month, year, hour, minute, second] = czFormat;
            day = day.padStart(2, '0');
            month = month.padStart(2, '0');
            hour = hour.padStart(2, '0');
            if (
                isValidDateParts(year, month, day, hour, minute, second)
            ) {
                date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
                if (!isNaN(date.getTime())) return date;
            }
        }

        // Malformed or unsupported format
        return null;
    }

    /**
     * Validates that all date/time parts are numeric and within reasonable ranges.
     */
    function isValidDateParts(year, month, day, hour, minute, second) {
        const y = Number(year), m = Number(month), d = Number(day);
        const h = Number(hour), min = Number(minute), s = Number(second);
        return (
            !isNaN(y) && y > 1900 &&
            !isNaN(m) && m >= 1 && m <= 12 &&
            !isNaN(d) && d >= 1 && d <= 31 &&
            !isNaN(h) && h >= 0 && h <= 23 &&
            !isNaN(min) && min >= 0 && min <= 59 &&
            !isNaN(s) && s >= 0 && s <= 59
        );
    }

    function formatDateTime(dateString) {
        const date = parseDateTime(dateString);
        if (!date) return EMPTY_VALUE;
        
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        
        return `${day}. ${month}. ${year} ${hours}:${minutes}`;
    }

    function normaliseString(value = '') {
        return String(value ?? '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
    }

    function isShiftClosed(shift) {
        if (!shift) {
            return false;
        }

        if (typeof shift.isActive === 'boolean') {
            return !shift.isActive;
        }

        const rawEnd = shift.endTime ?? shift.EndTime ?? shift['@endTime'] ?? '';
        const trimmed = String(rawEnd ?? '').trim();
        if (!trimmed) {
            return false;
        }

        const normalised = normaliseString(trimmed);
        if (!normalised || normalised === 'probiha') {
            return false;
        }

        return true;
    }

    function updatePagination() {
        const safeTotal = Math.max(totalPages, 1);
        pageInfo.textContent = `Stránka ${currentPage} z ${safeTotal}`;
        prevPageButton.disabled = currentPage <= 1;
        nextPageButton.disabled = currentPage >= totalPages;
    }

    async function fetchShifts() {
        const openShiftIds = Array.from(orderList.querySelectorAll('.shift-detail'))
            .filter(row => !row.hidden)
            .map(row => row.dataset.shiftId);

        try {
            const response = await fetch(`${serverEndpoint}/shifts?page=${currentPage}&limit=${shiftsPerPage}`);
            if (!response.ok) {
                throw new Error(`Server vrátil stav ${response.status}`);
            }

            const data = await response.json();
            const {
                shifts = [],
                currentPage: serverPage = currentPage,
                totalPages: serverTotalPages = totalPages
            } = data;

            currentPage = serverPage;
            totalPages = serverTotalPages;

            renderShifts(shifts);
            updatePagination();

            openShiftIds.forEach((shiftId) => {
                const detailRow = orderList.querySelector(`.shift-detail[data-shift-id="${shiftId}"]`);
                const headerRow = orderList.querySelector(`.shift-header[data-shift-id="${shiftId}"]`);
                if (detailRow && headerRow) {
                    detailRow.hidden = false;
                    headerRow.setAttribute('aria-expanded', 'true');
                }
            });
        } catch (error) {
            console.error('❌ Chyba při načítání směn:', error);
            showModal('Nepodařilo se načíst data o směnách. Zkuste to prosím znovu.', {
                isError: true,
                title: 'Načítání selhalo',
                confirmVariant: 'danger'
            });
        }
    }

    function renderShifts(shifts = []) {
        const fragment = document.createDocumentFragment();

        if (!Array.isArray(shifts) || shifts.length === 0) {
            const emptyRow = document.createElement('tr');
            const emptyCell = document.createElement('td');
            emptyCell.colSpan = 4;
            emptyCell.innerHTML = '<div class="order-empty-state">Žádné směny nebyly nalezeny.</div>';
            emptyRow.appendChild(emptyCell);
            fragment.appendChild(emptyRow);
            orderList.replaceChildren(fragment);
            return;
        }

        shifts.forEach((shift) => {
            const shiftIsClosed = isShiftClosed(shift);
            const shiftIsActive = !shiftIsClosed;
            const headerRow = document.createElement('tr');
            headerRow.className = 'shift-header';
            headerRow.dataset.shiftId = shift.id ?? '';
            headerRow.setAttribute('role', 'button');
            headerRow.setAttribute('aria-expanded', 'false');
            headerRow.tabIndex = 0;
            if (shiftIsClosed) {
                headerRow.classList.add('shift-closed');
                headerRow.dataset.shiftClosed = 'true';
            } else {
                headerRow.classList.add('shift-active');
                headerRow.dataset.shiftActive = 'true';
            }

            const endTimeDisplay = shiftIsActive ? 'Probíhá' : formatDateTime(shift.endTime);

            headerRow.innerHTML = `
                <td>${escapeHtml(shift.id ?? EMPTY_VALUE)}</td>
                <td>${formatDateTime(shift.startTime)}</td>
                <td>${escapeHtml(endTimeDisplay)}</td>
                <td>${escapeHtml(shift.orderCount ?? 0)}</td>
            `;

            const detailRow = document.createElement('tr');
            detailRow.className = 'shift-detail';
            detailRow.dataset.shiftId = shift.id ?? '';
            if (shiftIsClosed) {
                detailRow.classList.add('shift-closed');
                detailRow.dataset.shiftClosed = 'true';
            } else {
                detailRow.classList.add('shift-active');
                detailRow.dataset.shiftActive = 'true';
            }
            detailRow.hidden = true;

            const detailCell = document.createElement('td');
            detailCell.colSpan = 4;
            detailCell.appendChild(buildDetailContent(shift, shiftIsClosed));
            detailRow.appendChild(detailCell);

            function toggleDetail() {
                const willOpen = detailRow.hidden;
                detailRow.hidden = !willOpen;
                headerRow.setAttribute('aria-expanded', String(willOpen));
            }

            headerRow.addEventListener('click', toggleDetail);
            headerRow.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggleDetail();
                }
            });

            fragment.appendChild(headerRow);
            fragment.appendChild(detailRow);
        });

        orderList.replaceChildren(fragment);
    }

    function buildDetailContent(shift, shiftIsClosed = false) {
        const wrapper = document.createElement('div');

        const hasOrders = Array.isArray(shift.orderItems) && shift.orderItems.length > 0;
        const allowOrderActions = !shiftIsClosed;

        if (!hasOrders) {
            wrapper.innerHTML = '<div class="order-empty-state">Tato směna neobsahuje žádné objednávky.</div>';
            
            // Přidáme odkaz na souhrn i pro prázdné směny
            const summaryDiv = document.createElement('div');
            summaryDiv.style.marginTop = '1rem';
            summaryDiv.innerHTML = `
                <strong>
                    <span class="shift-summary-link" data-shift-id="${escapeHtml(shift.id ?? '')}" style="cursor: pointer; color: var(--primary, #007bff); text-decoration: underline;">
                        📊 Zobrazit souhrn směny
                    </span>
                </strong>
            `;
            
            // Přidáme event listener
            const link = summaryDiv.querySelector('.shift-summary-link');
            link.addEventListener('click', async (event) => {
                event.stopPropagation();
                const shiftId = link.dataset.shiftId;
                if (shiftId) {
                    await showShiftSummaryModal(shiftId);
                }
            });
            
            wrapper.appendChild(summaryDiv);
            return wrapper;
        }

        const table = document.createElement('table');
        table.className = 'order-detail-table';
        table.innerHTML = `
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
            <tbody></tbody>
        `;

        const tbody = table.querySelector('tbody');

        let totalCash = 0;
        let totalCard = 0;
        let totalRevenue = 0;

        const sortedOrders = [...shift.orderItems].sort((a, b) => {
            const timeA = parseDateTime(a.time ?? a.Time) ?? new Date(0);
            const timeB = parseDateTime(b.time ?? b.Time) ?? new Date(0);
            return timeB - timeA;
        });

        sortedOrders.forEach((order) => {
            const orderIdRaw = order['@id'] ?? order.id;
            const hasValidId = orderIdRaw !== undefined && orderIdRaw !== null && orderIdRaw !== '';
            const paymentMethodRaw = order.paymentMethod ?? '';
            const paymentMethod = normalisePayment(paymentMethodRaw);
            const timeValue = order.time ?? order.Time ?? EMPTY_VALUE;
            const rawPrice = Number(order.totalPrice ?? order.TotalPrice ?? order.Price ?? 0);
            const productsValue = order.products ?? EMPTY_VALUE;
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
            const orderIdDisplay = hasValidId ? escapeHtml(orderIdRaw) : EMPTY_VALUE;

            let actionHtml;
            if (!hasValidId) {
                actionHtml = '<span class="text-secondary">Nedostupné</span>';
            } else if (!allowOrderActions) {
                actionHtml = '';
            } else if (isCancelled) {
                actionHtml = `<button type="button" class="btn btn-success btn-sm order-action" data-action="restore" data-id="${escapeHtml(orderIdRaw)}">Obnovit</button>`;
            } else {
                actionHtml = `<button type="button" class="btn btn-warning btn-sm order-action" data-action="cancel" data-id="${escapeHtml(orderIdRaw)}">Stornovat</button>`;
            }

            row.innerHTML = `
                <td>${orderIdDisplay}</td>
                <td>${formatDateTime(timeValue)}</td>
                <td>${escapeHtml(paymentMethod)}</td>
                <td>${formatCurrency(rawPrice)}</td>
                <td class="products-column">${productsHtml}</td>
                <td>
                    <div class="order-detail-actions">
                        ${actionHtml}
                    </div>
                </td>
            `;

            tbody.appendChild(row);
        });

        const summaryRow = document.createElement('tr');
        summaryRow.className = 'shift-summary';
        const totalPaid = totalCash + totalCard;
        summaryRow.innerHTML = `
            <td colspan="2">
                <strong>
                    <span class="shift-summary-link" data-shift-id="${escapeHtml(shift.id ?? '')}" style="cursor: pointer; color: var(--primary, #007bff); text-decoration: underline;">
                        📊 Souhrn směny
                    </span>
                </strong>
            </td>
            <td><strong>Hotově:</strong> ${formatCurrency(totalCash)}</td>
            <td><strong>Kartou:</strong> ${formatCurrency(totalCard)}</td>
            <td><strong>Zaplaceno:</strong> ${formatCurrency(totalPaid)}</td>
            <td><strong>Obrat:</strong> ${formatCurrency(totalRevenue)}</td>
            <td></td>
        `;
        tbody.appendChild(summaryRow);

        wrapper.appendChild(table);

        wrapper.querySelectorAll('.order-action').forEach((button) => {
            button.addEventListener('click', async (event) => {
                event.stopPropagation();
                const action = button.dataset.action;
                const orderId = button.dataset.id;
                if (!orderId) {
                    return;
                }

                if (action === 'cancel') {
                    const confirmed = await showModalConfirm(`Opravdu chcete stornovat objednávku ${orderId}?`, {
                        title: 'Stornování objednávky',
                        confirmText: 'Stornovat',
                        cancelText: 'Zrušit',
                        variant: 'warning'
                    });

                    if (confirmed) {
                        await deleteOrder(orderId);
                    }
                } else if (action === 'restore') {
                    const confirmed = await showModalConfirm(`Opravdu chcete obnovit objednávku ${orderId}?`, {
                        title: 'Obnovení objednávky',
                        confirmText: 'Obnovit',
                        cancelText: 'Zrušit',
                        variant: 'success'
                    });

                    if (confirmed) {
                        await restoreOrder(orderId);
                    }
                }
            });
        });

        // Event listener pro odkaz "Souhrn směny"
        wrapper.querySelectorAll('.shift-summary-link').forEach((link) => {
            link.addEventListener('click', async (event) => {
                event.stopPropagation();
                const shiftId = link.dataset.shiftId;
                if (shiftId) {
                    await showShiftSummaryModal(shiftId);
                }
            });
        });

        return wrapper;
    }

    async function restoreOrder(orderId) {
        try {
            const response = await fetch(`${serverEndpoint}/orders/${orderId}/restore`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                throw new Error(`Server vrátil stav ${response.status}`);
            }

            await refreshInventory();
            await fetchShifts();
        } catch (error) {
            console.error('❌ Chyba při obnovení objednávky:', error);
            await showModal('Objednávku se nepodařilo obnovit. Zkuste to prosím znovu.', {
                isError: true,
                title: 'Obnovení selhalo',
                confirmVariant: 'danger'
            });
        }
    }

    async function deleteOrder(orderId) {
        try {
            const response = await fetch(`${serverEndpoint}/orders/${orderId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                throw new Error(`Server vrátil stav ${response.status}`);
            }

            await refreshInventory();
            await fetchShifts();
        } catch (error) {
            console.error('❌ Chyba při stornování objednávky:', error);
            await showModal('Objednávku se nepodařilo stornovat. Zkuste to prosím znovu.', {
                isError: true,
                title: 'Stornování selhalo',
                confirmVariant: 'danger'
            });
        }
    }

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

// Zobrazení souhrnu směny v modalu
async function showShiftSummaryModal(shiftID) {
    try {
        const response = await fetch(`${serverEndpoint}/shiftSummary?shiftID=${shiftID}`);
        
        if (!response.ok) {
            throw new Error('Chyba při načítání přehledu');
        }

        const summary = await response.json();

        const formatCurrencyDetailed = (value) => {
            const numeric = Number(value) || 0;
            return new Intl.NumberFormat('cs-CZ', {
                style: 'currency',
                currency: 'CZK'
            }).format(numeric);
        };

        const formatDateTime = (dateString) => {
            if (!dateString) {
                return '—';
            }
            const date = new Date(dateString);
            if (Number.isNaN(date.getTime())) {
                return '—';
            }

            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');

            return `${day}. ${month}. ${year} ${hours}:${minutes}`;
        };

        const shiftIdentifier = summary.shiftID || shiftID;

        const asNumber = (value) => {
            if (value === null || value === undefined || value === '') {
                return null;
            }
            const numeric = Number(value);
            return Number.isFinite(numeric) ? numeric : null;
        };

        const valueOrZero = (value) => {
            const numeric = asNumber(value);
            return numeric !== null ? numeric : 0;
        };

        const formatNullableCurrency = (value) => {
            const numeric = asNumber(value);
            return numeric !== null ? formatCurrencyDetailed(numeric) : '—';
        };

        const formatDiffValue = (value) => {
            if (value === null || Number.isNaN(value)) {
                return '—';
            }
            if (value === 0) {
                return formatCurrencyDetailed(0);
            }
            const absolute = formatCurrencyDetailed(Math.abs(value));
            return value > 0 ? `+${absolute}` : `-${absolute}`;
        };

        const diffClass = (value) => {
            if (value === null || Number.isNaN(value) || value === 0) {
                return '';
            }
            return value > 0 ? 'positive' : 'negative';
        };

        const durationHours = asNumber(summary.durationHours);
        const durationDisplay = durationHours !== null ? durationHours.toFixed(2) : '—';
        const startTimeDisplay = formatDateTime(summary.startTime);
        const endTimeDisplay = summary.endTime ? formatDateTime(summary.endTime) : 'Probíhá';

        const totalRevenue = valueOrZero(summary.totalRevenue);
        const cashRevenue = valueOrZero(summary.cashRevenue);
        const cardRevenue = valueOrZero(summary.cardRevenue);
        const employeeAccountRevenue = valueOrZero(summary.employeeAccountRevenue);
        const averageOrderValue = valueOrZero(summary.averageOrderValue);

        const initialCash = valueOrZero(summary.initialCash);
        const totalDeposits = valueOrZero(summary.totalDeposits);
        const totalWithdrawals = valueOrZero(summary.totalWithdrawals);
        const currentCashState = valueOrZero(summary.currentCashState);
        const countedCashBeforePayout = asNumber(summary.countedCashBeforePayout);
        const expectedFinalCashBackend = asNumber(summary.finalCashState);
        const actualFinalCash = asNumber(summary.actualCashFinal);
        const cardRealTotal = asNumber(summary.actualCardTotal);

        const baseWage = asNumber(summary.bartenderBaseWage) ?? Number((totalRevenue * 0.10).toFixed(2));
        const cashTip = asNumber(summary.cashTips ?? summary.cashDifference);
        const cardTipBase = asNumber(summary.cardTips ?? summary.cardDifference);
        const cardTip = cardTipBase !== null ? cardTipBase : (cardRealTotal !== null ? Number((cardRealTotal - cardRevenue).toFixed(2)) : null);

        let expectedFinalCash = expectedFinalCashBackend;
        if (baseWage !== null) {
            const cardTipPortion = cardTip ?? 0;
            expectedFinalCash = Number((currentCashState - (baseWage + cardTipPortion)).toFixed(2));
        }

        let tipsTotal = asNumber(summary.bartenderTips ?? summary.tipAmount);
        if (tipsTotal === null && (cashTip !== null || cardTip !== null)) {
            const cashPart = cashTip ?? 0;
            const cardPart = cardTip ?? 0;
            tipsTotal = Number((cashPart + cardPart).toFixed(2));
        }

        let payoutTotal = asNumber(summary.bartenderWage);
        if (payoutTotal === null && baseWage !== null) {
            const tipsPart = tipsTotal ?? 0;
            payoutTotal = Number((baseWage + tipsPart).toFixed(2));
        }

        const cashBeforeDiff = cashTip;
        const finalCashDiff = actualFinalCash !== null && expectedFinalCash !== null
            ? Number((actualFinalCash - expectedFinalCash).toFixed(2))
            : null;

        const cardDiffClass = diffClass(cardTip);
        const cashBeforeDiffClass = diffClass(cashBeforeDiff);
        const finalCashDiffClass = diffClass(finalCashDiff);

        const countedValueClass = countedCashBeforePayout !== null ? '' : ' muted';
        const actualFinalClass = actualFinalCash !== null ? '' : ' muted';
        const actualCardClass = cardRealTotal !== null ? '' : ' muted';

        const message = `
            <div class="shift-summary-modern">
                <div class="shift-summary-header">
                    <div>
                        <div class="shift-summary-heading">Směna #${shiftIdentifier}</div>
                        <div class="shift-summary-subheading">👤 ${summary.bartender || '—'}</div>
                    </div>
                    <div class="shift-summary-meta">
                        <span>🕐 ${startTimeDisplay} → ${endTimeDisplay}</span>
                        <span>⏱️ ${durationDisplay} h</span>
                    </div>
                </div>
                <div class="shift-summary-sections">
                    <section class="shift-summary-card">
                        <h3>Tržby</h3>
                        <div class="shift-summary-rows">
                            <div class="shift-summary-row">
                                <span class="shift-summary-label">Celkem</span>
                                <span class="shift-summary-value">${formatCurrencyDetailed(totalRevenue)}</span>
                            </div>
                            <div class="shift-summary-row">
                                <span class="shift-summary-label">💵 Hotově</span>
                                <span class="shift-summary-value">${formatCurrencyDetailed(cashRevenue)}</span>
                            </div>
                            <div class="shift-summary-row">
                                <span class="shift-summary-label">💳 Kartou</span>
                                <span class="shift-summary-value">${formatCurrencyDetailed(cardRevenue)}</span>
                            </div>
                            <div class="shift-summary-row">
                                <span class="shift-summary-label">👤 Účty</span>
                                <span class="shift-summary-value">${formatCurrencyDetailed(employeeAccountRevenue)}</span>
                            </div>
                            <div class="shift-summary-divider"></div>
                            <div class="shift-summary-row">
                                <span class="shift-summary-label">Objednávek</span>
                                <span class="shift-summary-value">${summary.orderCount || 0}</span>
                            </div>
                            <div class="shift-summary-row">
                                <span class="shift-summary-label">Stornovaných</span>
                                <span class="shift-summary-value">${summary.cancelledCount || 0}</span>
                            </div>
                            <div class="shift-summary-row">
                                <span class="shift-summary-label">Průměr na objednávku</span>
                                <span class="shift-summary-value">${formatCurrencyDetailed(averageOrderValue)}</span>
                            </div>
                        </div>
                    </section>
                    <section class="shift-summary-card">
                        <h3>Pokladna</h3>
                        <div class="shift-summary-rows">
                            <div class="shift-summary-row">
                                <span class="shift-summary-label">Počáteční stav</span>
                                <span class="shift-summary-value">${formatCurrencyDetailed(initialCash)}</span>
                            </div>
                            <div class="shift-summary-row">
                                <span class="shift-summary-label">+ Hotovostní tržby</span>
                                <span class="shift-summary-value">${formatCurrencyDetailed(cashRevenue)}</span>
                            </div>
                            <div class="shift-summary-row">
                                <span class="shift-summary-label">+ Vklady</span>
                                <span class="shift-summary-value">${formatCurrencyDetailed(totalDeposits)}</span>
                            </div>
                            <div class="shift-summary-row">
                                <span class="shift-summary-label">− Výběry</span>
                                <span class="shift-summary-value">${formatCurrencyDetailed(totalWithdrawals)}</span>
                            </div>
                            <div class="shift-summary-divider"></div>
                            <div class="shift-summary-row">
                                <span class="shift-summary-label">Kasa před výplatou (systém)</span>
                                <span class="shift-summary-value">${formatCurrencyDetailed(currentCashState)}</span>
                            </div>
                            <div class="shift-summary-row">
                                <span class="shift-summary-label">Spočítaná kasa (před výplatou)</span>
                                <span class="shift-summary-value${countedValueClass}">${countedCashBeforePayout !== null ? formatCurrencyDetailed(countedCashBeforePayout) : '—'}</span>
                            </div>
                            <div class="shift-summary-row">
                                <span class="shift-summary-label">Rozdíl před výplatou</span>
                                <span class="shift-summary-value ${cashBeforeDiffClass}">${formatDiffValue(cashBeforeDiff)}</span>
                            </div>
                            <div class="shift-summary-divider"></div>
                            <div class="shift-summary-row">
                                <span class="shift-summary-label">Očekávaná kasa po výplatě (základ + kartové dýško)</span>
                                <span class="shift-summary-value">${formatNullableCurrency(expectedFinalCash)}</span>
                            </div>
                            <div class="shift-summary-row">
                                <span class="shift-summary-label">Skutečná kasa po výplatě</span>
                                <span class="shift-summary-value${actualFinalClass}">${actualFinalCash !== null ? formatCurrencyDetailed(actualFinalCash) : '—'}</span>
                            </div>
                            <div class="shift-summary-row">
                                <span class="shift-summary-label">Rozdíl po výplatě</span>
                                <span class="shift-summary-value ${finalCashDiffClass}">${formatDiffValue(finalCashDiff)}</span>
                            </div>
                        </div>
                    </section>
                    <section class="shift-summary-card">
                        <h3>Spropitné & výplata</h3>
                        <div class="shift-summary-rows">
                            <div class="shift-summary-row">
                                <span class="shift-summary-label">Základ (10 % tržeb)</span>
                                <span class="shift-summary-value">${formatNullableCurrency(baseWage)}</span>
                            </div>
                            <div class="shift-summary-row">
                                <span class="shift-summary-label">Spropitné (hotově)</span>
                                <span class="shift-summary-value ${cashBeforeDiffClass}">${formatDiffValue(cashTip)}</span>
                            </div>
                            <div class="shift-summary-row">
                                <span class="shift-summary-label">Spropitné (kartou)</span>
                                <span class="shift-summary-value ${cardDiffClass}">${formatDiffValue(cardTip)}</span>
                            </div>
                            <div class="shift-summary-row">
                                <span class="shift-summary-label">Spropitné celkem</span>
                                <span class="shift-summary-value">${tipsTotal !== null ? formatCurrencyDetailed(tipsTotal) : '—'}</span>
                            </div>
                            <div class="shift-summary-divider"></div>
                            <div class="shift-summary-row">
                                <span class="shift-summary-label">Výplata celkem</span>
                                <span class="shift-summary-value">${payoutTotal !== null ? formatCurrencyDetailed(payoutTotal) : '—'}</span>
                            </div>
                            <div class="shift-summary-divider"></div>
                            <div class="shift-summary-subtitle">Platby kartou</div>
                            <div class="shift-summary-row">
                                <span class="shift-summary-label">Podle objednávek</span>
                                <span class="shift-summary-value">${formatCurrencyDetailed(cardRevenue)}</span>
                            </div>
                            <div class="shift-summary-row">
                                <span class="shift-summary-label">Skutečně zaplaceno</span>
                                <span class="shift-summary-value${actualCardClass}">${cardRealTotal !== null ? formatCurrencyDetailed(cardRealTotal) : '—'}</span>
                            </div>
                            <div class="shift-summary-row">
                                <span class="shift-summary-label">Rozdíl</span>
                                <span class="shift-summary-value ${cardDiffClass}">${formatDiffValue(cardTip)}</span>
                            </div>
                        </div>
                        <div class="shift-summary-note">Dýška i základ se z pokladny vyplácí najednou po sečtení hotovosti.</div>
                    </section>
                </div>
            </div>
        `;

        await showModal(message, { 
            title: `📊 Souhrn směny #${shiftID}`,
            allowHtml: true,
            showConfirmButton: false,
            size: 'large'
        });

    } catch (error) {
        console.error("❌ Chyba při načítání souhrnu:", error);
        await showModal("❌ Nepodařilo se načíst souhrn směny", { 
            title: 'Chyba',
            isError: true 
        });
    }
}

