// APP.JS - TV INFORMASI & JADWAL SHOLAT DIGITAL MASJID BAITURRAHMAN (YMB) DEPOK

let settings = null;
let currentSlideIndex = 0;
let slideIntervalTimer = null;
let state = 'NORMAL'; // 'NORMAL', 'IQOMAH_COUNTDOWN', 'SHOLAT_MODE'
let iqomahRemainingSeconds = 0;
let iqomahTotalSeconds = 0;
let iqomahTimerId = null;
let sholatTimerId = null;
let todaysPrayerTimes = {};
let nextPrayerInfo = { name: '', key: '', timeStr: '', dateObj: null };

// Audio Web API Context
let audioCtx = null;

function getAudioContext() {
    if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

// Iconic Digital Mosque Buzzer ("Beep... Beep... Beep... Beeeeeeeeep!")
function playMosqueChime() {
    try {
        const ctx = getAudioContext();
        const now = ctx.currentTime;
        const freq = 960; // Classic piezo buzzer pitch (960 Hz)

        // Beep timing sequence: [startOffset, duration]
        const sequence = [
            [0.0, 0.14],   // Beep 1
            [0.24, 0.14],  // Beep 2
            [0.48, 0.14],  // Beep 3
            [0.72, 1.40]   // Beeeeeeeeep! (Long final beep)
        ];

        sequence.forEach(([startOffset, duration]) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            // Blend sine & subtle triangle for clear, rich digital chime tone
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + startOffset);

            gain.gain.setValueAtTime(0.001, now + startOffset);
            gain.gain.linearRampToValueAtTime(0.35, now + startOffset + 0.01);
            gain.gain.setValueAtTime(0.35, now + startOffset + duration - 0.02);
            gain.gain.linearRampToValueAtTime(0.001, now + startOffset + duration);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(now + startOffset);
            osc.stop(now + startOffset + duration + 0.05);
        });
    } catch (e) {
        console.warn('Audio Beep Playback Error:', e);
    }
}

// Single short beep for countdown ticks
function playSingleBeep() {
    try {
        const ctx = getAudioContext();
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(960, now);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.3, now + 0.01);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.10);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.12);
    } catch (e) {
        console.warn('Single Beep Error:', e);
    }
}

// ----------------------------------------------------
// SETTINGS LOAD & SAVE
// ----------------------------------------------------
async function initSettings() {
    let jsonSettings = null;
    try {
        const response = await fetch('config/settings.json');
        jsonSettings = await response.json();
    } catch (e) {
        console.error('Failed to load settings.json:', e);
    }

    const saved = localStorage.getItem('ymb_tv_settings');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            const qrisEndpoint = (jsonSettings && jsonSettings.qrisConfig && jsonSettings.qrisConfig.endpointUrl)
                ? jsonSettings.qrisConfig.endpointUrl
                : (parsed.qrisConfig ? parsed.qrisConfig.endpointUrl : '');

            settings = {
                ...jsonSettings,
                ...parsed,
                qrisConfig: {
                    ...(parsed.qrisConfig || {}),
                    endpointUrl: qrisEndpoint
                },
                // Always use latest prayerOffsets & slides from settings.json to prevent stale localStorage cache
                prayerOffsets: jsonSettings ? jsonSettings.prayerOffsets : (parsed.prayerOffsets || {}),
                slides: jsonSettings ? jsonSettings.slides : parsed.slides
            };
            // Sync clean settings back to localStorage
            localStorage.setItem('ymb_tv_settings', JSON.stringify(settings));
            applySettings();
            return;
        } catch (e) {
            console.error('Failed to parse saved settings, using jsonSettings');
        }
    }

    settings = jsonSettings;
    applySettings();
}

function applySettings() {
    if (!settings) return;

    // Mosque Details
    document.getElementById('namaMasjid').innerText = settings.masjid.nama || 'YAYASAN MASJID BAITURRAHMAN';
    document.getElementById('subNamaMasjid').innerText = settings.masjid.subNama || 'Masjid Merah Baiturrahman';
    document.getElementById('alamatMasjid').innerText = settings.masjid.alamat || 'Kota Depok';

    // Running Text Marquee
    renderRunningText();

    // Render Carousel
    renderCarousel();

    // Fetch BMKG Weather Data
    fetchWeatherData();

    // Calculate Prayer Times
    calculatePrayerTimes();

    // Populate Settings Form
    populateSettingsForm();
}

function saveSettings(newSettings) {
    settings = newSettings;
    localStorage.setItem('ymb_tv_settings', JSON.stringify(settings));
    applySettings();
}

// ----------------------------------------------------
// CALCULATION & PRAYER TIMES ENGINE (DEPOK, JAWA BARAT)
// ----------------------------------------------------
let lastCalculatedDateStr = '';

