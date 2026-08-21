# Kod ve Dosya Kuralları

- **Bir dosya = bir sorumluluk.** Kaynak dosyaları 300 satırı geçmez; geçerse böl.
- **Dizinler probleme göre**, teknik katmana göre değil: `perception/`, `locator/`,
  `workflow/` var; `helpers/`, `utils/`, `services/`, `managers/` yok.
- **Barrel (`index.ts`) sadece paket kökünde**, iç dizinlerde yok.
- İsimlendirme: dosya `kebab-case.ts`, tip/class `PascalCase`, fonksiyon `camelCase`.
- **Katman kuralı:**
  ```
  shared → hiçbir şeye bağımlı değil
  core   → shared
  cli    → core, shared
  core ASLA → chrome.*, DOM globalleri (DOM erişimi yalnızca page-script.ts string'leri içinde)
  ```
- DOM erişimi tek yerde: `core/src/perception/page-script.ts`. Başka hiçbir dosya
  sayfa içinde JS çalıştırmaz (aksiyonlar `BrowserSession` arayüzü üzerinden).
- Her public fonksiyonun üstünde tek satır ne yaptığı. Paragraf yorum yok.
- `any` yasak; `unknown` + zod parse.
- Yeni bağımlılık = önce sor. Mevcutlar: zod, playwright-core, papaparse, xlsx.
- Testler LLM'e ve gerçek API'ye gitmez; tarayıcı gerektiren doğrulama
  `examples/` üzerinden manuel/duman testidir.
