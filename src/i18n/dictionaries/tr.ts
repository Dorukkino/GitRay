/** Turkish texts of the site. */

import type { Dictionary } from "./en";

export const tr: Dictionary = {
  meta: {
    title: "GiTRay — GitHub repo zararlı yazılım taraması",
    description:
      "GiTRay herkese açık GitHub repolarını hiçbir şeyi klonlamadan ya da çalıştırmadan zararlı yazılım hilelerine " +
      "(kurulumda çalışan scriptler, saklı yükler, şifre hırsızları, sahte indirme linkleri) karşı tarar.",
  },
  nav: {
    label: "Ana menü",
    scan: "Tara",
    how: "Nasıl çalışır",
    safeZone: "Güvenli Bölge",
    scammer: "Tehlikeli",
    rules: "Kurallar",
  },
  footer: {
    note: "GiTRay taradığı kodu asla klonlamaz, derlemez ya da çalıştırmaz. Sonuçlar sezgiseldir, garanti değildir.",
    label: "Site",
    privacy: "Gizlilik",
    terms: "Kullanım şartları",
  },
  consent: {
    title: "Analitik çerezleri",
    text:
      "GiTRay, izninizle sitenin nasıl kullanıldığını görmek için Google Analytics kullanır. Kabul ederseniz " +
      "Google çerez yerleştirir ve kullanım verilerini alır; bu veriler Türkiye ve AB dışında da işlenebilir. " +
      "Reddederseniz hiçbir şey yüklenmez, site aynen çalışır.",
    more: "Gizlilik politikası",
    accept: "Kabul et",
    reject: "Reddet",
    settings: "Çerez tercihleri",
  },
  theme: { label: "Tema", system: "Sistem", light: "Açık", dark: "Koyu" },
  language: { label: "Dil" },
  logo: "GiTRay ana sayfa",

  home: {
    weekly: {
      one: "repo son haftada tarandı",
      other: "repo son haftada tarandı",
    },
    badge: "{rules} kural · hiçbir şey klonlanmaz ya da çalıştırılmaz",
    beta: "GiTRay hâlâ geliştirme aşamasında ve yanılabilir. Sonucu kesin bir karar değil, bir ipucu olarak görün; önemli bir şeyi kendiniz de kontrol edin.",
    titleBefore: "Bu GitHub reposunu ",
    titleHighlight: "klonlamak güvenli",
    titleAfter: " mi?",
    intro:
      "Zararlı yazılımlar artık GitHub repolarında saklanıyor: kurduğunuz, derlediğiniz ya da açtığınız anda kod " +
      "çalıştıran sahte araçlar, hileler ve iş görüşmesi projeleri. GiTRay repoyu güvenli yoldan okur ve ne bulduğunu " +
      "satır satır anlatır.",
    panel: {
      title: "Sahte bir reponun röntgeni",
      note: "Her dosya okunur, hiçbiri çalıştırılmaz.",
      install: "npm install'da çalışır",
      open: "klasör açılınca çalışır",
      program: "repoda hazır program",
      hidden: "ekran dışına itilmiş kod",
      clean: "temiz",
    },
    recentTitle: "Son tarananlar",
    recentAll: "Tümünü gör",
    looksTitle: "GiTRay neye bakar",
    allRules: "{n} kuralın hepsi",
    verdictsTitle: "Kararlar",
    ranges: {
      clean: "Puan 30'un altında",
      suspicious: "Puan 30 ile 69 arası",
      dangerous: "Puan 70 ya da üstü",
      incomplete: "Bir sınır taramayı durdurdu",
    },
    disclaimer:
      "GiTRay statik bir tarayıcıdır: bilinen hileleri tanır, kodu korumalı bir ortamda çalıştırmaz. Temiz sonuç " +
      "riski azaltır; bir reponun güvenli olduğunu kanıtlamaz.",
  },

  how: {
    metaTitle: "Nasıl çalışır",
    metaDescription:
      "GiTRay bir GitHub reposunu tararken ne olur: API'den bilgiler, bellekte okunan bir arşiv, açıklanabilir " +
      "kurallar ve bir puan. Hiçbir şey klonlanmaz ya da çalıştırılmaz.",
    title: "Nasıl çalışır",
    intro:
      "GiTRay bir repoyu klonlamadan, kurmadan ya da açmadan önce tek bir soruyu yanıtlar: zararlı yazılımların " +
      "kullandığı bilinen bir hileyi kullanıyor mu? Tara'ya bastığınızda olanlar şunlar.",
    steps: [
      {
        title: "Klon değil, bilgi",
        text:
          "Repo, sahip ve release bilgileri GitHub API'sinden gelir. Release dosyaları asla indirilmez; SHA-256 " +
          "parmak izleri VirusTotal'de aranır.",
      },
      {
        title: "Bellekte, sınırlarla okunur",
        text:
          "Kaynak arşivi akış halinde indirilir ve boyut, dosya sayısı ve süre sınırlarıyla bellekte açılır; " +
          "içindeki ZIP dosyaları da. .gitattributes'un GitHub arşivinden sakladığı dosyalar ayrıca indirilir. Diske " +
          "hiçbir şey yazılmaz, hiçbir şey çalıştırılmaz.",
      },
      {
        title: "Açıklanabilir kurallar",
        text:
          "Her kural bilinen bir hileyi arar ve neden tehlikeli olduğunu anlatır. Her bulgu dosya, satır, kodun " +
          "kendisi ve 0-100 puana katkısıyla gelir.",
      },
      {
        title: "Puan ve karar",
        text:
          "Her kural en güçlü bulgusuyla puana bir kez katılır, toplam en fazla 100'dür. 30'un altı Temiz, 30'dan " +
          "itibaren Şüpheli, 70'ten itibaren Tehlikeli. Bir güvenlik sınırı taramayı durdurursa karar Eksik olur, " +
          "asla Temiz değil.",
      },
    ],
    neverTitle: "GiTRay'in asla yapmadıkları",
    never: [
      {
        title: "Repodaki kodu çalıştırmak",
        text: "Kurulum, derleme, script ya da korumalı ortam yok. Her dosya yalnızca okunur.",
      },
      {
        title: "Repoyu diske yazmak",
        text: "Arşiv bellekte, sıkı sınırlarla açılır; bu yüzden bir arşiv bombası diski dolduramaz.",
      },
      {
        title: "Release dosyalarını indirmek",
        text:
          "Yalnızca SHA-256 parmak izleri VirusTotal'de aranır. Hiçbir dosya yüklenmez ya da indirilmez.",
      },
      {
        title: "Reponun söylediğine güvenmek",
        text:
          "Dosya adları, README metni ve kod; görünmez karakterler görünür hale getirilerek ve linkler etkisizleştirilerek " +
          "gösterilir. Repodan gelen linkler asla tıklanabilir değildir.",
      },
    ],
    limitsTitle: "Sınırlar",
    limits: [
      "Sonuçlar sezgiseldir. Temiz kararı riski azaltır; bir reponun güvenli olduğunu kanıtlamaz.",
      "Yalnızca bilinen hileler tanınır. Yepyeni bir teknik, onu tanıyan bir kural yazılana kadar fark edilmeyebilir.",
      "Sonuç yalnızca taranan commit için geçerlidir. Sonraki bir commit her şeyi değiştirebilir.",
      "Git submodule'leri listelenir ama taranmaz, çünkü başka repolardan gelirler.",
      "Bir güvenlik sınırı taramayı durdurursa karar Eksik olur, asla Temiz değil.",
    ],
    ctaTitle: "Bir repoda deneyin",
    ctaRules: "{n} kuralın hepsini gör",
  },

  form: {
    label: "GitHub reposu",
    placeholder: "https://github.com/sahip/repo",
    submit: "Repoyu tara",
    invalid: "Herkese açık bir GitHub reposu girin, örneğin github.com/sahip/repo",
    failed: "Bir şeyler ters gitti",
    try: "Dene:",
  },

  categories: {
    behavior: {
      label: "Zararlı davranış",
      text:
        "Kod, kod olarak okunur ve veri izlenir: kayıtlı kimlik bilgilerini okuyup dışarı gönderme, " +
        "kod indirip çalıştırma, gizli bir bloğu çözüp çalıştırma.",
    },
    dependencies: {
      label: "Zararlı bağımlılıklar",
      text: "package.json, kilit dosyaları ve Python gereksinimlerinde OSV'nin doğrulanmış zararlı yazılım olarak listelediği paketler.",
    },
    autorun: {
      label: "Kendiliğinden çalışanlar",
      text:
        "npm install hook'ları, setup.py, VS Code görevleri ve ayarları, dev container'lar, yapay zekâ asistanı " +
        "hook'ları, .npmrc, direnv, build olayları.",
    },
    code: {
      label: "Zararlı kod kalıpları",
      text:
        "Çözüp çalıştırma, curl | sh, tarayıcı şifre ve çerez hırsızlığı, SSH anahtarları, kripto cüzdanları, " +
        "Discord/Telegram'a veri kaçırma, Windows LOLBin'leri.",
    },
    obfuscation: {
      label: "Saklı ya da gizlenmiş içerik",
      text:
        "Rastgele görünen veri blokları, Trojan Source yön karakterleri, boşlukla ekran dışına itilmiş kod, görünmez " +
        "Unicode yükleri.",
    },
    links: {
      label: "İndirme linkleri",
      text: "Reponun kendi release'leri dışındaki programlar ve arşivler, dosya paylaşım siteleri, link kısaltıcılar, arşiv şifreleri.",
    },
    social: {
      label: "Sosyal mühendislik",
      text: 'README\'de antivirüsü kapatma, istisna ekleme ya da bir "yanlış alarmı" görmezden gelme talimatları.',
    },
    binary: {
      label: "İkili dosyalar",
      text:
        "Repoya eklenmiş PE/ELF/Mach-O programları, .lnk kısayolları, şifreli arşivler, antivirüslerin yakaladığı " +
        "dosyalar. ZIP'lerin içindeki dosyalar da bellekte açılıp taranır.",
    },
    repo: {
      label: "Repo sinyalleri",
      text: "Yepyeni sahip hesapları, yeni açılmış repolar ve GitHub'ın indirme arşivinden saklanmış dosyalar.",
    },
    ci: {
      label: "CI iş akışları",
      text: "İndirileni doğrudan kabuğa veren CI ayarları (sizin bilgisayarınızda değil, derleme sunucusunda çalışır).",
    },
  },

  verdicts: {
    clean: {
      label: "Temiz",
      summary:
        "Bilinen hiçbir zararlı yazılım hilesi bulunmadı. Bu bir garanti değildir: GiTRay bilinen kalıpları arar ve " +
        "kodu çalıştırmaz.",
    },
    suspicious: {
      label: "Şüpheli",
      summary:
        "Zararlı yazılımların kullandığı bazı kalıplar bulundu. Bu repodan bir şey kurmadan, derlemeden ya da " +
        "çalıştırmadan önce bulguları okuyun.",
    },
    dangerous: {
      label: "Tehlikeli",
      summary:
        "Zararlı yazılıma dair birkaç güçlü işaret var. Her bulguyu anlamadan bu repoyu klonlamayın, kurmayın, " +
        "derlemeyin ya da bir IDE'de açmayın.",
    },
    incomplete: {
      label: "Eksik",
      summary:
        "Bir güvenlik sınırı taramayı her dosya okunmadan durdurdu. Okunan kısım temiz görünüyor ama yarım bir tarama " +
        "asla temiz sayılmaz: yük okunmayan kısımda olabilir.",
    },
  },
  severity: { high: "yüksek", medium: "orta", low: "düşük" },

  scan: {
    steps: [
      "Repo bilgileri GitHub API'sinden okunuyor",
      "Kaynak arşivi belleğe akıtılıyor (diske asla yazılmaz)",
      "Her kural her dosyada çalıştırılıyor",
      "Puan hesaplanıyor",
    ],
    scanning: "{repo} taranıyor",
    duration: "Repo büyüklüğüne göre genellikle 2-20 saniye sürer.",
    scannedWithCommit: "{age} tarandı, commit {sha}.",
    scanned: "{age} tarandı.",
    justNow: "az önce",
    minutesAgo: "{n} dk önce",
    hoursAgo: "{n} sa önce",
    again: "Şimdi yeniden tara",
    couldNot: "{repo} taranamadı",
    tryAgain: "Tekrar dene",
    another: "Başka bir repo tara",
    httpFailed: "Tarama başarısız oldu (HTTP {status}).",
    network: "Ağ hatası",
    details: "Ayrıntı: {text}",
    errorMessages: {
      not_found: "Repo bulunamadı (ya da herkese açık değil).",
      private: "Yalnızca herkese açık repolar taranabilir.",
      rate_limited: "Kısa sürede çok fazla istek geldi.",
      busy: "Tarayıcı şu an meşgul.",
      budget_exhausted: "GiTRay bu saatin tarama bütçesini doldurdu. Son bir saatte taranan repolar yine açılır.",
      invalid_target: "Bu geçerli bir GitHub repo adresi değil.",
      archive_error: "Repo arşivi okunamadı.",
      upstream: "GitHub'a ulaşılamadı ya da beklenmeyen bir cevap geldi.",
      internal: "Tarama sırasında beklenmeyen bir hata oldu.",
      network: "Sunucuya ulaşılamadı.",
      unexpected: "Tarama başarısız oldu.",
    },
    errorHelp: {
      not_found: "Yazımı kontrol edin. Gizli repolar taranamaz.",
      rate_limited: "Bir dakika bekleyip tekrar deneyin.",
      busy: "Birkaç saniye sonra tekrar deneyin.",
      budget_exhausted: "Bu sınır, bütün ziyaretçilerin paylaştığı GitHub API kotasını korur. Bir saat içinde tekrar deneyin.",
      invalid_target: "github.com/sahip/repo biçimini kullanın.",
    },
  },

  report: {
    limits: {
      maxRepoSizeKb: "repo boyutu",
      maxDownloadBytes: "indirme boyutu",
      maxEntries: "dosya sayısı",
      maxFileBytes: "dosya boyutu",
      maxTotalBytes: "açılmış boyut",
      timeBudgetMs: "süre",
      maxHiddenFiles: "saklı dosya",
    },
    checks: {
      dependencies: "Zararlı bağımlılıklar (OSV)",
      reputation: "Antivirüs motorları (VirusTotal)",
      hidden: "İndirmeden saklanan dosyalar",
    },
    dependency: {
      older: "Kontrol edilmedi: bu rapor bağımlılık kontrolünden eski. Eklemek için yeniden tarayın.",
      packages: { one: "{n} paket", other: "{n} paket" },
      ok: "{packages}, OSV'nin bilinen zararlı paketler listesiyle karşılaştırıldı: hiçbiri bulunmadı.",
      found: "Burada tanımlanan {packages} içinden {malicious} tanesi OSV'ye göre bilinen zararlı yazılım.",
      unavailable: "OSV'ye ulaşılamadı, bu yüzden bağımlılıklar bilinen zararlı yazılımlarla karşılaştırılamadı.",
      none: "Bağımlılık dosyası yok (package.json, requirements.txt, pyproject.toml ya da kilit dosyaları), kontrol edilecek bir şey yoktu.",
      notCheckedPartial: "Tarama erken durduğu için kontrol edilmedi.",
      notChecked: "Kontrol edilmedi.",
    },
    reputation: {
      older: "Kontrol edilmedi: bu rapor VirusTotal kontrolünden eski. Eklemek için yeniden tarayın.",
      files: { one: "{n} dosya", other: "{n} dosya" },
      unknown: {
        one: "{n} tanesini VirusTotal tanımıyor; bu güvenli demek değildir.",
        other: "{n} tanesini VirusTotal tanımıyor; bu güvenli demek değildir.",
      },
      more: {
        one: "{n} dosyaya daha bakılmadı (taramada en fazla 10).",
        other: "{n} dosyaya daha bakılmadı (taramada en fazla 10).",
      },
      found: "Parmak iziyle sorulan {files} içinden {flagged} tanesini antivirüs motorları yakalıyor.",
      ok: "{files} parmak iziyle soruldu: hiçbir antivirüs motoru yakalamıyor.",
      partial:
        "{files} içinden {looked} tanesi soruldu; kalanlar VirusTotal'in ortak kotasını (dakikada 4, günde 500) " +
        "bekliyor ve repo yeniden tarandığında sorulacak.",
      unavailable: "VirusTotal'e ulaşılamadı, bu yüzden programlar ve release dosyaları sorulamadı.",
      notConfigured: "Bu sitede kendiliğinden sorulmuyor. Release dosyalarının yanındaki VirusTotal linklerini kullanın.",
      none: "Sorulacak bir şey yok: repoda program, release'lerde dosya yok.",
      detects: "{bad}/{total} motor yakalıyor",
      unknownFile: "VirusTotal tanımıyor",
      reasons: {
        error: "sorgu başarısız",
        quota: "henüz sorulmadı (ortak kota)",
        limit: "sorulmadı (taramada 10)",
      },
      releaseFile: "release dosyası",
      inRepository: "repoda",
      link: "VirusTotal",
      searchLink: "VirusTotal'de ara",
    },
    archive: {
      ok: "GitHub'ın indirme arşivi bu commit'in bütün dosyalarını içeriyor.",
      hidden: {
        one:
          "{n} dosya GitHub'ın indirme arşivinin dışında bırakılmış (.gitattributes export-ignore) ama git clone ile " +
          "yine geliyor. GiTRay bunların {scanned} tanesini ayrıca indirip taradı.",
        other:
          "{n} dosya GitHub'ın indirme arşivinin dışında bırakılmış (.gitattributes export-ignore) ama git clone ile " +
          "yine geliyor. GiTRay bunların {scanned} tanesini ayrıca indirip taradı.",
      },
      unavailable: "GitHub commit'in tam dosya listesini vermedi, bu yüzden indirme arşivinden saklanan dosyalar kontrol edilemedi.",
    },
    submodules: {
      count: {
        one: "{n} git submodule'ü taranmadı.",
        other: "{n} git submodule'ü taranmadı.",
      },
      text: "GitHub'ın indirmesi onları içermez ama {command} onları başka repolardan indirir. O şekilde klonlamadan önce onları da tarayın.",
      from: "kaynak: {url}",
      scan: "{repo} reposunu tara",
    },
    age: {
      unknown: "bilinmiyor",
      today: "bugün",
      days: { one: "{n} gün önce", other: "{n} gün önce" },
      months: "{n} ay önce",
      years: "{n} yıl önce",
    },
    stats: {
      commit: "Commit",
      branch: "Dal",
      repoCreated: "Repo açıldı",
      ownerSince: "Hesap açıldı",
      starsForks: "Yıldız / fork",
      filesScanned: "Taranan dosya",
    },
    line: {
      rules: "{n} kural",
      sizes: "{downloaded} indirildi, bellekte {unpacked} açıldı",
      binaries: "{n} ikili dosyanın yalnızca başlığına bakıldı",
      zips: {
        one: "{n} ZIP arşivinin içinden {members} dosya okundu",
        other: "{n} ZIP arşivinin içinden {members} dosya okundu",
      },
      zipsSkipped: "{n} ZIP arşivi açılamayacak kadar büyük",
      seconds: "{s} sn",
      scannedAt: "tarama: {date}",
    },
    partialScan: "Kısmi tarama",
    partialBox:
      "{title} {limit} sınırı taramayı {files} dosyadan sonra durdurdu ({reason}). Saldırganlar yükü büyük dosyaların " +
      "arkasına saklayabilir, bu yüzden kısmi bir tarama asla temiz sayılmaz.",
    partialTitle: "Kısmi tarama.",
    heldTitle: "Test dosyaları ayrı tutuldu.",
    heldText:
      "Puanın çoğu test dosyalarından geliyor (tests/, spec/, fixtures/). Test kodu bir repoyu klonlayınca ya da " +
      "kurunca çalışmaz ve güvenlik araçları saldırı örneklerini orada tutar; bu yüzden bu bulgular tek başına kararı " +
      "değiştirmez — sonuç test dışındaki dosyalara göre verilir. Bu repoda kurulumda ya da açılışta kendiliğinden " +
      'çalışan bir şey yok; olsaydı puanın tamamı sayılırdı. Testleri çalıştırmadan önce "test dosyasında" diye ' +
      "işaretlenen bulgulara bakın.",
    scanResult: "Tarama sonucu",
    metadata: "Repo bilgisi",
    inDocs: "belgede, ağırlığı düşürüldü",
    inPattern: "arama kalıbında ya da yorumda, ağırlığı düşürüldü",
    inZip: "ZIP dosyasının içinde",
    inTest: "test dosyasında",
    viewOnGitHub: "GitHub'da gör",
    whyMatters: "Bu neden önemli",
    chainTitle: "Kod ne yapıyor",
    chainSteps: {
      "reads-browser": "Tarayıcı şifre ya da çerez deposunu okuyor",
      "reads-wallet": "Kripto cüzdanını okuyor",
      "reads-discord": "Discord tokenlarını okuyor",
      "reads-ssh": "SSH özel anahtarını okuyor",
      "reads-messenger": "Mesajlaşma oturum dosyalarını okuyor",
      "reads-app": "Kayıtlı uygulama kimlik bilgilerini okuyor",
      downloads: "Ağdan kod indiriyor",
      decrypts: "Şifresini çözüyor",
      decodes: "Gizli bir bloğu çözüyor",
      sends: "Ağ üzerinden gönderiyor",
      runs: "Çalıştırıyor",
    } as Record<string, string>,
    chainLine: "satır {n}",
    notes: {
      npmScript: "\"{name}\" npm install sırasında kendiliğinden çalışıyor",
      npmScriptNet: "\"{name}\" npm install sırasında kendiliğinden çalışıyor ve ağ ya da kabuk komutları kullanıyor",
      installNet: "kurulum sırasında ağ kullanıyor",
      installDownloads: "kurulum sırasında indirme yapan bir süreç çalıştırıyor",
      installProcess: "kurulum sırasında bir süreç çalıştırıyor",
      installDecodeExec: "kurulum sırasında çözülmüş veriyi çalıştırıyor",
      installDynExec: "kurulum sırasında dinamik kod çalıştırıyor",
      installProcAndDownload: "süreç çalıştırabiliyor ve bir indirme aracı adı geçiyor",
      buildRisky: "build komutu çalıştırdığı şeyi indiriyor, çözüyor ya da gizliyor",
      build: "build komutu her derlemede çalışıyor",
      buildNet: "build sırasında ağ kullanıyor",
      buildDownload: "build sırasında bir indirme aracı çalıştırıyor",
      buildCmd: "build sırasında bir komut çalıştırıyor",
      buildCmdAndDownload: "komut çalıştırıyor ve bir indirme aracı adı geçiyor",
      exePe: "Windows programı (PE)",
      exeDll: "Windows kitaplığı (DLL)",
      exeElf: "Linux programı (ELF)",
      exeMacho: "macOS programı (Mach-O)",
      exeMachoUniversal: "macOS evrensel programı (Mach-O)",
      exeLnk: "Windows kısayolu (.lnk)",
      zipPackageExe: "içinde Windows programı ya da kitaplığı olan paket arşivi (wheel, NuGet)",
      zipExe: "içinde Windows programı, başlatıcı ya da disk imajı olan ZIP arşivi",
      zipEncrypted: "şifreli ZIP arşivi",
      rarEncrypted: "başlıkları şifreli RAR arşivi",
      avRepoKnown: "{total} antivirüs motorundan {bad} tanesi bu dosyayı yakalıyor",
      avRepoMaybe: "{total} antivirüs motorundan {bad} tanesi bu dosyayı yakalıyor (az sayıda; yanlış alarm olabilir)",
      avReleaseKnown: "{total} antivirüs motorundan {bad} tanesi bu release dosyasını yakalıyor",
      avReleaseMaybe: "{total} antivirüs motorundan {bad} tanesi bu release dosyasını yakalıyor (az sayıda; yanlış alarm olabilir)",
      evalUrlDecoded: "bir değişkendeki URL-çözülmüş veriyi çalıştırıyor",
      inContainer: "doğrudan bilgisayarınızda değil, bir konteyner imajı derlenirken çalışıyor",
      browserCleaner: "burada tarayıcı verisini yalnızca siliyor; bu dosyada onu açan, kopyalayan, çözen ya da gönderen bir şey yok (gizlilik temizleyicileri böyle yapar)",
      dpapiBrowser: "tarayıcı şifre dosyalarının yanında Windows DPAPI ile şifre çözüyor",
      dpapiAlone: "Windows DPAPI ile şifre çözüyor; tarayıcı dosyasına değinilmiyor",
      sshSends: "aynı dosya ağ üzerinden veri gönderebiliyor",
      sshNoNet: "aynı dosyada ağ kullanımı yok (SSH araçları da anahtar okur)",
      installerScript: "kurulum scripti: yalnızca biri kurulumu derleyip çalıştırınca çalışır",
      runKeyWrite: "bir Run anahtarına yazıyor: her açılışta bir program başlatır",
      runKeyName: "bir Run anahtarının adı geçiyor ama ona yazmıyor (başlangıç yöneticileri ve temizlik araçları bu kayıtları listeler, karşılaştırır, siler)",
      execFileData: "bir veri dosyasında ({ext}) saklanan kodu çalıştırıyor",
      execFile: "bir dosyadan okunan kodu çalıştırıyor",
      depVersion: "{name} {version}, bilinen zararlı bir {ecosystem} paketidir ({ids})",
      depAllVersions: "{name} paketinin her sürümü bilinen zararlı bir {ecosystem} paketidir ({ids})",
      devcontainerRisky: "ana makinede çalışıyor ve bir şey indiriyor ya da çözüyor",
      devcontainer: "konteyner başlamadan önce ana makinede çalışıyor",
      vscodeProgram: "\"{key}\" repodaki bir programı gösteriyor",
      hookRisky: "hook komutu bir şey indiriyor ya da çözüyor",
      hook: "hook komutu kendiliğinden çalışıyor",
      mcpRisky: "MCP sunucu komutu bir şey indiriyor ya da çözüyor",
      mcp: "proje bir MCP sunucu komutu tanımlıyor",
      npmrcNodeOptions: "npm'in başlattığı her Node süreci bu kodu yüklüyor",
      npmrcScriptShell: "her npm scripti bu programın üzerinden çalışıyor",
      envrcRemote: "klasöre girdiğinizde çalışıyor ve uzaktan içerik indiriyor",
      downloadHost: "{host} adresinden bir program ya da arşiv indiriyor",
      downloadGithub: "GitHub'da barınan bir indirme, ama bu reponun release'lerinden değil",
      downloadGithubSource: "GitHub'dan başka bir reponun kaynak arşivini indiriyor (incelenebilir kaynak, paketlenmiş dosya değil)",
      downloadOtherArchive: "bu reponun taranmamış bir sürümünü indiriyor (başka bir dal ya da etiket)",
      hostLink: "{host} bağlantısı",
      sellsMalware: "{kinds} satışa sunuyor",
      hexEscapes: "uzun bir \\xNN kaçış dizisi dizisi",
      entropyString: "{len} karakterlik dizge, entropi {e} bit/karakter",
      entropyHex: "{len} karakterlik hex dizgesi, entropi {e} bit/karakter",
      offscreen: "kod {n} boşluktan sonra başlıyor",
      invisibleRun: "arka arkaya {n} görünmez karakter",
      hangulFiller: "kodda boş görünen Hangul dolgu karakteri kullanılmış",
      accountNew: "sahip hesabı {days} gün önce açılmış",
      archiveHidden: "indirme arşivinde olmayan {count} dosya ({sample})",
    } as Record<string, string>,
    notCounted: "sayılmadı",
    breakdownTitle: "Puanın dökümü",
    noRule: "Hiçbir kural eşleşmedi. Puan 0.",
    findingCount: { one: "{n} bulgu", other: "{n} bulgu" },
    breakdownNote:
      "Her kural en güçlü bulgusuyla bir kez sayılır; toplam en fazla 100'dür. 30'un altı temiz, 30'dan itibaren " +
      "şüpheli, 70'ten itibaren tehlikeli.",
    findingsTitle: "Bulgular",
    all: "Hepsi",
    anySeverity: "Her önem",
    nothing:
      "Raporlanacak bir şey yok. GiTRay kurulum hook'larına, build dosyalarına, kod kalıplarına, saklı içeriğe, " +
      "linklere ve ikili dosyalara baktı.",
    noMatch: "Filtrelere uyan bulgu yok.",
    omitted: "Raporu okunur tutmak için daha zayıf {n} bulgu listelenmedi; puanı değiştirmezler.",
    releasesTitle: "Release dosyaları",
    releasesIntro:
      "Release dosyaları asla indirilmez. GitHub yeni yüklemeler için bir SHA-256 özeti verir; onu VirusTotal'de " +
      "arayabilirsiniz. Özeti olmayan dosya kontrol edilemez.",
    columns: { release: "Release", file: "Dosya", size: "Boyut", sha256: "SHA-256" },
    checkOnVirusTotal: "VirusTotal'de bak",
    noDigest: "özet yok: kontrol edilemez",
    how: {
      title: "Bu tarama nasıl yapıldı",
      intro: "GiTRay repoyu asla klonlamaz ya da çalıştırmaz. İşte ne yaptığı ve puanın nasıl çıktığı.",
      read: "{files} dosya ({kb} KB) bellekte okundu — hiçbiri çalıştırılmadı.",
      rules: "Bu dosyalarda {rules} kural çalıştırıldı.",
      checks: "Bağımlılıklar OSV'de, dosya parmak izleri VirusTotal'de kontrol edildi.",
      scored: "Bulgular 0-100 arası bir puana ve bir karara dönüştürüldü.",
      scaleTitle: "Puan nasıl çıktı",
      scaleNote: "Her kural en güçlü bulgusuyla bir kez eklenir; toplam en fazla 100'dür.",
      zoneClean: "Temiz",
      zoneSuspicious: "Şüpheli",
      zoneDangerous: "Tehlikeli",
      thisRepo: "Bu repo: {score}",
    },
    rawTitle: "Ham JSON raporu (geliştiriciler için)",
    download: "İndir",
    gaugeLabel: "Risk puanı 100 üzerinden {score}",
    gaugeSuffix: "/ 100 risk",
  },

  lists: {
    score: "puan {n}",
    commit: "commit {sha}",
    findings: { one: "{n} bulgu", other: "{n} bulgu" },
    stars: { one: "{n} yıldız", other: "{n} yıldız" },
    dbTitle: "Veritabanı henüz bağlı değil.",
    dbText:
      "Taramalar yine çalışır ama hiçbir şey saklanmaz. Bu listeyi doldurmak için Vercel projesinin Storage " +
      "sekmesinden bir Postgres veritabanı (Neon) ekleyin.",
    failed: "Liste şu an yüklenemedi. Bir dakika sonra tekrar deneyin.",
  },

  safeZone: {
    metaTitle: "Güvenli Bölge",
    metaDescription: "GiTRay'in bilinen hiçbir zararlı yazılım hilesi bulmadığı, yakın zamanda taranmış GitHub repoları.",
    eyebrow: "Güvenli Bölge",
    title: "Yakın zamanda tarandı, bir şey bulunmadı",
    intro:
      "Son taraması {clean} çıkan (puan 30'un altında, her dosya okundu) son {n} repo. Yeni bir tarama bir şey " +
      "bulduğu anda repo bu listeden çıkar.",
    clean: "temiz",
    note:
      "Temiz, GiTRay'in bildiği hilelerin hiçbirini bulmadığı anlamına gelir. Bir reponun güvenli olduğunun garantisi " +
      "değildir ve yalnızca taranan commit için geçerlidir.",
    empty: "Henüz temiz tarama yok. Eklemek için {link}.",
    emptyLink: "bir repo tarayın",
  },

  scammer: {
    metaTitle: "Tehlikeli listesi",
    metaDescription: "GiTRay'in tehlikeli bulduğu, yakın zamanda taranmış GitHub repoları.",
    eyebrow: "Tehlikeli listesi",
    title: "Tehlikeli bulunan repolar",
    intro:
      "Son taraması {score} puan alan son {n} repo: yük indiren kurulum scriptleri, şifre hırsızlığı ya da sahte " +
      "indirme linkleri gibi birkaç güçlü zararlı yazılım işareti. Bunları klonlamayın, kurmayın, açmayın.",
    score: "70 ya da üstü",
    warning:
      "Bu liste bir kişi tarafından değil, sezgisel kurallarla otomatik olarak üretilir. Güvenlik araçları ve zararlı " +
      "yazılım araştırma repoları, GiTRay'in aradığı kalıpların ta kendisini içerdikleri için buraya düşebilir. Her " +
      "bulguyu ve neden sayıldığını görmek için repoyu açın. Bir repo yanlışlıkla listelendiyse düzeltmeden sonra " +
      "yeniden tarayın.",
    empty: "Henüz tehlikeli repo bulunmadı. 70 ya da üstü puan alan repolar burada görünür.",
  },

  recent: {
    metaTitle: "Son tarananlar",
    metaDescription: "GiTRay'de en son taranan GitHub repoları ve kararları.",
    eyebrow: "Son tarananlar",
    title: "Yakın zamanda taranan repolar",
    intro:
      "Kararı ne olursa olsun GiTRay'de en son taranan {n} repo. Her repo bir kez, en son taramasıyla görünür; " +
      "bütün bulguları görmek için repoyu açın.",
    empty: "Henüz tarama yok. Eklemek için {link}.",
    emptyLink: "bir repo tarayın",
  },

  rulesPage: {
    metaDescription: "GiTRay'in çalıştırdığı her kural, neye baktığı ve ne kadar ağırlık taşıdığı.",
    title: "Kurallar",
    intro:
      "GiTRay reponun her dosyasında {count} kural çalıştırır. Bir kural, en güçlü bulgusuyla puana bir kez ağırlığını " +
      "ekler. Toplam en fazla 100'dür: {suspicious} altı temiz, {suspicious} ve üstü şüpheli, {dangerous} ve üstü " +
      "tehlikeli. Bazı kurallar daha güçlü kanıtta ağırlığını artırır (örneğin bir şey de indiren bir kurulum " +
      "scripti). Kod kuralları, komutların genellikle örnek olduğu belgelerde ve kaynak kodundaki " +
      "arama kalıplarında ve yorumlarda daha az ağırlık taşır: bunlar hiç çalışmaz, güvenlik araçları saldırıları böyle tarif eder.",
    ignoredInDocs: "belgelerde, arama kalıplarında ve yorumlarda sayılmaz",
    inDocs: "belgelerde, arama kalıplarında ve yorumlarda +{n}",
    files: "dosyalar: {list}",
  },

  privacy: {
    metaTitle: "Gizlilik",
    metaDescription: "GiTRay'in ne sakladığı, diğer servislere ne gönderdiği ve asla neyi toplamadığı.",
    title: "Gizlilik politikası",
    updated: "Son güncelleme: {date}",
    intro:
      "GiTRay ücretsiz ve ticari olmayan bir projedir. Hesap ve reklam yoktur; Google Analytics yalnızca izin " +
      "verirseniz kullanılır. Bu sayfa sitenin sakladığı ya da başkasına ilettiği her şeyi ve nedenini anlatır.",
    sections: [
      {
        title: "Bize gönderdikleriniz",
        paragraphs: [
          "Taranmasını istediğiniz reponun adresi. Bu adres o herkese açık repoyu taramak için kullanılır ve sonuçla " +
            "birlikte saklanır (aşağıya bakın); sizinle ilgili hiçbir bilgiyle birlikte saklanmaz.",
          "Her web sitesinde olduğu gibi tarayıcınız her istekle IP adresinizi gönderir. GiTRay onu yalnızca bir " +
            "ziyaretçinin başlatabileceği tarama sayısını sınırlamak için kullanır (dakikada 6). Sunucu bunun için " +
            "adresi kısa süre bellekte tutar; veritabanı adresin kendisini asla saklamaz, yalnızca anahtarlı bir " +
            "özetini (HMAC) bir sayaçla tutar ve bu sayaçları yaklaşık bir gün sonra siler. IP adresiniz GiTRay'in " +
            "loglarına yazılmaz ve aşağıdaki servislere asla gönderilmez.",
        ],
      },
      {
        title: "Tarama sonuçları herkese açıktır",
        paragraphs: [
          "Her reponun son taraması saklanır: reponun adı, açıklaması, yıldız sayısı, commit'i, kararı, puanı ve " +
            "dosyalarından kısa alıntılarla bulguları. Bu sonuçları herkes tarama sayfasında ve herkese açık " +
            "listelerde (Son tarananlar, Güvenli Bölge, Tehlikeli) görebilir. Taramayı kimin başlattığına dair " +
            "hiçbir şey sonuçla birlikte saklanmaz. En fazla 5.000 sonuç tutulur; önce en eskileri silinir.",
        ],
      },
      {
        title: "Çerezler ve tarayıcı depolaması",
        paragraphs: [
          "GiTRay reklam çerezi kullanmaz; analitik çerezleri yalnızca izninizle kullanılır (sonraki bölüme bakın). " +
            "Bunun dışında yalnızca siz seçtiğinizde kaydedilen küçük tercihler vardır:",
          "{lang}: dil menüsünden seçtiğiniz dil; site bir dahaki sefere o dilde açılsın diye (bir yıl).",
          "{theme}: seçtiğiniz tema (açık ya da koyu). Tarayıcınızın yerel depolamasında kalır, sunucuya asla " +
            "gönderilmez. Sistem'i seçince silinir.",
          "{consent}: analitik sorusuna verdiğiniz cevap; soru tekrar sorulmasın diye tarayıcınızın yerel " +
            "depolamasında kalır. Sunucuya asla gönderilmez.",
        ],
      },
      {
        title: "Google Analytics, yalnızca izninizle",
        paragraphs: [
          "İlk ziyaretinizde site Google Analytics kullanıp kullanamayacağını sorar. Cevap verene kadar ve " +
            "reddederseniz Google'dan hiçbir şey yüklenmez, Google'a hiçbir şey gönderilmez.",
          "Kabul ederseniz site, ziyaretleri saymak ve hangi sayfaların kullanıldığını görmek için Google'ın sunduğu " +
            "Google Analytics'i yükler. Google kendi çerezlerini ({ga}) yerleştirir ve IP adresinizi, tarayıcı ve " +
            "cihaz bilgilerinizi, gezdiğiniz sayfaları (hangi tarama sayfaları olduğu dahil) ve sizi yönlendiren " +
            "siteyi alır. Google bu verileri kendi politikası ({google}) çerçevesinde Türkiye ve AB dışında, ABD " +
            "dahil işleyebilir. GiTRay, Google Analytics panelinde yalnızca toplamları görür, kim olduğunuzu görmez.",
          "Cevabınızı her sayfanın altındaki Çerez tercihleri ile istediğiniz zaman değiştirebilirsiniz. İzni geri " +
            "almak bu sitedeki Google çerezlerini siler ve Google Analytics'i durdurur.",
        ],
      },
      {
        title: "Taramaya katılan servisler",
        paragraphs: [
          "Tarama sırasında GiTRay'in sunucusu şu servislere bağlanır. Bu servisler sizinle ilgili değil, yalnızca " +
            "taranan repoyla ilgili bilgi alır:",
          "GitHub: reponun bilgileri ve dosyaları GitHub'ın API'sinden ve indirme sunucularından okunur.",
          "OSV (osv.dev): bilinen zararlı paketleri aramak için reponun bağımlı olduğu paketlerin adları ve sürümleri.",
          "VirusTotal: yalnızca programların ve release dosyalarının SHA-256 parmak izleri. Hiçbir dosya yüklenmez.",
          "Raporlardaki GitHub ve VirusTotal linkleri sizi o sitelere götürür; orada kendi gizlilik politikaları " +
            "geçerlidir.",
        ],
      },
      {
        title: "Barındırma",
        paragraphs: [
          "Site {vercel} üzerinde çalışır; tarama sonuçları ve hız sınırı sayaçları {neon} üzerindeki bir Postgres " +
            "veritabanında tutulur. Vercel, kendi politikası çerçevesinde IP adreslerini de içeren standart istek " +
            "loglarını tutabilir. Yazı tipleri bu siteden gelir. Tek üçüncü taraf script Google Analytics'tir ve " +
            "yalnızca kabul ettikten sonra yüklenir.",
        ],
      },
      {
        title: "Değişiklikler",
        paragraphs: ["Bu politika değişirse en üstteki tarih de değişir."],
      },
    ],
  },

  terms: {
    metaTitle: "Kullanım şartları",
    metaDescription: "GiTRay'i kullanma şartları ve sonuçlarının nasıl okunacağı.",
    title: "Kullanım şartları",
    updated: "Son güncelleme: {date}",
    intro:
      "GiTRay'i kullanarak bu şartları kabul etmiş olursunuz. Şartlar kısa, çünkü hizmet basit: ücretsizdir, hesap " +
      "yoktur ve yalnızca herkese açık GitHub repolarını okur.",
    sections: [
      {
        title: "Hizmet",
        paragraphs: [
          "GiTRay ücretsiz ve ticari olmayan bir projedir; olduğu gibi ve erişilebilir olduğu sürece sunulur. Haber " +
            "verilmeden değişebilir, yavaşlayabilir ya da durabilir.",
          "Site, kodu ve tasarımı geliştiricisine aittir. Tüm hakları saklıdır.",
        ],
      },
      {
        title: "Sonuçlar nasıl okunmalı",
        paragraphs: [
          "Sonuçlar, bilinen zararlı yazılım hilelerini arayan kurallar tarafından otomatik üretilir. Bir güvenlik " +
            "denetimi ya da garanti değildir. Temiz kararı bir reponun güvenli olduğunu kanıtlamaz ve GiTRay taradığı " +
            "kodu çalıştırmaz.",
          "Tehlikeli kararı ya da Tehlikeli listesinde yer almak, tek bir commit'teki dosyaların otomatik bir " +
            "değerlendirmesidir. Reponun arkasındaki kişiler hakkında bir ifade değildir ve yanlış olabilir: güvenlik " +
            "araçları ve zararlı yazılım araştırmaları çoğu zaman GiTRay'in aradığı kalıpları içerir. Bulguları " +
            "karar vermeden önce okuyun.",
          "Neyi klonlayacağınıza, kuracağınıza ya da çalıştıracağınıza siz karar verirsiniz ve bu kararın " +
            "sorumluluğu size aittir.",
        ],
      },
      {
        title: "Repolar ve içerikleri",
        paragraphs: [
          "Yalnızca herkese açık GitHub repoları taranabilir. İçerikleri sahiplerine aittir. Raporlar, yalnızca bir " +
            "bulguyu açıklamak için dosyalardan zararsız hale getirilmiş ve GitHub'daki aslına bağlanan kısa " +
            "alıntılar gösterir.",
        ],
      },
      {
        title: "Adil kullanım",
        paragraphs: [
          "GiTRay sınırlı bir GitHub ve VirusTotal kotasını tüm ziyaretçiler arasında paylaştırır; bu yüzden " +
            "taramalar ziyaretçi başına ve saatlik olarak sınırlıdır. Scriptlerle toplu tarama yapmayın, sınırları " +
            "aşmaya çalışmayın, hizmete saldırmayın, onu aşırı yüklemeyin ya da yoklamayın. /api/scan adresindeki " +
            "JSON API'si aynı sınırlar içinde kişisel ve ticari olmayan kullanım için açıktır.",
        ],
      },
      {
        title: "Sorumluluk",
        paragraphs: [
          "Yasaların izin verdiği ölçüde GiTRay ve geliştiricisi, sitenin kullanılmasından ya da sonuçlarına " +
            "güvenilmesinden doğan hiçbir zarardan sorumlu değildir; Temiz kararından sonra zararlı çıkan bir repo da " +
            "buna dahildir.",
        ],
      },
      {
        title: "Değişiklikler",
        paragraphs: ["Bu şartlar değişebilir; en üstteki tarih son sürümü gösterir."],
      },
    ],
  },

  notFound: {
    title: "Sayfa bulunamadı",
    text: "Böyle bir sayfa yok ya da bu geçerli bir GitHub repo adresi değil.",
    link: "Bir repo tara",
  },

  rules: {
    "GR-AUTO-001": {
      title: "package.json kurulumda bir script çalıştırıyor",
      why:
        'npm, yaşam döngüsü scriptlerini (preinstall, postinstall, ...) "npm install" sırasında, siz hiçbir şeyi ' +
        "kullanmadan ya da incelemeden önce kendiliğinden çalıştırır. Zararlı paketler ve repolar bunu geliştiricinin " +
        "bilgisayarında kod çalıştırmak için kullanır.",
    },
    "GR-AUTO-002": {
      title: "setup.py komut çalıştırıyor ya da ağa bağlanıyor",
      why:
        "pip, paket kaynak koddan kurulurken setup.py'yi çalıştırır. Derleyici sürümünü okumak olağandır; ama orada " +
        "veri indirmek, indirme araçlarını çalıştırmak ya da çözülmüş kodu yürütmek, kurulumda bir zararlı yükün " +
        "çalışması demektir.",
    },
    "GR-AUTO-003": {
      title: "VS Code görevi klasör açılınca çalışıyor",
      why:
        '"runOn": "folderOpen" ayarlı bir görev, repo VS Code\'da açıldığında (çalışma alanına güvenildikten sonra) ' +
        'kendiliğinden başlar. Sahte iş görüşmesi ve "ev ödevi" repoları bunu geliştiricilerin bilgisayarında zararlı ' +
        "yazılım çalıştırmak için kullanır.",
    },
    "GR-AUTO-004": {
      title: "Visual Studio projesi derlemede komut çalıştırıyor",
      why:
        "Build olayları ve Exec görevleri, proje Visual Studio'da derlenir derlenmez komut çalıştırır. Güvenlik " +
        "araştırmacılarını hedef alan saldırılarda, build olayı PowerShell başlatıp arka kapı kuran proje dosyaları " +
        "dağıtıldı.",
    },
    "GR-AUTO-005": {
      title: "Rust build scripti komut çalıştırıyor ya da indirme yapıyor",
      why:
        "Cargo, crate'i derlemeden önce build.rs'yi derleyip çalıştırır; yani \"cargo build\" sırasında ve açılışta " +
        "derleme yapan IDE'lerde çalışır. git ya da pkg-config çağırmak normaldir; indirme yapmak ya da PowerShell " +
        "başlatmak zararlı crate'lerin yük taşıma yoludur.",
    },
    "GR-CI-001": {
      title: "CI ayarı indirileni doğrudan kabuğa veriyor",
      why:
        "CI ayarı bir script indirip derleme sunucusunda çalıştırıyor (GitHub Actions, GitLab CI, Azure Pipelines, " +
        "...). Orası repoyu klonlayan kişinin bilgisayarı değildir, o yüzden az puan alır; yine de o adresi kim " +
        "kontrol ediyorsa derlemeyi de o kontrol eder.",
    },
    "GR-AUTO-006": {
      title: "Dev container bilgisayarınızda komut çalıştırıyor",
      why:
        "initializeCommand konteynerin içinde değil, sizin bilgisayarınızda çalışır: VS Code'da \"Reopen in " +
        'Container" seçtiğiniz ya da dev container\'ı başka bir araçla başlattığınız anda. Orada bir şey indiren ya da ' +
        "çözen komut bir kurulum adımı değil, zararlı yüktür.",
    },
    "GR-AUTO-007": {
      title: "Editör ayarları repodaki bir programı çalıştırıyor",
      why:
        "git.path, php.validate.executablePath ya da bir terminal profili gibi çalışma alanı ayarları VS Code'a hangi " +
        "programı başlatacağını söyler. Bunlar repodaki bir dosyayı gösteriyorsa VS Code, klasör açılıp güvenilir " +
        "sayıldığı anda saldırganın programını çalıştırır.",
    },
    "GR-AUTO-008": {
      title: "Yapay zekâ kod asistanı kendiliğinden komut çalıştırıyor",
      why:
        "Claude Code, Cursor ve Gemini CLI, projenin ayarlarındaki hook komutlarını kendiliğinden (örneğin oturum " +
        "başlarken) çalıştırır ve projenin tanımladığı MCP sunucularını başlatır. Zehirli bir repoyu yapay zekâ " +
        "asistanıyla açmak onun komutlarını çalıştırır.",
    },
    "GR-AUTO-009": {
      title: "npm ayarı her scripte kod enjekte ediyor",
      why:
        "Projedeki .npmrc, o klasörde çalışan her npm komutuna uygulanır. --require ya da --import içeren " +
        "node-options, npm'in başlattığı her Node sürecine bir dosya yükler; script-shell ise her scripti çalıştıran " +
        "kabuğun yerine geçer. Tek bir npm install ya da npm test onu çalıştırır.",
    },
    "GR-AUTO-010": {
      title: "direnv dosyası kod indiriyor",
      why:
        'direnv, "direnv allow" ile izin verdikten sonra terminalde klasöre her girişinizde .envrc\'yi çalıştırır. ' +
        "Değişken tanımlamak normaldir; orada uzaktan bir script indirmek, görmediğiniz kodu her cd'de çalıştırır.",
    },
    "GR-CODE-001": {
      title: "Gizlenmiş kodu çözüp çalıştırıyor",
      why:
        "Kod çözülüyor (base64, hex, zlib, ...) ve doğrudan bir yorumlayıcıya veriliyor. Meşru projeler çalıştırdıkları " +
        "şeyi nadiren gizler; zararlı yazılım bunu inceleyenleri ve tarayıcıları atlatmak için yapar.",
    },
    "GR-CODE-002": {
      title: "Bir script indirip doğrudan kabuğa veriyor",
      why:
        "Uzaktaki bir script indirilip kaydedilmeden ya da incelenmeden hemen çalıştırılıyor. O adresi kim kontrol " +
        "ediyorsa bilgisayarınızı da o kontrol eder.",
    },
    "GR-CODE-003": {
      title: "Tarayıcının şifre ya da çerez dosyalarını okuyor",
      why:
        "Tarayıcıların kayıtlı şifreleri, çerezleri ve bunları çözen anahtarları tuttuğu dosyalara başvuruyor. Bilgi " +
        "çalan zararlı yazılımlar tam olarak bu dosyaların peşindedir.",
    },
    "GR-CODE-004": {
      title: "SSH özel anahtarlarını okuyor",
      why:
        "SSH özel anahtarlarına ya da authorized_keys dosyasına başvuruyor. Çalınan özel anahtarlar sunuculara ve " +
        "GitHub'a erişim sağlar; authorized_keys'e yazmak arka kapı kurar.",
    },
    "GR-CODE-005": {
      title: "Kripto cüzdan dosyalarını okuyor",
      why:
        "Cüzdan dosyalarına, cüzdan uygulamalarının klasörlerine ya da cüzdan tarayıcı eklentilerine başvuruyor. Kripto " +
        "çalan zararlı yazılımlar tam olarak bunları arar.",
    },
    "GR-CODE-006": {
      title: "Discord webhook'una ya da Telegram botuna veri gönderiyor",
      why:
        "Koda gömülü bir Discord webhook'u ya da Telegram bot token'ı, bilgi çalan zararlı yazılımların çalınan şifre, " +
        "çerez ve dosyaları saldırgana göndermesinin en yaygın yoludur: sunucu bile gerekmez.",
    },
    "GR-CODE-007": {
      title: "Windows araçlarıyla indiriyor, saklanıyor ya da kalıcı oluyor",
      why:
        "Windows'un kendi programları (certutil, bitsadmin, mshta, rundll32, regsvr32) zararlı yük indirip " +
        "çalıştırabilir; Defender istisnaları, gizli PowerShell pencereleri ve Run anahtarlarına yazmak da zararlı yazılımın " +
        "saklanma ve yeniden başlatmadan sağ çıkma yoludur. Normal projelerin bunlara neredeyse hiç ihtiyacı olmaz.",
    },
    "GR-CODE-008": {
      title: "Bir dosyanın içeriğini çalıştırıyor",
      why:
        "Kod başka bir dosyayı okuyup çalıştırıyor. Sürüm dosyasını böyle okumak eski bir Python alışkanlığıdır; ama " +
        "Markdown, metin ya da resim dosyası çalıştırmak, asıl yükün inceleyenlerin ve tarayıcıların zararsız veri " +
        "saydığı bir yere saklandığı anlamına gelir.",
    },
    "GR-OBF-001": {
      title: "Uzun, rastgele görünen metin (saklı yük olabilir)",
      why:
        "Rastgele görünen uzun metinler, çalışırken çözülen kodlanmış ya da şifrelenmiş yüklerin tipik görüntüsüdür. " +
        "Zararsız veri de olabilirler (anahtarlar, fontlar, test verileri), bu yüzden tek başına zayıf bir işarettir.",
    },
    "GR-OBF-002": {
      title: "Kodda görünmez yön değiştirme karakterleri",
      why:
        "Unicode yön değiştirme karakterleri kodun, derleyicinin okuduğundan farklı bir sırada görünmesini sağlar " +
        '("Trojan Source", CVE-2021-42574): inceleyen kişi bir yorum görürken yorumlayıcı bir komut çalıştırır. Sağdan ' +
        "sola yazı düz metinde sorun değildir, kodun içinde asla.",
    },
    "GR-OBF-003": {
      title: "Satırın çok sağına saklanmış kod",
      why:
        "Yüzlerce boşluk kodu ekranın dışına iter; GitHub ve editörler masum görünen bir satır gösterirken saklı kısım " +
        "çalışır. Sahte GitHub projeleri, yükleyicileri çalışan kodun içine böyle kaçırır.",
    },
    "GR-OBF-004": {
      title: "Veri ya da kod saklayan görünmez Unicode karakterler",
      why:
        "Uzun varyasyon seçici, etiket ya da sıfır genişlikli karakter dizileri hiçbir şey göstermez ama koca bir " +
        "programı taşıyabilir; son tedarik zinciri solucanları yükleyicilerini böyle sakladı. Boş görünen Hangul dolgu " +
        "karakterleri de görünmez değişken adı olarak kullanılabilir.",
    },
    "GR-LINK-001": {
      title: "Program ya da arşiv indirme linki",
      why:
        "Zararlı repolar ziyaretçiyi, gördükleri kodu derlemek yerine bir arşive ya da programa yönlendirir. Reponun " +
        "kendi release dosyaları ve kaynak arşivi muaftır; diğer GitHub repoları dahil geri kalan her şey sayılır.",
    },
    "GR-LINK-002": {
      title: "Link kısaltıcı gerçek adresi saklıyor",
      why:
        "Kısaltılmış ya da reklam geçişli bir link nereye gittiğini saklar ve hedefi incelemeden sonra her an " +
        "değiştirilebilir. Sahte indirme sayfaları buna dayanır.",
    },
    "GR-LINK-003": {
      title: "Dosya paylaşım sitesinden indirme",
      why:
        "Dosya paylaşım siteleri (MediaFire, MEGA, Google Drive, Dropbox, Discord ekleri, ...) kimsenin incelemediği ve " +
        "her an değiştirilebilen dosyalar barındırır. Sizi kendi release'leri yerine oraya gönderen bir kaynak kod " +
        "reposu klasik bir tuzaktır.",
    },
    "GR-LINK-004": {
      title: "Arşiv için şifre verilmiş",
      why:
        "Şifreli bir arşivi antivirüs, GitHub ya da bu tarayıcı açamaz. Şifreyi indirme linkinin yanında yayımlamak, " +
        "zararlı yazılımın her tarayıcıyı atlatıp yine de kurbana ulaşma yoludur.",
    },
    "GR-SOC-001": {
      title: "Antivirüsünüzü kapatmanızı istiyor",
      why:
        "Kullanıcılara Windows Defender'ı kapatmalarını, istisna eklemelerini ya da bir \"yanlış alarmı\" görmezden " +
        "gelmelerini söylemek sahte hile, crack ve araç repolarının imzasıdır: yoksa indirilen dosya engellenirdi.",
    },
    "GR-SOC-002": {
      title: "Zararlı yazılım aracı satıyor",
      why:
        "README bir zararlı yazılım dükkânı: RAT ve fidye yazılımı oluşturucular, crypter'lar, stealer'lar; ödeme WhatsApp, " +
        "Telegram ya da bir mağaza linki üzerinden. Bunları başkalarına karşı kullanmak suçtur, satılan kopyalar da çoğu zaman " +
        "kendisi virüslüdür ya da hiç teslim edilmez.",
    },
    "GR-BEH-001": {
      title: "Kayıtlı kimlik bilgilerini okuyup dışarı gönderiyor",
      why:
        "Kod bir tarayıcı şifre deposunu, kripto cüzdanını, SSH anahtarını ya da başka kayıtlı kimlik bilgilerini " +
        "okuyup bu veriyi ağ üzerinden gönderiyor. Veriyi okuduğu dosyadan gönderdiği isteğe kadar izlemek, bir bilgi " +
        "hırsızını, sırlarınızı hiçbir yere göndermeyen bir şifre yöneticisinden ayıran şeydir.",
    },
    "GR-BEH-002": {
      title: "Kod indirip çalıştırıyor",
      why:
        "Kod ağdan içerik çekip doğrudan bir yorumlayıcıya veriyor (eval, Function, Invoke-Expression, Assembly.Load). " +
        "O adresi kontrol eden, bilgisayarı kontrol eder ve repoyu inceleyen kimse gerçekte ne çalıştığını göremez.",
    },
    "GR-BEH-003": {
      title: "Gizli bir bloğu çözüp çalıştırıyor",
      why:
        "Kod base64 ya da sıkıştırılmış bir bloğu çözüp sonucu çalıştırıyor. Meşru projeler çalıştırdıkları kodu nadiren " +
        "gizler; bu, yalnızca anlaşılmaz bir dizge gören bir inceleyiciyi atlatmanın yoludur.",
    },
    "GR-BIN-001": {
      title: "Repoya program dosyası eklenmiş",
      why:
        "Kaynak kod reposundaki hazır bir program kod gibi incelenemez: GitHub'da gördüğünüz şey çalışan şey değildir. " +
        "Sahte projeler yükü böyle taşır, çoğu zaman hiçbir şey yapmayan kaynak kodun yanında. Windows kısayol (.lnk) " +
        "dosyaları da yaygın bir zararlı yazılım başlatıcısıdır.",
    },
    "GR-BIN-002": {
      title: "Repoda şifreli arşiv var",
      why:
        "Şifreli bir arşivi GitHub, antivirüs ya da bu tarayıcı inceleyemez. Meşru projelerin böyle bir dosya eklemesi " +
        "için sebep yoktur; zararlı yazılım bunu her tarayıcıdan sıyrılmak için yapar.",
    },
    "GR-BIN-003": {
      title: "Antivirüs motorları bir dosyayı yakalıyor (VirusTotal)",
      why:
        "VirusTotal dosyaları yaklaşık 70 antivirüs motorundan geçirir. SHA-256 parmak iziyle eşleşen bu dosyayı " +
        "(hiçbir şey indirilmez ya da çalıştırılmaz) bazıları yakalıyor. Beş ya da daha fazla motor, bilinen zararlı " +
        "yazılım demektir. Birkaç motorun yakalaması kurulum dosyalarında ve küçük başlatıcılarda sık görülen bir yanlış " +
        "alarmdır, o yüzden az puan alır.",
    },
    "GR-DEP-001": {
      title: "Bilinen zararlı bir pakete bağımlı",
      why:
        "Reponun kendi kodu temiz olabilir ama npm install ya da pip install, güvenlik araştırmacılarının zararlı " +
        "olduğunu doğruladığı bir paketi indirebilir (OpenSSF malicious-packages verisi, OSV üzerinden). Bağımlılıkları " +
        "kurmak onu çalıştırır. Sahte iş görüşmesi projeleri ve isim taklidi yapan paketler bilgi çalan yazılımları " +
        "böyle ulaştırır.",
    },
    "GR-REPO-001": {
      title: "Sahip hesabı yepyeni",
      why:
        "Sahte repolar genellikle birkaç gün önce açılmış ve şikâyet edilince terk edilen hesaplardan yüklenir. Yeni " +
        "hesap tek başına sorun değildir ama diğer bulgulara ağırlık katar.",
    },
    "GR-REPO-003": {
      title: "Dosyalar GitHub'ın indirme arşivinden çıkarılmış",
      why:
        "Bir .gitattributes export-ignore kuralı bu dosyaları GitHub'ın verdiği arşivin dışında tutar ama \"git " +
        'clone" onları yine getirir. Paketler bunu çoğunlukla testleri çıkarmak için kullanır; ama arşivi okuyan ' +
        "tarayıcılardan bir yükü saklamanın da yoludur. GiTRay bu dosyaları ayrıca indirip diğerleri gibi tarar.",
    },
  },
};
