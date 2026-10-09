# GitRay ilerleme günlüğü

Son güncelleme: **9 Ekim 2026**. Kurallar ve mimari için `CLAUDE.md`, ne yapıldığı ve ne kaldığı için bu dosya. Sitedeki `/progress` sayfası bu dosyayı gösterir.

## Şu anki durum

**Çalışan bir MVP var.** Bir GitHub reposunun adresi yazılıyor, site repoyu klonlamadan ve hiçbir kodu çalıştırmadan tarıyor, 0–100 arası bir risk puanı ve dört karardan birini (Temiz, Şüpheli, Tehlikeli, Eksik) veriyor. Her bulgu dosya, satır, ilgili kod parçası ve "neden tehlikeli" açıklamasıyla gösteriliyor. Taramalar veritabanına kaydediliyor: Temiz çıkanlar **Safe Zone**, Tehlikeli çıkanlar **Scammer** sayfasında listeleniyor.

| Parça | Durum |
| --- | --- |
| Tarama motoru (TypeScript, bellekte ve limitli) | Hazır |
| 28 kural, 8 kategori | Hazır |
| ZIP içeriğini tarama, `export-ignore` ile saklanan dosyaları yakalama | Hazır (5. oturum) |
| Web sitesi: arama, sonuç, Safe Zone, Scammer, kurallar, ilerleme | Hazır |
| JSON API: `GET /api/scan?repo=owner/name` | Hazır |
| CLI: `npm run scan -- owner/repo` | Hazır |
| Safe Zone ve Scammer sayfaları, kalıcı depolama (Neon Postgres) | Kod hazır; veritabanını kullanıcı Vercel'den bağlayacak |
| Testler | 16 dosya, 540 test |
| Vercel'e deploy | Kod `main`'de; token ve veritabanını kullanıcı ekleyecek (adımlar aşağıda) |
| VirusTotal API, OSV | Yok (dış servis: önce kullanıcıya sorulacak) |

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
- [ ] **Aşama 2: Yayına alma.** Dalın `main`'e birleştirilmesi, Vercel'e deploy, `GITHUB_TOKEN`, Neon veritabanı, gerçek repolarda deneme ve kalibrasyon (aşağıdaki listeyle).
- [ ] **Aşama 3: Daha derin analiz.** Bağımlılıklar için OSV, release digest'leri için VirusTotal API (kotaya dikkat), commit geçmişi sinyalleri (repo'dan eski commit tarihleri), typosquatting (popüler paket adlarına benzeyen bağımlılıklar), `setup.py` için `ast` tabanlı veri akışı analizinin geri getirilmesi.
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

## Sıradaki adımlar (öncelik sırasıyla)

1. **Gerçek repolarda kalibrasyon** (devam ediyor; kullanıcının üç reposu tamamlandı).
2. **Yapay zekâ araçlarının otomatik çalışan ayarları** (`.claude/settings.json` hooks, Cursor kuralları vb.) için yeni bir otomatik çalışma kuralı.
3. **Alt modüller** (`.gitmodules`): tarball başka repolardaki alt modülleri içermez, `git clone --recursive` ise getirir. En azından raporda gösterilmeli.
4. **Diğer arşiv biçimleri** (`.rar`, `.7z`, `.tar.gz`, `.jar`) şu an açılmıyor. En az şu repolar taranıp sonuçlar bu dosyaya yazılmalı: `octocat/Hello-World` (Temiz beklenir), `nvm-sh/nvm` (README'deki `curl | bash` belgede olduğu için puan almamalı), `pallets/flask`, `microsoft/vscode`, `pypa/pip`, `NVIDIA/apex` (`setup.py` alt süreç çalıştırıyor: 10 puan, Temiz beklenir). Yanlış alarm veren kurallar ayarlanmalı.
3. **Liste kalitesi.** Scammer listesi herkese açık olduğu için yanlış alarmlar orada daha görünür olur. Kalibrasyondan sonra gerekirse listeye girme eşiği yükseltilebilir ya da çok yıldızlı / eski repolar için ek kontrol eklenebilir.
4. **Güvenlik araçlarının kendi test dosyaları.** GitRay gibi tarayıcıların fixture'ları kaçınılmaz olarak Tehlikeli çıkıyor. Seçenekler: `tests/fixtures/` gibi yollar için bilgi notu (puanı düşürmeden), ya da kullanıcıya "bu bulgular test dosyalarında" diye gruplama. Klasöre göre puan düşürmek saldırganın payload'ı `tests/` içine saklamasına izin verir; bu yüzden puan düşürülmemeli.
5. **VirusTotal ve OSV** (kullanıcıya sorulacak): release digest'lerini VirusTotal API ile otomatik sorgulama (günde 500 istek; kota dolarsa "atlandı"), `package.json` / `requirements.txt` bağımlılıklarını OSV ile kontrol.

## Bilinen sınırlamalar ve kalibrasyon notları

- Statik ve kalıp tabanlı: bilinmeyen ya da iyi gizlenmiş zararlı kod kaçabilir. Temiz sonuç garanti değildir; arayüz bunu her yerde söylüyor.
- `GR-AUTO-002` (`setup.py`) şu an satır ve dosya düzeyinde regex kullanıyor. Eski Python sürümündeki `ast` tabanlı veri akışı analizi (`replace`, `swapcase`, `chr`, ters çevirme ile gizlenmiş komutları yakalıyordu) taşınmadı. Gizlenmiş bir indirme komutu şu an 10 puan alabilir. Gerekirse Aşama 3'te TypeScript'e uyarlanabilir (eski kod: `git show a59f432:src/gitray/engine/pyflow.py`).
- `GR-AUTO-002`: `exec(open('pkg/version.py').read())` ile sürüm okuyan meşru `setup.py` dosyaları `GR-CODE-008` altında 10 puan alır (tek başına Temiz).
- `GR-AUTO-005`: Önceden derlenmiş kütüphane indiren meşru `-sys` crate'leri (`build.rs` içinde ağ kullanımı) 35 puanla Şüpheli çıkabilir. Kalibrasyonda kontrol edilmeli.
- `GR-OBF-001`: Test vektörleri, gömülü anahtarlar ve sertifikalar yanlış alarm verebilir; ağırlığı bu yüzden düşük (15).
- `GR-LINK-001`: Kendi web sitesinden `.exe`/`.dmg` dağıtan meşru projeler 20 puan alır (tek başına Temiz).
- Şifreli RAR yalnızca başlıkları da şifreliyse (`rar -hp`) tespit edilir; 7z şifrelemesi tespit edilmiyor.
- İkili dosyalarda yalnızca ilk 1 MB okunur; ZIP içindeki dosya adları yalnızca bu kısımdaki yerel başlıklardan okunur.
- Hız sınırı sunucu örneği başınadır (Vercel'de örnekler değişebilir); kalıcı çözüm Aşama 4'te. Önbellek artık veritabanında da var (1 saat).
- Listeler yalnızca son 50 kaydı gösterir; sayfalama ve arama yok.
- Proxy kısıtı yüzünden bu ortamda sahip hesap yaşı (`/users/...`) okunamıyor; raporda "unknown" görünüyor. Vercel'de çalışır.
