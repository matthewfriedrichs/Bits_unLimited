import EventBus from './EventBus.js';

export default class PixelApp {
    constructor() {
        this.bus = new EventBus();
        this.canvas = document.getElementById('main-canvas');
        this.ctx = this.canvas.getContext('2d', { alpha: true });
        this.container = document.getElementById('canvas-container');
        this.camera = { x: 0, y: 0, zoom: 20 };
        this.activePointers = new Map();
        this.state = { primaryColor: '#000000', tool: 'pen', activeBrush: { id: 'basic', size: 1, shape: 'square', mode: 'normal' }, currentPalette: [] };

        // UPDATED DEFAULT SETTINGS: Panned mode, Size 2
        this.settings = {
            grid: { show: true, color: '#333333', major: 8, majorColor: '#555555', opacity: 1.0 },
            background: {
                mode: 'panned',     // <--- Default to Panned
                style: 'checker',
                color1: '#2a2a2a',
                color2: '#1a1a1a',
                size: 2             // <--- Default to 2px (matches pixel grid)
            }
        };

        this.plugins = [];
        this.dataAccess = null;

        this.initCoreEvents();
        this.resize();
        window.addEventListener('resize', () => this.resize());
        requestAnimationFrame(this.loop.bind(this));
    }

    registerPlugin(plugin) { plugin.init(this); this.plugins.push(plugin); }
    getDataPixel(x, y) { return this.dataAccess ? this.dataAccess.getPixelColor(x, y) : null; }
    resize() { this.canvas.width = this.container.clientWidth; this.canvas.height = this.container.clientHeight; this.bus.emit('render', this.ctx); }

    screenToWorld(sx, sy) {
        const rect = this.canvas.getBoundingClientRect();
        const x = sx - rect.left; const y = sy - rect.top;
        const wx = Math.floor((x - this.canvas.width / 2 - this.camera.x) / this.camera.zoom);
        const wy = Math.floor((y - this.canvas.height / 2 - this.camera.y) / this.camera.zoom);
        return { x: wx, y: wy };
    }

    initCoreEvents() {
        this.container.addEventListener('wheel', (e) => { e.preventDefault(); this.setZoom(e.deltaY > 0 ? this.camera.zoom * 0.9 : this.camera.zoom * 1.1); }, { passive: false });
        this.container.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
        this.container.addEventListener('pointermove', (e) => this.handlePointerMove(e));
        this.container.addEventListener('pointerup', (e) => this.handlePointerUp(e));
        this.container.addEventListener('pointercancel', (e) => this.handlePointerUp(e));
        this.container.addEventListener('pointerleave', (e) => this.handlePointerUp(e));
    }

    setZoom(newZoom) { this.camera.zoom = Math.max(0.5, Math.min(newZoom, 100)); document.getElementById('zoom-display').innerText = Math.round(this.camera.zoom * 10) / 10 + 'x'; this.bus.emit('render', this.ctx); }

