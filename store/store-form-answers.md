# Web Store Privacy Tab — Field-by-Field Answers

Copy-paste the text below into each field of the Chrome Web Store privacy form.
(Extension v0.6.0 — content-script mode and the `scripting` permission were
removed; it now runs via CDP only.)

---

## Do you use remote code?
**→ No, I am not using remote code**

(All JS is bundled in the package; no code is fetched or eval'ed from a remote
source, and there are no `<script src="http...">` tags. puppeteer-core's own
internal `new Function` runs on a static, bundled string — it is not remotely
loaded code.)

---

## Single purpose
```
Browser Agent is an AI assistant that performs tasks in the user's browser on
the user's behalf. The user types a task in plain language; the extension reads
the active tab and carries out the task (navigate, click, type, extract data)
for the user.
```

---

## Permission justifications (paste each into its box)

**tabs justification**
```
Required to read the current page in order to perform the task, and to switch
between multiple tabs (using information from one tab in another).
```

**activeTab justification**
```
Required to interact only with the tab the user is currently on when the user
starts a task.
```

**storage justification**
```
Required to store the user's API key, provider settings, and chat history
locally in the user's own browser (chrome.storage.local). No data is sent to a
remote server.
```

**sidePanel justification**
```
Required because the extension's user interface is displayed as a side panel.
```

**alarms justification**
```
A short heartbeat keeps the service worker alive while a task is running so it
is not terminated mid-task.
```

**debugger justification**
```
The extension uses the Chrome DevTools Protocol (via puppeteer-core's
ExtensionTransport) to control the browser tab with real mouse/keyboard input.
This is required so the agent can click and type reliably, like a human. The
debugger attaches ONLY to the active tab, ONLY when the user starts a task, and
detaches as soon as the task ends. It is NEVER used for network interception,
injecting code into other origins, or any background data collection.
```

**webNavigation justification**
```
Required to detect page load/navigation so the agent acts only after the page
has settled.
```

**Host permission justification (<all_urls>)**
```
The user may give a task on any website, so the extension must be able to read
and act on whichever site the user is on. The extension is active only when the
user starts a task.
```

---

## Privacy policy URL
Publish `privacy-policy-en.html` (or the .md) somewhere public (e.g. GitHub
Pages) and paste that URL here.

---

## Data usage declarations
In the "Data usage" section, declare honestly:

- **Data collected:** The extension does NOT collect any data on a server.
  However, you should disclose that "website content" and "user-provided content"
  are sent to the AI provider the user chooses, in order to fulfill the task:
  - "Personally identifiable information": NO (the extension does not collect it)
  - "User activity / web history": the page content read during a task is sent to
    the AI provider → YES (used to run the task, not sold)
  - "Website content": YES (read to perform the task and sent to the AI provider)
- **Three required certification checkboxes** (check all — all are true):
  - I do NOT sell user data to third parties, outside the approved use cases.
  - I do NOT use or transfer user data for purposes unrelated to the item's
    single purpose.
  - I do NOT use or transfer user data to determine creditworthiness or for
    lending purposes.
