import { ethers } from 'ethers';
import fs from 'fs';
import readline from 'readline';
import log from "./utils/logger.js"
import iniBapakBudi from "./utils/banner.js"


async function askQuestion(question) {
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

// Function to create a new wallet
function createNewWallet() {
    const wallet = ethers.Wallet.createRandom();

    const walletDetails = {
        address: wallet.address,
        privateKey: wallet.privateKey,
        mnemonic: wallet.mnemonic.phrase
    };

    log.info("New Ethereum Wallet created:");
    log.info(`Address: ${walletDetails.address}`);
    log.info(`Private Key: ${walletDetails.privateKey}`);
    log.info(`Mnemonic: ${walletDetails.mnemonic}`);

    return walletDetails;
}

// Function to save the wallet
function saveWalletToFile(walletDetails) {
    let wallets = [];
    if (fs.existsSync("wallets.json")) {
        const data = fs.readFileSync("wallets.json");
        wallets = JSON.parse(data);
    }

    wallets.push(walletDetails);

    fs.writeFileSync("wallets.json", JSON.stringify(wallets, null, 2));

    log.warn("Wallet saved to wallets.json");
}

async function askingHowManyWallets() {
    const answer = await askQuestion('How many wallets would you like to create? ');
    return parseInt(answer);
}

// Main function
async function main() {
    log.warn(iniBapakBudi)
    const numWallets = await askingHowManyWallets();
    for (let i = 0; i < numWallets; i++) {
        log.info(`Creating wallet #${i + 1}...`);

        const newWallet = createNewWallet();
        saveWalletToFile(newWallet);
    }

    log.info("All wallets created.");
}

// Run
main();