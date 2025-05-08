const fs = require('fs');
const path = require('path');
const { create, convert } = require('xmlbuilder2');
const common = require('./service_common');


function activateProduct(id) {
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

        const productToUpdate = products.find(p => String(p['@id']) === String(id));

        if (!productToUpdate) {
            throw new Error("Produkt nebyl nalezen.");
        }

        if (productToUpdate['@active'] === 'true') {
            throw new Error("Produkt je již aktivní.");
        }

        // Nastavíme atribut active na "true"
        productToUpdate['@active'] = 'true';

        const updatedXml = create(jsonData).end({ prettyPrint: true });
        fs.writeFileSync(productsPath, updatedXml);

        console.log(`✅ Produkt ID ${id} byl úspěšně aktivován.`);
        return { message: `Produkt ID ${id} byl úspěšně aktivován.` };
    } catch (error) {
        console.error("❌ Chyba při aktivaci produktu:", error);
        throw new Error("Chyba při aktivaci produktu.");
    }
}

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

function updateProduct({ id, name, description, price, quantity, color, category }) {
    if (!id) {
        throw new Error("❌ Neplatné ID produktu.");
    }

    const productsPath = ensureProductsXML();

    try {
        const xmlData = fs.readFileSync(productsPath, 'utf8');
        let jsonData = convert(xmlData, { format: 'object' });

        let products = jsonData.products?.product || [];
        if (!Array.isArray(products)) {
            products = [products];
        }

        const productToUpdate = products.find(p => String(p['@id']) === String(id));

        if (!productToUpdate) {
            throw new Error("❌ Produkt nebyl nalezen.");
        }

        // ✅ Aktualizace pouze odeslaných vlastností
        if (name !== undefined) productToUpdate.Name = name;
        if (description !== undefined) productToUpdate.Description = description || '';
        if (price !== undefined) productToUpdate.Price = price.toString();
        if (quantity !== undefined) productToUpdate.Quantity = quantity.toString();
        if (category !== undefined) productToUpdate.Category = category || 'Nezařazeno';
        if (color !== undefined) productToUpdate.Color = color || '#FFFFFF';

        // Zápis zpět do XML
        const updatedXml = create(jsonData).end({ prettyPrint: true });
        fs.writeFileSync(productsPath, updatedXml);

        console.log(`✅ Produkt ID ${id} byl úspěšně aktualizován.`);
        return { message: `✅ Produkt ID ${id} byl úspěšně aktualizován.` };

    } catch (error) {
        console.error("❌ Chyba při aktualizaci produktu:", error);
        throw new Error("❌ Chyba při aktualizaci produktu.");
    }
}

function deleteProduct(req, res) {
    const { id } = req.body;
    const productsPath = ensureProductsXML();

    try {
        const xmlData = fs.readFileSync(productsPath, 'utf8');
        let jsonData = convert(xmlData, { format: 'object' });

        let products = jsonData.products?.product || [];
        if (!Array.isArray(products)) products = [products];

        // Debug log
        console.log("Mazání produktu s ID:", id);

        const index = products.findIndex(p => String(p['@id']) === String(id));
        if (index === -1) {
            return res.status(404).json({ message: "Produkt nebyl nalezen." });
        }

        products.splice(index, 1);

        // Pokud je jen jeden produkt, musíš správně nastavit strukturu
        jsonData.products.product = products.length === 1 ? products[0] : products;

        const updatedXml = create(jsonData).end({ prettyPrint: true });
        fs.writeFileSync(productsPath, updatedXml);

        res.json({ message: "Produkt byl úspěšně smazán." });
    } catch (error) {
        console.error("Chyba při mazání produktu:", error);
        res.status(500).json({ message: "Chyba při mazání produktu." });
    }
}
module.exports = {
    activateProduct, deactivateProduct, deleteProduct, getNextProductID, ensureProductsXML, updateProduct
};