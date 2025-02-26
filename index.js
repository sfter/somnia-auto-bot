import { ethers } from 'ethers';
import fs from 'fs';
import axios from 'axios';
import moment from 'moment';
import momentlog from 'moment-timezone'

const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const networks = config.networks;
const FAUCET_API = networks.somnia.faucetApi;

const PROXY_FILE = 'proxies.txt';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function readWallets() {
    try {
        await fs.accessSync("wallets.json");
        const data = await fs.readFileSync("wallets.json", "utf-8");
        return JSON.parse(data);
    } catch (err) {
        if (err.code === 'ENOENT') {
            logger.info("No wallets found in wallets.json");
            return [];
        }
        throw err;
    }
}

async function readReffCodes() {
    try {
        await fs.accessSync("wallets.json");
        const data = await fs.readFileSync("reffCodes.json", "utf-8");
        return JSON.parse(data);
    } catch (err) {
        if (err.code === 'ENOENT') {
            logger.info("No wallets found in wallets.json");
            return [];
        }
        throw err;
    }
}

function logToReadme(log) {
    const logEntry = `${log}\n`;
    fs.appendFileSync('logs.txt', logEntry, 'utf8');
    console.log(log);
}

function timelog() {
  return momentlog().tz('Asia/Jakarta').format('HH:mm:ss | DD-MM-YYYY');
}

// Proxy Management
function loadProxies() {
    try {
        const content = fs.readFileSync(PROXY_FILE, 'utf8');
        return content.split('\n')
            .map(line => line.trim())
            .filter(line => line && line.length > 0);
    } catch (error) {
        console.error('Error loading proxies:', error.message);
        return [];
    }
}

function getRandomProxy(proxies) {
    if (!proxies.length) return null;
    return proxies[Math.floor(Math.random() * proxies.length)];
}

function createProxyAgent(proxy) {
    if (!proxy) return null;
    
    const [auth, hostPort] = proxy.includes('@') ? proxy.split('@') : [null, proxy];
    const [host, port] = hostPort ? hostPort.split(':') : proxy.split(':');
    
    const proxyOptions = {
        host,
        port: parseInt(port),
        ...(auth && {
            auth: auth.includes(':') ? auth : `${auth}:`
        })
    };

    if (proxy.startsWith('socks4://') || proxy.startsWith('socks5://')) {
        const proxyType = proxy.startsWith('socks5') ? 'SOCKS5' : 'SOCKS4';
        console.log(`Proxy ${proxyType} dari proxies.txt digunakan: ${proxy}`);
        return new SocksProxyAgent(`socks${proxy.startsWith('socks5') ? 5 : 4}://${proxy.replace(/^socks[4-5]:\/\//, '')}`);
    }
    console.log(`Proxy HTTP dari proxies.txt digunakan: ${proxy}`);
    return new HttpsProxyAgent(`http://${proxy}`);
}

async function request(url, options = {}, retries = 3) {
    const proxies = loadProxies();
    let proxy = getRandomProxy(proxies);
    let attempt = 0;

    while (attempt < retries) {
        const agent = proxy ? createProxyAgent(proxy) : null;
        if (!proxy) {
            console.log('Without use proxy.');
        }

        try {
            const response = await axios({
                url,
                ...options,
                timeout: 10000, // Set timeout to 10 seconds
                ...(agent && { httpsAgent: agent, httpAgent: agent })
            });
            return response;
        } catch (error) {
            attempt++;
            if (error.code === 'EAI_AGAIN') {
                console.error(`Kesalahan EAI_AGAIN pada percobaan ${attempt}/${retries} dengan proxy: ${proxy || 'tanpa proxy'}`);
                if (attempt < retries) {
                    console.log('Mencoba lagi dengan proxy lain...');
                    proxy = getRandomProxy(proxies); // Ganti proxy untuk percobaan berikutnya
                    await new Promise(resolve => setTimeout(resolve, 2000)); // Tunggu 2 detik sebelum retry
                    continue;
                }
            }
            throw new Error(`Request failed setelah ${retries} percobaan${proxy ? ' dengan proxy ' + proxy : ''}: ${error.message}`);
        }
    }
}

async function claimFaucet(address) {
    try {
        const response = await request(FAUCET_API, {
            method: 'POST',
            data: { address },
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
            }
        });

        if (response.data.success) {
            return {
                success: true,
                hash: response.data.data.hash,
                amount: response.data.data.amount
            };
        }
        return { success: false, error: 'Faucet claim failed' };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function processWallet(privateKey, inviteCode) {
    const wallet = new ethers.Wallet(privateKey);

    console.log('Attempting to claim faucet...');
    const result = await claimFaucet(wallet.address);
    
    if (result.success) {
        console.log(`Claim successful! TX Hash: ${result.hash}`);
        console.log(`Amount: ${ethers.formatEther(result.amount)} ${networks.somnia.symbol}`);
    } else {
        console.log(`Claim failed: ${result.error}`);
    }
}

const main = async () => {
    while (true) {  // 无限循环
        try {
            logToReadme(`[${timelog()}] 🚀 Starting new processing cycle`);
            let wallets = await readWallets();
            let reffCodes = await readReffCodes();
            
            for (let i = 0; i < wallets.length; i++) {
                const randomIndex = Math.floor(Math.random() * reffCodes.length);
                const reffCode = reffCodes[randomIndex];

                console.log(`[${i+1}] Processing ${new ethers.Wallet(wallets[i].privateKey).address}`);

                try {
                    await processWallet(wallets[i].privateKey, reffCode);
                } catch (error) {
                    logToReadme(`[${timelog()}] 🚨 Error processing wallet ${new ethers.Wallet(wallets[i].privateKey).address}: ${error.message}`);
                }
                
                await sleep(1 * 1000);
            }

            logToReadme(`[${timelog()}] ✅ Cycle completed. Waiting 24 hours before next cycle...`);
            await sleep(24 * 60 * 60 * 1000);  // 等待24小时
        } catch (error) {
            logToReadme(`[${timelog()}] 🚨 Cycle error: ${error.message}. Retrying in 24 hours...`);
            await sleep(24 * 60 * 60 * 1000);
        }
    }
};

main();
