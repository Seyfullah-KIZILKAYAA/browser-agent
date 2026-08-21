/**
 * JavaScript evaluated inside the page. Single source of DOM access — nothing
 * else in the engine reads the DOM directly (see docs/conventions.md).
 *
 * Algorithm credits: interactive-element detection and visibility/occlusion
 * filtering follow browser-use's DOM serializer; the compact line-based output
 * follows microsoft/playwright-mcp's accessibility snapshot format.
 */

/** Shared helpers injected into every page function. */
const PRELUDE = `
  var INTERACTIVE_INPUT_ROLES = {
    text: "textbox", email: "textbox", password: "textbox", number: "textbox",
    tel: "textbox", url: "textbox", search: "searchbox", date: "textbox",
    time: "textbox", "datetime-local": "textbox",
    checkbox: "checkbox", radio: "radio", range: "slider", file: "button",
    button: "button", submit: "button", reset: "button", image: "button"
  };
  var KNOWN_ROLES = ["button","link","textbox","searchbox","combobox","checkbox",
    "radio","tab","menuitem","option","slider","switch","listbox"];

  function getRole(el) {
    var explicit = el.getAttribute("role");
    if (explicit && KNOWN_ROLES.indexOf(explicit) >= 0) return explicit;
    var tag = el.tagName.toLowerCase();
    if (tag === "a" && el.hasAttribute("href")) return "link";
    if (tag === "button") return "button";
    if (tag === "select") return "combobox";
    if (tag === "textarea") return "textbox";
    if (tag === "input") {
      var t = (el.getAttribute("type") || "text").toLowerCase();
      return INTERACTIVE_INPUT_ROLES[t] || "textbox";
    }
    if (el.isContentEditable) return "textbox";
    if (el.hasAttribute("onclick")) return "button";
    if (el.hasAttribute("tabindex") && el.getAttribute("tabindex") !== "-1"
        && (tag === "div" || tag === "span")) return "button";
    return null;
  }

  function textOf(el, limit) {
    var s = (el.innerText || el.textContent || "").replace(/\\s+/g, " ").trim();
    return s.length > limit ? s.slice(0, limit) : s;
  }

  function getName(el) {
    var v = el.getAttribute("aria-label");
    if (v) return v.trim();
    var lb = el.getAttribute("aria-labelledby");
    if (lb) {
      var parts = [];
      lb.split(/\\s+/).forEach(function (id) {
        var ref = document.getElementById(id);
        if (ref) parts.push(textOf(ref, 60));
      });
      if (parts.length) return parts.join(" ");
    }
    if (el.labels && el.labels.length) return textOf(el.labels[0], 60);
    if (el.getAttribute("placeholder")) return el.getAttribute("placeholder").trim();
    var txt = textOf(el, 80);
    if (txt) return txt;
    if (el.getAttribute("title")) return el.getAttribute("title").trim();
    var img = el.querySelector && el.querySelector("img[alt]");
    if (img) return img.getAttribute("alt").trim();
    if (el.tagName === "INPUT" && el.value && el.type !== "password") return el.value;
    if (el.getAttribute("name")) return el.getAttribute("name");
    return "";
  }

  function isRendered(el) {
    var style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (parseFloat(style.opacity || "1") === 0) return false;
    var r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  }

  function composedContains(a, b) {
    var n = b;
    while (n) {
      if (n === a) return true;
      n = n.parentNode || n.host || null;
    }
    return false;
  }

  function inViewport(r) {
    return r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
  }

  // Paint-order filter: drop elements fully covered by something unrelated.
  function isOccluded(el) {
    var r = el.getBoundingClientRect();
    if (!inViewport(r)) return false; // off-viewport: cannot test, keep
    var cx = Math.max(0, Math.min(window.innerWidth - 1, r.left + r.width / 2));
    var cy = Math.max(0, Math.min(window.innerHeight - 1, r.top + r.height / 2));
    var hit = document.elementFromPoint(cx, cy);
    if (!hit) return false;
    // Shadow DOM exception: elementFromPoint returns the host; accept relatives.
    return !(composedContains(el, hit) || composedContains(hit, el));
  }

  // Walk DOM including open shadow roots, collect interactive elements in order.
  function collectInteractive() {
    var out = [];
    function walk(root) {
      var node = root.firstElementChild;
      while (node) {
        var role = getRole(node);
        if (role && isRendered(node) && !isOccluded(node)) {
          out.push({ el: node, role: role });
        } else {
          if (node.shadowRoot) walk(node.shadowRoot);
          walk(node);
        }
        node = node.nextElementSibling;
      }
    }
    walk(document.body || document.documentElement);
    return out;
  }

  function statesOf(el, role) {
    var st = [];
    if (el.disabled) st.push("disabled");
    if (el.required) st.push("required");
    if (role === "checkbox" || role === "radio") st.push(el.checked ? "checked" : "unchecked");
    if (role === "textbox" || role === "searchbox") {
      if (el.type === "password") st.push("password");
      else if ("value" in el) st.push(el.value ? "value:" + String(el.value).slice(0, 30) : "empty");
    }
    if (role === "combobox" && el.tagName === "SELECT" && el.selectedIndex >= 0) {
      var opt = el.options[el.selectedIndex];
      if (opt) st.push("selected:" + textOf(opt, 30));
    }
    var r = el.getBoundingClientRect();
    if (!inViewport(r)) st.push("offscreen");
    return st;
  }

  function cssPathFor(el) {
    if (el.id) return "#" + CSS.escape(el.id);
    var tid = el.getAttribute("data-testid");
    if (tid) return "[data-testid=" + JSON.stringify(tid) + "]";
    var parts = [];
    var n = el;
    while (n && n.nodeType === 1 && parts.length < 5) {
      var tag = n.tagName.toLowerCase();
      var sel = tag;
      if (n.id) { parts.unshift("#" + CSS.escape(n.id)); break; }
      var parent = n.parentElement;
      if (parent) {
        var same = Array.prototype.filter.call(parent.children, function (c) {
          return c.tagName === n.tagName;
        });
        if (same.length > 1) sel += ":nth-of-type(" + (same.indexOf(n) + 1) + ")";
      }
      parts.unshift(sel);
      n = parent;
    }
    return parts.join(" > ");
  }

  function xpathFor(el) {
    var parts = [];
    var n = el;
    while (n && n.nodeType === 1) {
      var idx = 1;
      var sib = n.previousElementSibling;
      while (sib) { if (sib.tagName === n.tagName) idx++; sib = sib.previousElementSibling; }
      parts.unshift(n.tagName.toLowerCase() + "[" + idx + "]");
      n = n.parentElement;
    }
    return "/" + parts.join("/");
  }
`;

