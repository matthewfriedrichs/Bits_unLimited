export default class WaveEffect {
    apply({ ctx, border, renderService, width, height, camera }) {
        const zoom = camera.zoom;

        // 1. Calculate Screen Coordinates
        const sx = Math.floor((border.x * zoom) + (width / 2 + camera.x));
        const sy = Math.floor((border.y * zoom) + (height / 2 + camera.y));
        const sw = Math.ceil(border.w * zoom);
        const sh = Math.ceil(border.h * zoom);

        if (sw < 1 || sh < 1) return;

        // 2. Capture Source
        const pCan = document.createElement('canvas');
        pCan.width = sw;
        pCan.height = sh;
        const pCtx = pCan.getContext('2d');
        pCtx.drawImage(renderService.compositeCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        // 3. Clear Destination Area
        ctx.clearRect(sx, sy, sw, sh);
        ctx.beginPath();
        ctx.rect(sx, sy, sw, sh);
        ctx.clip();

        // 4. Calculate Wave Parameters
        // We map the slider (0-100) to a full radian cycle (0 to 2PI)
        // This allows the user to "scrub" through the wave phase.
        const sliderVal = (border.effectValue !== undefined) ? border.effectValue : 0;
        const phase = (sliderVal / 100) * (Math.PI * 2);
        
        const amplitude = 4; // Max distortion in WORLD pixels
        const frequency = 0.5; 

        // 5. Draw Slices
        for (let y = 0; y < sh; y++) {
            // Convert screen Y to world Y to calculate the physics of the wave
            // This ensures the wave shape doesn't change just because you zoomed in
            const worldY = Math.floor(y / zoom);
            
            // Calculate offset, round to nearest integer for "Pixel Perfect" look
            const worldOffset = Math.round(Math.sin(worldY * frequency + phase) * amplitude);
            
            // Scale back up to screen space
            const screenOffset = worldOffset * zoom;

            ctx.drawImage(
                pCan,
                0, y, sw, 1,               // Source Slice
                sx + screenOffset, sy + y, sw, 1 // Dest Slice
            );
        }

        ctx.restore();
    }
}