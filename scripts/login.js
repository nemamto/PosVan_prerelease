const serverEndpoint = 'http://127.0.0.1:3000'; // Definice serverEndpoint

document.getElementById('login-form').addEventListener('submit', async function(e) {
    e.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    console.log(`Zadané údaje - Uživatelské jméno: ${username}, Heslo: ${password}`);

    if (username === 'barman' && password === '1234') {
        console.log("Přihlášení úspěšné.");

        // Kontrola stavu směny
        try {
            const response = await fetch(`${serverEndpoint}/currentShift`);
            const shiftData = await response.json();

            if (shiftData.active) {
                const continueShift = confirm(`Aktivní směna ID ${shiftData.shiftID} probíhá. Chcete pokračovat?`);
                if (continueShift) {
                    localStorage.setItem("shiftID", shiftData.shiftID);
                    window.location.href = 'cashier.html';
                } else {
                    const endShift = confirm("Chcete ukončit aktuální směnu?");
                    if (endShift) {
                        await fetch(`${serverEndpoint}/endShift`, { method: 'POST' });
                        alert("Směna byla ukončena.");
                    }
                }
            } else {
                const startNewShift = confirm("Žádná aktivní směna nebyla nalezena. Chcete zahájit novou směnu?");
                if (startNewShift) {
                    const bartenderName = username; // Použijeme přihlašovací jméno jako jméno barmana
                    const startResponse = await fetch(`${serverEndpoint}/startShift`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ bartender: bartenderName })
                    });
                    const startData = await startResponse.json();
                    alert(`Nová směna zahájena: ID ${startData.shiftID}`);
                    localStorage.setItem("shiftID", startData.shiftID);
                    window.location.href = 'cashier.html';
                }
            }
        } catch (error) {
            console.error("Chyba při kontrole směny:", error);
            alert("Nepodařilo se ověřit stav směny.");
        }
    } else {
        alert('Neplatné přihlašovací údaje.');
    }
});