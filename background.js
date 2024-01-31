// List of distracting websites (can be dynamic based on user settings)
let distractingWebsites;
const defaultDistractingWebsites = [
    "facebook.com", "reddit.com", "redd.it", "imgur.com", "x.com",
    "pinterest.com", "twitter.com", "instagram.com"
];

let tabTimers = {}; // Tracks timers for tabs
let tabCloseReasons = {}; // Tracks reasons for tab closures
let updateTimeouts = {}; // For debouncing tab updates
let maxTimeAllowed; // Dynamically updated based on usage
let browserCloseProbability = 0; // Probability of all tabs closing
let lastProbabilityUpdateTime = Date.now(); // Last time the probability was updated
let increaseProbabilityDebounceTimer;
const debounceDelay = 3000; // 1 second debounce delay
const defaultMaxTimeAllowed = 1800; // Default maximum time allowed (e.g., 30 minutes)

// Initialization
async function initialize() {
    // Retrieve stored settings and state
    const {
        distractingWebsites: storedWebsites,
        maxTimeAllowed: storedMaxTimeAllowed,
        lastResetTimestamp,
        browserCloseProbability: storedProbability,
        lastProbabilityUpdateTime,
        reductionFactor: storedReductionFactor
    } = await browser.storage.local.get([
        'distractingWebsites',
        'maxTimeAllowed',
        'lastResetTimestamp',
        'browserCloseProbability',
        'lastProbabilityUpdateTime',
        'reductionFactor'
    ]);

    // Initialize distracting websites list
    distractingWebsites = storedWebsites || defaultDistractingWebsites;
    console.log("Distracting websites list initialized:", distractingWebsites);

    // Initialize browser close probability
    const now = new Date();
    const hoursElapsedSinceLastUpdate = lastProbabilityUpdateTime ? (now.getTime() - lastProbabilityUpdateTime) / (1000 * 60 * 60) : 0;
    browserCloseProbability = storedProbability || 0;
    browserCloseProbability = Math.max(0, browserCloseProbability - (0.025 * hoursElapsedSinceLastUpdate)); // Apply cooldown
    console.log(`Browser close probability adjusted to ${browserCloseProbability * 100}%, based on ${hoursElapsedSinceLastUpdate.toFixed(2)} hours elapsed.`);

    // Reset check based on lastResetTimestamp
    const lastReset = lastResetTimestamp ? new Date(lastResetTimestamp) : null;
    if (!lastReset || lastReset.getDate() !== now.getDate() || lastReset.getMonth() !== now.getMonth() || lastReset.getFullYear() !== now.getFullYear()) {
        console.log("Resetting maxTimeAllowed for a new day.");
        maxTimeAllowed = defaultMaxTimeAllowed;
        await browser.storage.local.set({
            maxTimeAllowed,
            lastResetTimestamp: now.getTime() // Update lastResetTimestamp to current time
        });
    } else {
        maxTimeAllowed = storedMaxTimeAllowed || defaultMaxTimeAllowed;
    }
    console.log("Max time allowed set:", maxTimeAllowed, "seconds");

    let reductionFactor = storedReductionFactor;
    if (!reductionFactor) {
        reductionFactor = await calculateReductionFactor();
        await browser.storage.local.set({ reductionFactor });
        console.log("Reduction factor calculated and stored:", reductionFactor);
    } else {
        console.log("Using stored reduction factor:", reductionFactor);
    }

    // Save the initialized or updated values
    await browser.storage.local.set({
        maxTimeAllowed,
        lastResetTimestamp: now.getTime(),
        browserCloseProbability,
        lastProbabilityUpdateTime: now.getTime(),
        reductionFactor
    });

    scheduleDailyReset(); // Ensure daily reset is scheduled
    applyProbabilityCooldown();
    updateIcon();
}