async function calculatePrayerTimes() {
    if (!window.prayTimes || !settings) return;

    const coords = [
        settings.coordinates.latitude || -6.390,
        settings.coordinates.longitude || 106.824
    ];
    const tz = settings.coordinates.timezone || 7;
    const cityId = settings.coordinates.cityId || '1301'; // Default Kota Depok
    const now = new Date();
    lastCalculatedDateStr = now.toDateString();

    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();

    // 1. Initial offline calculation via PrayTimes engine
    const times = window.prayTimes.getTimes(now, coords, tz);
    const offsets = settings.prayerOffsets || {};

    todaysPrayerTimes = {
        fajr: applyMinuteOffset(times.fajr, offsets.fajr || 0),
        sunrise: applyMinuteOffset(times.sunrise, offsets.sunrise || 0),
        dhuhr: applyMinuteOffset(times.dhuhr, offsets.dhuhr || 0),
        asr: applyMinuteOffset(times.asr, offsets.asr || 0),
        maghrib: applyMinuteOffset(times.maghrib, offsets.maghrib || 0),
        isha: applyMinuteOffset(times.isha, offsets.isha || 0)
    };

    updatePrayerBarUI();

    // 2. Priority 1: Official Kemenag RI API (MyQuran) for Kota Depok (MuslimPro Standard)
    try {
        const myquranUrl = `https://api.myquran.com/v2/sholat/jadwal/${cityId}/${yyyy}/${mm}/${dd}`;
        const res = await fetch(myquranUrl);
        if (res.ok) {
            const data = await res.json();
            if (data && data.status && data.data && data.data.jadwal) {
                const j = data.data.jadwal;
                todaysPrayerTimes = {
                    fajr: applyMinuteOffset(j.subuh, offsets.fajr || 0),
                    sunrise: applyMinuteOffset(j.terbit, offsets.sunrise || 0),
                    dhuhr: applyMinuteOffset(j.dzuhur, offsets.dhuhr || 0),
                    asr: applyMinuteOffset(j.ashar, offsets.asr || 0),
                    maghrib: applyMinuteOffset(j.maghrib, offsets.maghrib || 0),
                    isha: applyMinuteOffset(j.isya, offsets.isha || 0)
                };
                updatePrayerBarUI();
                console.log('✅ Prayer times synced with Official Kemenag RI API (Kota Depok)');
                return;
            }
        }
    } catch (e) {
        console.warn('MyQuran Kemenag API unreachable, trying fallback API...');
    }

    // 3. Priority 2: Fallback to Aladhan API (Method 20: Kemenag Indonesia)
    try {
        const aladhanUrl = `https://api.aladhan.com/v1/timings/${dd}-${mm}-${yyyy}?latitude=${coords[0]}&longitude=${coords[1]}&method=20`;
        const res = await fetch(aladhanUrl);
        if (res.ok) {
            const data = await res.json();
            if (data && data.data && data.data.timings) {
                const apiT = data.data.timings;
                todaysPrayerTimes = {
                    fajr: applyMinuteOffset(apiT.Fajr.substring(0, 5), offsets.fajr || 0),
                    sunrise: applyMinuteOffset(apiT.Sunrise.substring(0, 5), offsets.sunrise || 0),
                    dhuhr: applyMinuteOffset(apiT.Dhuhr.substring(0, 5), offsets.dhuhr || 0),
                    asr: applyMinuteOffset(apiT.Asr.substring(0, 5), offsets.asr || 0),
                    maghrib: applyMinuteOffset(apiT.Maghrib.substring(0, 5), offsets.maghrib || 0),
                    isha: applyMinuteOffset(apiT.Isha.substring(0, 5), offsets.isha || 0)
                };
                updatePrayerBarUI();
                console.log('✅ Prayer times synced with Aladhan API (Kemenag standard)');
            }
        }
    } catch (e) {
        console.log('Online prayer APIs unavailable, using high-precision PrayTimes engine offline');
    }
}

function updatePrayerBarUI() {
    document.getElementById('time-fajr').innerText = `${todaysPrayerTimes.fajr} WIB`;
    document.getElementById('time-sunrise').innerText = `${todaysPrayerTimes.sunrise} WIB`;
    document.getElementById('time-dhuhr').innerText = `${todaysPrayerTimes.dhuhr} WIB`;
    document.getElementById('time-asr').innerText = `${todaysPrayerTimes.asr} WIB`;
    document.getElementById('time-maghrib').innerText = `${todaysPrayerTimes.maghrib} WIB`;
    document.getElementById('time-isha').innerText = `${todaysPrayerTimes.isha} WIB`;

    determineNextPrayer();
}

function applyMinuteOffset(timeStr, offsetMinutes) {
    if (!timeStr || timeStr === '--:--' || offsetMinutes === 0) return timeStr;
    const parts = timeStr.split(':');
    let h = parseInt(parts[0], 10);
    let m = parseInt(parts[1], 10) + offsetMinutes;

    if (m >= 60) {
        h += Math.floor(m / 60);
        m = m % 60;
    } else if (m < 0) {
        h -= 1;
        m = (m + 60) % 60;
    }

    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function parseTimeToDate(timeStr, referenceDate = new Date()) {
    const parts = timeStr.split(':');
    const d = new Date(referenceDate);
    d.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), 0, 0);
    return d;
}

function determineNextPrayer() {
    const now = new Date();
    const list = [
        { key: 'fajr', name: 'SUBUH', icon: '🌅' },
        { key: 'sunrise', name: 'SYURUQ', icon: '☀️' },
        { key: 'dhuhr', name: 'DZUHUR', icon: '☀️' },
        { key: 'asr', name: 'ASHAR', icon: '🌤️' },
        { key: 'maghrib', name: 'MAGHRIB', icon: '🌆' },
        { key: 'isha', name: 'ISYA', icon: '🌙' }
    ];

    let foundNext = null;
    let currentActiveKey = null;

    for (let i = 0; i < list.length; i++) {
        const item = list[i];
        const pTimeStr = todaysPrayerTimes[item.key];
        if (!pTimeStr) continue;

        const pDate = parseTimeToDate(pTimeStr, now);

        if (now >= pDate) {
            currentActiveKey = item.key;
        }

        if (now < pDate && !foundNext) {
            foundNext = {
                key: item.key,
                name: item.name,
                icon: item.icon,
                timeStr: pTimeStr,
                dateObj: pDate
            };
        }
    }

    // If all prayers today have passed, next prayer is Fajr tomorrow
    if (!foundNext) {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowFajrDate = parseTimeToDate(todaysPrayerTimes.fajr, tomorrow);
        foundNext = {
            key: 'fajr',
            name: 'SUBUH',
            icon: '🌅',
            timeStr: todaysPrayerTimes.fajr,
            dateObj: tomorrowFajrDate
        };
    }

    nextPrayerInfo = foundNext;

    // Update UI for Next Prayer Card
    document.getElementById('nextPrayerIcon').innerText = foundNext.icon;
    document.getElementById('nextPrayerName').innerText = foundNext.name;
    document.getElementById('nextPrayerTime').innerText = `${foundNext.timeStr} WIB`;

    // Highlight active prayer card in prayer-bar
    document.querySelectorAll('.prayer-card').forEach(card => {
        card.classList.remove('active-prayer');
        const pKey = card.getAttribute('data-prayer');
        const statusEl = card.querySelector('.prayer-status');

        if (pKey === currentActiveKey) {
            card.classList.add('active-prayer');
            if (statusEl) statusEl.innerText = 'BERLANGSUNG';
        } else if (pKey === foundNext.key) {
            if (statusEl) statusEl.innerText = 'BERIKUTNYA';
        } else {
            if (statusEl) statusEl.innerText = 'SELESAI';
        }
    });
}

// ----------------------------------------------------
// REALTIME CLOCK & COUNTDOWN
// ----------------------------------------------------
let lastWeatherHour = -1;

