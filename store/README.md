# Chrome Web Store Yükleme Materyalleri

Bu klasör, Browser Agent uzantısını Chrome Web Store'a yüklemek için gereken
tüm materyalleri içerir.

## Dosyalar

| Dosya | Ne için |
|---|---|
| `store-listing.md` | Uzantı adı, kategori, kısa/detaylı açıklama (TR + EN) |
| `privacy-policy-tr.md` / `privacy-policy-en.md` | Gizlilik politikası — bir web sayfasında yayımlayıp URL'sini Store'a ver |
| `reviewer-notes.md` | Google incelemecisine not (özellikle `debugger` izni gerekçesi) |
| `screenshot-1..4.png` | 1280×800 tanıtım ekran görüntüleri |

## Yükleme adımları (kontrol listesi)

1. **Paketi yükle:** `browser-agent-v0.4.0.zip` (proje kökünde) →
   [Developer Dashboard](https://chrome.google.com/webstore/devconsole) → "New Item".
2. **Store listeleme:** `store-listing.md`'den açıklamaları kopyala.
3. **Ekran görüntüleri:** `screenshot-1..4.png` dosyalarını yükle (en az 1 zorunlu).
4. **Gizlilik:** `privacy-policy-*.md` içeriğini bir web sayfasında yayımla
   (GitHub Pages, kişisel site vb.) ve URL'yi "Privacy policy URL" alanına gir.
5. **İzin gerekçeleri:** "Permission justification" alanına `reviewer-notes.md`'deki
   ilgili açıklamaları gir. Özellikle **`debugger`** iznini mutlaka açıkla.
6. **Tek seferlik ücret:** İlk uzantıda 5 USD geliştirici kayıt ücreti.

## Önemli uyarı
`debugger` izni ve `<all_urls>` geniş izinleri Web Store incelemesinde en çok
sorgulanan noktalardır. Gerekçeleri net verilmezse red gelebilir; `reviewer-notes.md`
bunun için hazırlandı.
