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

        // Straight Line State
        this.isLineMode = false;
        this.lineStart = null;
        this.lineEnd = null;
    }

    get brushStateKey() {
        return this.isEraser ? 'eraserBrush' : 'activeBrush';
    }

    get settings() {
        const brush = this.app.store.get(this.brushStateKey);
        const customShapes = this.app.store.get('customShapes') || [];

        const shapeOptions = [
            { id: 'square', label: 'Square' },
            { id: 'circle', label: 'Circle' },
            { id: 'diamond', label: 'Diamond' },
            { id: 'star', label: 'Star' },
            ...customShapes.map(s => ({ id: s.id, label: s.name }))
        ];

        const commonSettings = [
            { id: 'size', type: 'range', label: 'Size', min: 1, max: 32, value: brush.size },
            { id: 'shape', type: 'brush-picker', label: 'Brush Shape', options: shapeOptions, value: brush.shape },

            { id: 'angle', type: 'range', label: 'Angle (°)', min: 0, max: 360, value: brush.angle || 0 },
            { id: 'angleJitter', type: 'range', label: 'Angle Jitter', min: 0, max: 180, value: brush.angleJitter || 0 },
            { id: 'noise', type: 'range', label: 'Noise (%)', min: 0, max: 100, value: brush.noise || 0 },

            { id: 'pixelPerfect', type: 'toggle', label: 'Pixel Perfect', value: brush.pixelPerfect || false }
        ];

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

        if (p.originalEvent && (p.originalEvent.ctrlKey || p.originalEvent.metaKey)) {
            this.isLineMode = true;
            this.lineStart = { x: p.x, y: p.y };
            this.lineEnd = { x: p.x, y: p.y };
        } else {
            this.isLineMode = false;
            this.lineStart = null;
            this.lineEnd = null;
        }

        this.handlePoint(p.x, p.y);
    }

    onPointerMove(p) {
        if (!this.lastPos) return;

        if (this.isLineMode) {
            let tx = p.x;
            let ty = p.y;

            // Shift Key -> Snap to 8-way AND Isometric (2:1 slopes)
            if (p.originalEvent && p.originalEvent.shiftKey && this.lineStart) {
                const dx = p.x - this.lineStart.x;
                const dy = p.y - this.lineStart.y;
                const angle = Math.atan2(dy, dx);
                const dist = Math.sqrt(dx * dx + dy * dy);

                // Define valid angles (Cardinal + Diagonal + Isometric)
                // Iso 1: Slope 0.5 (26.565°) | Iso 2: Slope 2.0 (63.435°)
                const iso1 = Math.atan(0.5);
                const iso2 = Math.atan(2);

                // All 16 valid angles in radians (-PI to PI)
                const snapAngles = [
                    // Cardinals
                    0, Math.PI / 2, Math.PI, -Math.PI / 2,
                    // Diagonals
                    Math.PI / 4, 3 * Math.PI / 4, -3 * Math.PI / 4, -Math.PI / 4,
                    // Isometric Q1
                    iso1, iso2,
                    // Isometric Q2
                    Math.PI - iso1, Math.PI - iso2,
                    // Isometric Q3
                    -Math.PI + iso1, -Math.PI + iso2,
                    // Isometric Q4
                    -iso1, -iso2
                ];

                // Find closest angle
                let closest = 0;
                let minDiff = Infinity;

                // Normalize check to handle PI/-PI wrapping
                const normalize = (a) => {
                    while (a > Math.PI) a -= 2 * Math.PI;
                    while (a <= -Math.PI) a += 2 * Math.PI;
                    return a;
                };

                snapAngles.forEach(a => {
                    let diff = Math.abs(normalize(angle - a));
                    if (diff < minDiff) {
                        minDiff = diff;
                        closest = a;
                    }
                });

                // Project new point
                tx = Math.round(this.lineStart.x + Math.cos(closest) * dist);
                ty = Math.round(this.lineStart.y + Math.sin(closest) * dist);
            }

            this.lineEnd = { x: tx, y: ty };
            this.app.bus.emit('render', this.app.ctx);
        } else {
            this.line(this.lastPos.x, this.lastPos.y, p.x, p.y);
            this.lastPos = { x: p.x, y: p.y };
        }
    }

    onPointerUp(p) {
        if (this.isLineMode && this.lineStart && this.lineEnd) {
            this.line(this.lineStart.x, this.lineStart.y, this.lineEnd.x, this.lineEnd.y);
        }

        this.lastPos = null;
        this.isLineMode = false;
        this.lineStart = null;
        this.lineEnd = null;

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

        let angle = brush.angle || 0;
        if (brush.angleJitter > 0) {
            angle += (Math.random() - 0.5) * brush.angleJitter * 2;
        }

        const hasRotation = Math.abs(angle) % 360 > 0.1;
        let cos, sin;
        if (hasRotation) {
            const rad = angle * (Math.PI / 180);
            cos = Math.cos(rad);
            sin = Math.sin(rad);
        }

        for (const pt of footprint) {
            if (brush.noise > 0 && (Math.random() * 100) < brush.noise) continue;

            let tx = pt.x;
            let ty = pt.y;
            if (hasRotation) {
                tx = Math.round(pt.x * cos - pt.y * sin);
                ty = Math.round(pt.x * sin + pt.y * cos);
            }

            const x = cx + tx;
            const y = cy + ty;
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

        if (this.isLineMode && this.lineStart && this.lineEnd) {
            ctx.save();
            const zoom = this.app.store.get('camera').zoom;

            ctx.beginPath();
            ctx.moveTo(this.lineStart.x + 0.5, this.lineStart.y + 0.5);
            ctx.lineTo(this.lineEnd.x + 0.5, this.lineEnd.y + 0.5);

            ctx.lineWidth = 2 / zoom;
            ctx.strokeStyle = this.isEraser ? '#ff0000' : '#000000';
            ctx.setLineDash([5 / zoom, 5 / zoom]);
            ctx.stroke();

            ctx.strokeStyle = '#ffffff';
            ctx.lineDashOffset = 5 / zoom;
            ctx.stroke();

            ctx.restore();
        }
    }
}