// Helper function for Hijri date calculation with Smart TV fallback support
function getHijriDate(date) {
    const months = [
        "Muharram", "Safar", "Rabi'ul Awal", "Rabi'ul Akhir",
        "Jumadil Awal", "Jumadil Akhir", "Rajab", "Sya'ban",
        "Ramadhan", "Syawal", "Dzulqa'dah", "Dzulhijjah"
    ];

    // 1. Try Intl with umalqura calendar first (works on modern browsers)
    try {
        if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
            const formatter = new Intl.DateTimeFormat('id-ID-u-ca-islamic-umalqura', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            });
            let str = formatter.format(date);
            const gregorianMonths = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
            const isGregorianFallback = gregorianMonths.some(m => str.includes(m));
            if (!isGregorianFallback && !str.includes('SM')) {
                return str.replace(/\s*H\s*$/i, '').trim();
            }
        }
    } catch (e) {
        // Fallback to mathematical calculation
    }

    // 2. Mathematical Fallback for Smart TV browsers without Islamic Intl support
    let d = new Date(date);
    d.setDate(d.getDate() + 2); // Adjustment for UmAlQura alignment

    let day = d.getDate();
    let month = d.getMonth() + 1;
    let year = d.getFullYear();

    if (month < 3) {
        year -= 1;
        month += 12;
    }

    let a = Math.floor(year / 100);
    let b = 2 - a + Math.floor(a / 4);
    let jd = Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + b - 1524.5;

    let epochJulianDay = 1948439.5;
    let cycle = Math.floor((jd - epochJulianDay) / 10631);
    let remainingDays = (jd - epochJulianDay) - (cycle * 10631);

    let hijriYear = Math.floor(remainingDays / 354.366);
    let dayOfYear = remainingDays - Math.floor(hijriYear * 354.366);

    let hijriMonth = 0;
    const monthLength = [30, 29, 30, 29, 30, 29, 30, 29, 30, 29, 30, 29];
    let sumDays = 0;

    for (let i = 0; i < 12; i++) {
        if (dayOfYear <= sumDays + monthLength[i]) {
            hijriMonth = i;
            break;
        }
        sumDays += monthLength[i];
    }

    let hijriDay = Math.floor(dayOfYear - sumDays);
    if (hijriDay <= 0) hijriDay = 1;
    let finalYear = Math.floor(cycle * 30 + hijriYear + 1);

    return `${hijriDay} ${months[hijriMonth]} ${finalYear}`;
}

function updateClock() {
    const now = new Date();

    // Auto-recalculate prayer times on date change (e.g. at 00:00 midnight)
    if (lastCalculatedDateStr && lastCalculatedDateStr !== now.toDateString()) {
        calculatePrayerTimes();
    }

    // Auto-update BMKG Weather when hour changes (e.g. at 16:00, 17:00, 18:00, etc.)
    const currentHour = now.getHours();
    if (lastWeatherHour !== -1 && lastWeatherHour !== currentHour) {
        lastWeatherHour = currentHour;
        console.log(`⏰ Hour changed to ${currentHour}:00 - Updating BMKG Weather Timeline`);
        fetchWeatherData();
    } else if (lastWeatherHour === -1) {
        lastWeatherHour = currentHour;
    }

    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');

    document.getElementById('clock').innerText = `${hh}:${mm}:${ss}`;

    // Update Dates
    const masehi = now.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
    document.getElementById('tanggalMasehi').innerText = masehi;

    let hijriyah = getHijriDate(now);
    document.getElementById('tanggalHijriyah').innerText = `${hijriyah} H`;

    // Countdown to Next Prayer Adhan
    if (nextPrayerInfo && nextPrayerInfo.dateObj) {
        const diffMs = nextPrayerInfo.dateObj - now;

        if (diffMs > 0) {
            const diffSec = Math.floor(diffMs / 1000);
            const hrs = Math.floor(diffSec / 3600);
            const mins = Math.floor((diffSec % 3600) / 60);
            const secs = diffSec % 60;

            const formatted = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
            document.getElementById('countdownTimer').innerText = formatted;

            // Trigger Adhan / Iqomah mode if time reached (within 1 second boundary)
            if (diffSec === 0 && state === 'NORMAL') {
                triggerAdhan(nextPrayerInfo.key, nextPrayerInfo.name);
            }
        } else {
            document.getElementById('countdownTimer').innerText = '00:00:00';
            determineNextPrayer();
        }
    }
}

// ----------------------------------------------------
// STATE MACHINE: IQOMAH & SHOLAT MODE
// ----------------------------------------------------
function triggerAdhan(prayerKey, prayerName) {
    if (prayerKey === 'sunrise') return; // Syuruq does not have Iqomah

    state = 'IQOMAH_COUNTDOWN';
    playMosqueChime();

    const iqomahMinutes = (settings.iqomahMinutes && settings.iqomahMinutes[prayerKey]) || 10;
    iqomahTotalSeconds = iqomahMinutes * 60;
    iqomahRemainingSeconds = iqomahTotalSeconds;

    document.getElementById('iqomahPrayerTitle').innerText = `ADZAN ${prayerName} BERKUMANDANG`;
    document.getElementById('iqomah-overlay').classList.remove('hidden');

    if (iqomahTimerId) clearInterval(iqomahTimerId);

    iqomahTimerId = setInterval(() => {
        iqomahRemainingSeconds--;

        const mins = Math.floor(iqomahRemainingSeconds / 60);
        const secs = iqomahRemainingSeconds % 60;
        document.getElementById('iqomahCountdown').innerText = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

        // Progress Bar
        const pct = (iqomahRemainingSeconds / iqomahTotalSeconds) * 100;
        document.getElementById('iqomahProgressBar').style.width = `${pct}%`;

        // Single beep tick in last 10 seconds
        if (iqomahRemainingSeconds <= 5 && iqomahRemainingSeconds > 0) {
            playSingleBeep();
        }

        if (iqomahRemainingSeconds <= 0) {
            clearInterval(iqomahTimerId);
            triggerSholatMode();
        }
    }, 1000);
}

