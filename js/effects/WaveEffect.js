export default class WaveEffect {
    getControls() {
        return [
            { type: 'slider', id: 'effectValue', label: 'Phase', min: 0, max: 100, value: 0, step: 1, default: 0 },
            { type: 'slider', id: 'amplitude', label: 'Amount', min: 0, max: 20, value: 4, step: 1, default: 4 },
            // NEW: Frequency (Cycles) Slider
            // Step 1 ensures we lock to integers for perfect seamless tiling
            { type: 'slider', id: 'frequency', label: 'Freq', min: 1, max: 10, value: 1, step: 1, default: 1 }
        ];
    }

    apply({ ctx, border, renderService, width, height, camera }) {
        const zoom = camera.zoom;
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

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(sx, sy, sw, sh);
        ctx.beginPath();
        ctx.rect(sx, sy, sw, sh);
        ctx.clip();

        // PARAMS
        const sliderVal = (border.effectValue !== undefined) ? border.effectValue : 0;
        const phase = (sliderVal / 100) * (Math.PI * 2);

        const amplitude = (border.amplitude !== undefined) ? border.amplitude : 4;

        // NEW: Frequency Logic
        // Default to 1 cycle if undefined
        const cycles = (border.frequency !== undefined) ? border.frequency : 1;

        // Calculate angular frequency so that 'cycles' # of waves fit exactly in border.h
        // Formula: (2 * PI * cycles) / totalHeight
        // We use border.h (World Height) to keep the wave consistent regardless of zoom
        const angularFrequency = (Math.PI * 2 * cycles) / border.h;

        for (let y = 0; y < sh; y++) {
            const worldY = Math.floor(y / zoom);

            let screenOffset = 0;
            if (amplitude > 0) {
                // Use the calculated angular frequency
                const worldOffset = Math.round(Math.sin(worldY * angularFrequency + phase) * amplitude);
                screenOffset = worldOffset * zoom;
            }

            ctx.drawImage(pCan, 0, y, sw, 1, sx + screenOffset, sy + y, sw, 1);
        }

        ctx.restore();
    }
}