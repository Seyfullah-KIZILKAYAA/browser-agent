# browser-agent

Tarayıcıda **biri oturuyormuş gibi** işlem yapan, LLM destekli otonom tarayıcı
ajanı. Görevi doğal dilde verirsin; ajan sayfayı okur, karar verir, insan gibi
(karakter karakter yazarak, gerçek mouse hareketiyle, doğal gecikmelerle) yapar
ve sonucu doğrular. Tekrarlı işler için görevi **bir kez** öğrenip her veri
satırında **sıfır token** ile tekrar oynatır.

Bu proje "md dosyaları" klasöründeki 5 AI planının **harmanıdır** (bkz.
`docs/architecture.md`) ve ilgili açık kaynak repolar gerçekten incelenerek
uygulanmıştır (bkz. `docs/research-findings.md`).

Öncelik sırası: **insan gibi güvenilir davranış > token maliyeti > otonomi**.

## Üç kullanım yolu

| Yol | Nasıl | Ne için |
|---|---|---|
| **Canlı otonom** | `ba agent` (CLI) | "Biri oturuyormuş gibi" görevi adım adım yapar (OODA döngüsü). Her adımda LLM. |
| **Öğren & tekrarla** | `ba record` → `ba run` | Görevi bir kez yapıp workflow'a kaydeder; binlerce satırı sıfır token ile tekrarlar. |
| **Tarayıcı uzantısı** | MV3 side panel | Görevi kendi giriş yapılmış Chrome oturumunda yaptırır (bkz. `packages/extension`). |

Ek olarak bir **MCP server** (`packages/mcp-server`) tüm yetenekleri Claude
Desktop / Cursor / Claude Code'a tool olarak açar.

## Proje yapısı

```
packages/
├── shared/       # zod IR şeması + şablon util (hiçbir şeye bağımlı değil)
├── core/         # motor: perception, locator, actions, workflow, agent, human, llm, security
│                 #   @ba/core        → Node/CLI (playwright dahil)
│                 #   @ba/core/browser → tarayıcı-güvenli yüzey (playwright/fs olmadan)
├── cli/          # ba agent / record / run / compile / snapshot
├── extension/    # MV3 uzantı: background SW + content script + side panel
└── mcp-server/   # yetenekleri MCP (stdio) tool'ları olarak açar
```

## Kurulum

Gereksinimler: Node 22+, pnpm, kurulu Google Chrome (veya Edge).

```powershell
pnpm install
pnpm build                          # shared + core + cli
pnpm test                           # 32 birim testi (LLM/tarayıcı çağrısı yapmaz)
pnpm regression                     # 500 satır uçtan uca (gerçek tarayıcı, sıfır token, API'siz)
$env:ANTHROPIC_API_KEY = "sk-ant-..."   # agent/record/uzantı/MCP için (run için gerekmez)

# İsteğe bağlı: uzantı ve MCP server
pnpm --filter @ba/extension build   # → packages/extension/dist (Chrome'a yüklenebilir)
```

## Kullanım

### Canlı otonom ajan — "biri oturuyormuş gibi"

```powershell
node packages/cli/dist/index.js agent "wikipedia'da Türkiye sayfasını aç ve ilk paragrafı özetle" `
  --domains wikipedia.org --headful --validate
```

- İnsansı davranış varsayılan açık: karakter karakter yazma, gerçek mouse
  hareketi, doğal gecikmeler, `navigator.webdriver` maskeleme. `--fast` ile kapanır.
- `--validate`: her adımdan sonra bağımsız doğrulayıcı çağrısı (Skyvern deseni).
- `--profile <dir>`: kalıcı Chrome profili → gerçek, giriş yapılmış oturumunu kullan.
- `risk: destructive` (ödeme/sil/gönder) aksiyonlarda terminalden onay ister.
- Login/2FA/CAPTCHA duvarına gelirse durup sana sorar (`ask`).
- Öğrendiği locator'ları `.ba-profiles/` altında domain başına saklar; aynı sitede
  sonraki çalıştırmalar hızlanır. Run sonunda maliyet raporu (token/USD/cache) basar.

### Öğren (record) → sonsuz tekrar (run)

```powershell
# 1) Bir kez öğret (canlı ajan yapar, workflow.json'a kaydeder)
node packages/cli/dist/index.js record "SKU'yu ara, satış fiyatını gir ve Kaydet'e bas" `
  --domains panel.example.com `
  --inputs "sku=SKU:ABC123,fiyat=Fiyat:99.90" `
  --out urun-fiyat.json --headful

# 2) Binlerce satırı SIFIR token ile tekrarla
node packages/cli/dist/index.js run urun-fiyat.json --data veriler.csv --headful
```

