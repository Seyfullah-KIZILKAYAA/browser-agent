import * as fs from "node:fs";
import * as path from "node:path";
import {
  BudgetGuard,
  DEFAULT_HUMAN,
  FAST_ROBOT,
  FileProfileStore,
  hasAnyProviderConfigured,
  PlaywrightSession,
  Rng,
  routerFromEnv,
  runNavigator,
  SiteProfileCache,
  TraceWriter,
} from "@ba/core";
import { ParsedArgs, strFlag } from "./args";
import { makeCliApprover } from "./approval";

/**
 * Live autonomous agent — "biri tarayıcıda oturuyormuş gibi" görev yapar.
 * Derleme yok; görevi doğrudan adım adım yürütür (OODA döngüsü, insansı pacing).
 *
 *   ba agent "wikipedia'da 'Türkiye' ara ve ilk paragrafı özetle" \
 *     --domains wikipedia.org --headful --validate
 */
export async function cmdAgent(args: ParsedArgs): Promise<void> {
  const task = args.positionals[0];
  const domains = strFlag(args.flags, "domains");
  if (!task || !domains) {
    console.error(
      'Usage: ba agent "<görev>" --domains a.com,b.com [--headful] [--validate] [--fast] [--yes] [--profile <dir>] [--max-steps 30]',
    );
    process.exitCode = 1;
    return;
  }
  if (!hasAnyProviderConfigured()) {
    console.error(
      "Bir LLM sağlayıcısı ayarlı değil. Şunlardan birini ver: ANTHROPIC_API_KEY, OPENAI_API_KEY,\n" +
        "GEMINI_API_KEY, OPENROUTER_API_KEY, DEEPSEEK_API_KEY, GROQ_API_KEY; veya BA_PROVIDER=ollama (yerel).",
    );
    process.exitCode = 1;
    return;
  }

  const router = routerFromEnv();
  const budget = new BudgetGuard(Number(strFlag(args.flags, "budget") ?? 500_000));
  const session = await PlaywrightSession.launch({
    headless: !args.flags["headful"],
    stealth: true,
    userDataDir: strFlag(args.flags, "profile"),
  });
  const runDir = path.join(process.cwd(), "runs", new Date().toISOString().replace(/[:.]/g, "-"));
  fs.mkdirSync(runDir, { recursive: true });
  // Per-domain locator cache persists across runs (learned once, reused).
  const profiles = new SiteProfileCache(new FileProfileStore(path.join(process.cwd(), ".ba-profiles")));

  try {
    const result = await runNavigator({
      session,
      provider: router.navigator(),
      budget,
      task,
      allowedDomains: domains.split(",").map((d) => d.trim()),
      approver: makeCliApprover(args.flags["yes"] === true),
      human: args.flags["fast"] ? FAST_ROBOT : DEFAULT_HUMAN,
      rng: new Rng(42),
      validate: args.flags["validate"] === true,
      maxSteps: Number(strFlag(args.flags, "max-steps") ?? 30),
      trace: new TraceWriter(path.join(runDir, "trace.jsonl")),
      profiles,
      log: (m) => console.log(m),
    });
    console.log("");
    console.log(result.done ? `✓ ${result.message}` : `✗ (${result.reason}) ${result.message}`);
    console.log(`${result.steps} adım, ${budget.report()}`);
    console.log(`Trace: ${runDir}`);
    if (!result.done) process.exitCode = 1;
  } finally {
    await session.close();
  }
}
