import { ActivateMessage, InitMessage, InitResponse } from './types/Messages';
import { Settings } from './types/Settings';

// set all the properties of the window object
// to avoid typescript errors
declare global {
	interface Window {
		settings: Settings["actions"] | Record<string, undefined>;
		setting: number;
		
		key_pressed: number;
		mouse_button: number | null;
		stop_menu: boolean;
		box_on: boolean;
		smart_select: boolean;

		mouse_x: number;
		mouse_y: number;

		scroll_id: number;
		links: any[];
		box: HTMLElement & { x: number, y: number, x1: number, x2: number, y1: number, y2: number };
		count_label: HTMLElement;
		overlay: HTMLElement | null;
		scroll_bug_ignore: boolean;
		os: 0 | 1;

		timer: number | NodeJS.Timeout;
	}
}

const END_CODE = "End";
const HOME_CODE = "Home";
const Z_INDEX = "2147483647";
const OS_WIN = 1;
const OS_LINUX = 0;
const LEFT_BUTTON = 0;
const EXCLUDE_LINKS = 0;
const INCLUDE_LINKS = 1;

window.settings = {};
window.setting = -1;
window.key_pressed = 0;
window.mouse_button = null;
window.stop_menu = false;
window.box_on = false;
window.smart_select = false;
window.mouse_x = -1;
window.mouse_y = -1;
window.scroll_id = 0;
window.links = [];
// @ts-expect-error -- all will be right at the end of the function
window.box = undefined;
// @ts-expect-error -- all will be right at the end of the function
window.count_label = undefined;
window.overlay = null;
window.scroll_bug_ignore = false;
window.os = ((navigator.appVersion.indexOf("Win") === -1) ? OS_LINUX : OS_WIN);
window.timer = 0;


chrome.runtime.sendMessage(
	{
		message: "init"
	} as InitMessage,
	function (response: InitResponse | null) {
		if (response === null) {
			console.log("Unable to load linkclump due to null response");
		} else {
			if (response.hasOwnProperty("error")) {
				console.log("Unable to properly load linkclump, returning to default settings: " + JSON.stringify(response));
			}

			window.settings = response.actions;

			var allowed = true;
			for (var i in response.blocked) {
				if (response.blocked[i] == "") continue;
				var re = new RegExp(response.blocked[i], "i");

				if (re.test(window.location.href)) {
					allowed = false;
					console.log("Linkclump is blocked on this site: " + response.blocked[i] + "~" + window.location.href);
				}
			}

			if (allowed) {
				// setting up the box and count label
				window.box = create_box();
				document.body.appendChild(window.box);

				window.count_label = create_count_label();
				document.body.appendChild(window.count_label);

				// add event listeners
				window.addEventListener("mousedown", mousedown, true);
				window.addEventListener("keydown", keydown, true);
				window.addEventListener("keyup", keyup, true);
				window.addEventListener("blur", blur, true);
				window.addEventListener("contextmenu", contextmenu, true);
			}
		}
	}
);

chrome.runtime.onMessage.addListener(function (request) {
	if (request.message === "update") {
		window.settings = request.settings.actions;
	}
});

function create_box() {
	// @ts-expect-error -- all will be right at the end of the function
	window.box = document.createElement("span");
	window.box.style.margin = "0px auto";
	window.box.style.border = "2px dotted" + (window.settings[window.setting]?.color ?? "red");
	window.box.style.position = "absolute";
	window.box.style.zIndex = Z_INDEX;
	window.box.style.visibility = "hidden";

	// set the box properties
	window.box.x = 0;
	window.box.y = 0;
	window.box.x1 = 0;
	window.box.x2 = 0;
	window.box.y1 = 0;
	window.box.y2 = 0;

	return window.box;
}

function create_count_label() {
	window.count_label = document.createElement("span");
	window.count_label.style.zIndex = Z_INDEX;
	window.count_label.style.position = "absolute";
	window.count_label.style.visibility = "hidden";
	window.count_label.style.left = "10px";
	window.count_label.style.width = "50px";
	window.count_label.style.top = "10px";
	window.count_label.style.height = "20px";
	window.count_label.style.fontSize = "10px";
	window.count_label.style.font = "Arial, sans-serif";
	window.count_label.style.color = "black";

	return window.count_label;
}

