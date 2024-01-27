// List of distracting websites (can be dynamic based on user settings)
let distractingWebsites;
const defaultDistractingWebsites = ["facebook.com", 
                            "reddit.com",
                            "redd.it",
                            "imgur.com",
                            "x.com",
                            "pinterest.com",
                            "twitter.com", 
                            "instagram.com"];

browser.storage.local.get('distractingWebsites', (result) => {
    distractingWebsites = result.distractingWebsites || defaultDistractingWebsites;
});


// Object to keep track of timers for each tab
let tabTimers = {};

// Initial maximum time allowed in seconds (set by the user)
let maxTimeAllowed = 1800; // Example: 30 minutes

// Probability of closing the browser (0 to 1, where 1 is 100%)
let browserCloseProbability = 0;

console.log("Background script started, initial maxTimeAllowed:", maxTimeAllowed);

// Function to check if a URL is distracting
function isDistractingWebsite(url) {
    const isDistracting = distractingWebsites.some(site => url.includes(site));
    console.log(`Checking if ${url} is a distracting website:`, isDistracting);
    return isDistracting;
}

// Listening for tab updates
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url) {
        console.log(`Tab ${tabId} updated, new URL:`, changeInfo.url);
        handleTabUpdate(tabId, changeInfo.url);
    }
});

// Handling tab updates
function handleTabUpdate(tabId, url) {
    if (isDistractingWebsite(url)) {
        console.log(`Starting timer for tab ${tabId} (distracting website)`);

        // Close the previous distracting tab and wait for it to close
        closePreviousDistractingTab().then(() => {
            // Calculate the reduction factor after the previous tab is closed
            return calculateReductionFactor();
        }).then((reductionFactor) => {
            // Set the time interval for the new tab with the reduction factor applied
            const timeInterval = Math.floor(Math.random() * maxTimeAllowed * reductionFactor) + 1;
            console.log(`Generated random time interval: ${timeInterval} seconds`);
            startTimer(tabId, timeInterval); // Start the timer for the new tab
        }).catch((error) => {
            console.error("Error handling tab update:", error);
        });
    } else {
        console.log(`Stopping timer for tab ${tabId} (not a distracting website)`);
        stopTimer(tabId);
    }
}

// Start a timer for a tab
function startTimer(tabId) {
    stopTimer(tabId); // Stop any existing timer

    let timeLimit = getRandomTimeInterval();
    console.log(`Timer started for tab ${tabId}, time limit: ${timeLimit} seconds`);

    tabTimers[tabId] = {
        startTime: Date.now(),
        timeLimit: timeLimit, // Time limit for this tab session
        timerId: setInterval(() => {
            let currentTime = Date.now();
            let timeSpent = (currentTime - tabTimers[tabId].startTime) / 1000;

            if (timeSpent >= timeLimit) {
                console.log(`Time limit exceeded for tab ${tabId}, closing tab`);
                browser.tabs.remove(tabId); // Close the tab
                reduceMaxTime(timeSpent); // Deduct the time spent from the maximum allowed time
                increaseBrowserCloseProbability(); // Increase the chance of closing the browser
            }
        }, 1000)
    };
}

// Stop the timer for a tab
function stopTimer(tabId) {
    if (tabTimers[tabId]) {
        clearInterval(tabTimers[tabId].timerId);
        console.log(`Timer stopped for tab ${tabId}`);
        delete tabTimers[tabId];
    }
}

// Listening for tab removal to stop the timer
browser.tabs.onRemoved.addListener((tabId) => {
    console.log(`Tab ${tabId} removed, stopping timer`);
    stopTimer(tabId);
});

// Function to update time spent in storage
function updateStorageWithTimeSpent(url, timeSpent) {
    browser.storage.local.get("websiteData")
    .then((result) => {
        let websiteData = result.websiteData || {};
        websiteData[url] = (websiteData[url] || 0) + timeSpent;

        console.log(`Updating time spent for ${url}, new time: ${websiteData[url]}`);
        browser.storage.local.set({websiteData: websiteData});
    })
    .catch((error) => {
        console.error(`Error updating website data for ${url}: ${error}`);
    });
}

// Function to get a random time interval within the allowed range
function getRandomTimeInterval() {
    // Calculate the reduction factor here
    const calculatedReductionFactor = calculateReductionFactor();
    const timeInterval = Math.floor(Math.random() * maxTimeAllowed * calculatedReductionFactor) + 1;
    console.log(`Generated random time interval: ${timeInterval} seconds`);
    return timeInterval;
}

// Constants for cooldown and maximum reduction factor
const cooldownPeriod = 90 * 60; // 90 minutes in seconds
const maxReductionFactor = 1;

// Function to calculate the reduction factor
function calculateReductionFactor() {
    return browser.storage.local.get('lastDistractingWebsiteClosedTime')
        .then((result) => {
            const lastDistractingWebsiteClosedTime = result.lastDistractingWebsiteClosedTime;

            if (!lastDistractingWebsiteClosedTime) {
                // If no distracting website has been closed yet, return max reduction factor
                return maxReductionFactor;
            }

            // Calculate the time elapsed since the last distracting website was closed
            const currentTime = Date.now() / 1000; // Convert to seconds
            const timeElapsed = currentTime - lastDistractingWebsiteClosedTime;

            // Calculate the reduction factor based on the time elapsed
            let reductionFactor = (cooldownPeriod - timeElapsed) / cooldownPeriod;

            // Ensure the reduction factor is within bounds
            reductionFactor = Math.max(0, reductionFactor);
            reductionFactor = Math.min(maxReductionFactor, reductionFactor);

            return reductionFactor;
        });
}

