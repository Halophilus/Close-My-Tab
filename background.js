// Enhanced Productivity Firefox Extension Script with Probability Feature

// List of distracting websites (can be dynamic based on user settings)
let distractingWebsites;
const defaultDistractingWebsites = [
    "facebook.com", "reddit.com", "redd.it", "imgur.com", "x.com",
    "pinterest.com", "twitter.com", "instagram.com"
];

let tabTimers = {}; // Tracks timers for tabs
let tabCloseReasons = {}; // Tracks reasons for tab closures
let updateTimeouts = {}; // For debouncing tab updates
let browserCloseProbability = 0; // Probability of closing all tabs

let maxTimeAllowed = 1800; // Initial max time allowed (e.g., 30 minutes)

// Initialization
async function initialize() {
    const result = await browser.storage.local.get(['distractingWebsites', 'browserCloseProbability', 'lastProbabilityUpdateTime']);
    distractingWebsites = result.distractingWebsites || defaultDistractingWebsites;
    updateProbabilityBasedOnCooldown(result.browserCloseProbability, result.lastProbabilityUpdateTime);
    console.log("Extension initialized with settings:", { distractingWebsites, browserCloseProbability });
}

// Update probability based on cooldown
async function updateProbabilityBasedOnCooldown(storedProbability, lastUpdateTime) {
    const now = Date.now();
    const hoursSinceUpdate = lastUpdateTime ? (now - lastUpdateTime) / (1000 * 60 * 60) : 0;
    browserCloseProbability = Math.max(storedProbability - (0.025 * hoursSinceUpdate), 0); // Decrease by 2.5% per hour, minimum 0

    // Update the stored values to reflect any cooldown adjustments
    await browser.storage.local.set({ browserCloseProbability, lastProbabilityUpdateTime: now });
    console.log(`Browser close probability after cooldown: ${browserCloseProbability * 100}%`);
}

function isDistractingWebsite(url) {
    return distractingWebsites.some(site => url.includes(site));
}

// Debounced handling of tab updates
function handleTabUpdate(tabId, changeInfo) {
    if (updateTimeouts[tabId]) {
        clearTimeout(updateTimeouts[tabId]);
    }

    updateTimeouts[tabId] = setTimeout(() => {
        processTabUpdate(tabId, changeInfo.url);
        delete updateTimeouts[tabId];
    }, 100); // Adjust debounce time as needed
}

// Processing tab updates after debouncing
async function processTabUpdate(tabId, url) {
    if (isDistractingWebsite(url)) {
        await closeAndMarkDistractingTabs(tabId);
        await updateProbabilityOnNewTab(); // Increase probability when a new distracting tab is opened
        if (!tabTimers[tabId]) {
            const timeInterval = await getRandomTimeInterval();
            startTimer(tabId, timeInterval);
        }
    } else if (tabTimers[tabId]) {
        stopTimer(tabId);
    }
}

// Increase probability on new distracting tab
async function updateProbabilityOnNewTab() {
    browserCloseProbability = Math.min(browserCloseProbability + 0.05, 1); // Increase by 5%, max 1
    await browser.storage.local.set({ browserCloseProbability, lastProbabilityUpdateTime: Date.now() });
    console.log(`Updated browser close probability to ${browserCloseProbability * 100}%`);
}

// Close existing distracting tabs except the new one
async function closeAndMarkDistractingTabs(newTabId) {
    const tabs = await browser.tabs.query({});
    for (const tab of tabs.filter(tab => tab.id !== newTabId && isDistractingWebsite(tab.url))) {
        tabCloseReasons[tab.id] = 'timer';
        await browser.tabs.remove(tab.id);
        delete tabTimers[tab.id];
        delete tabCloseReasons[tab.id];
    }
}

// Starting a timer for a tab
function startTimer(tabId, timeInterval) {
    if (tabTimers[tabId]) {
        stopTimer(tabId);
    }

    tabTimers[tabId] = {
        startTime: Date.now(),
        timerId: setInterval(() => {
            let elapsed = (Date.now() - tabTimers[tabId].startTime) / 1000;
            if (elapsed >= timeInterval) {
                closeTabByTimer(tabId);
            }
        }, 1000)
    };
}

// Closing a tab due to timer expiration and checking for all tabs closure
function closeTabByTimer(tabId) {
    browser.tabs.remove(tabId).then(() => {
        onDistractingTabClosed(tabId); // Update last distracting tab close time
        checkAndCloseAllTabs(); // Check probability and decide whether to close all tabs
    });
}

// Check and potentially close all tabs based on the current probability
function checkAndCloseAllTabs() {
    if (Math.random() < browserCloseProbability) {
        browser.tabs.query({}).then(tabs => {
            const tabIds = tabs.map(tab => tab.id);
            browser.tabs.remove(tabIds);
        });
    }
}

// Stopping a timer for a tab
function stopTimer(tabId) {
    if (tabTimers[tabId]) {
        clearInterval(tabTimers[tabId].timerId);
        delete tabTimers[tabId];
    }
}

// Update last distracting tab close time
function onDistractingTabClosed(tabId) {
    browser.storage.local.set({ lastDistractingTabCloseTime: Date.now() });
}

// Calculate a random time interval considering the reduction factor
async function getRandomTimeInterval() {
    const reductionFactor = await calculateReductionFactor();
    const interval = Math.floor(Math.random() * maxTimeAllowed * reductionFactor) + 1;
    return interval;
}

// Calculate the reduction factor based on the cooldown logic
async function calculateReductionFactor() {
    const result = await browser.storage.local.get('lastDistractingTabCloseTime');
    const lastCloseTime = result.lastDistractingTabCloseTime;
    const currentTime = Date.now();

    if (!lastCloseTime) {
        return 1;
    }

    const elapsedTime = (currentTime - lastCloseTime) / 1000;
    const cooldownPeriod = 90 * 60; // 90 minutes in seconds

    let reductionFactor = elapsedTime / cooldownPeriod;
    reductionFactor = Math.min(Math.max(reductionFactor, 0), 1);
    return reductionFactor;
}

// Listener for tab removals to handle cleanup and state updates
browser.tabs.onRemoved.addListener((tabId, removeInfo) => {
    if (tabCloseReasons[tabId] !== 'timer') {
        if (tabTimers[tabId]) { // Indicates the closed tab was distracting
            onDistractingTabClosed(tabId); // Update last closure time for user-closed distracting tabs
        }
    }
    delete tabTimers[tabId];
    delete tabCloseReasons[tabId];
});

// Attach the debounced update handler to tab updates
browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url) {
        handleTabUpdate(tabId, changeInfo);
    }
});

// Initialize the extension
initialize();
