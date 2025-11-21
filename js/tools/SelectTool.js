import BaseTool from './BaseTool.js';

export default class SelectTool extends BaseTool {
    constructor(app) {
        super(app);
        this.selection = null;
        this.floatingBuffer = null;
        this.isSelecting = false;
        this.isMoving = false;
        this.dragStart = null;
        this.lastClickTime = 0;
        this.lastClickPos = null;
        this.clickCycle = 0;

        // History Listeners
        this.app.bus.on('cmd_ClearFloat', () => {
            this.selection = null;
            this.floatingBuffer = null;
            this.app.bus.emit('render', this.app.ctx);
        });

        this.app.bus.on('cmd_RestoreFloat', (data) => {
            this.selection = data.selection;
            this.floatingBuffer = data.buffer;
            this.isMoving = true;
            this.app.bus.emit('render', this.app.ctx);
        });
    }

    onDeactivate() {
        this.commitSelection();
    }

    onPointerDown(p) {
        const now = Date.now();
        const isRepeatClick = this.lastClickPos && (now - this.lastClickTime < 400) && (Math.abs(p.x - this.lastClickPos.x) < 5) && (Math.abs(p.y - this.lastClickPos.y) < 5);
        this.lastClickTime = now;
        this.lastClickPos = { x: p.x, y: p.y };

        if (isRepeatClick) {
            this.clickCycle = (this.clickCycle % 3) + 1;
            this.performSmartSelect(p.x, p.y, this.clickCycle);
            return;
        } else {
            this.clickCycle = 0;
        }

        if (this.selection && this.pointInRect(p, this.selection)) {
            this.isMoving = true;
            this.dragStart = { x: p.x, y: p.y };
            if (!this.floatingBuffer) this.liftSelection();
        } else {
            this.commitSelection();
            this.isSelecting = true;
            this.dragStart = { x: p.x, y: p.y };
            this.selection = { x: p.x, y: p.y, w: 0, h: 0 };
        }
    }

    onPointerMove(p) {
        if (this.isMoving && this.selection) {
            const dx = Math.round(p.x - this.dragStart.x);
            const dy = Math.round(p.y - this.dragStart.y);
            if (dx !== 0 || dy !== 0) {
                this.selection.x += dx;
                this.selection.y += dy;
                this.dragStart = { x: p.x, y: p.y };
            }
        } else if (this.isSelecting) {
            const w = Math.round(p.x - this.dragStart.x);
            const h = Math.round(p.y - this.dragStart.y);
            this.selection.w = w;
            this.selection.h = h;
        }
    }

    onPointerUp(p) {
        this.isSelecting = false;
        this.isMoving = false;
        if (this.selection) {
            this.selection = this.normalizeRect(this.selection);
            if (this.selection.w === 0 && this.selection.h === 0) this.commitSelection();
        }
    }

    performSmartSelect(x, y, mode) {
        this.commitSelection();
        const da = this.app.dataAccess;
        const startColor = da.getPixelColor(x, y);
        if (!startColor) return;

        const backgroundColors = new Set();
        if (mode === 2) {
            const frame = da.frames[da.currentFrameIndex];
            const layer = frame.layers.find(l => l.id === da.activeLayerId);
            const b = frame.border;
            if (layer && b) {
                for (let i = b.x; i < b.x + b.w; i++) { backgroundColors.add(da.getPixelColor(i, b.y)); backgroundColors.add(da.getPixelColor(i, b.y + b.h - 1)); }
                for (let j = b.y; j < b.y + b.h; j++) { backgroundColors.add(da.getPixelColor(b.x, j)); backgroundColors.add(da.getPixelColor(b.x + b.w - 1, j)); }
                backgroundColors.delete(null); backgroundColors.delete(startColor);
            }
        }

        const stack = [{ x, y }];
        const seen = new Set([`${x},${y}`]);
        let minX = x, maxX = x, minY = y, maxY = y;
        let iterations = 0; const LIMIT = 50000;

        while (stack.length > 0 && iterations < LIMIT) {
            const p = stack.pop();
            iterations++;
            if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
            const neighbors = [{ x: p.x + 1, y: p.y }, { x: p.x - 1, y: p.y }, { x: p.x, y: p.y + 1 }, { x: p.x, y: p.y - 1 }];
            for (const n of neighbors) {
                const key = `${n.x},${n.y}`;
                if (seen.has(key)) continue;
                const color = da.getPixelColor(n.x, n.y);
                let shouldInclude = false;
                if (color) {
                    if (mode === 1) shouldInclude = (color === startColor);
                    else if (mode === 2) shouldInclude = !backgroundColors.has(color);
                    else shouldInclude = true;
                }
                if (shouldInclude) { seen.add(key); stack.push(n); }
            }
        }
        this.selection = { x: minX, y: minY, w: (maxX - minX) + 1, h: (maxY - minY) + 1 };
    }

