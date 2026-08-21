#!/usr/bin/env node
import { parseArgs } from "./args";
import { cmdAgent } from "./cmd-agent";
import { cmdCompile } from "./cmd-compile";
import { cmdRecord } from "./cmd-record";
import { cmdRun } from "./cmd-run";
import { cmdSnapshot } from "./cmd-snapshot";

const HELP = `browser-agent CLI — LLM'in tarayıcıyı insan gibi sürdüğü ajan

Komutlar:
  ba agent "<görev>" --domains <d1,d2> [--headful] [--validate] [--fast] [--profile <dir>]
                                       CANLI otonom: biri oturuyormuş gibi görevi adım adım yapar
  ba record "<görev>" --domains <d1,d2> [--inputs "ad=Kolon:örnek,..."] --out akis.json
                                       Görevi bir kez yap + yeniden oynatılabilir workflow.json üret
  ba run <workflow.json> [--data rows.csv | --var k=v] [--headful] [--yes] [--resume <runId>]
                                       Workflow'u SIFIR token ile oynat (tek satır veya toplu)
  ba compile "<görev>" --url <url> --domains <d1,d2> [--inputs ...]
                                       (alternatif) URL'den başlayıp adım adım derleyerek workflow üret
  ba snapshot <url> [--headful]        Filtrelenmiş sayfa snapshot'ı + token sayısı (debug, LLM yok)

Tipik akış:  record ile bir kez öğret → run --data ile binlerce satırı sıfır token ile tekrarla.

Ortam değişkenleri:
  ANTHROPIC_API_KEY     agent/record/compile/heal için gerekli (run için gerekmez)
  BA_MODEL_STRONG       planlama/derleme/heal modeli (varsayılan: claude-opus-5)
  BA_MODEL_CHEAP        adım/doğrulama modeli (varsayılan: claude-sonnet-5)
  BA_SECRET_<AD>        {{secret:ad}} placeholder'larının değeri (LLM'e/loga girmez)
`;

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  switch (cmd) {
    case "agent":
      return cmdAgent(args);
    case "record":
      return cmdRecord(args);
    case "snapshot":
      return cmdSnapshot(args);
    case "compile":
      return cmdCompile(args);
    case "run":
      return cmdRun(args);
    default:
      console.log(HELP);
      if (cmd !== undefined && cmd !== "help" && cmd !== "--help") process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
