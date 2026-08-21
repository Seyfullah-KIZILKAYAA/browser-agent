import * as fs from "node:fs";
import * as path from "node:path";
import { parseWorkflow } from "@ba/shared";
import {
  BudgetGuard,
  buildReport,
  DEFAULT_HUMAN,
  FAST_ROBOT,
  hasAnyProviderConfigured,
  makeHealer,
  parseDataFile,
  PlaywrightSession,
  providerFromEnv,
  runBatch,
  runWorkflow,
  TraceWriter,
  writeReport,
} from "@ba/core";
import { ParsedArgs, strFlag } from "./args";
import { makeCliApprover } from "./approval";

/**
 * Run a compiled workflow: single shot (--var k=v) or batch over a data file
 * (--data file.csv). EXECUTE mode is zero-token; HEAL kicks in only on failure
 * when the workflow declares onFailure: "heal" and an API key is present.
 */
export async function cmdRun(args: ParsedArgs): Promise<void> {
  const wfPath = args.positionals[0];
  if (!wfPath) {
    console.error(
      "Usage: ba run <workflow.json> [--data rows.csv] [--var k=v ...] [--headful] [--yes] [--resume <runId>] [--no-heal]",
    );
    process.exitCode = 1;
    return;
  }
  const workflow = parseWorkflow(JSON.parse(fs.readFileSync(wfPath, "utf8")));
  const initialVersion = workflow.version;
  const approver = makeCliApprover(args.flags["yes"] === true);
  const human = args.flags["fast"] ? FAST_ROBOT : DEFAULT_HUMAN;
  const session = await PlaywrightSession.launch({
    headless: !args.flags["headful"],
    stealth: true,
    userDataDir: strFlag(args.flags, "profile"),
  });

  const healingEnabled =
    workflow.onFailure === "heal" && !args.flags["no-heal"] && hasAnyProviderConfigured();
  const budget = new BudgetGuard(workflow.budget.maxTokens);
  const healer = healingEnabled
    ? makeHealer(providerFromEnv(process.env.BA_MODEL_STRONG), budget, session)
    : undefined;
  if (workflow.onFailure === "heal" && !healingEnabled) {
    console.log("(heal devre dışı: LLM sağlayıcısı ayarlı değil veya --no-heal verildi)");
  }

  const runsDir = path.join(path.dirname(path.resolve(wfPath)), "runs");
  const cliVars: Record<string, string> = {};
  {
    const argv = process.argv.slice(3);
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === "--var" && argv[i + 1]) {
        const [k, ...rest] = argv[i + 1]!.split("=");
        if (k && rest.length) cliVars[k] = rest.join("=");
      }
    }
  }
  try {
    const dataPath = strFlag(args.flags, "data");
    if (dataPath) {
      const rows = parseDataFile(dataPath);
      console.log(`${rows.length} satır yüklendi: ${dataPath}`);
      const startedAt = new Date().toISOString();
      const summary = await runBatch(workflow, rows, {
        session,
        runsDir,
        runId: strFlag(args.flags, "resume"),
        approver,
        healer,
        human,
        budget,
        extraVars: cliVars,
        log: (m) => console.log(m),
      });
      if (workflow.version > initialVersion) {
        fs.writeFileSync(wfPath, JSON.stringify(workflow, null, 2), "utf8");
        console.log(`Heal edilen locator'lar ${wfPath} dosyasına yazıldı (version ${workflow.version}).`);
      }
      // Cost dashboard: report.json + human-readable summary.
      const report = buildReport({
        runId: summary.runId,
        workflow: workflow.name,
        startedAt,
        finishedAt: new Date().toISOString(),
        rows: {
          total: summary.total,
          succeeded: summary.succeeded,
          failed: summary.failed,
          skipped: summary.skipped,
        },
        budget,
      });
      console.log("\n" + writeReport(summary.runDir, report));
      console.log(`Sonuçlar: ${summary.resultsCsv}`);
    } else {
      const vars = cliVars;
      const runDir = path.join(runsDir, new Date().toISOString().replace(/[:.]/g, "-"));
      fs.mkdirSync(runDir, { recursive: true });
      const result = await runWorkflow(workflow, {
        session,
        vars,
        approver,
        healer,
        trace: new TraceWriter(path.join(runDir, "trace.jsonl")),
        artifactDir: runDir,
        human,
        log: (m) => console.log(m),
      });
      if (result.ok) {
        console.log("\nBaşarılı." + (result.healedSteps.length ? ` (heal: ${result.healedSteps.join(", ")})` : ""));
        if (Object.keys(result.outputs).length) {
          console.log("Çıktılar:", JSON.stringify(result.outputs, null, 2));
        }
      } else {
        console.error(`\nBaşarısız: adım ${result.failedStepId}: ${result.error}`);
        process.exitCode = 1;
      }
      if (result.healedSteps.length) {
        fs.writeFileSync(wfPath, JSON.stringify(workflow, null, 2), "utf8");
        console.log(`Heal edilen locator'lar ${wfPath} dosyasına yazıldı (version ${workflow.version}).`);
      }
    }
  } finally {
    await session.close();
  }
}
