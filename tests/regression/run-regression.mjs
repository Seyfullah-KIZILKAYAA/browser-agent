/**
 * End-to-end regression: replay a compiled workflow over N rows against the
 * local demo form, in a real headless browser, with ZERO LLM tokens.
 *
 * Verifies the core promises of the repeat engine:
 *   1. All rows succeed.
 *   2. Zero LLM tokens spent (budget stays 0).
 *   3. results.csv has one "ok" line per row.
 *   4. Resume works: a killed run continues from its checkpoint.
 *   5. Idempotency: re-running a completed run skips every row.
 *
 * No API key needed — this exercises the deterministic EXECUTE path only.
 * Run: node tests/regression/run-regression.mjs [rowCount]
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");

const {
  BudgetGuard,
  FAST_ROBOT,
  parseDataFile,
  PlaywrightSession,
  runBatch,
} = await import(pathToFileURL(join(repoRoot, "packages/core/dist/index.js")).href);
const { parseWorkflow } = await import(
  pathToFileURL(join(repoRoot, "packages/shared/dist/index.js")).href
);

const ROWS = Number(process.argv[2] ?? 500);
const workDir = join(repoRoot, "tests", "regression", ".work");
rmSync(workDir, { recursive: true, force: true });
mkdirSync(workDir, { recursive: true });

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    console.error(`  ✗ ${name} ${detail}`);
    failures++;
  }
};

// --- Fixtures ---
const demoPath = join(repoRoot, "examples", "demo-form.html").replace(/\\/g, "/");
const workflow = parseWorkflow(
  JSON.parse(readFileSync(join(repoRoot, "examples", "demo-workflow.json"), "utf8")),
);
const dataPath = join(workDir, "big-data.csv");
execFileSync("node", [join(__dirname, "gen-data.mjs"), String(ROWS), dataPath]);
const rows = parseDataFile(dataPath);
const runsDir = join(workDir, "runs");
const extraVars = { demoPath };

function countResultStatuses(runDir) {
  const csv = readFileSync(join(runDir, "results.csv"), "utf8").trim().split("\n").slice(1);
  const counts = { ok: 0, failed: 0, error: 0 };
  for (const line of csv) {
    const status = line.split(",")[2];
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}

// Unique per-invocation ids so stale state from a previous run never leaks in,
// even if a locked file survived the .work cleanup.
const stamp = Date.now();

async function main() {
  console.log(`\nRegression: ${ROWS} satır, yerel demo formu, sıfır token\n`);

  // === Test 1: full run ===
  console.log("[1] Tam koşu");
  const session1 = await PlaywrightSession.launch({ headless: true, stealth: true });
  const budget1 = new BudgetGuard(200_000);
  const runId = `regression-run-${stamp}`;
  let summary;
  try {
    summary = await runBatch(workflow, rows, {
      session: session1,
      runsDir,
      runId,
      human: FAST_ROBOT,
      budget: budget1,
      extraVars,
    });
  } finally {
    await session1.close();
  }
  check("tüm satırlar başarılı", summary.succeeded === ROWS, `(${summary.succeeded}/${ROWS})`);
  check("hata yok", summary.failed === 0, `(${summary.failed} hata)`);
  check("sıfır LLM token", budget1.total === 0, `(${budget1.total} token)`);
  const counts1 = countResultStatuses(summary.runDir);
  check("results.csv satır başına 'ok'", counts1.ok === ROWS, JSON.stringify(counts1));

  // === Test 2: idempotency — re-run skips everything ===
  console.log("[2] Idempotency (aynı runId tekrar)");
  const session2 = await PlaywrightSession.launch({ headless: true, stealth: true });
  const budget2 = new BudgetGuard(200_000);
  try {
    const rerun = await runBatch(workflow, rows, {
      session: session2,
      runsDir,
      runId,
      human: FAST_ROBOT,
      budget: budget2,
      extraVars,
    });
    check("tüm satırlar atlandı", rerun.skipped === ROWS, `(${rerun.skipped}/${ROWS})`);
    check("tekrar sıfır token", budget2.total === 0);
  } finally {
    await session2.close();
  }

  // === Test 3: resume after a simulated kill ===
  console.log("[3] Resume (ortada kesilen koşu devam ediyor)");
  const resumeId = `regression-resume-${stamp}`;
  const half = Math.floor(ROWS / 2);
  // First half: process only `half` rows, then stop as if killed.
  const session3a = await PlaywrightSession.launch({ headless: true, stealth: true });
  try {
    await runBatch(workflow, rows.slice(0, half), {
      session: session3a,
      runsDir,
      runId: resumeId,
      human: FAST_ROBOT,
      budget: new BudgetGuard(200_000),
      extraVars,
    });
  } finally {
    await session3a.close();
  }
  const afterHalf = countResultStatuses(join(runsDir, resumeId));
  check("yarısı işlendi", afterHalf.ok === half, `(${afterHalf.ok}/${half})`);

  // Resume with the full set: the first `half` are skipped, rest processed.
  const session3b = await PlaywrightSession.launch({ headless: true, stealth: true });
  let resumed;
  try {
    resumed = await runBatch(workflow, rows, {
      session: session3b,
      runsDir,
      runId: resumeId,
      human: FAST_ROBOT,
      budget: new BudgetGuard(200_000),
      extraVars,
    });
  } finally {
    await session3b.close();
  }
  check("kalan satırlar işlendi", resumed.succeeded === ROWS - half, `(${resumed.succeeded}/${ROWS - half})`);
  check("ilk yarı atlandı", resumed.skipped === half, `(${resumed.skipped}/${half})`);
  const afterResume = countResultStatuses(join(runsDir, resumeId));
  check("resume sonrası tüm satırlar 'ok'", afterResume.ok === ROWS, `(${afterResume.ok}/${ROWS})`);

  console.log(`\n${failures === 0 ? "✓ TÜM REGRESYON TESTLERİ GEÇTİ" : `✗ ${failures} KONTROL BAŞARISIZ`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Regresyon hatası:", err);
  process.exit(1);
});
