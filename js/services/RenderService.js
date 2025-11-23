import ColorUtils from '../utils/ColorUtils.js';

const CHUNK_SIZE = 64;

export default class RenderService {
    init(app) {
        this.app = app;
        this.store = app.store;
        this.bus = app.bus;

        this.activeInteractionBorderId = null; // [Req 2] Track which border is being interacted with

        this.chunkCache = new WeakMap();

        // 1. Background Cache
        this.bgPatternCanvas = document.createElement('canvas');
        this.bgPatternCanvas.width = 2;
        this.bgPatternCanvas.height = 2;
        this.bgPatternCtx = this.bgPatternCanvas.getContext('2d');
        this.lastBgHash = null;

        // 2. Composite Cache
        this.compositeCanvas = document.createElement('canvas');
        this.compositeCtx = this.compositeCanvas.getContext('2d');
        this.isCompositeDirty = true;

        // 3. Effect Buffer
        this.layerCanvas = document.createElement('canvas');
        this.layerCtx = this.layerCanvas.getContext('2d');

        // --- Event Listeners ---
        this.bus.on('render', (ctx) => this.renderLayers(ctx));
        this.bus.on('render:background', (ctx) => this.drawBackground(ctx));

        this.bus.on('pixelChangeApplied', (delta) => {
            this.handlePixelUpdate(delta);
            this.isCompositeDirty = true;
        });

        this.bus.on('data:pixelsChanged', (payload) => {
            if (payload.batch) {
                this.updateChunkBatch(payload.batch);
                this.isCompositeDirty = true;
            }
        });

        // Structure changes
        const setDirty = () => { this.isCompositeDirty = true; };
        this.bus.on('cmd:deleteLayer', setDirty);
        this.bus.on('cmd:addLayer', setDirty);
        this.bus.on('cmd:reorderLayers', setDirty);
        this.bus.on('cmd:toggleLayer', setDirty);
        this.bus.on('projectSwitched', setDirty);
        this.bus.on('cmd:selectFrame', setDirty);

        // [Req 2] Input Tracking for conditional effects
        this.bus.on('input:pointerDown', (p) => this.handlePointerDown(p));
        this.bus.on('input:pointerUp', () => { this.activeInteractionBorderId = null; });
    }

    // [Req 2] Check if we started drawing inside a border
    handlePointerDown(p) {
        const project = this.store.activeProject;
        if (!project) return;
        const frame = project.frames[project.currentFrameIndex];
        const borders = frame.borders || (frame.border ? [frame.border] : []);

        // Check distinct borders in reverse order (topmost first)
        for (let i = borders.length - 1; i >= 0; i--) {
            const b = borders[i];
            // Simple hit test in world space
            if (p.x >= b.x && p.x < b.x + b.w && p.y >= b.y && p.y < b.y + b.h) {
                this.activeInteractionBorderId = b.id;
                return;
            }
        }
        this.activeInteractionBorderId = null;
    }

    // --- Chunk Management ---
    handlePixelUpdate(delta) {
        const project = this.store.activeProject;
        if (!project) return;
        const frame = project.frames[delta.frameIndex];
        const layer = frame.layers.find(l => l.id === delta.layerId);
        if (layer) this.updateChunkPixel(layer, delta.x, delta.y, delta.newColor);
    }

    updateChunkBatch(batch) {
        const project = this.store.activeProject;
        if (!project) return;
        const layerCache = new Map();
        batch.forEach(p => {
            let layer = layerCache.get(p.layerId);
            if (!layer) {
                const frame = project.frames[p.frameIndex];
                if (frame) {
                    layer = frame.layers.find(l => l.id === p.layerId);
                    if (layer) layerCache.set(p.layerId, layer);
                }
            }
            if (layer) this.updateChunkPixel(layer, p.x, p.y, p.color);
        });
    }

