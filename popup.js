document.addEventListener('DOMContentLoaded', () => {
    updateRemainingTime();
    document.getElementById('addWebsite').addEventListener('click', addWebsiteToBlacklist);
});

function updateRemainingTime() {
    // Fetch the remaining time from storage
    browser.storage.local.get('maxTimeAllowed', (result) => {
        let totalSeconds = result.maxTimeAllowed || 0;
        let minutes = Math.floor(totalSeconds / 60);
        let seconds = totalSeconds % 60;

        // Format time as MM:SS
        let formattedTime = `${minutes} minutes and ${seconds} seconds`;
        document.getElementById('timeLeft').textContent = `Time Left: ${formattedTime}`;
    });
}

function addWebsiteToBlacklist() {
    const newWebsite = document.getElementById('newWebsite').value;
    if (newWebsite) {
        // Update the list of distracting websites in storage
        browser.storage.local.get('distractingWebsites', (result) => {
            let websites = result.distractingWebsites || [];
            websites.push(newWebsite);

            browser.storage.local.set({distractingWebsites: websites}, () => {
                console.log('Website added to blacklist');
                document.getElementById('newWebsite').value = ''; // Clear input field
            });
        });
    }
}
