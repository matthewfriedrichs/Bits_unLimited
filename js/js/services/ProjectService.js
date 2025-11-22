export default class ProjectService {
    init(app) {
        this.app = app;
        this.store = app.store;
        this.bus = app.bus;

        this.cacheCanvas = document.createElement('canvas');
        this.cacheCtx = this.cacheCanvas.getContext('2d');
        this.isDirty = true;

        // --- COMMANDS ---
        this.bus.on('cmd:createProject', (name) => this.createProject(name));
        this.bus.on('cmd:closeProject', (payload) => {
            if (typeof payload === 'string') this.closeProject(payload, false);
            else this.closeProject(payload.id, payload.force);
        });
        this.bus.on('cmd:switchProject', (id) => this.switchProject(id));
        this.bus.on('cmd:updatePalette', (newPalette) => this.updatePalette(newPalette));

        // Drawing & Data
        this.bus.on('requestPixelChange', (p) => this.setPixel(p));

        // Batch Pixels (History support)
        this.bus.on('requestBatchPixels', (pixels) => {
            const deltas = [];
            pixels.forEach(p => {
                const delta = this.setPixel(p, false);
                if (delta) deltas.push(delta);
            });

            if (deltas.length > 0) {
                this.isDirty = true;
                this.bus.emit('data:pixelsChanged', { batch: deltas });
            }
        });

        // Structural
        this.bus.on('cmd:addLayer', (opts) => this.addLayer(opts));
        this.bus.on('cmd:deleteLayer', (id) => this.deleteLayer(id));
        this.bus.on('cmd:renameLayer', (d) => this.renameLayer(d.id, d.name));
        this.bus.on('cmd:addFrame', () => this.addFrame());
        this.bus.on('cmd:duplicateFrame', () => this.duplicateFrame());
        this.bus.on('cmd:selectFrame', (i) => this.selectFrame(i));
        this.bus.on('cmd:updateFrameBorder', (rect) => this.updateFrameBorder(rect));

        // Reordering & Toggles
        this.bus.on('cmd:reorderLayers', (d) => this.reorderLayers(d.from, d.to));
        this.bus.on('cmd:reorderFrames', (d) => this.reorderFrames(d.from, d.to));
        this.bus.on('cmd:toggleLayer', (id) => this.toggleLayer(id));
        this.bus.on('cmd:toggleLock', (id) => this.toggleLock(id));

        // --- RENDER ---
        this.bus.on('render', (ctx) => this.renderLayers(ctx));
        this.bus.on('render:background', (ctx) => this.drawBackground(ctx));
    }

    get activeProject() { return this.store.activeProject; }
    get frames() { return this.activeProject ? this.activeProject.frames : []; }
    get currentFrameIndex() { return this.activeProject ? this.activeProject.currentFrameIndex : 0; }
    get activeLayerId() { return this.activeProject ? this.activeProject.activeLayerId : null; }

    getPixelColor(x, y) {
        if (!this.activeProject) return null;
        const frame = this.frames[this.currentFrameIndex];
        const layer = frame.layers.find(l => l.id === this.activeLayerId);
        return (layer && layer.data.has(`${x},${y}`)) ? layer.data.get(`${x},${y}`) : null;
    }

    createProject(name) {
        const newProject = {
            id: Math.random().toString(36).substr(2, 9),
            name: name || 'Untitled',
            frames: [],
            palette: this.store.get('currentPalette') || ['#000000', '#ffffff'],
            currentFrameIndex: 0,
            activeLayerId: null,
            modified: false
        };
        const layerId = Math.random().toString(36).substr(2, 9);
        // Initial Layer: Normal layer, no global flag needed
        newProject.frames.push({
            layers: [{ id: layerId, name: 'Layer 1', visible: true, locked: false, opacity: 1.0, data: new Map() }],
            border: { x: 0, y: 0, w: 32, h: 32 }
        });
        newProject.activeLayerId = layerId;
        const projects = [...this.store.get('projects'), newProject];
        this.store.set('projects', projects);
        this.switchProject(newProject.id);
    }

    switchProject(id) {
        const project = this.store.get('projects').find(p => p.id === id);
        if (!project) return;
        this.store.set('activeProjectId', id);
        this.store.set('currentPalette', project.palette);
        this.isDirty = true;
        this.bus.emit('projectSwitched', id);
    }

    updatePalette(newPalette) {
        if (this.activeProject) {
            this.activeProject.palette = newPalette;
            this.activeProject.modified = true;
            this.store.set('currentPalette', newPalette);
        }
    }

    setPixel({ x, y, color, erase, layerId, frameIndex }, emit = true) {
        if (!this.activeProject) return null;

        const fIdx = frameIndex !== undefined ? frameIndex : this.currentFrameIndex;
        const lId = layerId || this.activeLayerId;
        const frame = this.frames[fIdx];
        const layer = frame.layers.find(l => l.id === lId);

        if (layer && !layer.locked && layer.visible) {
            const key = `${x},${y}`;
            const oldColor = layer.data.get(key) || null;
            const newColor = erase ? null : color;

            if (oldColor !== newColor) {
                if (erase) layer.data.delete(key);
                else layer.data.set(key, color);

                this.isDirty = true;
                this.activeProject.modified = true;

                const delta = { x, y, oldColor, newColor, layerId: lId, frameIndex: fIdx };

                if (emit) {
                    this.bus.emit('pixelChangeApplied', delta);
                }
                return delta;
            }
        }
        return null;
    }

    // --- Structural Operations (Apply to ALL frames) ---

    addLayer(opts = {}) {
        if (!this.activeProject) return;
        const id = Math.random().toString(36).substr(2, 9);
        const name = opts.name || 'New Layer';

        // Add this layer to EVERY frame
        // They share ID/Name/Props, but get unique Data Maps
        this.frames.forEach(f => {
            f.layers.push({
                id,
                name,
                visible: true,
                locked: false,
                opacity: 1.0,
                data: new Map()
            });
        });

        this.activeProject.activeLayerId = id;
        this.store.set('projects', [...this.store.get('projects')]);
        this.bus.emit('cmd_AddLayer', { id, name });
    }

    deleteLayer(id) {
        if (!this.activeProject) return;

        // Check safety on current frame
        const currentFrame = this.frames[this.currentFrameIndex];
        if (currentFrame.layers.length <= 1) return;

        // Remove from ALL frames
        this.frames.forEach(f => {
            f.layers = f.layers.filter(l => l.id !== id);
        });

        // If we deleted the active layer, select the first available one
        if (this.activeLayerId === id) {
            this.activeProject.activeLayerId = currentFrame.layers[0].id;
        }

        this.isDirty = true;
        this.store.set('projects', [...this.store.get('projects')]);
        this.bus.emit('render', this.app.ctx);
    }

    renameLayer(id, name) {
        if (!this.activeProject) return;

        // Rename in ALL frames
        this.frames.forEach(f => {
            const layer = f.layers.find(l => l.id === id);
            if (layer) layer.name = name;
        });

        this.activeProject.modified = true;
        this.store.set('projects', [...this.store.get('projects')]);
    }

    toggleLayer(id) {
        if (!this.activeProject) return;

        // Toggle in ALL frames
        this.frames.forEach(f => {
            const layer = f.layers.find(l => l.id === id);
            if (layer) layer.visible = !layer.visible;
        });

        this.isDirty = true;
        this.store.set('projects', [...this.store.get('projects')]);
        this.bus.emit('render', this.app.ctx);
    }

    toggleLock(id) {
        if (!this.activeProject) return;

        // Toggle in ALL frames
        this.frames.forEach(f => {
            const layer = f.layers.find(l => l.id === id);
            if (layer) layer.locked = !layer.locked;
        });

        this.store.set('projects', [...this.store.get('projects')]);
    }

    reorderLayers(from, to) {
        if (!this.activeProject) return;

        // Reorder in ALL frames to keep indices synced
        this.frames.forEach(f => {
            const layers = f.layers;
            // Bounds check just in case
            if (from < layers.length && to < layers.length) {
                const item = layers.splice(from, 1)[0];
                layers.splice(to, 0, item);
            }
        });

        this.isDirty = true;
        this.store.set('projects', [...this.store.get('projects')]);
        this.bus.emit('render', this.app.ctx);
    }

    // --- Frame Operations ---

    addFrame() {
        if (!this.activeProject) return;
        const prev = this.frames[this.frames.length - 1];

        // Create new layers based on previous frame structure
        // SAME IDs (so they are the "same" layer timeline-wise)
        // NEW Data Maps (so they have unique pixels)
        const layers = prev.layers.map(l => ({
            ...l,
            data: new Map()
        }));

        const border = prev ? { ...prev.border, x: prev.border.x + prev.border.w + 2 } : { x: 0, y: 0, w: 32, h: 32 };

        this.frames.push({ layers, border });
        this.selectFrame(this.frames.length - 1);
    }

    duplicateFrame() {
        if (!this.activeProject) return;
        const curr = this.frames[this.currentFrameIndex];

        // Same IDs, but COPY data from current
        const layers = curr.layers.map(l => ({
            ...l,
            data: new Map(l.data)
        }));

        const border = { ...curr.border, x: curr.border.x + curr.border.w + 2 };
        this.frames.push({ layers, border });
        this.selectFrame(this.frames.length - 1);
    }

    // ... (Rest of methods: updateFrameBorder, updateCache, renderLayers, etc. remain unchanged) ...

    updateFrameBorder(rect) {
        if (!this.activeProject) return;
        const frame = this.frames[this.currentFrameIndex];
        if (frame) {
            frame.border = rect;
            this.activeProject.modified = true;
            this.bus.emit('render', this.app.ctx);
        }
    }

    updateCache() {
        if (!this.isDirty || !this.activeProject) return;
        this.cacheCanvas.width = 2000;
        this.cacheCanvas.height = 2000;
        this.cacheCtx.clearRect(0, 0, 2000, 2000);
        const frame = this.frames[this.currentFrameIndex];
        frame.layers.forEach(l => {
            if (!l.visible) return;
            this.cacheCtx.globalAlpha = l.opacity;
            for (const [key, color] of l.data) {
                const [x, y] = key.split(',').map(Number);
                this.cacheCtx.fillStyle = color;
                this.cacheCtx.fillRect(x + 1000, y + 1000, 1, 1);
            }
        });
        this.isDirty = false;
    }

    renderLayers(ctx) {
        if (!this.activeProject) return;
        this.updateCache();
        ctx.drawImage(this.cacheCanvas, -1000, -1000);
        const f = this.frames[this.currentFrameIndex];
        if (f.border) {
            ctx.strokeStyle = '#0ea5e9';
            ctx.lineWidth = 1 / this.store.get('camera').zoom;
            ctx.strokeRect(f.border.x, f.border.y, f.border.w, f.border.h);
        }
    }

    drawBackground(ctx) {
        const bg = this.store.get('settings').background;
        const w = this.app.canvas.width;
        const h = this.app.canvas.height;
        ctx.save();
        ctx.fillStyle = bg.color1;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
    }

    selectFrame(index) {
        if (!this.activeProject) return;
        this.activeProject.currentFrameIndex = index;
        this.isDirty = true;
        this.store.set('projects', [...this.store.get('projects')]);
        this.bus.emit('render', this.app.ctx);
    }

    closeProject(id, force = false) {
        const projects = this.store.get('projects');
        if (projects.length <= 1) return;
        const idx = projects.findIndex(p => p.id === id);
        if (idx === -1) return;
        const project = projects[idx];
        if (project.modified && !force) {
            this.bus.emit('requestCloseConfirmation', { id: project.id, name: project.name });
            return;
        }
        const newProjects = projects.filter(p => p.id !== id);
        this.store.set('projects', newProjects);
        if (id === this.store.get('activeProjectId')) {
            this.switchProject(newProjects[Math.max(0, idx - 1)].id);
        }
    }

    reorderFrames(from, to) {
        if (!this.activeProject) return;
        const item = this.frames.splice(from, 1)[0];
        this.frames.splice(to, 0, item);
        if (this.currentFrameIndex === from) this.activeProject.currentFrameIndex = to;
        this.store.set('projects', [...this.store.get('projects')]);
    }
}