# ADR 0001: MV3 Uzantı Mimarisi (P5)

## Durum
**MVP uygulandı** (`packages/extension`, `packages/mcp-server`). Aşağıdaki
"nanobrowser'dan alınan mimari" hedeftir; MVP daha basit bir content-script
yolu izler, ExtensionTransport+CDP yükseltmesi sonraki adımdır.

## MVP'de yapılan (content-script yolu)
- `ExtensionSession implements BrowserSession`: DOM işlemlerini aktif sekmenin
  content script'ine mesajla yaptırır (relay/CDP yok). Core motoru service
  worker'da olduğu gibi koşar.
- Background SW: side panel ile isimli port ('ba-side-panel'), start/cancel/approve
  komutları, `runNavigator` döngüsü, HITL onayını UI'ya köprüleyen `approver`,
  `shouldCancel` ile temiz iptal, alarm-heartbeat ile SW canlı tutma.
- Side panel (düz TS/DOM, framework yok): görev girişi, canlı adım/log akışı,
  token sayacı, yıkıcı aksiyon onay diyaloğu, ayarlarda API anahtarı.
- `packages/mcp-server`: snapshot/navigate/click/type/extract/agent tool'larını
  MCP (stdio) üzerinden dışa açar — Claude Desktop/Cursor/Claude Code kullanabilir.
- Core'a `@ba/core/browser` alt-giriş noktası eklendi: Node-only bağımlılıklar
  (playwright, node:fs) olmadan tarayıcıda çalışan motor yüzeyi.

## Sonraki adım (CDP yükseltmesi) — nanobrowser'dan alınan mimari

## Karar
Gerçek, giriş yapılmış kullanıcı oturumunda çalışmak için MV3 tarayıcı uzantısı
ayrı bir paket (`packages/extension`) olarak eklenecek. `packages/core` motoru
`BrowserSession` arayüzü arkasında transport'tan bağımsız kaldığı için değişmez.

## nanobrowser'dan alınan mimari

- **Transport**: puppeteer-core `ExtensionTransport.connectTab(tabId)` ile
  `chrome.debugger` üzerinden tam CDP. (chrome.scripting değil.) Bu, yeni bir
  `ExtensionBridgeSession implements BrowserSession` olarak yazılacak.
- **Background service worker**: `chrome.runtime.onConnect` port
  ('side-panel-connection'); komutlar new_task / follow_up / cancel / pause / resume;
  heartbeat ping-pong SW'yi canlı tutar; port.onDisconnect görevi iptal eder.
- **Side panel (React)**: görev girişi, canlı adım durumu, HITL onay diyaloğu,
  token sayacı, durdur/duraklat. navigator.ts'in `log` ve `approver` kancaları
  bu UI'ya bağlanır.
- **_waitForStableNetwork**: analitik/reklam hariç request/response çiftlerini
  izleyerek idle tespiti (statik sleep yerine).
- `chrome://` ve Web Store sayfaları reddedilir.

## CDP yükseltmesi — UYGULANDI (P5+)
`CdpExtensionSession` (`background/cdp-session.ts`) yazıldı:
- puppeteer-core `^24.31.0`, `ExtensionTransport.connectTab(tabId)` →
  `chrome.debugger.attach`, `connect({ protocol: "cdp" })` → tek sayfalık `Page`.
- **Gerçek OS input**: `page.mouse.move/click`, `page.keyboard`, koordinat tıklama
  (K5) `Input.dispatchMouseEvent` ile — content-script'in yapamadığı güvenilir input.
- Manifest'e `debugger` + `webNavigation` izinleri eklendi.
- Side panel'de **sürüş modu seçici** (CDP / content). CDP attach başarısızsa
  otomatik content-script'e düşer.
- Bundle: puppeteer-core'un Node-only launcher kodu (`@puppeteer/browsers`,
  `node:*`, `chromium-bidi`, `puppeteer/node/`) esbuild plugin'iyle stub'lanır —
  uzantıda hiç çalışmaz, sadece `ExtensionTransport` kullanılır (background.js ~1.3mb).

### Bilinen sınırlar (araştırmadan)
- `chrome://` ve Web Store sayfalarına attach edilemez (background zaten guard'lıyor).
- "Debugging" sarı çubuğu attach süresince görünür (kaçınılmaz).
- Dosya yükleme OS-erişilebilir mutlak path ister; uzantı sandbox'ında genelde yok.
- `page.createCDPSession()` ve çoklu-sekme desteklenmez (puppeteer #13251).
- SW ~30sn boşta ölür; aktif debugger olayları canlı tutar ama garanti değil.

## MCP server (aynı fazda) — UYGULANDI
`packages/mcp-server`: snapshot/navigate/click/type/extract/agent tool'ları
stdio MCP ile. Core'u sararak; playwright ile Node'da çalışır.