function triggerSholatMode() {
    state = 'SHOLAT_MODE';
    document.getElementById('iqomah-overlay').classList.add('hidden');
    document.getElementById('sholat-overlay').classList.remove('hidden');

    playMosqueChime();

    const durationSec = (settings.displayConfig && settings.displayConfig.sholatDurationSec) || 900;

    if (sholatTimerId) clearTimeout(sholatTimerId);

    sholatTimerId = setTimeout(() => {
        endSholatMode();
    }, durationSec * 1000);
}

function endSholatMode() {
    state = 'NORMAL';
    document.getElementById('sholat-overlay').classList.add('hidden');
    document.getElementById('iqomah-overlay').classList.add('hidden');
    determineNextPrayer();
}

// ----------------------------------------------------
// BMKG WEATHER ENGINE (SUKMAJAYA DEPOK)
// ----------------------------------------------------
let weatherData = null;

function getBMKGWeatherMeta(code) {
    switch (code) {
        case 0:
            return { label: 'Cerah', icon: '☀️' };
        case 1:
        case 2:
            return { label: 'Cerah Berawan', icon: '⛅' };
        case 3:
            return { label: 'Berawan', icon: '☁️' };
        case 45:
        case 48:
            return { label: 'Kabut', icon: '🌫️' };
        case 51:
        case 53:
        case 55:
        case 61:
            return { label: 'Hujan Ringan', icon: '🌧️' };
        case 63:
        case 65:
            return { label: 'Hujan Sedang', icon: '🌧️' };
        case 80:
        case 81:
        case 82:
            return { label: 'Hujan Lebat', icon: '🌧️' };
        case 95:
        case 96:
        case 99:
            return { label: 'Hujan Petir', icon: '⛈️' };
        default:
            return { label: 'Cerah Berawan', icon: '⛅' };
    }
}

