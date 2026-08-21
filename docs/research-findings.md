# Açık Kaynak Repo İnceleme Bulguları

GitHub repolarının kaynak kodu ve dokümanları incelenerek çıkarılan, projeye
uygulanan somut teknikler. Kopyalama değil, algoritma alımı.

## Eleman listesi formatı (browser-use, nanobrowser, playwright-mcp ortak standardı)

- Satır başına bir eleman: `[index] role "name" (durumlar)`. Index sadece
  etkileşimli elemanlara verilir.
- **`*[index]` = önceki adımdan beri YENİ eleman** (index-set diff ile ucuz hesaplanır).
  Modelin sayfada ne değiştiğini görmesi için güçlü ve bedava bir sinyal.
- playwright-mcp `[ref=eN]`, caveman `[uid]` kullanır — hepsi "üretim başına geçerli handle".

## Filtreleme / pruning (browser-use serializer)

- **Paint-order occlusion**: en üstteki node'dan başlayıp opak dikdörtgen birleşimi
  biriktir; rect tamamen birleşimin içindeyse eleman gizlenmiş sayılır. Şeffaflık
  koruması: `opacity < 0.8` veya `rgba(...,0)` arka planlar birleşime EKLENMEZ.
- **%99 bbox containment**: bir eleman ebeveyninin sınırlarını ≥%99 dolduruyorsa ve
  kendi handler'ı yoksa atlanır ("5 span içeren buton" gürültüsünü öldürür).
- File input'lar `opacity:0` olsa bile zorla görünür (Bootstrap deseni).

## Bağlam / geçmiş yönetimi (browser-use message_manager)

- Büyüyen sohbet değil: her adımda tek "state" mesajı yeniden kurulur.
- Geçmiş digest'i: ilk item + "[... N adım atlandı ...]" + son (N-1) item.
- Eşik tabanlı LLM özetleme: geçmiş ~40k karakteri aşınca eski item'lar özete
  katlanır; okuma/aksiyon sonuçları 60k karakterde sert kesilir.

## Aksiyon cache + self-heal (Stagehand)

- `observe()` → `{selector, method, arguments}` döndürür (çalıştırmaz).
- Cache key = (talimat, sayfa kimliği) → değer = bu obje. İlk çalıştırma 1 LLM,
  sonrakiler saf Playwright dispatch — **sıfır token**.
- Hata → try/catch → string talimatla `act()` çağır (LLM yeniden planlar), cache'i güncelle.
- **Bu, bizim COMPILE→EXECUTE→HEAL üçlümüzün birebir karşılığı.**

## Doğrulama döngüsü (Skyvern, caveman)

- Aksiyon "dispatched" sayılır, "başarılı" değil. Kanıt = taze snapshot/diff.
- Validator AYRI ucuz bir çağrı, aktörün iddiasına değil taze sayfa durumuna dayanır.
- Sabit 3 alanlı verdict: `{page_info, thoughts, user_goal_achieved}`.
- Sayfadan gelen başarı kriteri "untrusted" işaretlenir (prompt injection direnci).
- Çok adımlı hedefte alt-hedef bitince `user_goal_achieved:true` (büyük hedef bitmese de).

## Adım-kapsamlı healing prompt (workflow-use)

"SADECE adım N'i tamamla, başka bir şey yapma. Başarısız olan aksiyonu TEKRARLAMA,
farklı bir aksiyon seç. Adım N'in amacına ulaşınca Done çağır." — kırılan adımı
onarmanın doğru deseni.

## Değişken çıkarımı (workflow-use)

- Manuel işaretleyici: kayıt sırasında `VAR:ad:değer` yaz → regex `{ad}` yapar (LLM yok).
- LLM analizi: kişisel bilgi/arama terimi/form verisi parametrelenir; navigasyon
  URL'leri ve UI etiketleri sabit kalır.

## MV3 mimarisi (nanobrowser — P5 için)

- Background SW: `chrome.runtime.onConnect` port ('side-panel-connection');
  komutlar new_task/follow_up/cancel/pause/resume; heartbeat ping-pong SW'yi ayakta tutar.
- CDP erişimi: puppeteer-core `ExtensionTransport.connectTab(tabId)` — uzantı
  içinde chrome.debugger üzerinden tam Puppeteer (chrome.scripting değil).
- `_waitForStableNetwork`: analitik/reklam istekleri hariç request/response çiftlerini
  izleyerek idle tespiti.

## Büyük sayfada sorgu filtresi (caveman)

- `snapshot(url, query?)`: BM25 ile en iyi 12 node + ata zinciri. 200 satırlık
  dashboard'u ~98 token'da tarar. Ham ağaç recovery handle'ı ile saklanır (kayıpsız drill-down).
