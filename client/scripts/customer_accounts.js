import { serverEndpoint } from './config.js';
import { getShiftID, showModal, closeModal } from './common.js';

const currencyFormatter = new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});

const dateTimeFormatter = new Intl.DateTimeFormat('cs-CZ', {
    dateStyle: 'medium',
    timeStyle: 'short'
});

const EMPTY_VALUE = '—';

const PAYMENT_METHODS = [
    { key: 'cash', label: 'Hotově', description: 'Platba v hotovosti' },
    { key: 'card', label: 'Kartou', description: 'Platba platební kartou' },
    { key: 'customer', label: 'Účet zákazníka', description: 'Započíst na účet zákazníka' }
];

document.addEventListener('DOMContentLoaded', () => {
    const customerTableBody = document.getElementById('customerTableBody');
    const customerEmptyState = document.getElementById('customerEmptyState');

    const toggleAddCustomerFormButton = document.getElementById('toggleAddCustomerFormButton');
    const addCustomerSection = document.getElementById('addCustomerSection');
    const addCustomerForm = document.getElementById('addCustomerForm');
    const addCustomerNameInput = document.getElementById('customerName');
    const cancelAddCustomerButton = document.getElementById('cancelAddCustomerButton');

    const state = {
        selectedCustomer: null,
        customerMap: new Map()
    };

    const detailRefs = new WeakMap();

    if (!customerTableBody || !toggleAddCustomerFormButton || !addCustomerForm) {
        console.error('❌ Chybí nezbytné elementy pro stránku zákaznických účtů.');
        return;
    }

    toggleAddCustomerFormButton.addEventListener('click', () => {
        toggleAddCustomerForm();
    });

    cancelAddCustomerButton?.addEventListener('click', () => {
        toggleAddCustomerForm(false);
    });

    addCustomerForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const rawName = addCustomerNameInput.value.trim();

        if (!rawName) {
            await showModal('Zadejte prosím jméno zákazníka.', {
                isError: true,
                title: 'Neplatný vstup',
                confirmVariant: 'danger'
            });
            return;
        }

        try {
            const response = await fetch(`${serverEndpoint}/addCustomer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: rawName })
            });

            const payload = await safeJson(response);
            if (!response.ok) {
                throw new Error(payload?.message || 'Nepodařilo se přidat zákazníka.');
            }

            await showModal(payload?.message || 'Zákazník byl úspěšně přidán.', {
                title: 'Zákazník přidán',
                confirmVariant: 'success'
            });

            addCustomerForm.reset();
            toggleAddCustomerForm(false);
            await loadCustomers();
        } catch (error) {
            console.error('❌ Chyba při přidávání zákazníka:', error);
            await showModal(error.message || 'Nepodařilo se přidat zákazníka.', {
                isError: true,
                title: 'Operace selhala',
                confirmVariant: 'danger'
            });
        }
    });

    customerTableBody.addEventListener('click', (event) => {
        const actionButton = event.target.closest('button[data-action]');
        if (actionButton) {
            const action = actionButton.dataset.action;
            if (!action) {
                return;
            }

            if (action === 'toggle-detail') {
                const customerId = actionButton.dataset.customerId || normalizeCustomerName(actionButton.dataset.name || '');
                const customerName = actionButton.dataset.name || state.customerMap.get(customerId) || '';
                toggleCustomerRow(customerId, customerName);
                return;
            }

            if (action === 'pay-all') {
                const customerId = actionButton.dataset.customerId || normalizeCustomerName(actionButton.dataset.name || '');
                const customerName = actionButton.dataset.name || state.customerMap.get(customerId);
                if (customerName) {
                    payAllOrders(customerName);
                }
                return;
            }

            if (action === 'pay-order') {
                const orderId = actionButton.dataset.orderId;
                const customerName = actionButton.dataset.customerName;
                const amount = Number(actionButton.dataset.amount || 0);
                if (orderId && customerName) {
                    payCustomerOrder(orderId, customerName, amount);
                }
                return;
            }

            return;
        }

        const customerRow = event.target.closest('tr.customer-row');
        if (customerRow && !event.target.closest('.customer-actions')) {
            const customerId = customerRow.dataset.customerId || normalizeCustomerName(customerRow.dataset.customerName || '');
            const customerName = customerRow.dataset.customerName || state.customerMap.get(customerId) || '';
            toggleCustomerRow(customerId, customerName);
        }
    });

    customerTableBody.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
            return;
        }

        const customerRow = event.target.closest('tr.customer-row');
        if (!customerRow || event.target !== customerRow) {
            return;
        }

        event.preventDefault();
        const customerId = customerRow.dataset.customerId || normalizeCustomerName(customerRow.dataset.customerName || '');
        const customerName = customerRow.dataset.customerName || state.customerMap.get(customerId) || '';
        toggleCustomerRow(customerId, customerName);
    });

    loadCustomers();

    async function loadCustomers() {
        customerEmptyState.hidden = true;
        customerTableBody.innerHTML = `
            <tr>
                <td colspan="4" class="text-secondary">Načítám zákazníky…</td>
            </tr>
        `;

        try {
            const response = await fetch(`${serverEndpoint}/customers`);
            if (!response.ok) {
                throw new Error(`Server vrátil stav ${response.status}`);
            }

            const customers = await response.json();
            await renderCustomerList(customers);
        } catch (error) {
            console.error('❌ Chyba při načítání zákazníků:', error);
            customerTableBody.innerHTML = '';
            customerEmptyState.hidden = false;
            customerEmptyState.innerHTML = '<p>Nepodařilo se načíst zákazníky. Zkuste akci opakovat později.</p>';
            state.selectedCustomer = null;
            syncRowSelection();

            await showModal('Nepodařilo se načíst zákazníky. Zkontrolujte prosím připojení a zkuste to znovu.', {
                isError: true,
                title: 'Načítání selhalo',
                confirmVariant: 'danger'
            });
        }
    }

    async function renderCustomerList(customers = []) {
        customerTableBody.innerHTML = '';
        state.customerMap.clear();

        if (!Array.isArray(customers) || customers.length === 0) {
            customerEmptyState.hidden = false;
            state.selectedCustomer = null;
            syncRowSelection();
            return;
        }

        customerEmptyState.hidden = true;

        const rowsFragment = document.createDocumentFragment();

        const enriched = await Promise.all(
            customers.map(async (customer) => ({
                customer,
                summary: await getOrderSummary(customer.name)
            }))
        );

        enriched.forEach(({ customer, summary }) => {
            const customerId = normalizeCustomerName(customer.name);
            state.customerMap.set(customerId, customer.name);

            const headerRow = document.createElement('tr');
            headerRow.className = 'customer-row';
            headerRow.dataset.customerId = customerId;
            headerRow.dataset.customerName = customer.name;
            headerRow.tabIndex = 0;
            headerRow.setAttribute('role', 'button');
            headerRow.setAttribute('aria-expanded', 'false');

            const unpaidDescription = summary.unpaidCount === 1
                ? '1 nezaplacená objednávka'
                : summary.unpaidCount === 0
                    ? 'Žádné nezaplacené objednávky'
                    : `${summary.unpaidCount} nezaplacených objednávek`;

            headerRow.innerHTML = `
                <td class="customer-name">${escapeHtml(customer.name)}</td>
                <td>${summary.lastOrderLabel}</td>
                <td>
                    <div class="customer-balance">
                        <strong>${formatCurrency(summary.totalDue)}</strong>
                        <span>${unpaidDescription}</span>
                    </div>
                </td>
                <td class="customer-actions-cell"></td>
            `;

            const actionsCell = headerRow.querySelector('.customer-actions-cell');
            const actionsWrapper = document.createElement('div');
            actionsWrapper.className = 'customer-actions';
            createCustomerActions(customerId, customer.name, summary.unpaidCount)
                .forEach((button) => actionsWrapper.appendChild(button));
            actionsCell.appendChild(actionsWrapper);

            const detailRow = createCustomerDetailRow(customerId, customer.name);

            rowsFragment.appendChild(headerRow);
            rowsFragment.appendChild(detailRow);
        });

        customerTableBody.appendChild(rowsFragment);
        restoreExpandedCustomer();
    }

    function createCustomerActions(customerId, customerName, unpaidCount) {
        const buttons = [];

        const detailButton = document.createElement('button');
        detailButton.type = 'button';
        detailButton.className = 'btn btn-secondary btn-sm';
        detailButton.dataset.action = 'toggle-detail';
        detailButton.dataset.customerId = customerId;
        detailButton.dataset.name = customerName;
        detailButton.textContent = 'Detail';
        buttons.push(detailButton);

        const payAllButton = document.createElement('button');
        payAllButton.type = 'button';
        payAllButton.className = 'btn btn-success btn-sm';
        payAllButton.dataset.action = 'pay-all';
        payAllButton.dataset.customerId = customerId;
        payAllButton.dataset.name = customerName;
        payAllButton.textContent = 'Zaplatit vše';
        payAllButton.disabled = unpaidCount === 0;
        buttons.push(payAllButton);

        return buttons;
    }

    function createCustomerDetailRow(customerId, customerName) {
        const detailRow = document.createElement('tr');
        detailRow.className = 'customer-detail-row';
        detailRow.dataset.customerId = customerId;
        detailRow.dataset.customerName = customerName;
        detailRow.hidden = true;

        const detailCell = document.createElement('td');
        detailCell.colSpan = 4;

        const wrapper = document.createElement('div');
        wrapper.className = 'customer-detail-wrapper';

        const header = document.createElement('header');
        header.className = 'customer-detail-header';

        const headerInfo = document.createElement('div');
        const heading = document.createElement('h3');
        heading.textContent = 'Nezaplacené objednávky';
        const subtitle = document.createElement('p');
        subtitle.className = 'text-secondary';
        subtitle.dataset.role = 'detail-subtitle';
        subtitle.textContent = `Zákazník ${customerName}`;
        headerInfo.append(heading, subtitle);

        const headerActions = document.createElement('div');
        headerActions.className = 'customer-detail-actions';
        const payAllButton = document.createElement('button');
        payAllButton.type = 'button';
        payAllButton.className = 'btn btn-success btn-sm';
        payAllButton.dataset.action = 'pay-all';
        payAllButton.dataset.customerId = customerId;
        payAllButton.dataset.name = customerName;
        payAllButton.textContent = 'Zaplatit vše';
        headerActions.appendChild(payAllButton);

        header.append(headerInfo, headerActions);

        const orderList = document.createElement('div');
        orderList.className = 'customer-order-list';
        orderList.dataset.role = 'order-list';

        const summary = document.createElement('div');
        summary.className = 'customer-detail-summary';
        summary.dataset.role = 'order-summary';
        summary.hidden = true;

        const summaryLabel = document.createElement('span');
        summaryLabel.textContent = 'Celkem k úhradě';
        const summaryTotal = document.createElement('strong');
        summaryTotal.dataset.role = 'order-total';
        summaryTotal.textContent = formatCurrency(0);
        summary.append(summaryLabel, summaryTotal);

        wrapper.append(header, orderList, summary);
        detailCell.appendChild(wrapper);
        detailRow.appendChild(detailCell);

        detailRefs.set(detailRow, {
            subtitle,
            orderList,
            summary,
            total: summaryTotal,
            payAllButton
        });

        return detailRow;
    }

    function restoreExpandedCustomer() {
        if (!state.selectedCustomer) {
            syncRowSelection();
            return;
        }

        const customerId = normalizeCustomerName(state.selectedCustomer);
        const { headerRow } = findCustomerRows(customerId);
        if (!headerRow) {
            state.selectedCustomer = null;
            syncRowSelection();
            return;
        }

        toggleCustomerRow(customerId, state.selectedCustomer, { forceOpen: true });
    }

    function toggleCustomerRow(customerId, customerName, options = {}) {
        if (!customerId) {
            return;
        }

        const { headerRow, detailRow } = findCustomerRows(customerId);
        if (!headerRow || !detailRow) {
            return;
        }

        const isOpen = !detailRow.hidden;
        const shouldOpen = options.forceOpen ? true : !isOpen;

        if (shouldOpen) {
            collapseCurrentSelection(customerId);

            detailRow.hidden = false;
            headerRow.setAttribute('aria-expanded', 'true');
            headerRow.classList.add('is-selected');

            const resolvedName = customerName
                || state.customerMap.get(customerId)
                || headerRow.dataset.customerName
                || state.selectedCustomer;
            state.selectedCustomer = resolvedName || null;

            const detailElements = detailRefs.get(detailRow);
            if (detailElements) {
                setDetailLoading(detailElements, state.selectedCustomer);
            }

            if (!options.skipLoad && state.selectedCustomer) {
                loadOrders(state.selectedCustomer);
            }

            syncRowSelection();
            return;
        }

        detailRow.hidden = true;
        headerRow.setAttribute('aria-expanded', 'false');
        headerRow.classList.remove('is-selected');

        if (state.selectedCustomer && normalizeCustomerName(state.selectedCustomer) === customerId) {
            state.selectedCustomer = null;
        }

        syncRowSelection();
    }

    function collapseCurrentSelection(excludeCustomerId) {
        if (!state.selectedCustomer) {
            return;
        }

        const currentId = normalizeCustomerName(state.selectedCustomer);
        if (currentId === excludeCustomerId) {
            return;
        }

        const { headerRow, detailRow } = findCustomerRows(currentId);
        if (!headerRow || !detailRow) {
            state.selectedCustomer = null;
            return;
        }

        detailRow.hidden = true;
        headerRow.setAttribute('aria-expanded', 'false');
        headerRow.classList.remove('is-selected');
    }

    function findCustomerRows(customerId) {
        if (!customerId) {
            return { headerRow: null, detailRow: null };
        }

        let headerRow = null;
        let detailRow = null;

        customerTableBody.querySelectorAll('tr.customer-row').forEach((row) => {
            if (!headerRow && row.dataset.customerId === customerId) {
                headerRow = row;
            }
        });

        customerTableBody.querySelectorAll('tr.customer-detail-row').forEach((row) => {
            if (!detailRow && row.dataset.customerId === customerId) {
                detailRow = row;
            }
        });

        return { headerRow, detailRow };
    }

    function syncRowSelection() {
        const currentId = state.selectedCustomer ? normalizeCustomerName(state.selectedCustomer) : null;
        customerTableBody.querySelectorAll('tr.customer-row').forEach((row) => {
            const isSelected = Boolean(currentId) && row.dataset.customerId === currentId && row.getAttribute('aria-expanded') === 'true';
            row.classList.toggle('is-selected', isSelected);
        });
    }

    function setDetailLoading(detailElements, customerName) {
        if (!detailElements) {
            return;
        }

        if (detailElements.subtitle) {
            detailElements.subtitle.textContent = customerName ? `Zákazník ${customerName}` : '';
        }

        detailElements.orderList.innerHTML = '<div class="customer-order-empty">Načítám objednávky…</div>';
        detailElements.summary.hidden = true;
        if (detailElements.payAllButton) {
            detailElements.payAllButton.disabled = true;
        }
    }

    async function loadOrders(customerName) {
        if (!customerName) {
            return;
        }

        const customerId = normalizeCustomerName(customerName);
        const { headerRow, detailRow } = findCustomerRows(customerId);
        if (!headerRow || !detailRow) {
            return;
        }

        const detailElements = detailRefs.get(detailRow);
        if (detailElements) {
            setDetailLoading(detailElements, customerName);
        }

        try {
            const orders = await fetchCustomerOrders(customerName);
            const unpaidOrders = filterUnpaidOrders(orders).sort((a, b) => {
                const dateA = new Date(a.Date ?? a.date ?? 0);
                const dateB = new Date(b.Date ?? b.date ?? 0);
                return dateB.getTime() - dateA.getTime();
            });

            renderCustomerOrders(detailElements, customerName, unpaidOrders);
        } catch (error) {
            console.error('❌ Chyba při načítání objednávek zákazníka:', error);

            if (detailElements) {
                detailElements.orderList.innerHTML = '<div class="customer-order-empty">Nepodařilo se načíst objednávky.</div>';
                detailElements.summary.hidden = true;
                if (detailElements.payAllButton) {
                    detailElements.payAllButton.disabled = true;
                }
            }

            await showModal('Nepodařilo se načíst objednávky zákazníka. Zkuste to prosím znovu.', {
                isError: true,
                title: 'Načítání selhalo',
                confirmVariant: 'danger'
            });
        }
    }

    function renderCustomerOrders(detailElements, customerName, orders) {
        if (!detailElements) {
            return;
        }

        detailElements.orderList.innerHTML = '';

        const orderCount = orders.length;
        const totalAmount = orders.reduce((sum, order) => sum + getOrderTotal(order), 0);

        if (detailElements.subtitle) {
            detailElements.subtitle.textContent = orderCount === 0
                ? `${customerName}`
                : `${customerName} • ${orderCount === 1 ? '1 nezaplacená objednávka' : `${orderCount} nezaplacených objednávek`}`;
        }

        if (detailElements.payAllButton) {
            detailElements.payAllButton.disabled = orderCount === 0;
            detailElements.payAllButton.dataset.name = customerName;
        }

        if (orderCount === 0) {
            const empty = document.createElement('div');
            empty.className = 'customer-order-empty';
            empty.textContent = 'Zákazník nemá žádné nezaplacené objednávky.';
            detailElements.orderList.appendChild(empty);
            detailElements.summary.hidden = true;
            return;
        }

        const table = document.createElement('table');
        table.className = 'customer-order-table';
        table.innerHTML = `
            <thead>
                <tr>
                    <th scope="col">Objednávka</th>
                    <th scope="col">Čas</th>
                    <th scope="col">Částka</th>
                    <th scope="col">Položky</th>
                    <th scope="col" class="customer-actions-heading">Akce</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;

        const tbody = table.querySelector('tbody');

        orders.map(mapOrder).forEach((order) => {
            const row = document.createElement('tr');
            row.dataset.orderId = order.id;

            const idCell = document.createElement('td');
            idCell.innerHTML = `<span class="customer-order-id">${order.idLabel}</span>`;

            const timeCell = document.createElement('td');
            timeCell.textContent = order.dateLabel;

            const amountCell = document.createElement('td');
            amountCell.innerHTML = `<strong class="customer-order-price">${formatCurrency(order.total)}</strong>`;

            const productsCell = document.createElement('td');
            productsCell.className = 'customer-order-products';
            productsCell.innerHTML = order.productsHtml;

            const actionCell = document.createElement('td');
            const actionWrapper = document.createElement('div');
            actionWrapper.className = 'customer-order-actions';
            const payButton = document.createElement('button');
            payButton.type = 'button';
            payButton.className = 'btn btn-success btn-sm';
            payButton.dataset.action = 'pay-order';
            payButton.dataset.customerName = customerName;
            payButton.dataset.orderId = order.id;
            payButton.dataset.amount = String(order.total);
            payButton.textContent = 'Zaplatit';
            actionWrapper.appendChild(payButton);
            actionCell.appendChild(actionWrapper);

            row.append(idCell, timeCell, amountCell, productsCell, actionCell);
            tbody.appendChild(row);
        });

        detailElements.orderList.appendChild(table);
        detailElements.summary.hidden = false;
        detailElements.total.textContent = formatCurrency(totalAmount);
    }

    async function payAllOrders(customerName) {
        try {
            const orders = await fetchCustomerOrders(customerName);
            const unpaidOrders = filterUnpaidOrders(orders);

            if (unpaidOrders.length === 0) {
                await showModal(`Zákazník ${escapeHtml(customerName)} nemá žádné nezaplacené objednávky.`, {
                    title: 'Žádné objednávky',
                    confirmVariant: 'secondary'
                });
                await loadCustomers();
                return;
            }

            const paymentItems = unpaidOrders
                .map((order) => ({
                    orderId: String(order['@id'] ?? order.id ?? ''),
                    amount: getOrderTotal(order)
                }))
                .filter((item) => item.orderId);

            const totalAmount = unpaidOrders.reduce((sum, order) => sum + getOrderTotal(order), 0);

            const paymentMethodKey = await showPaymentMethodPicker({
                title: 'Způsob platby',
                message: `Zákazník: ${escapeHtml(customerName)}<br>Celkem k úhradě: <strong>${formatCurrency(totalAmount)}</strong>`
            });

            if (!paymentMethodKey) {
                return;
            }

            const paymentLabel = normalisePaymentLabel(paymentMethodKey);

            await logPaymentToShift({
                customerName,
                amount: totalAmount,
                paymentMethod: paymentLabel,
                description: `Platba zákazníka ${customerName}`,
                orderItems: paymentItems
            });

            for (const order of unpaidOrders) {
                const orderId = String(order['@id'] ?? order.id ?? '');
                if (!orderId) {
                    continue;
                }
                await markCustomerOrderAsPaid(customerName, orderId);
            }

            await showModal(`${unpaidOrders.length} objednávek bylo úspěšně zaplaceno.`, {
                title: 'Platba zpracována',
                confirmVariant: 'success'
            });

            await loadCustomers();
        } catch (error) {
            console.error('❌ Chyba při zpracování hromadné platby:', error);
            await showModal(error.message || 'Nepodařilo se zpracovat platbu. Zkuste to prosím znovu.', {
                isError: true,
                title: 'Operace selhala',
                confirmVariant: 'danger'
            });
        }
    }

    async function payCustomerOrder(orderId, customerName, amount) {
        try {
            const paymentMethodKey = await showPaymentMethodPicker({
                title: 'Způsob platby',
                message: `Objednávka ${escapeHtml(orderId)}<br>Částka: <strong>${formatCurrency(amount)}</strong>`
            });

            if (!paymentMethodKey) {
                return;
            }

            const paymentLabel = normalisePaymentLabel(paymentMethodKey);

            await logPaymentToShift({
                customerName,
                amount,
                paymentMethod: paymentLabel,
                description: `Platba objednávky ${orderId}`,
                orderItems: [{ orderId, amount }]
            });

            await markCustomerOrderAsPaid(customerName, orderId);

            await showModal(`Objednávka ${escapeHtml(orderId)} byla úspěšně zaplacena.`, {
                title: 'Platba dokončena',
                confirmVariant: 'success'
            });

            await loadCustomers();
        } catch (error) {
            console.error('❌ Chyba při platbě objednávky:', error);
            await showModal(error.message || 'Nepodařilo se zpracovat platbu objednávky.', {
                isError: true,
                title: 'Operace selhala',
                confirmVariant: 'danger'
            });
        }
    }

    function toggleAddCustomerForm(forceState) {
        const shouldShow = typeof forceState === 'boolean'
            ? forceState
            : addCustomerSection.hasAttribute('hidden');

        addCustomerSection.toggleAttribute('hidden', !shouldShow);
        toggleAddCustomerFormButton.setAttribute('aria-expanded', String(shouldShow));
        toggleAddCustomerFormButton.textContent = shouldShow ? 'Skrýt formulář' : 'Nový zákazník';

        if (shouldShow) {
            setTimeout(() => addCustomerNameInput.focus(), 10);
        }
    }

    async function fetchCustomerOrders(customerName) {
        const normalizedName = normalizeCustomerName(customerName);
        const response = await fetch(`${serverEndpoint}/customerOrders?customer=${encodeURIComponent(normalizedName)}`);
        if (!response.ok) {
            throw new Error(`Server vrátil stav ${response.status}`);
        }
        const data = await response.json();
        return Array.isArray(data) ? data : [];
    }

    async function getOrderSummary(customerName) {
        try {
            const orders = await fetchCustomerOrders(customerName);
            const unpaid = filterUnpaidOrders(orders);

            if (unpaid.length === 0) {
                return {
                    unpaidCount: 0,
                    totalDue: 0,
                    lastOrderLabel: EMPTY_VALUE
                };
            }

            const sorted = [...unpaid].sort((a, b) => {
                const dateA = new Date(a.Date ?? a.date ?? 0);
                const dateB = new Date(b.Date ?? b.date ?? 0);
                return dateB.getTime() - dateA.getTime();
            });

            const lastOrder = sorted[0]?.Date ?? sorted[0]?.date ?? null;

            return {
                unpaidCount: unpaid.length,
                totalDue: unpaid.reduce((sum, order) => sum + getOrderTotal(order), 0),
                lastOrderLabel: formatDate(lastOrder)
            };
        } catch (error) {
            console.error('❌ Chyba při získávání souhrnu objednávek:', error);
            return {
                unpaidCount: 0,
                totalDue: 0,
                lastOrderLabel: EMPTY_VALUE
            };
        }
    }

    async function markCustomerOrderAsPaid(customerName, orderId) {
        const response = await fetch(`${serverEndpoint}/markCustomerOrderAsPaid`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                customerName,
                orderId
            })
        });

        const payload = await safeJson(response);
        if (!response.ok) {
            throw new Error(payload?.message || `Nepodařilo se označit objednávku ${orderId} jako zaplacenou.`);
        }
    }

    async function logPaymentToShift({ customerName, amount, paymentMethod, description, orderItems = [] }) {
        const shiftID = await getShiftID();
        if (!shiftID) {
            throw new Error('Směna není aktivní. Nejprve otevřete směnu.');
        }

        const sanitizedOrderItems = Array.isArray(orderItems) ? orderItems : [];

        const normalizedItems = sanitizedOrderItems.length > 0
            ? sanitizedOrderItems.map((item, index) => {
                const orderId = item?.orderId ? String(item.orderId) : '';
                const itemAmount = Number(item?.amount) || 0;
                return {
                    id: orderId ? `customer-order-${orderId}` : `customer-order-${Date.now()}-${index}`,
                    name: orderId ? `Úhrada objednávky ${orderId}` : description,
                    quantity: 1,
                    price: itemAmount,
                    totalPrice: itemAmount
                };
            })
            : [{
                id: `customer-order-${Date.now()}`,
                name: description,
                quantity: 1,
                price: amount,
                totalPrice: amount
            }];

        const relatedOrderIds = sanitizedOrderItems
            .map((item) => (item?.orderId ? String(item.orderId).trim() : ''))
            .filter((value) => Boolean(value));

        const response = await fetch(`${serverEndpoint}/logOrder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                order: normalizedItems,
                paymentMethod,
                totalAmount: amount,
                selectedCustomer: customerName,
                shiftID,
                metadata: {
                    type: 'customer-account-payment',
                    customerName,
                    orderIds: relatedOrderIds
                }
            })
        });

        const payload = await safeJson(response);
        if (!response.ok) {
            throw new Error(payload?.message || 'Nepodařilo se zaznamenat platbu do směny.');
        }
    }

    function normalizeCustomerName(name) {
        return (name ?? '').replace(/\s+/g, '_');
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatCurrency(value) {
        return currencyFormatter.format(Number(value) || 0);
    }

    function formatDate(value) {
        if (!value) {
            return EMPTY_VALUE;
        }

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return escapeHtml(value);
        }

        return dateTimeFormatter.format(date);
    }

    function isTruthyFlag(value) {
        if (value === true) {
            return true;
        }
        if (typeof value === 'string') {
            return value.trim().toLowerCase() === 'true';
        }
        return false;
    }

    function isOrderPaid(order) {
        return isTruthyFlag(order?.payed) || isTruthyFlag(order?.['@payed']);
    }

    function isOrderCancelled(order) {
        return isTruthyFlag(order?.cancelled) || isTruthyFlag(order?.['@cancelled']);
    }

    function filterUnpaidOrders(orders) {
        return orders.filter((order) => !isOrderPaid(order) && !isOrderCancelled(order));
    }

    function getOrderTotal(order) {
        const rawValue = order?.TotalPrice ?? order?.totalPrice ?? order?.Price ?? 0;
        const numeric = Number(rawValue);
        return Number.isFinite(numeric) ? numeric : 0;
    }

    function mapOrder(order) {
        const idRaw = order?.['@id'] ?? order?.id ?? '';
        const dateRaw = order?.Date ?? order?.date ?? '';
        const productsRaw = order?.Products ?? order?.products ?? '';

        return {
            id: String(idRaw),
            idLabel: idRaw ? escapeHtml(idRaw) : EMPTY_VALUE,
            total: getOrderTotal(order),
            dateLabel: formatDate(dateRaw),
            productsHtml: escapeHtml(productsRaw).replace(/\n/g, '<br>')
        };
    }

    function normalisePaymentLabel(key) {
        switch (key) {
            case 'cash':
                return 'Hotovost';
            case 'card':
                return 'Karta';
            case 'customer':
                return 'Účet zákazníka';
            default:
                return key;
        }
    }

    async function showPaymentMethodPicker({ title, message }) {
        const markup = `
            <div class="payment-method-grid">
                ${PAYMENT_METHODS.map((method) => `
                    <button type="button" class="btn btn-secondary" data-payment="${method.key}">
                        <span>${method.label}</span>
                    </button>
                `).join('')}
            </div>
        `;

        const modalPromise = showModal(`
            <div class="customer-payment-modal">
                <p class="text-secondary" style="margin-bottom: var(--space-md);">${message}</p>
                ${markup}
            </div>
        `, {
            title,
            allowHtml: true,
            showConfirmButton: false,
            dismissible: true
        });

        const overlay = document.getElementById('modal-overlay');
        const messageNode = overlay?.querySelector('[data-modal="message"]');
        if (messageNode) {
            messageNode.querySelectorAll('[data-payment]').forEach((button) => {
                button.addEventListener('click', () => {
                    const method = button.dataset.payment;
                    closeModal('modal-overlay', method);
                });
            });
        }

        const result = await modalPromise;
        return typeof result === 'string' ? result : null;
    }

    async function safeJson(response) {
        try {
            return await response.json();
        } catch (error) {
            return null;
        }
    }
});