function mousemove(event: MouseEvent) {
	prevent_escalation(event);

	console.log("mousemove", allow_selection(), window.scroll_bug_ignore);
	if (allow_selection() || window.scroll_bug_ignore) {
		window.scroll_bug_ignore = false;
		update_box(event.pageX, event.pageY);

		// while detect keeps on calling false then recall the method
		while (!detect(event.pageX, event.pageY, false)) {
			// empty
		}
	} else {
		// only stop if the mouseup timer is no longer set
		if (window.timer === 0) {
			stop();
		}
	}
}

function clean_up() {
	console.log("cleaning up", window.box, window.count_label);
	// remove the box
	if (window.box) window.box.style.visibility = "hidden";
	if (window.count_label) window.count_label.style.visibility = "hidden";
	window.box_on = false;

	// remove the link boxes
	for (var i = 0; i < window.links.length; i++) {
		if (window.links[i].box !== null) {
			document.body.removeChild(window.links[i].box);
			window.links[i].box = null;
		}
	}
	window.links = [];

	// wipe clean the smart select
	window.smart_select = false;
	window.mouse_button = -1;
	window.key_pressed = 0;
}

function mousedown(event: MouseEvent) {
	window.mouse_button = event.button;

	// turn on menu for windows
	if (window.os === OS_WIN) {
		window.stop_menu = false;
	}

	if (allow_selection()) {
		// don't prevent for windows right click as it breaks spell checker
		// do prevent for left as otherwise the page becomes highlighted
		if (window.os === OS_LINUX || (window.os === OS_WIN && window.mouse_button === LEFT_BUTTON)) {
			prevent_escalation(event);
		}

		// if mouse up timer is set then clear it as it was just caused by bounce
		if (window.timer !== 0) {
			//console.log("bounced!");
			clearTimeout(window.timer);
			window.timer = 0;

			// keep menu off for windows
			if (window.os === OS_WIN) {
				window.stop_menu = true;
			}
		} else {
			// clean up any mistakes
			if (window.box_on) {
				console.log("box wasn't removed from previous operation");
				clean_up();
			}

			// update position
			window.box.x = event.pageX;
			window.box.y = event.pageY;
			update_box(event.pageX, event.pageY);

			// setup mouse move and mouse up
			window.addEventListener("mousemove", mousemove, true);
			window.addEventListener("mouseup", mouseup, true);
			window.addEventListener("mousewheel", mousewheel, true);
			window.addEventListener("mouseout", mouseout, true);
		}
	}
}

function update_box(x: number, y: number) {
	var width = Math.max(document.documentElement["clientWidth"], document.body["scrollWidth"], document.documentElement["scrollWidth"], document.body["offsetWidth"], document.documentElement["offsetWidth"]); // taken from jquery
	var height = Math.max(document.documentElement["clientHeight"], document.body["scrollHeight"], document.documentElement["scrollHeight"], document.body["offsetHeight"], document.documentElement["offsetHeight"]); // taken from jquery
	x = Math.min(x, width - 7);
	y = Math.min(y, height - 7);

	if (x > window.box.x) {
		window.box.x1 = window.box.x;
		window.box.x2 = x;
	} else {
		window.box.x1 = x;
		window.box.x2 = window.box.x;
	}
	if (y > window.box.y) {
		window.box.y1 = window.box.y;
		window.box.y2 = y;
	} else {
		window.box.y1 = y;
		window.box.y2 = window.box.y;
	}

	window.box.style.left = window.box.x1 + "px";
	window.box.style.width = window.box.x2 - window.box.x1 + "px";
	window.box.style.top = window.box.y1 + "px";
	window.box.style.height = window.box.y2 - window.box.y1 + "px";

	window.count_label.style.left = x - 15 + "px";
	window.count_label.style.top = y - 15 + "px";
}

function mousewheel() {
	window.scroll_bug_ignore = true;
}

function mouseout(event: MouseEvent) {
	mousemove(event);
	// the mouse wheel event might also call this event
	window.scroll_bug_ignore = true;
}

function prevent_escalation(event: MouseEvent) {
	event.stopPropagation();
	event.preventDefault();
}

function mouseup(event: MouseEvent) {
	prevent_escalation(event);

	if (window.box_on) {
		// all the detection of the mouse to bounce
		if (allow_selection() && window.timer === 0) {
			window.timer = setTimeout(function () {
				update_box(event.pageX, event.pageY);
				detect(event.pageX, event.pageY, true);

				stop();
				window.timer = 0;
			}, 100);
		}
	} else {
		// false alarm
		stop();
	}
}

