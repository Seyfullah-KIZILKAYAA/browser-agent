# Web Store Gizlilik Sekmesi — Alan Alan Cevaplar

Bu dosya, Chrome Web Store'daki gizlilik formunun her alanına **kopyala-yapıştır**
yapacağın metinleri içerir. (Uzantı v0.5.0 — content-script ve `scripting` izni
kaldırıldı, artık sadece CDP ile çalışıyor.)

---

## Uzak kod kullanıyor musunuz?
**→ Hayır, uzak kod iznini kullanmıyorum**

(Tüm JS pakete gömülüdür; dışarıdan kod indirilmez, `<script src="http...">` yoktur.
puppeteer-core kütüphanesinin kendi içindeki `new Function` kullanımı statik,
paketle gelen bir string üzerindedir — uzaktan yüklenen kod değildir.)

---

## Tek amaç (Single purpose)
```
Browser Agent, kullanıcının doğal dilde verdiği görevleri kullanıcının
tarayıcısında otomatik olarak gerçekleştiren bir yapay zeka asistanıdır.
Kullanıcı bir görev yazar; uzantı aktif sekmeyi okur ve görevi (gezinme,
tıklama, yazma, veri çıkarma) kullanıcı adına yapar.
```

---

## İzin gerekçeleri (her biri ilgili kutuya)

**tabs gerekçesi**
```
Görevi yürütmek için sayfa bilgisini okumak ve birden fazla sekme arasında
geçiş yapmak (bir sekmedeki bilgiyi diğerinde kullanmak) için gereklidir.
```

**activeTab gerekçesi**
```
Kullanıcı bir görev başlattığında yalnızca o an aktif olan sekmeyle etkileşim
kurmak için gereklidir.
```

**storage gerekçesi**
```
Kullanıcının API anahtarını, sağlayıcı ayarlarını ve sohbet geçmişini yalnızca
kullanıcının kendi tarayıcısında (chrome.storage.local) yerel olarak saklamak
için gereklidir. Hiçbir veri uzak sunucuya gönderilmez.
```

**sidePanel gerekçesi**
```
Uzantının kullanıcı arayüzü bir yan panel (side panel) olarak gösterildiği için
gereklidir.
```

**alarms gerekçesi**
```
Bir görev çalışırken servis çalışanının (service worker) boşta kapanmaması için
kısa aralıklı bir canlı tutma sinyali (heartbeat) kullanılır.
```

**debugger gerekçesi**
```
Uzantı, tarayıcı sekmesini gerçek fare/klavye girişiyle kontrol etmek için Chrome
DevTools Protocol'ü (puppeteer-core ExtensionTransport) kullanır. Bu, ajanın bir
insan gibi güvenilir biçimde tıklaması ve yazması için gereklidir. Debugger
YALNIZCA kullanıcı bir görev başlattığında, YALNIZCA aktif sekmeye bağlanır ve
görev biter bitmez ayrılır. Ağ trafiği yakalamak, başka kaynaklara kod enjekte
etmek veya arka planda veri toplamak için ASLA kullanılmaz.
```

**webNavigation gerekçesi**
```
Sayfa yüklenmesini/gezinmeyi algılayıp ajanın işlemi ancak sayfa yerleştikten
sonra yapmasını sağlamak için gereklidir.
```

**Ana makine izni gerekçesi (host permission — <all_urls>)**
```
Kullanıcı görevi herhangi bir web sitesinde verebilir; uzantının o siteyi
okuyabilmesi ve görevi yapabilmesi için tüm sitelerde çalışması gerekir. Uzantı
yalnızca kullanıcı bir görev başlattığında etkin olur.
```

---

## Gizlilik politikası URL'si
Aşağıdaki "GitHub Pages ile yayımlama" adımlarını izleyip elde ettiğin URL'yi bu
alana yapıştır. (İçerik: `privacy-policy-en.md` veya `privacy-policy-tr.md`.)

---

## Veri kullanımı beyanları (Data usage)
Web Store "Veri kullanımı" bölümünde genelde şu kutular işaretlenir/işaretlenmez:

- **Topladığınız veriler:** Uzantı kişisel veriyi BİR SUNUCUDA TOPLAMAZ. Ancak
  form, "kullanıcının sağladığı içerik" ve "web geçmişi/etkinlik" verilerinin
  kullanıcının seçtiği AI sağlayıcısına gönderildiğini beyan etmen gerekebilir.
  Dürüst olmak için şu kutuları işaretle (varsa):
  - "Kişisel iletişim bilgileri": HAYIR (uzantı toplamaz)
  - "Kullanıcı etkinliği / web geçmişi": görev sırasında okunan sayfa içeriği AI
    sağlayıcısına gider → EVET (işle ama satma)
  - "Web sitesi içeriği": EVET (görevi yapmak için okunur ve AI'ya gönderilir)
- **Üç zorunlu onay kutusu** (hepsini işaretle, çünkü hepsi doğru):
  - Kullanıcı verilerini onaylanan kullanımlar dışında üçüncü taraflara SATMIYORUM.
  - Verileri, uzantının tek amacı dışındaki amaçlarla KULLANMIYORUM/AKTARMIYORUM.
  - Verileri kredi notu belirleme veya borç toplama için KULLANMIYORUM/AKTARMIYORUM.
