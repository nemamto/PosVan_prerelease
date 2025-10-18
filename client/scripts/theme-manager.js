/**
 * Theme Manager - Moderní systém pro správu témat
 * Podporuje: light, dark, auto (systémové nastavení)
 */

class ThemeManager {
    constructor() {
        this.themes = ['light', 'dark', 'auto'];
        this.currentTheme = this.getStoredTheme() || 'auto';
        this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        this.toggleElement = null;
        this.toggleOptions = {};
        this.isFallbackToggle = false;
        
        this.init();
    }

    init() {
        // Nastav počáteční téma
        this.applyTheme(this.currentTheme);
        
        // Poslouchej změny systémového tématu
        this.mediaQuery.addEventListener('change', () => {
            if (this.currentTheme === 'auto') {
                this.applyTheme('auto');
            }
        });
        
        // Přidej plynulé přechody po načtení
        setTimeout(() => {
            document.documentElement.classList.add('theme-transition');
            if (!this.toggleElement) {
                this.createFallbackToggle();
            }
        }, 120);
    }

    getStoredTheme() {
        try {
            return localStorage.getItem('pos-theme');
        } catch (e) {
            return null;
        }
    }

    storeTheme(theme) {
        try {
            localStorage.setItem('pos-theme', theme);
        } catch (e) {
            console.warn('Nelze uložit téma do localStorage');
        }
    }

    applyTheme(theme) {
        const html = document.documentElement;
        
        // Odstraň předchozí téma
        html.removeAttribute('data-theme');
        
        switch (theme) {
            case 'light':
                html.setAttribute('data-theme', 'light');
                break;
            case 'dark':
                html.setAttribute('data-theme', 'dark');
                break;
            case 'auto':
                // Pro auto nestavíme data-theme, použije se CSS @media query
                break;
        }
        
        this.currentTheme = theme;
        this.storeTheme(theme);
        this.updateToggleUI();
        
        // Trigger event pro ostatní komponenty
        document.dispatchEvent(new CustomEvent('themeChanged', { 
            detail: { theme: this.currentTheme } 
        }));
    }

    toggleTheme() {
        const currentIndex = this.themes.indexOf(this.currentTheme);
        const nextIndex = (currentIndex + 1) % this.themes.length;
        const nextTheme = this.themes[nextIndex];
        
        this.applyTheme(nextTheme);
    }

    attachToggle(container, options = {}) {
        if (!container) {
            return;
        }

        if (this.toggleElement) {
            this.toggleElement.remove();
            this.toggleElement = null;
        }

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'header-menu-link';
        toggle.setAttribute('data-role', 'theme-toggle');
        toggle.addEventListener('click', () => {
            this.toggleTheme();
            if (typeof options.onToggle === 'function') {
                options.onToggle();
            }
        });

        container.innerHTML = '';
        container.appendChild(toggle);

        this.toggleElement = toggle;
        this.toggleOptions = options;
        this.isFallbackToggle = false;
        this.updateToggleUI();
    }

    createFallbackToggle() {
        if (this.toggleElement) {
            return;
        }

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'theme-toggle-floating';
        toggle.setAttribute('aria-label', 'Přepnout téma');
        toggle.addEventListener('click', () => this.toggleTheme());

        document.body.appendChild(toggle);
        this.toggleElement = toggle;
        this.isFallbackToggle = true;
        this.updateToggleUI();
    }

    updateToggleUI() {
        if (!this.toggleElement) {
            return;
        }

        const icon = this.getToggleIcon();
        const label = this.getThemeDisplayName();

        if (this.isFallbackToggle) {
            this.toggleElement.textContent = icon;
            this.toggleElement.title = `Současné téma: ${label}`;
            this.toggleElement.setAttribute('aria-label', `Změnit téma (${label})`);
        } else {
            this.toggleElement.innerHTML = `
                <span class="header-menu-icon">${icon}</span>
                <span class="header-menu-text">Téma: ${label}</span>
            `;
            this.toggleElement.setAttribute('aria-label', `Změnit téma (${label})`);
            this.toggleElement.setAttribute('title', `Současné téma: ${label}`);
        }
    }

    getToggleIcon() {
        switch (this.currentTheme) {
            case 'light':
                return '☀️'; // Slunce pro světlé téma
            case 'dark':
                return '🌙'; // Měsíc pro tmavé téma
            case 'auto':
                return '⚡'; // Automatické téma
            default:
                return '⚡';
        }
    }

    getThemeDisplayName() {
        switch (this.currentTheme) {
            case 'light':
                return 'Světlé';
            case 'dark':
                return 'Tmavé';
            case 'auto':
                return 'Automatické';
            default:
                return 'Neznámé';
        }
    }

    // Veřejné API
    setTheme(theme) {
        if (this.themes.includes(theme)) {
            this.applyTheme(theme);
        }
    }

    getCurrentTheme() {
        return this.currentTheme;
    }

    getEffectiveTheme() {
        if (this.currentTheme === 'auto') {
            return this.mediaQuery.matches ? 'dark' : 'light';
        }
        return this.currentTheme;
    }
}

// Globální instance
window.themeManager = new ThemeManager();

// Export pro moduly
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ThemeManager;
}

// Přidej funkce do globálního scope pro snadné použití
window.setTheme = (theme) => window.themeManager.setTheme(theme);
window.toggleTheme = () => window.themeManager.toggleTheme();
window.getCurrentTheme = () => window.themeManager.getCurrentTheme();

// Event listener pro kompletní načtení stránky
document.addEventListener('DOMContentLoaded', () => {
    console.log(`🎨 Theme Manager inicializován - téma: ${window.themeManager.getThemeDisplayName()}`);
});