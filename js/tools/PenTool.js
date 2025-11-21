import BaseTool from './BaseTool.js';
import BrushManager from '../utils/BrushManager.js';

export default class PenTool extends BaseTool {
    constructor(app, isEraser = false) {
        super(app);
        this.isEraser = isEraser;
        this.lastPos = null;
        this.strokePixels = new Set();
        this.buffer = []; // <--- Stores pixels for the active stroke
    }

    onPointerDown(p) {
        this.strokePixels.clear();
        this.buffer = [];
        this.draw(p);
        this.lastPos = { x: p.x, y: p.y };
    }

    onPointerMove(p) {
        if (this.lastPos) {
            this.drawLine(this.lastPos.x, this.lastPos.y, p.x, p.y);
        } else {
            this.draw(p);
        }
        this.lastPos = { x: p.x, y: p.y };
    }

    onPointerUp(p) {
        this.lastPos = null;
        this.commit(); // <--- Commit changes to Data Model on release
    }

    drawLine(x0, y0, x1, y1) {
        let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
        let sx = (x0 < x1) ? 1 : -1, sy = (y0 < y1) ? 1 : -1;
        let err = dx - dy;

        while (true) {
            this.draw({ x: x0, y: y0 });
            if (x0 === x1 && y0 === y1) break;
            let e2 = 2 * err;
            if (e2 > -dy) { err -= dy; x0 += sx; }
            if (e2 < dx) { err += dx; y0 += sy; }
        }
    }

    draw({ x, y }) {
        if (this.isEraser) {
            // Eraser remains "Immediate Mode" for correctness 
            // (Visualizing 'erasing' on top of a cached image is complex)
            this.app.bus.emit('requestPixelChange', { x, y, color: null, erase: true });
        } else {
            // Pen: Buffered Mode
            const pixels = BrushManager.generatePixels(x, y, this.app.state.activeBrush, this.app, this.strokePixels);
            if (pixels && pixels.length > 0) {
                // Add to local buffer for fast rendering
                this.buffer.push(...pixels);
                // We DO NOT emit 'requestBatchPixels' here. That triggers the laggy cache update.
            }
        }
    }

    commit() {
        if (this.buffer.length > 0) {
            // Send everything to DataPlugin in one big chunk
            this.app.bus.emit('requestBatchPixels', this.buffer);
            this.buffer = [];
        }
    }

    // High-Performance Render Loop
    onRender(ctx) {
        // Draw the Buffered Stroke on top of the cached canvas
        if (!this.isEraser && this.buffer.length > 0) {
            ctx.save();
            for (const p of this.buffer) {
                ctx.fillStyle = p.color;
                ctx.fillRect(p.x, p.y, 1, 1);
            }
            ctx.restore();
        }
    }
}