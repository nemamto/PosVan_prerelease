import { serverEndpoint } from './config.js';

const baseLinkEl = document.getElementById('gdrive-base-link');
const statusEl = document.getElementById('gdrive-status');
const listEl = document.getElementById('gdrive-list');
const actionsEl = document.getElementById('gdrive-actions');
const headerEl = document.querySelector('.card-header');

function setStatus(message, variant = 'info') {
    if (!statusEl) {
        return;
    }

    const hasMessage = Boolean(message && message.trim().length > 0);
    statusEl.textContent = hasMessage ? message : '';
    statusEl.dataset.variant = hasMessage ? variant : 'info';
    statusEl.hidden = !hasMessage;
}

function consumeAuthSuccessFlag() {
    try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('auth') === 'success') {
            setStatus('Autorizace dokončena, načítám seznam záloh...', 'success');
            params.delete('auth');
            const next = params.toString();
            const target = next ? `${window.location.pathname}?${next}` : window.location.pathname;
            window.history.replaceState({}, document.title, target);
        }
    } catch (error) {
        console.warn('Nelze analyzovat parametry URL:', error);
    }
}

function formatBytes(bytes) {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value <= 0) {
        return '0 B';
    }
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const base = Math.floor(Math.log(value) / Math.log(1024));
    const size = value / Math.pow(1024, Math.min(base, units.length - 1));
    return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[Math.min(base, units.length - 1)]}`;
}

function formatDateTime(value) {
    if (!value) {
        return 'nezname';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return 'nezname';
    }
    return date.toLocaleString();
}

let restoreInProgress = false;

function confirmRestoreAction(archiveName, origin = 'drive') {
    const label = origin === 'local'
        ? `Obnovit data z lokalni zalohy "${archiveName}"?`
        : `Obnovit data ze zalohy "${archiveName}"?`;
    return window.confirm(`${label} Aktualni obsah slozky data bude nahrazen. Pred obnovou se vytvori bezpecnostni kopie.`);
}

function renderInventory(data) {
    if (!listEl) {
        return;
    }

    listEl.innerHTML = '';

    const devices = Array.isArray(data && data.devices) ? data.devices : [];
    const localBackups = Array.isArray(data && data.localBackups) ? data.localBackups : [];

    let rendered = false;

    if (devices.length > 0) {
        renderRemoteDevices(devices);
        rendered = true;
    }

    if (localBackups.length > 0) {
        renderLocalBackups(localBackups);
        rendered = true;
    }

    if (!rendered) {
        listEl.textContent = 'Zadne zaznamy k zobrazeni.';
    }
}

function renderRemoteDevices(devices) {
    devices.forEach(device => {
        const deviceSection = document.createElement('section');
        deviceSection.className = 'backup-device card__section';

        const deviceHeader = document.createElement('div');
        deviceHeader.className = 'backup-device-header';

        const title = document.createElement('h3');
        title.className = 'backup-device-title';
        title.textContent = device.name;

        const meta = document.createElement('p');
        meta.className = 'backup-device-meta';
        const totalSize = formatBytes(device.totalBytes);
        meta.textContent = `Souboru: ${device.totalFiles} | Celkem: ${totalSize}`;

        deviceHeader.appendChild(title);
        deviceHeader.appendChild(meta);
        deviceSection.appendChild(deviceHeader);

        if (!Array.isArray(device.dates) || device.dates.length === 0) {
            const emptyMessage = document.createElement('p');
            emptyMessage.textContent = 'Zadne zaznamy pro toto zarizeni.';
            deviceSection.appendChild(emptyMessage);
        } else {
            device.dates.forEach((group, index) => {
                const details = document.createElement('details');
                details.className = 'backup-group';
                if (index === 0) {
                    details.open = true;
                }

                const summary = document.createElement('summary');
                summary.className = 'backup-group-summary';
                const label = group.name || 'nezname';
                summary.textContent = `${label} (${Array.isArray(group.files) ? group.files.length : 0})`;
                details.appendChild(summary);

                const list = document.createElement('ul');
                list.className = 'backup-items';

                (group.files || []).forEach(item => {
                    const listItem = document.createElement('li');
                    listItem.className = 'backup-item';

                    const name = document.createElement('span');
                    name.className = 'backup-item-name';
                    name.textContent = item.name;

                    const info = document.createElement('span');
                    info.className = 'backup-item-info';
                    const sizeLabel = formatBytes(item.size);
                    const updatedLabel = formatDateTime(item.modifiedTime);
                    info.textContent = `${sizeLabel} | ${updatedLabel}`;

                    const path = document.createElement('div');
                    path.className = 'backup-item-path';
                    const fileId = item.fileId || item.id;
                    if (item.webViewLink) {
                        const link = document.createElement('a');
                        link.href = item.webViewLink;
                        link.target = '_blank';
                        link.rel = 'noreferrer noopener';
                        link.textContent = 'Otevrit na GDrive';
                        path.appendChild(link);
                    }

                    if (fileId) {
                        const code = document.createElement('code');
                        code.textContent = fileId;
                        path.appendChild(code);
                    }

                    const restoreButton = document.createElement('button');
                    restoreButton.type = 'button';
                    restoreButton.className = 'btn btn-secondary btn-sm';
                    restoreButton.textContent = 'Obnovit data';
                    restoreButton.addEventListener('click', () => {
                        if (!confirmRestoreAction(item.name, 'drive')) {
                            return;
                        }
                        restoreBackup({
                            sourceType: 'drive',
                            fileId,
                            fileName: item.name,
                            deviceLabel: device.name,
                            dateGroup: group.name,
                        }, restoreButton);
                    });
                    path.appendChild(restoreButton);

                    listItem.appendChild(name);
                    listItem.appendChild(info);
                    listItem.appendChild(path);
                    list.appendChild(listItem);
                });

                details.appendChild(list);
                deviceSection.appendChild(details);
            });
        }

        listEl.appendChild(deviceSection);
    });
}

function renderLocalBackups(backups) {
    const section = document.createElement('section');
    section.className = 'backup-device card__section';

    const header = document.createElement('div');
    header.className = 'backup-device-header';

    const title = document.createElement('h3');
    title.className = 'backup-device-title';
    title.textContent = 'Lokalni zalohy';

    const meta = document.createElement('p');
    meta.className = 'backup-device-meta';
    meta.textContent = `K dispozici: ${backups.length}`;

    header.appendChild(title);
    header.appendChild(meta);
    section.appendChild(header);

    const list = document.createElement('ul');
    list.className = 'backup-items';

    backups.forEach(item => {
        const listItem = document.createElement('li');
        listItem.className = 'backup-item';

        const name = document.createElement('span');
        name.className = 'backup-item-name';
        name.textContent = item.name;

        const info = document.createElement('span');
        info.className = 'backup-item-info';
        const sizeLabel = formatBytes(item.bytes);
        const modifiedLabel = formatDateTime(item.modified);
        info.textContent = `${sizeLabel} | ${modifiedLabel}`;

        const path = document.createElement('div');
        path.className = 'backup-item-path';
        const code = document.createElement('code');
        code.textContent = item.path;
        path.appendChild(code);

        const restoreButton = document.createElement('button');
        restoreButton.type = 'button';
        restoreButton.className = 'btn btn-primary btn-sm';
        restoreButton.textContent = 'Obnovit tuto kopii';
        restoreButton.addEventListener('click', () => {
            if (!confirmRestoreAction(item.name, 'local')) {
                return;
            }
            restoreBackup({
                sourceType: 'local',
                fileName: item.name,
            }, restoreButton);
        });
        path.appendChild(restoreButton);

        listItem.appendChild(name);
        listItem.appendChild(info);
        listItem.appendChild(path);
        list.appendChild(listItem);
    });

    section.appendChild(list);
    listEl.appendChild(section);
}

function renderBaseLink(url) {
    if (!baseLinkEl) {
        return;
    }

    baseLinkEl.innerHTML = '';

    if (!url) {
        baseLinkEl.hidden = true;
        return;
    }

    baseLinkEl.hidden = false;

    const info = document.createElement('p');
    info.className = 'backup-base-info';

    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noreferrer noopener';
    link.textContent = 'Otevrit slozku na GDrive';

    info.appendChild(link);
    baseLinkEl.appendChild(info);
}

function clearActions() {
    if (!actionsEl) {
        return;
    }
    actionsEl.innerHTML = '';
    actionsEl.hidden = true;
}

function handleAuthStart(event) {
    const trigger = event.currentTarget;
    if (!trigger) {
        return;
    }

    trigger.disabled = true;
    setStatus('Oteviram autorizaci...', 'info');

    fetch(`${serverEndpoint}/gdrive/oauth/url`)
        .then(async (response) => {
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload.message || `Server vratil chybu ${response.status}`);
            }

            if (payload.authUrl) {
                window.open(payload.authUrl, '_blank', 'noopener');
                setStatus('V prohlizeci otevri nove okno, povol pristup a vloz kod do formulare nize.', 'info');
            } else {
                setStatus('Server neposkytl autorizacni odkaz.', 'warning');
            }
        })
        .catch((error) => {
            setStatus(`Nepodarilo se ziskat autorizacni odkaz: ${error.message}`, 'error');
        })
        .finally(() => {
            trigger.disabled = false;
        });
}

async function handleAuthComplete(event) {
    event.preventDefault();
    if (!actionsEl) {
        return;
    }

    const form = event.currentTarget;
    const codeInput = form.querySelector('[data-auth-code]');
    const submitButton = form.querySelector('[data-action="auth-complete"]');

    if (!codeInput || !submitButton) {
        return;
    }

    const code = codeInput.value.trim();
    if (!code) {
        codeInput.focus();
        return;
    }

    submitButton.disabled = true;
    codeInput.disabled = true;
    setStatus('Dokoncuji autorizaci...', 'info');

    try {
        const response = await fetch(`${serverEndpoint}/gdrive/oauth/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.message || `Server vratil chybu ${response.status}`);
        }

        form.reset();
        setStatus('Autorizace dokoncena. Obnovuji data...', 'info');
        await loadInventory();
    } catch (error) {
        setStatus(`Autorizaci se nepodarilo dokoncit: ${error.message}`, 'error');
    } finally {
        submitButton.disabled = false;
        codeInput.disabled = false;
    }
}

