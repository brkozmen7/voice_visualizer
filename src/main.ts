import './style.css';
import { VoiceVisualizer } from './visualizer';
import type { AudioSource } from './visualizer';

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('visualizer-canvas') as HTMLCanvasElement;
  if (!canvas) return;

  const visualizer = new VoiceVisualizer(canvas);

  // ── UI element references ──────────────────────────────────────────────────
  const btnToggleUI      = document.getElementById('btn-toggle-ui')      as HTMLButtonElement;
  const btnToggleCapture = document.getElementById('btn-toggle-capture') as HTMLButtonElement;
  const srcMic           = document.getElementById('src-mic')            as HTMLButtonElement;
  const srcSystem        = document.getElementById('src-system')         as HTMLButtonElement;
  const srcBoth          = document.getElementById('src-both')           as HTMLButtonElement;
  const systemNotice     = document.getElementById('system-notice')      as HTMLParagraphElement;
  const sliderSens       = document.getElementById('slider-sensitivity') as HTMLInputElement;
  const valSens          = document.getElementById('val-sensitivity')    as HTMLSpanElement;

  const barBass = document.getElementById('bar-bass') as HTMLDivElement;
  const barMid  = document.getElementById('bar-mid')  as HTMLDivElement;
  const barHigh = document.getElementById('bar-high') as HTMLDivElement;
  const barFreq = document.getElementById('bar-freq') as HTMLDivElement;
  const barVol  = document.getElementById('bar-vol')  as HTMLDivElement;
  const txtBass = document.getElementById('txt-bass') as HTMLSpanElement;
  const txtMid  = document.getElementById('txt-mid')  as HTMLSpanElement;
  const txtHigh = document.getElementById('txt-high') as HTMLSpanElement;
  const txtFreq = document.getElementById('txt-freq') as HTMLSpanElement;
  const txtVol  = document.getElementById('txt-vol')  as HTMLSpanElement;

  // ── State ──────────────────────────────────────────────────────────────────
  let activeSource: AudioSource = 'mic';

  // ── Zen mode toggle ────────────────────────────────────────────────────────
  btnToggleUI.addEventListener('click', () => {
    document.body.classList.toggle('ui-collapsed');
  });

  // ── Source selection ───────────────────────────────────────────────────────
  const sourceButtons = [
    { btn: srcMic,    source: 'mic'    as AudioSource, needsSystem: false },
    { btn: srcSystem, source: 'system' as AudioSource, needsSystem: true  },
    { btn: srcBoth,   source: 'both'   as AudioSource, needsSystem: true  },
  ];

  const setSource = async (source: AudioSource) => {
    if (activeSource === source && !visualizer.isCapturing) return;
    activeSource = source;

    // Update active state on buttons
    sourceButtons.forEach(({ btn, source: btnSrc }) => {
      btn.classList.toggle('active', btnSrc === source);
    });

    // Show/hide system notice
    const needsSystem = source === 'system' || source === 'both';
    systemNotice.classList.toggle('hidden', !needsSystem);

    // If already capturing, restart with new source
    if (visualizer.isCapturing) {
      await doStart();
    }
  };

  sourceButtons.forEach(({ btn, source }) => {
    btn.addEventListener('click', () => setSource(source));
  });

  // ── Start / Stop ───────────────────────────────────────────────────────────
  const doStart = async () => {
    btnToggleCapture.disabled = true;
    const txtEl = btnToggleCapture.querySelector('.btn-text')!;
    txtEl.textContent = 'Bağlanıyor…';

    try {
      await visualizer.start(activeSource);
      setCaptureUI(true);
      // Auto-collapse UI after a short delay so the user can enjoy the visual
      setTimeout(() => {
        if (visualizer.isCapturing) document.body.classList.add('ui-collapsed');
      }, 1400);
    } catch (err: any) {
      console.error('Ses yakalama hatası:', err);
      alert(`Hata: ${err.message || err}`);
      setCaptureUI(false);
    } finally {
      btnToggleCapture.disabled = false;
    }
  };

  btnToggleCapture.addEventListener('click', async () => {
    if (visualizer.isCapturing) {
      visualizer.stop();
      setCaptureUI(false);
      document.body.classList.remove('ui-collapsed');
    } else {
      await doStart();
    }
  });

  // ── Sensitivity ────────────────────────────────────────────────────────────
  sliderSens.addEventListener('input', () => {
    const v = parseFloat(sliderSens.value);
    visualizer.sensitivity = v;
    valSens.textContent = `${v.toFixed(1)}×`;
  });

  // ── Style / Theme ──────────────────────────────────────────────────────────
  const themeMap: Record<string, { bodyClass: string }> = {
    classic: { bodyClass: '' },
    neon:    { bodyClass: 'neon-theme' },
    sunset:  { bodyClass: 'sunset-theme' },
    cyber:   { bodyClass: 'cyber-theme' },
    gold:    { bodyClass: 'gold-theme' },
  };

  document.querySelectorAll<HTMLButtonElement>('.btn-style').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-style').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Clear all theme classes
      Object.values(themeMap).forEach(({ bodyClass }) => {
        if (bodyClass) document.body.classList.remove(bodyClass);
      });

      const style = btn.dataset['style'] as keyof typeof themeMap;
      const { bodyClass } = themeMap[style] ?? { bodyClass: '' };
      if (bodyClass) document.body.classList.add(bodyClass);
      visualizer.style = style as any;
    });
  });

  // ── UI state helper ────────────────────────────────────────────────────────
  function setCaptureUI(capturing: boolean) {
    const iconEl = btnToggleCapture.querySelector('.btn-icon')!;
    const txtEl  = btnToggleCapture.querySelector('.btn-text')!;
    btnToggleCapture.classList.toggle('btn-recording', capturing);
    iconEl.textContent = capturing ? '■' : '▶';
    txtEl.textContent  = capturing ? 'Durdur' : 'Başlat';
  }

  // ── Resize ─────────────────────────────────────────────────────────────────
  window.addEventListener('resize', () => visualizer.resize());

  // ── Clock & Date & Greeting ────────────────────────────────────────────────
  function updateTime() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const clockEl = document.getElementById('clock-time');
    if (clockEl) {
      clockEl.innerHTML = `${hh}:${mm}<span class="seconds">${ss}</span>`;
    }

    const dateEl = document.getElementById('clock-date');
    if (dateEl) {
      const options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' };
      dateEl.textContent = now.toLocaleDateString('tr-TR', options);
    }
    
    // Update Greeting hourly
    const hours = now.getHours();
    let greet = 'İyi Geceler';
    if (hours >= 5 && hours < 12) greet = 'Günaydın';
    else if (hours >= 12 && hours < 18) greet = 'Tünaydın';
    else if (hours >= 18 && hours < 23) greet = 'İyi Akşamlar';
    
    const greetEl = document.getElementById('weather-greeting');
    if (greetEl) {
      greetEl.textContent = `${greet}, BURAK`;
    }
  }
  setInterval(updateTime, 1000);
  updateTime();

  // ── Weather (Gaziantep) ────────────────────────────────────────────────────
  function getWeatherIcon(code: number): string {
    if (code === 0) return '☀️'; // Sunny
    if (code >= 1 && code <= 3) return '🌤️'; // Partly cloudy
    if (code === 45 || code === 48) return '🌫️'; // Fog
    if (code >= 51 && code <= 67) return '🌧️'; // Rain
    if (code >= 71 && code <= 77) return '❄️'; // Snow
    if (code >= 80 && code <= 82) return '🌦️'; // Showers
    if (code >= 95 && code <= 99) return '🌩️'; // Thunderstorm
    return '☀️';
  }

  function getWeatherDesc(code: number): string {
    if (code === 0) return 'Açık';
    if (code >= 1 && code <= 3) return 'Parçalı Bulutlu';
    if (code === 45 || code === 48) return 'Sisli';
    if (code >= 51 && code <= 67) return 'Yağmurlu';
    if (code >= 71 && code <= 77) return 'Karlı';
    if (code >= 80 && code <= 82) return 'Sağanak Yağış';
    if (code >= 95 && code <= 99) return 'Fırtına';
    return 'Açık';
  }

  function useFallbackWeather() {
    const tempEl = document.getElementById('weather-temp');
    const iconEl = document.getElementById('weather-icon');
    const descEl = document.getElementById('weather-desc');
    const rangeEl = document.getElementById('weather-range');
    
    if (tempEl) tempEl.textContent = '33°C';
    if (iconEl) iconEl.textContent = '☀️';
    if (descEl) descEl.textContent = 'Açık';
    if (rangeEl) rangeEl.textContent = '↓ 18°C  ↑ 35°C';

    const now = new Date();
    let currentHour = now.getHours();
    let count = 0;
    let hourToCheck = currentHour + 1;
    
    while (count < 3) {
      if (hourToCheck % 2 === 0) {
        const displayHour = hourToCheck % 24;
        const ampm = displayHour >= 12 ? 'PM' : 'AM';
        let hour12 = displayHour % 12;
        hour12 = hour12 ? hour12 : 12;
        
        const timeEl = document.getElementById(`forecast-time-${count}`);
        const fIconEl = document.getElementById(`forecast-icon-${count}`);
        const fTempEl = document.getElementById(`forecast-temp-${count}`);
        
        if (timeEl) timeEl.textContent = `${hour12} ${ampm}`;
        if (fIconEl) fIconEl.textContent = '☀️';
        if (fTempEl) fTempEl.textContent = `${32 - count * 2}°`;
        
        count++;
      }
      hourToCheck++;
    }
  }

  async function updateWeather() {
    try {
      const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=37.0662&longitude=37.3833&current=temperature_2m,weather_code&hourly=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto');
      if (!res.ok) throw new Error('API error');
      const data = await res.json();

      const currentTemp = Math.round(data.current.temperature_2m);
      const currentCode = data.current.weather_code;

      const tempEl = document.getElementById('weather-temp');
      const iconEl = document.getElementById('weather-icon');
      const descEl = document.getElementById('weather-desc');
      const rangeEl = document.getElementById('weather-range');

      if (tempEl) tempEl.textContent = `${currentTemp}°C`;
      if (iconEl) iconEl.textContent = getWeatherIcon(currentCode);
      if (descEl) descEl.textContent = getWeatherDesc(currentCode);
      
      if (rangeEl && data.daily && data.daily.temperature_2m_min && data.daily.temperature_2m_max) {
        const minTemp = Math.round(data.daily.temperature_2m_min[0]);
        const maxTemp = Math.round(data.daily.temperature_2m_max[0]);
        rangeEl.textContent = `↓ ${minTemp}°C   ↑ ${maxTemp}°C`;
      }

      const currentHourStr = data.current.time;
      const hourlyTimes = data.hourly.time;
      const startIndex = hourlyTimes.findIndex((t: string) => t === currentHourStr) || 0;

      const nextEvenForecasts: { timeLabel: string; temp: number; code: number }[] = [];
      let searchIdx = startIndex + 1;
      
      while (nextEvenForecasts.length < 3 && searchIdx < hourlyTimes.length) {
        const timeStr = hourlyTimes[searchIdx];
        const dateObj = new Date(timeStr);
        const hour = dateObj.getHours();
        
        if (hour % 2 === 0) {
          let formattedHour = hour;
          const ampm = formattedHour >= 12 ? 'PM' : 'AM';
          formattedHour = formattedHour % 12;
          formattedHour = formattedHour ? formattedHour : 12;
          
          nextEvenForecasts.push({
            timeLabel: `${formattedHour} ${ampm}`,
            temp: Math.round(data.hourly.temperature_2m[searchIdx]),
            code: data.hourly.weather_code[searchIdx]
          });
        }
        searchIdx++;
      }

      nextEvenForecasts.forEach((forecast, i) => {
        const timeEl = document.getElementById(`forecast-time-${i}`);
        const fIconEl = document.getElementById(`forecast-icon-${i}`);
        const fTempEl = document.getElementById(`forecast-temp-${i}`);

        if (timeEl) timeEl.textContent = forecast.timeLabel;
        if (fIconEl) fIconEl.textContent = getWeatherIcon(forecast.code);
        if (fTempEl) fTempEl.textContent = `${forecast.temp}°`;
      });
    } catch (err) {
      console.error('Weather fetch error:', err);
      useFallbackWeather();
    }
  }

  // Update weather initially and every 15 minutes
  updateWeather();
  setInterval(updateWeather, 15 * 60 * 1000);

  // ── News Ticker (Haber Akışı) ──────────────────────────────────────────────
  const headlines = [
    {
      text: "TBMM Genel Kurulu'nda yeni ekonomi ve sanayi teşvik reform paketi görüşülmeye başlandı.",
      img: "https://images.unsplash.com/photo-1541872703-74c5e44368f9?w=120&h=120&fit=crop&q=80"
    },
    {
      text: "Yapay zeka modelleri artık insan beyninin çalışma prensiplerini taklit ediyor.",
      img: "https://images.unsplash.com/photo-1677442136019-21780efad99a?w=120&h=120&fit=crop&q=80"
    },
    {
      text: "Dışişleri Bakanlığı, Doğu Akdeniz'deki enerji iş birliği anlaşmalarına ilişkin son durumu paylaştı.",
      img: "https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=120&h=120&fit=crop&q=80"
    },
    {
      text: "James Webb Teleskobu, evrenin ilk oluşum dönemine ait yeni galaksiler keşfetti.",
      img: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=120&h=120&fit=crop&q=80"
    },
    {
      text: "Cumhurbaşkanlığı Kabinesi, bölgesel güvenlik ve dış ilişkiler gündemiyle Beştepe'de toplandı.",
      img: "https://images.unsplash.com/photo-1590856029826-c7a73142bbf1?w=120&h=120&fit=crop&q=80"
    },
    {
      text: "Gaziantep Teknopark'ta yerli ve milli batarya teknolojileri geliştiriliyor.",
      img: "https://images.unsplash.com/photo-1548345680-f5475ea5df84?w=120&h=120&fit=crop&q=80"
    },
    {
      text: "Türkiye ile AB arasında vize muafiyeti ve gümrük birliği güncelleme görüşmelerinde yeni tur başladı.",
      img: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=120&h=120&fit=crop&q=80"
    },
    {
      text: "Elektrikli araç bataryalarında şarj süresini 5 dakikaya indiren yeni yöntem.",
      img: "https://images.unsplash.com/photo-1563720223185-11003d516935?w=120&h=120&fit=crop&q=80"
    },
    {
      text: "Çevre ve Şehircilik Bakanlığı, akıllı şehir projeleri için belediyelere yeni fon desteğini açıkladı.",
      img: "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=120&h=120&fit=crop&q=80"
    },
    {
      text: "Kuantum bilgisayarlar şifreleme algoritmalarını kırmak için yeni aşamaya geçti.",
      img: "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=120&h=120&fit=crop&q=80"
    },
    {
      text: "Mars prototipleri için fırlatma testleri bu akşam başarıyla tamamlandı.",
      img: "https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?w=120&h=120&fit=crop&q=80"
    },
    {
      text: "Gökbilimciler, güneş sistemimize en yakın yaşanabilir ötegezegeni incelemeye aldı.",
      img: "https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?w=120&h=120&fit=crop&q=80"
    },
    {
      text: "Gaziantep'te dijital sanatlar ve ses görselleştirme festivali düzenleniyor.",
      img: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=120&h=120&fit=crop&q=80"
    },
    {
      text: "Yeni nesil füzyon reaktörü temiz enerji üretiminde rekor süreye ulaştı.",
      img: "https://images.unsplash.com/photo-1461360370896-922624d12aa1?w=120&h=120&fit=crop&q=80"
    },
    {
      text: "Grafen tabanlı mikroçipler silikon yarı iletkenlerin yerini almaya hazırlanıyor.",
      img: "https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?w=120&h=120&fit=crop&q=80"
    },
    {
      text: "Nöroteknoloji şirketi Neuralink, ilk kablosuz beyin implantı testlerini sürdürüyor.",
      img: "https://images.unsplash.com/photo-1507668077129-56e32842fceb?w=120&h=120&fit=crop&q=80"
    },
    {
      text: "Yapay zeka destekli hava durumu tahmin modelleri doğruluk oranını %96'ya çıkardı.",
      img: "https://images.unsplash.com/photo-1534274988757-a28bf1a57c17?w=120&h=120&fit=crop&q=80"
    },
    {
      text: "Gaziantep kalesinde restore edilen alanlar dijital müze konseptiyle açılıyor.",
      img: "https://images.unsplash.com/photo-1566121318594-a4701229023c?w=120&h=120&fit=crop&q=80"
    }
  ];

  const agendaTrends = [
    [
      { rank: 1, topic: "#TEKNOFEST", count: "48.2K Paylaşım" },
      { rank: 2, topic: "Gaziantep Teknopark", count: "21.5K Paylaşım" },
      { rank: 3, topic: "#MilliTeknolojiHamlesi", count: "19.3K Paylaşım" }
    ],
    [
      { rank: 1, topic: "Yapay Zeka Modelleri", count: "34.6K Paylaşım" },
      { rank: 2, topic: "#UzayVatan", count: "18.1K Paylaşım" },
      { rank: 3, topic: "Yerli Otomobil", count: "16.8K Paylaşım" }
    ],
    [
      { rank: 1, topic: "Kuantum Bilgisayarlar", count: "29.7K Paylaşım" },
      { rank: 2, topic: "#SiberGüvenlik", count: "15.4K Paylaşım" },
      { rank: 3, topic: "Dijital Sanatlar", count: "12.2K Paylaşım" }
    ]
  ];

  let currentHeadlineIndex = 0;
  let currentAgendaIndex = 0;

  function updateAgendaUI(groupIndex: number, isInitial: boolean = false) {
    const listEl = document.getElementById('agenda-list');
    if (!listEl || agendaTrends.length === 0) return;
    
    const safeIndex = groupIndex % agendaTrends.length;
    const trends = agendaTrends[safeIndex];
    const html = trends.map(item => `
      <div class="agenda-item">
        <span class="agenda-rank">${item.rank}</span>
        <div class="agenda-info">
          <span class="agenda-topic">${item.topic}</span>
          <span class="agenda-tweets">${item.count}</span>
        </div>
      </div>
    `).join('');
    
    listEl.innerHTML = html;
    if (isInitial) {
      listEl.style.opacity = '1';
      listEl.style.transform = 'translateY(0)';
      listEl.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    }
  }

  function cycleNews() {
    const textEl = document.getElementById('news-ticker-text');
    const imgEl = document.getElementById('news-img') as HTMLImageElement;
    const agendaListEl = document.getElementById('agenda-list');
    if (!textEl || !imgEl || headlines.length === 0) return;
    
    // Slide out to the top
    textEl.className = 'news-text slide-out';
    imgEl.style.opacity = '0';
    imgEl.style.transform = 'scale(0.9)';
    
    // Fade out agenda list
    if (agendaListEl) {
      agendaListEl.style.opacity = '0';
      agendaListEl.style.transform = 'translateY(-10px)';
      agendaListEl.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    }
    
    setTimeout(() => {
      // Update index
      currentHeadlineIndex = (currentHeadlineIndex + 1) % headlines.length;
      const current = headlines[currentHeadlineIndex];
      textEl.textContent = current.text;
      imgEl.src = current.img;
      
      // Update agenda group
      if (agendaTrends.length > 0) {
        currentAgendaIndex = (currentAgendaIndex + 1) % agendaTrends.length;
        updateAgendaUI(currentAgendaIndex, false);
      }
      
      // Prepare slide in from bottom
      textEl.className = 'news-text slide-in-prepare';
      
      // Reflow browser layout to apply preparation state
      void textEl.offsetWidth;
      
      // Slide in
      textEl.className = 'news-text slide-in';
      imgEl.style.opacity = '1';
      imgEl.style.transform = 'scale(1)';
      
      // Fade in agenda list
      if (agendaListEl) {
        agendaListEl.style.opacity = '1';
        agendaListEl.style.transform = 'translateY(0)';
      }
    }, 400);
  }
  
  // Set initial text & image
  const initialTextEl = document.getElementById('news-ticker-text');
  const initialImgEl = document.getElementById('news-img') as HTMLImageElement;
  if (initialTextEl && initialImgEl && headlines.length > 0) {
    initialTextEl.textContent = headlines[0].text;
    initialImgEl.src = headlines[0].img;
  }
  updateAgendaUI(0, true);

  // ── Real-time Fetch Logic (CORS Proxy with Fallback) ─────────────────────
  async function fetchWithFallback(url: string): Promise<string> {
    const proxies = [
      `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
    ];
    
    for (const proxyUrl of proxies) {
      try {
        const res = await fetch(proxyUrl);
        if (res.ok) {
          return await res.text();
        }
      } catch (e) {
        console.warn(`Proxy fetch failed for ${proxyUrl}:`, e);
      }
    }
    throw new Error(`Failed to fetch ${url} using all proxies`);
  }

  async function fetchRealNews() {
    try {
      const xmlText = await fetchWithFallback('https://www.trthaber.com/sondakika.rss');
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlText, 'text/xml');
      const items = doc.querySelectorAll('item');
      
      const parsedHeadlines: { text: string; img: string }[] = [];
      items.forEach(item => {
        const title = item.querySelector('title')?.textContent || '';
        let imgUrl = item.querySelector('imageUrl')?.textContent || '';
        
        if (!imgUrl) {
          const enclosure = item.querySelector('enclosure');
          if (enclosure) {
            imgUrl = enclosure.getAttribute('url') || '';
          }
        }
        
        if (title) {
          parsedHeadlines.push({
            text: title.trim(),
            img: imgUrl.trim() || 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=120&h=120&fit=crop&q=80'
          });
        }
      });
      
      if (parsedHeadlines.length > 0) {
        headlines.length = 0;
        headlines.push(...parsedHeadlines);
        
        const textEl = document.getElementById('news-ticker-text');
        const imgEl = document.getElementById('news-img') as HTMLImageElement;
        if (textEl && imgEl && headlines.length > 0) {
          currentHeadlineIndex = 0;
          textEl.textContent = headlines[0].text;
          imgEl.src = headlines[0].img;
        }
      }
    } catch (err) {
      console.error('Real news fetch failed, using fallback headlines:', err);
    }
  }

  function formatTraffic(val: string): string {
    const clean = val.replace(/[+,]/g, '').trim();
    const num = parseInt(clean);
    if (isNaN(num)) return val;
    if (num >= 1000000) return `${(num / 1000000).toFixed(0)}M+ Arama`;
    if (num >= 1000) return `${(num / 1000).toFixed(0)}K+ Arama`;
    return `${num}+ Arama`;
  }

  async function fetchRealTrends() {
    try {
      const xmlText = await fetchWithFallback('https://trends.google.com/trending/rss?geo=TR');
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlText, 'text/xml');
      const items = doc.querySelectorAll('item');
      
      const parsedTrends: { rank: number; topic: string; count: string }[] = [];
      items.forEach((item, index) => {
        const title = item.querySelector('title')?.textContent || '';
        const trafficEl = item.querySelector('approx_traffic') || 
                          item.getElementsByTagName('ht:approx_traffic')[0] || 
                          item.getElementsByTagNameNS('*', 'approx_traffic')[0];
        const rawTraffic = trafficEl?.textContent || '100+';
        
        if (title) {
          const topicFormatted = title.trim().split(' ').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1)
          ).join(' ');
          
          parsedTrends.push({
            rank: index + 1,
            topic: topicFormatted.startsWith('#') ? topicFormatted : `#${topicFormatted.replace(/\s+/g, '')}`,
            count: formatTraffic(rawTraffic)
          });
        }
      });
      
      if (parsedTrends.length > 0) {
        const grouped: { rank: number; topic: string; count: string }[][] = [];
        for (let i = 0; i < parsedTrends.length; i += 3) {
          const chunk = parsedTrends.slice(i, i + 3);
          if (chunk.length > 0) {
            grouped.push(chunk);
          }
        }
        
        if (grouped.length > 0) {
          agendaTrends.length = 0;
          agendaTrends.push(...grouped);
          currentAgendaIndex = 0;
          updateAgendaUI(0, true);
        }
      }
    } catch (err) {
      console.error('Real trends fetch failed, using fallback trends:', err);
    }
  }

  // ── Real-time Finance Fetching (1 Minute Refresh) ──────────────────────
  const financeRates = [
    { label: 'USD/TRY', value: '32.84', change: 0.12 },
    { label: 'EUR/TRY', value: '35.15', change: -0.05 },
    { label: 'BTC/USD', value: '65,420', change: 1.45 },
    { label: 'ALTIN(G)', value: '2,450', change: 0.85 }
  ];

  function updateFinanceUI(rates: { label: string; value: string; change: number }[]) {
    const scrollEl = document.querySelector('.finance-scroll');
    if (!scrollEl) return;
    
    const htmlSet = rates.map(item => {
      const isUp = item.change >= 0;
      const trendClass = isUp ? 'up' : 'down';
      const trendArrow = isUp ? '▲' : '▼';
      const changeText = `${trendArrow} ${Math.abs(item.change).toFixed(2)}%`;
      return `
        <span class="finance-item">
          <span class="fin-label">${item.label}</span>
          <span class="fin-val">${item.value}</span>
          <span class="fin-trend ${trendClass}">${changeText}</span>
        </span>
      `;
    }).join('');
    
    // Duplicate for seamless looping animation
    scrollEl.innerHTML = htmlSet + htmlSet;
  }

  async function fetchFinanceRates() {
    let usd = 0;
    let usdChange = 0;
    let eur = 0;
    let eurChange = 0;
    let gold = 0;
    let goldChange = 0;
    let btc = 0;
    let btcChange = 0;
    
    // 1. Fetch currencies and gold from Truncgil
    try {
      const resText = await fetchWithFallback('https://finans.truncgil.com/today.json');
      const data = JSON.parse(resText);
      
      if (data.USD) {
        usd = parseFloat(data.USD.Satış.replace(/\./g, '').replace(/,/g, '.'));
        usdChange = parseFloat(data.USD.Değişim.replace('%', '').replace(/,/g, '.'));
      }
      if (data.EUR) {
        eur = parseFloat(data.EUR.Satış.replace(/\./g, '').replace(/,/g, '.'));
        eurChange = parseFloat(data.EUR.Değişim.replace('%', '').replace(/,/g, '.'));
      }
      if (data['gram-altin']) {
        gold = parseFloat(data['gram-altin'].Satış.replace(/\./g, '').replace(/,/g, '.'));
        goldChange = parseFloat(data['gram-altin'].Değişim.replace('%', '').replace(/,/g, '.'));
      }
    } catch (e) {
      console.warn('Truncgil gold & currency fetch failed, will try next interval:', e);
    }
    
    // 2. Fetch BTC/USD from Binance
    try {
      const res = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT');
      if (res.ok) {
        const data = await res.json();
        btc = parseFloat(data.lastPrice);
        btcChange = parseFloat(data.priceChangePercent);
      }
    } catch (e) {
      console.warn('Binance BTC/USD fetch failed, will try next interval:', e);
    }
    
    // Update local rates array if fetch succeeded
    if (usd > 0) {
      financeRates[0].value = usd.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      financeRates[0].change = usdChange;
    }
    if (eur > 0) {
      financeRates[1].value = eur.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      financeRates[1].change = eurChange;
    }
    if (btc > 0) {
      financeRates[2].value = btc.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
      financeRates[2].change = btcChange;
    }
    if (gold > 0) {
      financeRates[3].value = gold.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      financeRates[3].change = goldChange;
    }
    
    updateFinanceUI(financeRates);
  }

  // Load real-time data on initialization
  fetchRealNews();
  fetchRealTrends();
  fetchFinanceRates();

  // Refresh news & trends every 10 minutes
  setInterval(() => {
    fetchRealNews();
    fetchRealTrends();
  }, 10 * 60 * 1000);

  // Refresh finance rates every 1 minute
  setInterval(fetchFinanceRates, 60 * 1000);

  // Cycle news headlines every 6 seconds
  setInterval(cycleNews, 6000);

  // ── Stats panel (decoupled from render loop) ───────────────────────────────
  function updateStats() {
    const { bass, mid, high, vol, pitch } = visualizer.stats;
    barBass.style.width = `${bass * 100}%`;
    barMid.style.width  = `${mid  * 100}%`;
    barHigh.style.width = `${high * 100}%`;

    // Scale pitch (80Hz to 1200Hz human range)
    const pitchPct = Math.min(1, Math.max(0, (pitch - 80) / 1120));
    barFreq.style.width = `${pitchPct * 100}%`;

    barVol.style.width  = `${vol  * 100}%`;
    txtBass.textContent  = bass.toFixed(2);
    txtMid.textContent   = mid.toFixed(2);
    txtHigh.textContent  = high.toFixed(2);
    txtFreq.textContent  = pitch > 0 ? `${Math.round(pitch)} Hz` : '0 Hz';
    txtVol.textContent   = vol.toFixed(2);
    requestAnimationFrame(updateStats);
  }
  updateStats();
});
