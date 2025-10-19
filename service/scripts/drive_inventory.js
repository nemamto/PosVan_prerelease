const { listFolderItems } = require('./googleDriveClient');
const { getDriveBaseFolderUrl, getDriveBaseFolderId } = require('./local_config');

function isFolder(item) {
    return item && item.mimeType === 'application/vnd.google-apps.folder';
}

function normaliseName(value) {
    return typeof value === 'string' ? value : 'nezname';
}

function parseTimestamp(value) {
    if (!value) {
        return null;
    }
    const time = Date.parse(value);
    return Number.isNaN(time) ? null : time;
}

async function listDriveBackupInventory() {
    const baseFolderId = getDriveBaseFolderId();
    const baseFolderUrl = getDriveBaseFolderUrl();

    if (!baseFolderId) {
        return {
            baseFolderId: null,
            baseFolderUrl,
            generatedAt: new Date().toISOString(),
            devices: [],
            error: 'Neni nastavena driveBaseFolderId ani driveBaseFolderUrl v local-config.json.',
            errorCode: 'BASE_FOLDER_MISSING',
        };
    }

    const inventory = {
        baseFolderId,
        baseFolderUrl,
        generatedAt: new Date().toISOString(),
        devices: [],
        error: null,
        errorCode: null,
    };

    try {
        const deviceFolders = (await listFolderItems(baseFolderId)).filter(isFolder);

        const devices = [];
        for (const deviceFolder of deviceFolders) {
            const device = {
                id: deviceFolder.id,
                name: normaliseName(deviceFolder.name),
                folderId: deviceFolder.id,
                dates: [],
                totalFiles: 0,
                totalBytes: 0,
                latest: null,
            };

            const dateFolders = (await listFolderItems(deviceFolder.id)).filter(isFolder);

            for (const dateFolder of dateFolders) {
                const files = (await listFolderItems(dateFolder.id)).filter(item => !isFolder(item));

                const fileEntries = files.map(file => {
                    const timestamp = parseTimestamp(file.modifiedTime);
                    return {
                        id: file.id,
                        fileId: file.id,
                        name: normaliseName(file.name),
                        mimeType: file.mimeType,
                        size: Number(file.size || 0),
                        modifiedTime: file.modifiedTime || null,
                        webViewLink: file.webViewLink || null,
                        timestamp,
                    };
                });

                fileEntries.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

                const dateEntry = {
                    id: dateFolder.id,
                    name: normaliseName(dateFolder.name),
                    folderId: dateFolder.id,
                    files: fileEntries,
                };

                const totalBytes = fileEntries.reduce((sum, file) => sum + (Number.isFinite(file.size) ? file.size : 0), 0);
                const latestFile = fileEntries.find(file => file.timestamp !== null) || null;

                device.dates.push(dateEntry);
                device.totalFiles += fileEntries.length;
                device.totalBytes += totalBytes;

                if (!device.latest || (latestFile && (latestFile.timestamp || 0) > (device.latest.timestamp || 0))) {
                    device.latest = latestFile;
                }
            }

            device.dates.sort((a, b) => b.name.localeCompare(a.name));
            devices.push(device);
        }

        devices.sort((a, b) => a.name.localeCompare(b.name));
        inventory.devices = devices;
    } catch (error) {
        inventory.error = error && error.message ? error.message : String(error);
        if (error && error.code) {
            inventory.errorCode = error.code;
        }
    }

    return inventory;
}

module.exports = {
    listDriveBackupInventory,
};
