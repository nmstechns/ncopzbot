const fileSystem = require('fs');
const readlineInterface = require('readline');
const { HttpsProxyAgent: ProxyAgent } = require('https-proxy-agent');

const TEXT_COLORS = {
    BOLD_GOLD: '\x1b[1m\x1b[33m',
    RESET_COLOR: '\x1b[0m'
};

function centerAlignText(text, width) {
    const padding = Math.floor((width - text.length) / 2);
    return ' '.repeat(padding) + text + ' '.repeat(padding);
}

const terminalWidth = process.stdout.columns;

console.log("");
console.log(`${TEXT_COLORS.BOLD_GOLD}${centerAlignText("********************************************", terminalWidth)}${TEXT_COLORS.RESET_COLOR}`);
console.log(`${TEXT_COLORS.BOLD_GOLD}${centerAlignText("Openloop node bot", terminalWidth)}${TEXT_COLORS.RESET_COLOR}`);
console.log(`${TEXT_COLORS.BOLD_GOLD}${centerAlignText("github.com/recitativonika", terminalWidth)}${TEXT_COLORS.RESET_COLOR}`);
console.log(`${TEXT_COLORS.BOLD_GOLD}${centerAlignText("********************************************", terminalWidth)}${TEXT_COLORS.RESET_COLOR}`);
console.log("");

const qualitygen = () => {
    const min = 65;
    const max = 99;
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

const loadDataFile = () => {
    const fileData = fileSystem.readFileSync('data.txt', 'utf8');
    return fileData.split('\n').map(line => {
        const [email, token, proxy] = line.split(',').map(item => item.trim());
        return { email, token, proxy };
    }).filter(item => item.token && item.proxy);
};

const parseProxy = (proxy) => {
    if (!proxy.startsWith('http://') && !proxy.startsWith('https://')) {
        proxy = 'http://' + proxy;
    }
    return proxy;
};

const distributeBandwidth = async (token, proxy, useProxy, email, index) => {
    try {
        const randomQuality = qualitygen();
        const agent = useProxy ? new ProxyAgent(parseProxy(proxy)) : undefined;

        const fetch = (await import('node-fetch')).default;

        const response = await fetch('https://api.openloop.so/bandwidth/share', {
            method: 'POST',
            body: JSON.stringify({
                quality: randomQuality
            }),
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            agent: agent,
        });

        if (!response.ok) {
            throw new Error(`Bandwidth sharing failed! Status: ${response.statusText}`);
        }

        const responseData = await response.json();

        const logBandwidthResponse = (response) => {
            if (response && response.data && response.data.balances) {
                const balance = response.data.balances.POINT;
                const proxyMessage = useProxy ? ` (proxy used: ${proxy})` : '';
                console.log(`\x1b[1m\x1b[36m[${index + 1}]\x1b[0m Bandwidth sharing for \x1b[1m\x1b[33m${email}\x1b[0m was \x1b[1m\x1b[32msuccessful\x1b[0m, score: \x1b[1m\x1b[36m${randomQuality}\x1b[0m, total earnings: \x1b[1m\x1b[36m${balance}\x1b[0m${proxyMessage}`);
            }
        };

        logBandwidthResponse(responseData);
    } catch (error) {
        console.error('Error during bandwidth distribution:', error.message);
    }
};

const executeMain = () => {
    const rl = readlineInterface.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.question('\x1b[1m\x1b[33mWould you like to use a proxy? (y/n): \x1b[0m', (answer) => {
        const useProxy = answer.toLowerCase() === 'y';
        console.log(`\x1b[1m\x1b[33mInitiating bandwidth sharing every minute... Proxy usage: ${useProxy}\x1b[0m`);
        const dataEntries = loadDataFile();
        dataEntries.forEach(({ email, token, proxy }, index) => {
            distributeBandwidth(token, proxy, useProxy, email, index);
        });
        setInterval(() => {
            dataEntries.forEach(({ email, token, proxy }, index) => {
                distributeBandwidth(token, proxy, useProxy, email, index);
            });
        }, 60 * 1000);

        rl.close();
    });
};

executeMain();
