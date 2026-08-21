# browser-agent

LLM'lerin tarayıcıyı sürdüğü, akışları derleyip sıfır token ile tekrarlayan ajan.
TypeScript, Node 22+, pnpm workspaces, playwright-core (kurulu Chrome/Edge kanalı).

## Komutlar
- Build: `pnpm build`
- Test: `pnpm test` (vitest — LLM ve tarayıcı çağrısı yapmaz)
- CLI: `node packages/cli/dist/index.js <snapshot|compile|run>`

## Mimari
Üç kip: COMPILE (LLM açık, IR üretir) → EXECUTE (LLM kapalı, IR oynatır) → HEAL (sadece hatada).
Detay: docs/architecture.md

## Sınırlar
- `packages/core` içinde `chrome.*` API'si KULLANMA (ileride MV3 uzantı ayrı paket olacak).
- DOM erişimi SADECE `core/src/perception/page-script.ts` içinden yapılır.
- Workflow IR şemasını (`packages/shared/src/schema/workflow.ts`) değiştirmeden önce docs/adr/ altına ADR yaz.
- Yeni üst seviye klasör veya bağımlılık eklemeden önce sor.

## Kurallar
- En basit çalışan yaklaşım. Spekülatif soyutlama yok.
- Dosya 300 satırı geçerse böl. `any` yasak; `unknown` + zod parse.
- Kod yazmadan önce docs/conventions.md oku.

## Detaylar
- IR şeması: docs/workflow-ir.md
- Algı merdiveni ve token bütçeleri: docs/perception.md
- Güvenlik: docs/security.md
