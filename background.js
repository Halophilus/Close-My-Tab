// List of distracting websites (can be dynamic based on user settings)
let distractingWebsites;
const defaultDistractingWebsites = [
    "facebook.com", "reddit.com", "redd.it", "imgur.com", "x.com",
    "pinterest.com", "twitter.com", "instagram.com", "linkedin.com"
];

let tabTimers = {}; // Tracks timers for tabs
let tabCloseReasons = {}; // Tracks reasons for tab closures
let updateTimeouts = {}; // For debouncing tab updates
let tabNavigationHistory = {}; // Example: {tabId: ["previousUrl", "currentUrl"]}
let gracePeriodDebounceTimeouts = {}; 
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
    browser.tabs.sendMessage(tabId, { action: 'hideTimer' }).catch(console.error);
    if (isDistractingWebsite(url)) {
        console.log(`Tab ${tabId} is distracting.`);

        // Check if the tab is currently in a grace period and navigates to another distracting site
        if (tabTimers[tabId] && tabTimers[tabId].isGracePeriod) {
            console.log(`Tab ${tabId} was in a grace period but navigated to another distracting site. Ending grace period and starting timer.`);
            clearTimeout(tabTimers[tabId].timerId); // Clear the grace period timer
            delete tabTimers[tabId].isGracePeriod; // Remove the grace period flag
            const timeInterval = await getRandomTimeInterval(tabId);
            startTimer(tabId, timeInterval); // Start the timer immediately
            return; // Prevent further execution to avoid re-evaluation of grace period
        }

        // Debounce the grace period evaluation for new navigations
        if (!tabTimers[tabId]) {
            if (gracePeriodDebounceTimeouts[tabId]) {
                clearTimeout(gracePeriodDebounceTimeouts[tabId]);
                console.log(`Debouncing grace period evaluation for Tab ${tabId}`);
            }

            gracePeriodDebounceTimeouts[tabId] = setTimeout(async () => {
                let previousUrl = tabNavigationHistory[tabId] && tabNavigationHistory[tabId].length > 1 ? tabNavigationHistory[tabId][tabNavigationHistory[tabId].length - 2] : null;
                if (previousUrl && isAllowedContext(previousUrl) && url.length > 50) {
                    console.log(`Tab ${tabId} navigated from an allowed context with URL length > 30. Starting grace period.`);
                    startGracePeriodTimer(tabId, 90); // Adjust grace period as needed
                } else {
                    console.log(`Starting active timer for Tab ${tabId}.`);
                    const timeInterval = await getRandomTimeInterval(tabId);
                    startTimer(tabId, timeInterval); // Start actively deducting time from maxTimeAllowed
                    increaseCloseProbability(); // Debounced increase of close probability
                }
                delete gracePeriodDebounceTimeouts[tabId];
            }, 2000); // Adjust debounce time as needed
        }
    } else if (tabTimers[tabId]) {
        console.log(`Tab ${tabId} navigated from distracting to non-distracting site. Stopping timer.`);
        // deductTime(tabId);
        onDistractingTabClosed(tabId);
        stopTimer(tabId);
        delete tabCloseReasons[tabId];
    } else {
        console.log(`Tab ${tabId} is non-distracting and has no active timer.`);
    }
}


function startGracePeriodTimer(tabId, gracePeriod) {
    stopTimer(tabId); // Ensure no existing timer is running

    let gracePeriodId = setInterval(() => {
        if (!tabTimers[tabId] || tabTimers[tabId].stopped) {
            console.log(`Grace period for Tab ${tabId} ended.`);
            clearInterval(gracePeriodId);
            delete tabTimers[tabId];
            return;
        }

        browser.tabs.get(tabId).then(tab => {
            if (!(tab && isDistractingWebsite(tab.url))) {
                console.log(`Tab ${tabId} no longer on a distracting site. Stopping grace period.`);
                clearInterval(gracePeriodId);
                delete tabTimers[tabId];
            }
        }).catch(error => {
            console.error(`Error checking Tab ${tabId} during grace period:`, error);
            clearInterval(gracePeriodId);
            delete tabTimers[tabId];
        });
    }, 1000); // Check every second

    tabTimers[tabId] = {
        startTime: Date.now(),
        timerId: gracePeriodId,
        stopped: false,
        isGracePeriod: true
    };
}


