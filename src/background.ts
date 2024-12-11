import { ActivateMessage, ActivateMessage_bm, ActivateMessage_copy, ActivateMessage_tabs, ActivateMessage_win, CopyFormat, Messages, UpdateMessage } from './types/Messages';
import { Settings } from './types/Settings';

var CURRENT_VERSION = "5";

const linkclumpSettingsKey = "linkclumpSettings";
const linkclumpVersionKey = "linkclumpVersion";

class SettingsManager {

	async load(): Promise<Settings> {
		var { [linkclumpSettingsKey]: settings } = await chrome.storage.sync.get(linkclumpSettingsKey);

		if (settings) {
			return settings;
		}

		settings = this.init();
		return settings;

	};

	save(settings: Settings & { error?: string }) {
		// remove any error messages from object (shouldn't be there)
		if (settings.error !== undefined) {
			delete settings.error;
		}

		chrome.storage.sync.set({ [linkclumpSettingsKey]: settings });
	};

	async isInit() {
		const { [linkclumpVersionKey]: version } = await chrome.storage.sync.get(linkclumpVersionKey);
		return version !== undefined;
	};

	async isLatest() {
		const { [linkclumpVersionKey]: version } = await chrome.storage.sync.get(linkclumpVersionKey);
		return version === CURRENT_VERSION;
	};

	init() {
		// create default settings for first time user
		var settings: Settings = {
			"actions": {
				"101": {
					"mouse": 0,  // left mouse button
					"key": 90,   // z key
					"action": "tabs",
					"color": "#FFA500",
					"options": {
						"smart": 0,
						"ignore": [0],
						"delay": 0,
						"close": 0,
						"block": true,
						"reverse": false,
						"end": false,
						"fontsizeofcounter": 10,
						"samebgcolorasbox": false // If you want to set the color of counter to the same as the box color, specify a value of true
					}
				}
			},
			"blocked": []
		};

		// save settings to store
		chrome.storage.sync.set({ [linkclumpSettingsKey]: settings });
		chrome.storage.sync.set({ [linkclumpVersionKey]: CURRENT_VERSION });

		return settings;
	};


	async update() {
		if (!(await this.isInit())) {
			this.init();
		}
	};
}

var settingsManager = new SettingsManager();

function uniqueUrl<T extends { url: string }>(arr: T[]): T[] {
	var a = [];
	var l = arr.length;
	for (var i = 0; i < l; i++) {
		for (var j = i + 1; j < l; j++) {
			if (arr[i].url === arr[j].url)
				j = ++i;
		}
		a.push(arr[i]);
	}
	return a;
};

function openTab(
	urls: { url: string, title: string }[],
	delay: number,
	windowId?: number,
	openerTabId?: number,
	tabIndex?: number | null,
	closeTime?: number
) {

	const url = urls.shift()?.url;

	if (!url || urls.length > 0) {
		setTimeout(
			function () {
				openTab(urls, delay, windowId, openerTabId, tabIndex, closeTime)
			},
			delay * 1000
		);
	}

	const obj = {
		windowId,
		url: url,
		active: false
	} as chrome.tabs.CreateProperties;

	// only add tab ID if delay feature is not being used as if tab with openerTabId is closed, the links stop opening
	if (!delay) {
		obj.openerTabId = openerTabId;
	}

	if (tabIndex != null) {
		obj.index = tabIndex;
		tabIndex++;
	}

	chrome.tabs.create(
		obj,
		function (tab) {
			if (closeTime && closeTime > 0) {
				setTimeout(function () {
					if (tab.id) {
						chrome.tabs.remove(tab.id);
					}
				}, closeTime * 1000);
			}
		}
	);
}

/**
 * 
 * @param {string} text - Text to copy to clipboard
 */
function copyToClipboard(text: string) {
	chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
		if (tabs[0].id) {
			chrome.tabs.sendMessage(tabs[0].id, { message: "copyToClipboard", text: text });
		}
	});
}

function pad(number: number, length: number) {
	var str = "" + number;
	while (str.length < length) {
		str = "0" + str;
	}

	return str;
}

function timeConverter(a: Date) {
	var year = a.getFullYear();
	var month = pad(a.getMonth() + 1, 2)
	var day = pad(a.getDate(), 2);
	var hour = pad(a.getHours(), 2);
	var min = pad(a.getMinutes(), 2);
	var sec = pad(a.getSeconds(), 2);
	var time = year + "-" + month + "-" + day + " " + hour + ":" + min + ":" + sec;
	return time;
}

async function sendInit(callback: (response?: any) => void) {
	const settings = await settingsManager.load();
	callback(settings);
}

// Link copy formats
const URLS_WITH_TITLES = 0
const URLS_ONLY = 1
const URLS_ONLY_SPACE_SEPARATED = 2
const TITLES_ONLY = 3
const AS_LINK_HTML = 4
const AS_LIST_LINK_HTML = 5
const AS_MARKDOWN = 6

function formatLink({ url, title }: ActivateMessage["urls"][0], copyFormat: CopyFormat) {
	switch (Number.parseInt(copyFormat, 10)) {
		case URLS_WITH_TITLES:
			return title + "\t" + url + "\n";
		case URLS_ONLY:
			return url + "\n";
		case URLS_ONLY_SPACE_SEPARATED:
			return url + " ";
		case TITLES_ONLY:
			return title + "\n";
		case AS_LINK_HTML:
			return '<a href="' + url + '">' + title + "</a>\n";
		case AS_LIST_LINK_HTML:
			return '<li><a href="' + url + '">' + title + "</a></li>\n";
		case AS_MARKDOWN:
			return "[" + title + "](" + url + ")\n";
		default:
			throw new Error("Invalid copy format: " + copyFormat);
	}
}

