import { serverEndpoint } from './config.js';

const MODAL_ANIMATION_MS = 200;
const BUTTON_VARIANTS = ['primary', 'secondary', 'success', 'warning', 'danger'];
const NAV_LINKS = [
    { key: 'cashier', label: 'Pokladna', href: 'cashier.html' },
    { key: 'inventory', label: 'Sklad', href: 'inventory.html' },
    { key: 'orders', label: 'Historie', href: 'order_management.html' },
    { key: 'accounts', label: 'Účty', href: 'customer_accounts.html' },
    { key: 'shift', label: 'Směna', href: 'shift.html' }
];

function ensureModalOverlay() {
    let overlay = document.getElementById('modal-overlay');

    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'modal-overlay';
        overlay.className = 'modal-overlay';
        overlay.setAttribute('aria-hidden', 'true');
        document.body.appendChild(overlay);
    }

    if (!overlay.querySelector('[data-modal="message"]')) {
        overlay.innerHTML = `
            <div class="modal-content" role="dialog" aria-modal="true">
                <div class="modal-header">
                    <h2 class="modal-title" data-modal="title"></h2>
                </div>
                <div class="modal-body">
                    <div class="modal-message" data-modal="message"></div>
                </div>
                <div class="modal-actions" data-modal="actions">
                    <button type="button" class="btn btn-primary" data-action="confirm">Zavřít</button>
                </div>
            </div>
        `;
    }

    overlay.style.display = 'none';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.dataset.modalSize = overlay.dataset.modalSize || 'md';

    return overlay;
}

function ensureConfirmOverlay() {
    let overlay = document.getElementById('confirm-modal');

    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'confirm-modal';
        overlay.className = 'modal-overlay';
        overlay.setAttribute('aria-hidden', 'true');
        document.body.appendChild(overlay);
    }

    if (!overlay.querySelector('[data-modal="message"]')) {
        overlay.innerHTML = `
            <div class="modal-content" role="dialog" aria-modal="true">
                <div class="modal-header">
                    <h2 class="modal-title" data-modal="title">Potvrzení</h2>
                </div>
                <div class="modal-body">
                    <div class="modal-message" data-modal="message"></div>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" data-action="cancel">Zrušit</button>
                    <button type="button" class="btn btn-primary" data-action="confirm">Potvrdit</button>
                </div>
            </div>
        `;
    }

    overlay.style.display = 'none';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.dataset.modalSize = overlay.dataset.modalSize || 'md';

    return overlay;
}

function openOverlay(overlay) {
    overlay.style.display = 'flex';
    overlay.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => {
        overlay.classList.add('is-visible');
    });
}

function hideOverlay(overlay) {
    overlay.classList.remove('is-visible');
    overlay.setAttribute('aria-hidden', 'true');
    setTimeout(() => {
        overlay.style.display = 'none';
        overlay.classList.remove('modal--error');
        delete overlay.dataset.variant;
        overlay.dataset.modalSize = overlay.dataset.modalSize || 'md';
    }, MODAL_ANIMATION_MS);
}

function applyButtonVariant(button, variant = 'primary') {
    if (!button) {
        return;
    }

    const normalised = BUTTON_VARIANTS.includes(variant) ? variant : 'primary';
    button.classList.add('btn');
    BUTTON_VARIANTS.forEach(v => button.classList.remove(`btn-${v}`));
    button.classList.add(`btn-${normalised}`);
}

function normalizeModalOptions(arg2 = {}, arg3 = {}) {
    let baseOptions = {};

    if (typeof arg2 === 'boolean') {
        baseOptions.isError = arg2;
    } else if (arg2 && typeof arg2 === 'object') {
        baseOptions = { ...arg2 };
    }

    if (arg3 && typeof arg3 === 'object') {
        baseOptions = { ...baseOptions, ...arg3 };
    }

    const isError = Boolean(baseOptions.isError);

    return {
        isError,
        title: baseOptions.title ?? (isError ? 'Chyba' : ''),
        allowHtml: baseOptions.allowHtml !== false,
        confirmText: baseOptions.confirmText ?? 'Zavřít',
        confirmVariant: baseOptions.confirmVariant ?? (isError ? 'danger' : 'primary'),
        showConfirmButton: baseOptions.showConfirmButton !== false,
        closeOnConfirm: baseOptions.closeOnConfirm !== false,
        dismissible: baseOptions.dismissible !== false,
        focusSelector: baseOptions.focusSelector ?? null,
        size: baseOptions.size ?? 'md'
    };
}

