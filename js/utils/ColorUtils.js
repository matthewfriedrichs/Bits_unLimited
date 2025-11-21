export default class ColorUtils {
    static hexToRgb(hex) { const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex); return r ? { r: parseInt(r[1], 16), g: parseInt(r[2], 16), b: parseInt(r[3], 16) } : { r: 0, g: 0, b: 0 }; }
    static rgbToHex(r, g, b) { return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1); }
    static rgbToHsv(r, g, b) { r /= 255; g /= 255; b /= 255; const max = Math.max(r, g, b), min = Math.min(r, g, b); let h, s, v = max, d = max - min; s = max === 0 ? 0 : d / max; if (max === min) h = 0; else { switch (max) { case r: h = (g - b) / d + (g < b ? 6 : 0); break; case g: h = (b - r) / d + 2; break; case b: h = (r - g) / d + 4; break; }h /= 6; } return { h: Math.round(h * 360), s: Math.round(s * 100), v: Math.round(v * 100) }; }
    static hsvToRgb(h, s, v) { let r, g, b, i = Math.floor(h / 60), f = h / 60 - i, p = v * (1 - s / 100), q = v * (1 - f * s / 100), t = v * (1 - (1 - f) * s / 100); v /= 100; p /= 100; q /= 100; t /= 100; switch (i % 6) { case 0: r = v; g = t; b = p; break; case 1: r = q; g = v; b = p; break; case 2: r = p; g = v; b = t; break; case 3: r = p; g = q; b = v; break; case 4: r = t; g = p; b = v; break; case 5: r = v; g = p; b = q; break; } return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) }; }
    static hexToHsv(hex) { const rgb = this.hexToRgb(hex); return this.rgbToHsv(rgb.r, rgb.g, rgb.b); }
    static hsvToHex(h, s, v) { const rgb = this.hsvToRgb(h, s, v); return this.rgbToHex(rgb.r, rgb.g, rgb.b); }

    static getRecommendations(h, s, v) {
        const toHex = (h2, s2, v2) => this.hsvToHex((h2 + 360) % 360, Math.max(0, Math.min(100, s2)), Math.max(0, Math.min(100, v2)));

        // Helper: Shift hue towards a target hue by a slight amount (15 degrees)
        // This simulates warm highlights (towards yellow) and cool shadows (towards purple)
        const shiftHue = (curr, target, amount) => {
            let diff = target - curr;
            // Handle Wrap Around (e.g. 350 to 10)
            if (diff > 180) diff -= 360;
            if (diff < -180) diff += 360;

            // If we are close enough, just snap to target
            if (Math.abs(diff) < amount) return target;

            return curr + Math.sign(diff) * amount;
        };

        return [
            { label: "Comp", color: toHex(h + 180, s, v) },
            { label: "Ana-1", color: toHex(h - 30, s, v) },
            { label: "Ana-2", color: toHex(h + 30, s, v) },
            { label: "Mono-1", color: toHex(h, s, v - 30) }, // Standard Shadow
            { label: "Mono-2", color: toHex(h, s, v + 30) }, // Standard Highlight

            // New Hue-Shifted Recommendations
            // Shade: Shift to Purple (260), Saturate (+10), Darken (-20)
            { label: "Shade", color: toHex(shiftHue(h, 260, 15), s + 10, v - 20) },

            // Tint: Shift to Yellow (60), Desaturate (-10), Lighten (+20)
            { label: "Tint", color: toHex(shiftHue(h, 60, 15), s - 10, v + 20) }
        ];
    }

    static getInversion(hex) { const rgb = this.hexToRgb(hex); return this.rgbToHex(255 - rgb.r, 255 - rgb.g, 255 - rgb.b); }
}