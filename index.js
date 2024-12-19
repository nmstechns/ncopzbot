const fileSystem = require('fs');
const readlineInterface = require('readline');
const { HttpsProxyAgent: ProxyAgent } = require('https-proxy-agent');
const dynamicFetch = (url, options = {}) => import('node-fetch').then(({ default: fetch }) => fetch(url, options));

const TEXT_COLORS = {
    BOLD_GOLD: '\x1b[1m\x1b[33m',
    CYAN: '\x1b[1m\x1b[36m',
    GREEN: '\x1b[1m\x1b[32m',
    RED: '\x1b[1m\x1b[31m',
    YELLOW: '\x1b[1m\x1b[33m',
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

const fetchMissions = async (token, useProxy, proxy) => {
    try {
        const agent = useProxy ? new ProxyAgent(parseProxy(proxy)) : undefined;
        const fetch = (await import('node-fetch')).default;

        const response = await fetch('https://api.openloop.so/missions', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            agent: agent,
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch missions! Status: ${response.statusText}`);
        }

        const missionsData = await response.json();
        return Array.isArray(missionsData.data.missions) ? missionsData.data.missions : [];
    } catch (error) {
        console.error(`Error fetching missions: ${error.message}`);
        return [];
    }
};

const handleMissions = async (token, useProxy, proxy, index) => {
    const missions = await fetchMissions(token, useProxy, proxy);
    const availableMissions = missions.filter(mission => mission.status === 'available');

    if (availableMissions.length > 0) {
        const missionIds = availableMissions.map(mission => mission.missionId).join(' ');
        console.log(`${TEXT_COLORS.CYAN}[${index + 1}]${TEXT_COLORS.RESET_COLOR} Missions available ${TEXT_COLORS.GREEN}${missionIds}${TEXT_COLORS.RESET_COLOR}`);
    } else {
        console.log(`${TEXT_COLORS.CYAN}[${index + 1}]${TEXT_COLORS.RESET_COLOR} ${TEXT_COLORS.YELLOW}No missions available${TEXT_COLORS.RESET_COLOR}`);
    }

    for (const mission of availableMissions) {
        if (mission.missionId) {
            await completeMission(mission.missionId, token, useProxy, proxy, index);
        } else {
            console.error('Mission ID is undefined for mission:', mission);
        }
    }
};

const completeMission = async (missionId, token, useProxy, proxy, index) => {
    try {
        const agent = useProxy ? new ProxyAgent(parseProxy(proxy)) : undefined;
        const fetch = (await import('node-fetch')).default;

        const response = await fetch(`https://api.openloop.so/missions/${missionId}/complete`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            agent: agent,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Failed to complete mission ${missionId}! Status: ${response.statusText}, Response: ${errorText}`);
            return;
        }

        console.log(`${TEXT_COLORS.CYAN}[${index + 1}]${TEXT_COLORS.RESET_COLOR} Mission ${missionId} completed successfully.`);
    } catch (error) {
        console.error(`Error completing mission ${missionId}: ${error.message}`);
    }
};

const distributeBandwidth = async (token, proxy, useProxy, email, index, errorCounter) => {
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
                errorCounter[email] = (errorCounter[email] || 0) + 1;
                console.error(`${TEXT_COLORS.CYAN}[${index + 1}]${TEXT_COLORS.RESET_COLOR} ${TEXT_COLORS.RED}Token expired for ${email}. Attempt ${errorCounter[email]} of 5.${TEXT_COLORS.RESET_COLOR}`);
                if (errorCounter[email] >= 5) {
                    console.error(`${TEXT_COLORS.CYAN}[${index + 1}]${TEXT_COLORS.RESET_COLOR} ${TEXT_COLORS.RED}Refreshing token for ${email} after 5 failed attempts.${TEXT_COLORS.RESET_COLOR}`);
                    const userData = loadUserData().find(user => user.email === email);
                    if (userData) {
                        const newToken = await authenticateUser(userData.email, userData.password, proxy);
                        if (newToken) {
                            errorCounter[email] = 0;
                            distributeBandwidth(newToken, proxy, useProxy, email, index, errorCounter);
                        }
                    }
                }
            } else {
                console.error(`${TEXT_COLORS.CYAN}[${index + 1}]${TEXT_COLORS.RESET_COLOR} ${TEXT_COLORS.RED}Bandwidth sharing failed! Status: ${response.statusText}${TEXT_COLORS.RESET_COLOR}`);
            }
        } else {
            const responseData = await response.json();
            const logBandwidthResponse = (response) => {
                if (response && response.data && response.data.balances) {
                    const balance = response.data.balances.POINT;
                    const proxyMessage = useProxy ? ` (proxy used: ${proxy})` : '';
                    console.log(`${TEXT_COLORS.CYAN}[${index + 1}]${TEXT_COLORS.RESET_COLOR} Bandwidth sharing for ${TEXT_COLORS.BOLD_GOLD}${email}${TEXT_COLORS.RESET_COLOR} was ${TEXT_COLORS.GREEN}successful${TEXT_COLORS.RESET_COLOR}, score: ${TEXT_COLORS.CYAN}${randomQuality}${TEXT_COLORS.RESET_COLOR}, total earnings: ${TEXT_COLORS.CYAN}${balance}${TEXT_COLORS.RESET_COLOR}${proxyMessage}`);
                }
            };
            logBandwidthResponse(responseData);
            errorCounter[email] = 0;
        }

    } catch (error) {
        console.error(`${TEXT_COLORS.CYAN}[${index + 1}]${TEXT_COLORS.RESET_COLOR} ${TEXT_COLORS.RED}Error during bandwidth sharing: ${error.message}${TEXT_COLORS.RESET_COLOR}`);
    }

    await handleMissions(token, useProxy, proxy, index);
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
        const errorCounter = {};
        dataEntries.forEach(({ email, token, proxy }, index) => {
            distributeBandwidth(token, proxy, useProxy, email, index, errorCounter);
        });
        setInterval(() => {
            dataEntries.forEach(({ email, token, proxy }, index) => {
                distributeBandwidth(token, proxy, useProxy, email, index, errorCounter);
            });
        }, 60 * 1000);

        rl.close();
    });
};

executeMain();
