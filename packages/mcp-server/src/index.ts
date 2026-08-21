#!/usr/bin/env node
/**
 * MCP server exposing browser-agent capabilities as tools, so any MCP client
 * (Claude Desktop, Cursor, Claude Code) can drive a real browser through the
 * same engine. Fulfills the deepseek plans' "expose everything over MCP" ask.
 *
 * Transport: stdio. One shared PlaywrightSession per server process.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  providerFromEnv,
  BudgetGuard,
  DEFAULT_HUMAN,
  FAST_ROBOT,
  PlaywrightSession,
  renderSnapshot,
  resolveTargetWithRetry,
  Rng,
  runNavigator,
  takeSnapshot,
  type BrowserSession,
} from "@ba/core";

let session: BrowserSession | null = null;

async function ensureSession(): Promise<BrowserSession> {
  if (!session) {
    session = await PlaywrightSession.launch({ headless: false, stealth: true });
  }
  return session;
}

const server = new McpServer({ name: "browser-agent", version: "0.1.0" });

server.tool(
  "browser_snapshot",
  "Filtrelenmiş, numaralı etkileşimli eleman listesini döndürür (düşük token). Önce bunu çağır.",
  { url: z.string().optional().describe("Önce bu URL'ye git (opsiyonel)") },
  async ({ url }) => {
    const s = await ensureSession();
    if (url) await s.navigate(url);
    await s.waitMs(800);
    const snap = await takeSnapshot(s);
    return { content: [{ type: "text", text: renderSnapshot(snap) }] };
  },
);

server.tool(
  "browser_navigate",
  "Verilen URL'ye git.",
  { url: z.string() },
  async ({ url }) => {
    const s = await ensureSession();
    await s.navigate(url);
    return { content: [{ type: "text", text: `Navigated to ${await s.currentUrl()}` }] };
  },
);

server.tool(
  "browser_click",
  "snapshot'taki numaralı bir elemana tıkla.",
  { index: z.number().int().min(1) },
  async ({ index }) => {
    const s = await ensureSession();
    await s.click(`[data-ba-i="${index}"]`);
    return { content: [{ type: "text", text: `Clicked [${index}]` }] };
  },
);

server.tool(
  "browser_type",
  "snapshot'taki numaralı bir alana metin yaz.",
  { index: z.number().int().min(1), value: z.string() },
  async ({ index, value }) => {
    const s = await ensureSession();
    await s.fill(`[data-ba-i="${index}"]`, value);
    return { content: [{ type: "text", text: `Typed into [${index}]` }] };
  },
);

server.tool(
  "browser_extract",
  "Sayfanın (veya numaralı bir elemanın) okunabilir metnini çıkar.",
  { index: z.number().int().min(1).optional() },
  async ({ index }) => {
    const s = await ensureSession();
    const selector = index ? `[data-ba-i="${index}"]` : undefined;
    const text = await s.evaluate<string>(
      `((sel) => { var el = sel ? document.querySelector(sel) : document.body;
         return el ? (el.innerText||'').slice(0, 4000) : ''; })`,
      selector,
    );
    return { content: [{ type: "text", text }] };
  },
);

server.tool(
  "browser_agent",
  "Bir görevi tam otonom yap: ajan sayfayı okuyup adım adım insan gibi tamamlar. Bir LLM sağlayıcısı (BA_PROVIDER + *_API_KEY) gerekir.",
  {
    task: z.string(),
    allowedDomains: z.array(z.string()).min(1),
    maxSteps: z.number().int().min(1).max(60).default(30),
    fast: z.boolean().default(false),
  },
  async ({ task, allowedDomains, maxSteps, fast }) => {
    const s = await ensureSession();
    const result = await runNavigator({
      session: s,
      provider: providerFromEnv(),
      budget: new BudgetGuard(500_000),
      task,
      allowedDomains,
      human: fast ? FAST_ROBOT : DEFAULT_HUMAN,
      rng: new Rng(42),
      maxSteps,
    });
    return {
      content: [
        { type: "text", text: `${result.done ? "✓" : "✗"} (${result.reason}) ${result.message} — ${result.steps} adım` },
      ],
    };
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("browser-agent MCP server ready (stdio)\n");
}

main().catch((err) => {
  process.stderr.write(String(err) + "\n");
  process.exit(1);
});

// Clean up the browser on exit.
process.on("SIGINT", async () => {
  if (session) await session.close();
  process.exit(0);
});
