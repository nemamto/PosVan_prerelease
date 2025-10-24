const fs = require('fs');
const path = require('path');
const { create, convert } = require('xmlbuilder2');
const common = require('./service_common');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PRODUCTS_PATH = path.join(DATA_DIR, 'products.xml');
const IDS_DIR = path.join(DATA_DIR, 'ids');
const PRODUCT_ID_COUNTER_PATH = path.join(IDS_DIR, 'product_id.json');

function readProductsXml() {
    if (!fs.existsSync(PRODUCTS_PATH)) {
        throw new Error('Soubor products.xml neexistuje.');
    }

    const xmlData = fs.readFileSync(PRODUCTS_PATH, 'utf8');
    const jsonData = convert(xmlData, { format: 'object' });
    let products = jsonData.products?.product || [];

    if (!Array.isArray(products)) {
        products = products ? [products] : [];
    }

    return { jsonData, products };
}

function getIdsSummary(products) {
    const seen = new Map();
    const duplicates = new Map();
    let maxId = 0;

    products.forEach((product) => {
        const rawId = product?.['@id'];
        const numericId = Number(rawId);

        if (!Number.isFinite(numericId) || numericId <= 0) {
            const group = duplicates.get('invalid') || [];
            group.push({ id: rawId, name: product?.Name || '' });
            duplicates.set('invalid', group);
            return;
        }

        if (numericId > maxId) {
            maxId = numericId;
        }

        if (seen.has(numericId)) {
            const group = duplicates.get(numericId) || [];
            group.push({ id: numericId, name: product?.Name || '' });
            duplicates.set(numericId, group);
        } else {
            seen.set(numericId, { id: numericId, name: product?.Name || '' });
        }
    });

    const duplicateList = [];
    duplicates.forEach((group, id) => {
        if (id === 'invalid') {
            duplicateList.push({
                id: null,
                reason: 'invalid',
                products: group,
            });
            return;
        }

        const original = seen.get(Number(id));
        duplicateList.push({
            id: Number(id),
            reason: 'duplicate',
            original,
            duplicates: group,
        });
    });

    duplicateList.sort((a, b) => {
        if (a.id === null) {
            return -1;
        }
        if (b.id === null) {
            return 1;
        }
        return a.id - b.id;
    });

    return {
        totalProducts: products.length,
        uniqueIds: seen.size,
        duplicateCount: duplicateList.filter(item => item.reason === 'duplicate').length,
        invalidCount: duplicateList.filter(item => item.reason === 'invalid').length,
        maxId,
        duplicates: duplicateList,
    };
}

function validateProductIds() {
    const { products } = readProductsXml();
    return getIdsSummary(products);
}

function ensureIdsDirectory() {
    common.ensureDirectoryExistence(IDS_DIR);
}

function updateProductIdCounter(value) {
    ensureIdsDirectory();
    fs.writeFileSync(PRODUCT_ID_COUNTER_PATH, String(value));
}

function reassignProductIds() {
    const { jsonData, products } = readProductsXml();

    if (products.length === 0) {
        return {
            totalProducts: 0,
            reassigned: [],
            message: 'Žádné produkty k přečíslování.',
        };
    }

    const previousSummary = getIdsSummary(products);

    if ((previousSummary.duplicateCount || 0) === 0 && (previousSummary.invalidCount || 0) === 0) {
        updateProductIdCounter(previousSummary.maxId || 0);
        return {
            totalProducts: products.length,
            reassigned: [],
            previousSummary,
            summary: previousSummary,
            duplicateCount: previousSummary.duplicateCount,
        };
    }

    const reassigned = [];
    let maxId = Number(previousSummary.maxId) || 0;
    const usedIds = new Set();

    products.forEach((product) => {
        const rawId = product?.['@id'];
        const numericId = Number(rawId);
        const isValidId = Number.isFinite(numericId) && numericId > 0;
        const isDuplicate = isValidId && usedIds.has(numericId);

        if (isValidId && !isDuplicate) {
            usedIds.add(numericId);
            product['@id'] = String(numericId);
            return;
        }

        maxId += 1;
        const newId = maxId;
        reassigned.push({
            oldId: isValidId ? numericId : rawId ?? null,
            newId,
            name: product?.Name || '',
        });
        product['@id'] = String(newId);
        usedIds.add(newId);
    });

    jsonData.products.product = products.length === 1 ? products[0] : products;

    const updatedXml = create(jsonData).end({ prettyPrint: true });
    fs.writeFileSync(PRODUCTS_PATH, updatedXml);

    const summary = getIdsSummary(products);
    updateProductIdCounter(summary.maxId || maxId);

    return {
        totalProducts: products.length,
        reassigned,
        previousSummary,
        summary,
        duplicateCount: summary.duplicateCount,
    };
}

module.exports = {
    validateProductIds,
    reassignProductIds,
};