    handlePointerDown(e) {
        e.preventDefault(); this.container.setPointerCapture(e.pointerId);
        this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY, id: e.pointerId });
        if (this.activePointers.size === 1) {
            if (e.button === 1 || (e.button === 0 && this.state.tool === 'pan')) { this.isDraggingMiddle = true; this.prevPinchCenter = { x: e.clientX, y: e.clientY }; }
            else { this.drawingPointerId = e.pointerId; this.state.isDrawing = true; this.bus.emit('pointerDown', this.screenToWorld(e.clientX, e.clientY)); }
        } else if (this.activePointers.size === 2) {
            if (this.state.isDrawing) { this.bus.emit('pointerUp'); this.state.isDrawing = false; this.drawingPointerId = null; }
            this.isDraggingMiddle = false; this.prevPinchDist = this.getPinchDistance(); this.prevPinchCenter = this.getPinchCenter();
        }
    }

    handlePointerMove(e) {
        e.preventDefault(); if (this.activePointers.has(e.pointerId)) this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY, id: e.pointerId });
        if (this.activePointers.size === 2) {
            const newDist = this.getPinchDistance(), newCenter = this.getPinchCenter();
            if (this.prevPinchCenter) { this.camera.x += newCenter.x - this.prevPinchCenter.x; this.camera.y += newCenter.y - this.prevPinchCenter.y; }
            if (this.prevPinchDist && newDist > 0) this.setZoom(this.camera.zoom * (newDist / this.prevPinchDist));
            this.prevPinchDist = newDist; this.prevPinchCenter = newCenter; this.bus.emit('render', this.ctx);
        } else if (this.activePointers.size === 1) {
            if (this.isDraggingMiddle) {
                this.camera.x += e.clientX - this.prevPinchCenter.x; this.camera.y += e.clientY - this.prevPinchCenter.y;
                this.prevPinchCenter = { x: e.clientX, y: e.clientY }; this.bus.emit('render', this.ctx);
            } else if (this.state.isDrawing && e.pointerId === this.drawingPointerId) {
                const p = this.screenToWorld(e.clientX, e.clientY);
                document.getElementById('coords-display').innerText = `${p.x}, ${p.y}`;
                this.bus.emit('pointerDrag', p);
            }
        }
    }

    handlePointerUp(e) {
        e.preventDefault(); this.activePointers.delete(e.pointerId);
        try { this.container.releasePointerCapture(e.pointerId); } catch (err) { }
        if (this.activePointers.size < 2) { this.prevPinchDist = null; this.prevPinchCenter = null; }
        if (this.activePointers.size === 1) this.prevPinchCenter = this.getPinchCenter();
        if (e.pointerId === this.drawingPointerId) { this.state.isDrawing = false; this.drawingPointerId = null; this.bus.emit('pointerUp'); }
        this.isDraggingMiddle = false;
    }

    getPinchDistance() { const p = Array.from(this.activePointers.values()); return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); }
    getPinchCenter() { const p = Array.from(this.activePointers.values()); return p.length < 2 ? { x: 0, y: 0 } : { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 }; }

    loop() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawBackground();
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.save();
        this.ctx.translate(this.canvas.width / 2 + this.camera.x, this.canvas.height / 2 + this.camera.y);
        this.ctx.scale(this.camera.zoom, this.camera.zoom);
        if (this.camera.zoom > 4 && this.settings.grid.show) this.drawGrid();
        this.ctx.fillStyle = 'rgba(255,0,0,0.5)'; this.ctx.fillRect(0, 0, 1, 1);
        this.bus.emit('render', this.ctx);
        this.ctx.restore();
        requestAnimationFrame(this.loop.bind(this));
    }

    drawBackground() {
        const bg = this.settings.background;
        const w = this.canvas.width;
        const h = this.canvas.height;

        if (bg.style === 'solid') {
            this.ctx.fillStyle = bg.color1;
            this.ctx.fillRect(0, 0, w, h);
            return;
        }

        if (!this.bgPattern || this.bgKey !== JSON.stringify(bg)) {
            const p = document.createElement('canvas');
            p.width = bg.size * 2;
            p.height = bg.size * 2;
            const pctx = p.getContext('2d');
            pctx.fillStyle = bg.color2;
            pctx.fillRect(0, 0, bg.size * 2, bg.size * 2);
            pctx.fillStyle = bg.color1;
            if (bg.style === 'checker') {
                pctx.fillRect(0, 0, bg.size, bg.size);
                pctx.fillRect(bg.size, bg.size, bg.size, bg.size);
            } else if (bg.style === 'dots') {
                pctx.beginPath();
                pctx.arc(bg.size / 2, bg.size / 2, 2, 0, Math.PI * 2);
                pctx.arc(bg.size * 1.5, bg.size * 1.5, 2, 0, Math.PI * 2);
                pctx.fill();
            }
            this.bgPattern = this.ctx.createPattern(p, 'repeat');
            this.bgKey = JSON.stringify(bg);
        }

        this.ctx.save();
        this.ctx.fillStyle = this.bgPattern;

        if (bg.mode === 'panned') {
            this.ctx.translate(w / 2 + this.camera.x, h / 2 + this.camera.y);
            this.ctx.scale(this.camera.zoom, this.camera.zoom);

            const invScale = 1 / this.camera.zoom;
            const transX = w / 2 + this.camera.x;
            const transY = h / 2 + this.camera.y;

            const startX = -transX * invScale;
            const startY = -transY * invScale;
            const width = w * invScale;
            const height = h * invScale;

            this.ctx.fillRect(Math.floor(startX - 1), Math.floor(startY - 1), Math.ceil(width + 2), Math.ceil(height + 2));
        } else {
            this.ctx.fillRect(0, 0, w, h);
        }
        this.ctx.restore();
    }

    drawGrid() {
        const g = this.settings.grid;
        const startX = Math.floor((-this.canvas.width / 2 - this.camera.x) / this.camera.zoom);
        const endX = Math.floor((this.canvas.width / 2 - this.camera.x) / this.camera.zoom) + 1;
        const startY = Math.floor((-this.canvas.height / 2 - this.camera.y) / this.camera.zoom);
        const endY = Math.floor((this.canvas.height / 2 - this.camera.y) / this.camera.zoom) + 1;

        this.ctx.lineWidth = 1 / this.camera.zoom;
        this.ctx.strokeStyle = g.color;
        this.ctx.globalAlpha = g.opacity;
        this.ctx.beginPath();

        for (let i = startX; i <= endX; i++) { if (g.major > 0 && i % g.major === 0) continue; this.ctx.moveTo(i, startY); this.ctx.lineTo(i, endY); }
        for (let i = startY; i <= endY; i++) { if (g.major > 0 && i % g.major === 0) continue; this.ctx.moveTo(startX, i); this.ctx.lineTo(endX, i); }
        this.ctx.stroke();

        if (g.major > 0) {
            this.ctx.strokeStyle = g.majorColor;
            this.ctx.lineWidth = 2 / this.camera.zoom;
            this.ctx.beginPath();
            for (let i = startX; i <= endX; i++) { if (i % g.major === 0) { this.ctx.moveTo(i, startY); this.ctx.lineTo(i, endY); } }
            for (let i = startY; i <= endY; i++) { if (i % g.major === 0) { this.ctx.moveTo(startX, i); this.ctx.lineTo(endX, i); } }
            this.ctx.stroke();
        }
        this.ctx.globalAlpha = 1.0;
    }
}