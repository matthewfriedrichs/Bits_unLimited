import BaseTool from './BaseTool.js';
import BrushGenerator from '../utils/BrushGenerator.js';
import { PixelBatchCommand } from '../commands/PixelCommands.js';
import { ToolIcon, ToolSidebar } from '../ui/components/ToolDef.js';

export default class BrushTool extends BaseTool {
    constructor(app, isEraser = false) {
        super(app);
        this.isEraser = isEraser;
        this.lastPos = null;
        this.strokePixels = new Set();
        this.buffer = [];
        this.ppHistory = [];

        this.isLineMode = false;
        this.lineStart = null;
        this.lineEnd = null;

        // Track if we are currently drawing inside a tiled region
        this.activeTiledBorder = null;
    }

    get brushStateKey() { return this.isEraser ? 'eraserBrush' : 'activeBrush'; }

    get iconDef() {
        const brush = this.app.store.get(this.brushStateKey);

        if (this.isEraser) {
            return new ToolIcon({
                icon: 'eraser',
                label: 'Eraser',
                color: 'text-rose-400',
                hotkey: 'E',
                overlayIcon: brush.pixelPerfect ? 'pen' : null
            });
        }

        return new ToolIcon({
            icon: 'paint-brush',
            label: 'Brush Tool',
            color: 'text-sky-400',
            hotkey: 'B',
            overlayIcon: brush.pixelPerfect ? 'pen' : null
        });
    }

    get sidebarDef() {
        const brush = this.app.store.get(this.brushStateKey);
        const customShapes = this.app.store.get('customShapes') || [];

        const shapeOptions = [
            { id: 'square', label: 'Square' },
            { id: 'circle', label: 'Circle' },
            { id: 'diamond', label: 'Diamond' },
            { id: 'star', label: 'Star' },
            ...customShapes.map(s => ({ id: s.id, label: s.name }))
        ];

        const ui = new ToolSidebar();

        // 1. Live Preview
        ui.addCustom(() => this.renderLivePreview(brush));

        // 2. Settings
        ui.addHeader('Brush Settings')
            .addSlider({ id: 'size', label: 'Size', min: 1, max: 32, value: brush.size, unit: 'px' })
            .addBrushPicker({ id: 'shape', label: 'Brush Shape', value: brush.shape, options: shapeOptions })
            .addButton({
                label: 'Edit Brush Shape',
                icon: 'pencil-alt',
                action: () => this.app.services.get('ui_brush').openShapeEditor(brush.shape)
            });

        ui.addHeader('Dynamics')
            .addSlider({ id: 'angle', label: 'Angle', min: 0, max: 360, value: brush.angle || 0, unit: '°' })
            .addSlider({ id: 'angleJitter', label: 'Jitter', min: 0, max: 180, value: brush.angleJitter || 0, unit: '°' })
            .addSlider({ id: 'noise', label: 'Noise', min: 0, max: 100, value: brush.noise || 0, unit: '%' });

        ui.addHeader('Behavior')
            .addToggle({ id: 'pixelPerfect', label: 'Pixel Perfect', value: brush.pixelPerfect || false });

        if (!this.isEraser) {
            ui.addSelect({
                id: 'mode',
                label: 'Ink Mode',
                value: brush.mode,
                options: [
                    { id: 'normal', label: 'Normal' },
                    { id: 'dither', label: 'Dither' },
                    { id: 'shade-up', label: 'Shade (+)' },
                    { id: 'shade-down', label: 'Shade (-)' }
                ]
            });
        }

        // 3. [RESTORED] Library Panel
        // This connects the sidebar to the BrushUI service to render the preset list
        ui.setToolLibrary(() => this.app.services.get('ui_brush').createLibraryElement());

        return ui;
    }

    renderLivePreview(brush) {
        const w = 200;
        const h = 80;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.className = "w-full h-20 bg-neutral-900 rounded border border-neutral-600 mb-2";
        canvas.style.imageRendering = "pixelated";

        const ctx = canvas.getContext('2d');
        const cx = w / 2;
        const cy = h / 2;

        ctx.strokeStyle = '#333';
        ctx.beginPath();
        ctx.moveTo(cx - 10, cy); ctx.lineTo(cx + 10, cy);
        ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy + 10);
        ctx.stroke();

