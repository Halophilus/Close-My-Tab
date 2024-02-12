# CLOSE MY TAB Firefox Extension

![Logo](/icons/banner_hires.png)

This Firefox extension is designed to help users manage their time on distracting websites more effectively. By setting time limits and enforcing cooldown periods, it encourages more disciplined browsing habits.

It encourages productive browsing habits by assigning random time limits to tabs containing distracting content ranging from the total time allotment to 10% of that value multiplied by the reduction factor. Every second spent on a distracting website decrements from a time allotment. Every time a distracting tab is closed, there is a period where the time limits are multiplied by a reduction factor that approaches 1 after a 90 minute cooldown. Every time a distracting tab is opened, the likelihood of a browser closing event at the end of the timer increases by 5%. This probability decrements by 2.5% every hour. At midnight, time allotment resets, but any remaining cooldown depends on user behavior. This was designed as a means of discouraging compulsive browsing behaviors that impede the productive use of the internet.

The goal of productivity apps shouldn't be to shame and infantalize users into adopting behaviors that don't come to them organically, it should be to create boundaries that arne't overly-restrictive that force the user to think about short and long-term consequences of absent-mindedly sleepwalking through the internet and remind them of the value of their free time.

## Features

### Distracting Websites List
- The list of distracting websites is partially pre-determined by `background.js`, but it can be dynamically expanded through the popup menu.
- The extension monitors browsing activity and identifies when a user navigates to these sites in new and existing tabs.
- This extension essentially forces the user to gamble with the amount of time they spend on distracting websites, increasing the likelihood of the browser closing altogether and decreasing the amount of time that can be dedicated to a distraction session over 24 hours and over various cooldown periods.
- Websites can be added through the popup menu, but removing them requires deeper, inconvenient configuration of the app.

### Time Limits
- A daily time allowance (`maxTimeAllowed`) is set for browsing distracting websites.
- Every time a distracting tab is opened, a timer is assigned based on the reduction factor and a random time limit between 10% and 100% of `maxTimeAllowed`
- While this timer is running, time is actively being deducted from the daily time allowance.
- When vistiting a distracting web page, a visible timer is injected using `content-script.js` shown at the top of the page, forcing the user to scroll all the way up to check it.
    - This timer dynamically reflects the time remaining in the allowance, reflecting multiple concurrent timers from multiple tabs.
    !['Countdown timer'](/icons/timer.png)
    - This shows the current `maxTimeAllowed`, or the remaining time available for the day.
    - This does NOT reflect the current timer for the tab. 
- Each session on a distracting website is timed, and the duration is deducted from the daily allowance.
- Multiple distracting tabs can be opened concurrently, but concurrent timers compound the time deducted from a daily allotment. 
- If the user navigates from a distracting site to a second distracting site within the same tab, the timer persists with the original allowance.

### Time Intervals
- When a user navigates to a distracting website, a timer starts, the duration of which is within the remaining daily allowance.
- Once the timer ends, the tab is automatically closed.
- This time interval is not revealed to the user.
- This timer ends at the end of its random interval, if the tab is closed, or if the user navigates to a non-distracting site within the tab.

### Reduction Factor
- The time allowance for new sessions on distracting websites is reduced based on the elapsed time since the last session ended.
- This reduction factor gradually resets over 90 minutes, encouraging breaks between sessions but still allowing for some transient distraction within that interval.
- The reduction factor is reset to 0 only after a distracting tab is closed. This allows the user to open several concurrent distracting tabs without the reduction factor impacting the time interval computation for that tab.

### Browser Close Probability
- Each new session on a distracting website increases the probability of all tabs being closed when a timer ends.
- This event only applies to tabs that are closed by a timer, and will not occur when a tab is closed by the user.
- This probability increases by 5% with each new distracting tab opened and decreases by 2.5% every hour.
- Browser close probability increases when a tab is opened, meaning there is always the possibility that running out the clock on a distracting tab will close all of your tabs.

### Grace Periods
- Some distracting websites are valuable research resources beyond their potential for distraction.
- This extension provides grace periods for distracting websites accessed through search engines.
- Homepage URLs / low char URLs belonging to distracting sites do not warrant this grace period, and are appropriately blocked.
- There are currently bugs due to the redirect behavior of Google and Bing. The only search engine this feature consistently works for is DuckDuckGo.

### Persistence and Reset
- All relevant values are stored within extension storage, allowing for consistent behavior between browser/OS resets.
- Close probability, time of last close probability update, time of last allotment reset, currently available distracting tab time allotment, and reduction factor are stored persistently.
- Reduction factor and browser close probability have cooldown periods where they gradually reset ovee time, but the max time allotment resets every 24 hours. This has a few reasons:
    - By resetting the time allotment at the same time each day, there won't be any consistent distracted browsing 'hotspots' where most of the time is replenished. I.e., if someone uses their entire allotment at 3AM, their allotment won't fully regenerate until the following early morning, encouraging bad browsing habits at inopportune times.
    - By providing a cooldown for reduction factor and close probability, it discourages waiting until midnight for these factors to roll over and instead requires that breaks between distracted browsing be taken regardless of the time of day.

### Comprehensive Logging
- Detailed diagnostic log statements provide insights into the extension's behavior for troubleshooting and understanding usage patterns.
- This is the only place where the randomly generated tab timers can be viewed. If a tech savvy user wants to utilize the console as an additional means of keeping track of how much time they can blow, they can, but the randomness of arbitrary timers may make the intended conditioning effects of the extension less effective.

## Usage

!['Popup GUI'](/icons/popup.png)

In order to make altering the configuration of this plugin less accessible, in order to add/remove blacklisted websites or otherwise change the parameters of the plugin, the user must edit the JS associated with the extension directly. Websites can be added to the blacklist from the main menu, but they cannot be removed without physically removing the plugin. I highly recommend setting the extension policy for Firefox on your device to be handled by a different admin account and restricting the user account from modifying/removing extensions. Using the extension otherwise requires no configuration. 

The popup displays the allotment remaining, the reduction factor, and the browser close probability as progress bars to allow the user to visually assess whether or not they're willing to gamble on a distracting tab. The popup display also provides the live time elapsed since the last distracting tab was closed as a sort of 'score' that the user might identify with and not want to interrupt.

The time allotment remaining is also visualized on the icon itself. A fraction of the icon that represents the amount of time consumed from the daily allotment is darkened so that the user can keep track of their allotment without having to engage with the popup menu and risk catastrophic task-switching.

## Future Direction

Currently, the structure of this extension relies on on-the-fly evaluations of browsing behavior based on tab ID. This is not a very efficient/consistent way to design this app, as edge cases including rapid browsing/redirects often disrupt desired behavior (e.g., grace periods for research-based browsing). If I were to refactor this app, I would store all browsing history on a tab-by-tab basis and use that data to make decisions about how the extension should proceed. Currently, for the sake of my current application, this version works well enough to justify not modifying it further. However, for the sake of similar extension development, I may at some point make an engine to characterize browsing behavior to simplify future implementations of similar extensions.

## Installation

Coming soon to the AMO extension store!
