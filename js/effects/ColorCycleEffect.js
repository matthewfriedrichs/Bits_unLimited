import ColorUtils from '../utils/ColorUtils.js';

export default class ColorCycleEffect {
    getControls() {
        return [
            { type: 'slider', id: 'effectValue', label: 'Shift', min: 0, max: 100, step: 1, default: 0 },
            { type: 'number', id: 'cycleStart', label: 'Start Index', default: 0 },
            { type: 'number', id: 'cycleCount', label: 'Color Count', default: 5 }
        ];
    }

    apply({ ctx, border, renderService, width, height, camera }) {
        const zoom = camera.zoom;
        const app = renderService.app;

        // 1. Get Palette
        const palette = app.store.get('currentPalette');
        if (!palette || palette.length === 0) return;

        // 2. Determine Cycle Range
        const start = (border.cycleStart !== undefined) ? Math.max(0, border.cycleStart) : 0;

        // Safety: If start is beyond the palette, we can't cycle anything
        if (start >= palette.length) return;

        const requestedCount = (border.cycleCount !== undefined) ? Math.max(2, border.cycleCount) : 5;

        // FIX: Calculate how many items we can ACTUALLY cycle without going out of bounds
        // If start is 4 and length is 5, we only have 1 item left (index 4).
        // We cannot cycle a group larger than what is available relative to the start.
        const availableSlots = palette.length - start;
        const count = Math.min(requestedCount, availableSlots);

        // If we don't have at least 2 colors to swap, do nothing
        if (count < 2) return;

        // 3. Calculate Shift
        const sliderVal = (border.effectValue !== undefined) ? border.effectValue : 0;
        const shift = Math.floor((sliderVal / 100) * count);

        // 4. Build Map
        const colorMap = {};
        for (let i = 0; i < count; i++) {
            const oldIndex = start + i;

            // Wrap around within the valid [start ... start+count] range
            // The modulo is now safe because it's constrained by 'count' (which fits in the palette)
            const newIndex = start + ((i + shift) % count);

            const oldHex = palette[oldIndex];
            const newHex = palette[newIndex];

            colorMap[oldHex.toLowerCase()] = ColorUtils.hexToRgb(newHex);
        }

        // 5. Render
        const sx = Math.floor((border.x * zoom) + (width / 2 + camera.x));
        const sy = Math.floor((border.y * zoom) + (height / 2 + camera.y));
        const sw = Math.ceil(border.w * zoom);
        const sh = Math.ceil(border.h * zoom);

        if (sw < 1 || sh < 1) return;

        const pCan = document.createElement('canvas');
        pCan.width = sw;
        pCan.height = sh;
        const pCtx = pCan.getContext('2d');
        pCtx.drawImage(renderService.compositeCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

        const imgData = pCtx.getImageData(0, 0, sw, sh);
        const data = imgData.data;

        for (let i = 0; i < data.length; i += 4) {
            const a = data[i + 3];
            if (a === 0) continue;

            const r = data[i], g = data[i + 1], b = data[i + 2];
            const hex = ColorUtils.rgbToHex(r, g, b).toLowerCase();

            if (colorMap[hex]) {
                const newColor = colorMap[hex];
                data[i] = newColor.r;
                data[i + 1] = newColor.g;
                data[i + 2] = newColor.b;
            }
        }

        pCtx.putImageData(imgData, 0, 0);

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(sx, sy, sw, sh);
        ctx.beginPath();
        ctx.rect(sx, sy, sw, sh);
        ctx.clip();
        ctx.drawImage(pCan, sx, sy);
        ctx.restore();
    }
}