async function fetchWeatherData() {
    try {
        const lat = (settings && settings.coordinates && settings.coordinates.latitude) || -6.4041337;
        const lng = (settings && settings.coordinates && settings.coordinates.longitude) || 106.8414332;

        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&hourly=temperature_2m,relative_humidity_2m,weather_code&timezone=Asia%2FJakarta&past_hours=3&forecast_hours=6`;
        const res = await fetch(url);
        if (res.ok) {
            weatherData = await res.json();
            console.log('✅ BMKG Weather data fetched for Sukmajaya Depok');
            renderCarousel();
        }
    } catch (e) {
        console.warn('Weather API fetch failed, will retry later:', e);
    }
}

// ----------------------------------------------------
// RUNNING TEXT & CAROUSEL
// ----------------------------------------------------
function renderRunningText() {
    if (!settings || !settings.runningText) return;

    const container = document.getElementById('runningText');
    const items = settings.runningText.map((text, idx) => {
        let badge = '[INFO]';
        if (text.toLowerCase().includes('qris') || text.toLowerCase().includes('infaq')) {
            badge = '[INFAQ QRIS]';
        } else if (text.toLowerCase().includes('ponsel') || text.toLowerCase().includes('nada')) {
            badge = '[IMBAUAN]';
        } else if (text.toLowerCase().includes('kegiatan') || text.toLowerCase().includes('agenda')) {
            badge = '[AGENDA]';
        }

        return `<span class="marquee-item"><span class="marquee-badge">${badge}</span> ${text}</span>`;
    }).join(' • ');

    container.innerHTML = items;
}

function renderCarousel() {
    if (!settings || !settings.slides) return;

    const savedIndex = currentSlideIndex || 0;

    const container = document.getElementById('carouselContainer');
    const indicators = document.getElementById('carouselIndicators');

    container.innerHTML = '';
    indicators.innerHTML = '';

    settings.slides.forEach((slide, idx) => {
        // Build slide element
        const slideDiv = document.createElement('div');
        slideDiv.className = `slide ${idx === savedIndex ? 'active' : ''}`;

        if (slide.type === 'cuaca') {
            const currentTemp = (weatherData && weatherData.current) ? Math.round(weatherData.current.temperature_2m) : 27;
            const currentHumidity = (weatherData && weatherData.current) ? weatherData.current.relative_humidity_2m : 78;
            const currentWind = (weatherData && weatherData.current) ? weatherData.current.wind_speed_10m : 1.2;
            const currentCode = (weatherData && weatherData.current) ? weatherData.current.weather_code : 3;
            const currentMeta = getBMKGWeatherMeta(currentCode);

            let timelineItemsMarkup = '';
            if (weatherData && weatherData.hourly && weatherData.hourly.time) {
                const nowHour = new Date().getHours();
                const times = weatherData.hourly.time;
                let hIdx = times.findIndex(t => new Date(t).getHours() === nowHour);
                if (hIdx === -1) hIdx = 3;

                const offsets = [
                    { offset: -2, tag: '2 Jam Lalu' },
                    { offset: -1, tag: '1 Jam Lalu' },
                    { offset: 0, tag: 'Saat Ini' },
                    { offset: 1, tag: '+1 Jam' },
                    { offset: 2, tag: '+2 Jam' }
                ];

                timelineItemsMarkup = offsets.map(item => {
                    const targetIdx = Math.max(0, Math.min(times.length - 1, hIdx + item.offset));
                    const itemTimeStr = times[targetIdx] ? `${String(new Date(times[targetIdx]).getHours()).padStart(2, '0')}:00` : '--:--';
                    const itemTemp = (weatherData.hourly.temperature_2m[targetIdx] !== undefined) ? Math.round(weatherData.hourly.temperature_2m[targetIdx]) : '--';
                    const itemCode = (weatherData.hourly.weather_code[targetIdx] !== undefined) ? weatherData.hourly.weather_code[targetIdx] : 3;
                    const itemMeta = getBMKGWeatherMeta(itemCode);
                    const isNow = item.offset === 0;

                    return `
                        <div class="weather-timeline-col ${isNow ? 'weather-now-col' : ''}">
                            <div class="weather-tag">${item.tag}</div>
                            <div class="weather-time">${itemTimeStr} WIB</div>
                            <div class="weather-icon">${itemMeta.icon}</div>
                            <div class="weather-temp">${itemTemp}°C</div>
                            <div class="weather-label">${itemMeta.label}</div>
                        </div>
                    `;
                }).join('');
            } else {
                timelineItemsMarkup = `
                    <div class="weather-timeline-col"><div class="weather-tag">2 Jam Lalu</div><div class="weather-time">19:00 WIB</div><div class="weather-icon">☁️</div><div class="weather-temp">27°C</div><div class="weather-label">Berawan</div></div>
                    <div class="weather-timeline-col"><div class="weather-tag">1 Jam Lalu</div><div class="weather-time">20:00 WIB</div><div class="weather-icon">⛅</div><div class="weather-temp">27°C</div><div class="weather-label">Cerah Berawan</div></div>
                    <div class="weather-timeline-col weather-now-col"><div class="weather-tag">Saat Ini</div><div class="weather-time">21:00 WIB</div><div class="weather-icon">⛅</div><div class="weather-temp">26°C</div><div class="weather-label">Cerah Berawan</div></div>
                    <div class="weather-timeline-col"><div class="weather-tag">+1 Jam</div><div class="weather-time">22:00 WIB</div><div class="weather-icon">☁️</div><div class="weather-temp">26°C</div><div class="weather-label">Berawan</div></div>
                    <div class="weather-timeline-col"><div class="weather-tag">+2 Jam</div><div class="weather-time">23:00 WIB</div><div class="weather-icon">🌧️</div><div class="weather-temp">25°C</div><div class="weather-label">Hujan Ringan</div></div>
                `;
            }

            slideDiv.innerHTML = `
                <div class="slide-custom weather-slide-container">
                    <div class="slide-custom-header">
                        <h3>${slide.title || 'Prakiraan Cuaca BMKG'}</h3>
                        <p>${slide.subtitle || 'Masjid Merah Baiturrahman - Sukmajaya, Depok'}</p>
                    </div>

                    <div class="weather-slide-body">
                        <div class="weather-current-banner">
                            <div class="weather-current-main">
                                <div class="weather-current-emoji">${currentMeta.icon}</div>
                                <div>
                                    <div class="weather-current-temp-big">${currentTemp}°C</div>
                                    <div class="weather-current-status-text">${currentMeta.label}</div>
                                </div>
                            </div>
                            <div class="weather-current-sub">
                                <div class="weather-sub-item"><span>💧 Kelembaban:</span> <strong>${currentHumidity}%</strong></div>
                                <div class="weather-sub-item"><span>💨 Kecepatan Angin:</span> <strong>${currentWind} km/h</strong></div>
                                <div class="weather-sub-item"><span>📍 Lokasi:</span> <strong>Sukmajaya, Kota Depok</strong></div>
                            </div>
                        </div>

                        <div class="weather-timeline-row">
                            ${timelineItemsMarkup}
                        </div>
                    </div>
                </div>
            `;
        } else if (slide.type === 'image') {
            const showCaption = slide.title && slide.title.trim() !== '' && slide.title !== 'Masjid Merah Baiturrahman Depok';
            const captionMarkup = showCaption ? `
                <div class="slide-caption">
                    <h3>${slide.title}</h3>
                    <p>${slide.subtitle || ''}</p>
                </div>
            ` : '';

            const isMosquePhoto = slide.fit === 'cover' || (slide.image && (slide.image.includes('1.jpg') || slide.image.includes('1764660760626') || slide.image.toLowerCase().includes('masjid')));
            const imgStyle = isMosquePhoto ? 'style="object-fit: cover;"' : '';

            slideDiv.innerHTML = `
                <img src="${slide.image}" alt="${slide.title || 'Poster Masjid'}" class="slide-img" ${imgStyle}>
                ${captionMarkup}
            `;
        } else if (slide.type === 'qris_image' || slide.type === 'qris') {
            const qrisImgSrc = slide.image || 'assets/INFAQ SHODAQOH QRIS.png';
            const bankName = (slide.bankName && !slide.bankName.includes('BSI')) ? slide.bankName : 'Bank Syariah Nasional (BSN)';
            const accountNo = (slide.accountNo && !slide.accountNo.includes('700-1234')) ? slide.accountNo : '7202200221';
            const accountName = slide.accountName || 'Yayasan Masjid Baiturrahman';

            slideDiv.innerHTML = `
                <div class="slide-custom">
                    <div class="slide-custom-header">
                        <h3> ${slide.title}</h3>
                        <p>${slide.subtitle}</p>
                    </div>
                    <div class="qris-slide-grid">
                        <div class="qris-box-graphic">
                            <img src="${qrisImgSrc}" alt="QRIS Resmi YMB" class="qris-actual-img">
                        </div>
                        <div class="qris-info-text">
                            <p>Jika seseorang meninggal, maka terputuslah amalnya kecuali dari yang tiga : Sedekah Jariyah, Ilmu yang bermanfaat dan Anak Sholeh yang mendoakan orang tuanya. (HR. Muslim, no. 1631).</p>
                            <div class="bank-details">
                                <div class="bank-name">${bankName}</div>
                                <div class="acc-no">${accountNo}</div>
                                <div style="font-size:16px; color:#FFF;">a.n. ${accountName}</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else if (slide.type === 'kas_masjid') {
            slideDiv.innerHTML = `
                <div class="slide-custom">
                    <div class="slide-custom-header">
                        <h3>${slide.title || 'Laporan Keuangan Bulanan'}</h3>
                        <p>${slide.subtitle || 'Masjid Merah Baiturrahman Depok'}</p>
                    </div>
                    <div class="kas-slide-container">
                        <div class="kas-month-badge">PERIODE LAPORAN: ${slide.bulan || 'Juli 2026'}</div>
                        <div class="kas-cards-grid">
                            <div class="kas-card kas-pemasukan">
                                <div class="kas-card-header">
                                    <span class="kas-card-icon"></span>
                                    <span class="kas-card-label">TOTAL PEMASUKAN</span>
                                </div>
                                <div class="kas-card-value">${slide.pemasukan || 'Rp 60.445.550'}</div>
                            </div>
                            <div class="kas-card kas-pengeluaran">
                                <div class="kas-card-header">
                                    <span class="kas-card-icon"></span>
                                    <span class="kas-card-label">TOTAL PENGELUARAN</span>
                                </div>
                                <div class="kas-card-value">${slide.pengeluaran || 'Rp 58.670.000'}</div>
                            </div>
                            <div class="kas-card kas-saldo">
                                <div class="kas-card-header">
                                    <span class="kas-card-icon"></span>
                                    <span class="kas-card-label">SALDO AKHIR (KAS)</span>
                                </div>
                                <div class="kas-card-value">${slide.saldoAkhir || 'Rp 1.775.550'}</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else if (slide.type === 'pemasukan_pekan') {
            const periodeParts = [slide.pekan, slide.bulan, slide.tahun].filter(Boolean);
            const periodeStr = periodeParts.length > 0 ? periodeParts.join(' ') : 'Pekan-1 Agustus 2026';
            slideDiv.innerHTML = `
                <div class="slide-custom">
                    <div class="slide-custom-header">
                        <h3>${slide.title || 'Laporan Pemasukkan Setiap Pekan'}</h3>
                        <p>${slide.subtitle || 'Laporan Rekapitulasi Kas Masjid Merah Baiturrahman'}</p>
                    </div>
                    <div class="kas-slide-container">
                        <div class="kas-month-badge">PERIODE LAPORAN: ${periodeStr}</div>
                        <div class="kas-cards-grid single-card-grid">
                            <div class="kas-card kas-pemasukan kas-card-single">
                                <div class="kas-card-header">
                                    <span class="kas-card-label">TOTAL PEMASUKAN</span>
                                </div>
                                <div class="kas-card-value">${slide.pemasukan || 'Rp 15.250.000'}</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        container.appendChild(slideDiv);

        // Build indicator
        const dot = document.createElement('div');
        dot.className = `indicator-dot ${idx === savedIndex ? 'active' : ''}`;
        dot.addEventListener('click', () => showSlide(idx));
        indicators.appendChild(dot);
    });

    const targetIdx = Math.min(savedIndex, settings.slides.length - 1);
    currentSlideIndex = targetIdx;
    startCarouselTimer();
}

