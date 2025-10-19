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
            const headerRow = document.createElement('tr');
            headerRow.className = 'shift-header';
            headerRow.dataset.shiftId = shift.id ?? '';
            headerRow.setAttribute('role', 'button');
            headerRow.setAttribute('aria-expanded', 'false');
            headerRow.tabIndex = 0;
            headerRow.innerHTML = `
                <td>${escapeHtml(shift.id ?? EMPTY_VALUE)}</td>
                <td>${formatDateTime(shift.startTime)}</td>
                <td>${formatDateTime(shift.endTime)}</td>
                <td>${escapeHtml(shift.orderCount ?? 0)}</td>
            `;

            const detailRow = document.createElement('tr');
            detailRow.className = 'shift-detail';
            detailRow.dataset.shiftId = shift.id ?? '';
            detailRow.hidden = true;

            const detailCell = document.createElement('td');
            detailCell.colSpan = 4;
            detailCell.appendChild(buildDetailContent(shift));
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

    function buildDetailContent(shift) {
        const wrapper = document.createElement('div');

        const hasOrders = Array.isArray(shift.orderItems) && shift.orderItems.length > 0;

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
            const actionHtml = hasValidId
                ? (isCancelled
                    ? `<button type="button" class="btn btn-success btn-sm order-action" data-action="restore" data-id="${escapeHtml(orderIdRaw)}">Obnovit</button>`
                    : `<button type="button" class="btn btn-warning btn-sm order-action" data-action="cancel" data-id="${escapeHtml(orderIdRaw)}">Stornovat</button>`)
                : '<span class="text-secondary">Nedostupné</span>';

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

            await showModal(`Objednávka ${orderId} byla obnovena.`, {
                title: 'Objednávka obnovena',
                confirmVariant: 'success'
            });

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

            await showModal(`Objednávka ${orderId} byla stornována.`, {
                title: 'Objednávka stornována',
                confirmVariant: 'warning'
            });

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

        const formatCurrency = (value) => {
            const numeric = Number(value) || 0;
            return new Intl.NumberFormat('cs-CZ', {
                style: 'currency',
                currency: 'CZK',
                maximumFractionDigits: 0
            }).format(numeric);
        };

        const formatDateTime = (dateString) => {
            if (!dateString) return '—';
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return '—';
            
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            
            return `${day}. ${month}. ${year} ${hours}:${minutes}`;
        };

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
                            <td>� Objednávek</td>
                            <td class="summary-amount">${summary.orderCount || 0}</td>
                        </tr>
                        <tr>
                            <td>❌ Stornovaných</td>
                            <td class="summary-amount">${summary.cancelledCount || 0}</td>
                        </tr>
                        <tr>
                            <td>� Průměr</td>
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

        await showModalConfirm(message, { 
            title: `📊 Souhrn směny #${shiftID}`,
            allowHtml: true, 
            confirmText: 'Zavřít',
            size: 'large',
            showCancel: false
        });

    } catch (error) {
        console.error("❌ Chyba při načítání souhrnu:", error);
        await showModal("❌ Nepodařilo se načíst souhrn směny", { 
            title: 'Chyba',
            isError: true 
        });
    }
}