function normalizeConfirmOptions(options = {}) {
    const variant = options.variant ?? 'primary';
    return {
        title: options.title ?? 'Potvrzení',
        confirmText: options.confirmText ?? 'Potvrdit',
        cancelText: options.cancelText ?? 'Zrušit',
        allowHtml: options.allowHtml === true,
        variant: BUTTON_VARIANTS.includes(variant) ? variant : 'primary',
        dismissible: options.dismissible !== false,
        focus: options.focus === 'cancel' ? 'cancel' : 'confirm',
        size: options.size ?? 'md'
    };
}

function getCurrentRouteName() {
    const path = window.location.pathname || '';
    const lastSegment = path.split('/').filter(Boolean).pop() || '';
    return lastSegment || 'index.html';
}

function setupHeaderMenu(trigger, dropdown) {
    if (!trigger || !dropdown) {
        return () => {};
    }

    let isOpen = false;

    const menuRoot = dropdown.parentElement || trigger.parentElement;

    const closeMenu = () => {
        if (!isOpen) {
            return;
        }

        isOpen = false;
        trigger.setAttribute('aria-expanded', 'false');
        dropdown.hidden = true;
        dropdown.classList.remove('is-open');
        document.removeEventListener('click', handleDocumentClick);
        document.removeEventListener('keydown', handleKeydown);
    };

    const openMenu = () => {
        if (isOpen) {
            return;
        }

        isOpen = true;
        trigger.setAttribute('aria-expanded', 'true');
        dropdown.hidden = false;
        requestAnimationFrame(() => dropdown.classList.add('is-open'));
        document.addEventListener('click', handleDocumentClick);
        document.addEventListener('keydown', handleKeydown);
    };

    const toggleMenu = () => {
        if (isOpen) {
            closeMenu();
        } else {
            openMenu();
        }
    };

    function handleDocumentClick(event) {
        const target = event.target;
        if (!menuRoot.contains(target)) {
            closeMenu();
        }
    }

    function handleKeydown(event) {
        if (event.key === 'Escape') {
            closeMenu();
            trigger.focus({ preventScroll: true });
        }
    }

    trigger.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleMenu();
    });

    return closeMenu;
}

