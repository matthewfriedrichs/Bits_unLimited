export default class PixelateEffect {
    apply({ ctx, border }) {
        // Simple visualization for now (placeholder for real pixelation logic)
        ctx.save();
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(border.x, border.y, border.w, border.h);
        ctx.restore();
    }
}