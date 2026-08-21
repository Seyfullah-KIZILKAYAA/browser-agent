# @ba/extension — MV3 Tarayıcı Uzantısı

LLM'in **senin gerçek, giriş yapılmış Chrome oturumunda** çalışmasını sağlar.
Görevi side panel'e yazarsın; ajan aktif sekmede insan gibi adım adım yapar.

## Nasıl çalışır

```
Side Panel (UI)  ──komut──▶  Background SW (navigator döngüsü)  ──DOM işi──▶  Content Script
     ▲                              │  (core motoru burada koşar)                    │
     └──────────olay/log────────────┘◀───────────sonuç──────────────────────────────┘
```

- **Content script** aktif sayfada DOM'u okur/etkiler (gerçek oturum, çerezler hazır).
- **Background service worker** core `navigator` döngüsünü çalıştırır; `ExtensionSession`
  core'un `BrowserSession` arayüzünü content script'e mesajlaşarak implemente eder.
- **Side panel** görevi alır, canlı adımları gösterir, yıkıcı aksiyonlarda onay ister.

## İki sürüş modu

Side panel'de **sürüş modu** seçilir:

- **CDP** (varsayılan, `cdp-session.ts`): puppeteer-core `ExtensionTransport` ile
  `chrome.debugger` üzerinden tam CDP. **Gerçek OS mouse/klavye** ve koordinat
  tıklama — güvenilir, insansı input. Attach süresince sarı "debugging" çubuğu
  görünür (normaldir). Attach başarısızsa otomatik content moduna düşer.
- **Content script** (`extension-session.ts`): DOM olaylarıyla (relay/debugger
  gerektirmez). CDP'nin çalışmadığı durumlar için yedek.

İkisi de core'un `BrowserSession` arayüzünü implemente eder; motor değişmez.

## Kurulum (geliştirme)

```powershell
# Kök dizinde: önce core'u derle, sonra uzantıyı bundle et
pnpm build
pnpm --filter @ba/extension build
```

Sonra Chrome'da:
1. `chrome://extensions` → sağ üstten **Geliştirici modu** aç.
2. **Paketlenmemiş öğe yükle** → `packages/extension/dist` klasörünü seç.
3. Araç çubuğundaki simgeye tıkla → side panel açılır.
4. ⚙ Ayarlar'dan `ANTHROPIC_API_KEY`'i gir ve kaydet (yerel depoda saklanır).
5. Bir web sitesine git, görevi yaz, izinli alan adını gir, **Başlat**.

## Sınırlar

- `chrome://` ve Web Store sayfalarında çalışmaz (her iki modda da).
- **CDP modu**: attach sırasında sarı "debugging" çubuğu; dosya yükleme
  OS-erişilebilir mutlak path ister (uzantı sandbox'ında genelde yok); DevTools
  açık sekmede debugger çakışır; SW ~30sn boşta ölebilir.
- **Content modu**: gerçek OS mouse/koordinat (K5) ve dosya yükleme yok — DOM
  `hover`/`click` kullanır (insansı gecikmeler yine var).
