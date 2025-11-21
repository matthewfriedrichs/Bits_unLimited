export default class DataPlugin {
    init(app) {
        this.app = app;
        this.app.dataAccess = this;

        this.projects = [];
        this.activeProjectId = null;

        this.cacheCanvas = document.createElement('canvas');
        this.cacheCtx = this.cacheCanvas.getContext('2d');
        this.cacheOffset = { x: 0, y: 0 };
        this.isDirty = true;
        this.onionSkin = false;

        this.createProject('Untitled-1');

        // --- LISTENERS ---
        app.bus.on('requestPixelChange', p => this.setPixel(p));
        app.bus.on('requestBatchPixels', pixels => {
            pixels.forEach(p => this.setPixel(p));
            this.isDirty = true;
            app.bus.emit('render', app.ctx);
        });

        app.bus.on('addLayer', o => this.addLayer(o));
        app.bus.on('deleteLayer', id => this.deleteLayer(id));
        app.bus.on('addFrame', o => this.addFrame(o));
        app.bus.on('deleteFrame', idx => this.deleteFrame(idx));
        app.bus.on('duplicateFrame', () => this.duplicateFrame());

        // NEW: Reorder Commands
        app.bus.on('cmd_ReorderLayers', ({ fromIndex, toIndex }) => this.reorderLayer(fromIndex, toIndex));
        app.bus.on('cmd_ReorderFrames', ({ fromIndex, toIndex }) => this.reorderFrame(fromIndex, toIndex));

        app.bus.on('selectLayer', id => {
            if (this.activeProject) {
                this.activeProject.activeLayerId = id;
                app.bus.emit('dataChanged', this.getSnapshot());
            }
        });
        app.bus.on('selectFrame', i => {
            if (this.activeProject) {
                this.activeProject.currentFrameIndex = i;
                this.checkLayer();
                this.isDirty = true;
                app.bus.emit('frameChanged', i);
                app.bus.emit('dataChanged', this.getSnapshot());
            }
        });

        // Existing moveLayer (Swap) is kept for compatibility or keyboard nudging if needed
        app.bus.on('moveLayer', ({ id, direction }) => { this.moveLayer(id, direction); this.isDirty = true; });

        app.bus.on('toggleLayer', id => { this.toggleLayer(id); this.isDirty = true; });
        app.bus.on('toggleLock', id => { this.toggleLock(id); this.app.bus.emit('dataChanged', this.getSnapshot()); });
        app.bus.on('toggleOnionSkin', () => { this.onionSkin = !this.onionSkin; app.bus.emit('onionSkinChanged', this.onionSkin); app.bus.emit('render', app.ctx); });

        app.bus.on('cmd_NewProject', () => this.createProject());
        app.bus.on('cmd_CloseProject', payload => {
            if (typeof payload === 'string') this.closeProject(payload, false);
            else this.closeProject(payload.id, payload.force);
        });
        app.bus.on('cmd_SwitchProject', id => this.switchProject(id));
        app.bus.on('projectSaved', (id) => {
            const p = this.projects.find(proj => proj.id === id);
            if (p) p.modified = false;
        });

        app.bus.on('cmd_PaletteChange', () => { this.markModified(); this.app.bus.emit('dataChanged', this.getSnapshot()); });
        app.bus.on('refreshState', () => app.bus.emit('dataChanged', this.getSnapshot()));
        app.bus.on('updateFrameBorder', rect => { if (this.activeProject) { this.frames[this.currentFrameIndex].border = rect; this.markModified(); app.bus.emit('render', app.ctx); } });
        app.bus.on('render', ctx => this.renderLayers(ctx));

        app.bus.on('loadProject', data => {
            this.createProject(data.name || 'Imported');
            const proj = this.activeProject;
            proj.frames = data.frames;
            proj.palette = data.palette || ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff'];
            proj.currentFrameIndex = data.currentFrame || 0;
            proj.activeLayerId = data.activeLayerId;
            proj.modified = false;
            this.isDirty = true;
            app.bus.emit('refreshState');
            app.bus.emit('render', app.ctx);
            app.bus.emit('paletteLoaded', proj.palette);
        });
    }

    // --- REORDER LOGIC (NEW) ---

    reorderLayer(fromIndex, toIndex) {
        if (!this.activeProject) return;
        const layers = this.frames[this.currentFrameIndex].layers;

        // Bounds check
        if (fromIndex < 0 || fromIndex >= layers.length || toIndex < 0 || toIndex >= layers.length) return;
        if (fromIndex === toIndex) return;

        // Move
        const [layer] = layers.splice(fromIndex, 1);
        layers.splice(toIndex, 0, layer);

        this.markModified();
        this.isDirty = true;
        this.app.bus.emit('dataChanged', this.getSnapshot());
    }

    reorderFrame(fromIndex, toIndex) {
        if (!this.activeProject) return;
        const frames = this.frames;

        if (fromIndex < 0 || fromIndex >= frames.length || toIndex < 0 || toIndex >= frames.length) return;
        if (fromIndex === toIndex) return;

        // Track the currently selected frame logic
        const wasSelected = (this.currentFrameIndex === fromIndex);
        const offset = (this.currentFrameIndex > fromIndex ? -1 : 0) + (this.currentFrameIndex >= toIndex ? 1 : 0);

        const [frame] = frames.splice(fromIndex, 1);
        frames.splice(toIndex, 0, frame);

        // Update selection to follow the frame or stay stable
        if (wasSelected) {
            this.currentFrameIndex = toIndex;
        } else if (fromIndex < this.currentFrameIndex && toIndex >= this.currentFrameIndex) {
            this.currentFrameIndex--;
        } else if (fromIndex > this.currentFrameIndex && toIndex <= this.currentFrameIndex) {
            this.currentFrameIndex++;
        }

        this.markModified();
        this.isDirty = true;

        // If we moved the active frame, we need to full re-render, otherwise just UI update
        this.app.bus.emit('selectFrame', this.currentFrameIndex);
    }

    // --- (Keep existing methods unchanged) ---
    get activeProject() { return this.projects.find(p => p.id === this.activeProjectId); }
    get frames() { return this.activeProject ? this.activeProject.frames : []; }
    get currentFrameIndex() { return this.activeProject ? this.activeProject.currentFrameIndex : 0; }
    set currentFrameIndex(val) { if (this.activeProject) this.activeProject.currentFrameIndex = val; }
    get activeLayerId() { return this.activeProject ? this.activeProject.activeLayerId : null; }
    set activeLayerId(val) { if (this.activeProject) this.activeProject.activeLayerId = val; }
    createProject(name) {
        const id = Math.random().toString(36).substr(2, 9);
        const newProject = {
            id: id,
            name: name || `Untitled-${this.projects.length + 1}`,
            frames: [],
            palette: ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff'],
            currentFrameIndex: 0,
            activeLayerId: null,
            modified: false
        };
        const layerId = Math.random().toString(36).substr(2, 9);
        newProject.frames.push({
            layers: [{ id: layerId, name: 'Layer 1', visible: true, locked: false, isGlobal: true, opacity: 1.0, data: new Map() }],
            border: { x: 0, y: 0, w: 32, h: 32 }
        });
        newProject.activeLayerId = layerId;
        this.projects.push(newProject);
        this.switchProject(id);
        this.app.bus.emit('projectListChanged', this.projects);
    }
    switchProject(id) {
        if (this.activeProjectId === id) return;
        this.activeProjectId = id;
        this.isDirty = true;
        this.app.bus.emit('refreshState');
        this.app.bus.emit('render', this.app.ctx);
        this.app.bus.emit('projectSwitched', id);
        if (this.activeProject) {
            this.app.bus.emit('paletteLoaded', this.activeProject.palette);
        }
    }
    closeProject(id, force = false) {
        if (this.projects.length <= 1) return;
        const idx = this.projects.findIndex(p => p.id === id);
        if (idx === -1) return;
        const project = this.projects[idx];
        if (project.modified && !force) {
            this.app.bus.emit('requestCloseConfirmation', { id: project.id, name: project.name });
            return;
        }
        this.projects.splice(idx, 1);
        if (id === this.activeProjectId) {
            const newIdx = Math.max(0, idx - 1);
            this.switchProject(this.projects[newIdx].id);
        }
        this.app.bus.emit('projectListChanged', this.projects);
    }
    markModified() { if (this.activeProject) this.activeProject.modified = true; }
    getPixelColor(x, y) {
        if (!this.activeProject) return null;
        const frame = this.frames[this.currentFrameIndex];
        const layer = frame.layers.find(l => l.id === this.activeLayerId);
        return (layer && layer.data.has(`${x},${y}`)) ? layer.data.get(`${x},${y}`) : null;
    }
    createLayer(name, id, isGlobal = true) { return { id: id || Math.random().toString(36).substr(2, 9), name: name || 'Layer', visible: true, locked: false, isGlobal: isGlobal, opacity: 1.0, data: new Map() }; }
    addFrame(opts = {}) {
        if (!this.activeProject) return;
        if (opts.restoreData) { this.frames.push(opts.restoreData); }
        else {
            const prev = this.frames[this.frames.length - 1];
            let layers = [];
            if (prev) { layers = prev.layers.filter(l => l.isGlobal !== false).map(l => ({ ...l, data: new Map() })); }
            if (layers.length === 0) { layers.push(this.createLayer('Local Layer', null, false)); }
            const border = prev ? { ...prev.border, x: prev.border.x + prev.border.w + 2 } : { x: 0, y: 0, w: 32, h: 32 };
            this.frames.push({ layers, border });
            if (!opts.isHistoryAction && this.app.bus) { this.app.bus.emit('cmd_AddFrame', { index: this.frames.length - 1 }); }
        }
        this.markModified();
        this.selectFrame(this.frames.length - 1);
        this.isDirty = true;
    }
    duplicateFrame() {
        if (!this.activeProject) return;
        const curr = this.frames[this.currentFrameIndex];
        const layers = curr ? curr.layers.map(l => ({ ...l, data: new Map(l.data) })) : [this.createLayer('Layer 1')];
        const border = curr ? { ...curr.border, x: curr.border.x + curr.border.w + 2 } : { x: 0, y: 0, w: 32, h: 32 };
        const newFrame = { layers, border };
        this.frames.push(newFrame);
        this.app.bus.emit('cmd_AddFrame', { index: this.frames.length - 1, restoreData: newFrame });
        this.markModified();
        this.selectFrame(this.frames.length - 1);
        this.isDirty = true;
    }
    deleteFrame(index) {
        if (!this.activeProject) return;
        if (this.frames.length <= 1) return;
        this.frames.splice(index, 1);
        if (this.currentFrameIndex >= this.frames.length) this.currentFrameIndex = this.frames.length - 1;
        this.markModified();
        this.selectFrame(this.currentFrameIndex);
        this.isDirty = true;
    }
    addLayer(opts = {}) {
        if (!this.activeProject) return;
        if (opts.restoreData) {
            this.frames[this.currentFrameIndex].layers.push(opts.restoreData);
            this.activeLayerId = opts.restoreData.id;
        } else {
            const global = opts.global !== false;
            const id = opts.id || Math.random().toString(36).substr(2, 9);
            const name = opts.name || (global ? `Layer ${this.frames[0].layers.length + 1}` : `Local Layer`);
            const newLayer = this.createLayer(name, id, global);
            if (global) this.frames.forEach(f => f.layers.push(this.createLayer(name, id, true)));
            else this.frames[this.currentFrameIndex].layers.push(newLayer);
            this.activeLayerId = id;
            if (!opts.id) this.app.bus.emit('cmd_AddLayer', { id, name, global });
        }
        this.markModified();
        this.isDirty = true;
        this.app.bus.emit('dataChanged', this.getSnapshot());
    }
    deleteLayer(id) {
        if (!this.activeProject) return;
        const f = this.frames[this.currentFrameIndex];
        if (f.layers.length > 1) {
            const layerToDelete = f.layers.find(x => x.id === id);
            if (layerToDelete) this.app.bus.emit('cmd_DeleteLayer', layerToDelete);
            f.layers = f.layers.filter(x => x.id !== id);
            if (this.activeLayerId === id) this.activeLayerId = f.layers[0].id;
            this.markModified();
            this.isDirty = true;
            this.app.bus.emit('dataChanged', this.getSnapshot());
        }
    }
    setPixel({ x, y, color, erase, layerId, frameIndex }, emit = true) {
        if (!this.activeProject) return;
        const targetFrameIdx = (frameIndex !== undefined) ? frameIndex : this.currentFrameIndex;
        const frame = this.frames[targetFrameIdx];
        if (!frame) return;
        const targetLayerId = layerId || this.activeLayerId;
        const layer = frame.layers.find(l => l.id === targetLayerId);
        if (layer && layer.visible && !layer.locked) {
            const key = `${x},${y}`;
            const oldColor = layer.data.get(key) || null;
            const newColor = erase ? null : color;
            if (oldColor !== newColor) {
                if (erase) layer.data.delete(key); else layer.data.set(key, color);
                if (targetFrameIdx === this.currentFrameIndex) this.isDirty = true;
                this.markModified();
                if (emit) {
                    this.app.bus.emit('pixelChangeApplied', { x, y, oldColor, newColor, layerId: targetLayerId, frameIndex: targetFrameIdx });
                }
            }
        }
    }
    updateCache() { if (!this.isDirty || !this.activeProject) return; const frame = this.frames[this.currentFrameIndex]; let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity; let hasPixels = false; frame.layers.forEach(l => { if (!l.visible) return; for (const key of l.data.keys()) { const [x, y] = key.split(',').map(Number); if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; hasPixels = true; } }); if (!hasPixels) { this.cacheCanvas.width = 1; this.cacheCanvas.height = 1; this.cacheOffset = { x: 0, y: 0 }; } else { const w = (maxX - minX) + 1; const h = (maxY - minY) + 1; this.cacheCanvas.width = w; this.cacheCanvas.height = h; this.cacheOffset = { x: minX, y: minY }; this.cacheCtx.clearRect(0, 0, w, h); this.cacheCtx.translate(-minX, -minY); frame.layers.forEach(l => { if (!l.visible) return; this.cacheCtx.globalAlpha = l.opacity; for (const [key, color] of l.data) { const [x, y] = key.split(',').map(Number); this.cacheCtx.fillStyle = color; this.cacheCtx.fillRect(x, y, 1, 1); } }); this.cacheCtx.setTransform(1, 0, 0, 1, 0, 0); } this.isDirty = false; }
    renderLayers(ctx) { if (!this.activeProject) return; if (this.onionSkin && this.currentFrameIndex > 0) { ctx.globalAlpha = 0.3; this.renderFrameManual(ctx, this.frames[this.currentFrameIndex - 1]); ctx.globalAlpha = 1; } this.updateCache(); ctx.imageSmoothingEnabled = false; ctx.drawImage(this.cacheCanvas, this.cacheOffset.x, this.cacheOffset.y); const f = this.frames[this.currentFrameIndex]; if (f.border) { ctx.save(); ctx.strokeStyle = '#0ea5e9'; ctx.lineWidth = 1 / this.app.camera.zoom; ctx.setLineDash([4 / this.app.camera.zoom, 2 / this.app.camera.zoom]); ctx.strokeRect(f.border.x, f.border.y, f.border.w, f.border.h); ctx.fillStyle = '#0ea5e9'; const handleSz = 4 / this.app.camera.zoom; ctx.fillRect(f.border.x + f.border.w - handleSz / 2, f.border.y + f.border.h - handleSz / 2, handleSz, handleSz); ctx.restore(); } }
    renderFrameManual(ctx, frame) { frame.layers.forEach(l => { if (l.visible) { ctx.globalAlpha = l.opacity; for (const [k, c] of l.data) { const [x, y] = k.split(',').map(Number); ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); } } }); ctx.globalAlpha = 1; }
    selectFrame(i) { if (this.activeProject) { this.currentFrameIndex = i; this.checkLayer(); this.app.bus.emit('dataChanged', this.getSnapshot()); } }
    checkLayer() { const f = this.frames[this.currentFrameIndex]; if (!f.layers.find(l => l.id === this.activeLayerId)) this.activeLayerId = f.layers[0]?.id; }
    moveLayer(id, dir) { const l = this.frames[this.currentFrameIndex].layers, i = l.findIndex(x => x.id === id); if (i !== -1 && l[i + dir]) { [l[i], l[i + dir]] = [l[i + dir], l[i]]; this.app.bus.emit('dataChanged', this.getSnapshot()); } }
    toggleLayer(id) { const l = this.frames[this.currentFrameIndex].layers.find(x => x.id === id); if (l) { l.visible = !l.visible; this.app.bus.emit('dataChanged', this.getSnapshot()); } }
    toggleLock(id) { const l = this.frames[this.currentFrameIndex].layers.find(x => x.id === id); if (l) { l.locked = !l.locked; this.app.bus.emit('dataChanged', this.getSnapshot()); } }
    getSnapshot() { return this.activeProject ? { frames: this.frames, palette: this.activeProject.palette, currentFrame: this.currentFrameIndex, activeLayerId: this.activeLayerId, projectName: this.activeProject.name } : null; }
}