// Function to update the last distracting website closed time
function updateLastDistractingWebsiteClosedTime() {
    const currentTime = Date.now() / 1000; // Convert to seconds
    browser.storage.local.set({ lastDistractingWebsiteClosedTime: currentTime });
}

// Call this function when a distracting website tab is closed
function onDistractingWebsiteClosed() {
    updateLastDistractingWebsiteClosedTime();
}


// Function to reduce the maximum allowed time
function reduceMaxTime(timeSpent) {
    maxTimeAllowed -= timeSpent;
    if (maxTimeAllowed < 0) {
        console.log("maxTimeAllowed went below zero, resetting to 0");
        maxTimeAllowed = 0; // Ensure it doesn't go below zero
    }
    console.log(`Reduced maxTimeAllowed, new value: ${maxTimeAllowed}`);
    browser.storage.local.set({maxTimeAllowed: maxTimeAllowed});
}

// Function to increase the probability of closing the browser
function increaseBrowserCloseProbability() {
    browserCloseProbability += 0.05;
    if (browserCloseProbability > 1) {
        browserCloseProbability = 1;
    }
    console.log(`Increased browserCloseProbability, new value: ${browserCloseProbability}`);

    browser.storage.local.set({browserCloseProbability: browserCloseProbability});

    if (Math.random() < browserCloseProbability) {
        console.log("Probability triggered, closing all tabs");
        closeAllTabs(); // Close all tabs, effectively closing the browser
    }
}

function closeAllTabs() {
    browser.tabs.query({}).then(tabs => {
        const tabIds = tabs.map(tab => tab.id);
        console.log("Closing all tabs:", tabIds);
        browser.tabs.remove(tabIds).catch(err => console.error("Error closing tabs:", err));
    }).catch(err => console.error("Error querying tabs:", err));
}

// Function to reset the maximum time allowed and browser close probability
function resetMaxTimeAndProbability() {
    console.log("Resetting maxTimeAllowed and browserCloseProbability to initial values");
    maxTimeAllowed = 1800;
    browserCloseProbability = 0;
    browser.storage.local.set({maxTimeAllowed: maxTimeAllowed, browserCloseProbability: browserCloseProbability});

    let lastResetDate = new Date().toISOString().split('T')[0];
    browser.storage.local.set({lastResetDate: lastResetDate});
}

// Function to schedule a daily reset
function scheduleDailyReset() {
    console.log("Scheduling daily reset for maxTimeAllowed and browserCloseProbability");
    browser.alarms.create("midnightReset", {
        when: Date.now() + timeUntilMidnight(),
        periodInMinutes: 1440
    });
}

// Alarm listener
browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "midnightReset") {
        console.log("Midnight reset triggered");
        resetMaxTimeAndProbability();
    }
});

// Calculate time until midnight
function timeUntilMidnight() {
    let now = new Date();
    let midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
    return midnight.getTime() - now.getTime();
}

// Retrieve the stored maximum time allowed, last reset date, and browser close probability on startup
browser.storage.local.get(["maxTimeAllowed", "lastResetDate", "browserCloseProbability"])
.then((result) => {
    let today = new Date().toISOString().split('T')[0];
    if (result.lastResetDate !== today) {
        console.log("Last reset date is not today, resetting values");
        resetMaxTimeAndProbability();
    } else {
        maxTimeAllowed = result.maxTimeAllowed || 1800;
        browserCloseProbability = result.browserCloseProbability || 0;
        console.log("Retrieved maxTimeAllowed and browserCloseProbability from storage");
    }
})
.catch((error) => {
    console.error("Error retrieving data on startup:", error);
    maxTimeAllowed = 1800;
    browserCloseProbability = 0;
});

// Handling tab updates
function handleTabUpdate(tabId, url) {
    if (isDistractingWebsite(url)) {
        console.log(`Starting timer for tab ${tabId} (distracting website)`);

        // Close all other distracting tabs
        closeOtherDistractingTabs(tabId);

        startTimer(tabId);
    } else {
        console.log(`Stopping timer for tab ${tabId} (not a distracting website)`);
        stopTimer(tabId);
    }
}

// Function to close the previous distracting tab and wait for it to close
function closePreviousDistractingTab() {
    return new Promise((resolve) => {
        browser.tabs.query({}).then(tabs => {
            for (const tab of tabs) {
                if (isDistractingWebsite(tab.url)) {
                    console.log(`Closing previous distracting tab ${tab.id}`);
                    browser.tabs.remove(tab.id).then(() => {
                        resolve(); // Resolve the promise when the tab is closed
                    });
                    return; // Exit the loop after closing the first distracting tab
                }
            }
            resolve(); // Resolve the promise if no previous distracting tab is found
        });
    });
}


scheduleDailyReset();
