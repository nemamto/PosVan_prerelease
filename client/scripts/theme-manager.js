/**
 * Theme Manager - Moderni system pro spravu temat
 * Podporuje: light, dark, colorful
 */

class ThemeManager {
    constructor() {
        this.themes = ['light', 'dark']; // Odstraneno 'colorful' z běžného menu
        this.allThemes = ['light', 'dark', 'colorful']; // Všechna dostupná témata
        this.themeIcons = {
            'light': '☀️',
            'dark': '🌙',
            'colorful': '🎨'
        };
        this.themeNames = {
            'light': 'Svetle',
            'dark': 'Tmave',
            'colorful': 'Barevne'
        };
        this.currentTheme = this.getStoredTheme() || 'dark';
        this.toggleElement = null;
        this.toggleOptions = {};
        this.isFallbackToggle = false;
        this.colorfulUnlocked = this.getColorfulUnlocked();
        
        this.init();
    }

    init() {
        // Colorful se NIKDY nepřidává do menu (this.themes)
        // Zůstává pouze v allThemes pro přímou aktivaci
        
        // Nastav pocatecni tema
        this.applyTheme(this.currentTheme);
        
        // Pridej plynule prechody po nacteni
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
            console.warn('Nelze ulozit tema do localStorage');
        }
    }

    getColorfulUnlocked() {
        try {
            return localStorage.getItem('pos-colorful-unlocked') === 'true';
        } catch (e) {
            return false;
        }
    }

    unlockColorful() {
        try {
            localStorage.setItem('pos-colorful-unlocked', 'true');
            this.colorfulUnlocked = true;
            
            // NEPŘIDÁVEJ colorful do this.themes - zůstane skryté v menu
            
            // Trigger event
            document.dispatchEvent(new CustomEvent('colorfulUnlocked'));
            
            return true;
        } catch (e) {
            return false;
        }
    }

    applyTheme(theme) {
        const html = document.documentElement;
        
        // Nastav tema jako data-theme atribut
        html.setAttribute('data-theme', theme);
        
        this.currentTheme = theme;
        this.storeTheme(theme);
        this.updateToggleUI();
        
        // Trigger event pro ostatni komponenty
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

        const icon = this.themeIcons[this.currentTheme];
        const label = this.themeNames[this.currentTheme];

        if (this.isFallbackToggle) {
            this.toggleElement.textContent = icon;
            this.toggleElement.title = `Soucasne tema: ${label}`;
            this.toggleElement.setAttribute('aria-label', `Zmenit tema (${label})`);
        } else {
            this.toggleElement.innerHTML = `
                <span class="header-menu-icon">${icon}</span>
                <span class="header-menu-text">Tema: ${label}</span>
            `;
            this.toggleElement.setAttribute('aria-label', `Zmenit tema (${label})`);
            this.toggleElement.setAttribute('title', `Soucasne tema: ${label}`);
        }
    }

    // Verejne API
    setTheme(theme) {
        // Kontroluj proti všem dostupným tématům, ne jen těm v menu
        if (this.allThemes.includes(theme)) {
            this.applyTheme(theme);
        } else {
            console.warn(`Téma "${theme}" neexistuje. Dostupná témata:`, this.allThemes);
        }
    }

    getCurrentTheme() {
        return this.currentTheme;
    }
}

// Globalni instance
window.themeManager = new ThemeManager();

// Export pro moduly
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ThemeManager;
}

// Pridej funkce do globalniho scope pro snadne pouziti
window.setTheme = (theme) => window.themeManager.setTheme(theme);
window.toggleTheme = () => window.themeManager.toggleTheme();
window.getCurrentTheme = () => window.themeManager.getCurrentTheme();

// Event listener pro kompletni nacteni stranky
document.addEventListener('DOMContentLoaded', () => {
    console.log(`🎨 Theme Manager inicializovan - tema: ${window.themeManager.themeNames[window.themeManager.currentTheme]}`);
});