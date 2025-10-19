const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const CONFIG_ROOT = path.join(__dirname, '..', 'local-configs');
const OAUTH_CLIENT_PATH = path.join(CONFIG_ROOT, 'oauth-client.json');
const OAUTH_TOKEN_PATH = path.join(CONFIG_ROOT, 'oauth-token.json');

class OAuthTokenMissingError extends Error {
    constructor() {
        super('OAuth token chybi. Dokoncete autorizaci.');
        this.name = 'OAuthTokenMissingError';
        this.code = 'OAUTH_TOKEN_MISSING';
    }
}

class OAuthClientConfigMissingError extends Error {
    constructor() {
        super('Nenalezen soubor service/local-configs/oauth-client.json.');
        this.name = 'OAuthClientConfigMissingError';
        this.code = 'OAUTH_CLIENT_CONFIG_MISSING';
    }
}

let driveClient = null;
let oauthClient = null;
let cachedTokens; // undefined until first read
let cachedClientDefinition = null;

function ensureConfigDirectory() {
    if (!fs.existsSync(CONFIG_ROOT)) {
        fs.mkdirSync(CONFIG_ROOT, { recursive: true });
    }
}

function readJsonFile(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadOAuthClientDefinition() {
    if (cachedClientDefinition) {
        return cachedClientDefinition;
    }

    if (!fs.existsSync(OAUTH_CLIENT_PATH)) {
        throw new OAuthClientConfigMissingError();
    }

    const raw = readJsonFile(OAUTH_CLIENT_PATH);
    const definition = raw.installed || raw.web;
    if (!definition || !definition.client_id || !definition.client_secret) {
        throw new OAuthClientConfigMissingError();
    }

    cachedClientDefinition = definition;
    return cachedClientDefinition;
}

function loadStoredTokens() {
    if (cachedTokens !== undefined) {
        return cachedTokens;
    }

    if (!fs.existsSync(OAUTH_TOKEN_PATH)) {
        cachedTokens = null;
        return cachedTokens;
    }

    cachedTokens = readJsonFile(OAUTH_TOKEN_PATH);
    return cachedTokens;
}

function persistTokens(update) {
    ensureConfigDirectory();
    const base = loadStoredTokens() || {};
    cachedTokens = { ...base, ...update };
    fs.writeFileSync(OAUTH_TOKEN_PATH, JSON.stringify(cachedTokens, null, 2));
    driveClient = null; // reset cached client so new credentials are used
}

function hasStoredTokens() {
    return Boolean(loadStoredTokens());
}

function getOrCreateOAuthClient() {
    if (oauthClient) {
        return oauthClient;
    }

    const definition = loadOAuthClientDefinition();
    const redirectUri = Array.isArray(definition.redirect_uris) && definition.redirect_uris.length > 0
        ? definition.redirect_uris[0]
        : undefined;

    oauthClient = new google.auth.OAuth2(
        definition.client_id,
        definition.client_secret,
        redirectUri
    );

    oauthClient.on('tokens', (freshTokens) => {
        if (freshTokens && (freshTokens.access_token || freshTokens.refresh_token)) {
            persistTokens(freshTokens);
        }
    });

    return oauthClient;
}

function getAuthenticatedOAuthClient() {
    const client = getOrCreateOAuthClient();
    const tokens = loadStoredTokens();
    if (!tokens) {
        throw new OAuthTokenMissingError();
    }

    client.setCredentials(tokens);
    return client;
}

function generateAuthUrl(scopes = ['https://www.googleapis.com/auth/drive']) {
    const client = getOrCreateOAuthClient();
    return client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: scopes,
    });
}

async function completeOAuthWithCode(code) {
    if (!code || !code.trim()) {
        throw new Error('Chybi overovaci kod.');
    }

    const client = getOrCreateOAuthClient();
    const tokenResponse = await client.getToken(code.trim());
    client.setCredentials(tokenResponse.tokens);
    persistTokens(tokenResponse.tokens);
    return tokenResponse.tokens;
}

