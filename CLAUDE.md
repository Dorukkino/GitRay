# GitRay: Claude Code proje talimatları

Proje adı GitRay (GitHub: Dorukkino/GitRay), Python paket adı `gitray`. Bu dosya projenin tek doğru kaynağıdır; bir karar değişirse önce burası güncellenir.

## Proje
GitHub repolarını klonlamadan ve hiçbir kodu çalıştırmadan tarayıp zararlı kalıpları arayan, VirusTotal benzeri bir web sitesi.
Portföy projesi, ticari değil. Hedef: temiz mimari, açıklanabilir sonuçlar, iyi test kapsamı ve güçlü bir README.

## Değişmez güvenlik kuralları
1. Taranan repodaki hiçbir kod çalıştırılmaz: install, build, script, subprocess veya eval yok. Sadece okuma.
2. Arşiv diske açılmaz. Tarball bellekte, akış (stream) halinde ve limitlerle okunur: maksimum repo boyutu, maksimum dosya sayısı, dosya başına maksimum byte, toplam açılmış byte. Symlink, hardlink ve özel dosyalar atlanır.
3. Release dosyaları indirilmez. GitHub API'nin verdiği `digest` (sha256) değeri kullanılır; özet yoksa sonuç "kontrol edilemedi" olur.
4. Taranan repodan gelen her içerik güvenilmezdir (dosya adı, README, kod parçası, link): HTML olarak işlenmez, şablonlarda autoescape açıktır, linkler tıklanamaz ve `hxxp://` biçiminde gösterilir.
5. Repoda ve testlerde gerçek zararlı yazılım bulunmaz. Yalnızca kuralı tetikleyen ama kendisi zararsız sahte örnekler (test fixture'ları) kullanılır.

## Maliyet kısıtı
Yalnızca VPS ve domain ücretli; geri kalan her şey ücretsiz olmalı.
Ücretli bir API, SaaS veya kütüphane ekleme. Yeni bir dış servis eklemeden önce kullanıcıya sor.

## Mimari
Kod `src/` düzeninde, tek Python paketi `gitray` altında:
- `src/gitray/engine/`: Tarama motoru. Saf Python paketi; web, veritabanı veya worker'a bağımlı değil. CLI ve worker aynı motoru kullanır. `gitray.web`, `gitray.worker`, `gitray.cli`, `fastapi`, `jinja2`, `psycopg` ve `sqlalchemy` importları yasak; `tests/test_architecture.py` bunu zorlar.
  - `models.py` veri tipleri, `limits.py` tüm güvenlik limitleri, `target.py` girdi doğrulama, `text.py` güvenilmez metin yardımcıları (defang, sanitize, belge tespiti)
  - `github.py` GitHub API istemcisi (metadata + tarball akışı), `archive.py` bellekte, akışla ve limitli tar okuyucu (gzip açma kendi sayacımızdan geçer)
  - `pyflow.py` setup.py için `ast` tabanlı statik veri akışı (yalnızca ayrıştırır, asla derlemez ya da çalıştırmaz)
  - `rules/` kurallar (`base.py` Rule/RegexRule, kategori başına bir modül), `scoring.py` puan, `scanner.py` orkestrasyon, `report.py` güvenli JSON çıktısı (tüm repo kaynaklı dizgeler sanitize edilir; web arayüzü de bunu kullanacak)
  - Kurallar dosyanın yanında bir `ScanContext` alır (taranan repo). GR-LINK-001 yalnızca taranan reponun kendi `github.com/<owner>/<repo>/releases/download/` linklerini muaf tutar; bu dosyalar digest kontrolüyle kapsanır.
  - Satır numaraları yalnızca `\n` ve `\r\n` ile sayılır (`text.split_lines`); `str.splitlines()` kullanılmaz.
  - GitHub API yönlendirmeleri (taşınmış/yeniden adlandırılmış repo) yalnızca `https://api.github.com` içinde ve en fazla 3 kez izlenir; sonraki istekler kanonik `full_name` ile yapılır.
- `src/gitray/cli.py` + `__main__.py`: CLI (`python -m gitray`). Çıkış kodları: 0 Temiz, 1 Şüpheli, 2 Tehlikeli, 3 her türlü hata (argparse ve beklenmeyen hatalar dahil), 4 Eksik.
- `src/gitray/web/`: FastAPI. Jinja2 ile sunucu tarafında üretilen sayfalar ve JSON API. (Aşama 3, henüz yok)
- `src/gitray/worker/`: PostgreSQL'deki iş kuyruğundan iş alır, motoru çalıştırır, sonucu yazar. (Aşama 3, henüz yok)
- `tests/`: Ağ kullanmayan testler. Kural örnekleri `tests/fixtures/rules/<KURAL>/{positive,negative}/*.fixture` (zararsız sahte örnekler); her kural için ikisi de zorunlu.
- Belge dosyası yalnızca türüne göre belirlenir (`*.md`, `*.markdown`, `*.rst`, `*.adoc` ve README/LICENSE/CHANGELOG gibi bilinen `.txt` adları); klasör (`docs/`) etkisizdir. Belgelerde düşük ağırlık (`doc_weight`) yalnızca GR-CODE kurallarına uygulanır.
- PostgreSQL: Sonuçlar, iş kuyruğu ve önbellek (anahtar: `owner/repo` + commit SHA). Redis kullanılmaz.
- Altyapı: Tek VPS, Docker Compose, Caddy (HTTPS), Cloudflare (DNS, koruma, Turnstile).
- Dış servisler: GitHub API (kişisel token ile), OSV API, VirusTotal public API (yalnızca hash sorgusu; günde 500 ve dakikada 4 istek sınırı; kota dolarsa kontrol "atlandı" olarak işaretlenir). VirusTotal'in tanımadığı bir dosya "bilinmiyor" sayılır, "temiz" değil.

## Tarama akışı
1. Repo bilgisini al: boyut, oluşturulma tarihi, varsayılan dal, son commit SHA, sahip hesap bilgileri, release dosyalarının `digest` değerleri.
2. Tarball'ı bellekte, limitlerle oku.
3. Dedektörleri çalıştır:
   - Kod kalıpları: gizlenmiş kodu çözüp çalıştırma, `curl | sh`, tarayıcı şifre dosyaları, SSH anahtarları, kripto cüzdan yolları
   - Otomatik çalışan dosyalar: `package.json` scriptleri, `setup.py`, `.vscode/tasks.json`, `.github/workflows`
   - Gizleme: entropi ve uzun, rastgele görünen metinler
   - README ve linkler: GitHub dışına giden `.zip`/`.exe` linkleri, link kısaltıcılar, şifreli arşiv kalıpları
   - Repo sinyalleri: repo ve hesap yaşı, repo'dan eski commit tarihleri (düşük ağırlıklı sinyal), release hash → VirusTotal, bağımlılıklar → OSV
4. Puanla: her bulgunun bir ağırlığı var; her kural puana bir kez (en yüksek ağırlığıyla) katılır; toplam 0–100. Her bulgu dosya, satır, kural kimliği ve "neden tehlikeli" açıklamasıyla raporlanır. Karar dört durumdan biridir:
   - **Temiz** (<30), **Şüpheli** (30–69), **Tehlikeli** (≥70).
   - **Eksik** (Incomplete): Bir limit taramayı durdurdu ve okunabilen kısım temiz çıktı. Bu, indirmeden önce yakalanan limitler için de geçerlidir (repo boyutu ön kontrolü, Content-Length): taranan dosya sayısı 0 olsa bile sonuç Eksik'tir, repo bilgisi ve `partial` bloğu raporda yer alır; limit aşımı hiçbir zaman hata (3) olarak bitmez. Eksik yalnızca Temiz'in yerine geçer; okunan kısım Şüpheli ya da Tehlikeli ise o karar kalır ve rapor "kısmi tarama" olarak işaretlenir. Kısmi taramada hangi limitin aşıldığı ve kaç dosyanın tarandığı her zaman raporlanır. Kısmi tarama asla Temiz sayılmaz, çünkü saldırgan payload'ı büyük dosyaların arkasına saklayabilir.
5. Sonucu kaydet ve göster.

## Aşamalar
- [x] Aşama 1: Motor iskeleti, yalnızca CLI (`python -m gitray github.com/owner/repo`), ilk 8–10 kural ve testler
- [ ] Aşama 2: Kurallar YAML dosyalarına; tüm dedektörler; OSV ve VirusTotal entegrasyonu. Ayrıca:
  - `.github/workflows` kuralı. `curl … | sh` gibi komutlar workflow dosyalarında ayrı bir bağlam olarak ele alınır: bu komutlar repoyu klonlayanın bilgisayarında değil CI'da çalışır, bu yüzden risk ve ağırlık farklıdır. URL'nin GitHub'da (`github.com`, `raw.githubusercontent.com` vb.) barınması hiçbir kuralda güven sinyali olarak kullanılmaz; saldırganlar payload'larını sıklıkla GitHub'da barındırır.
  - Dosya içeriğini okuyup çalıştıran kod kuralı (`exec(open(...).read())`, `eval(fs.readFileSync(...))`, `new Function(fs.readFileSync(...))`, `source`/`.` ile dosya çalıştırma). Bu kural, payload'ı belge ağırlığının düşük olduğu bir `.md` dosyasına saklama yolunu da kapatır.
  - Görünmez yön karakterleri kuralı (Trojan Source; U+202A–U+202E, U+2066–U+2069, U+200E/U+200F): kaynak kodda göründüğünden farklı çalışan satırlar. Aşama 1'de kendi kodumuzda aynı sorunu yaşadık; `tests/test_security_invariants.py` kendi kodumuzu bu yüzden denetliyor.
  - UTF-16 dosyalar: NUL byte içerdikleri için şu an ikili sayılıp hiç taranmıyor. Windows'ta UTF-16 kaydedilmiş PowerShell scriptleri yaygın. BOM (`FF FE` / `FE FF`) varsa dosya önce UTF-16 olarak çözülüp taranmalı.
  - Dosya paylaşım siteleri: MediaFire, Mega, Google Drive, Dropbox gibi uzantısı olmayan indirme linkleri (GR-LINK-001 şu an yalnızca uzantıya ve link kısaltıcılara bakıyor).
  - Repo içindeki çalıştırılabilir ikili dosyalar: PE (`MZ`), ELF (`\x7fELF`) ve Mach-O imzaları. Şu an yalnızca "ikili dosya atlandı" olarak sayılıyor, bulgu üretmiyor.
  - GR-LINK-001 ve kendi reponun `/archive/` linkleri (karar verildi, uygulama Aşama 2'de): Taranan reponun kendi `github.com/<owner>/<repo>/archive/…` linkleri (README'lerdeki "Download ZIP"), varsayılan dala ya da taranan commit SHA'sına işaret ediyorsa muaf olur, çünkü içerikleri taradığımız kodla aynı. Başka tag'lere ya da dallara işaret eden arşivler işaretlenmeye devam eder ve bulgu notuna "taranmamış bir sürümü indiriyor" yazılır. `/releases/download/` muafiyetindeki yol kaçışı kuralları (`..`, `%2e`, `%2f`, `%5c`, ters eğik çizgi) burada da geçerlidir.
  - Kalibrasyon notu (`NVIDIA/apex`, GR-AUTO-002): `setup.py` CUDA derleyicisinin sürümünü `subprocess` ile okuduğu için 35 puanla Şüpheli çıkıyordu. Düzeltmeden sonra süreç çağrıları tek başına 10 puan alıyor; ağ kullanımı, aynı satırda URL ya da indirme aracı (curl, wget, powershell, Invoke-WebRequest, iwr) olan süreç çağrıları ve çözülmüş verinin çalıştırılması 35 alıyor. Yalnızca import içeren satırlar raporlanmıyor. 1. katman (yapıldı): dosyada süreç çalıştırma yeteneği (import satırları dahil) ve herhangi bir satırda bir indirme aracı birlikte varsa indirme aracının ilk satırı 35 alır; böylece `from subprocess import run as r` + `r(["curl", ...])` yakalanır. URL bu dosya düzeyi kontrole girmez (her setup.py'de `url="https://…"` var). `curl-config` indirme aracı sayılmaz (pycurl). Kabul edilen risk: yorumda ya da `keywords`'te geçen araç adları da tetikler. 2. katman (yapıldı, `engine/pyflow.py`): dosya `ast.parse` ile ayrıştırılabiliyorsa süreç çağrılarında son söz veri akışınındır; 1. katman yalnızca ayrıştırma başarısız olursa (Python 2, kırpılmış dosya) devreye girer. Değer, çağrıdaki rolüne göre değerlendirilir. **Komut yeri**: çalıştırılan program (liste çağrılarında ilk eleman, `os.exec*`/`spawn*` yolu, sudo/env/nohup/timeout/xargs gibi başlatıcılardan sonraki ilk eleman) ve kabuğa giden komut metni (`os.system`, `os.popen`, `shell=True`, `sh/bash -c`, `cmd /c`, `powershell -Command`). Burada araç adı ya da URL, dosya içeriği ya da çözülmüş veri, ya da sabitlerden hesaplanamayan bir dönüşümle üretilmiş dizge 35 alır. **Argüman yeri**: yalnızca URL 35 alır; araç adı (`apt-get install curl`) ve dosya içeriği (`-DVERSION=` + `open(...).read()`) nötrdür. Ortam değişkeni, içe aktarılan sabit ve çağrısı olmayan parametre gibi dış bilinmeyenler nötrdür. Liste yapısı izlenemiyorsa bütün liste komut yeri sayılır. Kabuk metninde tırnak, ters eğik çizgi, `^` ve backtick temizlenir (`c''url`, `c^url`). `replace`, `swapcase`/`lower` vb., `reversed`/`sorted` + `join`, `%` ve `format` (basit alanlar), `bytes([...])`, `chr`, `split`, `shlex.split` ve dilimleme sabit girdilerle tam hesaplanır; sonuç boyutu sınırlıdır, sınırı aşan işlem hesaplanmaz, "hesaplanamayan" sayılır. Listeye `append` ile eklenenler kaynak sırasıyla alınır. ctypes ile yüklenen kütüphanedeki `system`/`popen`/`exec*`/`WinExec`/`CreateProcess*` süreç çağrısıdır; `ctypes.util.find_library` nötrdür. Dinamik yapılar (sabit olmayan `__import__`/`import_module`/`getattr(modül, x)`/`exec`/`eval`, `chr`, çözme fonksiyonları, `globals()[x]`, `runpy`/`exec_module`) süreç yeteneğiyle birlikte görülürse 35; hesaplanamayan dinamik içe aktarma ve modül üzerinde `getattr` tek başına süreç yeteneği sayılır. Sabit argümanlı olanlar çözülür ve dinamik sayılmaz. Çok büyük ya da çok karmaşık dosya (limitler `limits.py`'de) süreç yeteneğiyle birlikteyse 35. Bağımsız bir incelemede 10 gizleme denemesinden yakalanamayan 8'i ve bir yanlış alarm bu modelle düzeltildi; her biri için fixture var (`evasion_*`, `file_version_argument_low_weight`). Kalibrasyon: pycurl ve NVIDIA/apex 10 puanla Temiz. Bilinen sınırlar: dosyalar arası akış yok; akış sırasız olduğu için dallarda ve döngülerde kurulan listelerin sırası yaklaşıktır; `$'\x63url'`, `${IFS}` ve `$(printf …)` gibi kabuk genişletmeleri çözülmez; bu biçimde gizlenmiş bir kabuk komutu şu an 10 alır; `exec(open('pkg/version.py').read())` ile sürüm okuyup aynı dosyada `subprocess` kullanan meşru setup.py'ler 35 alır (şimdilik kabul edildi; Aşama 2 sonundaki kalibrasyonda kontrol edilmeli). Fikir (Aşama 2 sonunda değerlendirilecek): exec edilen dosya repo içinde sabit bir yolsa o dosya zaten arşivde var; onu da aynı akış analiziyle tarayıp sonucu setup.py'ye bağlamak (dosyalar arası analiz). Bu hem yanlış alarmı düşürür hem de payload'ı `version.py`'ye saklama yolunu kapatır.
  - Kalibrasyon notu (`nvm-sh/nvm`): Aşama 1 motoru bu meşru repoyu 50 puanla Şüpheli buldu. Puanın 35'i workflow dosyalarındaki `curl … | bash` satırlarından (GR-CODE-002), 15'i bir test dosyasındaki base64 kodlu oturum çerezinden (GR-OBF-001) geliyor. README'deki kurulum satırı doğru şekilde işaretlenmedi. Workflows kuralı eklendikten sonra bu repo yeniden taranıp sonuç kontrol edilmeli.
- [ ] Aşama 3: FastAPI, PostgreSQL, worker, Jinja2 sayfaları ve önbellek; `docker compose up` ile lokalde çalışır
- [ ] Aşama 4: Hız sınırı, Turnstile ve boyut limitleri; VPS'e deploy (Caddy, Cloudflare); GitHub Actions ile test ve deploy
- [ ] Aşama 5: README (mimari diyagram, ekran görüntüleri, "nasıl çalışır", "sınırlamalar")
- [ ] Aşama 6 (opsiyonel): CLI paketleme, Flutter/Dart kuralları (Gradle, Podfile), LLM ile bulgu açıklamaları

## Çalışma şekli
- Kullanıcıyla Türkçe konuş. Kod, değişken adları, yorumlar ve commit mesajları İngilizce.
- Her aşamaya başlamadan önce planı ve mimari kararları sade bir dille açıkla; onay almadan kod yazma.
- Doğrulayamadığın varsayımları açıkça yaz; tahminle ilerleme. Belirsizlik varsa sor.
- Bu dosyadaki kararlarla çelişen ya da daha önce düzeltilmiş bir hatayı geri getirebilecek bir değişiklik gerekiyorsa önce sor.
- Her dedektör ve kural için test yaz. Bir aşama bitince yukarıdaki listeyi güncelle.
- Görünmez ve yön karakterleri (U+200B–U+200F, U+202A–U+202E, U+2066–U+2069, U+2028, U+2029) kodda ve testlerde asla `\uXXXX` kaçış dizisiyle yazılmaz; `\N{RIGHT-TO-LEFT OVERRIDE}`, `\N{LINE SEPARATOR}` gibi adlar kullanılır (regex ve üretici scriptlerde `chr(0x202e)` da olur). Sebep: Araç çağrıları JSON olarak gidiyor ve JSON `\uXXXX` dizilerini gerçek karaktere çeviriyor; bu, kodumuza iki kez görünmez karakter soktu. `tests/test_security_invariants.py` kendi kodumuzda bu karakterleri arar.

## Açık kararlar
- Arayüz dili (Türkçe / İngilizce): Aşama 3'te karar verilecek.
- README dili: Aşama 5'te karar verilecek.

## Komutlar
Python 3.13 ve uv kullanılır (Aşama 1'de karar verildi).
- Kurulum: `uv sync`
- Testler: `uv run pytest` (kapsam: `uv run pytest --cov=gitray`; gerçek GitHub'a giden test: `uv run pytest -m network`)
- Lint ve format: `uv run ruff check .` ve `uv run ruff format .`
- Tip kontrolü: `uv run mypy`
- Tarama: `uv run python -m gitray github.com/owner/repo` (`--json`, `--debug`, `--max-total-mb` vb. için `--help`)
- GitHub API limiti için isteğe bağlı: `export GITHUB_TOKEN=...` (izinsiz, yalnızca public okuma yeterli; hiçbir yerde loglanmaz)
