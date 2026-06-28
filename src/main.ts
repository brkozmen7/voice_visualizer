import './style.css';
import { createClient } from '@supabase/supabase-js';

document.addEventListener('DOMContentLoaded', () => {
  // ── UI element references (all cached once at startup) ────────────────────
  const btnToggleUI      = document.getElementById('btn-toggle-ui')      as HTMLButtonElement;

  // ── Cached weather DOM refs (avoids repeated getElementById in hot path) ───
  const elWeatherTemp    = document.getElementById('weather-temp')      as HTMLSpanElement;
  const elWeatherIcon    = document.getElementById('weather-icon')      as HTMLSpanElement;
  const elWeatherWindInfo = document.getElementById('weather-wind-info') as HTMLSpanElement;
  const elWeatherWindIcon = document.getElementById('weather-wind-icon') as HTMLSpanElement;
  const elWeatherSunTime  = document.getElementById('weather-sun-time')  as HTMLSpanElement;
  const elWeatherSunIcon  = document.getElementById('weather-sun-icon')  as HTMLSpanElement;
  const elWeatherDaily    = document.getElementById('weather-daily')     as HTMLDivElement;

  // ── Supabase Integration (RGB Sync) ───────────────────────────────────────
  const SUPABASE_URL = 'https://xfxgdcfzsvlzhvjcnhzz.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhmeGdkY2Z6c3Zsemh2amNuaHp6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDYzNTUyNywiZXhwIjoyMDc2MjExNTI3fQ.QcJLu2DX2SPeDSmK1UwD7WK2KsAAguJZHdO90PnvWjw';

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  let currentSupabaseColor = { red: 255, green: 255, blue: 255 };

  function updateAccentColor(red: number, green: number, blue: number) {
    currentSupabaseColor = { red, green, blue };
    applyCurrentTheme();
  }

  function applyCurrentTheme() {
    const activeBtn = document.querySelector<HTMLButtonElement>('.btn-style.active');
    const style = activeBtn ? (activeBtn.dataset['style'] as string) : 'static';

    if (style === 'static') {
      document.documentElement.style.setProperty('--accent-color', `#ffffff`);
      document.documentElement.style.setProperty('--accent-glow', `rgba(255, 255, 255, 0.35)`);
    } else {
      const { red, green, blue } = currentSupabaseColor;
      document.documentElement.style.setProperty('--accent-color', `rgb(${red}, ${green}, ${blue})`);
      document.documentElement.style.setProperty('--accent-glow', `rgba(${red}, ${green}, ${blue}, 0.35)`);
    }
  }

  let localDevices: any[] = [];

  // Cached DOM elements for IoT status bar
  const elIotClimate = document.getElementById('iot-climate') as HTMLDivElement;
  const elIotCurtain = document.getElementById('iot-curtain') as HTMLDivElement;
  const elIotPrinter = document.getElementById('iot-printer') as HTMLDivElement;
  const elIotLight   = document.getElementById('iot-light')   as HTMLDivElement;
  const elIotLock    = document.getElementById('iot-lock')    as HTMLDivElement;

  function updateIotStatusBar() {
    // 1. İç Ortam (id: 6 - Sıcaklık Sensörü)
    const climateDevice = localDevices.find(d => d.id === 6);
    if (climateDevice && elIotClimate) {
      const valEl = elIotClimate.querySelector('.iot-val');
      if (valEl) {
        valEl.textContent = `${climateDevice.sicaklik || '--'}°C / %${climateDevice.nem || '--'}`;
      }
    }

    // 2. Perde (id: 2 - Perde)
    const curtainDevice = localDevices.find(d => d.id === 2);
    if (curtainDevice && elIotCurtain) {
      const valEl = elIotCurtain.querySelector('.iot-val');
      if (valEl) {
        valEl.textContent = `%${curtainDevice.position ?? 0}`;
      }
    }

    // 3. 3D Yazıcı (id: 3 - 3D Yazıcı)
    const printerDevice = localDevices.find(d => d.id === 3);
    if (printerDevice && elIotPrinter) {
      const valEl = elIotPrinter.querySelector('.iot-val');
      if (valEl) {
        valEl.textContent = printerDevice.is_active ? 'Aktif' : 'Pasif';
      }
    }

    // 4. Oda Işığı (id: 1 - Oda Işığı)
    const lightDevice = localDevices.find(d => d.id === 1);
    if (lightDevice && elIotLight) {
      const valEl = elIotLight.querySelector('.iot-val');
      if (valEl) {
        valEl.textContent = lightDevice.is_active ? 'Açık' : 'Kapalı';
      }
    }

    // 5. Kapı Kilidi (id: 4 - Elektronik Kapı)
    const lockDevice = localDevices.find(d => d.id === 4);
    if (lockDevice && elIotLock) {
      const valEl = elIotLock.querySelector('.iot-val');
      if (valEl) {
        valEl.textContent = lockDevice.is_active ? 'Kilitli' : 'Açık';
      }
    }
  }

  function checkRgbSync() {
    const rgbDevice = localDevices.find(d => 
      (d.type === 'rgb' || d.type === 'light' || d.name?.toLowerCase().includes('led') || d.name?.toLowerCase().includes('rgb') || d.name?.toLowerCase().includes('ambiyans')) &&
      d.red_light !== null && d.green_light !== null && d.blue_light !== null &&
      !d.name?.toLowerCase().includes('sensör')
    );
    if (rgbDevice) {
      updateAccentColor(rgbDevice.red_light || 0, rgbDevice.green_light || 0, rgbDevice.blue_light || 0);
    }
  }

  // Fetch initial state and subscribe to changes
  async function initSupabaseSync() {
    try {
      const { data, error } = await supabase
        .from('devices')
        .select('*');

      if (error) {
        console.warn('Initial Supabase devices fetch warning:', error.message);
        return;
      }

      if (data) {
        localDevices = data;
        updateIotStatusBar();
        checkRgbSync();
      }
    } catch (e) {
      console.error('Failed to initialize Supabase sync:', e);
    }

    // Subscribe to all changes on devices table
    supabase
      .channel('devices-live-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'devices'
        },
        (payload: any) => {
          const { eventType, new: newRow, old: oldRow } = payload;
          if (eventType === 'INSERT') {
            localDevices.push(newRow);
          } else if (eventType === 'UPDATE') {
            const index = localDevices.findIndex(d => d.id === newRow.id);
            if (index !== -1) {
              localDevices[index] = newRow;
            } else {
              localDevices.push(newRow);
            }
          } else if (eventType === 'DELETE') {
            localDevices = localDevices.filter(d => d.id !== oldRow.id);
          }
          updateIotStatusBar();
          checkRgbSync();
        }
      )
      .subscribe((status) => {
        console.log('Supabase Realtime subscription status:', status);
      });
  }

  initSupabaseSync();

  // ── Zen mode toggle ────────────────────────────────────────────────────────
  btnToggleUI.addEventListener('click', () => {
    document.body.classList.toggle('ui-collapsed');
  });

  // ── OpenClaw Message Listener ──────────────────────────────────────────────
  const elAssistantWidget = document.getElementById('assistant-widget') as HTMLDivElement;
  const elAssistantTitle  = document.getElementById('assistant-title') as HTMLSpanElement;
  const elAssistantText   = document.getElementById('assistant-text') as HTMLDivElement;
  const elAssistantBody   = elAssistantWidget?.querySelector('.assistant-body') as HTMLDivElement;
  const elAssistantImage  = document.getElementById('assistant-image') as HTMLImageElement;
  const elAssistantCard   = elAssistantWidget?.querySelector('.assistant-card') as HTMLDivElement;

  let assistantTimeoutId: ReturnType<typeof setTimeout> | null = null;

  const electronAPI = (window as any).electronAPI;
  if (electronAPI && electronAPI.onShowMessage) {
    electronAPI.onShowMessage((data: { text: string; title?: string; type?: string; duration?: number; image?: string }) => {
      if (!elAssistantWidget || !elAssistantText || !elAssistantTitle || !elAssistantCard) return;

      // Cancel any active timers
      if (assistantTimeoutId) {
        clearTimeout(assistantTimeoutId);
        assistantTimeoutId = null;
      }

      // Update title
      elAssistantTitle.textContent = data.title || 'OPENCLAW';

      // Reset card classes
      elAssistantCard.className = 'assistant-card';
      const messageType = data.type || 'assistant';
      elAssistantCard.classList.add(messageType);

      // Handle optional image display
      if (elAssistantImage) {
        if (data.image) {
          elAssistantImage.src = data.image;
          elAssistantImage.classList.remove('hidden');
        } else {
          elAssistantImage.src = '';
          elAssistantImage.classList.add('hidden');
        }
      }

      // Trigger breathing fade-in animation on container body
      if (elAssistantBody) {
        elAssistantBody.classList.remove('assistant-text-animate');
        void elAssistantBody.offsetWidth; 
        elAssistantText.innerHTML = data.text;
        elAssistantBody.classList.add('assistant-text-animate');
      } else {
        elAssistantText.innerHTML = data.text;
      }

      // Show widget and dim other UI components
      elAssistantWidget.classList.remove('hidden');
      document.body.classList.add('assistant-active');

      // Auto-hide unless duration is set to 0 or null
      const duration = data.duration !== undefined ? data.duration : 7000;
      if (duration > 0) {
        assistantTimeoutId = setTimeout(() => {
          elAssistantWidget.classList.add('hidden');
          document.body.classList.remove('assistant-active');
        }, duration);
      }
    });
  }

  // ── Style / Theme ──────────────────────────────────────────────────────────
  const themeMap: Record<string, { bodyClass: string }> = {
    static:  { bodyClass: '' },
    dynamic: { bodyClass: '' },
  };

  const ALL_BODY_THEMES = ['neon-theme', 'sunset-theme', 'cyber-theme', 'gold-theme'];

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
      
      applyCurrentTheme();
    });
  });

  // ── Color Palette Swatches ─────────────────────────────────────────────────
  document.querySelectorAll<HTMLButtonElement>('.theme-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
      document.querySelectorAll('.theme-swatch').forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');

      // Remove all color theme classes
      ALL_BODY_THEMES.forEach(cls => document.body.classList.remove(cls));

      const theme = swatch.dataset['theme'];
      if (theme) document.body.classList.add(theme);

      applyCurrentTheme();
    });
  });

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
      greetEl.innerHTML = `<span class="greeting-prefix">${greet},</span> <span class="greeting-name">BURAK</span>`;
    }
  }
  setInterval(updateTime, 1000);
  updateTime();

  // ── Weather (Gaziantep) ────────────────────────────────────────────────────
  // localStorage cache keys
  const WEATHER_CACHE_KEY = 'vv_weather_data';
  const WEATHER_CACHE_TS  = 'vv_weather_ts';
  const WEATHER_TTL_MS    = 20 * 60 * 1000; // 20 minutes — avoid hammering API on RPi restarts
  function getWeatherIcon(code: number): string {
    if (code === 0) {
      // Clear / Sunny
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="weather-svg"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
    }
    if (code >= 1 && code <= 3) {
      // Partly Cloudy
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="weather-svg"><path d="M12 2a3 3 0 0 0-3 3v.22a5 5 0 0 1 8 0V5a3 3 0 0 0-3-3Z" stroke-dasharray="2 2" opacity="0.6"/><path d="M17.5 19A4.5 4.5 0 0 0 22 14.5c0-2.3-1.7-4.2-4-4.5A7 7 0 1 0 5 15.5c0 .3 0 .7.1 1a4.5 4.5 0 0 0 8.8 1.5c.3.1.7.1 1.1.1a4.48 4.48 0 0 0 2.5-.1"/></svg>`;
    }
    if (code === 45 || code === 48) {
      // Fog / Sisli
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="weather-svg"><line x1="5" y1="8" x2="19" y2="8"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="6" y1="16" x2="18" y2="16"/><line x1="4" y1="20" x2="20" y2="20"/></svg>`;
    }
    if (code >= 51 && code <= 67) {
      // Rainy
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="weather-svg"><path d="M20 16.5A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/><line x1="8" y1="16" x2="6" y2="22"/><line x1="12" y1="16" x2="10" y2="22"/><line x1="16" y1="16" x2="14" y2="22"/></svg>`;
    }
    if (code >= 71 && code <= 77) {
      // Snowy
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="weather-svg"><path d="M20 16.5A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/><line x1="8" y1="17" x2="8" y2="17.01"/><line x1="8" y1="21" x2="8" y2="21.01"/><line x1="12" y1="19" x2="12" y2="19.01"/><line x1="12" y1="23" x2="12" y2="23.01"/><line x1="16" y1="17" x2="16" y2="17.01"/><line x1="16" y1="21" x2="16" y2="21.01"/></svg>`;
    }
    if (code >= 80 && code <= 82) {
      // Showers
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="weather-svg"><path d="M20 16.5A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/><line x1="7" y1="16" x2="5" y2="22"/><line x1="10" y1="16" x2="8" y2="22"/><line x1="13" y1="16" x2="11" y2="22"/><line x1="16" y1="16" x2="14" y2="22"/></svg>`;
    }
    if (code >= 95 && code <= 99) {
      // Thunderstorm
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="weather-svg"><path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 8.58"/><polyline points="13 11 9 17 12 17 10 23"/></svg>`;
    }
    // Default Clear
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="weather-svg"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
  }


  const SUNRISE_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" class="meta-svg-icon"><path d="M12 2v8M5.22 5.22l3.54 3.54M18.78 5.22l-3.54 3.54M2 18h20M5 22h14M12 10a4 4 0 0 0-4 4h8a4 4 0 0 0-4-4Z"/></svg>`;
  const SUNSET_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" class="meta-svg-icon"><path d="M12 14v-8M5.22 10.78l3.54-3.54M18.78 10.78l-3.54-3.54M2 18h20M5 22h14M12 14a4 4 0 0 0-4-4h8a4 4 0 0 0-4 4Z"/></svg>`;
  const WIND_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" class="meta-svg-icon"><path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59-3.41A2 2 0 1 1 14 8H2m15.59-1.41A2 2 0 1 1 19 10H2"/></svg>`;

  function getWindDirectionTr(degrees: number): string {
    const directions = [
      'K', 'KKD', 'KD', 'DKD', 
      'D', 'DGD', 'GD', 'GGD', 
      'G', 'GGB', 'GB', 'BGB', 
      'B', 'BKB', 'KB', 'KKB'
    ];
    const index = Math.round(((degrees % 360) / 22.5)) % 16;
    return directions[index];
  }

  function getTurkishDayName(dateStr: string): string {
    const date = new Date(dateStr);
    const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
    return days[date.getDay()];
  }

  function applyWeatherData(data: any) {
    const currentTemp = data.current.temperature_2m;
    const currentCode = data.current.weather_code;
    const windSpeed   = data.current.wind_speed_10m;
    const windDir     = data.current.wind_direction_10m;

    if (elWeatherTemp) elWeatherTemp.textContent = `${currentTemp.toFixed(1)}°`;
    if (elWeatherIcon) elWeatherIcon.innerHTML = getWeatherIcon(currentCode);

    if (elWeatherWindIcon) elWeatherWindIcon.innerHTML = WIND_SVG;
    if (elWeatherWindInfo) {
      elWeatherWindInfo.textContent = `${Math.round(windSpeed)} ${getWindDirectionTr(windDir)}`;
    }

    if (data.daily?.sunrise && data.daily?.sunset) {
      const now          = new Date();
      const todaySunrise = new Date(data.daily.sunrise[0]);
      const todaySunset  = new Date(data.daily.sunset[0]);
      let displayTimeStr = '';
      let displayIcon    = '';

      if (now >= todaySunrise && now < todaySunset) {
        const hs = String(todaySunset.getHours()).padStart(2, '0');
        const ms = String(todaySunset.getMinutes()).padStart(2, '0');
        displayTimeStr = `${hs}:${ms}`;
        displayIcon    = SUNSET_SVG;
      } else {
        const sunriseDate = now >= todaySunset ? new Date(data.daily.sunrise[1]) : todaySunrise;
        const hs = String(sunriseDate.getHours()).padStart(2, '0');
        const ms = String(sunriseDate.getMinutes()).padStart(2, '0');
        displayTimeStr = `${hs}:${ms}`;
        displayIcon    = SUNRISE_SVG;
      }
      if (elWeatherSunIcon) elWeatherSunIcon.innerHTML = displayIcon;
      if (elWeatherSunTime) elWeatherSunTime.textContent = displayTimeStr;
    }

    if (elWeatherDaily && data.daily?.time) {
      const htmlParts: string[] = [];
      for (let i = 1; i <= 6; i++) {
        if (i >= data.daily.time.length) break;
        const dayName  = getTurkishDayName(data.daily.time[i]);
        const iconHtml = getWeatherIcon(data.daily.weather_code[i]);
        const maxTemp  = data.daily.temperature_2m_max[i].toFixed(1);
        const minTemp  = data.daily.temperature_2m_min[i].toFixed(1);
        htmlParts.push(`<div class="daily-item"><span class="daily-day">${dayName}</span><span class="daily-icon">${iconHtml}</span><span class="daily-temp-max">${maxTemp}</span><span class="daily-temp-min">${minTemp}</span></div>`);
      }
      elWeatherDaily.innerHTML = htmlParts.join('');
    }
  }

  function useFallbackWeather() {
    if (elWeatherTemp) elWeatherTemp.textContent = '33.2°';
    if (elWeatherIcon) elWeatherIcon.innerHTML = getWeatherIcon(0);
    if (elWeatherWindIcon) elWeatherWindIcon.innerHTML = WIND_SVG;
    if (elWeatherWindInfo) elWeatherWindInfo.textContent = '6 BGB';
    if (elWeatherSunIcon)  elWeatherSunIcon.innerHTML = SUNSET_SVG;
    if (elWeatherSunTime)  elWeatherSunTime.textContent = '20:12';
    if (elWeatherDaily) {
      const fallbackDays = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
      elWeatherDaily.innerHTML = fallbackDays.map((day, i) =>
        `<div class="daily-item"><span class="daily-day">${day}</span><span class="daily-icon">${getWeatherIcon(0)}</span><span class="daily-temp-max">${(32.5 - i).toFixed(1)}</span><span class="daily-temp-min">${(18.2 + i * 0.5).toFixed(1)}</span></div>`
      ).join('');
    }
  }

  async function updateWeather() {
    // ── localStorage cache: skip network if data is fresh (<20min) ─────────────
    try {
      const cachedTs  = parseInt(localStorage.getItem(WEATHER_CACHE_TS) || '0', 10);
      const cachedStr = localStorage.getItem(WEATHER_CACHE_KEY);
      if (cachedStr && Date.now() - cachedTs < WEATHER_TTL_MS) {
        applyWeatherData(JSON.parse(cachedStr));
        return; // skip network fetch entirely
      }
    } catch (_) { /* ignore stale cache parse errors */ }

    try {
      const res = await fetch(
        'https://api.open-meteo.com/v1/forecast' +
        '?latitude=37.0662&longitude=37.3833' +
        '&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m' +
        '&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset' +
        '&timezone=auto&forecast_days=7'
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // Persist to localStorage so fast restarts skip the network call
      try {
        localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(data));
        localStorage.setItem(WEATHER_CACHE_TS, String(Date.now()));
      } catch (_) { /* storage quota — ignore */ }
      applyWeatherData(data);
    } catch (err) {
      console.warn('Weather fetch failed, using cache or fallback:', err);
      // Try stale cache before showing fallback
      try {
        const stale = localStorage.getItem(WEATHER_CACHE_KEY);
        if (stale) { applyWeatherData(JSON.parse(stale)); return; }
      } catch (_) { /* */ }
      useFallbackWeather();
    }
  }

  // Update weather initially and every 20 minutes
  updateWeather();
  let weatherIntervalId = setInterval(updateWeather, WEATHER_TTL_MS);

  // ── News Ticker (Haber Akışı) ──────────────────────────────────────────────
  // Headlines will be populated entirely by fetchRealNews() (no mock data)
  const headlines: { text: string; img: string }[] = [];

  // Agenda trends will be populated entirely by fetchRealTrends() (no mock data)
  const agendaTrends: { rank: number; topic: string; count: string }[][] = [];

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

  // ── Cached news DOM refs ──────────────────────────────────────────────────
  const elNewsTickerText = document.getElementById('news-ticker-text');
  const elNewsImg        = document.getElementById('news-img') as HTMLImageElement;

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
          if (enclosure) imgUrl = enclosure.getAttribute('url') || '';
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
        if (elNewsTickerText && elNewsImg) {
          currentHeadlineIndex = 0;
          elNewsTickerText.textContent = headlines[0].text;
          elNewsImg.src = headlines[0].img;
        }
      }
    } catch (err) {
      console.warn('Real news fetch failed, using fallback headlines:', err);
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
        for (let i = 0; i < parsedTrends.length; i += 5) {
          const chunk = parsedTrends.slice(i, i + 5);
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

  // ── Real-time data init ────────────────────────────────────────────────────
  fetchRealNews();
  fetchRealTrends();
  fetchFinanceRates();

  // Refresh timers — stored so Page Visibility API can pause/resume them
  let newsIntervalId: ReturnType<typeof setInterval>;
  let financeIntervalId: ReturnType<typeof setInterval>;
  let newsTickerIntervalId: ReturnType<typeof setInterval>;

  function startDataIntervals() {
    newsIntervalId       = setInterval(() => { fetchRealNews(); fetchRealTrends(); }, 10 * 60 * 1000);
    financeIntervalId    = setInterval(fetchFinanceRates, 60 * 1000);
    newsTickerIntervalId = setInterval(cycleNews, 6000);
  }
  startDataIntervals();

  // ── Page Visibility API — pause everything when tab/window is hidden ────────
  const financeScrollEl = document.querySelector('.finance-scroll') as HTMLElement | null;

  function pauseBackgroundWork() {
    clearInterval(newsIntervalId);
    clearInterval(financeIntervalId);
    clearInterval(newsTickerIntervalId);
    clearInterval(weatherIntervalId);
    // Pause the CSS scroll animation to free GPU
    if (financeScrollEl) financeScrollEl.style.animationPlayState = 'paused';
  }

  function resumeBackgroundWork() {
    // Immediately refresh stale data then restart intervals
    fetchRealNews();
    fetchRealTrends();
    fetchFinanceRates();
    updateWeather();
    newsIntervalId    = setInterval(() => { fetchRealNews(); fetchRealTrends(); }, 10 * 60 * 1000);
    financeIntervalId = setInterval(fetchFinanceRates, 60 * 1000);
    newsTickerIntervalId = setInterval(cycleNews, 6000);
    weatherIntervalId = setInterval(updateWeather, WEATHER_TTL_MS);
    if (financeScrollEl) financeScrollEl.style.animationPlayState = 'running';
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pauseBackgroundWork();
    } else {
      resumeBackgroundWork();
    }
  });
});

