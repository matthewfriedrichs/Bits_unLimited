export default class BrushManager {
    static generatePixels(x, y, config, app, strokePixels) {
        const pixels = [];
        const size = config.size || 1;
        const r = Math.floor(size / 2);
        const coords = [];

        // 1. Shape Generation
        if (config.shape === 'circle' && size > 1) {
            for (let dx = -r; dx <= r; dx++) { for (let dy = -r; dy <= r; dy++) { if (dx * dx + dy * dy <= r * r + 0.5) coords.push({ x: x + dx, y: y + dy }); } }
        } else {
            const start = size % 2 === 0 ? -r : -r; const end = size % 2 === 0 ? r - 1 : r;
            for (let dx = start; dx <= end; dx++) { for (let dy = start; dy <= end; dy++) { coords.push({ x: x + dx, y: y + dy }); } }
        }

        // 2. Logic Application
        coords.forEach(pt => {
            const key = `${pt.x},${pt.y}`;

            // Shading Guard: Only shade a pixel once per stroke
            if ((config.mode === 'shade-up' || config.mode === 'shade-down') && strokePixels && strokePixels.has(key)) return;

            let color = app.state.primaryColor;
            let shouldDraw = true;

            // Custom Pattern
            if (config.shape === 'custom') {
                const pat = config.customPattern || [];
                if (config.aligned) {
                    const py = ((pt.y % size) + size) % size; const px = ((pt.x % size) + size) % size;
                    if (!pat[py * size + px]) shouldDraw = false;
                } else {
                    const start = size % 2 === 0 ? -r : -r; const px = pt.x - x - start; const py = pt.y - y - start;
                    if (px >= 0 && px < size && py >= 0 && py < size) { if (!pat[py * size + px]) shouldDraw = false; }
                }
            }

            // Dither Pattern
            if (config.mode === 'dither') {
                if (config.pattern === 'checker' && (Math.abs(pt.x) + Math.abs(pt.y)) % 2 !== 0) shouldDraw = false;
                if (config.pattern === 'lines-v' && Math.abs(pt.x) % 2 !== 0) shouldDraw = false;
                if (config.pattern === 'lines-h' && Math.abs(pt.y) % 2 !== 0) shouldDraw = false;
            }

            // Shading Calculation
            if (config.mode === 'shade-up' || config.mode === 'shade-down') {
                shouldDraw = false;
                const currentHex = app.getDataPixel(pt.x, pt.y);
                if (currentHex) {
                    const palette = app.state.currentPalette.map(c => c.toLowerCase());
                    const idx = palette.indexOf(currentHex.toLowerCase());
                    if (idx !== -1) {
                        const shift = config.mode === 'shade-up' ? 1 : -1;
                        // Mathematical wrap around
                        const len = palette.length;
                        const newIdx = (idx + shift + len) % len;
                        color = app.state.currentPalette[newIdx];
                        shouldDraw = true;
                        if (strokePixels) strokePixels.add(key);
                    }
                }
            }
            if (shouldDraw) pixels.push({ x: pt.x, y: pt.y, color });
        });
        return pixels;
    }
}