    copy() { if (!this.selection) return null; if (this.floatingBuffer) return JSON.parse(JSON.stringify(this.floatingBuffer)); const s = this.selection; const buffer = []; for (let y = s.y; y < s.y + s.h; y++) { for (let x = s.x; x < s.x + s.w; x++) { const color = this.app.dataAccess.getPixelColor(x, y); if (color) { buffer.push({ relX: x - s.x, relY: y - s.y, color }); } } } return buffer.length > 0 ? buffer : null; }

    paste(buffer, centerPos = null) {
        if (!buffer || buffer.length === 0) return;
        this.commitSelection();

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        buffer.forEach(p => { if (p.relX < minX) minX = p.relX; if (p.relX > maxX) maxX = p.relX; if (p.relY < minY) minY = p.relY; if (p.relY > maxY) maxY = p.relY; });

        const w = maxX - minX + 1;
        const h = maxY - minY + 1;
        const normalizedBuffer = buffer.map(p => ({ relX: p.relX - minX, relY: p.relY - minY, color: p.color }));

        let targetX, targetY;
        if (centerPos) {
            targetX = Math.floor(centerPos.x - w / 2);
            targetY = Math.floor(centerPos.y - h / 2);
        } else {
            const cam = this.app.camera;
            // FIX: Correctly calculate World Center from Camera properties
            // camera.x is translation in screen pixels. 
            // World X = (ScreenCenter - Pan) / Zoom
            // ScreenCenter (relative to 0,0 in transform) is 0.
            // So World Center = -Pan / Zoom
            const centerX = Math.floor(-cam.x / cam.zoom);
            const centerY = Math.floor(-cam.y / cam.zoom);

            targetX = Math.floor(centerX - w / 2);
            targetY = Math.floor(centerY - h / 2);
        }

        this.selection = { x: targetX, y: targetY, w: w, h: h };
        this.floatingBuffer = normalizedBuffer;
        this.isMoving = true;

        this.app.bus.emit('toolChanged', 'select');

        this.app.bus.emit('cmd_RecordFloat', {
            buffer: normalizedBuffer,
            selection: { ...this.selection }
        });
    }

    liftSelection() {
        const s = this.selection;
        this.floatingBuffer = [];
        const pixelsToErase = [];

        for (let y = s.y; y < s.y + s.h; y++) {
            for (let x = s.x; x < s.x + s.w; x++) {
                const color = this.app.dataAccess.getPixelColor(x, y);
                if (color) {
                    this.floatingBuffer.push({ relX: x - s.x, relY: y - s.y, color });
                    pixelsToErase.push({ x, y, color: null, erase: true });
                }
            }
        }

        if (pixelsToErase.length > 0) {
            this.app.bus.emit('cmd_StartBatch');
            this.app.bus.emit('requestBatchPixels', pixelsToErase);
            this.app.bus.emit('cmd_RecordFloat', {
                buffer: JSON.parse(JSON.stringify(this.floatingBuffer)),
                selection: { ...this.selection }
            });
            this.app.bus.emit('transactionEnd');
        }
    }

    commitSelection() {
        if (!this.selection) return;

        if (this.floatingBuffer) {
            const pixelsToPaste = this.floatingBuffer.map(p => ({
                x: this.selection.x + p.relX,
                y: this.selection.y + p.relY,
                color: p.color
            }));
            if (pixelsToPaste.length > 0) {
                this.app.bus.emit('requestBatchPixels', pixelsToPaste);
            }
        }
        this.selection = null;
        this.floatingBuffer = null;
    }

    onRender(ctx) {
        if (!this.selection) return;
        const s = this.selection;
        if (this.floatingBuffer) { ctx.save(); for (const p of this.floatingBuffer) { ctx.fillStyle = p.color; ctx.fillRect(s.x + p.relX, s.y + p.relY, 1, 1); } ctx.restore(); }
        ctx.save(); const zoom = this.app.camera.zoom; ctx.lineWidth = 1 / zoom; ctx.strokeStyle = '#fff'; ctx.setLineDash([4 / zoom, 4 / zoom]); const offset = (Date.now() / 100) % 16; ctx.lineDashOffset = -offset; ctx.strokeRect(s.x, s.y, s.w, s.h); ctx.strokeStyle = '#000'; ctx.lineDashOffset = -offset + (4 / zoom); ctx.strokeRect(s.x, s.y, s.w, s.h); ctx.restore();
    }
    normalizeRect(r) { return { x: r.w < 0 ? r.x + r.w : r.x, y: r.h < 0 ? r.y + r.h : r.y, w: Math.abs(r.w), h: Math.abs(r.h) }; }
    pointInRect(p, r) { const n = this.normalizeRect(r); return p.x >= n.x && p.x < n.x + n.w && p.y >= n.y && p.y < n.y + n.h; }
}