import BaseTool from './BaseTool.js';
import BrushGenerator from '../utils/BrushGenerator.js';

export default class PenTool extends BaseTool {
    constructor(app, isEraser = false) {
        super(app);
        this.isEraser = isEraser;
        this.lastPos = null;
        this.strokePixels = new Set();
        this.buffer = [];
        this.ppHistory = [];
    }

    // Helper to get the correct brush state object name
    get brushStateKey() {
        return this.isEraser ? 'eraserBrush' : 'activeBrush';
    }

    get settings() {
        // Eraser now has full settings!
        const brush = this.app.store.get(this.brushStateKey);
        const customShapes = this.app.store.get('customShapes') || [];

        const shapeOptions = [
            { id: 'square', label: 'Square' },
            { id: 'circle', label: 'Circle' },
            { id: 'diamond', label: 'Diamond' },
            { id: 'star', label: 'Star' },
            ...customShapes.map(s => ({ id: s.id, label: s.name }))
        ];

        // Basic options for Eraser (No Mode/Dither/Shade)
        const commonSettings = [
            { id: 'size', type: 'range', label: 'Size', min: 1, max: 32, value: brush.size },
            { id: 'shape', type: 'brush-picker', label: 'Brush Shape', options: shapeOptions, value: brush.shape },
            { id: 'pixelPerfect', type: 'toggle', label: 'Pixel Perfect', value: brush.pixelPerfect || false }
        ];

        // Only Pen gets Mode (Eraser is always "Erase" mode implicitly)
        if (!this.isEraser) {
            commonSettings.splice(2, 0, {
                id: 'mode', type: 'select', label: 'Mode', options: [
                    { id: 'normal', label: 'Normal' },
                    { id: 'dither', label: 'Dither' },
                    { id: 'shade-up', label: 'Shade (+)' },
                    { id: 'shade-down', label: 'Shade (-)' }
                ], value: brush.mode
            });
        }

        return commonSettings;
    }

    setSetting(key, val) {
        const stateKey = this.brushStateKey;
        const brush = { ...this.app.store.get(stateKey) };
        brush[key] = val;

        if (key === 'shape' || key === 'size') {
            const customShapes = this.app.store.get('customShapes') || [];
            brush.footprint = BrushGenerator.generate(brush.shape, brush.size, customShapes);
        }

        this.app.store.set(stateKey, brush);
    }

    onPointerDown(p) {
        this.strokePixels.clear();
        this.buffer = [];
        this.ppHistory = [];
        this.lastPos = { x: p.x, y: p.y };
        this.handlePoint(p.x, p.y);
    }

    onPointerMove(p) {
        if (!this.lastPos) return;
        this.line(this.lastPos.x, this.lastPos.y, p.x, p.y);
        this.lastPos = { x: p.x, y: p.y };
    }

    onPointerUp(p) {
        this.lastPos = null;
        this.commit();
    }

    line(x0, y0, x1, y1) {
        let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
        let sx = (x0 < x1) ? 1 : -1, sy = (y0 < y1) ? 1 : -1;
        let err = dx - dy;

        while (true) {
            this.handlePoint(x0, y0);
            if (x0 === x1 && y0 === y1) break;
            let e2 = 2 * err;
            if (e2 > -dy) { err -= dy; x0 += sx; }
            if (e2 < dx) { err += dx; y0 += sy; }
        }
    }

    handlePoint(x, y) {
        if (this.ppHistory.length > 0) {
            const last = this.ppHistory[this.ppHistory.length - 1];
            if (last.x === x && last.y === y) return;
        }

        const brush = this.app.store.get(this.brushStateKey);

        if (brush.pixelPerfect && this.ppHistory.length >= 2) {
            const last = this.ppHistory[this.ppHistory.length - 1];
            const prev = this.ppHistory[this.ppHistory.length - 2];

            if (Math.abs(x - prev.x) === 1 && Math.abs(y - prev.y) === 1) {
                this.undoLastPoint();
            }
        }

        const pixelCount = this.plot(x, y);
        this.ppHistory.push({ x, y, pixelCount });
    }

    undoLastPoint() {
        const last = this.ppHistory.pop();
        if (last && last.pixelCount > 0) {
            const removed = this.buffer.splice(this.buffer.length - last.pixelCount, last.pixelCount);
            removed.forEach(p => {
                this.strokePixels.delete(`${p.x},${p.y}`);
            });
        }
    }

    plot(cx, cy) {
        const brush = this.app.store.get(this.brushStateKey);
        const primaryColor = this.app.store.get('primaryColor');
        const palette = this.app.store.get('currentPalette');
        const footprint = brush.footprint || [{ x: 0, y: 0 }];
        let addedCount = 0;

        for (const pt of footprint) {
            const x = cx + pt.x;
            const y = cy + pt.y;
            const key = `${x},${y}`;

            if (this.strokePixels.has(key)) continue;

            let finalColor = primaryColor;
            let shouldDraw = true;

            if (this.isEraser) {
                finalColor = null;
            } else {
                if (brush.mode === 'dither') {
                    if ((Math.abs(x) + Math.abs(y)) % 2 !== 0) shouldDraw = false;
                }
                if (brush.mode === 'shade-up' || brush.mode === 'shade-down') {
                    const projectService = this.app.services.get('project');
                    const currentColor = projectService.getPixelColor(x, y);
                    if (currentColor) {
                        const lowerPalette = palette.map(c => c.toLowerCase());
                        const idx = lowerPalette.indexOf(currentColor.toLowerCase());
                        if (idx !== -1) {
                            const shift = (brush.mode === 'shade-up') ? 1 : -1;
                            const len = palette.length;
                            finalColor = palette[(idx + shift + len) % len];
                        } else shouldDraw = false;
                    } else shouldDraw = false;
                }
            }

            if (shouldDraw) {
                this.strokePixels.add(key);
                this.buffer.push({ x, y, color: finalColor });
                addedCount++;
            }
        }
        return addedCount;
    }

    commit() {
        if (this.buffer.length > 0) {
            const payload = this.buffer.map(p => ({
                x: p.x, y: p.y, color: p.color, erase: (p.color === null)
            }));
            this.app.bus.emit('requestBatchPixels', payload);
            this.buffer = [];
        }
    }

    onRender(ctx) {
        if (this.buffer.length > 0) {
            ctx.save();
            for (const p of this.buffer) {
                if (p.color === null) {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                    ctx.fillRect(p.x, p.y, 1, 1);
                    ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
                    ctx.strokeRect(p.x, p.y, 1, 1);
                } else {
                    ctx.fillStyle = p.color;
                    ctx.fillRect(p.x, p.y, 1, 1);
                }
            }
            ctx.restore();
        }
    }
}