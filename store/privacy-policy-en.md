# Privacy Policy — Browser Agent

**Last updated:** August 21, 2026

Browser Agent ("the extension") is an AI tool that automates tasks in your
browser on your behalf. We care about your privacy. This policy explains what
data the extension processes and how it is used.

## Summary

- The extension has **no server of its own.** Your data is not sent to us and
  not stored by us. Everything runs locally in your browser.
- Your API key is stored **locally in your browser only**.
- Page content is sent **only to the AI provider you choose** (e.g. Anthropic,
  OpenAI, Google) to carry out a task.

## Data processed

### 1. Your API key
To use the extension, you enter an API key for the AI provider you select. This
key is stored in your browser's local storage (`chrome.storage.local`) and is
used **only** to send requests to that provider's API. Your key is not
transmitted anywhere else.

### 2. Page content and task text
When you give a task, the extension reads the interactive elements (buttons,
links, form fields) and, when needed, text content of the currently open page.
This information is sent **directly to the AI provider you chose** in order to
complete your task. How the provider handles this data is governed by that
provider's own privacy policy.

### 3. Chat history and settings
The tasks you give and their results, your provider settings, and your interface
language preference are stored in your browser's local storage so you can revisit
them in the extension. This data stays **only on your device** and you can delete
your chat history from within the extension at any time.

### 4. Files you upload
If you attach a file, its content is sent to the AI provider to complete your
task. Files are not uploaded to any server.

## Data sharing

The extension shares your data **only with the AI provider you configure.** As
the developer, we cannot access your data; nothing is sent to us, collected by
us, or sold. No ad networks or third-party analytics services are used.

## Permissions and why they are needed

- **debugger:** To control the browser tab with real mouse/keyboard input via the
  Chrome DevTools Protocol. Used only when you start a task, only on the active tab.
- **tabs, activeTab:** To read and interact with the page, and switch tabs, to run a task.
- **storage:** To store your API key, settings, and chat history locally.
- **sidePanel:** To show the extension UI in the side panel.
- **host_permissions (`<all_urls>`):** So it can work on whichever site you give a
  task on. The extension is active only when you start a task.

## Children's privacy

The extension is not directed to children under 13 and does not knowingly
collect data from them.

## Changes

If we change this policy, we will publish the updated version on this page.

## Contact

Questions: info.muhammedkizilkaya@gmail.com
