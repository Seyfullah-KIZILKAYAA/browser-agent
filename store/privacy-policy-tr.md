# Gizlilik Politikası — Browser Agent

**Son güncelleme:** 21 Ağustos 2026

Browser Agent ("uzantı"), tarayıcınızda görevleri sizin adınıza otomatikleştiren
bir yapay zeka aracıdır. Gizliliğinize önem veriyoruz. Bu politika, uzantının
hangi verileri işlediğini ve nasıl kullandığını açıklar.

## Kısa özet

- Uzantının **kendi sunucusu yoktur.** Verileriniz bize gönderilmez, bizde
  saklanmaz. Uzantı tamamen sizin tarayıcınızda çalışır.
- API anahtarınız yalnızca **sizin tarayıcınızda yerel olarak** saklanır.
- Sayfa içeriği yalnızca **sizin seçtiğiniz yapay zeka sağlayıcısına** (örn.
  Anthropic, OpenAI, Google) bir görevi yerine getirmek için gönderilir.

## Toplanan ve işlenen veriler

### 1. API anahtarınız
Uzantıyı kullanmak için seçtiğiniz yapay zeka sağlayıcısının API anahtarını
girersiniz. Bu anahtar tarayıcınızın yerel deposunda (`chrome.storage.local`)
saklanır ve **yalnızca** ilgili sağlayıcının API'sine istek gönderirken kullanılır.
Anahtarınız başka hiçbir yere iletilmez.

### 2. Sayfa içeriği ve görev metni
Bir görev verdiğinizde, uzantı o an açık olan sayfanın etkileşimli öğelerini
(butonlar, bağlantılar, form alanları) ve gerektiğinde metin içeriğini okur.
Bu bilgi, görevinizi tamamlaması için **doğrudan sizin seçtiğiniz yapay zeka
sağlayıcısına** gönderilir. Sağlayıcının bu veriyi nasıl işlediği, o sağlayıcının
kendi gizlilik politikasına tabidir.

### 3. Sohbet geçmişi
Verdiğiniz görevler ve sonuçları, uzantı içinde geçmişe erişebilmeniz için
tarayıcınızın yerel deposunda saklanır. Bu geçmiş **yalnızca sizin
cihazınızdadır** ve istediğiniz zaman uzantı içinden silebilirsiniz.

### 4. Yüklediğiniz dosyalar
Bir dosya eklerseniz, içeriği görevinizi yerine getirmek için yapay zeka
sağlayıcısına gönderilir. Dosyalar bir sunucuya yüklenmez.

## Verilerin paylaşımı

Uzantı verilerinizi **yalnızca sizin yapılandırdığınız yapay zeka sağlayıcısıyla**
paylaşır. Uzantı geliştiricisi olarak biz verilerinize erişemeyiz; hiçbir veri
bize gönderilmez, tarafımızca toplanmaz veya satılmaz. Reklam ağları veya üçüncü
taraf analiz servisleri kullanılmaz.

## Kullanılan izinler ve gerekçeleri

- **debugger:** Tarayıcı sekmesini gerçek mouse/klavye girişiyle kontrol etmek
  (Chrome DevTools Protocol) için. Yalnızca siz bir görev başlattığınızda,
  yalnızca aktif sekmede kullanılır.
- **tabs, activeTab:** Görevi yürütmek için sayfayı okumak, etkileşim kurmak ve
  sekmeler arası geçmek.
- **storage:** API anahtarınızı, ayarlarınızı ve sohbet geçmişinizi yerel olarak
  saklamak.
- **sidePanel:** Uzantı arayüzünü yan panelde göstermek.
- **host_permissions (`<all_urls>`):** Görevi hangi sitede verirseniz orada
  çalışabilmek. Uzantı yalnızca siz bir görev başlattığınızda etkin olur.

## Çocukların gizliliği

Uzantı 13 yaş altı çocuklara yönelik değildir ve bilerek onlardan veri toplamaz.

## Değişiklikler

Bu politikada değişiklik yaparsak, güncellenmiş sürümü bu sayfada yayımlarız.

## İletişim

Sorularınız için: info.muhammedkizilkaya@gmail.com
