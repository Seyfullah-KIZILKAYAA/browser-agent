# Notes for Chrome Web Store Reviewer

## What the extension does
Browser Agent is a "bring your own API key" AI assistant. The user types a task
in plain language; the extension reads the active page and performs the task
(navigate, click, type, extract) on the user's behalf. All AI processing happens
through the AI provider the user configures with their own API key. The extension
has no backend server and collects no data.

## Justification for each sensitive permission

### `debugger` (most sensitive — please read)
This permission is required for the extension's **CDP driving mode**, which uses
puppeteer-core's `ExtensionTransport.connectTab()` to send **real, trusted
input events** (`Input.dispatchMouseEvent`, `Input.dispatchKeyEvent`) to the
active tab. This is how the agent moves the mouse and types like a human, which
is essential for reliably interacting with sites that ignore synthetic DOM
events.

- The debugger is attached **only** to the tab the user is on, **only** when the
  user explicitly starts a task, and is detached as soon as the task ends.
- It is never used for network interception, code injection into other origins,
  or any background data collection.
- A content-script fallback mode exists, but CDP mode provides the reliable,
  human-like input that is the core value of the product.

### `host_permissions: <all_urls>`
The user may give a task on any website, so the extension must be able to read
and interact with the page wherever the user is. It is only active after the
user starts a task.

### `tabs`, `activeTab`
Needed to read the current page and perform the task. `tabs` also powers the
multi-tab feature (open/switch tabs) so the agent can gather info in one tab and
use it in another.

### `storage`
Stores the user's API key, provider settings, and chat history locally in
`chrome.storage.local`. Nothing is sent to a remote server.

### `sidePanel`, `alarms`, `webNavigation`
- `sidePanel`: the extension's UI is a side panel.
- `alarms`: a short heartbeat keeps the service worker alive during a running task.
- `webNavigation`: detect page load/navigation so the agent acts on a settled page.

## Remote code: NO
The extension does **not** use remote code. All JavaScript is bundled in the
package; nothing is fetched or `eval`-ed from a remote source, and there are no
`<script src="http...">` tags. The extension drives the tab exclusively via the
Chrome DevTools Protocol (`chrome.debugger` through puppeteer-core's
ExtensionTransport); page scripts run in the page via the CDP `Runtime.evaluate`
API, not via `eval`/`new Function` in the extension context. (puppeteer-core's
own ARIA-selector helper uses `new Function` internally on a static, bundled
string; this is library code shipped inside the package, not remotely loaded.)

## Data handling
- No remote server; no analytics; no ad networks.
- API key and history are stored locally only.
- Page content and any uploaded file are sent only to the user's chosen AI
  provider's API, to fulfill the task. This is disclosed in the privacy policy.

## How to test
1. Load the extension and open the side panel.
2. Open the settings (gear icon), choose a provider (e.g. Google Gemini), and
   enter an API key. (A free Gemini key from aistudio.google.com works.)
3. Open any website (e.g. wikipedia.org).
4. Type a task like: `search for "Istanbul" and open the first result`.
5. The agent will read the page and perform the steps; you can expand
   "Adımları göster" to see each step.

Contact: info.muhammedkizilkaya@gmail.com
