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
    
    // Inicializuj trippy efekty
    initTrippyEffects();
});

// ========================== //
//    TRIPPY CLICK EFFECTS    //
// ========================== //

function initTrippyEffects() {
    // Vytvoř kontejner pro efekty
    let effectsContainer = document.getElementById('trippy-effects-container');
    if (!effectsContainer) {
        effectsContainer = document.createElement('div');
        effectsContainer.id = 'trippy-effects-container';
        effectsContainer.className = 'trippy-effects-container';
        document.body.appendChild(effectsContainer);
    }

    // Rainbow barvy - OPTIMALIZOVÁNO: méně barev = lepší výkon
    const rainbowColors = [
        '#ff0080', '#ff0000', '#ff8000', '#ffff00',
        '#00ff00', '#00ffff', '#0000ff', '#ff00ff'
    ];

    let colorIndex = 0;

    // Click/Touch event pro trippy efekty - OPTIMALIZOVÁNO!
    const handleTouchEffect = (e) => {
        // Pouze pro colorful téma
        if (document.documentElement.getAttribute('data-theme') !== 'colorful') {
            return;
        }

        const x = e.clientX || (e.touches && e.touches[0].clientX);
        const y = e.clientY || (e.touches && e.touches[0].clientY);
        
        if (!x || !y) return;

        const color = rainbowColors[colorIndex % rainbowColors.length];
        colorIndex++;

        // Místo 8 vln jen 4 - stále efektní ale rychlejší
        for (let i = 0; i < 4; i++) {
            setTimeout(() => {
                const waveColor = rainbowColors[(colorIndex + i * 2) % rainbowColors.length];
                createRipple(x, y, waveColor, effectsContainer);
            }, i * 60);
        }

        // 30 částic letící DÁLE - výraznější efekt
        for (let i = 0; i < 30; i++) {
            const angle = (i / 30) * Math.PI * 2;
            const distance = 200 + Math.random() * 250; // VĚTŠÍ VZDÁLENOST
            const particleColor = rainbowColors[(colorIndex + i) % rainbowColors.length];
            createParticle(x, y, angle, distance, particleColor, effectsContainer);
        }

        // Flash efekt - MENŠÍ, jen lehký
        createFlash(x, y, color, effectsContainer);
    };

    document.addEventListener('click', handleTouchEffect);
    document.addEventListener('touchstart', handleTouchEffect);

    // TRAIL ZA KURZOREM ODSTRANĚN - nepotřebný pro dotykové ovládání
}

function createRipple(x, y, color, container) {
    const ripple = document.createElement('div');
    ripple.className = 'trippy-ripple';
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    ripple.style.borderColor = color;
    ripple.style.borderWidth = `${4 + Math.random() * 6}px`;
    ripple.style.width = '80px';
    ripple.style.height = '80px';
    ripple.style.boxShadow = `0 0 50px 10px ${color}, inset 0 0 50px 10px ${color}`;
    
    container.appendChild(ripple);

    // Odstraň po dokončení animace
    setTimeout(() => {
        ripple.remove();
    }, 800);
}

function createFlash(x, y, color, container) {
    const flash = document.createElement('div');
    flash.style.position = 'absolute';
    flash.style.left = `${x}px`;
    flash.style.top = `${y}px`;
    flash.style.width = '120px';
    flash.style.height = '120px';
    flash.style.borderRadius = '50%';
    flash.style.backgroundColor = color;
    flash.style.transform = 'translate(-50%, -50%) scale(0)';
    flash.style.opacity = '0.5';
    flash.style.pointerEvents = 'none';
    flash.style.filter = 'blur(15px)';
    flash.style.boxShadow = `0 0 60px 20px ${color}`;
    
    container.appendChild(flash);

    // Jemný flash - jen lehký záblesk
    flash.animate([
        { transform: 'translate(-50%, -50%) scale(0)', opacity: 0.5 },
        { transform: 'translate(-50%, -50%) scale(1.8)', opacity: 0 }
    ], {
        duration: 400,
        easing: 'ease-out'
    });

    setTimeout(() => {
        flash.remove();
    }, 400);
}

function createParticle(x, y, angle, distance, color, container) {
    const particle = document.createElement('div');
    particle.className = 'trippy-particle';
    particle.style.left = `${x}px`;
    particle.style.top = `${y}px`;
    particle.style.backgroundColor = color;
    // Střední velikost částic
    particle.style.width = `${12 + Math.random() * 16}px`;
    particle.style.height = particle.style.width;
    particle.style.boxShadow = `0 0 25px 6px ${color}`;
    
    // Výpočet cílové pozice - DÁLE!
    const targetX = x + Math.cos(angle) * distance;
    const targetY = y + Math.sin(angle) * distance;
    
    container.appendChild(particle);

    // Delší let, ale rychlá animace
    particle.animate([
        { 
            transform: 'translate(-50%, -50%) scale(1.5)', 
            opacity: 1
        },
        { 
            transform: `translate(calc(-50% + ${targetX - x}px), calc(-50% + ${targetY - y}px)) scale(0)`, 
            opacity: 0
        }
    ], {
        duration: 900, // Delší let kvůli větší vzdálenosti
        easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' // Bounce easing
    });

    // Odstraň po animaci
    setTimeout(() => {
        particle.remove();
    }, 900);
}