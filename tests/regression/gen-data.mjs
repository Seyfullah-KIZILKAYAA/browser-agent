/**
 * Generate an N-row CSV for the regression run against the local demo form.
 * Usage: node gen-data.mjs 500 > big-data.csv
 */
import { writeFileSync } from "node:fs";

const n = Number(process.argv[2] ?? 500);
const out = process.argv[3];

const lines = ["SKU,Fiyat"];
for (let i = 1; i <= n; i++) {
  const sku = `SKU-${String(i).padStart(4, "0")}`;
  const fiyat = (Math.round((10 + (i * 7.31) % 990) * 100) / 100).toFixed(2);
  lines.push(`${sku},${fiyat}`);
}
const csv = lines.join("\n") + "\n";

if (out) {
  writeFileSync(out, csv, "utf8");
  process.stderr.write(`Wrote ${n} rows → ${out}\n`);
} else {
  process.stdout.write(csv);
}
