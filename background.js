// List of distracting websites (can be dynamic based on user settings)
let distractingWebsites;
const defaultDistractingWebsites = [
    "facebook.com", "reddit.com", "redd.it", "imgur.com", "x.com",
    "pinterest.com", "twitter.com", "instagram.com"
];

// Initialization
browser.storage.local.get('distractingWebsites', (result) => {
    distractingWebsites = result.distractingWebsites || defaultDistractingWebsites;
    console.log("Distracting websites list initialized:", distractingWebsites);
});

let tabTimers = {}; // Tracks timers for tabs
let tabCloseReasons = {}; // Tracks reasons for tab closures
let updateTimeouts = {}; // For debouncing tab updates

let maxTimeAllowed = 1800; // Initial max time allowed (e.g., 30 minutes)
console.log("Initial maximum time allowed set:", maxTimeAllowed, "seconds");

function isDistractingWebsite(url) {
    const isDistracting = distractingWebsites.some(site => url.includes(site));
    console.log(`URL "${url}" is distracting:`, isDistracting);
    return isDistracting;
}

// Debounced handling of tab updates
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

// Processing tab updates after debouncing
async function processTabUpdate(tabId, url) {
    console.log(`Processing update for Tab ${tabId}, URL: ${url}`);

    if (isDistractingWebsite(url)) {
        console.log(`Tab ${tabId} is distracting. Closing other distracting tabs and managing timer.`);
        await closeAndMarkDistractingTabs(tabId);

        if (!tabTimers[tabId]) {
            const timeInterval = await getRandomTimeInterval();
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

// Closing existing distracting tabs except the new one
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

// Starting a timer for a tab
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

// Closing a tab due to timer expiration
function closeTabByTimer(tabId) {
    tabCloseReasons[tabId] = 'timer';
    console.log(`Closing Tab ${tabId} due to timer expiration.`);
    browser.tabs.remove(tabId);
}

// Stopping a timer for a tab
function stopTimer(tabId) {
    if (tabTimers[tabId]) {
        console.log(`Stopping timer for Tab ${tabId}`);
        clearInterval(tabTimers[tabId].timerId);
        delete tabTimers[tabId];
    }
}

// Listener for tab removals to handle cleanup and state updates
browser.tabs.onRemoved.addListener((tabId, removeInfo) => {
    console.log(`Tab ${tabId} removed, Reason:`, tabCloseReasons[tabId] ? 'Timer' : 'User action');
    delete tabTimers[tabId];
    delete tabCloseReasons[tabId];
});

// Calculate a random time interval considering the reduction factor
async function getRandomTimeInterval() {
    const reductionFactor = await calculateReductionFactor();
    const interval = Math.floor(Math.random() * maxTimeAllowed * reductionFactor) + 1;
    console.log(`Calculated time interval: ${interval} seconds, Reduction factor: ${reductionFactor}`);
    return interval;
}

// Calculate the reduction factor based on the cooldown logic
async function calculateReductionFactor() {
    const result = await browser.storage.local.get('lastDistractingWebsiteClosedTime');
    const lastClosed = result.lastDistractingWebsiteClosedTime || 0;
    const elapsed = (Date.now() - lastClosed) / 1000;
    const cooldown = 90 * 60; // 90 minutes in seconds

    const factor = elapsed >= cooldown ? 1 : 1 - (elapsed / cooldown);
    console.log(`Reduction factor calculated: ${factor}, Elapsed time: ${elapsed} seconds`);
    return factor;
}

// Reset and persistence logic
function resetMaxTimeAndProbability() {
    console.log("Resetting max time allowed and other state variables.");
    maxTimeAllowed = 1800; // Reset to default or user-defined value
    browser.storage.local.set({ lastResetTimestamp: Date.now() });
    console.log("Reset operation completed, timestamp updated.");
}

// Check for reset on startup
async function checkAndPerformResetOnStartup() {
    console.log("Checking for required reset on startup.");
    const { lastResetTimestamp } = await browser.storage.local.get(["lastResetTimestamp"]);
    const now = Date.now();

    if (!lastResetTimestamp || now - lastResetTimestamp >= 24 * 60 * 60 * 1000) {
        console.log("Reset required, performing now.");
        resetMaxTimeAndProbability();
    } else {
        console.log("No reset required.");
    }
}

checkAndPerformResetOnStartup();

// Attach the debounced update handler to tab updates
browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url) {
        handleTabUpdate(tabId, changeInfo);
    }
});
