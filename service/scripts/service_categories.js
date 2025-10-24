const fs = require('fs');
const path = require('path');

const DEFAULT_CATEGORY_COLOR = '#4dabf7';

function getCategoriesPath() {
    return path.join(__dirname, '..', 'data', 'categories.json');
}

function ensureCategoriesFile() {
    const filePath = getCategoriesPath();
    if (!fs.existsSync(filePath)) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, '[]', 'utf8');
    }
    return filePath;
}

function readCategories() {
    const filePath = ensureCategoriesFile();
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error('❌ Chyba při čtení categories.json:', error);
        throw new Error('Nelze načíst kategorie.');
    }
}

function writeCategories(categories) {
    const filePath = ensureCategoriesFile();
    try {
        fs.writeFileSync(filePath, JSON.stringify(categories, null, 2), 'utf8');
    } catch (error) {
        console.error('❌ Chyba při zápisu categories.json:', error);
        throw new Error('Nelze uložit kategorie.');
    }
}

function normaliseName(name) {
    if (typeof name !== 'string') {
        return '';
    }
    return name.trim();
}

function normaliseColor(color) {
    if (typeof color !== 'string') {
        return DEFAULT_CATEGORY_COLOR;
    }
    const trimmed = color.trim();
    return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed : DEFAULT_CATEGORY_COLOR;
}

function normaliseOrder(order, fallback) {
    const numeric = Number(order);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    return numeric;
}

function getMaxOrder(categories) {
    return categories.reduce((max, category) => {
        const numericOrder = Number(category.order);
        if (Number.isFinite(numericOrder) && numericOrder > max) {
            return numericOrder;
        }
        return max;
    }, 0);
}

function sortCategories(categories) {
    return categories
        .slice()
        .sort((a, b) => {
            const orderA = Number(a.order);
            const orderB = Number(b.order);
            if (Number.isFinite(orderA) && Number.isFinite(orderB) && orderA !== orderB) {
                return orderA - orderB;
            }
            if (Number.isFinite(orderA) && !Number.isFinite(orderB)) {
                return -1;
            }
            if (!Number.isFinite(orderA) && Number.isFinite(orderB)) {
                return 1;
            }
            const nameA = a.name || '';
            const nameB = b.name || '';
            return nameA.localeCompare(nameB, 'cs', { sensitivity: 'base' });
        });
}

function addCategory({ name, color, order }) {
    const categories = readCategories();
    const trimmedName = normaliseName(name);

    if (!trimmedName) {
        throw new Error('Název kategorie je povinný.');
    }

    const exists = categories.some((category) => category.name.toLowerCase() === trimmedName.toLowerCase());
    if (exists) {
        throw new Error('Kategorie se stejným názvem již existuje.');
    }

    const nextOrder = order !== undefined && order !== null
        ? normaliseOrder(order, getMaxOrder(categories) + 1)
        : getMaxOrder(categories) + 1;

    const newCategory = {
        name: trimmedName,
        color: normaliseColor(color),
        order: nextOrder
    };

    const updated = sortCategories([...categories, newCategory]);
    writeCategories(updated);

    return updated.find((category) => category.name === trimmedName) || newCategory;
}

function updateCategory(originalName, { name, color, order }) {
    const categories = readCategories();
    const trimmedOriginalName = normaliseName(originalName);
    if (!trimmedOriginalName) {
        throw new Error('Původní název kategorie je povinný.');
    }

    const index = categories.findIndex((category) => category.name.toLowerCase() === trimmedOriginalName.toLowerCase());
    if (index === -1) {
        throw new Error('Kategorie nebyla nalezena.');
    }

    const nextName = name !== undefined ? normaliseName(name) : categories[index].name;
    if (!nextName) {
        throw new Error('Název kategorie je povinný.');
    }

    const duplicate = categories.some((category, idx) => idx !== index && category.name.toLowerCase() === nextName.toLowerCase());
    if (duplicate) {
        throw new Error('Kategorie se stejným názvem již existuje.');
    }

    const nextColor = color !== undefined ? normaliseColor(color) : normaliseColor(categories[index].color);
    const nextOrder = order !== undefined ? normaliseOrder(order, categories[index].order) : categories[index].order;

    categories[index] = {
        ...categories[index],
        name: nextName,
        color: nextColor,
        order: nextOrder
    };

    const updated = sortCategories(categories);
    writeCategories(updated);

    return updated.find((category) => category.name === nextName) || categories[index];
}

module.exports = {
    readCategories,
    writeCategories,
    addCategory,
    updateCategory
};
