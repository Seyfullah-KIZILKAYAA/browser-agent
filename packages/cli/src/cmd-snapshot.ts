import { PlaywrightSession, renderWithTokenCount, takeSnapshot } from "@ba/core";
import { ParsedArgs, strFlag } from "./args";

/** Debug command: print the filtered snapshot + token estimate for a URL. */
export async function cmdSnapshot(args: ParsedArgs): Promise<void> {
  const url = args.positionals[0];
  if (!url) {
    console.error("Usage: ba snapshot <url> [--headful] [--query \"göreve göre BM25 filtresi (K3)\"]");
    process.exitCode = 1;
    return;
  }
  const query = strFlag(args.flags, "query");
  const session = await PlaywrightSession.launch({ headless: !args.flags["headful"] });
  try {
    await session.navigate(url);
    await session.waitMs(1000);
    const snap = await takeSnapshot(session);
    const full = renderWithTokenCount(snap);
    if (query) {
      const ranked = renderWithTokenCount(snap, { query, rankThreshold: 0, rankTopK: 30 });
      console.log(ranked.text);
      console.log(`\n--- K3 (query "${query}"): ~${ranked.tokens} token · filtresiz: ~${full.tokens} token`);
    } else {
      console.log(full.text);
      console.log(`\n--- ~${full.tokens} token (hedef: <=1500)`);
    }
  } finally {
    await session.close();
  }
}
