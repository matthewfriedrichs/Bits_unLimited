import EventBus from './EventBus.js';
import Store from './Store.js';
import ServiceRegistry from './ServiceRegistry.js';

export default class PixelApp {
    constructor() {
        this.bus = new EventBus();
        this.store = new Store(this.bus);
        this.services = new ServiceRegistry(this);

        this.canvas = document.getElementById('main-canvas');
        this.ctx = this.canvas.getContext('2d', { alpha: true });
        this.container = document.getElementById('canvas-container');

        this.bgPattern = null;

        this._initEvents();
        this.resize();
        window.addEventListener('resize', () => this.resize());

        this._startRenderLoop();
    }

    get state() { return this.store.state; }
    get dataAccess() { return this.services.get('project'); }
    get camera() { return this.store.get('camera'); }
    get settings() { return this.store.get('settings'); }

    resize() {
        this.canvas.width = this.container.clientWidth;
        this.canvas.height = this.container.clientHeight;
        this.bus.emit('render', this.ctx);
    }

    screenToWorld(sx, sy) {
        const cam = this.store.get('camera');
        const rect = this.canvas.getBoundingClientRect();
        const x = sx - rect.left;
        const y = sy - rect.top;
        return {
            x: Math.floor((x - this.canvas.width / 2 - cam.x) / cam.zoom),
            y: Math.floor((y - this.canvas.height / 2 - cam.y) / cam.zoom)
        };
    }

    _initEvents() {
        // Prevent Right-Click Menu
        this.container.addEventListener('contextmenu', e => e.preventDefault());

        this.container.addEventListener('wheel', (e) => {
            e.preventDefault();
            const cam = this.store.get('camera');
            const newZoom = Math.max(0.5, Math.min(e.deltaY > 0 ? cam.zoom * 0.9 : cam.zoom * 1.1, 100));
            cam.zoom = newZoom;
            this.store.set('camera', cam);
            const display = document.getElementById('zoom-display');
            if (display) display.innerText = Math.round(newZoom * 10) / 10 + 'x';
        }, { passive: false });

        const forward = (domEvent, name) => {
            const worldPos = this.screenToWorld(domEvent.clientX, domEvent.clientY);
            // Pass the 'buttons' property explicitly for ToolService
            this.bus.emit(name, {
                ...worldPos,
                originalEvent: domEvent,
                x: worldPos.x,
                y: worldPos.y,
                buttons: domEvent.buttons,
                button: domEvent.button
            });
        };

        this.container.addEventListener('pointerdown', e => {
            e.preventDefault();
            this.container.setPointerCapture(e.pointerId);
            forward(e, 'input:pointerDown');
        });
        this.container.addEventListener('pointermove', e => {
            e.preventDefault();
            forward(e, 'input:pointerMove');
        });
        this.container.addEventListener('pointerup', e => {
            e.preventDefault();
            forward(e, 'input:pointerUp');
        });
    }

    _startRenderLoop() {
        const loop = () => {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            this.bus.emit('render:background', this.ctx);

            const cam = this.store.get('camera');
            this.ctx.imageSmoothingEnabled = false;
            this.ctx.save();
            this.ctx.translate(this.canvas.width / 2 + cam.x, this.canvas.height / 2 + cam.y);
            this.ctx.scale(cam.zoom, cam.zoom);

            this.bus.emit('render', this.ctx);

            if (cam.zoom > 4 && this.store.get('settings').grid.show) {
                this._drawGrid(this.ctx, cam);
            }

            this.ctx.restore();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    _drawGrid(ctx, cam) {
        const g = this.store.get('settings').grid;
        const w = this.canvas.width; const h = this.canvas.height;
        const startX = Math.floor((-w / 2 - cam.x) / cam.zoom);
        const endX = Math.floor((w / 2 - cam.x) / cam.zoom) + 1;
        const startY = Math.floor((-h / 2 - cam.y) / cam.zoom);
        const endY = Math.floor((h / 2 - cam.y) / cam.zoom) + 1;

        ctx.lineWidth = 1 / cam.zoom;
        ctx.strokeStyle = g.color;
        ctx.globalAlpha = g.opacity;
        ctx.beginPath();

        for (let i = startX; i <= endX; i++) {
            if (g.major > 0 && i % g.major === 0) continue;
            ctx.moveTo(i, startY); ctx.lineTo(i, endY);
        }
        for (let i = startY; i <= endY; i++) {
            if (g.major > 0 && i % g.major === 0) continue;
            ctx.moveTo(startX, i); ctx.lineTo(endX, i);
        }
        ctx.stroke();
        ctx.globalAlpha = 1.0;
    }
}