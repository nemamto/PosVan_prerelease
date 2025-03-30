document.getElementById('login-form').addEventListener('submit', function(e) 
{
    e.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const startShift = document.getElementById('start-shift').checked;  // Zjistíme, zda je checkbox zaškrtnutý

    console.log(`Zadané údaje - Uživatelské jméno: ${username}, Heslo: ${password}, Nová směna: ${startShift ? 'Ano' : 'Ne'}`);

    if (username === 'barman' && password === '1234') {
        if (startShift) {
            console.log("Zahajujeme novou směnu...");
        } else {
            console.log("Pokračujeme ve stávající směně...");
        }
        window.location.href = 'cashier.html'; // Přesměrování na pokladnu
    } else {
        alert('Neplatné přihlašovací údaje.');
    }
}
);