function showSlide(index) {
    const slides = document.querySelectorAll('.slide');
    const dots = document.querySelectorAll('.indicator-dot');
    if (slides.length === 0) return;

    slides.forEach(s => s.classList.remove('active'));
    dots.forEach(d => d.classList.remove('active'));

    currentSlideIndex = (index + slides.length) % slides.length;

    slides[currentSlideIndex].classList.add('active');
    if (dots[currentSlideIndex]) dots[currentSlideIndex].classList.add('active');

    // Start timer for current slide's custom duration
    startCarouselTimer();
}

function nextSlide() {
    showSlide(currentSlideIndex + 1);
}

function startCarouselTimer() {
    if (slideIntervalTimer) clearTimeout(slideIntervalTimer);

    if (!settings || !settings.slides || settings.slides.length === 0) return;

    const currentSlide = settings.slides[currentSlideIndex];
    const defaultSec = (settings.displayConfig && settings.displayConfig.slideIntervalSec) || 8;
    const currentDurationSec = (currentSlide && currentSlide.durationSec) ? currentSlide.durationSec : defaultSec;

    slideIntervalTimer = setTimeout(() => {
        nextSlide();
    }, currentDurationSec * 1000);
}

// ----------------------------------------------------
// REALTIME INFAQ QRIS ENGINE (10-ITEM ROTATION & EMAIL TIMESTAMP)
// ----------------------------------------------------
let qrisHistoryBuffer = [];
let qrisRotationIndex = 0;
let qrisRotationTimer = null;

function formatQrisTimestamp(rawDateStr) {
    if (!rawDateStr) return 'via QRIS';

    const match = rawDateStr.match(/(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})\s+(\d{2}:\d{2})/);
    if (match) {
        const datePart = match[1].replace(/-/g, '/');
        const timePart = match[2];

        const now = new Date();
        const dd = String(now.getDate()).padStart(2, '0');
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const yyyy = now.getFullYear();
        const todayStr = `${dd}/${mm}/${yyyy}`;

        if (datePart === todayStr) {
            return `Hari Ini (${timePart} WIB) via QRIS`;
        } else {
            return `${datePart} (${timePart} WIB) via QRIS`;
        }
    }

    return `${rawDateStr} via QRIS`;
}

function displayQrisToastItem(item, isHighlight = false) {
    if (!item) return;

    const donorNameEl = document.getElementById('qrisDonorName');
    const donorAmountEl = document.getElementById('qrisDonorAmount');
    const donorTimeEl = document.getElementById('qrisDonorTime');
    const toastBody = document.getElementById('qrisToastBody');

    if (!donorNameEl || !donorAmountEl || !donorTimeEl || !toastBody) return;

    donorNameEl.innerText = 'Hamba Allah';
    donorAmountEl.innerText = item.total || 'Rp 0';
    donorTimeEl.innerText = formatQrisTimestamp(item.tanggal);

    if (isHighlight) {
        toastBody.classList.remove('toast-highlight');
        void toastBody.offsetWidth; // trigger reflow
        toastBody.classList.add('toast-highlight');
    }
}

function startQrisRotationTimer() {
    if (qrisRotationTimer) clearInterval(qrisRotationTimer);

    // Rotate through 10 last QRIS infaq transactions every 8 seconds
    qrisRotationTimer = setInterval(() => {
        if (qrisHistoryBuffer.length === 0) return;

        qrisRotationIndex = (qrisRotationIndex + 1) % qrisHistoryBuffer.length;
        displayQrisToastItem(qrisHistoryBuffer[qrisRotationIndex], false);
    }, 8000);
}

function simulateQrisInfaq(donorName = 'Hamba Allah', amount = 'Rp 50.000', customTimeStr = null) {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();

    const timeStr = customTimeStr || `${dd}/${month}/${yyyy} ${hh}:${mm}:${ss}`;

    const simItem = {
        rrn: 'SIM_' + Date.now(),
        total: amount,
        customer: donorName,
        tanggal: timeStr
    };

    // Prepend to qrisHistoryBuffer (max 10 items)
    qrisHistoryBuffer.unshift(simItem);
    if (qrisHistoryBuffer.length > 10) qrisHistoryBuffer.pop();

    qrisRotationIndex = 0;
    displayQrisToastItem(simItem, true);
    startQrisRotationTimer();
}