/**
 * (opts: {maxElements?: number}) => Snapshot
 * Tags each interactive element with data-ba-i="<index>".
 */
export const PAGE_SNAPSHOT_FN = `((opts) => {
  ${PRELUDE}
  opts = opts || {};
  var max = opts.maxElements || 150;
  document.querySelectorAll("[data-ba-i]").forEach(function (e) { e.removeAttribute("data-ba-i"); });
  var found = collectInteractive();
  var items = [];
  var prevKey = null, repeat = 0;
  for (var k = 0; k < found.length; k++) {
    var f = found[k];
    var name = getName(f.el);
    var key = f.role + "|" + name;
    if (key === prevKey) { repeat++; if (repeat >= 3) continue; } else { repeat = 0; }
    prevKey = key;
    var i = items.length + 1;
    f.el.setAttribute("data-ba-i", String(i));
    items.push({ i: i, role: f.role, name: name, states: statesOf(f.el, f.role) });
    if (items.length >= max) break;
  }
  var se = document.scrollingElement || document.documentElement;
  return {
    url: location.href,
    title: document.title,
    scrollY: se.scrollTop,
    scrollMax: Math.max(0, se.scrollHeight - window.innerHeight),
    truncated: found.length > items.length,
    elements: items
  };
})`;

/**
 * (target: TargetSpec) => {found: boolean, via?: string}
 * Resolution order: role+name → testId → anchor+role → css → xpath → text.
 * Tags the resolved element with data-ba-r="1".
 */
