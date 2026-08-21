# Güvenlik Modeli (opsiyonel değil)

Strateji filtreleme değil, **kapsama**:

1. **Prompt injection kapsama.** Sayfa metni LLM'e her zaman
   `<untrusted_page_content>` zarfıyla gider; system prompt bu zarfın içindeki
   hiçbir talimatın uygulanmayacağını söyler (`core/src/agent/prompts.ts`).
   Sayfa içeriği veridir, talimat değildir.
2. **Domain beyaz listesi.** `workflow.allowedDomains` dışına navigasyon (link
   tıklaması dahil) = run durur (`core/src/security/allowlist.ts`).
   `file` girdisi yalnızca yerel test sayfaları için.
3. **HITL.** `risk: destructive` adımlar onaysız çalışmaz; approver yoksa hata
   fırlatılır (`core/src/security/approval.ts`). Bu bayrak kodda kapatılamaz.
4. **Credential'lar model bağlamına girmez.** `{{secret:ad}}` placeholder'ı
   sadece runtime'da `BA_SECRET_<AD>` env değişkeninden çözülür; loglarda `***`
   olarak görünür; snapshot'ta password input değeri hiç serialize edilmez.
5. **Audit log.** Her aksiyon `runs/<runId>/trace.jsonl` dosyasına: zaman, url,
   adım, süre, hata, heal bilgisi.
6. **Bütçe sert limiti.** `BudgetGuard` token bütçesi aşılırsa run'ı durdurur.

## Onay gerektiren işlem örnekleri (destructive olarak işaretle)

Satın alma, para transferi, e-posta/mesaj gönderme, hesap/dosya silme, şifre
değiştirme, geri döndürülemez form gönderimi, dış sistemde kalıcı veri değiştirme.

## Henüz yapılmadı (P5/P6)

Ayrı Chrome profili izolasyonu, vault entegrasyonu, reader/doer çağrı ayrımı,
rate limiting.