function updateIcon() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 128; // Use the largest size for best quality
    canvas.height = 128;
    const baseIcon = new Image();

    baseIcon.onload = () => {
        ctx.drawImage(baseIcon, 0, 0, canvas.width, canvas.height);

        // Calculate the blackout overlay based on the remaining time
        const timeRatio = maxTimeAllowed / defaultMaxTimeAllowed;
        const height = canvas.height * (1 - timeRatio); // Height of the blackout overlay

        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'; // Semi-transparent black
        ctx.fillRect(0, canvas.height - height, canvas.width, height);

        // Convert the canvas to an image data URL and set it as the icon
        browser.browserAction.setIcon({ imageData: ctx.getImageData(0, 0, canvas.width, canvas.height) });
    };

    baseIcon.src = 'icons/128.png'; // Path to your base icon image
}


function isDistractingWebsite(url) {
    const isDistracting = distractingWebsites.some(site => url.includes(site));
    console.log(`URL "${url}" is distracting:`, isDistracting);
    return isDistracting;
}

function handleTabUpdate(tabId, changeInfo) {
    console.log(`Tab ${tabId} update detected, URL change:`, changeInfo.url);

    if (updateTimeouts[tabId]) {
        clearTimeout(updateTimeouts[tabId]);
        console.log(`Debouncing: Cleared previous timeout for Tab ${tabId}`);
    }

    updateTimeouts[tabId] = setTimeout(() => {
        processTabUpdate(tabId, changeInfo.url);
        delete updateTimeouts[tabId];
    }, 100); // Adjust debounce time as needed
}

async function processTabUpdate(tabId, url) {
    //console.log(`Processing update for Tab ${tabId}, URL: ${url}`);
    if (isDistractingWebsite(url)) {
        console.log(`Tab ${tabId} is distracting.`);
        if (!tabTimers[tabId]) {
            const timeInterval = await getRandomTimeInterval(tabId);
            console.log(`Starting timer for Tab ${tabId}, Interval: ${timeInterval} seconds`);
            startTimer(tabId, timeInterval);
            increaseCloseProbability(); // Debounced increase of close probability
        }
    } else if (tabTimers[tabId]) {
        console.log(`Tab ${tabId} navigated from distracting to non-distracting site. Stopping timer.`);
        stopTimer(tabId);
    } else {
        console.log(`Tab ${tabId} is non-distracting and has no active timer.`);
    }
}

async function closeAndMarkDistractingTabs(newTabId) {
    const tabs = await browser.tabs.query({});
    for (const tab of tabs.filter(tab => tab.id !== newTabId && isDistractingWebsite(tab.url))) {
        console.log(`Marking Tab ${tab.id} for closure due to new distracting Tab ${newTabId}`);
        tabCloseReasons[tab.id] = 'timer';
        await browser.tabs.remove(tab.id);
        console.log(`Closed Tab ${tab.id}`);
        delete tabTimers[tab.id];
        delete tabCloseReasons[tab.id];
    }
}

function startTimer(tabId, timeInterval) {
    if (tabTimers[tabId]) {
        console.log(`Timer for Tab ${tabId} already exists. Restarting.`);
        stopTimer(tabId);
    }

    console.log(`Initializing timer for Tab ${tabId}, Duration: ${timeInterval} seconds`);
    tabTimers[tabId] = {
        startTime: Date.now(),
        timerId: setInterval(() => {
            let elapsed = (Date.now() - tabTimers[tabId].startTime) / 1000;
            console.log(`Tab ${tabId} Timer Check, Elapsed: ${elapsed} seconds`);

            if (elapsed >= timeInterval) {
                console.log(`Timer expired for Tab ${tabId}, closing.`);
                closeTabByTimer(tabId);
            }
        }, 1000)
    };
}