async function getDriveClient() {
    if (driveClient) {
        return driveClient;
    }

    const authClient = getAuthenticatedOAuthClient();
    driveClient = google.drive({ version: 'v3', auth: authClient });
    return driveClient;
}

async function listFolderItems(folderId, options = {}) {
    if (!folderId) {
        throw new Error('FolderId je povinne.');
    }

    const drive = await getDriveClient();
    const items = [];
    let pageToken = null;

    do {
        const includeShared = options && Object.prototype.hasOwnProperty.call(options, 'includeSharedDrives')
            ? Boolean(options.includeSharedDrives)
            : true;

        const response = await drive.files.list({
            q: `'${folderId}' in parents and trashed = false`,
            fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, webViewLink)',
            orderBy: options.orderBy || 'name_natural',
            pageSize: options.pageSize || 100,
            pageToken,
            includeItemsFromAllDrives: includeShared,
            supportsAllDrives: includeShared,
        });

        if (Array.isArray(response.data.files)) {
            items.push(...response.data.files);
        }
        pageToken = response.data.nextPageToken || null;
    } while (pageToken);

    return items;
}

async function ensureSubFolder(parentId, folderName) {
    if (!parentId) {
        throw new Error('ParentId je povinne.');
    }
    if (!folderName || !folderName.trim()) {
        throw new Error('Nazev slozky je povinny.');
    }

    const drive = await getDriveClient();
    const trimmed = folderName.trim();

    const search = await drive.files.list({
        q: `'${parentId}' in parents and trashed = false and name = '${trimmed.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder'`,
        fields: 'files(id, name)',
        pageSize: 1,
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
    });

    if (Array.isArray(search.data.files) && search.data.files.length > 0) {
        return search.data.files[0];
    }

    const response = await drive.files.create({
        requestBody: {
            name: trimmed,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId],
        },
        fields: 'id, name',
        supportsAllDrives: true,
    });

    return response.data;
}

async function uploadFileToFolder(folderId, filePath, options = {}) {
    if (!folderId) {
        throw new Error('FolderId je povinne.');
    }
    if (!filePath || !fs.existsSync(filePath)) {
        throw new Error('Soubor pro nahrani neexistuje.');
    }

    const drive = await getDriveClient();
    const fileName = options.name || path.basename(filePath);

    const fileMetadata = {
        name: fileName,
        parents: [folderId],
    };

    const media = {
        mimeType: options.mimeType || 'application/zip',
        body: fs.createReadStream(filePath),
    };

    const response = await drive.files.create({
        requestBody: fileMetadata,
        media,
        fields: 'id, name, mimeType, size, modifiedTime, webViewLink',
        supportsAllDrives: true,
    });

    return response.data;
}

async function downloadFileById(fileId, destinationPath, options = {}) {
    if (!fileId) {
        throw new Error('FileId je povinne.');
    }
    if (!destinationPath) {
        throw new Error('Cilova cesta je povinna.');
    }

    const drive = await getDriveClient();
    const resolvedPath = path.resolve(destinationPath);
    const directory = path.dirname(resolvedPath);
    if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
    }

    const response = await drive.files.get(
        {
            fileId,
            alt: 'media',
            supportsAllDrives: options.supportsAllDrives !== false,
        },
        { responseType: 'stream' }
    );

    await new Promise((resolve, reject) => {
        const stream = fs.createWriteStream(resolvedPath);
        response.data
            .on('end', resolve)
            .on('error', reject)
            .pipe(stream);
    });

    return resolvedPath;
}

module.exports = {
    getDriveClient,
    listFolderItems,
    ensureSubFolder,
    uploadFileToFolder,
    downloadFileById,
    generateAuthUrl,
    completeOAuthWithCode,
    hasStoredTokens,
    OAuthTokenMissingError,
    OAuthClientConfigMissingError,
    CONFIG_ROOT,
    OAUTH_CLIENT_PATH,
    OAUTH_TOKEN_PATH,
};