export const PAGE_RESOLVE_FN = `((target) => {
  ${PRELUDE}
  document.querySelectorAll("[data-ba-r]").forEach(function (e) { e.removeAttribute("data-ba-r"); });
  var nth = target.nth || 0;

  function tag(el, via) {
    if (!el) return null;
    el.setAttribute("data-ba-r", "1");
    if (el.scrollIntoView) el.scrollIntoView({ block: "center", behavior: "instant" });
    return { found: true, via: via };
  }
  function pick(list) { return list.length > nth ? list[nth] : null; }

  var all = null;
  function interactive() {
    if (!all) all = collectInteractive();
    return all;
  }

  if (target.role && target.name) {
    var lower = target.name.toLowerCase();
    var exact = [], partial = [];
    interactive().forEach(function (f) {
      if (f.role !== target.role) return;
      var nm = getName(f.el).toLowerCase();
      if (nm === lower) exact.push(f.el);
      else if (nm.indexOf(lower) >= 0) partial.push(f.el);
    });
    var el = pick(exact) || pick(partial);
    if (el) return tag(el, "role+name");
  }
  if (target.testId) {
    var el2 = pick(Array.prototype.slice.call(
      document.querySelectorAll("[data-testid=" + JSON.stringify(target.testId) + "]")));
    if (el2) return tag(el2, "testId");
  }
  if (target.anchor && target.role) {
    var anchorEl = null;
    var anchorName = target.anchor.name.toLowerCase();
    var nodes = document.querySelectorAll("h1,h2,h3,h4,legend,label,th,dt,[role=heading]");
    for (var a = 0; a < nodes.length; a++) {
      if (textOf(nodes[a], 80).toLowerCase().indexOf(anchorName) >= 0) { anchorEl = nodes[a]; break; }
    }
    if (anchorEl) {
      var anchorPos = anchorEl.getBoundingClientRect();
      var best = null, bestDist = Infinity;
      interactive().forEach(function (f) {
        if (f.role !== target.role) return;
        var r = f.el.getBoundingClientRect();
        var d = Math.abs(r.top - anchorPos.top) + Math.abs(r.left - anchorPos.left) / 4;
        if (d < bestDist) { bestDist = d; best = f.el; }
      });
      if (best) return tag(best, "anchor");
    }
  }
  if (target.css) {
    try {
      var el3 = pick(Array.prototype.slice.call(document.querySelectorAll(target.css)));
      if (el3 && isRendered(el3)) return tag(el3, "css");
    } catch (e) {}
  }
  if (target.xpath) {
    try {
      var res = document.evaluate(target.xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      var list = [];
      for (var x = 0; x < res.snapshotLength; x++) list.push(res.snapshotItem(x));
      var el4 = pick(list);
      if (el4 && isRendered(el4)) return tag(el4, "xpath");
    } catch (e) {}
  }
  if (target.text) {
    var t = target.text.toLowerCase();
    var matches = interactive().filter(function (f) {
      return getName(f.el).toLowerCase().indexOf(t) >= 0;
    }).map(function (f) { return f.el; });
    var el5 = pick(matches);
    if (el5) return tag(el5, "text");
  }
  return { found: false };
})`;

/**
 * (index: number) => TargetSpec — capture a multi-layer locator for the element
 * currently tagged data-ba-i="<index>". Used at COMPILE time.
 */
export const PAGE_CAPTURE_FN = `((index) => {
  ${PRELUDE}
  var el = document.querySelector("[data-ba-i=" + JSON.stringify(String(index)) + "]");
  if (!el) return null;
  var role = getRole(el);
  var name = getName(el);
  var anchor = null;
  var nodes = document.querySelectorAll("h1,h2,h3,h4,legend,[role=heading]");
  var pos = el.getBoundingClientRect();
  var bestD = Infinity;
  for (var a = 0; a < nodes.length; a++) {
    var r = nodes[a].getBoundingClientRect();
    if (r.top <= pos.top) {
      var d = pos.top - r.top;
      if (d < bestD) { bestD = d; anchor = { role: "heading", name: textOf(nodes[a], 60) }; }
    }
  }
  return {
    role: role, name: name || null,
    testId: el.getAttribute("data-testid"),
    css: cssPathFor(el),
    xpath: xpathFor(el),
    text: name ? name.slice(0, 40) : null,
    nth: 0,
    anchor: anchor
  };
})`;

/** (text: string) => boolean — page contains visible text. */
export const PAGE_TEXT_PRESENT_FN = `((text) => {
  var body = (document.body && document.body.innerText) || "";
  return body.toLowerCase().indexOf(String(text).toLowerCase()) >= 0;
})`;

/**
 * (opts: {selector?: string, maxChars?: number}) => string
 * Extract readable text from a resolved target or the whole page.
 */
export const PAGE_EXTRACT_FN = `((opts) => {
  opts = opts || {};
  var el = opts.selector ? document.querySelector(opts.selector) : document.body;
  if (!el) return "";
  var s = (el.innerText || el.textContent || "").replace(/\\n{3,}/g, "\\n\\n").trim();
  return s.slice(0, opts.maxChars || 4000);
})`;

/** (amount: number) => void — scroll page vertically by amount px. */
export const PAGE_SCROLL_FN = `((amount) => {
  var se = document.scrollingElement || document.documentElement;
  se.scrollBy ? se.scrollBy(0, amount) : window.scrollBy(0, amount);
})`;
