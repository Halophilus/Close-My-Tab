(function() {
    // Check if the timer element already exists, if not, create it
    let timerElement = document.getElementById('my-extension-timer');
    if (!timerElement) {
        timerElement = document.createElement('div');
        timerElement.id = 'my-extension-timer';
        timerElement.style.position = 'absolute'; // Keep it 'absolute' to maintain page flow
        timerElement.style.top = '0';
        timerElement.style.left = '0';
        timerElement.style.width = '100%'; // Ensure it spans the full width
        timerElement.style.backgroundColor = 'rgba(255, 0, 0, 0.5)';
        timerElement.style.color = 'white';
        timerElement.style.padding = '5px 10px';
        timerElement.style.textAlign = 'center'; // Center the text
        timerElement.style.zIndex = '10000'; // Ensure it's on top of other content
        timerElement.style.display = 'none'; // Initially hide the timer

        // Prepend the timer element to the body to ensure it's at the very top
        document.body.insertBefore(timerElement, document.body.firstChild);
    }

    // Function to update the timer display
    function updateTimerDisplay(timeLeft) {
        if (timeLeft > 0) {
            timerElement.textContent = `Time left: ${timeLeft} seconds`;
            timerElement.style.display = 'block'; // Show the timer when there's time left
        } else {
            timerElement.style.display = 'none'; // Hide the timer when time is up or not applicable
        }
    }

    // Listen for messages from the background script to update or hide the timer
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'updateTimer') {
            updateTimerDisplay(message.timeLeft);
        } else if (message.action === 'hideTimer') {
            // Hide the timer when instructed by the background script
            timerElement.style.display = 'none';
        }
    });
})();