function renderAppHeader() {
    const header = document.getElementById('app-header') || document.querySelector('header');
    if (!header) {
        return;
    }

    header.classList.add('app-header');
    header.innerHTML = `
        <div class="app-header-inner">
            <nav class="app-nav" aria-label="Hlavní navigace"></nav>
            <div class="app-header-actions">
                <div class="header-menu">
                    <button type="button" class="btn btn-secondary header-menu-trigger" aria-haspopup="true" aria-expanded="false">
                        ☰ Menu
                    </button>
                    <div class="header-menu-dropdown" role="menu" hidden>
                        <div class="header-menu-section">
                            <p class="header-menu-title">Nastavení</p>
                            <div class="header-menu-item" data-theme-toggle-slot></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    const navElement = header.querySelector('.app-nav');
    const currentRoute = getCurrentRouteName();
    const navButtons = [];

    NAV_LINKS.forEach((link) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-secondary app-nav-button';
        button.textContent = link.label;
        button.dataset.href = link.href;

        if (currentRoute === link.href) {
            button.classList.add('is-active');
            button.setAttribute('aria-current', 'page');
        }

        navElement?.appendChild(button);
        navButtons.push(button);
    });

    const trigger = header.querySelector('.header-menu-trigger');
    const dropdown = header.querySelector('.header-menu-dropdown');
    const closeMenu = setupHeaderMenu(trigger, dropdown);

    navButtons.forEach((button) => {
        button.addEventListener('click', () => {
            closeMenu();
            if (button.classList.contains('is-active')) {
                return;
            }
            const targetHref = button.dataset.href;
            if (typeof targetHref === 'string' && targetHref.length > 0) {
                window.location.href = targetHref;
            }
        });
    });

    const themeSlot = dropdown?.querySelector('[data-theme-toggle-slot]');
    if (themeSlot) {
        if (window.themeManager?.attachToggle) {
            window.themeManager.attachToggle(themeSlot, { onToggle: closeMenu });
        } else {
            themeSlot.innerHTML = '';
            const fallback = document.createElement('button');
            fallback.type = 'button';
            fallback.className = 'header-menu-link';
            fallback.textContent = 'Přepnout téma';
            fallback.addEventListener('click', () => {
                if (typeof window.toggleTheme === 'function') {
                    window.toggleTheme();
                }
                closeMenu();
            });
            themeSlot.appendChild(fallback);
        }
    }
}

export function closeModal(targetId = 'modal-overlay', result = false) {
    const overlay = document.getElementById(targetId);
    if (!overlay) {
        console.warn(`Modal '${targetId}' nebyl nalezen.`);
        return;
    }

    if (typeof overlay._activeCleanup === 'function') {
        overlay._activeCleanup(result);
    } else {
        hideOverlay(overlay);
    }
}

export function showModal(message = '', arg2 = {}, arg3 = {}) {
    const options = normalizeModalOptions(arg2, arg3);
    const overlay = ensureModalOverlay();
    const content = overlay.querySelector('.modal-content');
    const header = overlay.querySelector('.modal-header');
    const titleElement = overlay.querySelector('[data-modal="title"]');
    const messageElement = overlay.querySelector('[data-modal="message"]');
    const actionsContainer = overlay.querySelector('[data-modal="actions"]');
    const confirmButton = overlay.querySelector('[data-action="confirm"]');
    const closeButton = overlay.querySelector('[data-action="close"]');

    overlay.dataset.modalSize = options.size;

    if (header && titleElement) {
        if (options.title) {
            header.style.display = '';
            titleElement.textContent = options.title;
        } else {
            header.style.display = 'none';
            titleElement.textContent = '';
        }
    }

    if (messageElement) {
        if (options.allowHtml) {
            messageElement.innerHTML = message ?? '';
        } else {
            messageElement.textContent = message ?? '';
        }
    }

    if (content) {
        content.classList.toggle('modal-content--error', options.isError);
    }

    overlay.classList.toggle('modal--error', options.isError);
    applyButtonVariant(confirmButton, options.confirmVariant);

    if (confirmButton) {
        confirmButton.textContent = options.confirmText;
        confirmButton.style.display = options.showConfirmButton ? '' : 'none';
    }

    if (actionsContainer) {
        actionsContainer.style.display = options.showConfirmButton ? '' : 'none';
    }

    return new Promise((resolve) => {
        function cleanup(result = false) {
            if (closeButton) closeButton.removeEventListener('click', onCloseClick);
            if (confirmButton && options.showConfirmButton) {
                confirmButton.removeEventListener('click', onConfirmClick);
            }
            if (options.dismissible) {
                overlay.removeEventListener('click', onBackdropClick);
                document.removeEventListener('keydown', onKeydownListener);
            }

            overlay._activeCleanup = null;
            hideOverlay(overlay);
            resolve(result);
        }

        function onConfirmClick() {
            if (options.closeOnConfirm) {
                cleanup(true);
            } else {
                resolve(true);
            }
        }

        function onCloseClick() {
            cleanup(false);
        }

        function onBackdropClick(event) {
            if (event.target === overlay) {
                cleanup(false);
            }
        }

        function onKeydownListener(event) {
            if (event.key === 'Escape') {
                cleanup(false);
            }
        }

        if (overlay._activeCleanup) {
            overlay._activeCleanup(false);
        }

        overlay._activeCleanup = cleanup;

        if (closeButton) closeButton.addEventListener('click', onCloseClick);
        if (confirmButton && options.showConfirmButton) {
            confirmButton.addEventListener('click', onConfirmClick);
        }
        if (options.dismissible) {
            overlay.addEventListener('click', onBackdropClick);
            document.addEventListener('keydown', onKeydownListener, { once: true });
        }

        openOverlay(overlay);

        const focusTarget = options.focusSelector
            ? overlay.querySelector(options.focusSelector)
            : (options.showConfirmButton ? confirmButton : closeButton);

        focusTarget?.focus({ preventScroll: true });
    });
}

export function showModalConfirm(message = '', options = {}) {
    const normalised = normalizeConfirmOptions(options);
    const overlay = ensureConfirmOverlay();
    const content = overlay.querySelector('.modal-content');
    const header = overlay.querySelector('.modal-header');
    const titleElement = overlay.querySelector('[data-modal="title"]');
    const messageElement = overlay.querySelector('[data-modal="message"]');
    const confirmButton = overlay.querySelector('[data-action="confirm"]');
    const cancelButton = overlay.querySelector('[data-action="cancel"]');

    overlay.dataset.modalSize = normalised.size;
    overlay.dataset.variant = normalised.variant;

    if (header && titleElement) {
        if (normalised.title) {
            header.style.display = '';
            titleElement.textContent = normalised.title;
        } else {
            header.style.display = 'none';
            titleElement.textContent = '';
        }
    }

    if (messageElement) {
        if (normalised.allowHtml) {
            messageElement.innerHTML = message ?? '';
        } else {
            messageElement.textContent = message ?? '';
        }
    }

    if (content) {
        content.classList.toggle('modal-content--danger', normalised.variant === 'danger');
    }

    applyButtonVariant(confirmButton, normalised.variant);
    applyButtonVariant(cancelButton, 'secondary');

    if (confirmButton) confirmButton.textContent = normalised.confirmText;
    if (cancelButton) cancelButton.textContent = normalised.cancelText;

    return new Promise((resolve) => {
        function cleanup(result = false) {
            if (confirmButton) confirmButton.removeEventListener('click', onConfirmClick);
            if (cancelButton) cancelButton.removeEventListener('click', onCancelClick);
            if (normalised.dismissible) {
                overlay.removeEventListener('click', onBackdropClick);
                document.removeEventListener('keydown', onKeydownListener);
            }

            overlay._activeCleanup = null;
            hideOverlay(overlay);
            resolve(result);
        }

        function onConfirmClick() {
            cleanup(true);
        }

        function onCancelClick() {
            cleanup(false);
        }

        function onBackdropClick(event) {
            if (event.target === overlay) {
                cleanup(false);
            }
        }

        function onKeydownListener(event) {
            if (event.key === 'Escape') {
                cleanup(false);
            }
        }

        if (overlay._activeCleanup) {
            overlay._activeCleanup(false);
        }

        overlay._activeCleanup = cleanup;

        if (confirmButton) confirmButton.addEventListener('click', onConfirmClick);
        if (cancelButton) cancelButton.addEventListener('click', onCancelClick);
        if (normalised.dismissible) {
            overlay.addEventListener('click', onBackdropClick);
            document.addEventListener('keydown', onKeydownListener, { once: true });
        }

        openOverlay(overlay);

        const focusTarget = normalised.focus === 'cancel' ? cancelButton : confirmButton;
        focusTarget?.focus({ preventScroll: true });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    renderAppHeader();
});

export async function checkActiveShift() {
    try {
        const response = await fetch(`${serverEndpoint}/currentShift`);
        if (!response.ok) throw new Error('Chyba při načítání směny.');

        const shiftData = await response.json();
        console.log(`Aktivní směna: ID ${shiftData.shiftID}, Barman: ${shiftData.bartender}`);

        const status = document.getElementById('shiftStatus');
        if (!shiftData.active) {
            if (!status) {
                const newStatus = document.createElement('p');
                newStatus.id = 'shiftStatus';
                newStatus.textContent = 'Žádná aktivní směna!';
                newStatus.style.color = 'red';
                document.body.prepend(newStatus);
            } else {
                status.textContent = 'Žádná aktivní směna!';
                status.style.color = 'red';
            }
        } else if (status) {
            status.remove();
        }
    } catch (error) {
        console.error('Chyba při kontrole směny:', error);
    }
}

export async function getShiftID() {
    try {
        const response = await fetch(`${serverEndpoint}/currentShift`);
        const data = await response.json();
        return data.shiftID || null;
    } catch (error) {
        console.error('Chyba při získávání shiftID:', error);
        return null;
    }
}

export async function checkCurrentShift() {
    try {
        const response = await fetch(`${serverEndpoint}/currentShift`);
        if (!response.ok) throw new Error('Chyba při načítání směny.');
        return await response.json();
    } catch (error) {
        console.error('Chyba při načítání směny:', error);
        return null;
    }
}

