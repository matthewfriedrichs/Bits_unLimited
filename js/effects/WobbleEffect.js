export default class WobbleEffect {
    apply({ ctx, border, renderService, width, height, camera }) {
        const zoom = camera.zoom;

        // 1. Calculate Screen Coordinates
        const sx = Math.floor((border.x * zoom) + (width / 2 + camera.x));
        const sy = Math.floor((border.y * zoom) + (height / 2 + camera.y));
        const sw = Math.ceil(border.w * zoom);
        const sh = Math.ceil(border.h * zoom);

        if (sw < 1 || sh < 1) return;

        // 2. Capture the original pixels inside the border
        const pCan = document.createElement('canvas');
        pCan.width = sw;
        pCan.height = sh;
        const pCtx = pCan.getContext('2d');
        
        // We grab from compositeCanvas (the clean layers) 
        // so we don't wobble the wobble if it renders twice!
        pCtx.drawImage(renderService.compositeCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

        ctx.save();
        
        // Reset to screen space to do pixel-level manipulation
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        // 3. Clear the original area 
        // (Otherwise the straight image would show behind the wobbly one)
        ctx.clearRect(sx, sy, sw, sh);

        // 4. Clip to the border box
        // This ensures the wobble doesn't spill out onto the UI background
        ctx.beginPath();
        ctx.rect(sx, sy, sw, sh);
        ctx.clip();

        // 5. Draw Slices (The Math)
        const time = Date.now() / 200; // Speed of animation
        const waveSize = 1.0;          // World pixels (how "wide" the swing is)
        const amplitude = waveSize * zoom; 
        const frequency = 0.5;         // How many waves fit in the box

        for (let y = 0; y < sh; y++) {
            // We use (y / zoom) to make the wave frequency match world-space pixels 
            // rather than screen pixels, so it looks consistent at different zoom levels.
            const offset = Math.sin((y / zoom) * frequency + time) * amplitude;

            // Draw a 1px high strip, shifted horizontally
            ctx.drawImage(
                pCan,
                0, y, sw, 1,           // Source Strip
                sx + offset, sy + y, sw, 1 // Dest Strip (Shifted)
            );
        }

        ctx.restore();
    }
}