// Clicking the toolbar icon opens the download test page in a tab.
chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: chrome.runtime.getURL("test.html") }));
