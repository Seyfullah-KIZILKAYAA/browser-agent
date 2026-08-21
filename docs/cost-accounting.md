# Maliyet Muhasebesi ve Raporlama (P6)

"Token maliyetini kontrol et" hedefinin ölçüm ayağı. Her LLM çağrısı faz ve
model bilgisiyle kaydedilir; run sonunda tam bir maliyet dökümü üretilir.

## BudgetGuard (`llm/budget.ts`)

- **Sert token tavanı**: `maxTokens` aşılırsa run durur.
- **Opsiyonel USD tavanı**: `maxUsd` aşılırsa run durur.
- **Cache muhasebesi**: `cache_read_input_tokens` ve `cache_creation_input_tokens`
  Anthropic yanıtından okunur; cache okuması ~%10, yazması ~%125 fiyatlanır
  (`llm/pricing.ts`). `cacheHitRate` cache etkinliğini gösterir.
- **Faz dökümü**: her `record(usage, phase)` çağrısı faz bazında (planner,
  navigator, validator, healer, vision, compiler) toplar.

## Fiyatlandırma (`llm/pricing.ts`)

Model başına USD/1M token tablosu. `setPricing(model, {input, output})` ile
güncellenebilir. Bilinmeyen model varsayılan bir fiyata düşer (tahmin amaçlı).

## Run raporu (`telemetry/report.ts`)

Batch sonunda `runs/<runId>/report.json` yazılır + terminale okunabilir özet:

```
Run raporu: urun-fiyat-guncelle (2026-...-Z)
  Satırlar: 100 başarılı, 0 hatalı, 0 atlanan / 100
  Token: 4820  ·  ~$0.0142  ·  cache-hit 72%
  Satır başına: ~$0.00014
```

EXECUTE modunda (heal yok) token 0, USD $0 — tekrarlama motorunun temel vaadi.
Token sadece heal (batch) veya canlı ajan/derleme sırasında harcanır.

## Prompt caching

Statik system prompt her istekte `cache_control: ephemeral` ile gönderilir
(`llm/provider.ts`). Cache okuması ~%90 ucuz olduğundan çok-adımlı canlı ajan
döngüsünde sabit prefix'in maliyeti neredeyse sıfırlanır; `cacheHitRate` bunu
raporlar.
