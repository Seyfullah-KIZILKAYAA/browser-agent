# Algı Merdiveni ve Token Bütçeleri

Tek yöntem değil, maliyet sırasına dizilmiş kademeli tırmanış:

```
K0  Cache/IR hit          → 0 token      (EXECUTE kipinde her zaman burada)      ✅ uygulandı
K1  Filtrelenmiş snapshot → ~50-1500     (VARSAYILAN — PAGE_SNAPSHOT_FN)         ✅ uygulandı
K2  Yeni-eleman diff (*)  → ~ucuz        (renderSnapshot(snap, prev): * işareti) ✅ uygulandı
K3  BM25 sorgu filtresi   → top-30       (büyük sayfada — rank.ts, stem-aware)   ✅ uygulandı
K4  Set-of-Marks vision   → img token    (DOM yetersiz — vision.ts, som-script)  ✅ uygulandı
K5  Ham koordinat mouse   → son çare     (clickAt — canvas/drag)                 ✅ altyapı hazır
```

Canlı ajan (`navigator.ts`) her adımda K1 kullanır ve önceki snapshot'a göre
`*yeni-eleman` diff'ini modele gösterir (aksiyon sonrası ne değişti sinyali).
Sayfa 60+ eleman içeriyorsa K3 devreye girer: göreve göre BM25 ile en alakalı 30
eleman öne çıkar (`rank.ts`, Türkçe ekler için stem-aware eşleşme). Ölçüm: 150
elemanlı Wikipedia'da token 1145 → 259 (%77 düşüş). DOM bir hedefi bulamazsa
`visionPickElement` (K4) Set-of-Marks kutuları çizip vision modelinden NUMARA
ister (koordinat değil). `ba snapshot <url> --query "..."` ile K3 test edilebilir.

## K1'in tanımı (uygulandı — `core/src/perception/page-script.ts`)

- Sadece aksiyon alınabilir roller: button, link, textbox, searchbox, combobox,
  checkbox, radio, tab, menuitem, option, slider, switch, listbox.
- Kararlı index: her eleman `data-ba-i="N"` ile işaretlenir, çıktı `[N] role "ad" (durumlar)`.
- Görünürlük + paint-order filtresi (`elementFromPoint` ile kapatılan node atılır;
  shadow DOM istisnası: host'a çarpan hit akraba sayılır).
- Shadow DOM: open shadow root'lar gezilir.
- Ardışık aynı role+ad tekrarları 3 örnekten sonra atılır; toplam eleman 150 ile sınırlı.
- Password input değeri asla serialize edilmez (sadece `password` durumu).
- Çıktı satır bazlı düz metin — JSON/YAML değil (süslü parantez token yakar).

## Ölçülen değerler

| Sayfa | Eleman | Token |
|---|---|---|
| examples/demo-form.html | 3 | ~54 |
| wikipedia.org | 31 | ~359 |

Hedefler (kabul kriterleri): adım başına snapshot ≤1500 token; 5-10 adımlık
COMPILE toplamı ≤30k; EXECUTE satır başına 0; HEAL adım başına ≤5k.
Token tahmini: `estimateTokens` (~4 karakter/token).
