# CLOSE MY TAB Firefox Extension

![Logo](/icons/main.png)

This Firefox extension is designed to help users manage their time on distracting websites more effectively. By setting time limits and enforcing cooldown periods, it encourages more disciplined browsing habits.

## Features

### Distracting Websites List
- Users can define a list of websites considered distracting.
- The extension monitors browsing activity and identifies when a user navigates to these sites.

### Time Limits
- A daily time allowance (`maxTimeAllowed`) is set for browsing distracting websites.
- Each session on a distracting website is timed, and the duration is deducted from the daily allowance.

### Random Time Intervals
- When a user navigates to a distracting website, a random timer starts, the duration of which is within the remaining daily allowance.
- Once the timer ends, the tab is automatically closed.

### Reduction Factor
- The time allowance for new sessions on distracting websites is reduced based on the elapsed time since the last session ended.
- This reduction factor gradually resets over 90 minutes, encouraging breaks between sessions.

### Browser Close Probability
- Each new session on a distracting website increases the probability of all tabs being closed when the session ends.
- This probability increases by 5% with each new distracting tab opened and decreases by 2.5% every hour, resetting to 0% daily.

### Persistence and Reset
- The remaining daily time allowance and the probability of closing all tabs are stored persistently.
- These values reset every midnight, ensuring a fresh start each day.

### Comprehensive Logging
- Detailed diagnostic log statements provide insights into the extension's behavior for troubleshooting and understanding usage patterns.

## Usage

After installing the extension, users should:
1. Define their list of distracting websites through the extension settings.
2. Adjust the daily time allowance (`maxTimeAllowed`) as needed.
3. Browse as usual. The extension will monitor activity on distracting websites and enforce the set limits.

## Installation

Currently, this extension must be loaded into Firefox as a temporary add-on via `about:debugging` for development and testing purposes. Future updates will include standard installation methods through Firefox Add-ons.