        const zoom = brush.size < 8 ? 4 : (brush.size < 16 ? 2 : 1);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(zoom, zoom);

        ctx.fillStyle = this.isEraser ? '#ffaaaa' : (this.app.store.get('primaryColor') || '#ffffff');
        if (this.isEraser) ctx.globalAlpha = 0.8;

        const footprint = brush.footprint || [{ x: 0, y: 0 }];
        footprint.forEach(pt => {
            ctx.fillRect(pt.x, pt.y, 1, 1);
        });

        ctx.restore();

        ctx.fillStyle = '#666';
        ctx.font = '10px monospace';
        ctx.fillText(`${brush.size}px ${brush.shape}`, 4, h - 4);

        return canvas;
    }

    onDoubleClick() {
        const brush = this.app.store.get(this.brushStateKey);
        this.setSetting('pixelPerfect', !brush.pixelPerfect);
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

    // ... (The rest of the file including _getTiledBorder, onPointerDown, plot, etc. remains exactly as it was in the previous step) ...
    _getTiledBorder(x, y) {
        const project = this.app.store.activeProject;
        if (!project) return null;
        const frame = project.frames[project.currentFrameIndex];
        const borders = frame.borders || (frame.border ? [frame.border] : []);

        for (let i = borders.length - 1; i >= 0; i--) {
            const b = borders[i];
            if (b.effect === 'tiled' && x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) {
                return b;
            }
        }
        return null;
    }

    onPointerDown(p) {
        this.strokePixels.clear();
        this.buffer = [];
        this.ppHistory = [];
        this.lastPos = { x: p.x, y: p.y };

        this.activeTiledBorder = this._getTiledBorder(p.x, p.y);

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
            let tx = p.x, ty = p.y;
            if (p.originalEvent && p.originalEvent.shiftKey && this.lineStart) {
                const dx = p.x - this.lineStart.x;
                const dy = p.y - this.lineStart.y;
                const angle = Math.atan2(dy, dx);
                const dist = Math.sqrt(dx * dx + dy * dy);
                const iso1 = Math.atan(0.5); const iso2 = Math.atan(2);
                const snapAngles = [0, Math.PI / 2, Math.PI, -Math.PI / 2, Math.PI / 4, 3 * Math.PI / 4, -3 * Math.PI / 4, -Math.PI / 4, iso1, iso2, Math.PI - iso1, Math.PI - iso2, -Math.PI + iso1, -Math.PI + iso2, -iso1, -iso2];
                let closest = 0, minDiff = Infinity;
                const normalize = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a <= -Math.PI) a += 2 * Math.PI; return a; };
                snapAngles.forEach(a => { let diff = Math.abs(normalize(angle - a)); if (diff < minDiff) { minDiff = diff; closest = a; } });
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
        this.activeTiledBorder = null;
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

            let x = cx + tx;
            let y = cy + ty;

            if (this.activeTiledBorder) {
                const b = this.activeTiledBorder;
                const relX = x - b.x;
                const relY = y - b.y;
                const wrappedX = ((relX % b.w) + b.w) % b.w;
                const wrappedY = ((relY % b.h) + b.h) % b.h;
                x = b.x + wrappedX;
                y = b.y + wrappedY;
            }

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
            const projectService = this.app.services.get('project');
            const activeLayerId = projectService.activeLayerId;
            const currentFrameIndex = projectService.currentFrameIndex;

            const pixels = this.buffer.map(p => {
                const oldColor = projectService.getPixelColor(p.x, p.y);
                return {
                    x: p.x,
                    y: p.y,
                    color: p.color,
                    oldColor: oldColor,
                    layerId: activeLayerId,
                    frameIndex: currentFrameIndex
                };
            });

            const history = this.app.services.get('history');
            history.execute(new PixelBatchCommand(this.app, pixels));

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