async function fetchAndStartTimer(tabId) {
    const timeInterval = await getRandomTimeInterval(tabId);
    console.log(`Starting regular timer for Tab ${tabId}, Interval: ${timeInterval} seconds`);
    startTimer(tabId, timeInterval);
}

function isAllowedContext(url) {
    // List of allowed contexts (search engines in this example)
    const allowedContexts = [
        'https://www.google.com/search',
        'https://www.bing.com/search',
        'https://duckduckgo.com/'
    ];

    // Check if the URL starts with any of the allowed contexts
    return allowedContexts.some(allowedUrl => url.startsWith(allowedUrl));
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
    stopTimer(tabId); // Ensure any existing timer is stopped before starting a new one

    console.log(`Starting timer for Tab ${tabId}, Duration: ${timeInterval} seconds`);
    
    // Inject the content script into the tab
    browser.tabs.executeScript(tabId, {
        file: "/content-script.js", // Specify the path to your content script
        runAt: 'document_start' // Ensure the script runs before the webpage is fully loaded
    }).then(() => {
        console.log(`Content script injected into Tab ${tabId}`);
    }).catch(error => {
        console.error(`Error injecting content script into Tab ${tabId}:`, error);
    });    

    let intervalId = setInterval(async () => {
        if (!tabTimers[tabId] || tabTimers[tabId].stopped) {
            console.log(`Timer for Tab ${tabId} no longer exists or is marked as stopped. Exiting interval.`);
            clearInterval(intervalId);
            delete tabTimers[tabId]; // Ensure cleanup if the timer is stopped or doesn't exist
            return;
        }

        try {
            let tab = await browser.tabs.get(tabId);
            if (!tab) {
                console.log(`Tab ${tabId} does not exist. Stopping timer.`);
                clearInterval(intervalId);
                delete tabTimers[tabId]; // Cleanup since tab no longer exists
                return;
            }
        } catch (error) {
            console.error(`Error getting Tab ${tabId}:`, error);
            clearInterval(intervalId);
            delete tabTimers[tabId]; // Cleanup in case of an error fetching tab details
            return;
        }

        // Deduct one second from maxTimeAllowed every tick
        maxTimeAllowed = Math.max(0, maxTimeAllowed - 1);
        console.log(`Deducted 1 second from maxTimeAllowed. New maxTimeAllowed: ${maxTimeAllowed} seconds.`);

        // Send a message to the content script in the tab to update the displayed timer
        browser.tabs.sendMessage(tabId, { action: 'updateTimer', timeLeft: maxTimeAllowed });

        let elapsed = (Date.now() - tabTimers[tabId].startTime) / 1000;
        console.log(`Timer Check for Tab ${tabId}, Elapsed: ${elapsed} seconds`);

        if (elapsed >= timeInterval || maxTimeAllowed <= 0) {
            console.log(`Timer expired for Tab ${tabId} or maxTimeAllowed reached 0. Initiating tab closure.`);
            clearInterval(intervalId); // Stop the timer
            closeTabByTimer(tabId);
        }
    }, 1000);

    tabTimers[tabId] = {
        startTime: Date.now(),
        timerId: intervalId,
        stopped: false
    };
}


function checkAndHandleAllotmentExpiry() {
    if (maxTimeAllowed <= 0) {
        console.log(`Allotment spent. Disabling all active timers.`)
        Object.keys(tabTimers).forEach(tabId => {
            stopTimer(tabId);
            delete tabTimers[tabId];
        });
    }
}

function stopTimer(tabId) {
    if (tabTimers[tabId] && tabTimers[tabId].timerId) {
        console.log(`Stopping timer for Tab ${tabId}`);
        clearInterval(tabTimers[tabId].timerId);
        tabTimers[tabId].stopped = true;
        delete tabTimers[tabId];
        browser.tabs.sendMessage(tabId, { action: 'hideTimer' }).catch(console.error);
    }
}



function closeTabByTimer(tabId) {
    console.log(`Closing Tab ${tabId} due to timer expiration.`);
    if (!tabTimers[tabId]) {
        console.log(`No timer found for Tab ${tabId} upon closing, possible previous clear.`);
        return; // Exit if there's no timer to prevent errors
    }

    tabCloseReasons[tabId] = 'timer';
    // deductTime(tabId); // Ensure time is deducted before clearing the timer
    
    browser.tabs.remove(tabId).then(() => {
        console.log(`Tab ${tabId} closed by timer.`);
        onDistractingTabClosed(tabId); // Update the last closure time
        stopTimer(tabId); // Make sure to stop the timer after tab closure
    });
}