function renderAuthPrompt(payload = {}) {
    if (!actionsEl) {
        return;
    }

    actionsEl.innerHTML = '';
    actionsEl.hidden = false;

    const info = document.createElement('p');
    info.className = 'backup-auth-info';
    info.textContent = payload.missingClient
        ? 'Chybi konfigurace OAuth klienta. Vytvorte oauth-client.json v service/local-configs/.'
        : 'Pro nahravani zaloh se nejprve prihlas ke svemu Google uctu.';
    actionsEl.appendChild(info);

    if (payload.missingClient) {
        const hint = document.createElement('p');
        hint.className = 'backup-auth-hint';
        hint.textContent = 'Stahnete OAuth Client (Desktop app) v Google Cloud Console a ulozte ho jako oauth-client.json do service/local-configs/.';
        actionsEl.appendChild(hint);
        return;
    }

    const actionsRow = document.createElement('div');
    actionsRow.className = 'backup-auth-actions';

    const startButton = document.createElement('button');
    startButton.type = 'button';
    startButton.className = 'btn btn-primary';
    startButton.dataset.action = 'auth-start';
    startButton.textContent = 'Otevrit autorizaci Google';
    startButton.addEventListener('click', handleAuthStart);

    actionsRow.appendChild(startButton);
    actionsEl.appendChild(actionsRow);

    const helper = document.createElement('p');
    helper.className = 'backup-auth-hint';
    helper.textContent = 'Po potvrzeni pristupu zkopirujte kod z Google a vlozte jej do formulare nize.';
    actionsEl.appendChild(helper);

    const form = document.createElement('form');
    form.className = 'backup-auth-form';

    const label = document.createElement('label');
    label.setAttribute('for', 'gdrive-auth-code');
    label.textContent = 'Overovaci kod';

    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'gdrive-auth-code';
    input.name = 'code';
    input.required = true;
    input.placeholder = 'vlozte kod z Google';
    input.className = 'form-input';
    input.dataset.authCode = 'true';

    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'btn btn-secondary';
    submit.dataset.action = 'auth-complete';
    submit.textContent = 'Dokoncit autorizaci';

    form.append(label, input, submit);
    form.addEventListener('submit', handleAuthComplete);

    actionsEl.appendChild(form);
}

