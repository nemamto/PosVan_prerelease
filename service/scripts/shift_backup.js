const fs = require('fs');
const os = require('os');
const path = require('path');
const archiver = require('archiver');
const extract = require('extract-zip');
const common = require('./service_common');
const { ensureSubFolder, uploadFileToFolder, downloadFileById } = require('./googleDriveClient');
const { getDriveBaseFolderId, getConfiguredDeviceName, getDriveBaseFolderUrl } = require('./local_config');
const { listDriveBackupInventory } = require('./drive_inventory');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SHIFTS_DIR = path.join(DATA_DIR, 'shifts');
const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const HISTORY_LIMIT = Number(process.env.SHIFT_BACKUP_HISTORY_LIMIT || 10);

function purgeDirectoryContents(targetPath) {
    if (!fs.existsSync(targetPath)) {
        return;
    }

    const entries = fs.readdirSync(targetPath, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(targetPath, entry.name);
        fs.rmSync(fullPath, { recursive: true, force: true });
    }
}

function getFileSafeTimestamp(date = new Date()) {
    const pad = value => String(value).padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function sanitizeDeviceName(input) {
    if (!input) {
        return 'unknown';
    }
    const collapsed = input.toString().trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-');
    const trimmed = collapsed.replace(/^[-_]+/, '').replace(/[-_]+$/, '');
    return trimmed || 'unknown';
}

function buildManifest(fileNames, createdAt, meta) {
    const entries = fileNames.map(name => {
        const fullPath = path.join(SHIFTS_DIR, name);
        const stats = fs.statSync(fullPath);
        return {
            name,
            bytes: stats.size,
            modified: stats.mtime.toISOString()
        };
    });

    return JSON.stringify({
        createdAt: createdAt.toISOString(),
        source: 'shift-backup',
        fileCount: entries.length,
        device: meta.deviceName,
        entries
    }, null, 2);
}

function createArchive(archivePath, manifestContents) {
    return new Promise((resolve, reject) => {
        const outputStream = fs.createWriteStream(archivePath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        outputStream.on('close', () => resolve());
        archive.on('warning', warn => {
            if (warn.code === 'ENOENT') {
                console.warn('Warning:', warn.message);
            } else {
                reject(warn);
            }
        });
        archive.on('error', reject);

        archive.pipe(outputStream);
        archive.directory(DATA_DIR, 'data');
        archive.append(manifestContents, { name: 'manifest.json' });
        archive.finalize();
    });
}

function getLocalHistory(deviceName, limit) {
    if (!fs.existsSync(BACKUP_DIR)) {
        return [];
    }
    return fs.readdirSync(BACKUP_DIR)
        .filter(name => name.startsWith(`shift-backup_${deviceName}_`) && name.endsWith('.zip'))
        .map(name => {
            const fullPath = path.join(BACKUP_DIR, name);
            const stats = fs.statSync(fullPath);
            return {
                name,
                path: fullPath,
                bytes: stats.size,
                modified: stats.mtime.toISOString()
            };
        })
        .sort((a, b) => b.modified.localeCompare(a.modified))
        .slice(0, limit);
}

function formatDateFolderName(date) {
    const pad = value => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function uploadArchiveToDrive(archivePath, archiveName, deviceLabel, timestamp) {
    const baseFolderId = getDriveBaseFolderId();
    if (!baseFolderId) {
        throw new Error('driveBaseFolderId ani driveBaseFolderUrl nejsou nastaveny v local-config.json.');
    }

    const deviceFolder = await ensureSubFolder(baseFolderId, deviceLabel);
    const dateFolder = await ensureSubFolder(deviceFolder.id, formatDateFolderName(timestamp));
    const uploadedFile = await uploadFileToFolder(dateFolder.id, archivePath, {
        name: archiveName,
        mimeType: 'application/zip',
    });

    return {
        baseFolderId,
        deviceFolderId: deviceFolder.id,
        dateFolderId: dateFolder.id,
        file: uploadedFile,
        drivePath: `${deviceFolder.name}/${formatDateFolderName(timestamp)}/${archiveName}`,
    };
}

async function getDriveHistoryForDevice(deviceLabel, limit) {
    try {
        const inventory = await listDriveBackupInventory();
        if (inventory.error) {
            return {
                entries: [],
                error: inventory.error,
                baseFolderUrl: inventory.baseFolderUrl || getDriveBaseFolderUrl(),
            };
        }

        const device = inventory.devices.find(item => item.name === deviceLabel);
        if (!device) {
            return {
                entries: [],
                error: `Slozka pro zarizeni "${deviceLabel}" nebyla nalezena na GDrive.`,
                baseFolderUrl: inventory.baseFolderUrl || getDriveBaseFolderUrl(),
            };
        }

        const entries = [];
        device.dates.forEach(dateGroup => {
            dateGroup.files.forEach(file => {
                entries.push({
                    dateGroup: dateGroup.name,
                    name: file.name,
                    size: file.size,
                    modifiedTime: file.modifiedTime,
                    webViewLink: file.webViewLink,
                    timestamp: file.timestamp,
                });
            });
        });

        entries.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        return {
            entries: entries.slice(0, limit),
            error: null,
            baseFolderUrl: inventory.baseFolderUrl || getDriveBaseFolderUrl(),
        };
    } catch (error) {
        return {
            entries: [],
            error: error && error.message ? error.message : String(error),
            baseFolderUrl: getDriveBaseFolderUrl(),
        };
    }
}


async function createShiftBackup(options = {}) {
    const { skipUpload = false, deviceName } = options;
    const configuredLabel = getConfiguredDeviceName();
    const envDevice = process.env.SHIFT_BACKUP_DEVICE_LABEL || process.env.SHIFT_BACKUP_DEVICE;
    const fallbackLabel = os.hostname();
    const candidateLabel = (deviceName || envDevice || configuredLabel || fallbackLabel).toString().trim();
    const rawDeviceLabel = candidateLabel.length > 0 ? candidateLabel : fallbackLabel;
    const resolvedDevice = sanitizeDeviceName(rawDeviceLabel);

    common.ensureDirectoryExistence(SHIFTS_DIR);
    const shiftFiles = fs.readdirSync(SHIFTS_DIR)
        .filter(name => name.toLowerCase().endsWith('.xml'))
        .sort();

    common.ensureDirectoryExistence(BACKUP_DIR);

    const now = new Date();
    const archiveName = `shift-backup_${resolvedDevice}_${getFileSafeTimestamp(now)}.zip`;
    const archivePath = path.join(BACKUP_DIR, archiveName);
    const manifestContents = buildManifest(shiftFiles, now, { deviceName: resolvedDevice });

    await createArchive(archivePath, manifestContents);

    let destination = null;
    let uploadInfo = null;
    let uploadError = null;
    let uploadErrorCode = null;
    if (!skipUpload) {
        try {
            uploadInfo = await uploadArchiveToDrive(archivePath, archiveName, rawDeviceLabel, now);
            destination = uploadInfo.file && (uploadInfo.file.webViewLink || uploadInfo.file.id) || null;
        } catch (error) {
            uploadErrorCode = error && error.code ? error.code : null;
            if (error && error.code === 'OAUTH_TOKEN_MISSING') {
                uploadError = 'Google Drive neni autorizovan. Dokoncete OAuth prihlaseni.';
            } else if (error && error.code === 'OAUTH_CLIENT_CONFIG_MISSING') {
                uploadError = 'Chybi konfigurace OAuth klienta (service/local-configs/oauth-client.json).';
            } else {
                uploadError = error && error.message ? error.message : String(error);
            }
        }
    }

    const localHistory = getLocalHistory(resolvedDevice, HISTORY_LIMIT);
    let remoteHistory = [];
    let remoteError = uploadError;
    let baseFolderUrl = getDriveBaseFolderUrl();
    if (!skipUpload) {
        const remoteResult = await getDriveHistoryForDevice(rawDeviceLabel, HISTORY_LIMIT);
        remoteHistory = remoteResult.entries;
        if (remoteResult.error) {
            remoteError = remoteError ? `${remoteError}; ${remoteResult.error}` : remoteResult.error;
        }
        baseFolderUrl = remoteResult.baseFolderUrl || baseFolderUrl;
    }

    return {
        archiveName,
        archivePath,
        uploaded: !skipUpload && !uploadError,
        destination,
        fileCount: shiftFiles.length,
        deviceName: resolvedDevice,
        deviceLabel: rawDeviceLabel,
        uploadInfo,
        localHistory,
        remoteHistory,
        remoteError,
        uploadError,
        uploadErrorCode,
        baseFolderUrl,
        skippedUpload: skipUpload
    };
}

async function restoreDataFromBackup(archivePath, options = {}) {
    if (!archivePath || typeof archivePath !== 'string') {
        throw new Error('Cesta k zalohovacimu archivu je povinna.');
    }

    const absoluteArchivePath = path.resolve(archivePath);
    if (!fs.existsSync(absoluteArchivePath)) {
        throw new Error(`Archiv "${absoluteArchivePath}" neexistuje.`);
    }

    const createSafety = options.createSafetyBackup !== false;
    let safetyBackup = null;

    if (createSafety) {
        try {
            safetyBackup = await createShiftBackup({ skipUpload: true, deviceName: options.deviceName });
            console.log(`🔐 Aktualni data zazalohovana do ${safetyBackup.archivePath}`);
        } catch (backupError) {
            console.warn('⚠️ Nepodarilo se vytvorit bezpecnostni zalohu pred obnovou:', backupError.message || backupError);
        }
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posvan-restore-'));
    let safetyDataPath = null;
    let safetyStrategy = null;

    try {
        await extract(absoluteArchivePath, { dir: tempDir });
        const extractedDataRoot = path.join(tempDir, 'data');

        if (!fs.existsSync(extractedDataRoot) || !fs.statSync(extractedDataRoot).isDirectory()) {
            throw new Error('Archiv neobsahuje slozku "data". Obnova prerusena.');
        }

        const parentDir = path.dirname(DATA_DIR);
        safetyDataPath = path.join(parentDir, `data__before_restore_${getFileSafeTimestamp(new Date())}`);

        if (fs.existsSync(DATA_DIR)) {
            try {
                fs.renameSync(DATA_DIR, safetyDataPath);
                safetyStrategy = 'rename';
            } catch (renameError) {
                const transientErrors = ['EPERM', 'EBUSY', 'EACCES'];
                if (transientErrors.includes(renameError.code)) {
                    console.warn('⚠️ Nepodarilo se premést slozku data, provadim kopii:', renameError.message || renameError);
                    fs.mkdirSync(safetyDataPath, { recursive: true });
                    fs.cpSync(DATA_DIR, safetyDataPath, { recursive: true });
                    safetyStrategy = 'copy';
                    try {
                        purgeDirectoryContents(DATA_DIR);
                    } catch (cleanupError) {
                        throw new Error(`Nepodarilo se pripravit cilovou slozku pro obnovu: ${cleanupError.message || cleanupError}`);
                    }
                } else {
                    throw renameError;
                }
            }
        }

        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.cpSync(extractedDataRoot, DATA_DIR, { recursive: true, force: true });

        return {
            success: true,
            restoredAt: new Date().toISOString(),
            sourceArchive: absoluteArchivePath,
            safetyDataPath: safetyStrategy ? safetyDataPath : null,
            safetyBackup,
        };
    } catch (error) {
        if (safetyStrategy) {
            try {
                if (fs.existsSync(DATA_DIR)) {
                    fs.rmSync(DATA_DIR, { recursive: true, force: true });
                }
                if (safetyStrategy === 'rename') {
                    fs.renameSync(safetyDataPath, DATA_DIR);
                } else if (safetyStrategy === 'copy') {
                    fs.mkdirSync(DATA_DIR, { recursive: true });
                    fs.cpSync(safetyDataPath, DATA_DIR, { recursive: true, force: true });
                }
                console.warn('⚠️ Obnova selhala, puvodni data byla obnovena z docasne slozky.');
            } catch (restoreError) {
                console.error('❌ Nepodarilo se vratit puvodni data po chybe obnovy:', restoreError);
            }
        }

        throw error;
    } finally {
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (cleanupError) {
            console.warn('⚠️ Nepodarilo se odstranit docasnou slozku obnovy:', cleanupError.message || cleanupError);
        }
    }
}

function getLocalBackupInventory() {
    if (!fs.existsSync(BACKUP_DIR)) {
        return [];
    }

    return fs.readdirSync(BACKUP_DIR)
        .filter(name => name.toLowerCase().endsWith('.zip'))
        .map(name => {
            const fullPath = path.join(BACKUP_DIR, name);
            const stats = fs.statSync(fullPath);
            const match = name.match(/^shift-backup_([a-z0-9_-]+)_(\d{8}-\d{6})\.zip$/i) || [];
            const deviceLabel = match[1] ? match[1] : 'nezname';
            const createdToken = match[2] ? match[2] : null;
            return {
                name,
                path: fullPath,
                bytes: stats.size,
                modified: stats.mtime.toISOString(),
                deviceLabel,
                createdToken,
            };
        })
        .sort((a, b) => b.modified.localeCompare(a.modified));
}

async function restoreLocalBackupByName(archiveName, options = {}) {
    if (!archiveName) {
        throw new Error('Nazev lokalni zalohy je povinny.');
    }

    const safeName = path.basename(archiveName);
    const archivePath = path.join(BACKUP_DIR, safeName);

    if (!fs.existsSync(archivePath)) {
        throw new Error(`Soubor ${safeName} nebyl nalezen v slozce zaloh.`);
    }

    const result = await restoreDataFromBackup(archivePath, options);
    return {
        ...result,
        sourceArchive: archivePath,
        sourceType: 'local',
    };
}

async function restoreDataFromDrive(fileId, options = {}) {
    if (!fileId) {
        throw new Error('FileId je povinne pro obnovu ze vzdalenych zaloh.');
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posvan-drive-restore-'));
    const fileName = options.fileName || `${fileId}.zip`;
    const downloadPath = path.join(tempDir, fileName);

    try {
        await downloadFileById(fileId, downloadPath);
        const result = await restoreDataFromBackup(downloadPath, options);
        return {
            ...result,
            sourceArchive: fileId,
            downloadedArchive: downloadPath,
            sourceType: 'drive',
        };
    } finally {
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (cleanupError) {
            console.warn('⚠️ Nepodarilo se odstranit docasna data stazene zalohy:', cleanupError.message || cleanupError);
        }
    }
}

if (require.main === module) {
    (async () => {
        const args = process.argv.slice(2);

        const getOptionValue = (name) => {
            const withEquals = args.find(arg => arg.startsWith(`${name}=`));
            if (withEquals) {
                return withEquals.substring(`${name}=`.length);
            }
            const index = args.indexOf(name);
            if (index !== -1 && index + 1 < args.length) {
                return args[index + 1];
            }
            return null;
        };

        const restoreArg = getOptionValue('--restore');
        const restoreFlagSupplied = args.some(arg => arg === '--restore' || arg.startsWith('--restore='));
        const deviceArg = getOptionValue('--device');

        if (restoreFlagSupplied && !restoreArg) {
            console.error('❌ Pro parametr --restore je nutne zadat cestu k archivu.');
            process.exitCode = 1;
            return;
        }

        if (restoreArg) {
            try {
                const result = await restoreDataFromBackup(restoreArg, { deviceName: deviceArg });
                console.log(`✅ Data byla obnovena ze souboru: ${result.sourceArchive}`);
                if (result.safetyBackup && result.safetyBackup.archivePath) {
                    console.log(`   Bezpecnostni archiv pred obnovou: ${result.safetyBackup.archivePath}`);
                }
                if (result.safetyDataPath) {
                    console.log(`   Puvodni slozka data byla presunuta do: ${result.safetyDataPath}`);
                }
                console.log('Hotovo.');
            } catch (error) {
                console.error('❌ Obnova ze zalohy selhala:', error.message || error);
                process.exitCode = 1;
            }
            return;
        }

        const skipUpload = args.includes('--local-only');

        try {
            const result = await createShiftBackup({ skipUpload, deviceName: deviceArg });
            console.log(`Zalozni archiv vytvoren: ${result.archivePath}`);
            console.log(`Pouzity nazev zarizeni: ${result.deviceLabel} (slozka), ${result.deviceName} (soubor)`);

            if (result.uploaded) {
                console.log(`Soubor nahran na GDrive: ${result.destination || '(bez odkazu)'}`);
            } else if (result.skippedUpload) {
                console.log('Nahravani bylo preskoceno (--local-only).');
            } else if (result.uploadError) {
                console.log(`Nahravani na GDrive selhalo: ${result.uploadError}`);
            } else {
                console.log('Soubor nebyl nahran na GDrive.');
            }

            if (result.baseFolderUrl) {
                console.log(`Zakladni slozka: ${result.baseFolderUrl}`);
            }

            const localHistory = result.localHistory;
            console.log('Lokalni historie:');
            if (localHistory.length === 0) {
                console.log('  Zadna lokalni historie.');
            } else {
                localHistory.forEach(item => {
                    console.log(`  ${item.modified} | ${item.bytes} B | ${item.name}`);
                });
            }

            console.log('GDrive historie:');
            if (result.remoteError) {
                console.log(`  Nelze nacist GDrive historii: ${result.remoteError}`);
            } else if (result.remoteHistory.length === 0) {
                console.log('  Zadna GDrive historie.');
            } else {
                result.remoteHistory.forEach(item => {
                    const modified = item.modifiedTime || 'nezname';
                    const size = Number.isFinite(item.size) ? `${item.size} B` : 'nezname';
                    console.log(`  ${modified} | ${size} | ${item.dateGroup} | ${item.name}`);
                });
            }
        } catch (error) {
            console.error('Nepodarilo se vytvorit zalohu smen:', error.message || error);
            process.exitCode = 1;
        }
    })();
}

module.exports = {
    createShiftBackup,
    restoreDataFromBackup,
    restoreLocalBackupByName,
    restoreDataFromDrive,
    getLocalBackupInventory,
    getDriveHistoryForDevice,
};
