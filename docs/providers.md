# Yapay Zeka Sağlayıcıları (Çoklu Model Desteği)

Sistem tek bir sağlayıcıya bağlı değildir. `LLMProvider` arayüzü (`llm/provider.ts`)
ince tutulur; her sağlayıcı kendi API formatına çevirir. Anahtar/muhasebe/token
bütçesi kontrolü hep bizde kalır (LangChain yok).

## Desteklenen sağlayıcılar

| Sağlayıcı | `BA_PROVIDER` | Anahtar env | Örnek model |
|---|---|---|---|
| Anthropic (Claude) | `anthropic` | `ANTHROPIC_API_KEY` | `claude-sonnet-5` |
| OpenAI (GPT) | `openai` | `OPENAI_API_KEY` | `gpt-4o-mini` |
| Google Gemini | `gemini` | `GEMINI_API_KEY` / `GOOGLE_API_KEY` | `gemini-3.6-flash` |
| OpenRouter | `openrouter` | `OPENROUTER_API_KEY` | `anthropic/claude-3.5-sonnet` |
| DeepSeek | `deepseek` | `DEEPSEEK_API_KEY` | `deepseek-chat` |
| Groq | `groq` | `GROQ_API_KEY` | `openai/gpt-oss-20b` |
| Ollama (yerel) | `ollama` | — (gerekmez) | `llama3.1` |
| Özel (OpenAI uyumlu) | `custom` | opsiyonel | `BA_BASE_URL` ile |

OpenAI, OpenRouter, DeepSeek, Groq, Ollama ve "custom" hepsi OpenAI Chat
Completions formatını kullandığı için tek `OpenAIProvider` sınıfıyla sürülür;
Anthropic ve Gemini kendi formatlarına sahiptir.

## Kullanım (CLI)

```powershell
# Anthropic (varsayılan)
$env:ANTHROPIC_API_KEY = "sk-ant-..."
node packages/cli/dist/index.js agent "..." --domains site.com --headful

# OpenAI
$env:BA_PROVIDER = "openai"; $env:OPENAI_API_KEY = "sk-..."
$env:BA_MODEL_CHEAP = "gpt-4o-mini"      # adım modeli
node packages/cli/dist/index.js agent "..." --domains site.com --headful

# Google Gemini
$env:BA_PROVIDER = "gemini"; $env:GEMINI_API_KEY = "..."

# OpenRouter (tek anahtar, yüzlerce model)
$env:BA_PROVIDER = "openrouter"; $env:OPENROUTER_API_KEY = "sk-or-..."
$env:BA_MODEL_CHEAP = "openai/gpt-4o-mini"

# Yerel Ollama (anahtar yok, ücretsiz)
$env:BA_PROVIDER = "ollama"; $env:BA_MODEL_CHEAP = "llama3.1"

# Özel OpenAI-uyumlu uç nokta (LM Studio, vLLM, kurumsal proxy...)
$env:BA_PROVIDER = "custom"; $env:BA_BASE_URL = "http://localhost:1234/v1"
```

**Otomatik algılama:** `BA_PROVIDER` verilmezse, hangi `*_API_KEY` mevcutsa o
sağlayıcı seçilir (sıra: Anthropic → OpenAI → Gemini → OpenRouter → DeepSeek →
Groq → Ollama). Böylece sadece anahtarı verip başlamak yeter.

## Model katmanları (router)

`routerFromEnv()` üç katman kurar:
- **strong** (`BA_MODEL_STRONG`): planlama, derleme, heal — zor akıl yürütme.
- **cheap** (`BA_MODEL_CHEAP`): adım/navigasyon, doğrulama — yüksek hacim, ucuz.
- **vision** (`BA_MODEL_VISION`): görsel fallback; verilmezse cheap kullanılır.

Her katman aynı sağlayıcının farklı modelidir (örn. Anthropic'te opus + sonnet).

## Groq / gpt-oss ve araç-çağrısı (tool-call) davranışı

Groq'un `gpt-oss` modelleri agentic eğitildiğinden, biz düz JSON istesek ve JSON
mode göndersek bile bazen kendiliğinden bir "tool call" üretir. Groq bunu 400 ile
reddeder (`tool_use_failed`). `OpenAIProvider` bu durumu yakalar: hatanın
`failed_generation` alanındaki tool argümanlarını ayrıştırıp bizim aksiyon
JSON'umuza çevirir (`recoverFromToolCall`), böylece adım kaybolmaz.

Yine de bu davranış sık tekrarlarsa daha büyük modele geç: `openai/gpt-oss-120b`
(strong+cheap ikisi de) veya farklı bir sağlayıcı (Gemini flash, DeepSeek).

## Rate limit (429)

Groq ücretsiz katmanında dakikada token (TPM) sınırı düşüktür (ör. 8000). Ajan
her adımda snapshot gönderdiği için uzun görevlerde bu aşılabilir. Tüm
sağlayıcılar `fetchWithRetry` ile 429 ve geçici 5xx hatalarında otomatik bekler
(Retry-After / "try again in Xs" ipucunu okur) ve yeniden dener — görev birkaç
saniye duraklayıp devam eder, çökmez. Sık 429 alıyorsan: Groq Dev Tier'a geç,
daha küçük bir model kullan, ya da `--fast` yerine varsayılan insansı gecikmeyi
koru (istekleri zamana yayar).

## Uzantı

Side panel'de ⚙ → **Yapay zeka sağlayıcı** açılır menüsünden seçilir; anahtar ve
model alanları seçime göre otomatik önerilir. Ollama/özel için Base URL alanı
görünür ve anahtar isteğe bağlıdır. Ayarlar `chrome.storage.local`'da saklanır.

## Maliyet muhasebesi

`llm/pricing.ts` her modelin USD/1M token fiyatını tutar; bilinmeyen model
varsayılana düşer. `setPricing(model, {input, output})` ile güncellenebilir.
Cache muhasebesi (cache read/write) yalnızca Anthropic'te desteklenir; diğer
sağlayıcılar sıfır cache token raporlar.