function handleCopy(request: ActivateMessage<ActivateMessage_copy>) {
	var text = "";
	for (let i = 0; i < request.urls.length; i++) {
		text += formatLink(request.urls[i], request.setting.options.copy);
	}

	if (request.setting.options.copy == AS_LIST_LINK_HTML) {
		text = "<ul>\n" + text + "</ul>\n"
	}

	copyToClipboard(text);
}

function handleBookmark(request: ActivateMessage<ActivateMessage_bm>) {
	chrome.bookmarks.getTree(
		function (bookmarkTreeNodes) {

			const folderID = bookmarkTreeNodes[0].children?.[1]?.id;
			if (!folderID) {
				console.error("Folder ID is undefined");
				return;
			}

			// make assumption that bookmarkTreeNodes[0].children[1] refers to the "other bookmarks" folder
			// as different languages will not use the english name to refer to the folder
			chrome.bookmarks.create({
				"parentId": folderID,
				"title": "Linkclump " + timeConverter(new Date())
			},
				function (newFolder) {
					for (let j = 0; j < request.urls.length; j++) {
						chrome.bookmarks.create({
							"parentId": newFolder.id,
							"title": request.urls[j].title,
							"url": request.urls[j].url
						});
					}
				}
			);
		}
	);
}

function handleWin(request: ActivateMessage<ActivateMessage_win>) {
	chrome.windows.getCurrent(
		function (currentWindow) {
			const url = request.urls.shift()?.url;

			if (!url) {
				return;
			}

			chrome.windows.create(
				{
					url: url,
					"focused": !request.setting.options.unfocus
				},
				function (window) {
					const windowId = window ? window.id : currentWindow.id;

					if (request.urls.length > 0) {
						openTab(
							request.urls,
							request.setting.options.delay,
							windowId,
							undefined,
							undefined,
							0
						);
					}
				});

			if (currentWindow.id && request.setting.options.unfocus) {
				chrome.windows.update(
					currentWindow.id,
					{ "focused": true }
				);
			}
		}
	);
}

function handleTab(request: ActivateMessage<ActivateMessage_tabs>, sender: chrome.runtime.MessageSender) {
	if (sender.tab === undefined || sender.tab.id === undefined) {
		return;
	}

	chrome.tabs.get(sender.tab.id, function (tab) {
		chrome.windows.getCurrent(function (currentWindow) {
			var tab_index = null;

			if (!request.setting.options.end) {
				tab_index = tab.index + 1;
			}

			const windowId = currentWindow ? currentWindow.id : undefined;

			openTab(
				request.urls,
				request.setting.options.delay,
				windowId,
				tab.id,
				tab_index,
				request.setting.options.close
			);
		})
	});
}

function handleRequests(request: Messages, sender: chrome.runtime.MessageSender, callback: (response?: any) => void) {
	switch (request.message) {
		case "activate": {
			if (request.setting.options.block) {
				request.urls = uniqueUrl(request.urls);
			}

			if (request.urls.length === 0) {
				return;
			}

			if (request.setting.options.reverse) {
				request.urls.reverse();
			}

			switch (request.setting.action) {
				case "copy": {
					handleCopy(request as ActivateMessage<ActivateMessage_copy>);
					break;
				}
				case "bm": {
					handleBookmark(request as ActivateMessage<ActivateMessage_bm>);
					break;
				}

				case "win": {
					handleWin(request as ActivateMessage<ActivateMessage_win>);
					break;
				}

				case "tabs": {
					handleTab(request as ActivateMessage<ActivateMessage_tabs>, sender);
					break;
				}
			}

			break;
		}

		case "init": {
			sendInit(callback);
			return true;
		}
		case "update": {
			settingsManager.save(request.settings);

			chrome.windows.getAll({
				populate: true
			}, function (windowList) {
				windowList.forEach(function (window) {
					if (!window.tabs) return;

					window.tabs.forEach(async function (tab) {
						if (!tab.id) return;

						chrome.tabs.sendMessage(
							tab.id,
							{
								message: "update",
								settings: await settingsManager.load()
							} as UpdateMessage
						);
					})
				})
			});

			return;
		}
	}
}

chrome.runtime.onMessage.addListener(handleRequests);

if (!settingsManager.isInit()) {
	// initialize settings manager with defaults and to stop this appearing again
	settingsManager.init();

	// inject Linkclump into windows currently open to make it just work
	chrome.windows.getAll(
		{ populate: true },
		function (windows) {
			for (var i = 0; i < windows.length; ++i) {
				const numberOfTabs = windows[i].tabs?.length
				if (numberOfTabs === undefined) {
					continue
				}
				for (var j = 0; j < numberOfTabs; ++j) {
					const tab = windows[i]?.tabs?.[j]
					const url = tab?.url
					const id = tab?.id
					if (!url || !id) {
						continue
					}
					if (!/^https?:\/\//.test(url)) continue;
					chrome.tabs.executeScript(id, { file: "linkclump.js" });
				}
			}
		}
	);

	// pop up window to show tour and options page
	chrome.windows.create({
		url: document.location.protocol + "//" + document.location.host + "/pages/options.html?init=true",
		width: 800,
		height: 850,
		left: screen.width / 2 - 800 / 2,
		top: screen.height / 2 - 700 / 2
	});
} else if (!settingsManager.isLatest()) {
	settingsManager.update();
}


