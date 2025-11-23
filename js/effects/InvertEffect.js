export default class InvertEffect {
    apply({ ctx, border, renderService }) {
        // Safe Invert using GPU Composition
        ctx.save();

        // 1. Define the Area
        ctx.beginPath();
        ctx.rect(border.x, border.y, border.w, border.h);
        ctx.clip(); // Restrict drawing to this region

        // 2. Difference with White (Inverts Color)
        ctx.globalCompositeOperation = 'difference';
        ctx.fillStyle = 'white';
        ctx.fillRect(border.x, border.y, border.w, border.h);

        // 3. Restore Alpha (The "Safe" Trick)
        // We use the composite canvas (the source image) to mask the inverted result
        // so we don't turn transparent pixels into white pixels.
        ctx.globalCompositeOperation = 'destination-in';

        // Reset transform to draw the screen-space composite correctly
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(renderService.compositeCanvas, 0, 0);

        ctx.restore();
    }
}