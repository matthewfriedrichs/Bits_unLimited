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

        this.mode = 'color';
        this.diagonal = false;
        this.viewMode = 'shape';

        this.outlinePath = null;
        this.selectionMask = null;

        this.app.bus.on('cmd:clearFloat', () => this.clearSelection());
        this.app.bus.on('cmd:restoreFloat', (d) => {
            this.selection = d.selection;
            this.floatingBuffer = d.buffer;
            this.isMoving = false;
            if (this.floatingBuffer) this.generateBufferOutline();
            this.app.bus.emit('render', this.app.ctx);
        });
        this.app.bus.on('cmd:pasteBuffer', ({ buffer, anchor }) => this.paste(buffer, anchor));
    }

    get availableModes() {
        return [
            { id: 'color', label: 'Color Select', icon: 'magic', color: 'text-fuchsia-400', desc: 'Select connected same-color pixels' },
            { id: 'content', label: 'Content Select', icon: 'shapes', color: 'text-sky-400', desc: 'Select connected solid pixels' }
        ];
    }

    get settings() {
        return [
            { id: 'diagonal', type: 'toggle', label: 'Diagonal (8-way)', value: this.diagonal },
            { id: 'viewMode', type: 'select', label: 'Selection View', options: [{ id: 'box', label: 'Bounding Box' }, { id: 'shape', label: 'Pixel Perfect' }], value: this.viewMode }
        ];
    }

    setSetting(key, val) {
        if (key === 'diagonal') this.diagonal = val;
        if (key === 'viewMode') {
            this.viewMode = val;
            this.app.bus.emit('render', this.app.ctx);
        }
    }

    setMode(modeId) {
        if (this.mode === modeId) return;
        this.mode = modeId;
        this.app.bus.emit('tool:modeChanged', { toolId: 'select', mode: this.mode });
    }

    toggleMode() {
        this.setMode(this.mode === 'color' ? 'content' : 'color');
    }

    // --- Input Handlers ---
    onDeactivate() { this.commitSelection(); }

    onPointerDown(p) {
        const now = Date.now();
        const isRepeat = this.lastClickPos && (now - this.lastClickTime < 400) && (Math.abs(p.x - this.lastClickPos.x) < 5) && (Math.abs(p.y - this.lastClickPos.y) < 5);
        this.lastClickTime = now; this.lastClickPos = { x: p.x, y: p.y };

        if (isRepeat) { this.performSmartSelect(p.x, p.y); return; }

        if (this.selection && this.pointInRect(p, this.selection)) {
            this.isMoving = true; this.dragStart = { x: p.x, y: p.y };
            if (!this.floatingBuffer) this.liftSelection();
        } else {
            this.commitSelection();
            this.isSelecting = true; this.dragStart = { x: p.x, y: p.y };
            this.selection = { x: p.x, y: p.y, w: 0, h: 0 };
            this.outlinePath = null;
            this.selectionMask = null;
        }
    }

    onPointerMove(p) {
        if (this.isMoving && this.selection) {
            const dx = Math.round(p.x - this.dragStart.x); const dy = Math.round(p.y - this.dragStart.y);
            if (dx !== 0 || dy !== 0) { this.selection.x += dx; this.selection.y += dy; this.dragStart = { x: p.x, y: p.y }; }
        } else if (this.isSelecting) {
            const w = Math.round(p.x - this.dragStart.x); const h = Math.round(p.y - this.dragStart.y);
            this.selection.w = w; this.selection.h = h;
        }
    }

    onPointerUp(p) {
        this.isSelecting = false; this.isMoving = false;
        if (this.selection) { this.selection = this.normalizeRect(this.selection); if (this.selection.w === 0 && this.selection.h === 0) this.commitSelection(); }
    }

    // --- Outline Logic ---
    generateOutline(pixelSet, bounds) {
        const relMask = new Set();
        pixelSet.forEach(key => {
            const [x, y] = key.split(',').map(Number);
            relMask.add(`${x - bounds.x},${y - bounds.y}`);
        });
        return this._computeSegments(relMask);
    }

    generateBufferOutline() {
        if (!this.floatingBuffer) return;
        const relMask = new Set();
        this.floatingBuffer.forEach(p => relMask.add(`${p.relX},${p.relY}`));
        this.outlinePath = this._computeSegments(relMask);
    }

    _computeSegments(maskSet) {
        const segments = [];
        maskSet.forEach(key => {
            const [x, y] = key.split(',').map(Number);
            // Top
            if (!maskSet.has(`${x},${y - 1}`)) segments.push({ x1: x, y1: y, x2: x + 1, y2: y });
            // Bottom
            if (!maskSet.has(`${x},${y + 1}`)) segments.push({ x1: x, y1: y + 1, x2: x + 1, y2: y + 1 });
            // Left
            if (!maskSet.has(`${x - 1},${y}`)) segments.push({ x1: x, y1: y, x2: x, y2: y + 1 });
            // Right
            if (!maskSet.has(`${x + 1},${y}`)) segments.push({ x1: x + 1, y1: y, x2: x + 1, y2: y + 1 });
        });
        return segments;
    }

    // --- Smart Selection ---
    performSmartSelect(x, y) {
        this.commitSelection();
        const projectService = this.app.services.get('project');
        const startColor = projectService.getPixelColor(x, y);

        if (!startColor && this.mode === 'color') return;
        if (!startColor && this.mode === 'content') return;

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
            if (this.diagonal) neighbors.push({ x: p.x + 1, y: p.y + 1 }, { x: p.x - 1, y: p.y + 1 }, { x: p.x + 1, y: p.y - 1 }, { x: p.x - 1, y: p.y - 1 });

            for (const n of neighbors) {
                const key = `${n.x},${n.y}`;
                if (seen.has(key)) continue;

                const color = projectService.getPixelColor(n.x, n.y);
                let shouldSelect = false;

                if (this.mode === 'color') {
                    if (color === startColor) shouldSelect = true;
                } else if (this.mode === 'content') {
                    if (color !== null) shouldSelect = true;
                }

                if (shouldSelect) { seen.add(key); stack.push(n); }
            }
        }

        this.selectionMask = seen;
        this.selection = { x: minX, y: minY, w: (maxX - minX) + 1, h: (maxY - minY) + 1 };
        this.outlinePath = this.generateOutline(seen, this.selection);
        this.isSelecting = false;
        this.app.bus.emit('render', this.app.ctx);
    }

    // --- Lift / Move ---
    liftSelection() {
        const s = this.selection;
        const projectService = this.app.services.get('project');
        this.floatingBuffer = [];
        const pixelsToErase = [];

        for (let y = s.y; y < s.y + s.h; y++) {
            for (let x = s.x; x < s.x + s.w; x++) {
                // Filter by mask if it exists
                if (this.selectionMask && !this.selectionMask.has(`${x},${y}`)) continue;

                const color = projectService.getPixelColor(x, y);
                if (color) {
                    this.floatingBuffer.push({ relX: x - s.x, relY: y - s.y, color });
                    pixelsToErase.push({ x, y, color: null, erase: true });
                }
            }
        }

        if (pixelsToErase.length > 0) {
            this.app.bus.emit('requestBatchPixels', pixelsToErase);
            this.app.bus.emit('cmd:transactionEnd');

            // FIX: Regenerate outline from the lifted buffer
            this.generateBufferOutline();

            this.app.bus.emit('cmd:recordFloat', {
                buffer: JSON.parse(JSON.stringify(this.floatingBuffer)),
                selection: { ...this.selection }
            });
        }
    }

    // ... (Other standard methods) ...
    copy() {
        if (this.floatingBuffer) return JSON.parse(JSON.stringify(this.floatingBuffer));
        if (!this.selection) return null;
        const s = this.selection; const buffer = []; const projectService = this.app.services.get('project');
        for (let y = s.y; y < s.y + s.h; y++) { for (let x = s.x; x < s.x + s.w; x++) { if (this.selectionMask && !this.selectionMask.has(`${x},${y}`)) continue; const color = projectService.getPixelColor(x, y); if (color) buffer.push({ relX: x - s.x, relY: y - s.y, color }); } }
        return buffer.length > 0 ? buffer : null;
    }
    deleteSelection() {
        if (!this.selection) return; if (this.floatingBuffer) { this.clearSelection(); return; }
        const s = this.selection; const pixelsToErase = []; const projectService = this.app.services.get('project');
        for (let y = s.y; y < s.y + s.h; y++) { for (let x = s.x; x < s.x + s.w; x++) { if (this.selectionMask && !this.selectionMask.has(`${x},${y}`)) continue; if (projectService.getPixelColor(x, y)) pixelsToErase.push({ x, y, color: null, erase: true }); } }
        if (pixelsToErase.length > 0) this.app.bus.emit('requestBatchPixels', pixelsToErase); this.clearSelection();
    }
    commitSelection() { if (!this.selection) return; if (this.floatingBuffer) { const pixelsToPaste = this.floatingBuffer.map(p => ({ x: this.selection.x + p.relX, y: this.selection.y + p.relY, color: p.color })); if (pixelsToPaste.length > 0) this.app.bus.emit('requestBatchPixels', pixelsToPaste); } this.clearSelection(); }
    clearSelection() { this.selection = null; this.floatingBuffer = null; this.outlinePath = null; this.selectionMask = null; this.app.bus.emit('render', this.app.ctx); }
    paste(buffer, centerPos = null) {
        if (!buffer || buffer.length === 0) return; this.commitSelection();
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity; buffer.forEach(p => { if (p.relX < minX) minX = p.relX; if (p.relX > maxX) maxX = p.relX; if (p.relY < minY) minY = p.relY; if (p.relY > maxY) maxY = p.relY; });
        const w = maxX - minX + 1; const h = maxY - minY + 1;
        let targetX, targetY; if (centerPos) { targetX = Math.floor(centerPos.x - w / 2); targetY = Math.floor(centerPos.y - h / 2); } else { const cam = this.app.store.get('camera'); const centerX = Math.floor(-cam.x / cam.zoom); const centerY = Math.floor(-cam.y / cam.zoom); targetX = Math.floor(centerX - w / 2); targetY = Math.floor(centerY - h / 2); }
        this.selection = { x: targetX, y: targetY, w, h }; this.floatingBuffer = buffer.map(p => ({ relX: p.relX - minX, relY: p.relY - minY, color: p.color }));
        this.generateBufferOutline();
        this.isMoving = false;
        const pId = this.app.store.get('primaryTool'); const sId = this.app.store.get('secondaryTool'); if (pId !== 'select' && sId !== 'select') { this.app.store.set('primaryTool', 'select'); }
        this.app.bus.emit('cmd:recordFloat', { buffer: this.floatingBuffer, selection: { ...this.selection } }); this.app.bus.emit('render', this.app.ctx);
    }

    onRender(ctx) {
        if (!this.selection) return;
        const s = this.selection;

        if (this.floatingBuffer) {
            ctx.save();
            for (const p of this.floatingBuffer) {
                ctx.fillStyle = p.color;
                ctx.fillRect(s.x + p.relX, s.y + p.relY, 1, 1);
            }
            ctx.restore();
        }

        ctx.save();
        const cam = this.app.store.get('camera');
        const canvasW = this.app.canvas.width;
        const canvasH = this.app.canvas.height;
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        const originX = canvasW / 2 + cam.x;
        const originY = canvasH / 2 + cam.y;
        const offset = (Date.now() / 100) % 8;
        ctx.lineWidth = 1;

        // Helper
        const drawPath = (segments, color, dashOffset) => {
            ctx.beginPath();
            ctx.strokeStyle = color;
            if (color === '#fff') ctx.setLineDash([4, 4]);
            ctx.lineDashOffset = dashOffset;
            segments.forEach(seg => {
                const x1 = Math.floor(originX + (s.x + seg.x1) * cam.zoom);
                const y1 = Math.floor(originY + (s.y + seg.y1) * cam.zoom);
                const x2 = Math.floor(originX + (s.x + seg.x2) * cam.zoom);
                const y2 = Math.floor(originY + (s.y + seg.y2) * cam.zoom);
                ctx.moveTo(x1 - 0.5, y1 - 0.5); ctx.lineTo(x2 - 0.5, y2 - 0.5);
            });
            ctx.stroke();
        };

        if (this.viewMode === 'shape' && this.outlinePath) {
            drawPath(this.outlinePath, '#fff', -offset);
            ctx.setLineDash([]);
            drawPath(this.outlinePath, '#000', -offset + 4);
        } else {
            const sx = Math.floor(originX + s.x * cam.zoom);
            const sy = Math.floor(originY + s.y * cam.zoom);
            const sw = Math.floor(s.w * cam.zoom);
            const sh = Math.floor(s.h * cam.zoom);
            ctx.strokeStyle = '#fff'; ctx.setLineDash([4, 4]); ctx.lineDashOffset = -offset;
            ctx.strokeRect(sx - 0.5, sy - 0.5, sw + 1, sh + 1);
            ctx.strokeStyle = '#000'; ctx.lineDashOffset = -offset + 4;
            ctx.strokeRect(sx - 0.5, sy - 0.5, sw + 1, sh + 1);
        }
        ctx.restore();
    }
    normalizeRect(r) { return { x: r.w < 0 ? r.x + r.w : r.x, y: r.h < 0 ? r.y + r.h : r.y, w: Math.abs(r.w), h: Math.abs(r.h) }; }
    pointInRect(p, r) { const n = this.normalizeRect(r); return p.x >= n.x && p.x < n.x + n.w && p.y >= n.y && p.y < n.y + n.h; }
}