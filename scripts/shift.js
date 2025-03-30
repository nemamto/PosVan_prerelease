const serverEndpoint = 'http://localhost:3000';
let currentShiftID = null;

document.addEventListener('DOMContentLoaded', async () => {
    const startShiftButton = document.getElementById('start-shift-button');
    const endShiftButton = document.getElementById('end-shift-button');
    const shiftStatus = document.getElementById('shiftStatus');
    const bartenderInput = document.getElementById('bartender-name');

    // 🟢 Načtení stavu směny při načtení stránky
    async function loadShiftStatus() {
        try {
            const response = await fetch(`${serverEndpoint}/currentShift`);
            let shiftData = await response.json();
            console.log("📥 Načítám stav směny:", shiftData);
            if (!response.ok) throw new Error(shiftData.message || "Chyba při načítání směny.");

            if (shiftData.shiftID != null && !shiftData.endTime) { // Kontrola existence klíče endTime
                shiftStatus.textContent = `Směna ID ${shiftData.shiftID} probíhá (Barman: ${shiftData.bartender})`;
                currentShiftID = shiftData.shiftID;
                bartenderInput.value = shiftData.bartender;
                bartenderInput.disabled = true;

                // ✅ Odemknout tlačítko "Ukončit směnu"
                startShiftButton.disabled = true;
                endShiftButton.classList.remove('disabled');
                endShiftButton.disabled = false;

            } else {
                shiftStatus.textContent = "Žádná aktivní směna";
                currentShiftID = null;
                bartenderInput.value = "";
                bartenderInput.disabled = false;

                // ✅ Povolit tlačítko "Zahájit směnu", deaktivovat "Ukončit směnu"
                startShiftButton.disabled = false;
                endShiftButton.classList.add('disabled');
                endShiftButton.disabled = true;
            }
        } catch (error) {
            console.error("❌ Chyba při načítání směny:", error);
            shiftStatus.textContent = "Chyba při načítání směny!";
        }
    }

    // 🟢 Zahájení směny
    async function startShift() {
        const bartenderName = document.getElementById('bartender-name').value.trim(); // ✅ Načteme jméno správně

        if (!bartenderName) {
            showModal("❌ Musíte zadat jméno barmana!", true);
            return;
        }

        console.log(`📤 Odesílám zahájení směny pro barmana: ${bartenderName}`);

        try {
            const response = await fetch(`${serverEndpoint}/startShift`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bartender: bartenderName }) // ✅ Odesíláme objekt s klíčem 'bartender'
            });

            if (!response.ok) {
                throw new Error("Chyba při zahájení směny.");
            }

            const shiftData = await response.json();
            console.log(`✅ Směna zahájena pro barmana: ${shiftData.bartender}`); // 🟢 Ověříme, že server vrací správné jméno

            showModal(`✅ Směna zahájena: ${shiftData.bartender || "Neznámý barman"}`, false);
            await loadShiftStatus(); // ✅ Aktualizace stavu směny
        } catch (error) {
            console.error("❌ Chyba při zahájení směny:", error);
            showModal("❌ Chyba při zahájení směny!", "", true);
        }
    }

    // 🛑 Ukončení směny
    async function endShift() {
        if (!currentShiftID) {
            showModal("❌ Není aktivní žádná směna.", "", true);
            return;
        }

        console.log("🛑 Odesílám požadavek na ukončení směny:", {currentShiftID});

        try {
            const response = await fetch(`${serverEndpoint}/endShift`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ shiftID: currentShiftID }) // ✅ Odesíláme ID směny
            });

            const data = await response.json();

            if (!response.ok) {
                showModal(`❌ ${data.message}`, "", false);
                return;
            }

            showModal(`✅ Směna ID ${currentShiftID} byla ukončena.`, "", false);
            currentShiftID = null; // ✅ Resetujeme currentShiftID
            await loadShiftStatus();
        } catch (error) {
            console.error("❌ Chyba při ukončení směny:", error);
            showModal("❌ Chyba při ukončení směny!", "", false);
        }
    }

    // 🟢 Event listenery
    startShiftButton.addEventListener('click', startShift);
    endShiftButton.addEventListener('click', endShift);

    // ✅ Načtení směny při startu
    loadShiftStatus();
});
