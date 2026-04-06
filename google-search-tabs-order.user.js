// ==UserScript==
// @name         Google Search Tabs — Fix Order
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  Fixes tab order in Google Search, hides unwanted tabs
// @match        https://www.google.com/search*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  // ─────────────────────────────────────────────────────────────────
  // TAB CONFIG: desired order and visibility.
  // Labels must match the exact tab text visible in the browser.
  // Tabs not listed here will be hidden automatically.
  //
  // hidden: true  — hide the tab
  // hidden: false — keep the tab visible
  // ─────────────────────────────────────────────────────────────────
  const TAB_ORDER = [
    { label: 'All',          hidden: false },
    { label: 'Images',       hidden: false },
    { label: 'Videos',       hidden: false },
    { label: 'Forums',       hidden: false },
    { label: 'Short videos', hidden: true  },
    { label: 'Shopping',     hidden: true  },
    { label: 'AI Mode',      hidden: true  },
    { label: 'More',         hidden: false }, // dropdown containing News, Maps, Books, etc.
  ];

  // Collect all known labels (lowercase) for fast lookup
  const KNOWN_LABELS = new Set(TAB_ORDER.map(c => c.label.toLowerCase()));

  // ─────────────────────────────────────────────────────────────────
  // Dynamically locate the tabs container.
  //
  // Strategy: walk all text nodes in the document, collect those whose
  // trimmed text exactly matches a known tab label, grab their closest
  // visible ancestor element. Then walk upward from the first match
  // until we find a parent element whose direct children collectively
  // cover at least 3 of the matched tab elements. That parent is the
  // tabs list container — regardless of what class names or tag names
  // Google uses at any given moment.
  // ─────────────────────────────────────────────────────────────────
  function findTabsContainer() {
    // Step 1: find elements that contain exactly a known tab label text
    const labelElements = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent.trim().toLowerCase();
      if (KNOWN_LABELS.has(text) && node.parentElement) {
        labelElements.push(node.parentElement);
      }
    }

    if (labelElements.length < 2) return null;

    // Step 2: walk up from the first found label element to locate a
    // container whose direct children each wrap one of the tab labels.
    let candidate = labelElements[0].parentElement;
    while (candidate && candidate !== document.body) {
      // Count how many direct children of this candidate contain a tab label element
      const matchingChildren = [...candidate.children].filter(child =>
        labelElements.some(lel => child === lel || child.contains(lel))
      );

      // Require at least 3 to avoid false positives on shallow wrappers
      if (matchingChildren.length >= 3) {
        return { container: candidate, tabItems: matchingChildren };
      }

      candidate = candidate.parentElement;
    }

    return null;
  }

  // Extract the tab label text from a container child element.
  // Finds the first short text node inside the element that matches a known label.
  function getTabLabel(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent.trim();
      if (KNOWN_LABELS.has(text.toLowerCase())) return text;
    }
    // Fallback: return full trimmed textContent if no exact match found
    return el.textContent.trim();
  }

  // Guard flag: prevents MutationObserver from re-triggering while we
  // are ourselves mutating the DOM via appendChild.
  let busy = false;
  let debounceTimer = null;

  function reorderTabs() {
    const result = findTabsContainer();
    if (!result) return false;

    const { container } = result;

    // Re-read direct children each time (DOM may have changed)
    const items = [...container.children];
    if (items.length === 0) return false;

    // Build an ordered array of elements matching TAB_ORDER entries
    const ordered = [];
    for (const cfg of TAB_ORDER) {
      const el = items.find(
        i => getTabLabel(i).toLowerCase() === cfg.label.toLowerCase()
      );
      if (!el) continue;
      el.style.display = cfg.hidden ? 'none' : '';
      ordered.push(el);
    }

    // Hide any tab not listed in TAB_ORDER
    for (const el of items) {
      const isKnown = TAB_ORDER.some(
        c => getTabLabel(el).toLowerCase() === c.label.toLowerCase()
      );
      if (!isKnown) el.style.display = 'none';
    }

    // Re-insert tabs in the desired order.
    // appendChild on an already-inserted element moves it — no cloning needed.
    busy = true;
    for (const el of ordered) container.appendChild(el);
    busy = false;

    return true;
  }

  // Debounce: coalesce rapid mutation bursts into a single reorderTabs call
  function scheduleReorder() {
    if (busy) return; // skip mutations triggered by our own DOM changes
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(reorderTabs, 80);
  }

  const observer = new MutationObserver(scheduleReorder);
  observer.observe(document.body, { childList: true, subtree: true });

  // Run immediately in case the tabs are already present in the DOM
  reorderTabs();
})();
