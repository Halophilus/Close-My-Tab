let initialElapsedTimeInSeconds = null;
let elapsedTimeInterval;

document.addEventListener('DOMContentLoaded', () => {
    updateUI();
    document.getElementById('addSite').addEventListener('click', addSiteToBlacklist);
    setInterval(updateTimeSinceLastClose, 1000); // Update the timer every second
});

function updateUI() {
    browser.storage.local.get([
        'maxTimeAllowed',
        'defaultMaxTimeAllowed',
        'lastDistractingTabCloseTime',
        'browserCloseProbability',
        'reductionFactor'
    ]).then(data => {
        const now = Date.now();
        
        // Time Remaining
        const timeRemainingRatio = data.maxTimeAllowed / 1800;
        updateProgressBar('timeRemaining', timeRemainingRatio, 'Time Remaining');

        // Reduction Factor
        updateProgressBar('reductionFactor', data.reductionFactor, 'Reduction Factor');

        // Close Probability
        updateProgressBar('closeProbability', data.browserCloseProbability, 'Close Probability');

        // Time Since Last Close
        updateTimeSinceLastClose(data.lastDistractingTabCloseTime);
    });
}

function updateProgressBar(id, value, label) {
    const progressBar = document.getElementById(id);
    progressBar.style.width = `${value * 100}%`;
    const container = progressBar.closest('.progress-container');
    const title = container.querySelector('.title');
    title.textContent = `${label}: ${(value * 100).toFixed(2)}%`;
}

function addSiteToBlacklist() {
    const newSite = document.getElementById('newSite').value.trim();
    if (newSite) {
        browser.runtime.sendMessage({ action: "addBlacklistSite", site: newSite }).then(response => {
            if (response.success) {
                document.getElementById('newSite').value = ''; // Clear the input field
                updateUI(); // Refresh the UI to reflect changes
            } else {
                console.error("Error adding site to blacklist:", response.error);
            }
        }).catch(error => {
            console.error("Error sending message:", error);
        });
    }
}

function updateTimeSinceLastClose(lastCloseTime) {
    // This function now only needs the lastCloseTime for the initial calculation
    if (!lastCloseTime) {
        document.getElementById('timeSinceLastClose').textContent = `Time Since Last Close:`;
        return;
    }

    setInterval(() => {
        const now = Date.now();
        const elapsedTimeInSeconds = Math.floor((now - lastCloseTime) / 1000); // Calculate elapsed time directly based on the current time

        const hours = Math.floor(elapsedTimeInSeconds / 3600);
        const minutes = Math.floor((elapsedTimeInSeconds % 3600) / 60);
        const seconds = elapsedTimeInSeconds % 60;

        const formattedTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        document.getElementById('timeSinceLastClose').textContent = `Time Since Last Close: ${formattedTime}`;
    }, 1000);
}

updateUI();
setInterval(updateUI, 60 * 1000);
