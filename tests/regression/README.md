# Regresyon Koşusu

Tekrarlama motorunun (EXECUTE modu) uçtan uca doğrulaması. **API anahtarı
gerektirmez** — yalnızca deterministik replay yolunu, gerçek headless tarayıcıda
çalıştırır.

```powershell
pnpm build          # önce core/shared derlenmiş olmalı
pnpm regression     # 500 satır (veya: node tests/regression/run-regression.mjs <N>)
```

## Ne doğrular

500 satırlık üretilmiş CSV'yi yerel `examples/demo-form.html` üzerinde işler ve
şunları kontrol eder:

1. **Tüm satırlar başarılı** — 500/500 "ok".
2. **Sıfır LLM token** — `BudgetGuard.total === 0` (motorun temel vaadi).
3. **results.csv doğruluğu** — satır başına bir "ok" kaydı.
4. **Resume** — yarısı işlendikten sonra kesilen koşu, aynı `runId` ile devam
   edip kalan yarıyı tamamlar; ilk yarı atlanır.
5. **Idempotency** — tamamlanmış bir koşu tekrar başlatılınca her satır atlanır,
   sıfır iş yapılır.

Çıktı dosyaları `tests/regression/.work/` altına yazılır (gitignore'lu).

## Not

Bu suite deterministik yolu kapsar. Canlı ajan (`agent`/`record`) ve heal
yolları LLM çağrısı içerdiğinden ayrı, API anahtarı gerektiren bir doğrulama
ister; onlar için `docs/` altındaki manuel prosedürü izle.
