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
                const startTime = new Date(shiftData.startTime).toLocaleString(); // Převod času zahájení na čitelný formát
                const action = confirm(`Aktivní směna ID ${shiftData.shiftID} byla zahájena v ${startTime}. Chcete pokračovat v této směně?`);

                if (action) {
                    localStorage.setItem("shiftID", shiftData.shiftID);
                    window.location.href = 'cashier.html';
                } else {
                    // Automaticky ukončit aktuální směnu a zahájit novou
                    try {
                        await fetch(`${serverEndpoint}/endShift`, { method: 'POST' });
                        alert("Směna byla ukončena.");

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
                    } catch (error) {
                        console.error("Chyba při zahajování nové směny:", error);
                        alert("Nepodařilo se zahájit novou směnu.");
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