# Mimari

Bu proje "md dosyaları" klasöründeki **beş AI planının harmanıdır**, tek bir
plan değil. Kaynak eşlemesi:

| Kaynak | Alınan |
|---|---|
| browser-agent-plan.md | Compile/Execute/Heal çekirdeği, algı merdiveni, IR şeması, güvenlik |
| browser_agent_plan.md (Python) | İnsansı davranış (yazma ritmi, mouse, gecikme), stealth, OODA döngüsü |
| BROWSER_AI_AGENT_PLAN.md | Planner-Actor-Validator, skill harvesting (recorder), model router, vision fallback |
| browser_ai_agent_research_plan.md | Doğrulama+replan akışı, güven skorlu locator, onay listesi, batch |
| deepseek dosyaları | MCP dışa açma (P5), site profili/navigasyon cache, recon→act→read |

Ayrıca GitHub repoları gerçekten incelendi (`research-findings.md`): browser-use
serializer, nanobrowser MV3, workflow-use converter, Stagehand action cache,
Skyvern validator, playwright-mcp snapshot formatı, caveman sıkıştırma.

## İki çalışma modu

- **CANLI otonom (`agent`)**: "biri tarayıcıda oturuyormuş gibi" — görevi adım
  adım okur, karar verir, insansı yapar, doğrular (`agent/navigator.ts`). OODA/ReAct.
- **Derle-ve-tekrarla (`record`/`compile` → `run`)**: görevi bir kez öğren, her
  satır için sıfır token ile tekrarla. Aşağıdaki üç kip bunun içindir.

## Üç kip (tekrarlama motoru)

| Kip | LLM | Ne yapar |
|---|---|---|
| **COMPILE** | Açık | Görevi bir kez keşfeder, her adımı ve elemanın çok katmanlı locator'ını kaydeder → `workflow.json`. Ya `compiler.ts` (URL'den adım adım) ya da `navigator.ts`+`recorder.ts` (canlı ajanı kaydet) |
| **EXECUTE** | **Kapalı** | IR'ı veri dosyasındaki her satır için deterministik + insansı oynatır (`workflow/runtime.ts`, `batch.ts`) |
| **HEAL** | Açık (tek adım) | Patlayan adımın lokal bağlamıyla yeni locator seçtirir, IR'ı yamalar (`agent/healer.ts`) |

İnsansı davranış (`human/behavior.ts` + `human/stealth.ts`) her iki modda da
geçerlidir: karakter karakter yazma (ritim jitter'lı), gerçek mouse hareketi
(eğri yol), aksiyon öncesi/sonrası gecikme, `navigator.webdriver` maskeleme.
`--fast` (FAST_ROBOT) bunu kapatıp tam hıza geçer.

1000 satırlık toplu iş = 1 derleme maliyeti + 0 çalıştırma maliyeti.

## Katmanlar

```
shared     → hiçbir şeye bağımlı değil (zod IR şeması + şablon util)
core       → shared (motor: perception, locator, actions, workflow, data, llm, agent, security)
cli        → core, shared
(gelecek) extension → core, shared  (MV3; core asla chrome.* import etmez)
```

Tarayıcı erişimi `core/src/transport/session.ts` içindeki `BrowserSession`
arayüzünün arkasında. Bugün tek implementasyon `PlaywrightSession` (kurulu
Chrome/Edge, playwright-core). MV3 uzantı köprüsü (plan §2 seçenek C) aynı
arayüzü implemente ederek eklenecek.

## Veri akışı (toplu çalıştırma)

```
csv/xlsx/json → parseDataFile → her satır: mapRowToVars → runWorkflow (LLM YOK)
→ runs/<runId>/{state.json, results.csv, trace.jsonl}
```

- Checkpoint: her satırdan sonra `state.json`; kill → `--resume <runId>` ile devam.
- Idempotency: satır içeriğinin sha1'i; aynı satır iki kez işlenmez.

## v1 kapsam dışı (bilinçli)

Genel amaçlı tam otonomi, CAPTCHA, Firefox/Safari, bulut tarayıcı havuzu,
anti-bot atlatma, MV3 uzantı (P5'e ertelendi).
