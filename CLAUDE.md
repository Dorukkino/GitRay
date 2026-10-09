# GitRay: Claude Code proje talimatları

Proje adı GitRay (GitHub: Dorukkino/GitRay). Bu dosya projenin kurallarının ve mimarisinin tek doğru kaynağıdır; bir karar değişirse önce burası güncellenir.
Ne yapıldığı, ne kaldığı ve oturum günlüğü `PROGRESS.md` dosyasındadır. **Her oturuma bu iki dosyayı okuyarak başla; iş bitince `PROGRESS.md`'yi güncelle.** Sitedeki `/progress` sayfası `PROGRESS.md`'yi gösterir.

@AGENTS.md

## Proje
GitHub repolarını klonlamadan ve hiçbir kodu çalıştırmadan tarayıp zararlı yazılım hilelerini arayan, VirusTotal / scanrepo.dev benzeri bir web sitesi.
Hedef kitle: bir repoyu klonlamadan, kurmadan ya da IDE'de açmadan önce "bu güvenli mi?" diye soran geliştiriciler.
Portföy projesi, ticari değil. Hedef: çalışan bir MVP, temiz mimari, açıklanabilir sonuçlar, iyi test kapsamı ve güçlü bir README.

## Değişmez güvenlik kuralları
1. Taranan repodaki hiçbir kod çalıştırılmaz: install, build, script, alt süreç, `eval`, `new Function`, `vm` yok. Yalnızca okuma. `tests/security.test.ts` kendi kodumuzda `child_process`, `vm`, `worker_threads` ve `new Function` kullanımını yasaklar.
2. Arşiv diske açılmaz. Tarball bellekte, akış (stream) halinde ve limitlerle okunur (`src/engine/limits.ts`): repo boyutu, indirilen byte, dosya/girdi sayısı, dosya başına byte, toplam açılmış byte ve süre bütçesi. gzip açma kendi sayacımızdan geçer (gzip bombası). Symlink, hardlink ve özel dosyalar okunmaz. Motor `fs` import etmez.
3. Release dosyaları indirilmez. GitHub API'nin verdiği `digest` (sha256) gösterilir ve VirusTotal'de aranabilir; özet yoksa "kontrol edilemedi" yazar.
4. Taranan repodan gelen her içerik güvenilmezdir (dosya adı, README, kod parçası, açıklama, dal ve release adları): `src/engine/report.ts` hepsini sanitize eder (görünmez/kontrol/yön karakterleri `[U+202E]` olarak görünür hale gelir, URL'ler `hxxps://evil[.]com` biçiminde etkisizleştirilir, uzunluk sınırlanır). Arayüz yalnızca bu raporu kullanır, React kaçışına güvenir; `dangerouslySetInnerHTML` ve `innerHTML` yasaktır. Repo içeriğinden gelen URL'ler asla tıklanabilir yapılmaz. Tıklanabilir olan tek bağlantılar bizim doğrulanmış parçalardan kurduklarımızdır: `github.com/<owner>/<repo>/blob/<sha>/<yol>#L<satır>` (yol segmentleri encode edilir) ve `virustotal.com/gui/file/<sha256>` (yalnızca 64 hex karakter).
5. Repoda ve testlerde gerçek zararlı yazılım bulunmaz. Yalnızca kuralı tetikleyen ama kendisi zararsız sahte örnekler (fixture) kullanılır: `.invalid` alan adları, sahte tokenlar, yalnızca mesaj yazdıran base64 içerikler, program olmayan dosya başlıkları.
6. Görünmez ve yön karakterleri (U+200B–U+200F, U+202A–U+202E, U+2066–U+2069, U+2028, U+2029, varyasyon seçiciler) kodda, testlerde ve fixture'larda asla gerçek karakter ya da `\u` kaçış dizisi olarak yazılmaz. Kodda `String.fromCodePoint(0x202e)`, fixture'larda `{U+202E}` / `{U+FE01*40}` gösterimi kullanılır. Sebep: araç çağrıları JSON olarak gidiyor ve JSON `\uXXXX` dizilerini gerçek karaktere çeviriyor; bu, eski kod tabanına iki kez görünmez karakter soktu. `tests/security.test.ts` bunu denetler.

## Maliyet kısıtı
Her şey ücretsiz olmalı; yalnızca domain (ve ileride gerekirse VPS) ücretli olabilir.
Şu anki ücretsiz bileşenler: Vercel Hobby planı (ticari olmayan kullanım), GitHub API (kişisel token, yalnızca public okuma), Neon Postgres ücretsiz planı (Vercel'in Storage sekmesinden eklenir, 0,5 GB), OSV API (osv.dev, anahtarsız; kullanıcı 9 Ekim 2026'da onayladı), npm paketleri.
Ücretli bir API, SaaS veya kütüphane ekleme. Yeni bir dış servis (KV, VirusTotal API, OSV vb.) eklemeden önce kullanıcıya sor.

## Mimari
Tek Next.js 16 uygulaması (App Router, TypeScript, Tailwind CSS 4), Node.js 22 (`engines: 22.x`). Vercel'e doğrudan deploy edilir; yerelde `npm run dev`.
Next.js 16 eğitim verisindeki sürümden farklı: kod yazmadan önce `node_modules/next/dist/docs/` içindeki ilgili belgeyi oku (`AGENTS.md`). `params` bir Promise'tir; `PageProps`/`LayoutProps` tipleri `next typegen` ile üretilir.

- `src/engine/`: Tarama motoru. Saf TypeScript; yalnızca motor içi dosyaları ve `node:stream`, `node:zlib` modüllerini import edebilir (Next.js, React, `fs` yasak). Web API'si ve CLI aynı motoru kullanır. `tests/architecture.test.ts` bunu zorlar.
  - `types.ts` veri tipleri, `limits.ts` tüm güvenlik limitleri, `errors.ts` hata türleri, `target.ts` girdi doğrulama (`owner/repo`, `github.com/...`, tam URL, `/tree/...` linkleri)
  - `text.ts` güvenilmez metin yardımcıları: satır bölme, uzun satır pencereleri, entropi, `defang`, `sanitize`, `snippet`, `revealHidden`, belge/kaynak kodu tespiti, UTF-16 BOM çözme
  - `github.ts` GitHub API istemcisi (metadata, son commit SHA, sahip hesap yaşı, release digest'leri, tarball akışı)
  - `archive.ts` bellekte, akışla ve limitli tar okuyucu (kendi tar ayrıştırıcımız; pax ve GNU uzun ad başlıkları, checksum kontrolü). `.zip` dosyaları 20 MB'a kadar bütün olarak okunur; arşivdeki her yolu (link ve klasörler dahil) `seen` kümesine yazar.
  - `deps.ts` bağımlılık dosyalarını okur (`package.json`, `package-lock.json`/`npm-shrinkwrap.json`, `yarn.lock`, `pnpm-lock.yaml`, `requirements*.txt`, `pyproject.toml`, `poetry.lock`, `uv.lock`, `Pipfile.lock`); `node_modules/` ve ZIP içindekiler okunmaz. `osv.ts` OSV istemcisi. Kilit dosyaları da ZIP'ler gibi 20 MB'a kadar bütün okunur (büyük projelerde 1 MB'ı aşarlar; yarım bir kilit dosyası ayrıştırılamaz). Daha büyükse `package.json`'daki aralıklara düşülür.
  - `zip.ts` repodaki ZIP'lerin içini bellekte açar (merkezi dizin okunur; yalnızca stored/deflate, şifreli üyeler, symlink'ler ve ZIP64 atlanır). Üye yolu `arşiv.zip!/iç/yol` biçimindedir. Limitler: ZIP başına 2.000 üye, tarama başına toplam 50 MB açılmış veri (zip bombası), ZIP içinde ZIP en fazla 2 seviye. ZIP üyelerinde yalnızca içerik kuralları (`code`, `obfuscation`, `binary`) çalışır (`ARCHIVE_MEMBER_CATEGORIES`): arşivin içindeki bir README ziyaretçiye gösterilmez, içindeki `package.json` klonlayınca çalışmaz.
  - `rules/` kurallar: `base.ts` (Rule arayüzü, `regexRule`, yol eşleme), kategori başına bir modül (`autorun`, `code`, `obfuscation`, `links`, `binary`, `repo`), `index.ts` kayıt
  - `scoring.ts` puan, `scanner.ts` orkestrasyon, `report.ts` güvenli JSON rapor (arayüzün kullandığı tek biçim)
- `src/lib/scan-service.ts`: API ile motor arasındaki katman: girdi doğrulama, iki seviyeli önbellek (örnek belleği 60 sn, veritabanı 1 saat; bellekteki kayıt veritabanındaki ömrünü asla aşmaz), istemci başına hız sınırı (dakikada 6 yeni tarama, 60 veritabanı sorgusu; IPv6 adresleri /64 olarak gruplanır), aynı anda en fazla 4 tarama, hata kodu eşleme. `fresh=1` ("Scan again now") önbellekleri atlar ama son tarama 1 dakikadan yeniyse onu döndürür (aynı repoyu tekrar tekrar taratıp GitHub kotasını tüketmeyi engeller). Süre bütçesi yüzünden yarım kalan taramalar önbelleğe ve veritabanına yazılmaz. Veritabanı hatası taramayı asla bozmaz, yalnızca loglanır.
- `src/lib/log.ts`: Sunucu loglarına yazmadan önce bağlantı dizelerini ve GitHub tokenlarını gizler (Neon sürücüsü bazı hatalarda bağlantı dizesini, şifresiyle birlikte mesaja koyuyor). Sunucu tarafında `console.error` yerine `logError` kullan.
- `src/lib/db.ts` + `src/lib/scan-store.ts`: Kalıcı depolama. Her reponun **son** taraması `scans` tablosunda tutulur (anahtar: küçük harfli `owner/repo`; yeniden tarama kaydın üzerine yazar). Saklanan şey yalnızca sanitize edilmiş rapordur, repo dosyaları asla saklanmaz. Tablo ilk kullanımda `CREATE TABLE IF NOT EXISTS` ile oluşur, ayrı bir kurulum adımı yoktur. Bağlantı: `DATABASE_URL` (ya da `POSTGRES_URL`); yoksa `nullScanStore` devreye girer, site depolamasız çalışır ve listeler boş görünür. Üretimde Neon'un HTTP sürücüsü (sorgu başına 5 sn zaman aşımı), testlerde PGlite (WebAssembly ile gerçek Postgres) aynı `Db` arayüzüyle kullanılır. Kurallar: eski bir tarama yenisinin üzerine yazamaz (`WHERE scans.scanned_at <= EXCLUDED.scanned_at`); tablo oluşturma yarışında kaybetmek (23505/42P07) hata sayılmaz; tablo en fazla 5.000 satır tutar, en eski kayıtlar ara sıra silinir. Veritabanına giden her metin `sanitize`'dan geçtiği için iyi biçimlidir (yarım emoji Postgres'in JSON'unu bozar; `truncate` bu yüzden vekil çiftleri bölmez).
- `src/app/`: Sayfalar: `/` (arama), `/scan/[owner]/[repo]` (tarama + rapor + "Scan again now"), `/safe-zone` (son taraması Temiz çıkan son 50 repo), `/scammer` (son taraması Tehlikeli çıkan son 50 repo; Şüpheli ve Eksik hiçbir listeye girmez), `/rules` (kural listesi motordan üretilir), `/progress` (`PROGRESS.md`). Liste sayfaları ISR ile en fazla 60 saniyede bir yenilenir. API: `GET /api/scan?repo=owner/name[&fresh=1]` → JSON rapor. API yanıtları CDN'de önbelleğe alınmaz (`no-store`): yeniden taramadan sonra herkes yeni sonucu görmeli.
- Scammer listesi otomatik bir sezgisel sonuçtur, bir kişinin kararı değildir: sayfada bu açıkça yazar ve yanlış alarm bildirme linki vardır. Bu uyarılar kaldırılmamalı.
- `src/components/`: `ScanForm`, `ScanClient` (yükleme/hata/sonuç/yeniden tarama), `ReportView` (rapor ekranı), `RepoList` (Safe Zone / Scammer listeleri), `verdict.tsx` (renkler, rozet, puan halkası).
- `src/cli.ts`: CLI (`npm run scan -- owner/repo [--json]`). Çıkış kodları: 0 Temiz, 1 Şüpheli, 2 Tehlikeli, 3 her türlü hata, 4 Eksik.
- `tests/`: Ağ kullanmayan Vitest testleri. Kural örnekleri `tests/fixtures/rules/<KURAL>/{positive,negative}/*.fixture`; her kural için ikisi de zorunlu. Biçim `tests/rules.test.ts` başında anlatılır (`text`, ikili dosyalar için `hex`, repo metadata kuralları için `repo`).

## Tarama akışı
1. Repo bilgisini al (GitHub API): kanonik ad (yeniden adlandırılmış repolarda yönlendirme yalnızca `api.github.com` içinde ve en fazla 3 kez izlenir), boyut, oluşturulma tarihi, varsayılan dal, son commit SHA, sahip hesap yaşı, son 10 release'in dosyaları ve `digest` değerleri. Token yalnızca `api.github.com`'a gönderilir, `codeload.github.com`'a gönderilmez, hiçbir yerde loglanmaz.
2. Tarball'ı commit SHA'sı ile akış halinde indir ve bellekte limitlerle oku; içindeki ZIP'leri de aç. Süre bütçesi (45 sn) metadata isteklerini de kapsar.
2b. **Arşiv bütünlüğü kontrolü.** GitHub tarball'ı `git archive` ile üretir ve `.gitattributes` içindeki `export-ignore` dosyalarını dışarıda bırakır; `git clone` ise onları getirir. Bu, payload'ı tarayıcılardan saklamanın bir yoludur. Tarama tam bittiyse commit'in dosya listesi Git Trees API ile alınır (1 istek), arşivde olmayan dosyalar `raw.githubusercontent.com`'dan (API kotası harcamaz, token gönderilmez) ayrıca indirilip taranır (en fazla 300 dosya ve 20 MB; önce çalıştırılabilir/kod dosyaları). İndirilemeyen saklı dosya varsa tarama Eksik sayılır (`maxHiddenFiles`). Liste alınamazsa ya da GitHub listeyi kısaltırsa (`truncated`) kontrol "unavailable" olur ama tarama bozulmaz. Saklı dosya bulunursa `GR-REPO-003` (+5) eklenir. Sonuç raporda `archiveCheck` olarak yer alır. Bir tarama artık yaklaşık 6 API isteği kullanır. Metin dosyaları (UTF-8, BOM'lu UTF-16) metin kurallarına, ikili dosyalar (ilk 8 KB'ta NUL) yalnızca başlık baytlarına bakan ikili kurallarına gider.
2c. **Bağımlılık kontrolü** (`GR-DEP-001`, +70, tek başına Tehlikeli). Tarama sırasında bağımlılık dosyaları toplanır, sonra OSV'ye toplu sorgu atılır (`/v1/querybatch`, 1000'lik parçalar, en fazla 5.000 sorgu). Yalnızca `MAL-` ile başlayan kayıtlar (OpenSSF malicious-packages) dikkate alınır: GitRay zararlı yazılım arar, sıradan güvenlik açığı (CVE) aramaz. Kilit dosyasındaki tam sürüm doğrudan sorgulanır. Yalnızca aralıkla bildirilen paket (`^1.2.0`) için kayıt **her sürümü** kapsıyorsa (typosquat) bulgu üretilir; yalnızca bazı sürümleri ele geçirilmiş popüler paketler (chalk/debug saldırısı gibi) kurulacak sürüm bilinmediği için işaretlenmez, yoksa her repo yanlış alarm verir. Bunu ayırt etmek için tarama başına en fazla 20 kayıt detayı çekilir (`/v1/vulns/{id}`, örnek başına önbellekli). OSV'ye ulaşılamazsa kontrol "unavailable" olur, tarama asla bozulmaz. Sonuç raporda `dependencyCheck` olarak yer alır.
3. Kuralları çalıştır (34 kural, ayrıntılar `/rules` sayfasında ve `src/engine/rules/`):
   - Otomatik çalışanlar (`GR-AUTO-*`): `package.json` yaşam döngüsü scriptleri, `setup.py`, `.vscode/tasks.json` `folderOpen`, Visual Studio build olayları, Rust `build.rs`, dev container `initializeCommand` (`GR-AUTO-006`), repodaki bir programı gösteren VS Code ayarları (`GR-AUTO-007`), yapay zekâ asistanı hook'ları ve MCP sunucuları (`GR-AUTO-008`), kod enjekte eden `.npmrc` (`GR-AUTO-009`), uzaktan kod çeken `.envrc` (`GR-AUTO-010`)
   - Zararlı bağımlılıklar (`GR-DEP-001`): yukarıdaki 2c
   - Kod kalıpları (`GR-CODE-*`): çözüp çalıştırma, `curl | sh`, tarayıcı şifre/çerez dosyaları, SSH anahtarları, kripto cüzdanları, Discord/Telegram'a veri gönderme, Windows LOLBin'leri ve Defender istisnası, dosya içeriğini çalıştırma
   - Gizleme (`GR-OBF-*`): yüksek entropili metin, Trojan Source yön karakterleri, boşlukla ekran dışına itilmiş kod, görünmez Unicode payload'ları
   - Linkler ve sosyal mühendislik (`GR-LINK-*`, `GR-SOC-001`): repo dışı exe/arşiv linkleri, dosya paylaşım siteleri, link kısaltıcılar, arşiv şifresi, "antivirüsü kapat" talimatı
   - İkili dosyalar (`GR-BIN-*`): PE/ELF/Mach-O, `.lnk`, içinde Windows programı ya da disk imajı olan (açılamamış) ZIP, şifreli ZIP/RAR
   - Repo sinyalleri (`GR-REPO-*`): yeni hesap, yeni repo, indirme arşivinden saklanmış dosyalar (toplamı 30'un altında kalmalı: tek başına asla Şüpheli yapmaz)
   - CI (`GR-CI-001`): workflow'da `curl | sh` (repoyu klonlayanın bilgisayarında değil CI'da çalıştığı için düşük ağırlık; bu yüzden `GR-CODE-002` workflow dosyalarını hariç tutar)
4. Puanla: her kural puana bir kez, en yüksek ağırlıklı bulgusuyla katılır; toplam en fazla 100. Karar:
   - **Temiz** (<30), **Şüpheli** (30–69), **Tehlikeli** (≥70).
   - **Eksik**: Bir limit taramayı durdurdu ve okunabilen kısım temiz çıktı. İndirmeden önce yakalanan limitler (repo boyutu, Content-Length, süre) de buna dahildir; repo bilgisi ve `partial` bloğu raporda yer alır. Limit aşımı hiçbir zaman hata olarak bitmez. Eksik yalnızca Temiz'in yerine geçer; okunan kısım Şüpheli ya da Tehlikeli ise o karar kalır ve rapor "kısmi tarama" olarak işaretlenir. Kısmi tarama asla Temiz sayılmaz, çünkü saldırgan payload'ı büyük dosyaların arkasına saklayabilir.
5. Raporu sanitize edip JSON olarak döndür; arayüz gösterir.

## Kural yazma kuralları
- Kimlik biçimi `GR-<KATEGORİ>-NNN`; ağırlık 1–100; `why` sade bir dille "neden tehlikeli" açıklaması.
- Belgelerde düşük ağırlık (`docWeight`) yalnızca `GR-CODE-*` kurallarında kullanılır. Belge dosyası yalnızca türüne göre belirlenir (`*.md`, `*.rst`, `*.adoc`, README/LICENSE/CHANGELOG gibi bilinen `.txt` adları); klasör (`docs/`) etkisizdir.
- Satır numaraları yalnızca `\n` ve `\r\n` ile sayılır (`text.splitLines`); `\v`, `\f` ya da satır ayırıcı (U+2028) gibi başka ayırıcılar kullanılmaz (`String.prototype.split` ile yalnızca `"\n"`).
- Regex'ler `g`/`y` bayrağı olmadan yazılır (`regexRule` bunu kontrol eder); iç içe niceleyici kullanma (ReDoS), aralıkları sınırla (`.{0,200}?`). Uzun satırlar 10.000 karakterlik örtüşen pencerelerle taranır.
- URL'nin GitHub'da barınması hiçbir kuralda güven sinyali değildir. Yalnızca taranan reponun kendi `releases/download/` linkleri ve varsayılan dala ya da taranan SHA'ya işaret eden kendi `archive/` linkleri muaftır; yol kaçışı içeren (`..`, `%2e`, `%2f`, `%5c`, `\`) linkler muaf değildir.
- Her yeni kural için en az bir pozitif ve bir negatif fixture yaz; `tests/rules.test.ts` kayıtlı her kural için ikisini de ister.

## Çalışma şekli
- Kullanıcıyla Türkçe konuş. Kod, değişken adları, yorumlar, commit mesajları ve sitenin arayüz metinleri İngilizce. `CLAUDE.md` ve `PROGRESS.md` Türkçe.
- Büyük mimari kararlardan, yeni dış servislerden ve bu dosyadaki kararlarla çelişen değişikliklerden önce kullanıcıya sor. Küçük işlerde ilerle ve sonucu `PROGRESS.md`'ye yaz.
- Doğrulayamadığın varsayımları açıkça yaz; tahminle ilerleme.
- Commit atmadan önce: `npm run lint`, `npm run typecheck`, `npm test` ve arayüz değiştiyse `npm run build`.

## Komutlar
- Kurulum: `npm install`
- Geliştirme sunucusu: `npm run dev` → http://localhost:3000
- Testler: `npm test` (kapsam: `npm run coverage`)
- Lint / tip kontrolü: `npm run lint`, `npm run typecheck`; hepsi birden: `npm run check`
- Production build: `npm run build` ve `npm start`
- CLI tarama: `npm run scan -- github.com/owner/repo` (`--json` ile JSON)
- Ortam değişkenleri (`.env.example`): `GITHUB_TOKEN` (fine-grained, yalnızca "Public repositories" okuma, ek izin yok; tokensız saatte 60 GitHub isteği, tokenla 5.000; yeni bir tarama 5 istek kullanır, veritabanından gelen tarama 0) ve `DATABASE_URL` (Neon; Vercel'de Storage sekmesinden bağlanınca otomatik eklenir). Yerelde `.env.local` dosyasına yazılır, asla commit edilmez.

## Bu bulut ortamına özel notlar (Claude Code on the web)
- Node'un `fetch`'i proxy ortam değişkenini kendiliğinden okumaz: ağa çıkan komutları `NODE_USE_ENV_PROXY=1` ile çalıştır (örn. `NODE_USE_ENV_PROXY=1 npm run build`, `GITHUB_TOKEN= NODE_USE_ENV_PROXY=1 npm run scan -- Dorukkino/GitRay`).
- Konteynerdeki `GITHUB_TOKEN` proxy'ye özeldir; kendi isteklerimize eklenince 401 döner. Bu ortamda `GITHUB_TOKEN=` (boş) ile çalıştır.
- Proxy GitHub API'sinde yalnızca oturuma bağlı repoya (Dorukkino/GitRay) izin verir; `/users/...` ve başka repolar 403 döner. Başka repoların gerçek taraması yerelde ya da Vercel'de denenmeli. Public repolar `git clone` ile okunabilir (kodu çalıştırmadan, yalnızca dosya okuyarak tarandı).
- `api.osv.dev` bu ortamın ağ politikasında kapalı; OSV kontrolü burada "unavailable" döner. Gerçek doğrulama Vercel'de yapılır (ya da ortam ayarlarında Allowed domains'e eklenir).

## Açık kararlar
- Kalıcı depolama: **karar verildi (9 Ekim 2026)**, kullanıcı Safe Zone ve Scammer listelerini istedi; Neon Postgres (ücretsiz, Vercel entegrasyonu) seçildi.
- OSV: **onaylandı (9 Ekim 2026)**. VirusTotal hâlâ açık karar (API anahtarı gerektirir).
- VirusTotal API (günde 500 / dakikada 4 hash sorgusu) ve OSV entegrasyonu: ücretsiz ama dış servis, kullanıcıya sorulacak. Şu an yalnızca VirusTotal arama linki veriliyor.
- Arayüz dili şimdilik İngilizce (portföy, uluslararası kitle); Türkçe seçeneği istenirse eklenebilir.