`--inputs "ad=KolonBaşlığı:örnek"` — örnek değer bir kez öğretirken sayfayı sürer;
kaydedilen workflow'da her zaman `{{ad}}` placeholder'ı olur ve CSV kolonuna bağlanır.

**run özellikleri:**
- Her satırda checkpoint: kesilirse `--resume <runId>` ile kaldığı yerden devam.
- Sonuçlar `runs/<runId>/results.csv`, audit log `trace.jsonl`.
- Kırılan locator `onFailure:"heal"` ve API anahtarı varsa otomatik onarılır.
- `--fast`: insansı gecikmeleri kapat, tam hız (görünmez toplu işler için).

### Debug: sayfayı gör (LLM yok)

```powershell
node packages/cli/dist/index.js snapshot "https://example.com"
# K3 sıkıştırmasını dene: göreve göre en alakalı elemanları öne çıkar
node packages/cli/dist/index.js snapshot "https://example.com" --query "giriş yap"
```

Filtrelenmiş, numaralı eleman listesi + token tahmini basar. `--query` ile
büyük sayfalarda BM25 sıkıştırmasının token'ı ne kadar düşürdüğünü gösterir.

### Tarayıcı uzantısı — kendi giriş yapılmış oturumunda

```powershell
pnpm build; pnpm --filter @ba/extension build
```

Sonra Chrome'da: `chrome://extensions` → **Geliştirici modu** → **Paketlenmemiş
öğe yükle** → `packages/extension/dist`. Araç çubuğundaki simge side panel'i açar;
⚙ ile **sağlayıcıyı seç** (Claude/GPT/Gemini/Ollama…) ve anahtarını gir, bir
siteye git, görevi yaz, **Başlat**. Detay: `packages/extension/README.md`.

### MCP server — Claude Desktop / Cursor / Claude Code

```powershell
cd packages/mcp-server; npx tsc     # dist/index.js üretir
```

MCP istemcinin ayarına `command: node`, `args: ["<yol>/packages/mcp-server/dist/index.js"]`
olarak ekle. Açtığı tool'lar: `browser_snapshot`, `browser_navigate`,
`browser_click`, `browser_type`, `browser_extract`, `browser_agent` (tam otonom).

### Yapay zeka sağlayıcısı (çoklu model)

Anthropic, OpenAI, Google Gemini, OpenRouter, DeepSeek, Groq, yerel Ollama ve
özel OpenAI-uyumlu uç noktalar desteklenir. `BA_PROVIDER` ile seçilir; verilmezse
mevcut `*_API_KEY`'den otomatik algılanır. Tam liste ve örnekler: `docs/providers.md`.

```powershell
# örnekler
$env:ANTHROPIC_API_KEY = "sk-ant-..."                          # varsayılan
$env:BA_PROVIDER="openai";   $env:OPENAI_API_KEY="sk-..."      # OpenAI
$env:BA_PROVIDER="gemini";   $env:GEMINI_API_KEY="..."         # Google Gemini
$env:BA_PROVIDER="ollama";   $env:BA_MODEL_CHEAP="llama3.1"    # yerel, anahtarsız
```

### Ortam değişkenleri

