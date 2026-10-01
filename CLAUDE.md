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
  - `rules/` kurallar (`base.py` Rule/RegexRule, kategori başına bir modül), `scoring.py` puan, `scanner.py` orkestrasyon, `report.py` güvenli JSON çıktısı
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
   - **Eksik** (Incomplete): Bir limit taramayı durdurdu ve okunabilen kısım temiz çıktı. Eksik yalnızca Temiz'in yerine geçer; okunan kısım Şüpheli ya da Tehlikeli ise o karar kalır ve rapor "kısmi tarama" olarak işaretlenir. Kısmi taramada hangi limitin aşıldığı ve kaç dosyanın tarandığı her zaman raporlanır. Kısmi tarama asla Temiz sayılmaz, çünkü saldırgan payload'ı büyük dosyaların arkasına saklayabilir.
5. Sonucu kaydet ve göster.

## Aşamalar
- [x] Aşama 1: Motor iskeleti, yalnızca CLI (`python -m gitray github.com/owner/repo`), ilk 8–10 kural ve testler
- [ ] Aşama 2: Kurallar YAML dosyalarına; tüm dedektörler; OSV ve VirusTotal entegrasyonu. Ayrıca:
  - `.github/workflows` kuralı. `curl … | sh` gibi komutlar workflow dosyalarında ayrı bir bağlam olarak ele alınır: bu komutlar repoyu klonlayanın bilgisayarında değil CI'da çalışır, bu yüzden risk ve ağırlık farklıdır. URL'nin GitHub'da (`github.com`, `raw.githubusercontent.com` vb.) barınması hiçbir kuralda güven sinyali olarak kullanılmaz; saldırganlar payload'larını sıklıkla GitHub'da barındırır.
  - Dosya içeriğini okuyup çalıştıran kod kuralı (`exec(open(...).read())`, `eval(fs.readFileSync(...))`, `new Function(fs.readFileSync(...))`, `source`/`.` ile dosya çalıştırma). Bu kural, payload'ı belge ağırlığının düşük olduğu bir `.md` dosyasına saklama yolunu da kapatır.
  - Görünmez yön karakterleri kuralı (Trojan Source; U+202A–U+202E, U+2066–U+2069, U+200E/U+200F): kaynak kodda göründüğünden farklı çalışan satırlar. Aşama 1'de kendi kodumuzda aynı sorunu yaşadık; `tests/test_security_invariants.py` kendi kodumuzu bu yüzden denetliyor.
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
