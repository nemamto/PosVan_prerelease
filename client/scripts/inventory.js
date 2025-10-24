import { serverEndpoint } from './config.js';
import { showModal, showModalConfirm } from './common.js';
let allProducts = []; // Globální pole všech produktů
let cachedCategories = [];

const CATEGORY_COLLAPSE_STATE_KEY = 'inventoryCollapsedCategories';
const DEFAULT_CATEGORY_COLOR = '#4dabf7';

function sanitiseHexColor(color) {
    if (typeof color !== 'string') {
        return null;
    }

    const trimmed = color.trim();
    return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed : null;
}

function escapeSelector(value) {
    if (typeof value !== 'string') {
        return '';
    }

    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
        return CSS.escape(value);
    }

    return value.replace(/([\0-\x1F\x7F"#%&'()*+,./:;<=>?@\[\]`{|}~])/g, '\\$1');
}

let categoryManagementContainerEl = null;
let categoryManagementToggleButton = null;
let categoryManagementVisible = false;

function setCategoryManagementVisible(visible, { scroll = false } = {}) {
    categoryManagementVisible = Boolean(visible);

    if (categoryManagementContainerEl) {
        categoryManagementContainerEl.classList.toggle('is-hidden', !categoryManagementVisible);
        categoryManagementContainerEl.setAttribute('aria-hidden', categoryManagementVisible ? 'false' : 'true');
    }

    if (categoryManagementToggleButton) {
        categoryManagementToggleButton.setAttribute('aria-expanded', categoryManagementVisible ? 'true' : 'false');
        categoryManagementToggleButton.classList.toggle('is-active', categoryManagementVisible);
        categoryManagementToggleButton.setAttribute(
            'aria-label',
            categoryManagementVisible ? 'Skrýt správu kategorií' : 'Správa kategorií'
        );
    }

    if (categoryManagementVisible && scroll && categoryManagementContainerEl) {
        categoryManagementContainerEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function focusCategoryManagementRow(categoryName) {
    if (!categoryName) {
        return;
    }

    setCategoryManagementVisible(true, { scroll: true });

    window.requestAnimationFrame(() => {
        const selectorValue = escapeSelector(categoryName);
        if (!selectorValue) {
            return;
        }

        const row = document.querySelector(`.category-management-row[data-original-name="${selectorValue}"]`);
        if (!row) {
            return;
        }

        document.querySelectorAll('.category-management-row.is-highlighted').forEach((element) => {
            if (element !== row) {
                element.classList.remove('is-highlighted');
            }
        });

        row.classList.add('is-highlighted');

        const nameInput = row.querySelector('.category-name-input');
        if (nameInput) {
            nameInput.focus({ preventScroll: true });
            if (typeof nameInput.select === 'function') {
                nameInput.select();
            }
        }

        window.setTimeout(() => {
            row.classList.remove('is-highlighted');
        }, 2500);
    });
}

function readCollapseState() {
    try {
        if (typeof localStorage === 'undefined') {
            return {};
        }
        const stored = localStorage.getItem(CATEGORY_COLLAPSE_STATE_KEY);
        if (!stored) {
            return {};
        }
        const parsed = JSON.parse(stored);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
        console.warn('⚠️ Nelze načíst stav sbalených kategorií.', error);
        return {};
    }
}

let collapsedCategoryState = readCollapseState();

function persistCollapseState() {
    try {
        if (typeof localStorage === 'undefined') {
            return;
        }
        localStorage.setItem(CATEGORY_COLLAPSE_STATE_KEY, JSON.stringify(collapsedCategoryState));
    } catch (error) {
        console.warn('⚠️ Nelze uložit stav sbalených kategorií.', error);
    }
}

function setCategoryCollapsedState(name, isCollapsed) {
    collapsedCategoryState = {
        ...collapsedCategoryState,
        [name]: Boolean(isCollapsed)
    };
    persistCollapseState();
}

function isCategoryCollapsed(name) {
    const value = collapsedCategoryState[name];
    return value === undefined ? true : Boolean(value);
}

function pruneCollapseState(validNames) {
    const validSet = new Set(validNames);
    let changed = false;
    Object.keys(collapsedCategoryState).forEach((key) => {
        if (!validSet.has(key)) {
            delete collapsedCategoryState[key];
            changed = true;
        }
    });
    if (changed) {
        persistCollapseState();
    }
}

function getCategoryOrderValue(name) {
    const found = cachedCategories.find((category) => category.name === name);
    const numericOrder = Number(found && found.order);
    return Number.isFinite(numericOrder) ? numericOrder : Number.MAX_SAFE_INTEGER;
}

function createCategoryPanelId(name) {
    const slug = name
        .toString()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return `inventory-category-${slug || 'unknown'}`;
}

function normaliseCategoryColor(color) {
    if (typeof color !== 'string') {
        return DEFAULT_CATEGORY_COLOR;
    }
    const trimmed = color.trim();
    return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed : DEFAULT_CATEGORY_COLOR;
}

async function loadProducts() {
    try {
        const response = await fetch(`${serverEndpoint}/products`);
        if (!response.ok) {
            throw new Error('Chyba při načítání produktů');
        }
        const products = await response.json();
        allProducts = products; // Ulož do globální proměnné
        console.log('Načtené produkty:', products); // Ověření načtených dat

        if (!Array.isArray(products)) {
            console.warn('Žádné produkty nebyly načteny.');
            return;
        }

        renderInventory(products); // Volání funkce k vykreslení
    } catch (error) {
        console.error('Chyba při načítání produktů:', error);
    }
}

// Funkce pro vykreslení inventáře podle kategorií
function formatCurrency(value) {
    if (value === null || value === undefined || value === '') {
        return '0 Kč';
    }

    const normalised = typeof value === 'string'
        ? value.replace(/[^0-9,.-]/g, '').replace(',', '.')
        : value;

    const number = Number(normalised);

    if (!Number.isFinite(number)) {
        return `${value} Kč`;
    }

    return `${number.toLocaleString('cs-CZ', {
        minimumFractionDigits: number % 1 === 0 ? 0 : 2,
        maximumFractionDigits: 2
    })} Kč`;
}

function renderInventory(products, { forceExpand = false } = {}) {
    const inventoryContainer = document.getElementById('inventory-list');
    if (!inventoryContainer) {
        console.error('❌ Element s ID "inventory-list" nebyl nalezen.');
        return;
    }

    inventoryContainer.innerHTML = '';

    if (!Array.isArray(products) || products.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'inventory-empty-state';
        emptyState.innerHTML = 'Žádné položky neodpovídají aktuálnímu filtrování.';
        inventoryContainer.appendChild(emptyState);
        return;
    }

    const categories = products.reduce((acc, product) => {
        const category = product.category || 'Nezařazeno';
        if (!acc[category]) acc[category] = [];
        acc[category].push(product);
        return acc;
    }, {});

    const sortedCategoryNames = Object.keys(categories)
        .sort((a, b) => {
            const orderA = getCategoryOrderValue(a);
            const orderB = getCategoryOrderValue(b);
            if (orderA !== orderB) {
                return orderA - orderB;
            }
            return a.localeCompare(b, 'cs', { sensitivity: 'base' });
        });

    sortedCategoryNames.forEach((category) => {
            const items = categories[category];
            const categoryCard = document.createElement('div');
            categoryCard.className = 'inventory-category';

            const categoryDefinition = cachedCategories.find((item) => item.name === category);
            const categoryColor = sanitiseHexColor(categoryDefinition?.color);

            if (categoryColor) {
                categoryCard.classList.add('has-color');
                categoryCard.style.setProperty('--category-color', categoryColor);
            }

            const header = document.createElement('div');
            header.className = 'inventory-category-header';

            const categoryMeta = document.createElement('div');
            categoryMeta.className = 'inventory-category-meta';

            const titleEl = document.createElement('h3');
            titleEl.className = 'inventory-category-title';
            titleEl.textContent = category;

            const countEl = document.createElement('span');
            countEl.className = 'inventory-category-count';
            countEl.textContent = `${items.length} položek`;

            categoryMeta.append(titleEl, countEl);

            const headerControls = document.createElement('div');
            headerControls.className = 'inventory-category-controls';

            const collapseButton = document.createElement('button');
            collapseButton.type = 'button';
            collapseButton.className = 'inventory-category-collapse-btn';
            collapseButton.setAttribute('aria-label', `Sbalit kategorii ${category}`);

            const collapseIcon = document.createElement('span');
            collapseIcon.className = 'inventory-category-collapse-icon';
            collapseButton.append(collapseIcon);

            const editButton = document.createElement('button');
            editButton.type = 'button';
            editButton.className = 'btn btn-secondary btn-sm inventory-category-edit-btn';
            editButton.textContent = 'Upravit';

            headerControls.append(collapseButton, editButton);

            header.append(categoryMeta, headerControls);
            const tableWrapper = document.createElement('div');
            tableWrapper.className = 'inventory-table-wrapper';

            const table = document.createElement('table');
            table.classList.add('inventory-table');
            table.innerHTML = `
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Název</th>
                        <th>Popis</th>
                        <th>Kategorie</th>
                        <th>Množství</th>
                        <th>Cena</th>
                        <th>Akce</th>
                    </tr>
                </thead>
                <tbody></tbody>
            `;

            const tbody = table.querySelector('tbody');

            items.forEach((product) => {
                if (!product || !product.id || !product.name) {
                    return;
                }

                const row = document.createElement('tr');
                row.className = 'inventory-row';
                row.dataset.id = product.id;
                const productColor = sanitiseHexColor(product.color) || categoryColor;
                row.dataset.color = productColor || '';
                row.dataset.name = product.name || '';
                row.dataset.description = product.description || '';
                row.dataset.category = product.category || '';
                row.dataset.quantity = product.quantity ?? '';
                row.dataset.price = product.price ?? '';
                row.dataset.active = product.active === 'false' ? 'false' : 'true';

                if (productColor) {
                    row.style.setProperty('--product-color', productColor);
                    row.classList.add('has-color');
                } else {
                    row.style.removeProperty('--product-color');
                    row.classList.remove('has-color');
                }

                const isDeactivated = product.active === 'false';
                if (isDeactivated) {
                    row.classList.add('is-inactive');
                }

                const statusChip = `<span class="status-chip">${isDeactivated ? 'Neaktivní' : 'Aktivní'}</span>`;

                row.innerHTML = `
                    <td>${product.id}</td>
                    <td>
                        <div class="inventory-product-name">${product.name}</div>
                        ${statusChip}
                    </td>
                    <td>${product.description || 'Bez popisu'}</td>
                    <td>${product.category || 'Nezařazeno'}</td>
                    <td>${product.quantity}</td>
                    <td>${formatCurrency(product.price)}</td>
                    <td>
                        <div class="inventory-actions">
                            <button class="btn btn-secondary btn-sm edit-btn" type="button">Upravit</button>
                            ${isDeactivated
                                ? `<button class="btn btn-success btn-sm activateProduct-btn" type="button" data-id="${product.id}">Aktivovat</button>`
                                : ''
                            }
                        </div>
                    </td>
                `;

                tbody.appendChild(row);
            });

            tableWrapper.appendChild(table);
            categoryCard.append(header, tableWrapper);

            const panelId = createCategoryPanelId(category);
            tableWrapper.id = panelId;
            collapseButton.setAttribute('aria-controls', panelId);

            const applyCollapsedState = (collapsed, { persist = false } = {}) => {
                categoryCard.classList.toggle('is-collapsed', collapsed);
                tableWrapper.hidden = collapsed;
                collapseButton.setAttribute('aria-expanded', String(!collapsed));
                collapseButton.setAttribute('aria-label', collapsed ? `Rozbalit kategorii ${category}` : `Sbalit kategorii ${category}`);
                collapseIcon.classList.toggle('is-collapsed', collapsed);
                if (persist) {
                    setCategoryCollapsedState(category, collapsed);
                }
            };

            const initialCollapsed = forceExpand ? false : isCategoryCollapsed(category);
            applyCollapsedState(initialCollapsed);

            const toggleCollapsedState = () => {
                const nextCollapsed = !categoryCard.classList.contains('is-collapsed');
                applyCollapsedState(nextCollapsed, { persist: true });
            };

            collapseButton.addEventListener('click', (event) => {
                event.stopPropagation();
                toggleCollapsedState();
            });

            editButton.addEventListener('click', (event) => {
                event.stopPropagation();
                focusCategoryManagementRow(category);
            });

            header.addEventListener('click', (event) => {
                const target = event.target;
                if (target instanceof Element && (target.closest('.inventory-category-edit-btn') || target.closest('.inventory-category-collapse-btn'))) {
                    return;
                }
                toggleCollapsedState();
            });

            inventoryContainer.appendChild(categoryCard);
        });

    inventoryContainer.querySelectorAll('.deactivateProduct-btn').forEach(button => {
        button.addEventListener('click', async (event) => {
            const productId = event.currentTarget.getAttribute('data-id');
            await deactivateProduct(productId);
        });
    });

    inventoryContainer.querySelectorAll('.activateProduct-btn').forEach(button => {
        button.addEventListener('click', async (event) => {
            const productId = event.currentTarget.getAttribute('data-id');
            await activateProduct(productId);
        });
    });

    inventoryContainer.querySelectorAll('.edit-btn').forEach(button => {
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            const row = event.currentTarget.closest('tr');
            if (row) {
                enableEditing(row);
            }
        });
    });
}

// Funkce pro aktualizaci barvy produktu
/*
async function updateProductColor(productId, color) {
    if (!productId || !color) {
        console.error("❌ Chyba: ID produktu nebo barva není definována.");
        return;
    }

    try {
        const response = await fetch(`${serverEndpoint}/updateProductColor`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: productId, color })
        });

        if (!response.ok) {
            throw new Error("❌ Chyba při aktualizaci barvy produktu.");
        }

        console.log(`✅ Barva produktu ID ${productId} byla úspěšně aktualizována.`);
        loadProducts(); // Aktualizace seznamu produktů
    } catch (error) {
        console.error("❌ Chyba při aktualizaci barvy produktu:", error);
    }
}*/
document.addEventListener('DOMContentLoaded', () => {
    const toggleButton = document.getElementById('toggleAddItemForm');
    const addItemForm = document.getElementById('addItemForm');
    const addItemFormBody = document.getElementById('addItemFormBody');

    if (!toggleButton || !addItemForm) {
        return;
    }

    const setVisibility = (visible) => {
        if (visible) {
            addItemForm.classList.add('is-visible');
            toggleButton.classList.add('is-active');
            toggleButton.setAttribute('aria-expanded', 'true');
            toggleButton.setAttribute('aria-label', 'Skrýt formulář pro přidání produktu');
            if (addItemFormBody) {
                addItemFormBody.setAttribute('aria-hidden', 'false');
            }
        } else {
            addItemForm.classList.remove('is-visible');
            toggleButton.classList.remove('is-active');
            toggleButton.setAttribute('aria-expanded', 'false');
            toggleButton.setAttribute('aria-label', 'Přidat produkt');
            if (addItemFormBody) {
                addItemFormBody.setAttribute('aria-hidden', 'true');
            }
        }
    };

    setVisibility(false);

    toggleButton.addEventListener('click', () => {
        const isVisible = addItemForm.classList.contains('is-visible');
        setVisibility(!isVisible);
        if (!isVisible) {
            addItemForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
});

document.addEventListener('DOMContentLoaded', () => {
    categoryManagementToggleButton = document.getElementById('toggleCategoryManagement');
    categoryManagementContainerEl = document.getElementById('categoryManagementContainer');

    if (categoryManagementContainerEl) {
        setCategoryManagementVisible(false);
    }

    if (categoryManagementToggleButton && categoryManagementContainerEl) {
        categoryManagementToggleButton.addEventListener('click', () => {
            const nextVisible = !categoryManagementVisible;
            setCategoryManagementVisible(nextVisible, { scroll: nextVisible });
        });
    }
});


async function activateProduct(productId) {
    try {
        const response = await fetch(`${serverEndpoint}/activateProduct`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: productId }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText);
        }

        const result = await response.json();
        await loadProducts();
        console.log(`✅ Produkt ID ${productId} byl úspěšně aktivován:`, result);
    } catch (error) {
        console.error("❌ Chyba při aktivaci produktu:", error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const colorSelect = document.getElementById('productColor');

    if (!colorSelect) {
        return;
    }

    // Nastavení barvy pozadí při změně výběru
    colorSelect.addEventListener('change', () => {
        const selectedColor = colorSelect.value;
        if (selectedColor) {
            colorSelect.style.backgroundColor = selectedColor;
        } else {
            colorSelect.style.backgroundColor = ''; // Výchozí barva
        }
    });

    // Nastavení výchozí barvy při načtení stránky
    const initialColor = colorSelect.value;
    if (initialColor) {
        colorSelect.style.backgroundColor = initialColor;
    }
});

async function loadCategories() {
    try {
        const response = await fetch(`${serverEndpoint}/categories`);
        if (!response.ok) {
            throw new Error('Chyba při načítání kategorií.');
        }

        const categories = await response.json();
        cachedCategories = Array.isArray(categories) ? categories : [];
        loadedCategories = cachedCategories.slice();
        pruneCollapseState(cachedCategories.map((category) => category.name));

        const categorySelect = document.getElementById('productCategory');
        if (categorySelect) {
            categorySelect.innerHTML = '<option value="">Vyberte kategorii</option>';
            cachedCategories
                .slice()
                .sort((a, b) => getCategoryOrderValue(a.name) - getCategoryOrderValue(b.name))
                .forEach(category => {
                    const option = document.createElement('option');
                    option.value = category.name;
                    option.textContent = category.name;
                    categorySelect.appendChild(option);
                });
        } else {
            console.warn('⚠️ Element s ID "productCategory" nebyl nalezen.');
        }

        renderCategoryManagement(cachedCategories);

        if (allProducts.length > 0) {
            renderInventory(allProducts);
        }

        console.log('✅ Kategorie byly úspěšně načteny.');
    } catch (error) {
        console.error('❌ Chyba při načítání kategorií:', error);
    }
}

function renderCategoryManagement(categories) {
    const container = document.getElementById('category-management');
    if (!container) {
        return;
    }

    container.innerHTML = '';

    if (!Array.isArray(categories) || categories.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'category-management-empty';
        emptyState.textContent = 'Žádné kategorie nejsou k dispozici.';
        container.appendChild(emptyState);
        return;
    }

    const headerRow = document.createElement('div');
    headerRow.className = 'category-management-head';
    headerRow.innerHTML = '<span>Název</span><span>Barva</span><span>Pořadí</span><span>Akce</span>';
    container.appendChild(headerRow);

    const sortedCategories = categories
        .slice()
        .sort((a, b) => {
            const orderA = getCategoryOrderValue(a.name);
            const orderB = getCategoryOrderValue(b.name);
            if (orderA !== orderB) {
                return orderA - orderB;
            }
            return a.name.localeCompare(b.name, 'cs', { sensitivity: 'base' });
        });

    sortedCategories.forEach((category) => {
        const row = document.createElement('div');
        row.className = 'category-management-row';
        row.dataset.originalName = category.name;

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'form-input category-name-input';
        nameInput.value = category.name || '';
        nameInput.setAttribute('aria-label', `Název kategorie ${category.name}`);

        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.className = 'form-input category-color-input';
        colorInput.value = normaliseCategoryColor(category.color);
        colorInput.setAttribute('aria-label', `Barva kategorie ${category.name}`);

        const orderInput = document.createElement('input');
        orderInput.type = 'number';
        orderInput.className = 'form-input category-order-input';
        orderInput.min = '0';
        if (Number.isFinite(Number(category.order))) {
            orderInput.value = Number(category.order);
        } else {
            orderInput.value = '';
        }
        orderInput.setAttribute('aria-label', `Pořadí kategorie ${category.name}`);

        const actions = document.createElement('div');
        actions.className = 'category-row-actions';

        const saveButton = document.createElement('button');
        saveButton.type = 'button';
        saveButton.className = 'btn btn-primary btn-sm save-category-btn';
        saveButton.textContent = 'Uložit';

        actions.appendChild(saveButton);

        row.append(nameInput, colorInput, orderInput, actions);
        container.appendChild(row);

        saveButton.addEventListener('click', async () => {
            const originalName = row.dataset.originalName || '';
            const nextName = nameInput.value.trim();
            const nextColor = normaliseCategoryColor(colorInput.value);
            const orderRaw = orderInput.value.trim();
            const payload = {
                name: nextName,
                color: nextColor
            };

            if (orderRaw !== '') {
                const numericOrder = Number(orderRaw);
                if (!Number.isFinite(numericOrder)) {
                    await showModal('❌ Pořadí musí být číslo.', {
                        isError: true,
                        title: 'Neplatné pořadí',
                        confirmVariant: 'danger'
                    });
                    return;
                }
                payload.order = numericOrder;
            }

            if (!nextName) {
                await showModal('❌ Název kategorie je povinný.', {
                    isError: true,
                    title: 'Neplatná data',
                    confirmVariant: 'danger'
                });
                return;
            }

            saveButton.disabled = true;
            const previousLabel = saveButton.textContent;
            saveButton.textContent = 'Ukládám...';

            try {
                const response = await fetch(`${serverEndpoint}/categories/${encodeURIComponent(originalName)}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await response.json().catch(() => null);

                if (!response.ok) {
                    throw new Error(data?.message || 'Chyba při aktualizaci kategorie.');
                }

                await showModal('✅ Kategorie byla upravena.', {
                    title: 'Hotovo',
                    confirmVariant: 'success'
                });

                await loadCategories();
            } catch (error) {
                console.error('❌ Chyba při aktualizaci kategorie:', error);
                await showModal(`❌ ${error.message}`, {
                    isError: true,
                    title: 'Aktualizace kategorie selhala',
                    confirmVariant: 'danger'
                });
            } finally {
                saveButton.disabled = false;
                saveButton.textContent = previousLabel;
            }
        });
    });
}

async function handleAddCategory(event) {
    event.preventDefault();

    const nameInput = document.getElementById('categoryName');
    const colorInput = document.getElementById('categoryColor');
    const orderInput = document.getElementById('categoryOrder');

    if (!nameInput || !colorInput || !orderInput) {
        console.error('❌ Formulář pro přidání kategorie není kompletní.');
        return;
    }

    const name = nameInput.value.trim();
    const color = normaliseCategoryColor(colorInput.value);
    const orderRaw = orderInput.value.trim();

    if (!name) {
        await showModal('❌ Název kategorie je povinný.', {
            isError: true,
            title: 'Neplatná data',
            confirmVariant: 'danger'
        });
        return;
    }

    const payload = { name, color };
    if (orderRaw !== '') {
        const numericOrder = Number(orderRaw);
        if (!Number.isFinite(numericOrder)) {
            await showModal('❌ Pořadí musí být číslo.', {
                isError: true,
                title: 'Neplatná data',
                confirmVariant: 'danger'
            });
            return;
        }
        payload.order = numericOrder;
    }

    const submitButton = document.getElementById('addCategoryButton');
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Přidávám...';
    }

    try {
        const response = await fetch(`${serverEndpoint}/categories`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json().catch(() => null);

        if (!response.ok) {
            throw new Error(data?.message || 'Chyba při přidávání kategorie.');
        }

        await showModal('✅ Kategorie byla přidána.', {
            title: 'Hotovo',
            confirmVariant: 'success'
        });

        nameInput.value = '';
        colorInput.value = DEFAULT_CATEGORY_COLOR;
        orderInput.value = '';

        await loadCategories();
    } catch (error) {
        console.error('❌ Chyba při přidávání kategorie:', error);
        await showModal(`❌ ${error.message}`, {
            isError: true,
            title: 'Přidání kategorie selhalo',
            confirmVariant: 'danger'
        });
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Přidat kategorii';
        }
    }
}

// Načtení kategorií při načtení stránky
document.addEventListener('DOMContentLoaded', () => {
    loadCategories();
});

// Funkce pro přidání nového produktu
async function handleAddProduct() {
    const nameInput = document.getElementById('productName');
    const descriptionInput = document.getElementById('productDescription');
    const quantityInput = document.getElementById('productQuantity');
    const priceInput = document.getElementById('productPrice');
    const colorSelect = document.getElementById('productColor');
    const categorySelect = document.getElementById('productCategory');

    const name = nameInput.value.trim();
    const description = descriptionInput.value.trim();
    const quantityRaw = quantityInput.value.trim();
    const priceRaw = priceInput.value.trim();
    const color = colorSelect.value;
    const category = categorySelect.value;

    const normalisedQuantity = Number(quantityRaw);
    const normalisedPrice = Number(priceRaw.replace(',', '.'));

    if (!name) {
        await showModal('❌ Název produktu je povinný!', {
            isError: true,
            title: 'Neplatná data',
            confirmVariant: 'danger'
        });
        return;
    }

    const isQuantityValid = quantityRaw !== '' && Number.isFinite(normalisedQuantity) && Number.isInteger(normalisedQuantity) && normalisedQuantity > 0;
    if (!isQuantityValid) {
        await showModal('❌ Množství musí být kladné celé číslo!', {
            isError: true,
            title: 'Neplatná data',
            confirmVariant: 'danger'
        });
        return;
    }

    const isPriceValid = priceRaw !== '' && Number.isFinite(normalisedPrice) && normalisedPrice > 0;
    if (!isPriceValid) {
        await showModal('❌ Cena musí být kladné číslo!', {
            isError: true,
            title: 'Neplatná data',
            confirmVariant: 'danger'
        });
        return;
    }

    if (!color) {
        await showModal('❌ Vyberte barvu produktu!', {
            isError: true,
            title: 'Neplatná data',
            confirmVariant: 'danger'
        });
        return;
    }

    if (!category) {
        await showModal('❌ Vyberte kategorii produktu!', {
            isError: true,
            title: 'Neplatná data',
            confirmVariant: 'danger'
        });
        return;
    }

    console.log('🛒 Přidávám nový produkt:', {
        name,
        description,
        quantity: normalisedQuantity,
        price: normalisedPrice,
        color,
        category
    });

    try {
        const response = await fetch(`${serverEndpoint}/addProduct`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                description,
                quantity: normalisedQuantity,
                price: normalisedPrice,
                color,
                category
            })
        });

        let data = null;
        try {
            data = await response.json();
        } catch (parseError) {
            console.warn('⚠️ Nepodařilo se zpracovat JSON odpovědi při přidávání produktu.', parseError);
        }

        if (!response.ok) {
            throw new Error(data?.message || 'Chyba při přidávání produktu.');
        }

        console.log('✅ Produkt přidán:', data?.product ?? '(bez detailů)');

        nameInput.value = '';
        descriptionInput.value = '';
        quantityInput.value = '';
        priceInput.value = '';
        colorSelect.value = '';
        colorSelect.style.backgroundColor = '';
        categorySelect.value = '';

        await showModal('✅ Produkt byl úspěšně přidán!', {
            title: 'Hotovo',
            confirmVariant: 'success'
        });

        await loadProducts();
    } catch (error) {
        console.error('❌ Chyba při přidávání produktu:', error);
        await showModal(`❌ ${error.message}`, {
            isError: true,
            title: 'Přidání produktu selhalo',
            confirmVariant: 'danger'
        });
    }
}
// Funkce pro odstranění produktu
async function deactivateProduct(productId, { skipConfirm = false } = {}) {
    if (!productId) {
        console.error('❌ Chyba: ID produktu není definováno.');
        return false;
    }

    let success = false;

    try {
        console.log(`🛑 Deaktivuji produkt ID: ${productId}...`);

        const response = await fetch(`${serverEndpoint}/deactivateProduct`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: String(productId) })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data?.message || 'Chyba při deaktivaci produktu.');
        }

        success = true;

        if (data?.alreadyDeactivated) {
            console.warn(`⚠️ Produkt ID ${productId} byl už dříve deaktivován.`);
        } else {
            console.log(`✅ Produkt ${productId} deaktivován: ${data.message}`);
        }
    } catch (error) {
        console.error('❌ Chyba při deaktivaci produktu:', error);
        await showModal(
            `❌ Chyba při deaktivaci produktu: ${error.message}`,
            { isError: true, title: 'Deaktivace selhala', confirmVariant: 'danger' }
        );
    } finally {
        await loadProducts();
    }

    return success;
}

async function deleteProduct(productId, { skipConfirm = false } = {}) {
    if (!productId) {
        console.error('❌ Chyba: ID produktu není definováno.');
        return false;
    }

    if (!skipConfirm) {
        const confirmed = await showModalConfirm(
            'Opravdu chcete produkt trvale odstranit?',
            {
                title: 'Odstranění produktu',
                confirmText: 'Odstranit',
                cancelText: 'Zrušit',
                variant: 'danger'
            }
        );

        if (!confirmed) {
            return false;
        }
    }

    let success = false;

    try {
        const response = await fetch(`${serverEndpoint}/deleteProduct`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: productId })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data?.message || 'Chyba při mazání produktu.');
        }

        success = true;

        await showModal('✅ Produkt byl trvale odstraněn.', {
            title: 'Hotovo',
            confirmVariant: 'success'
        });
    } catch (error) {
        console.error('❌ Chyba při mazání produktu:', error);
        await showModal(
            `❌ Chyba při mazání produktu: ${error.message}`,
            { isError: true, title: 'Mazání selhalo', confirmVariant: 'danger' }
        );
    } finally {
        await loadProducts();
    }

    return success;
}

let loadedCategories = [];

async function fetchCategories() {
    if (cachedCategories.length > 0) {
        loadedCategories = cachedCategories.slice();
        return;
    }

    try {
        const response = await fetch(`${serverEndpoint}/categories`);
        if (!response.ok) throw new Error('Chyba při načítání kategorií');
        const categories = await response.json();
        cachedCategories = Array.isArray(categories) ? categories : [];
        loadedCategories = cachedCategories.slice();
    } catch (e) {
        console.error(e);
        loadedCategories = [];
    }
}

async function enableEditing(row) {
    const id = row.getAttribute('data-id');
    const idCell = row.children[0];
    const nameCell = row.children[1];
    const descriptionCell = row.children[2];
    const categoryCell = row.children[3];
    const quantityCell = row.children[4];
    const priceCell = row.children[5];
    const actionCell = row.children[6]; // POZOR: teď je actionCell na indexu 6!

    if (!id) {
        console.error("❌ Chyba: ID produktu nebylo nalezeno.");
        return;
    }

    row.classList.add('is-editing');

    const currentName = row.dataset.name || nameCell.querySelector('.inventory-product-name')?.textContent.trim() || '';
    const currentDescription = row.dataset.description || descriptionCell.textContent.trim();
    const currentCategory = row.dataset.category || categoryCell.textContent.trim();
    const currentQuantity = Number(row.dataset.quantity ?? quantityCell.textContent.trim());
    const priceText = row.dataset.price !== undefined ? String(row.dataset.price) : priceCell.textContent;
    const numericPrice = Number(priceText.replace(/[^0-9,.-]/g, '').replace(',', '.'));
    const currentPrice = Number.isFinite(numericPrice) ? numericPrice : 0;
    const currentColor = row.dataset.color || '#ffffff';
    const isActive = row.dataset.active !== 'false';

    if (loadedCategories.length === 0) await fetchCategories();

    nameCell.innerHTML = `<input type="text" value="${currentName}">`;
    descriptionCell.innerHTML = `<input type="text" value="${currentDescription}">`;
    categoryCell.innerHTML = `
        <select>
            ${loadedCategories.map(cat => `
                <option value="${cat.name}" ${currentCategory === cat.name ? 'selected' : ''}>${cat.name}</option>
            `).join('')}
        </select>
    `;
    quantityCell.innerHTML = `<input type="number" min="0" value="${currentQuantity}">`;
    priceCell.innerHTML = `<input type="number" min="0" step="0.01" value="${currentPrice}">`;

    // Color picker a tlačítka do jedné buňky
    const stateActionHtml = isActive
        ? '<button class="btn btn-warning btn-sm deactivate-btn" type="button">Deaktivovat</button>'
        : '<button class="btn btn-success btn-sm activate-inline-btn" type="button">Aktivovat</button>';

    actionCell.innerHTML = `
        <div class="inventory-inline-actions">
            <input type="color" class="inventory-color-picker" value="${currentColor}">
            <div class="inventory-actions">
                <button class="btn btn-success btn-sm save-btn" type="button">Uložit</button>
                <button class="btn btn-secondary btn-sm cancel-btn" type="button">Zrušit</button>
                ${stateActionHtml}
                <button class="btn btn-danger btn-sm delete-btn" type="button">Odstranit</button>
            </div>
        </div>
    `;

    actionCell.querySelector('.save-btn').addEventListener('click', () => handleSaveInline(id, row));
    actionCell.querySelector('.cancel-btn').addEventListener('click', () => loadProducts());
    const deactivateButton = actionCell.querySelector('.deactivate-btn');
    if (deactivateButton) {
        deactivateButton.addEventListener('click', async () => {
            await deactivateProduct(id);
        });
    }
    const activateButton = actionCell.querySelector('.activate-inline-btn');
    if (activateButton) {
        activateButton.addEventListener('click', async () => {
            await activateProduct(id);
        });
    }
    actionCell.querySelector('.delete-btn').addEventListener('click', async () => {
        await deleteProduct(id);
    });
}

function rgbToHex(rgb) {
    const result = rgb.match(/\d+/g);
    if (!result) return "#ffffff";
    return (
        "#" +
        result
            .map(x => {
                const hex = parseInt(x).toString(16);
                return hex.length === 1 ? "0" + hex : hex;
            })
            .join("")
    );
}

async function handleSaveInline(id, row) {
    if (!id) {
        console.error("❌ Chyba: ID produktu je null nebo undefined.");
        return;
    }

    const nameInput = row.children[1].querySelector('input');
    const descriptionInput = row.children[2].querySelector('input');
    const categorySelect = row.children[3].querySelector('select');
    const quantityInput = row.children[4].querySelector('input');
    const priceInput = row.children[5].querySelector('input');
    const colorInput = row.children[6].querySelector('input[type="color"]'); // změna: index 6

    if (!nameInput || !descriptionInput || !categorySelect || !quantityInput || !priceInput || !colorInput) {
        console.error("❌ Chyba: Některé vstupy nebyly nalezeny.");
        return;
    }

    const name = nameInput.value.trim();
    const description = descriptionInput.value.trim();
    const category = categorySelect.value;
    const quantityRaw = quantityInput.value.trim();
    const priceRaw = priceInput.value.trim();
    const quantity = Number(quantityRaw);
    const price = Number(priceRaw.replace(',', '.'));
    const color = colorInput.value;

    if (!name) {
        await showModal('❌ Název produktu nesmí být prázdný.', {
            isError: true,
            title: 'Neplatná data',
            confirmVariant: 'danger'
        });
        return;
    }

    const isQuantityValid = quantityRaw !== '' && Number.isFinite(quantity) && Number.isInteger(quantity) && quantity >= 0;
    if (!isQuantityValid) {
        await showModal('❌ Množství musí být celé číslo větší nebo rovné nule.', {
            isError: true,
            title: 'Neplatná data',
            confirmVariant: 'danger'
        });
        return;
    }

    const isPriceValid = priceRaw !== '' && Number.isFinite(price) && price >= 0;
    if (!isPriceValid) {
        await showModal('❌ Cena musí být číslo větší nebo rovné nule.', {
            isError: true,
            title: 'Neplatná data',
            confirmVariant: 'danger'
        });
        return;
    }

    try {
        console.log('Odesílám na server:', {
            id,
            name,
            description,
            category,
            quantity,
            price,
            color
        });
        const response = await fetch(`${serverEndpoint}/updateProduct`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, name, description, category, quantity, price, color })
        });
        if (!response.ok) {
            throw new Error('Chyba při ukládání produktu.');
        }
        await loadProducts();
    } catch (e) {
        console.error(e);
        await showModal('❌ Chyba při ukládání produktu!', {
            isError: true,
            title: 'Uložení selhalo',
            confirmVariant: 'danger'
        });
    }
}

// Načíst a vykreslit inventář při načtení stránky a přidat event listener na tlačítko přidání
document.addEventListener('DOMContentLoaded', () => {
    loadProducts(); // Načíst produkty při načtení stránky

    // Přidat event listener na tlačítko přidání produktu
    const addProductButton = document.getElementById('addProductButton');
    if (addProductButton) {
        addProductButton.addEventListener('click', handleAddProduct);
    } else {
        console.warn('⚠️ Tlačítko pro přidání produktu nebylo nalezeno.');
    }
});

// Přidej tento kód pro vyhledávání:
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search');
    if (searchInput) {
        searchInput.addEventListener('input', function () {
            const query = this.value.trim().toLowerCase();
            const filtered = allProducts.filter(product =>
                (product.name && product.name.toLowerCase().includes(query)) ||
                (typeof product.description === "string" && product.description.toLowerCase().includes(query)) ||
                (product.category && product.category.toLowerCase().includes(query))
            );
            renderInventory(filtered, { forceExpand: query.length > 0 });
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const categoryForm = document.getElementById('categoryManagementForm');
    if (categoryForm) {
        categoryForm.addEventListener('submit', handleAddCategory);
    }
});