| Değişken | Amaç |
|---|---|
| `BA_PROVIDER` | sağlayıcı: anthropic / openai / gemini / openrouter / deepseek / groq / ollama / custom |
| `<VENDOR>_API_KEY` | seçilen sağlayıcının anahtarı (agent/record/compile/heal için; run için gerekmez) |
| `BA_MODEL_STRONG` | planlama/derleme/heal modeli |
| `BA_MODEL_CHEAP` | adım/doğrulama modeli |
| `BA_BASE_URL` | özel/ollama uç nokta URL'si |
| `BA_SECRET_<AD>` | `{{secret:ad}}` değeri (LLM'e ve loga asla girmez) |

## Mimari (özet)

- **Algı merdiveni**: 0 token (IR) → filtrelenmiş snapshot (~50-1500 tok, varsayılan)
  → K3 BM25 sıkıştırma (büyük sayfada göreve göre top-30, ~%77 token düşüş)
  → Set-of-Marks vision fallback (`vision.ts`, sadece DOM yetersizse). browser-use
  serializer + playwright-mcp formatı + `*yeni-eleman` diff sinyali.
- **Maliyet muhasebesi**: her çağrı faz/model/cache bazında; run sonunda
  `report.json` + USD/token/cache-hit özeti. Sert token + USD bütçe tavanı.
- **Çok katmanlı locator**: `role+name → testId → anchor → css → xpath → metin → HEAL`.
- **İnsansı katman**: `human/behavior.ts` (yazma/mouse/gecikme), `human/stealth.ts`.
- **Çoklu sağlayıcı + model router**: Anthropic/OpenAI/Gemini/OpenRouter/DeepSeek/
  Groq/Ollama/özel; güçlü model planlar/derler/onarır, ucuz model adım atar/doğrular.
- **Site profili cache**: canlı ajan başarılı locator'ları domain+niyet ile saklar;
  başarısız olanlar zamanla düşer (dosya veya chrome.storage tabanlı).
- **Güvenlik**: domain beyaz listesi, destructive onay, secret redaction, prompt
  injection zarfı, audit log, token + USD bütçe sert limiti.

Detaylar: `docs/architecture.md`, `docs/workflow-ir.md`, `docs/perception.md`,
`docs/providers.md`, `docs/security.md`, `docs/cost-accounting.md`,
`docs/research-findings.md`, `docs/adr/`.

## Yol haritası

- [x] P0-P1: IR şeması, algı (K1), locator, aksiyonlar, deterministik runtime
- [x] P2: LLM katmanı, COMPILE, canlı NAVIGATOR (agent), model router
- [x] P3: HEAL + bağımsız VALIDATOR
- [x] P4: Veri dosyası, batch, checkpoint/resume, CLI
- [x] İnsansı davranış + stealth + kalıcı profil desteği
- [x] Recorder (canlı → workflow), Set-of-Marks vision fallback (K4)
- [x] **P5: MV3 uzantı** (`packages/extension`) — side panel + gerçek, giriş
      yapılmış oturumda çalışma; **MCP server** (`packages/mcp-server`) — 6 tool stdio ile
- [x] **P6: Sertleştirme** — K3 BM25 sıkıştırma (150 eleman → %77 token düşüş),
      maliyet muhasebesi + `report.json` (cache/USD/faz dökümü), site profili cache
      (canlı ajan öğrendiği locator'ları domain başına saklar)
- [x] **500 satır regresyon koşusu** (`pnpm regression`) — sıfır token, resume,
      idempotency gerçek headless tarayıcıda doğrulandı (API anahtarı gerektirmez)
- [x] **P5+ CDP yükseltmesi** — uzantıda puppeteer `ExtensionTransport` +
      `chrome.debugger` ile gerçek OS mouse/klavye/koordinat input; side panel'de
      CDP/content mod seçici, CDP başarısızsa content'e otomatik fallback (ADR 0001)

Yol haritasının tamamı (P0–P6 + P5+) bitti. Sıradaki iş, gerçek `ANTHROPIC_API_KEY`
ile canlı `agent`/`record` yollarını bir sitede uçtan uca denemek.
