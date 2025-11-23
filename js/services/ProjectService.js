export default class ProjectService {
    init(app) {
        this.app = app;
        this.store = app.store;
        this.bus = app.bus;

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
        this.bus.on('requestBatchPixels', (pixels) => {
            const deltas = [];
            pixels.forEach(p => {
                const delta = this.setPixel(p, false);
                if (delta) deltas.push(delta);
            });
            if (deltas.length > 0) {
                this.activeProject.modified = true;
                this.bus.emit('data:pixelsChanged', { batch: deltas });
                this.bus.emit('render', this.app.ctx);
            }
        });

        // Structural
        this.bus.on('cmd:addLayer', (opts) => this.addLayer(opts));
        this.bus.on('cmd:deleteLayer', (id) => this.deleteLayer(id));
        this.bus.on('cmd:renameLayer', (d) => this.renameLayer(d.id, d.name));
        this.bus.on('cmd:selectLayer', (id) => this.selectLayer(id));

        this.bus.on('cmd:addFrame', () => this.addFrame());
        this.bus.on('cmd:duplicateFrame', () => this.duplicateFrame());
        this.bus.on('cmd:selectFrame', (i) => this.selectFrame(i));

        // --- NEW BORDER COMMANDS ---
        this.bus.on('cmd:addBorder', (border) => this.addBorder(border));
        this.bus.on('cmd:updateBorder', (border) => this.updateBorder(border));
        this.bus.on('cmd:deleteBorder', (id) => this.deleteBorder(id));

        // Reordering & Toggles
        this.bus.on('cmd:reorderLayers', (d) => this.reorderLayers(d.from, d.to));
        this.bus.on('cmd:reorderFrames', (d) => this.reorderFrames(d.from, d.to));
        this.bus.on('cmd:toggleLayer', (id) => this.toggleLayer(id));
        this.bus.on('cmd:toggleLock', (id) => this.toggleLock(id));
    }

    get activeProject() { return this.store.activeProject; }
    get frames() { return this.activeProject ? this.activeProject.frames : []; }
    get currentFrameIndex() { return this.activeProject ? this.activeProject.currentFrameIndex : 0; }
    get activeLayerId() { return this.activeProject ? this.activeProject.activeLayerId : null; }

    // ... (getPixelColor, switchProject, updatePalette, setPixel, selectLayer, etc. SAME AS BEFORE) ...
    getPixelColor(x, y) {
        if (!this.activeProject) return null;
        const frame = this.frames[this.currentFrameIndex];
        const layer = frame.layers.find(l => l.id === this.activeLayerId);
        return (layer && layer.data.has(`${x},${y}`)) ? layer.data.get(`${x},${y}`) : null;
    }
    switchProject(id) {
        const project = this.store.get('projects').find(p => p.id === id);
        if (!project) return;
        this.store.set('activeProjectId', id);
        this.store.set('currentPalette', project.palette);
        this.bus.emit('projectSwitched', id);
    }
    updatePalette(newPalette) {
        if (this.activeProject) {
            this.activeProject.palette = newPalette;
            this.activeProject.modified = true;
            this.store.set('currentPalette', newPalette);
        }
    }
    selectLayer(id) {
        if (!this.activeProject) return;
        if (this.activeProject.activeLayerId !== id) {
            this.activeProject.activeLayerId = id;
            this.store.set('projects', [...this.store.get('projects')]);
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
                this.activeProject.modified = true;
                const delta = { x, y, oldColor, newColor, layerId: lId, frameIndex: fIdx };
                if (emit) {
                    this.bus.emit('pixelChangeApplied', delta);
                    this.bus.emit('render', this.app.ctx);
                }
                return delta;
            }
        }
        return null;
    }

    // --- Core Operations (Updated for Borders) ---

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

        // Initial Frame with a Default "Viewport" Border
        newProject.frames.push({
            layers: [{ id: layerId, name: 'Layer 1', visible: true, locked: false, opacity: 1.0, data: new Map() }],
            // Borders Array: replacing single 'border' object
            borders: [{
                id: 'main-view',
                name: 'Main View',
                x: 0, y: 0, w: 32, h: 32,
                type: 'viewport',
                effect: null
            }]
        });

        newProject.activeLayerId = layerId;
        const projects = [...this.store.get('projects'), newProject];
        this.store.set('projects', projects);
        this.switchProject(newProject.id);
    }

    // --- Border Management ---

    addBorder(border) {
        if (!this.activeProject) return;
        const frame = this.frames[this.currentFrameIndex];
        if (!frame.borders) frame.borders = []; // Safety init

        frame.borders.push(border);

        this.activeProject.modified = true;
        this.bus.emit('render', this.app.ctx);
    }

    updateBorder(updatedBorder) {
        if (!this.activeProject) return;
        const frame = this.frames[this.currentFrameIndex];
        if (!frame.borders) return;

        const index = frame.borders.findIndex(b => b.id === updatedBorder.id);
        if (index !== -1) {
            frame.borders[index] = updatedBorder;
            this.activeProject.modified = true;
            this.bus.emit('render', this.app.ctx);
        }
    }

    deleteBorder(id) {
        if (!this.activeProject) return;
        const frame = this.frames[this.currentFrameIndex];
        if (!frame.borders) return;

        frame.borders = frame.borders.filter(b => b.id !== id);

        this.activeProject.modified = true;
        this.bus.emit('render', this.app.ctx);
    }

    // --- Frame Operations (Updated to Clone Borders) ---

    addFrame() {
        if (!this.activeProject) return;
        const prev = this.frames[this.frames.length - 1];
        const layers = prev.layers.map(l => ({ ...l, data: new Map() }));

        // Clone borders (deep copy)
        const borders = prev.borders ? prev.borders.map(b => ({ ...b })) : [{ x: 0, y: 0, w: 32, h: 32, id: 'main', type: 'viewport' }];

        // Offset borders slightly for visual feedback? Or keep aligned? Keep aligned for animation.
        this.frames.push({ layers, borders });
        this.selectFrame(this.frames.length - 1);
    }

    duplicateFrame() {
        if (!this.activeProject) return;
        const curr = this.frames[this.currentFrameIndex];
        const layers = curr.layers.map(l => ({ ...l, data: new Map(l.data) }));

        // Clone borders
        const borders = curr.borders ? curr.borders.map(b => ({ ...b })) : [];

        this.frames.push({ layers, borders });
        this.selectFrame(this.frames.length - 1);
    }

    // ... (Other structural methods like addLayer, deleteLayer, etc. same as before) ...
    createLayerWithId(id, name) { if (!this.activeProject) return; this.frames.forEach(f => { f.layers.push({ id, name, visible: true, locked: false, opacity: 1.0, data: new Map() }); }); this.activeProject.activeLayerId = id; this.store.set('projects', [...this.store.get('projects')]); this.bus.emit('cmd_AddLayer', { id, name }); this.bus.emit('render', this.app.ctx); }
    restoreLayer(layerObj, index) { if (!this.activeProject) return; this.frames.forEach(f => { const restored = { ...layerObj, data: new Map(layerObj.data) }; f.layers.splice(index, 0, restored); }); this.activeProject.activeLayerId = layerObj.id; this.store.set('projects', [...this.store.get('projects')]); this.bus.emit('cmd_AddLayer', { id: layerObj.id, name: layerObj.name }); this.bus.emit('render', this.app.ctx); }
    addLayer(opts = {}) { if (!this.activeProject) return; const id = Math.random().toString(36).substr(2, 9); const name = opts.name || 'New Layer'; this.createLayerWithId(id, name); }
    deleteLayer(id) { if (!this.activeProject) return; const currentFrame = this.frames[this.currentFrameIndex]; if (currentFrame.layers.length <= 1) return; this.frames.forEach(f => { f.layers = f.layers.filter(l => l.id !== id); }); if (this.activeLayerId === id) { this.activeProject.activeLayerId = currentFrame.layers[0].id; } this.activeProject.modified = true; this.store.set('projects', [...this.store.get('projects')]); this.bus.emit('render', this.app.ctx); }
    renameLayer(id, name) { if (!this.activeProject) return; this.frames.forEach(f => { const layer = f.layers.find(l => l.id === id); if (layer) layer.name = name; }); this.activeProject.modified = true; this.store.set('projects', [...this.store.get('projects')]); }
    toggleLayer(id) { if (!this.activeProject) return; this.frames.forEach(f => { const layer = f.layers.find(l => l.id === id); if (layer) layer.visible = !layer.visible; }); this.store.set('projects', [...this.store.get('projects')]); this.bus.emit('render', this.app.ctx); }
    toggleLock(id) { if (!this.activeProject) return; this.frames.forEach(f => { const layer = f.layers.find(l => l.id === id); if (layer) layer.locked = !layer.locked; }); this.store.set('projects', [...this.store.get('projects')]); }
    reorderLayers(from, to) { if (!this.activeProject) return; this.frames.forEach(f => { const layers = f.layers; if (from < layers.length && to < layers.length) { const item = layers.splice(from, 1)[0]; layers.splice(to, 0, item); } }); this.activeProject.modified = true; this.store.set('projects', [...this.store.get('projects')]); this.bus.emit('render', this.app.ctx); }
    selectFrame(index) { if (!this.activeProject) return; this.activeProject.currentFrameIndex = index; this.store.set('projects', [...this.store.get('projects')]); this.bus.emit('render', this.app.ctx); }
    closeProject(id, force = false) { const projects = this.store.get('projects'); if (projects.length <= 1) return; const idx = projects.findIndex(p => p.id === id); if (idx === -1) return; const project = projects[idx]; if (project.modified && !force) { this.bus.emit('requestCloseConfirmation', { id: project.id, name: project.name }); return; } const newProjects = projects.filter(p => p.id !== id); this.store.set('projects', newProjects); if (id === this.store.get('activeProjectId')) { this.switchProject(newProjects[Math.max(0, idx - 1)].id); } }
    reorderFrames(from, to) { if (!this.activeProject) return; const item = this.frames.splice(from, 1)[0]; this.frames.splice(to, 0, item); if (this.currentFrameIndex === from) this.activeProject.currentFrameIndex = to; this.activeProject.modified = true; this.store.set('projects', [...this.store.get('projects')]); }
}