function getXY(element: HTMLElement): { x: number, y: number } {
	var x = 0;
	var y = 0;

	var parent: Element | null = element;
	var style;
	var matrix;
	do {
		style = window.getComputedStyle(parent);
		matrix = new WebKitCSSMatrix(style.webkitTransform);
		x += parent.offsetLeft + matrix.m41;
		y += parent.offsetTop + matrix.m42;
	} while (parent = parent.offsetParent);

	parent = element;
	while (parent && parent !== document.body) {
		if (parent.scrollleft) {
			x -= parent.scrollLeft;
		}
		if (parent.scrollTop) {
			y -= parent.scrollTop;
		}
		parent = parent.parentNode;
	}

	return {
		x: x,
		y: y
	};
}

function start() {
	const selectedAction = window.settings[window.setting]

	if (selectedAction === undefined) {
		console.error("No setting selected");
		return;
	}

	// stop user from selecting text/elements
	document.body.style.userSelect = "none";

	// turn on the box
	window.box.style.visibility = "visible";
	window.count_label.style.visibility = "visible";

	// find all links (find them each time as they could have moved)
	var page_links = document.links;


	// create RegExp once
	var re1 = new RegExp("^javascript:", "i");
	var re2 = new RegExp(selectedAction.options.ignore.slice(1).join("|"), "i");
	var re3 = new RegExp("^H\\d$");

	for (var i = 0; i < page_links.length; i++) {
		// reject javascript: links
		if (re1.test(page_links[i].href)) {
			continue;
		}

		// reject href="" or href="#"
		if (!page_links[i].getAttribute("href") || page_links[i].getAttribute("href") === "#") {
			continue;
		}

		// include/exclude links
		if (selectedAction.options.ignore.length > 1) {
			if (re2.test(page_links[i].href) || re2.test(page_links[i].innerHTML)) {
				if (selectedAction.options.ignore[0] == EXCLUDE_LINKS) {
					continue;
				}
			} else if (selectedAction.options.ignore[0] == INCLUDE_LINKS) {
				continue;
			}
		}

		// attempt to ignore invisible links (can't ignore overflow)
		var comp = window.getComputedStyle(page_links[i], null);
		if (comp.visibility == "hidden" || comp.display == "none") {
			continue;
		}

		var pos = getXY(page_links[i]);
		var width = page_links[i].offsetWidth;
		var height = page_links[i].offsetHeight;

		// attempt to get the actual size of the link
		for (var k = 0; k < page_links[i].childNodes.length; k++) {
			if (page_links[i].childNodes[k].nodeName == "IMG") {
				const pos2 = getXY(page_links[i].childNodes[k]);
				if (pos.y >= pos2.y) {
					pos.y = pos2.y;

					width = Math.max(width, page_links[i].childNodes[k].offsetWidth);
					height = Math.max(height, page_links[i].childNodes[k].offsetHeight);
				}
			}
		}

		page_links[i].x1 = pos.x;
		page_links[i].y1 = pos.y;
		page_links[i].x2 = pos.x + width;
		page_links[i].y2 = pos.y + height;
		page_links[i].height = height;
		page_links[i].width = width;
		page_links[i].box = null;
		page_links[i].important = selectedAction.options.smart == 0 && page_links[i].parentNode != null && re3.test(page_links[i].parentNode.nodeName);

		window.links.push(page_links[i]);
	}

	window.box_on = true;

	// turn off menu for windows so mouse up doesn't trigger context menu
	if (window.os === OS_WIN) {
		window.stop_menu = true;
	}
}

function stop() {
	// allow user to select text/elements
	document.body.style.userSelect = "";

	// turn off mouse move and mouse up
	window.removeEventListener("mousemove", mousemove, true);
	window.removeEventListener("mouseup", mouseup, true);
	window.removeEventListener("mousewheel", mousewheel, true);
	window.removeEventListener("mouseout", mouseout, true);

	console.log("stopping box on" + window.box_on);
	if (window.box_on) {
		clean_up();
	}

	// turn on menu for linux
	if (window.os === OS_LINUX && window.settings[window.setting]?.key != window.key_pressed) {
		window.stop_menu == false;
	}
}

