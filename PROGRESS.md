# GitRay ilerleme günlüğü

Son güncelleme: **9 Ekim 2026**. Kurallar ve mimari için `CLAUDE.md`, ne yapıldığı ve ne kaldığı için bu dosya. Sitedeki `/progress` sayfası bu dosyayı gösterir.

## Şu anki durum

**Çalışan bir MVP var.** Bir GitHub reposunun adresi yazılıyor, site repoyu klonlamadan ve hiçbir kodu çalıştırmadan tarıyor, 0–100 arası bir risk puanı ve dört karardan birini (Temiz, Şüpheli, Tehlikeli, Eksik) veriyor. Her bulgu dosya, satır, ilgili kod parçası ve "neden tehlikeli" açıklamasıyla gösteriliyor.

| Parça | Durum |
| --- | --- |
| Tarama motoru (TypeScript, bellekte ve limitli) | Hazır |
| 27 kural, 8 kategori | Hazır |
| Web sitesi: arama, sonuç, demo, kurallar, ilerleme | Hazır |
| JSON API: `GET /api/scan?repo=owner/name` | Hazır |
| CLI: `npm run scan -- owner/repo` | Hazır |
| Testler | 13 dosya, 477 test, motor satır kapsamı yaklaşık %96 |
| Vercel'e deploy | Kod hazır; deploy'u kullanıcı yapacak (aşağıdaki adımlar) |
| Kalıcı depolama, VirusTotal API, OSV | Yok (dış servis: önce kullanıcıya sorulacak) |

## Yol haritası

- [x] **Aşama 0: Sıfırdan başlangıç.** Eski Python kodu silindi, Next.js + TypeScript iskeleti kuruldu.
- [x] **Aşama 1: MVP.** Motor, 27 kural, web arayüzü, API, CLI, demo rapor, testler, `CLAUDE.md` ve `PROGRESS.md`.
- [ ] **Aşama 2: Yayına alma.** Vercel'e deploy (kullanıcı), `GITHUB_TOKEN` ortam değişkeni, gerçek repolarda deneme ve kalibrasyon (aşağıdaki listeyle).
- [ ] **Aşama 3: Daha derin analiz.** Bağımlılıklar için OSV, release digest'leri için VirusTotal API (kotaya dikkat), commit geçmişi sinyalleri (repo'dan eski commit tarihleri), typosquatting (popüler paket adlarına benzeyen bağımlılıklar), `setup.py` için `ast` tabanlı veri akışı analizinin geri getirilmesi.
- [ ] **Aşama 4: Kalıcılık ve paylaşım.** Tarama geçmişi ve paylaşılabilir sonuç linkleri için ücretsiz bir veritabanı (karar bekliyor), ortak önbellek, kalıcı hız sınırı, kötüye kullanıma karşı Cloudflare Turnstile.
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

## Sıradaki adımlar (öncelik sırasıyla)

1. **Vercel'e deploy** (kullanıcı, yaklaşık 5 dakika):
   1. https://vercel.com adresine GitHub hesabıyla giriş yap (Hobby planı ücretsiz, ticari olmayan kullanım içindir).
   2. "Add New → Project" ile `Dorukkino/GitRay` reposunu içe aktar. Framework otomatik olarak Next.js seçilir; diğer ayarlar varsayılan kalabilir.
   3. "Environment Variables" kısmına `GITHUB_TOKEN` ekle: GitHub → Settings → Developer settings → Fine-grained tokens → yeni token, "Public repositories (read-only)", ek izin gerekmez. Tokensız da çalışır ama saatte yalnızca 60 GitHub isteği (12 tarama) yapılabilir.
   4. Deploy. Bu çalışma `claude/sleepy-cray-iz5dsv` dalında; Vercel bu dal için bir "preview" adresi üretir. Kalıcı adres için dal `main`'e birleştirilmeli.
2. **Gerçek repolarda kalibrasyon.** En az şu repolar taranıp sonuçlar bu dosyaya yazılmalı: `octocat/Hello-World` (Temiz beklenir), `nvm-sh/nvm` (README'deki `curl | bash` belgede olduğu için puan almamalı), `pallets/flask`, `microsoft/vscode`, `pypa/pip`, `NVIDIA/apex` (`setup.py` alt süreç çalıştırıyor: 10 puan, Temiz beklenir). Yanlış alarm veren kurallar ayarlanmalı.
3. **Güvenlik araçlarının kendi test dosyaları.** GitRay gibi tarayıcıların fixture'ları kaçınılmaz olarak Tehlikeli çıkıyor. Seçenekler: `tests/fixtures/` gibi yollar için bilgi notu (puanı düşürmeden), ya da kullanıcıya "bu bulgular test dosyalarında" diye gruplama. Klasöre göre puan düşürmek saldırganın payload'ı `tests/` içine saklamasına izin verir; bu yüzden puan düşürülmemeli.
4. **Kalıcılık kararı** (kullanıcıya sorulacak): Neon/Supabase ücretsiz PostgreSQL ile tarama geçmişi ve paylaşılabilir sonuç linkleri, ya da depolamasız devam.
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
- Hız sınırı ve önbellek sunucu örneği başınadır (Vercel'de örnekler değişebilir); kalıcı çözüm Aşama 4'te.
- Proxy kısıtı yüzünden bu ortamda sahip hesap yaşı (`/users/...`) okunamıyor; raporda "unknown" görünüyor. Vercel'de çalışır.
