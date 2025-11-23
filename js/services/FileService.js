import ColorUtils from '../utils/ColorUtils.js';

export default class FileService {
    init(app) {
        this.app = app;
        this.bus = app.bus;
        this.services = app.services;

        this.bus.on('cmd:saveProject', () => this.saveProject());
        this.bus.on('cmd:exportPNG', () => this.exportPNG());
        this.bus.on('cmd:exportSheet', () => this.exportSpritesheet());
        this.bus.on('cmd:loadProjectFile', (file) => this.loadProject(file));
        this.bus.on('cmd:importImageFile', (data) => this.importImage(data.file, data.dropPos));
    }

    get projectService() { return this.services.get('project'); }

    saveProject() {
        const project = this.projectService.activeProject;
        if (!project) { alert("No project to save."); return; }

        const serializable = {
            name: project.name,
            // Map Frames
            frames: project.frames.map(f => ({
                layers: f.layers.map(l => ({
                    ...l,
                    data: Array.from(l.data.entries())
                })),
                // FIX: Save the borders array. Fallback to old 'border' for safety if array empty
                borders: f.borders || (f.border ? [f.border] : [])
            })),
            palette: project.palette,
            currentFrame: project.currentFrameIndex,
            activeLayerId: project.activeLayerId
        };

        const blob = new Blob([JSON.stringify(serializable)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        this._download(url, `${project.name}.json`);
        this.bus.emit('projectSaved', project.id);
    }

    loadProject(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const raw = JSON.parse(e.target.result);
                if (!raw.frames || !Array.isArray(raw.frames)) throw new Error("Invalid file format");

                const restored = {
                    name: file.name.replace('.json', ''),
                    frames: raw.frames.map(f => ({
                        layers: f.layers.map(l => ({ ...l, data: new Map(l.data) })),
                        // FIX: Load borders array, or migrate old 'border'
                        borders: f.borders || (f.border ? [f.border] : [{ x: 0, y: 0, w: 32, h: 32, id: 'main', type: 'viewport' }])
                    })),
                    palette: raw.palette,
                    currentFrame: raw.currentFrame || 0,
                    activeLayerId: raw.activeLayerId
                };

                this.bus.emit('loadProject', restored);
            } catch (err) {
                console.error(err);
                alert('Invalid Project File');
            }
        };
        reader.readAsText(file);
    }

    // ... (exportPNG, exportSpritesheet, importImage, _download, _renderAndDownload, _extractPixels, _sendToSelectTool same as before) ...
    exportPNG() { const p = this.projectService.activeProject; if (!p) return; const frame = p.frames[p.currentFrameIndex]; this._renderAndDownload([frame], `${p.name}_frame.png`); }
    exportSpritesheet() { const p = this.projectService.activeProject; if (!p) return; this._renderAndDownload(p.frames, `${p.name}_sheet.png`, true); }
    importImage(file, dropScreenPos) { if (!file) return; const reader = new FileReader(); reader.onload = (e) => { const img = new Image(); img.onload = () => { const pixels = this._extractPixels(img); if (pixels.length > 0) { this._sendToSelectTool(pixels, img.width, img.height, dropScreenPos); } }; img.src = e.target.result; }; reader.readAsDataURL(file); }
    _download(url, filename) { const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); }
    _renderAndDownload(frames, name, isSheet = false) { if (frames.length === 0) return; const b = frames[0].borders ? frames[0].borders[0] : (frames[0].border || { x: 0, y: 0, w: 32, h: 32 }); const canvas = document.createElement('canvas'); canvas.width = isSheet ? b.w * frames.length : b.w; canvas.height = b.h; const ctx = canvas.getContext('2d'); frames.forEach((frame, i) => { const offsetX = isSheet ? i * b.w : 0; frame.layers.forEach(layer => { if (!layer.visible) return; for (const [key, color] of layer.data) { const [x, y] = key.split(',').map(Number); if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) { ctx.fillStyle = color; ctx.fillRect(x - b.x + offsetX, y - b.y, 1, 1); } } }); }); this._download(canvas.toDataURL(), name); }
    _extractPixels(img) { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0); const data = ctx.getImageData(0, 0, c.width, c.height).data; const pixels = []; for (let i = 0; i < data.length; i += 4) { const a = data[i + 3]; if (a > 10) { const r = data[i], g = data[i + 1], b = data[i + 2]; const hex = ColorUtils.rgbToHex(r, g, b); const x = (i / 4) % c.width; const y = Math.floor((i / 4) / c.width); pixels.push({ relX: x, relY: y, color: hex }); } } return pixels; }
    _sendToSelectTool(pixels, w, h, dropScreenPos) { let anchor = null; if (dropScreenPos) { const worldPos = this.app.screenToWorld(dropScreenPos.x, dropScreenPos.y); anchor = { x: Math.floor(worldPos.x + w / 2), y: Math.floor(worldPos.y + h / 2) }; } this.bus.emit('cmd:pasteBuffer', { buffer: pixels, anchor }); }
}