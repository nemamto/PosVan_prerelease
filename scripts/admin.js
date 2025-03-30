//const serverEndpoint = 'https://posven00-707895647386.us-central1.run.app';
const serverEndpoint = 'http://127.0.0.1:3000';

document.addEventListener('DOMContentLoaded', async () => {
    await loadCustomerAccounts(); // Načtení zákaznických účtů
});

// Načtení zákaznických účtů
async function loadCustomerAccounts() {
    try {
        // Sestav URL jako řetězec
        const response = await fetch(`${serverEndpoint}/customers`); // Endpoint pro načtení zákazníků
        if (!response.ok) {
            throw new Error('Chyba při načítání zákaznických účtů!');
        }
        const customerAccounts = await response.json();
        renderCustomerAccounts(customerAccounts);
    } catch (error) {
        console.error('Chyba:', error);
    }
}

// Zobrazení zákaznických účtů
function renderCustomerAccounts(accounts) {
    const accountsTable = document.getElementById('customer-accounts-list');

    accounts.forEach(account => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${account.id}</td>
            <td>${account.name}</td>
            <td>${account.balance} Kč</td>
        `;
        accountsTable.appendChild(row);
    });
}

// Zahájení směny
document.getElementById('start-shift-button').addEventListener('click', async () => {
    try {
        // Správné volání fetch s URL a konfigurací
        const response = await fetch(`${serverEndpoint}/startShift`, {
            method: 'POST'
        });
        const data = await response.json();
        alert(`Směna zahájena: ${data.message}`);
    } catch (error) {
        console.error('Chyba při zahájení směny:', error);
    }
});

// Ukončení směny
document.getElementById('end-shift-button').addEventListener('click', async () => {
    try {
        const response = await fetch(`${serverEndpoint}/endShift`, {
            method: 'POST'
        });
        const data = await response.json();
        alert(`Směna ukončena: ${data.message}`);
    } catch (error) {
        console.error('Chyba při ukončení směny:', error);
    }
});