function scroll() {
	if (allow_selection()) {
		var y = window.mouse_y - window.scrollY;
		var win_height = window.innerHeight;

		if (y > win_height - 20) { //down
			let speed = win_height - y;
			if (speed < 2) {
				speed = 60;
			} else if (speed < 10) {
				speed = 30;
			} else {
				speed = 10;
			}
			window.scrollBy(0, speed);
			window.mouse_y += speed;
			update_box(window.mouse_x, window.mouse_y);
			detect(window.mouse_x, window.mouse_y, false);

			window.scroll_bug_ignore = true;
			return;
		} else if (window.scrollY > 0 && y < 20) { //up
			let speed = y;
			if (speed < 2) {
				speed = 60;
			} else if (speed < 10) {
				speed = 30;
			} else {
				speed = 10;
			}
			window.scrollBy(0, -speed);
			window.mouse_y -= speed;
			update_box(window.mouse_x, window.mouse_y);
			detect(window.mouse_x, window.mouse_y, false);

			window.scroll_bug_ignore = true;
			return;
		}
	}

	clearInterval(window.scroll_id);
	window.scroll_id = 0;
}

function detect(x: number, y: number, open: boolean) {
	window.mouse_x = x;
	window.mouse_y = y;

	if (!window.box_on) {
		if (window.box.x2 - window.box.x1 < 5 && window.box.y2 - window.box.y1 < 5) {
			return true;
		} else {
			start();
		}

	}

	if (!window.scroll_id) {
		window.scroll_id = setInterval(scroll, 100);
	}

	var count = 0;
	var count_tabs = new Set;
	var open_tabs = [];
	for (var i = 0; i < window.links.length; i++) {
		if (
			(!window.smart_select || window.links[i].important)
			&& !(
				window.links[i].x1 > window.box.x2
				|| window.links[i].x2 < window.box.x1
				|| window.links[i].y1 > window.box.y2
				|| window.links[i].y2 < window.box.y1
			)
		) {
			if (open) {
				open_tabs.push({
					"url": window.links[i].href,
					"title": window.links[i].innerText
				});
			}

			// check if important links have been selected and possibly redo
			if (!window.smart_select) {
				if (window.links[i].important) {
					window.smart_select = true;
					return false;
				}
			} else {
				if (window.links[i].important) {
					count++;
				}
			}

			if (window.links[i].box === null) {
				var link_box = document.createElement("span");
				link_box.id = "linkclump-link";
				link_box.style.margin = "0px auto";
				link_box.style.border = "1px solid red";
				link_box.style.position = "absolute";
				link_box.style.width = window.links[i].width + "px";
				link_box.style.height = window.links[i].height + "px";
				link_box.style.top = window.links[i].y1 + "px";
				link_box.style.left = window.links[i].x1 + "px";
				link_box.style.zIndex = Z_INDEX;

				document.body.appendChild(link_box);
				window.links[i].box = link_box;
			} else {
				window.links[i].box.style.visibility = "visible";
			}

			count_tabs.add(window.links[i].href);
		} else {
			if (window.links[i].box !== null) {
				window.links[i].box.style.visibility = "hidden";
			}
		}
	}

	// important links were found, but not anymore so redo
	if (window.smart_select && count === 0) {
		window.smart_select = false;
		return false;
	}

	window.count_label.innerText = count_tabs.size.toString();

	if (open_tabs.length > 0) {
		chrome.runtime.sendMessage({
			message: "activate",
			urls: open_tabs,
			setting: window.settings[window.setting]
		} as ActivateMessage);
	}

	return true;
}

function allow_key(keyCode: number) {
	for (var i in window.settings) {
		if (window.settings[i]?.key == keyCode) {
			return true;
		}
	}
	return false;
}


function keydown(event: KeyboardEvent) {
	if (event.code != END_CODE && event.code != HOME_CODE) {
		window.key_pressed = event.keyCode;
		// turn menu off for linux
		if (window.os === OS_LINUX && allow_key(window.key_pressed)) {
			window.stop_menu = true;
		}
	} else {
		window.scroll_bug_ignore = true;
	}
}

function blur() {
	remove_key();
}

function keyup(event: KeyboardEvent) {
	if (event.code != END_CODE && event.code != HOME_CODE) {
		remove_key();
	}
}

function remove_key() {
	// turn menu on for linux
	if (window.os === OS_LINUX) {
		window.stop_menu = false;
	}
	window.key_pressed = 0;
}


function allow_selection() {
	for (var i in window.settings) {
		// need to check if key is 0 as key_pressed might not be accurate
		if (
			window.settings[i]?.mouse == window.mouse_button
			&& window.settings[i]?.key == window.key_pressed
		) {
			window.setting = Number.parseInt(i, 10)
			if (window.box !== null) {
				window.box.style.border = "2px dotted " + window.settings[i]?.color;
			}
			return true;
		}
	}
	return false;
}

function contextmenu(event: MouseEvent) {
	if (window.stop_menu) {
		event.preventDefault();
	}
}
