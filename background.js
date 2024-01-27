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
const defaultMaxTimeAllowed = 1800; // Default maximum time allowed (e.g., 30 minutes)

// Initialization
async function initialize() {
    const { distractingWebsites: storedWebsites, maxTimeAllowed: storedMaxTimeAllowed, lastResetTimestamp } = 
        await browser.storage.local.get(['distractingWebsites', 'maxTimeAllowed', 'lastResetTimestamp']);
    
    distractingWebsites = storedWebsites || defaultDistractingWebsites;
    console.log("Distracting websites list initialized:", distractingWebsites);

    // Check if we need to reset maxTimeAllowed based on the last reset timestamp
    const now = new Date();
    const lastReset = lastResetTimestamp ? new Date(lastResetTimestamp) : null;
    if (!lastReset || lastReset.getDate() !== now.getDate()) {
        maxTimeAllowed = defaultMaxTimeAllowed;
        console.log("Resetting maxTimeAllowed for a new day.");
        await browser.storage.local.set({ maxTimeAllowed, lastResetTimestamp: now.getTime() });
    } else {
        maxTimeAllowed = storedMaxTimeAllowed || defaultMaxTimeAllowed;
    }

    console.log("Initial maximum time allowed set:", maxTimeAllowed, "seconds");
    scheduleDailyReset();
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
    console.log(`Processing update for Tab ${tabId}, URL: ${url}`);

    if (isDistractingWebsite(url)) {
        console.log(`Tab ${tabId} is distracting. Closing other distracting tabs and managing timer.`);
        await closeAndMarkDistractingTabs(tabId);

        if (!tabTimers[tabId]) {
            const timeInterval = await getRandomTimeInterval(tabId);
            console.log(`Starting timer for Tab ${tabId}, Interval: ${timeInterval} seconds`);
            startTimer(tabId, timeInterval);
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
    console.log("Scheduled daily reset of maxTimeAllowed.");
}

browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "dailyReset") {
        console.log("Performing daily reset of maxTimeAllowed.");
        maxTimeAllowed = defaultMaxTimeAllowed;
        browser.storage.local.set({ maxTimeAllowed, lastResetTimestamp: Date.now() });
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

browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url) handleTabUpdate(tabId, changeInfo);
});

initialize().then(checkAndPerformResetOnStartup).then(scheduleDailyReset);
