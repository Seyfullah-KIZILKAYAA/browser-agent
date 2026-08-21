/**
 * Minimal i18n for the side panel. Two languages (Turkish, English) selected in
 * settings and stored in chrome.storage.local. `t(key)` returns the string for
 * the active language; `applyI18n()` fills every element marked with a data
 * attribute (data-i18n = textContent, data-i18n-title = title,
 * data-i18n-ph = placeholder).
 */

export type Lang = "tr" | "en";

type Dict = Record<string, string>;

const TR: Dict = {
  historyTitle: "Geçmiş sohbetler",
  historyEmpty: "Henüz sohbet yok.",
  providerLabel: "Yapay zeka sağlayıcı",
  apiKeyLabel: "API anahtarı",
  apiKeyPh: "anahtar",
  baseUrlLabel: "Base URL",
  modelLabel: "Model (adım)",
  advanced: "Gelişmiş",
  domainsLabel: "İzinli alan adları",
  domainsHint: "(boş = tüm siteler)",
  domainsPh: "boş = her site",
  maxStepsLabel: "Maks. adım",
  maxStepsHint: "(0 = sınırsız)",
  validateLabel: "Her adımı doğrula",
  langLabel: "Uygulama dili",
  save: "Kaydet",
  emptyLine1: "Bir görev yaz, tarayıcıda senin için yapayım.",
  emptyLine2: 'Örn: "google\'da hava durumu Ankara ara ve sonucu söyle"',
  approve: "Onayla",
  reject: "Reddet",
  taskPh: "Görev yaz…",
  titleHistory: "Geçmiş sohbetler",
  titleNewChat: "Yeni sohbet",
  titleSettings: "Ayarlar",
  titleAttach: "Dosya ekle",
  titleCancel: "Durdur",
  titleSend: "Gönder",
  // Runtime strings
  running: "Çalışıyor…",
  stepsToggle: "Adımları göster",
  notCompleted: "Tamamlanamadı",
  error: "Hata",
  approvalPrefix: "Onay gerekiyor",
  emptyTask: "(başlıksız)",
  delete: "Sil",
  unlimitedWarn: "Adım sınırı yok. Gerekirse 'Durdur' ile durdur.",
  allSitesWarn: "Tüm sitelere izin verildi (sınırsız mod). Yıkıcı aksiyonlarda onay istenir.",
};

const EN: Dict = {
  historyTitle: "Past chats",
  historyEmpty: "No chats yet.",
  providerLabel: "AI provider",
  apiKeyLabel: "API key",
  apiKeyPh: "key",
  baseUrlLabel: "Base URL",
  modelLabel: "Model (step)",
  advanced: "Advanced",
  domainsLabel: "Allowed domains",
  domainsHint: "(empty = all sites)",
  domainsPh: "empty = any site",
  maxStepsLabel: "Max steps",
  maxStepsHint: "(0 = unlimited)",
  validateLabel: "Validate each step",
  langLabel: "App language",
  save: "Save",
  emptyLine1: "Type a task and I'll do it in your browser.",
  emptyLine2: 'e.g. "search the weather in Ankara on Google and tell me"',
  approve: "Approve",
  reject: "Reject",
  taskPh: "Type a task…",
  titleHistory: "Past chats",
  titleNewChat: "New chat",
  titleSettings: "Settings",
  titleAttach: "Attach file",
  titleCancel: "Stop",
  titleSend: "Send",
  running: "Working…",
  stepsToggle: "Show steps",
  notCompleted: "Not completed",
  error: "Error",
  approvalPrefix: "Approval needed",
  emptyTask: "(untitled)",
  delete: "Delete",
  unlimitedWarn: "No step limit. Use 'Stop' if needed.",
  allSitesWarn: "All sites allowed (unrestricted). Destructive actions still ask for approval.",
};

const DICTS: Record<Lang, Dict> = { tr: TR, en: EN };
let current: Lang = "en"; // English is the default UI language.

export function setLang(lang: Lang): void {
  current = lang === "en" ? "en" : "tr";
}
export function getLang(): Lang {
  return current;
}
export function t(key: string): string {
  return DICTS[current][key] ?? DICTS.tr[key] ?? key;
}

/** Fill all elements marked with data-i18n / data-i18n-title / data-i18n-ph. */
export function applyI18n(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n!;
    el.textContent = t(key);
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((el) => {
    el.title = t(el.dataset.i18nTitle!);
  });
  root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-i18n-ph]").forEach((el) => {
    el.placeholder = t((el as HTMLElement).dataset.i18nPh!);
  });
  document.documentElement.lang = current;
}