function closeTabByTimer(tabId) {
    console.log(`Closing Tab ${tabId} due to timer expiration.`);
    tabCloseReasons[tabId] = 'timer';
    browser.tabs.remove(tabId).then(() => {
        console.log(`Tab ${tabId} closed by timer.`);
        deductTime(tabId); // Deduct time from maxTimeAllowed
        onDistractingTabClosed(tabId); // Update the last closure time

        if (Math.random() < browserCloseProbability) {
            console.log('Probability triggered, closing all tabs.');
            browser.tabs.query({}).then(tabs => {
                const tabIds = tabs.map(tab => tab.id);
                browser.tabs.remove(tabIds);
            });
        }
    });
}

browser.tabs.onRemoved.addListener((tabId, removeInfo) => {
    if (tabCloseReasons[tabId] !== 'timer' && tabTimers[tabId]) {
        console.log(`Distracting Tab ${tabId} closed by the user.`);
        deductTime(tabId); // Deduct time from maxTimeAllowed
        onDistractingTabClosed(tabId); // Update the last closure time
    }

    // Cleanup
    delete tabTimers[tabId];
    delete tabCloseReasons[tabId];
});


function stopTimer(tabId) {
    if (tabTimers[tabId]) {
        console.log(`Stopping timer for Tab ${tabId}`);
        clearInterval(tabTimers[tabId].timerId);
        delete tabTimers[tabId];
    }
}

function deductTime(tabId) {
    if (!tabTimers[tabId]) return;

    const elapsedTime = (Date.now() - tabTimers[tabId].startTime) / 1000; // in seconds
    maxTimeAllowed = Math.max(0, maxTimeAllowed - elapsedTime);
    console.log(`Deducted ${elapsedTime} seconds from maxTimeAllowed for Tab ${tabId}. New maxTimeAllowed: ${maxTimeAllowed} seconds.`);
    
    // Persist the updated maxTimeAllowed
    browser.storage.local.set({ maxTimeAllowed });
}


// Calculate a random time interval considering the reduction factor and remaining maxTimeAllowed
async function getRandomTimeInterval(tabId) {
    const reductionFactor = await calculateReductionFactor();
    const remainingTime = Math.max(0, maxTimeAllowed); // Ensure it doesn't go below 0
    const interval = Math.floor(Math.random() * remainingTime * reductionFactor) + 1;
    console.log(`Calculated random time interval for Tab ${tabId}: ${interval} seconds, within remaining maxTimeAllowed: ${remainingTime} seconds.`);
    return interval;
}

async function calculateReductionFactor() {
    const { lastDistractingTabCloseTime } = await browser.storage.local.get('lastDistractingTabCloseTime');
    const currentTime = Date.now();

    // Check if the last distracting tab close time is recorded
    if (!lastDistractingTabCloseTime) {
        console.log("No recorded last distracting tab closure time. Setting reduction factor to 1.");
        return 1;
    }

    const elapsedTime = (currentTime - lastDistractingTabCloseTime) / 1000; // Convert ms to seconds
    const cooldownPeriod = 90 * 60; // 90 minutes in seconds

    // Calculate the reduction factor, ensuring it's within the range [0, 1]
    let reductionFactor = elapsedTime / cooldownPeriod;
    reductionFactor = Math.min(Math.max(reductionFactor, 0), 1);
    browser.storage.local.set({ reductionFactor: reductionFactor })
        .then(() => {
        console.log(`Reduction factor updated and stored: ${reductionFactor}`);
        })
        .catch(error => {
        console.error("Error updating and storing reduction factor:", error);
        });
    console.log(`Reduction factor calculated: ${reductionFactor}, based on ${elapsedTime} seconds since last distracting tab closure.`);
    return reductionFactor;
}

function onDistractingTabClosed(tabId) {
    console.log(`Distracting tab closed: Tab ${tabId}. Updating last closure time.`);
    browser.storage.local.set({ lastDistractingTabCloseTime: Date.now() }).then(() => {
        console.log(`Last distracting tab closure time updated for Tab ${tabId}.`);
    });
}

