import * as esbuild from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";

const outdir = "dist";
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

/**
 * puppeteer-core's generic connect() pulls in Node-only launcher code
 * (@puppeteer/browsers, node:path/os/fs) that never runs in the extension —
 * only ExtensionTransport (chrome.debugger) does. Stub those imports so the
 * bundler is satisfied; if any stubbed path were ever hit it throws clearly.
 */
const stubNodeBuiltins = {
  name: "stub-node-builtins",
  setup(build) {
    const NODE_BUILTINS = /^(node:)?(path|os|fs|assert|util|url|child_process|readline|stream|http|https|net|tls|zlib|crypto|events|process|buffer|module|dns|querystring|string_decoder|worker_threads)$/;
    const stub = (args) => ({ path: args.path, namespace: "node-stub" });
    build.onResolve({ filter: NODE_BUILTINS }, stub);
    build.onResolve({ filter: /^@puppeteer\/browsers/ }, stub);
    // BiDi transport and Node launcher code are never used (connect protocol: "cdp").
    build.onResolve({ filter: /chromium-bidi/ }, stub);
    build.onResolve({ filter: /puppeteer-core\/lib\/esm\/puppeteer\/node\// }, stub);
    // Stub is a Proxy-like module: any named import resolves to a throwing fn.
    build.onLoad({ filter: /.*/, namespace: "node-stub" }, () => ({
      contents: `
        const handler = { get: () => new Proxy(function(){ throw new Error("node-only module not available in extension"); }, handler) };
        const stub = new Proxy({}, handler);
        export default stub;
        export const join = () => { throw new Error("node:path.join not available in extension"); };
        export const ChromeReleaseChannel = {};
      `,
      loader: "js",
    }));
  },
};

const common = {
  bundle: true,
  target: "es2022",
  platform: "browser",
  logLevel: "info",
  plugins: [stubNodeBuiltins],
};

// Background: ESM module service worker.
await esbuild.build({
  ...common,
  entryPoints: { background: "src/background/background.ts" },
  format: "esm",
  outdir,
});

// Content script and side panel: IIFE (classic scripts, no ESM imports at runtime).
await esbuild.build({
  ...common,
  entryPoints: {
    content: "src/content/content.ts",
    sidepanel: "src/sidepanel/sidepanel.ts",
  },
  format: "iife",
  outdir,
});

// Static assets.
await cp("src/manifest.json", `${outdir}/manifest.json`);
await cp("src/sidepanel/sidepanel.html", `${outdir}/sidepanel.html`);
await cp("src/sidepanel/sidepanel.css", `${outdir}/sidepanel.css`);

console.log(`\nBuilt extension → ${outdir}/  (load unpacked in chrome://extensions)`);