// ----------------------------------------------------
// SETTINGS MODAL FORM MANAGEMENT
// ----------------------------------------------------
function populateSettingsForm() {
    if (!settings) return;

    document.getElementById('inputNama').value = settings.masjid.nama || '';
    document.getElementById('inputSubNama').value = settings.masjid.subNama || '';
    document.getElementById('inputAlamat').value = settings.masjid.alamat || '';

    document.getElementById('inputLat').value = settings.coordinates.latitude || -6.390;
    document.getElementById('inputLng').value = settings.coordinates.longitude || 106.824;
    document.getElementById('inputTZ').value = settings.coordinates.timezone || 7;

    const iq = settings.iqomahMinutes || {};
    document.getElementById('iqFajr').value = iq.fajr || 10;
    document.getElementById('iqDhuhr').value = iq.dhuhr || 10;
    document.getElementById('iqAsr').value = iq.asr || 10;
    document.getElementById('iqMaghrib').value = iq.maghrib || 7;
    document.getElementById('iqIsha').value = iq.isha || 10;

    const sholatSec = (settings.displayConfig && settings.displayConfig.sholatDurationSec) || 900;
    document.getElementById('inputSholatDurationMin').value = Math.floor(sholatSec / 60);

    const kasSlide = (settings.slides || []).find(s => s.type === 'kas_masjid') || {};
    document.getElementById('inputKasBulan').value = kasSlide.bulan || 'Juli 2026';
    document.getElementById('inputKasPemasukan').value = kasSlide.pemasukan || 'Rp 60.445.550';
    document.getElementById('inputKasPengeluaran').value = kasSlide.pengeluaran || 'Rp 58.670.000';

    const pekanSlide = (settings.slides || []).find(s => s.type === 'pemasukan_pekan') || {};
    if (document.getElementById('inputPekan')) document.getElementById('inputPekan').value = pekanSlide.pekan || 'Pekan-1';
    let bulanTahunCombined = pekanSlide.bulan || 'Agustus 2026';
    if (pekanSlide.tahun && !bulanTahunCombined.includes(pekanSlide.tahun)) {
        bulanTahunCombined = `${bulanTahunCombined} ${pekanSlide.tahun}`.trim();
    }
    if (document.getElementById('inputPekanBulan')) document.getElementById('inputPekanBulan').value = bulanTahunCombined;
    if (document.getElementById('inputPekanPemasukan')) document.getElementById('inputPekanPemasukan').value = pekanSlide.pemasukan || 'Rp 15.250.000';

    document.getElementById('inputRunningText').value = (settings.runningText || []).join('\n');

    // QRIS Endpoint URL
    const qrisEndpointEl = document.getElementById('inputQrisEndpoint');
    if (qrisEndpointEl) {
        qrisEndpointEl.value = (settings.qrisConfig && settings.qrisConfig.endpointUrl) || '';
    }
}

function openSettingsModal() {
    populateSettingsForm();
    document.getElementById('settings-modal').classList.remove('hidden');
}

function closeSettingsModal() {
    document.getElementById('settings-modal').classList.add('hidden');
}

function setupModalEventListeners() {
    const triggerBtn = document.getElementById('btn-settings-trigger');
    if (triggerBtn) {
        triggerBtn.addEventListener('click', openSettingsModal);
    }
    document.getElementById('btn-close-settings').addEventListener('click', closeSettingsModal);

    // Keyboard Shortcuts (Esc or S)
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeSettingsModal();
        } else if ((e.key === 's' || e.key === 'S') && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
            openSettingsModal();
        }
    });

    // Form Submit
    document.getElementById('settings-form').addEventListener('submit', (e) => {
        e.preventDefault();

        const runningTextLines = document.getElementById('inputRunningText').value
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        const sholatDurationMin = parseInt(document.getElementById('inputSholatDurationMin').value, 10) || 15;

        // Kas Masjid Slide Update
        const kasBulan = document.getElementById('inputKasBulan').value || 'Juli 2026';
        const kasPemasukan = document.getElementById('inputKasPemasukan').value || 'Rp 60.445.550';
        const kasPengeluaran = document.getElementById('inputKasPengeluaran').value || 'Rp 58.670.000';

        const cleanPem = parseInt(kasPemasukan.replace(/[^0-9]/g, ''), 10) || 0;
        const cleanPeng = parseInt(kasPengeluaran.replace(/[^0-9]/g, ''), 10) || 0;
        const calcSaldo = cleanPem - cleanPeng;
        const formattedSaldo = (calcSaldo !== 0) ? `Rp ${calcSaldo.toLocaleString('id-ID')}` : 'Rp 1.775.550';

        let currentSlides = [...(settings.slides || [])];
        const kasIndex = currentSlides.findIndex(s => s.type === 'kas_masjid');
        const newKasSlide = {
            type: "kas_masjid",
            title: "Laporan Keuangan Bulanan",
            subtitle: "Laporan Rekapitulasi Kas Masjid Merah Baiturrahman",
            bulan: kasBulan,
            pemasukan: kasPemasukan,
            pengeluaran: kasPengeluaran,
            saldoAkhir: formattedSaldo,
            durationSec: 10
        };

        if (kasIndex >= 0) {
            currentSlides[kasIndex] = newKasSlide;
        } else {
            currentSlides.splice(1, 0, newKasSlide);
        }

        // Pemasukan Pekanan Slide Update
        const pekanVal = document.getElementById('inputPekan') ? document.getElementById('inputPekan').value || 'Pekan-1' : 'Pekan-1';
        const pekanBulanVal = document.getElementById('inputPekanBulan') ? document.getElementById('inputPekanBulan').value || 'Agustus 2026' : 'Agustus 2026';
        const pekanPemasukanVal = document.getElementById('inputPekanPemasukan') ? document.getElementById('inputPekanPemasukan').value || 'Rp 15.250.000' : 'Rp 15.250.000';

        const newPekanSlide = {
            type: "pemasukan_pekan",
            title: "Laporan Pemasukkan Setiap Pekan",
            subtitle: "Laporan Rekapitulasi Kas Masjid Merah Baiturrahman",
            pekan: pekanVal,
            bulan: pekanBulanVal,
            tahun: "",
            pemasukan: pekanPemasukanVal,
            durationSec: 10
        };

        const pekanIndex = currentSlides.findIndex(s => s.type === 'pemasukan_pekan');
        if (pekanIndex >= 0) {
            currentSlides[pekanIndex] = newPekanSlide;
        } else {
            const kasIdx = currentSlides.findIndex(s => s.type === 'kas_masjid');
            const insertIdx = (kasIdx >= 0) ? kasIdx + 1 : 2;
            currentSlides.splice(insertIdx, 0, newPekanSlide);
        }

        const updatedSettings = {
            ...settings,
            masjid: {
                nama: document.getElementById('inputNama').value,
                subNama: document.getElementById('inputSubNama').value,
                alamat: document.getElementById('inputAlamat').value
            },
            coordinates: {
                latitude: parseFloat(document.getElementById('inputLat').value),
                longitude: parseFloat(document.getElementById('inputLng').value),
                timezone: parseInt(document.getElementById('inputTZ').value, 10)
            },
            displayConfig: {
                ...(settings.displayConfig || {}),
                sholatDurationSec: sholatDurationMin * 60
            },
            iqomahMinutes: {
                fajr: parseInt(document.getElementById('iqFajr').value, 10),
                dhuhr: parseInt(document.getElementById('iqDhuhr').value, 10),
                asr: parseInt(document.getElementById('iqAsr').value, 10),
                maghrib: parseInt(document.getElementById('iqMaghrib').value, 10),
                isha: parseInt(document.getElementById('iqIsha').value, 10)
            },
            qrisConfig: {
                enabled: true,
                endpointUrl: (document.getElementById('inputQrisEndpoint') ? document.getElementById('inputQrisEndpoint').value.trim() : ''),
                pollIntervalSec: 5
            },
            slides: currentSlides,
            runningText: runningTextLines
        };

        saveSettings(updatedSettings);
        initQrisRealtimeListener();
        closeSettingsModal();
        alert('Pengaturan berhasil disimpan!');
    });

    // Reset Default
    document.getElementById('btn-reset-settings').addEventListener('click', () => {
        if (confirm('Apakah Anda yakin ingin mereset pengaturan ke standar bawaan?')) {
            localStorage.removeItem('ymb_tv_settings');
            initSettings();
            closeSettingsModal();
        }
    });

    // Test Simulator Buttons
    document.getElementById('btn-test-chime').addEventListener('click', () => {
        playMosqueChime();
    });

    document.getElementById('btn-test-iqomah').addEventListener('click', () => {
        closeSettingsModal();
        triggerAdhan('maghrib', 'MAGHRIB (SIMULASI)');
        // Shorten to 30 seconds for quick testing
        iqomahRemainingSeconds = 30;
        iqomahTotalSeconds = 30;
    });

    document.getElementById('btn-test-sholat').addEventListener('click', () => {
        closeSettingsModal();
        triggerSholatMode();
        // Shorten to 15 seconds for testing
        if (sholatTimerId) clearTimeout(sholatTimerId);
        sholatTimerId = setTimeout(endSholatMode, 15000);
    });

    document.getElementById('btn-test-qris').addEventListener('click', () => {
        const donors = ['Hamba Allah', 'Bpk. H. Suparman', 'Ibu Rahmawati', 'Keluarga Bpk. Syafi\'i'];
        const amounts = ['Rp 25.000', 'Rp 50.000', 'Rp 100.000', 'Rp 250.000', 'Rp 500.000'];
        const randomDonor = donors[Math.floor(Math.random() * donors.length)];
        const randomAmount = amounts[Math.floor(Math.random() * amounts.length)];

        simulateQrisInfaq(randomDonor, randomAmount);
    });
}

