const readline = require('readline');
const {
    generateAuthUrl,
    completeOAuthWithCode,
    OAUTH_TOKEN_PATH,
} = require('./googleDriveClient');

function prompt(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}

async function run() {
    const authUrl = generateAuthUrl();

    console.log('1) Otevrete nasledujici adresu v prohlizeci:');
    console.log(authUrl);
    console.log('2) Prihlaste se Google uctem a povolte pristup.');
    console.log('3) Zkopirujte overovaci kod z prohlizece zpet do tohoto terminalu.');

    const code = (await prompt('Zadejte overovaci kod: ')).trim();
    if (!code) {
        throw new Error('Nebyl zadan zadny kod.');
    }

    await completeOAuthWithCode(code);
    console.log(`Token ulozen do ${OAUTH_TOKEN_PATH}`);
}

run().catch((error) => {
    console.error('Autorizace se nepodarila:', error.message || error);
    process.exitCode = 1;
});