browser.tabs.onRemoved.addListener((tabId, removeInfo) => {
    if (tabTimers[tabId] && tabTimers[tabId].isGracePeriod) {
        console.log(`Distracting Tab ${tabId} closed during grace period. Not affecting reduction factor.`);
        // Grace period cleanup
        stopTimer(tabId);  // Ensure the grace period timer is stopped
        delete tabTimers[tabId];  // Remove the timer entry for this tab
    } else if (tabTimers[tabId]) {
        console.log(`Distracting Tab ${tabId} closed after grace period.`);
        // deductTime(tabId);  // Deduct time from maxTimeAllowed
        onDistractingTabClosed(tabId);  // Update the last closure time, affecting reduction factor
        stopTimer(tabId);  // Stop the timer
        delete tabTimers[tabId];  // Remove the timer entry for this tab
    }

    // Cleanup for any tab, regardless of grace period or timer status
    delete tabCloseReasons[tabId];
});

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
    // const interval = Math.floor(Math.max(Math.random(), 0.1) * remainingTime * reductionFactor) + 1;
    const interval = Math.floor(remainingTime * reductionFactor) + 1;
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
        //console.log(`Reduction factor updated and stored: ${reductionFactor}`);
        })
        .catch(error => {
        console.error("Error updating and storing reduction factor:", error);
        });
    //console.log(`Reduction factor calculated: ${reductionFactor}, based on ${elapsedTime} seconds since last distracting tab closure.`);
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

browser.webNavigation.onCommitted.addListener(details => {
    if (details.frameId === 0) { // 0 indicates the main frame
        const { tabId, url } = details;
        if (!tabNavigationHistory[tabId]) {
            tabNavigationHistory[tabId] = [];
        }
        tabNavigationHistory[tabId].push(url);

        // Keep history manageable, consider only the last 2 entries
        if (tabNavigationHistory[tabId].length > 2) {
            tabNavigationHistory[tabId].shift(); // Remove the oldest entry
        }
    }
});

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
        console.log("Daily reset required, performing now.");
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
    //console.log(`Applied cooldown to close probability, new value: ${(browserCloseProbability * 100).toFixed(2)}%`);

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

async function addSiteToBlacklist(newSite) {
    // Add the new site to the array if it's not already included
    if (!distractingWebsites.includes(newSite)) {
        distractingWebsites.push(newSite);

        // Optionally, save the updated list to storage
        await browser.storage.local.set({ distractingWebsites });
        
        console.log(`Added "${newSite}" to distracting websites list:`, distractingWebsites);
    }
}

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "addBlacklistSite" && message.site) {
        addSiteToBlacklist(message.site).then(() => {
            sendResponse({ success: true });
        }).catch(error => {
            console.error("Error adding site to blacklist:", error);
            sendResponse({ success: false, error: error.toString() });
        });
        return true; // Indicates that the response will be sent asynchronously
    }
});

async function checkAndResetTimeAllotment() {
    const { lastResetTimestamp } = await browser.storage.local.get("lastResetTimestamp");
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000)); // 24 hours ago from now

    // Convert the lastResetTimestamp to a Date object for comparison
    const lastReset = lastResetTimestamp ? new Date(lastResetTimestamp) : null;

    // Check if more than 24 hours have passed since the last reset
    if (lastReset && lastReset <= twentyFourHoursAgo) {
        //console.log("More than 24 hours have passed since the last reset. Resetting maxTimeAllowed.");

        // Reset maxTimeAllowed to default
        maxTimeAllowed = defaultMaxTimeAllowed;

        // Update both maxTimeAllowed and lastResetTimestamp in storage
        await browser.storage.local.set({
            maxTimeAllowed,
            lastResetTimestamp: now.getTime() // Update lastResetTimestamp to current time
        });
    } else {
        //console.log("Less than 24 hours have passed since the last reset. No reset needed at this time.");
    }
}



initialize().then(checkAndPerformResetOnStartup).then(scheduleDailyReset);
setInterval(applyProbabilityCooldown, 15 * 1000); // Updates browser close probability every hour
setInterval(calculateReductionFactor, 15 * 1000); 
setInterval(updateIcon, 15 * 1000);
setInterval(checkAndResetTimeAllotment, 15 * 1000); // 15 * 1000 ms = 15 seconds
setInterval(checkAndHandleAllotmentExpiry, 300000);