async function restoreBackup(payload, triggerButton) {
    if (!payload || typeof payload !== 'object') {
        return;
    }

    if (restoreInProgress) {
        setStatus('Jina obnova prave probiha. Pockej na jeji dokonceni.', 'warning');
        return;
    }

    restoreInProgress = true;
    if (triggerButton) {
        triggerButton.disabled = true;
    }

    const label = payload.fileName || (payload.sourceType === 'drive' ? payload.fileId : 'zaloha');
    setStatus(`Obnovuji data ze zalohy ${label}...`, 'info');

    try {
        const response = await fetch(`${serverEndpoint}/gdrive/backups/restore`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(result.message || `Server vratil chybu ${response.status}`);
        }

        await loadInventory();
        const restoredLabel = result.restoredAt ? formatDateTime(result.restoredAt) : 'nyní';
        let message = `Obnova dokončena (${restoredLabel}).`;
        if (result.safetyDataPath) {
            message += ` Puvodni data najdes v ${result.safetyDataPath}.`;
        }
        setStatus(message, 'success');
    } catch (error) {
        setStatus(`Obnova selhala: ${error.message}`, 'error');
    } finally {
        restoreInProgress = false;
        if (triggerButton) {
            triggerButton.disabled = false;
        }
    }
}

async function loadInventory() {
    setStatus('Nacitani dat...', 'info');
    if (listEl) {
        listEl.innerHTML = '';
    }
    clearActions();

    try {
        const response = await fetch(`${serverEndpoint}/gdrive/backups`);
        if (!response.ok) {
            throw new Error(`Server vratil chybu ${response.status}`);
        }
        const payload = await response.json();

        renderBaseLink(payload.baseFolderUrl);
        renderInventory(payload);

        if (payload.needsAuth) {
            const variant = payload.missingClient ? 'error' : 'warning';
            const message = payload.message || 'Google Drive neni autorizovan.';
            setStatus(message, variant);
            renderAuthPrompt(payload);
            return;
        }

        clearActions();

        if (payload.error) {
            setStatus(`Nelze nacist GDrive data: ${payload.error}`, 'warning');
        } else {
            setStatus('');
        }
    } catch (error) {
        setStatus(`Chyba pri nacitani: ${error.message}`, 'error');
        renderBaseLink(null);
    }
}

function init() {
    consumeAuthSuccessFlag();

    if (headerEl) {
        const refreshButton = document.createElement('button');
        refreshButton.type = 'button';
        refreshButton.className = 'btn btn-secondary';
        refreshButton.textContent = 'Obnovit';
        refreshButton.addEventListener('click', () => {
            loadInventory();
        });
        headerEl.appendChild(refreshButton);
    }

    loadInventory();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
    init();
}