    getChunk(layer, cx, cy) {
        let layerCache = this.chunkCache.get(layer);
        if (!layerCache) { layerCache = new Map(); this.chunkCache.set(layer, layerCache); }
        const key = `${cx},${cy}`;
        let chunk = layerCache.get(key);
        if (!chunk) { chunk = document.createElement('canvas'); chunk.width = CHUNK_SIZE; chunk.height = CHUNK_SIZE; layerCache.set(key, chunk); }
        return chunk;
    }

    updateChunkPixel(layer, x, y, color) {
        const cx = Math.floor(x / CHUNK_SIZE);
        const cy = Math.floor(y / CHUNK_SIZE);
        const chunk = this.getChunk(layer, cx, cy);
        const ctx = chunk.getContext('2d');
        const rx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const ry = ((y % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        if (color) { ctx.fillStyle = color; ctx.fillRect(rx, ry, 1, 1); }
        else { ctx.clearRect(rx, ry, 1, 1); }
    }

    rebuildLayerCache(layer) {
        this.chunkCache.set(layer, new Map());
        for (const [key, color] of layer.data) {
            const [x, y] = key.split(',').map(Number);
            this.updateChunkPixel(layer, x, y, color);
        }
    }

    // --- Rendering Pipeline ---

    renderLayers(ctx) {
        const project = this.store.activeProject;
        if (!project) return;

        const cam = this.store.get('camera');
        const w = this.app.canvas.width;
        const h = this.app.canvas.height;

        // 1. Update Composite Cache
        if (this.isCompositeDirty) {
            this.updateCompositeCache(project, cam, w, h);
            this.isCompositeDirty = false;
        } else {
            const lastCam = this.lastRenderCam;
            if (!lastCam || lastCam.x !== cam.x || lastCam.y !== cam.y || lastCam.zoom !== cam.zoom) {
                this.updateCompositeCache(project, cam, w, h);
            }
        }
        this.lastRenderCam = { ...cam };

        // 2. Prepare Effect Buffer
        if (this.layerCanvas.width !== w || this.layerCanvas.height !== h) {
            this.layerCanvas.width = w;
            this.layerCanvas.height = h;
        }
        this.layerCtx.clearRect(0, 0, w, h);
        this.layerCtx.drawImage(this.compositeCanvas, 0, 0);

        // 3. Apply Effects
        const frame = project.frames[project.currentFrameIndex];
        const borders = frame.borders || (frame.border ? [frame.border] : []);

        // Tiled Mode (Legacy hardcoded check, can be removed if fully moved to EffectRegistry)
        const tiledBorder = borders.find(b => b.type === 'tiled');
        if (tiledBorder) {
            // Assuming TiledEffect handles this now via registry, but keeping safe fallback if needed
        }

        this.layerCtx.save();
        this.layerCtx.translate(w / 2 + cam.x, h / 2 + cam.y);
        this.layerCtx.scale(cam.zoom, cam.zoom);

        const effectService = this.app.services.get('effects');

        borders.forEach(b => {
            if (b.type === 'effect' && b.effect && b.effect !== 'none') {
                const effect = effectService.get(b.effect);
                if (effect && effect.instance) {
                    effect.instance.apply({
                        ctx: this.layerCtx,
                        border: b,
                        renderService: this,
                        width: w,
                        height: h,
                        camera: cam,
                        activeInteractionBorderId: this.activeInteractionBorderId // [Req 2] Pass interaction state
                    });
                }
            }
        });
        this.layerCtx.restore();

        // 4. Composite to Main
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(this.layerCanvas, 0, 0);
        ctx.restore();

        // 5. Draw Guides
        ctx.globalAlpha = 1.0;
        borders.forEach(b => {
            ctx.lineWidth = 1 / cam.zoom;
            const color = b.color || (b.type === 'viewport' ? '#444444' : '#0ea5e9');
            ctx.strokeStyle = color;
            if (b.type === 'effect' || b.type === 'tiled') {
                ctx.setLineDash([4 / cam.zoom, 4 / cam.zoom]); ctx.strokeRect(b.x, b.y, b.w, b.h); ctx.setLineDash([]);
            } else {
                ctx.strokeRect(b.x, b.y, b.w, b.h);
            }
        });
    }

    updateCompositeCache(project, cam, w, h) {
        if (this.compositeCanvas.width !== w || this.compositeCanvas.height !== h) {
            this.compositeCanvas.width = w;
            this.compositeCanvas.height = h;
        }
        this.compositeCtx.clearRect(0, 0, w, h);

        this.compositeCtx.save();
        this.compositeCtx.imageSmoothingEnabled = false;
        this.compositeCtx.translate(w / 2 + cam.x, h / 2 + cam.y);
        this.compositeCtx.scale(cam.zoom, cam.zoom);

        const frame = project.frames[project.currentFrameIndex];
        const minX = Math.floor((-w / 2 - cam.x) / cam.zoom);
        const minY = Math.floor((-h / 2 - cam.y) / cam.zoom);
        const maxX = Math.ceil((w / 2 - cam.x) / cam.zoom);
        const maxY = Math.ceil((h / 2 - cam.y) / cam.zoom);
        const minCX = Math.floor(minX / CHUNK_SIZE); const minCY = Math.floor(minY / CHUNK_SIZE);
        const maxCX = Math.floor(maxX / CHUNK_SIZE); const maxCY = Math.floor(maxY / CHUNK_SIZE);

        frame.layers.forEach(l => {
            if (!l.visible) return;
            this.compositeCtx.globalAlpha = l.opacity;
            if (!this.chunkCache.has(l)) this.rebuildLayerCache(l);
            const layerCache = this.chunkCache.get(l);
            for (let cy = minCY; cy <= maxCY; cy++) {
                for (let cx = minCX; cx <= maxCX; cx++) {
                    const key = `${cx},${cy}`;
                    const chunk = layerCache.get(key);
                    if (chunk) this.compositeCtx.drawImage(chunk, cx * CHUNK_SIZE, cy * CHUNK_SIZE);
                }
            }
        });
        this.compositeCtx.restore();
    }

    drawBackground(ctx) {
        const bg = this.store.get('settings').background;
        const w = this.app.canvas.width;
        const h = this.app.canvas.height;
        const cam = this.store.get('camera');
        const worldSize = bg.size;
        const screenSize = worldSize * cam.zoom;
        ctx.save();
        ctx.fillStyle = bg.color1;
        ctx.fillRect(0, 0, w, h);
        if (bg.style === 'checker') {
            const hash = `${bg.color1}-${bg.color2}`;
            if (this.lastBgHash !== hash) {
                this.bgPatternCtx.fillStyle = bg.color1;
                this.bgPatternCtx.fillRect(0, 0, 2, 2);
                this.bgPatternCtx.fillStyle = bg.color2;
                this.bgPatternCtx.fillRect(0, 0, 1, 1);
                this.bgPatternCtx.fillRect(1, 1, 1, 1);
                this.lastBgHash = hash;
            }
            const pattern = ctx.createPattern(this.bgPatternCanvas, 'repeat');
            const originX = w / 2 + cam.x;
            const originY = h / 2 + cam.y;
            const matrix = new DOMMatrix().translate(originX, originY).scale(screenSize, screenSize);
            pattern.setTransform(matrix);
            ctx.fillStyle = pattern;
            ctx.imageSmoothingEnabled = false;
            ctx.fillRect(0, 0, w, h);
        } else if (bg.style === 'dots') {
            ctx.fillStyle = bg.color2;
            const originX = w / 2 + cam.x;
            const originY = h / 2 + cam.y;
            const startI = Math.floor(-originX / screenSize);
            const startJ = Math.floor(-originY / screenSize);
            const rows = Math.ceil(h / screenSize) + 1;
            const cols = Math.ceil(w / screenSize) + 1;
            const dotSize = Math.max(1, screenSize / 4);
            for (let i = startI; i < startI + cols; i++) {
                for (let j = startJ; j < startJ + rows; j++) {
                    ctx.fillRect(originX + i * screenSize - dotSize / 2, originY + j * screenSize - dotSize / 2, dotSize, dotSize);
                }
            }
        }
        ctx.restore();
    }
}