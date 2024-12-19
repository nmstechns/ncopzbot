const fileSystem = require('fs');
const readlineInterface = require('readline');
const { HttpsProxyAgent: ProxyAgent } = require('https-proxy-agent');
const dynamicFetch = (url, options = {}) => import('node-fetch').then(({ default: fetch }) => fetch(url, options));

const TEXT_COLORS = {
    BOLD_GOLD: '\x1b[1m\x1b[33m',
    CYAN: '\x1b[1m\x1b[36m',
    GREEN: '\x1b[1m\x1b[32m',
    RED: '\x1b[1m\x1b[31m',
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

const loadUserData = () => {
    const userData = fileSystem.readFileSync('user.txt', 'utf8');
    return userData.split('\n').map(line => {
        const [email, password, proxy] = line.split(',').map(item => item.trim());
        return { email, password, proxy };
    }).filter(user => user.email && user.password);
};

const parseProxy = (proxy) => {
    if (!proxy.startsWith('http://') && !proxy.startsWith('https://')) {
        proxy = 'http://' + proxy;
    }
    return proxy;
};

const persistData = (email, token, proxy) => {
    const currentData = loadDataFile().reduce((acc, { email, token, proxy }) => {
        acc[email] = { token, proxy };
        return acc;
    }, {});
    currentData[email] = { token, proxy };
    const dataEntries = Object.entries(currentData).map(([email, { token, proxy }]) => `${email},${token},${proxy}`);
    fileSystem.writeFileSync('data.txt', dataEntries.join('\n'), 'utf8');
};

const authenticateUser = async (email, password, proxy) => {
    try {
        const loginDetails = { username: email, password };
        const loginResult = await dynamicFetch('https://api.openloop.so/users/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(loginDetails),
        });
        if (!loginResult.ok) {
            throw new Error(`Login attempt failed! Status: ${loginResult.status}`);
        }
        const loginInfo = await loginResult.json();
        const userAccessToken = loginInfo.data.accessToken;
        console.log(`Successfully logged in for ${email}, information stored in data.txt`);
        persistData(email, userAccessToken, proxy);
        return userAccessToken;
    } catch (error) {
        console.error('An error occurred during login:', error.message);
        return null;
    }
};

const distributeBandwidth = async (token, proxy, useProxy, email, index) => {
    try {
        const randomQuality = qualitygen();
        const agent = useProxy ? new ProxyAgent(parseProxy(proxy)) : undefined;

        const fetch = (await import('node-fetch')).default;

        const response = await fetch('https://api.openloop.so/bandwidth/share', {
            method: 'POST',
            body: JSON.stringify({ quality: randomQuality }),
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            agent: agent,
        });

        if (!response.ok) {
            if (response.status === 401) {
                console.error(`${TEXT_COLORS.RED}[${index + 1}] Token expired for ${email}. Attempting to refresh the token.${TEXT_COLORS.RESET_COLOR}`);
                const userData = loadUserData().find(user => user.email === email);
                if (userData) {
                    const newToken = await authenticateUser(userData.email, userData.password, proxy);
                    if (newToken) {
                        distributeBandwidth(newToken, proxy, useProxy, email, index);
                    }
                }
            } else {
                throw new Error(`Bandwidth sharing failed! Status: ${response.statusText}`);
            }
            return;
        }

        const responseData = await response.json();

        const logBandwidthResponse = (response) => {
            if (response && response.data && response.data.balances) {
                const balance = response.data.balances.POINT;
                const proxyMessage = useProxy ? ` (proxy used: ${proxy})` : '';
                console.log(`${TEXT_COLORS.CYAN}[${index + 1}]${TEXT_COLORS.RESET_COLOR} Bandwidth sharing for ${TEXT_COLORS.BOLD_GOLD}${email}${TEXT_COLORS.RESET_COLOR} was ${TEXT_COLORS.GREEN}successful${TEXT_COLORS.RESET_COLOR}, score: ${TEXT_COLORS.CYAN}${randomQuality}${TEXT_COLORS.RESET_COLOR}, total earnings: ${TEXT_COLORS.CYAN}${balance}${TEXT_COLORS.RESET_COLOR}${proxyMessage}`);
            }
        };

        logBandwidthResponse(responseData);
    } catch (error) {
        console.error(`${TEXT_COLORS.RED}[${index + 1}] Error during bandwidth sharing: ${error.message}${TEXT_COLORS.RESET_COLOR}`);
    }
};

const executeMain = () => {
    const rl = readlineInterface.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.question(`${TEXT_COLORS.BOLD_GOLD}Would you like to use a proxy? (y/n): ${TEXT_COLORS.RESET_COLOR}`, (answer) => {
        const useProxy = answer.toLowerCase() === 'y';
        console.log(`${TEXT_COLORS.BOLD_GOLD}Initiating bandwidth sharing every minute... Proxy usage: ${useProxy}${TEXT_COLORS.RESET_COLOR}`);
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
