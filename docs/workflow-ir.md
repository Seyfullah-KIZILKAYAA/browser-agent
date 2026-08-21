# Workflow IR Sözleşmesi

Tek doğruluk kaynağı: `packages/shared/src/schema/workflow.ts` (zod). Şema
değişikliği ADR gerektirir (`docs/adr/`).

## Örnek

```jsonc
{
  "version": 1,
  "name": "urun-fiyat-guncelle",
  "createdBy": "compile",              // compile | recorder | manual
  "allowedDomains": ["panel.example.com"],  // beyaz liste — dışına çıkılırsa run durur
  "inputs": [
    { "name": "sku",   "type": "string", "source": "column:SKU",   "required": true }
  ],
  "steps": [
    { "id": "s1", "action": "navigate", "url": "https://panel.example.com/urun/{{sku}}" },
    { "id": "s2", "action": "type",  "target": "@t1", "value": "{{fiyat}}", "clearFirst": true, "risk": "write" },
    { "id": "s3", "action": "click", "target": "@t2", "risk": "write" },
    { "id": "s4", "action": "waitFor", "condition": { "textPresent": "Kaydedildi" }, "timeoutMs": 15000 }
  ],
  "targets": {
    "@t1": {                            // çok katmanlı locator — self-healing'in temeli
      "role": "textbox", "name": "Satış Fiyatı",
      "testId": null, "css": "#price-input", "xpath": "/html[1]/...",
      "text": null, "nth": 0,
      "anchor": { "role": "heading", "name": "Fiyatlandırma" }
    }
  },
  "onFailure": "heal",                  // heal | abort | skipRow
  "budget": { "maxTokens": 200000 }
}
```

## Locator çözümleme sırası (runtime, LLM yok)

`role+name` → `testId` → `anchor+role` → `css` → `xpath` → `görünür metin` → HEAL

CSS/XPath kırılgandır; `role+name` UI değişikliklerine dayanıklıdır — bu yüzden önce o.
İmplementasyon: `core/src/perception/page-script.ts` içindeki `PAGE_RESOLVE_FN`.

## Aksiyon seti (kapalı liste — genişletmek ADR gerektirir)

`navigate, click, type, select, check, upload, scroll, waitFor, assert, extract,
keypress, hover, goBack, screenshot, sleep`

Her adımın `risk` alanı: `read | write | destructive`.
`destructive` → insan onayı zorunlu; konfigürasyonla kapatılamaz (CLI'da `--yes`
sadece kullanıcının bilinçli ön onayıdır).

## Değişkenler

- `{{ad}}` → `inputs` üzerinden veri satırından veya `--var` ile gelir.
- `{{secret:ad}}` → SADECE runtime'da `BA_SECRET_<AD>` ortam değişkeninden çözülür;
  LLM bağlamına ve loglara asla girmez.
