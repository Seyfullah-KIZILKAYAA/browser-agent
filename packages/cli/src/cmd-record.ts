import * as fs from "node:fs";
import * as path from "node:path";
import { WorkflowInput } from "@ba/shared";
import {
  BudgetGuard,
  DEFAULT_HUMAN,
  hasAnyProviderConfigured,
  PlaywrightSession,
  Rng,
  routerFromEnv,
  runNavigator,
  TraceWriter,
  WorkflowRecorder,
} from "@ba/core";
import { ParsedArgs, strFlag } from "./args";
import { makeCliApprover } from "./approval";

/**
 * Record mode: run the live agent ONCE for a task, capture every action, and
 * emit a zero-token replayable workflow.json. This bridges "biri oturuyormuş
 * gibi yap" → "sonsuz kez ucuza tekrarla" (Stagehand observe→cache, skill harvest).
 *
 *   ba record "SKU'yu ara ve fiyatı gir" --domains panel.x.com \
 *     --inputs "sku=SKU:ABC123,fiyat=Fiyat:99.90" --out akis.json --headful
 */
export async function cmdRecord(args: ParsedArgs): Promise<void> {
  const task = args.positionals[0];
  const domains = strFlag(args.flags, "domains");
  const out = strFlag(args.flags, "out") ?? "workflow.json";
  if (!task || !domains) {
    console.error(
      'Usage: ba record "<görev>" --domains a.com,b.com [--inputs "ad=Kolon:örnek,..."] [--out akis.json] [--headful] [--validate]',
    );
    process.exitCode = 1;
    return;
  }
  if (!hasAnyProviderConfigured()) {
    console.error(
      "Bir LLM sağlayıcısı ayarlı değil (ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY / ... veya BA_PROVIDER=ollama).",
    );
    process.exitCode = 1;
    return;
  }

  const inputs: WorkflowInput[] = [];
  const sampleToVar: Record<string, string> = {};
  const inputsRaw = strFlag(args.flags, "inputs");
  if (inputsRaw) {
    for (const part of inputsRaw.split(",")) {
      const m = part.trim().match(/^([\w-]+)=([^:]+):(.*)$/);
      if (!m) throw new Error(`--inputs biçimi hatalı: "${part}" (beklenen ad=Kolon:örnek)`);
      inputs.push({ name: m[1]!, type: "string", source: `column:${m[2]!}`, required: true });
      sampleToVar[m[3]!] = m[1]!; // örnek değer → değişken adı (parameterize için)
    }
  }

  const router = routerFromEnv();
  const budget = new BudgetGuard(Number(strFlag(args.flags, "budget") ?? 100_000));
  const recorder = new WorkflowRecorder({
    name: strFlag(args.flags, "name") ?? out.replace(/\.json$/, ""),
    allowedDomains: domains.split(",").map((d) => d.trim()),
    inputs,
  });
  const session = await PlaywrightSession.launch({
    headless: !args.flags["headful"],
    stealth: true,
  });
  const runDir = path.join(process.cwd(), "runs", new Date().toISOString().replace(/[:.]/g, "-"));
  fs.mkdirSync(runDir, { recursive: true });

  try {
    const result = await runNavigator({
      session,
      provider: router.navigator(),
      budget,
      task,
      allowedDomains: domains.split(",").map((d) => d.trim()),
      approver: makeCliApprover(args.flags["yes"] === true),
      human: DEFAULT_HUMAN,
      rng: new Rng(42),
      validate: args.flags["validate"] === true,
      maxSteps: Number(strFlag(args.flags, "max-steps") ?? 30),
      trace: new TraceWriter(path.join(runDir, "trace.jsonl")),
      onAction: (rec) => recorder.add(rec),
      log: (m) => console.log(m),
    });

    if (!recorder.hasSteps) {
      console.error("Kaydedilecek adım üretilmedi.");
      process.exitCode = 1;
      return;
    }
    recorder.parameterize(sampleToVar); // örnek değerleri {{değişken}} yap
    const workflow = recorder.build("heal");
    fs.writeFileSync(out, JSON.stringify(workflow, null, 2), "utf8");

    console.log("");
    console.log(result.done ? `✓ görev tamam: ${result.message}` : `⚠ görev bitmedi (${result.reason}) ama adımlar kaydedildi`);
    console.log(`Workflow yazıldı: ${out} (${workflow.steps.length} adım). ${budget.report()}`);
    console.log(`Tekrar (sıfır token): ba run ${out} --data veriler.csv`);
  } finally {
    await session.close();
  }
}
