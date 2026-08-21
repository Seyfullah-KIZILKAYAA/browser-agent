import * as fs from "node:fs";
import { WorkflowInput } from "@ba/shared";
import { BudgetGuard, compileWorkflow, PlaywrightSession, providerFromEnv } from "@ba/core";
import { ParsedArgs, strFlag } from "./args";

/**
 * COMPILE mode: explore the task once with the LLM and write workflow.json.
 * Inputs: --input name=ColumnHeader:sampleValue (repeatable via comma).
 * Example:
 *   ba compile "SKU'su verilen ürünün fiyatını güncelle" --url "https://panel.x.com/urun/{{sku}}" \
 *     --domains panel.x.com --inputs "sku=SKU:ABC123,fiyat=Fiyat:99.90" --out urun-fiyat.json
 */
export async function cmdCompile(args: ParsedArgs): Promise<void> {
  const task = args.positionals[0];
  const url = strFlag(args.flags, "url");
  const domains = strFlag(args.flags, "domains");
  const out = strFlag(args.flags, "out") ?? "workflow.json";
  if (!task || !url || !domains) {
    console.error(
      'Usage: ba compile "<görev>" --url <başlangıç url> --domains a.com,b.com [--inputs "ad=Kolon:örnek,..."] [--out workflow.json] [--name isim] [--max-steps 25] [--headful]',
    );
    process.exitCode = 1;
    return;
  }

  const inputs: WorkflowInput[] = [];
  const sampleVars: Record<string, string> = {};
  const inputsRaw = strFlag(args.flags, "inputs");
  if (inputsRaw) {
    for (const part of inputsRaw.split(",")) {
      const m = part.trim().match(/^([\w-]+)=([^:]+):(.*)$/);
      if (!m) throw new Error(`--inputs biçimi hatalı: "${part}" (beklenen ad=Kolon:örnekDeğer)`);
      inputs.push({ name: m[1]!, type: "string", source: `column:${m[2]!}`, required: true });
      sampleVars[m[1]!] = m[3]!;
    }
  }

  const budget = new BudgetGuard(Number(strFlag(args.flags, "budget") ?? 30_000));
  const session = await PlaywrightSession.launch({ headless: !args.flags["headful"] });
  try {
    const workflow = await compileWorkflow({
      session,
      provider: providerFromEnv(strFlag(args.flags, "model") ?? process.env.BA_MODEL_STRONG),
      budget,
      task,
      startUrl: url,
      name: strFlag(args.flags, "name") ?? out.replace(/\.json$/, ""),
      allowedDomains: domains.split(",").map((d) => d.trim()),
      inputs,
      sampleVars,
      maxSteps: Number(strFlag(args.flags, "max-steps") ?? 25),
      log: (m) => console.log(m),
    });
    fs.writeFileSync(out, JSON.stringify(workflow, null, 2), "utf8");
    console.log(`\nWorkflow yazıldı: ${out} (${workflow.steps.length} adım). ${budget.report()}`);
    console.log(`Çalıştır: ba run ${out} --data veriler.csv`);
  } finally {
    await session.close();
  }
}
