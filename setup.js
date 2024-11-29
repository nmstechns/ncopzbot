const fileSystem = require('fs');
const readlineInterface = require('readline');
const HttpsProxyAgent = require('https-proxy-agent');

const TEXT_COLORS = {
    BOLD_YELLOW: '\x1b[1m\x1b[33m',
    CYAN: '\x1b[36m',
    GREEN: '\x1b[32m',
    RESET: '\x1b[0m'
};

function alignTextCenter(text, width) {
    const padding = Math.floor((width - text.length) / 2);
    return ' '.repeat(padding) + text + ' '.repeat(padding);
}

const terminalWidth = process.stdout.columns;

console.log("");
console.log(`${TEXT_COLORS.BOLD_YELLOW}${alignTextCenter("============================================", terminalWidth)}${TEXT_COLORS.RESET}`);
console.log(`${TEXT_COLORS.BOLD_YELLOW}${alignTextCenter("Openloop node bot", terminalWidth)}${TEXT_COLORS.RESET}`);
console.log(`${TEXT_COLORS.BOLD_YELLOW}${alignTextCenter("github.com/recitativonika", terminalWidth)}${TEXT_COLORS.RESET}`);
console.log(`${TEXT_COLORS.BOLD_YELLOW}${alignTextCenter("============================================", terminalWidth)}${TEXT_COLORS.RESET}`);
console.log("");

const dynamicFetch = (url, options = {}, proxy) => {
    if (proxy) {
        options.agent = new HttpsProxyAgent(proxy);
    }
    return import('node-fetch').then(({ default: fetch }) => fetch(url, options));
};
const checkEmailValidity = (email) => {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailPattern.test(email);
};

const loadUserData = () => {
    const userData = fileSystem.readFileSync('user.txt', 'utf8');
    const userLines = userData.trim().split('\n');
    return userLines.map(line => {
        const [userEmail, userPassword, userProxy] = line.split(',');
        if (!checkEmailValidity(userEmail)) {
            console.error(`Email format is incorrect: ${userEmail}`);
            return null;
        }
        return { email: userEmail, password: userPassword, proxy: userProxy };
    }).filter(user => user !== null);
};

const loadExistingData = () => {
    if (!fileSystem.existsSync('data.txt')) return {};
    const existingDataContent = fileSystem.readFileSync('data.txt', 'utf8');
    const existingDataLines = existingDataContent.trim().split('\n');
    const existingDataMap = {};
    existingDataLines.forEach(line => {
        const dataParts = line.split(',');
        if (dataParts.length === 3) {
            const [email, token, proxy] = dataParts;
            existingDataMap[email] = { token, proxy };
        }
    });
    return existingDataMap;
};

const persistData = (email, token, proxy) => {
    if (!email || !token || !proxy) {
        console.error('Data is incomplete, cannot save:', { email, token, proxy });
        return;
    }

    const currentData = loadExistingData();
    currentData[email] = { token, proxy };

    const dataEntries = Object.entries(currentData).map(([email, { token, proxy }]) => {
        return `${email},${token},${proxy}`;
    });

    fileSystem.writeFileSync('data.txt', dataEntries.join('\n'), 'utf8');
};

const inquireProxyUsage = () => {
    return new Promise((resolve) => {
        const readlineInstance = readlineInterface.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        readlineInstance.question(`${TEXT_COLORS.BOLD_YELLOW}Would you like to use a proxy? (y/n): ${TEXT_COLORS.RESET}`, (response) => {
            readlineInstance.close();
            resolve(response.toLowerCase() === 'y');
        });
    });
};

const authenticateUser = async (email, password, proxy) => {
    try {
        const loginDetails = { username: email, password };
        const loginResult = await dynamicFetch('https://api.openloop.so/users/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(loginDetails),
        });

        if (!loginResult.ok) {
            throw new Error(`Login attempt failed! Status: ${loginResult.status}`);
        }

        const loginInfo = await loginResult.json();
        const userAccessToken = loginInfo.data.accessToken;
        console.log(`${TEXT_COLORS.GREEN}Successfully logged in for ${TEXT_COLORS.CYAN}${email}${TEXT_COLORS.GREEN}, information stored in data.txt${TEXT_COLORS.RESET}`);

        persistData(email, userAccessToken, proxy);
    } catch (error) {
        console.error('An error occurred during login:', error.message);
    }
};

const createUserAccount = async (email, password, proxy) => {
    try {
        const userName = email.split('@')[0];
        const invitationCode = 'ol29b29fb1';

        const registrationDetails = { name: userName, username: email, password, inviteCode: invitationCode };
        const registrationResult = await dynamicFetch('https://api.openloop.so/users/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(registrationDetails),
        });

        if (registrationResult.status === 401) {
            console.log(`${TEXT_COLORS.CYAN}${email}${TEXT_COLORS.RESET} is already registered, trying to log in.`);
            await authenticateUser(email, password, proxy);
            return;
        }

        if (!registrationResult.ok) {
            throw new Error(`Registration attempt failed! Status: ${registrationResult.status}`);
        }

        const registrationInfo = await registrationResult.json();
        console.log('Account registration successful:', registrationInfo.message);

        await authenticateUser(email, password, proxy);
    } catch (error) {
        console.error('An error occurred during registration:', error.message);
    }
};

const executeMain = async () => {
    const proxyUsage = await inquireProxyUsage();
    const userList = loadUserData();

    userList.forEach(async ({ email, password, proxy }) => {
        const existingUserData = loadExistingData();
        const proxyChoice = proxyUsage ? proxy : (existingUserData[email]?.proxy || 'proxy');
        await createUserAccount(email, password, proxyChoice);
    });
};

executeMain();