// Reset maxTimeAllowed and other relevant data at midnight
function scheduleDailyReset() {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const delayUntilMidnight = nextMidnight.getTime() - now.getTime();

    browser.alarms.create("dailyReset", { when: Date.now() + delayUntilMidnight });
    console.log("Scheduled daily reset of maxTimeAllowed at:", nextMidnight.toString());
}


browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "dailyReset") {
        console.log("Performing daily reset of maxTimeAllowed.");

        // Update maxTimeAllowed to the default value
        maxTimeAllowed = defaultMaxTimeAllowed;

        // Get the current time to update lastResetTimestamp
        const now = new Date().getTime();

        // Update both maxTimeAllowed and lastResetTimestamp in storage
        browser.storage.local.set({
            maxTimeAllowed,
            lastResetTimestamp: now
        }).then(() => {
            console.log("Max time allowed and last reset timestamp updated.");
        }).catch(error => {
            console.error("Error updating storage:", error);
        });
    }
});


// Check for reset on startup and attach debounced update handler to tab updates
async function checkAndPerformResetOnStartup() {
    console.log("Checking for required reset on startup.");
    const { lastResetTimestamp } = await browser.storage.local.get("lastResetTimestamp");
    const now = new Date();
    const lastReset = lastResetTimestamp ? new Date(lastResetTimestamp) : null;

    if (!lastReset || lastReset.getDate() !== now.getDate()) {
        console.log("Reset required, performing now.");
        maxTimeAllowed = defaultMaxTimeAllowed;
        browser.storage.local.set({ maxTimeAllowed, lastResetTimestamp: now.getTime() });
    } else {
        console.log("No reset required. maxTimeAllowed remains:", maxTimeAllowed);
    }
}

// Increases likelihood of closing all tabs at EoT by 5% for every new tab opened
function increaseCloseProbability() {
    // Clear the existing debounce timer if it exists
    if (increaseProbabilityDebounceTimer) {
        clearTimeout(increaseProbabilityDebounceTimer);
        console.log('Debouncing probability increase.');
    }

    // Set a new debounce timer
    increaseProbabilityDebounceTimer = setTimeout(async () => {
        // Increase the probability within the debounced function
        browserCloseProbability = Math.min(browserCloseProbability + 0.05, 1); // Ensure it doesn't exceed 100%
        console.log(`Increased browser close probability to ${(browserCloseProbability * 100).toFixed(2)}% after debounce delay.`);
        
        // Update the last probability update time and save the new probability
        lastProbabilityUpdateTime = Date.now();
        await browser.storage.local.set({ browserCloseProbability, lastProbabilityUpdateTime });
    }, debounceDelay);
}


// Decreases likelihood by 2.5% every hour
async function applyProbabilityCooldown() {
    const hoursElapsed = (Date.now() - lastProbabilityUpdateTime) / (1000 * 60 * 60);
    const decreaseAmount = 0.05 * hoursElapsed;
    browserCloseProbability = Math.max(0, browserCloseProbability - decreaseAmount);
    console.log(`Applied cooldown to close probability, new value: ${(browserCloseProbability * 100).toFixed(2)}%`);

    // Update the last update time and save the new probability
    lastProbabilityUpdateTime = Date.now();
    await browser.storage.local.set({ browserCloseProbability, lastProbabilityUpdateTime });
}


browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url) handleTabUpdate(tabId, changeInfo);
});

// Listen for messages from other parts of the extension
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "calculateReductionFactor") {
        calculateReductionFactor().then(reductionFactor => {
            sendResponse({ reductionFactor });
        });
        return true; // Indicates you wish to send a response asynchronously
    }
});


initialize().then(checkAndPerformResetOnStartup).then(scheduleDailyReset);
setInterval(applyProbabilityCooldown, 15 * 1000); // Updates browser close probability every hour
setInterval(calculateReductionFactor, 15 * 1000); // 60 * 1000 ms = 1 minute
setInterval(updateIcon, 15 * 1000);
