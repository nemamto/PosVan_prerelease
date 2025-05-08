const { Storage } = require('@google-cloud/storage');
const path = require('path');

// Inicializace Cloud Storage
const storage = new Storage({
    keyFilename: './service_account.json', // cesta k vašemu JSON souboru s klíčem
    projectId: 'posven', // váš Google Cloud Project ID
});

const bucketName = 'posven_00'; // název vašeho bucketu
const bucket = storage.bucket(bucketName);

// Funkce pro nahrání souboru
async function uploadFile(filePath, destination) {
    await bucket.upload(filePath, {
        destination: destination,
        public: false,
        metadata: {
            cacheControl: 'no-cache',
        },
    });
    console.log(`Soubor ${filePath} byl nahrán jako ${destination}`);
}

// Funkce pro stažení souboru
async function downloadFile(destination, localPath) {
    const options = {
        destination: localPath,
    };
    await bucket.file(destination).download(options);
    console.log(`Soubor ${destination} byl stažen do ${localPath}`);
}

// Funkce pro smazání souboru
async function deleteFile(fileName) {
    await bucket.file(fileName).delete();
    console.log(`Soubor ${fileName} byl smazán.`);
}

module.exports = {
    uploadFile,
    downloadFile,
    deleteFile,
};
