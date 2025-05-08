const fs = require('fs');
const path = require('path');
const { create, convert } = require('xmlbuilder2');
const common = require('./service_common');

function deactivateProduct(id) {
    const productsPath = ensureProductsXML();

    if (!id) {
        throw new Error("Neplatné ID produktu.");
    }

    try {
        const xmlData = fs.readFileSync(productsPath, 'utf8');
        let jsonData = convert(xmlData, { format: 'object' });

        let products = jsonData.products?.product || [];
        if (!Array.isArray(products)) {
            products = products ? [products] : [];
        }

        const productToUpdate = products.find(p => p['@id'] === id);

        if (!productToUpdate) {
            throw new Error("Produkt nebyl nalezen.");
        }

        if (productToUpdate['@active'] === 'false') {
            throw new Error("Produkt je již označen jako nepoužitý.");
        }

        // Nastavíme atribut active na "false"
        productToUpdate['@active'] = 'false';

        const updatedXml = create(jsonData).end({ prettyPrint: true });
        fs.writeFileSync(productsPath, updatedXml);

        console.log(`✅ Produkt ID ${id} označen jako nepoužitý.`);
        return { message: `Produkt ID ${id} označen jako nepoužitý.` };
    } catch (error) {
        console.error("❌ Chyba při aktualizaci produktu:", error);
        throw new Error("Chyba při aktualizaci produktu.");
    }
}

function getNextProductID() {
    const idsDir = path.join(__dirname, 'data', 'ids');
    common.ensureDirectoryExistence(idsDir);
    const idPath = path.join(idsDir, 'product_id.json');
    let currentID = 1;
    if (fs.existsSync(idPath)) {
        const idData = fs.readFileSync(idPath, 'utf8');
        currentID = parseInt(idData, 10) + 1;
    }
    fs.writeFileSync(idPath, currentID.toString());
    return currentID;
}
function ensureProductsXML() {
    const dataPath = path.join(__dirname,'..', 'data');
    const productsPath = path.join(dataPath, 'products.xml');
    if (!fs.existsSync(dataPath)) {
        fs.mkdirSync(dataPath, { recursive: true });
    }
    if (!fs.existsSync(productsPath)) {
        const xmlDoc = create({ version: '1.0' }).ele('products');
        fs.writeFileSync(productsPath, xmlDoc.end({ prettyPrint: true, indent: '\t' }));
    }
    return productsPath;
}
module.exports = {
    deactivateProduct, getNextProductID, ensureProductsXML
};

