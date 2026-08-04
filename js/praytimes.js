// PrayTimes.js: High Precision Prayer Times Calculation Engine
// Kemenag RI / MABIMS Standard (Subuh 20°, Isya 18°, Depok Lat -6.390, Long 106.824, UTC+7)

class PrayTimes {
    constructor(method = 'Kemenag') {
        this.calcMethod = method;

        // Kemenag RI parameters: Fajr 20°, Isha 18°
        this.settings = {
            fajr: 20,
            dhuhr: '2 min', // +2 minutes safety buffer (Ithiyati Kemenag)
            asr: 1,         // Standard Shafi/Maliki/Hanbali (shadow ratio = 1)
            maghrib: '2 min',// +2 minutes Ithiyati
            isha: 18
        };

        // Custom offsets in minutes for Depok Kemenag alignment
        this.offsets = {
            imsak: 1,
            fajr: 3,
            sunrise: 0,
            dhuhr: 3,
            asr: 3,
            maghrib: 4,
            isha: 3
        };
    }

    // Trigonometric functions in degrees
    dsin(d) { return Math.sin(this.radians(d)); }
    dcos(d) { return Math.cos(this.radians(d)); }
    dtan(d) { return Math.tan(this.radians(d)); }
    dasin(x) { return this.degrees(Math.asin(Math.max(-1, Math.min(1, x)))); }
    dacos(x) { return this.degrees(Math.acos(Math.max(-1, Math.min(1, x)))); }
    datan(x) { return this.degrees(Math.atan(x)); }
    datan2(y, x) { return this.degrees(Math.atan2(y, x)); }

    radians(d) { return d * (Math.PI / 180.0); }
    degrees(r) { return r * (180.0 / Math.PI); }

    fixangle(a) { return this.fix(a, 360); }
    fixhour(a) { return this.fix(a, 24); }
    fix(a, b) {
        a = a - b * (Math.floor(a / b));
        return a < 0 ? a + b : a;
    }

    // Julian Date calculation
    julianDate(year, month, day) {
        if (month <= 2) {
            year -= 1;
            month += 12;
        }
        const A = Math.floor(year / 100);
        const B = 2 - A + Math.floor(A / 4);
        return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + B - 1524.5;
    }

    // Solar Position
    sunPosition(jd) {
        const D = jd - 2451545.0;
        const g = this.fixangle(357.529 + 0.98560028 * D);
        const q = this.fixangle(280.459 + 0.98564736 * D);
        const L = this.fixangle(q + 1.915 * this.dsin(g) + 0.020 * this.dsin(2 * g));

        const e = 23.439 - 0.00000036 * D;
        const RA = this.datan2(this.dcos(e) * this.dsin(L), this.dcos(L)) / 15;
        const decl = this.dasin(this.dsin(e) * this.dsin(L));
        const EqT = q / 15 - this.fixhour(RA);

        return { declination: decl, equation: EqT };
    }

    // Solar Noon (Midday) in Local Time
    midDay(EqT, lng, timeZone) {
        const noonUtc = 12 - EqT;
        return this.fixhour(noonUtc + (timeZone - lng / 15));
    }

    // Hour Angle calculation for a given angle below horizon
    // angleBelowHorizon: e.g. 20 for Subuh, 18 for Isya, 0.833 for Sunrise/Sunset
    hourAngle(angleBelowHorizon, lat, decl) {
        const alt = -angleBelowHorizon; // Solar altitude relative to horizon
        const top = this.dsin(alt) - this.dsin(lat) * this.dsin(decl);
        const bottom = this.dcos(lat) * this.dcos(decl);
        const cosH = top / bottom;

        if (cosH < -1 || cosH > 1) return NaN;
        return this.dacos(cosH) / 15; // in hours
    }

    // Hour Angle calculation for Asr (solar altitude above horizon)
    asrHourAngle(shadowFactor, lat, decl) {
        // Solar altitude at Asr: atan(1 / (factor + tan(|lat - decl|)))
        const alt = this.datan(1 / (shadowFactor + this.dtan(Math.abs(lat - decl))));
        const top = this.dsin(alt) - this.dsin(lat) * this.dsin(decl);
        const bottom = this.dcos(lat) * this.dcos(decl);
        const cosH = top / bottom;

        if (cosH < -1 || cosH > 1) return NaN;
        return this.dacos(cosH) / 15;
    }

    // Main calculation function
    getTimes(date, coords, timezone) {
        const lat = coords[0];
        const lng = coords[1];

        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();

        // Julian Date at 00:00 UTC
        const jd = this.julianDate(year, month, day);
        const sun = this.sunPosition(jd + 0.5 - lng / (15 * 24));

        const noon = this.midDay(sun.equation, lng, timezone);

        // Calculate Hour Angles
        const hFajr = this.hourAngle(this.settings.fajr, lat, sun.declination);
        const hSunrise = this.hourAngle(0.833, lat, sun.declination);
        const hAsr = this.asrHourAngle(this.settings.asr, lat, sun.declination);
        const hSunset = this.hourAngle(0.833, lat, sun.declination);
        const hIsha = this.hourAngle(this.settings.isha, lat, sun.declination);

        // Times in hours
        const fajr = noon - hFajr;
        const sunrise = noon - hSunrise;
        const dhuhr = noon;
        const asr = noon + hAsr;
        const sunset = noon + hSunset;
        const maghrib = sunset;
        const isha = noon + hIsha;
        const imsak = fajr - (10 / 60);

        const rawTimes = { imsak, fajr, sunrise, dhuhr, asr, sunset, maghrib, isha };

        // Apply offsets & format to HH:MM
        const formatted = {};
        for (const key in rawTimes) {
            let t = rawTimes[key];
            if (isNaN(t)) {
                formatted[key] = '--:--';
                continue;
            }

            // Add Ithiyati / custom offsets (in minutes)
            const offsetMin = (this.offsets[key] || 0);
            t += offsetMin / 60;

            formatted[key] = this.floatToTime(t);
        }

        return formatted;
    }

    floatToTime(time) {
        time = this.fixhour(time + 0.5 / 3600); // add 0.5 sec for rounding
        const hours = Math.floor(time);
        const minutes = Math.floor((time - hours) * 60);

        const hh = String(hours).padStart(2, '0');
        const mm = String(minutes).padStart(2, '0');

        return `${hh}:${mm}`;
    }
}

// Global instance export
window.prayTimes = new PrayTimes('Kemenag');
