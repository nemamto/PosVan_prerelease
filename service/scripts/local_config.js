const fs = require('fs');
const path = require('path');

const CONFIG_ROOT = path.join(__dirname, '..', 'local-configs');
const PRIMARY_CONFIG_PATH = path.join(CONFIG_ROOT, 'local-config.json');
const LEGACY_CONFIG_PATH = path.join(__dirname, '..', 'local-config.json');

let cachedConfig = null;
let resolvedConfigPath = null;
let legacyWarningShown = false;

function resolveConfigPath() {
    if (resolvedConfigPath) {
        return resolvedConfigPath;
    }

    if (fs.existsSync(PRIMARY_CONFIG_PATH)) {
        resolvedConfigPath = PRIMARY_CONFIG_PATH;
        return resolvedConfigPath;
    }

    if (fs.existsSync(LEGACY_CONFIG_PATH)) {
        resolvedConfigPath = LEGACY_CONFIG_PATH;
        if (!legacyWarningShown) {
            console.warn('Presunte prosim service/local-config.json do service/local-configs/local-config.json.');
            legacyWarningShown = true;
        }
        return resolvedConfigPath;
    }

    resolvedConfigPath = PRIMARY_CONFIG_PATH;
    return resolvedConfigPath;
}

function loadLocalConfig() {
    if (cachedConfig !== null) {
        return cachedConfig;
    }

    try {
        const raw = fs.readFileSync(resolveConfigPath(), 'utf8');
        const parsed = JSON.parse(raw);
        cachedConfig = parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
        cachedConfig = {};
    }

    return cachedConfig;
}

function getLocalConfigValue(key, fallback = undefined) {
    const config = loadLocalConfig();
    if (config && Object.prototype.hasOwnProperty.call(config, key)) {
        return config[key];
    }
    return fallback;
}

function getDriveBaseFolderUrl() {
    const value = getLocalConfigValue('driveBaseFolderUrl', null);
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function extractFolderIdFromUrl(url) {
    if (typeof url !== 'string') {
        return null;
    }
    const match = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
}

function getDriveBaseFolderId() {
    const explicit = getLocalConfigValue('driveBaseFolderId', null);
    if (typeof explicit === 'string' && explicit.trim().length > 0) {
        return explicit.trim();
    }
    const url = getDriveBaseFolderUrl();
    return extractFolderIdFromUrl(url);
}

function getConfiguredDeviceName() {
    const value = getLocalConfigValue('deviceName', null);
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

module.exports = {
    loadLocalConfig,
    getLocalConfigValue,
    getDriveBaseFolderUrl,
    getDriveBaseFolderId,
    getConfiguredDeviceName,
    extractFolderIdFromUrl,
    resolveConfigPath,
    CONFIG_ROOT,
};