// ----------------------------------------------------
// REALTIME INFAQ QRIS LIVE POLLING ENGINE (GOOGLE APPS SCRIPT)
// ----------------------------------------------------
let qrisPollTimer = null;
let lastProcessedRrn = localStorage.getItem('ymb_last_qris_rrn') || '';

function initQrisRealtimeListener() {
    if (qrisPollTimer) clearInterval(qrisPollTimer);

    if (!settings || !settings.qrisConfig || !settings.qrisConfig.enabled) return;
    const endpoint = settings.qrisConfig.endpointUrl;
    if (!endpoint || !endpoint.startsWith('http')) return;

    const intervalSec = settings.qrisConfig.pollIntervalSec || 5;

    // Fetch immediately on startup
    fetchLatestQrisTransaction(endpoint);

    // Set polling timer
    qrisPollTimer = setInterval(() => {
        fetchLatestQrisTransaction(endpoint);
    }, intervalSec * 1000);
}

async function fetchLatestQrisTransaction(endpointUrl) {
    try {
        const response = await fetch(endpointUrl);
        if (!response.ok) return;

        const data = await response.json();
        if (!data) return;

        let items = [];
        if (Array.isArray(data.history) && data.history.length > 0) {
            items = data.history;
        } else if (data.latest && data.latest.rrn) {
            items = [data.latest];
        }

        if (items.length === 0) return;

        const formattedItems = items.map(it => ({
            rrn: it.rrn || '',
            total: it.total || 'Rp 0',
            customer: it.customer || 'Hamba Allah',
            tanggal: it.tanggal || new Date().toLocaleString('id-ID')
        }));

        qrisHistoryBuffer = formattedItems.slice(0, 10);

        const latestRrn = data.latest ? data.latest.rrn : (items[0] ? items[0].rrn : '');
        if (latestRrn && latestRrn !== lastProcessedRrn) {
            lastProcessedRrn = latestRrn;
            localStorage.setItem('ymb_last_qris_rrn', lastProcessedRrn);

            qrisRotationIndex = 0;
            displayQrisToastItem(qrisHistoryBuffer[0], true);
            startQrisRotationTimer();
            console.log(`⚡ Live QRIS Notification Triggered: Hamba Allah - ${qrisHistoryBuffer[0].total} (${qrisHistoryBuffer[0].tanggal})`);
        } else if (qrisHistoryBuffer.length > 0 && !qrisRotationTimer) {
            displayQrisToastItem(qrisHistoryBuffer[0], false);
            startQrisRotationTimer();
        }
    } catch (e) {
        console.warn('QRIS Endpoint Polling Error:', e);
    }
}

// ----------------------------------------------------
// INITIALIZATION ON PAGE LOAD
// ----------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
    await initSettings();
    setupModalEventListeners();
    initQrisRealtimeListener();

    // Timers
    updateClock();
    setInterval(updateClock, 1000);

    // Auto-update BMKG Weather every 30 minutes
    setInterval(() => {
        fetchWeatherData();
    }, 1800000);

    // Recalculate prayer times at midnight
    setInterval(() => {
        const now = new Date();
        if (now.getHours() === 0 && now.getMinutes() === 0) {
            calculatePrayerTimes();
        }
    }, 60000);
});