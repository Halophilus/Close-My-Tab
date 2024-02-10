(function() {
    // Check if the timer element already exists, if not, create it
    let timerElement = document.getElementById('my-extension-timer');
    if (!timerElement) {
        timerElement = document.createElement('div');
        timerElement.id = 'my-extension-timer';
        timerElement.style.position = 'absolute'; // Changed from 'fixed' to 'absolute'
        timerElement.style.top = '0';
        timerElement.style.left = '0';
        timerElement.style.width = '100%'; // Ensure it spans the full width
        timerElement.style.backgroundColor = 'rgba(255, 0, 0, 0.5)';
        timerElement.style.color = 'white';
        timerElement.style.padding = '5px 10px';
        timerElement.style.textAlign = 'center'; // Center the text
        timerElement.style.zIndex = '10000'; // Ensure it's on top of other content

        // Prepend the timer element to the body to ensure it's at the very top
        document.body.insertBefore(timerElement, document.body.firstChild);
    }

    // Function to update the timer display
    function updateTimerDisplay(timeLeft) {
        timerElement.textContent = `Time left: ${timeLeft} seconds`;
    }

    // Listen for messages from the background script to update the timer
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'updateTimer') {
            updateTimerDisplay(message.timeLeft);
        }
    });
})();
