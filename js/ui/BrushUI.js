import DomBuilder from '../utils/DomBuilder.js';
import BrushGenerator from '../utils/BrushGenerator.js';
const dom = DomBuilder.create;

export default class BrushUI {
    init(app) {
        this.app = app;
        this.store = app.store;
        this.bus = app.bus;

        this.modal = document.getElementById('brush-modal');

        // 1. Load Data
        const loadedShapes = localStorage.getItem('pixel_custom_shapes');
        this.customShapes = loadedShapes ? JSON.parse(loadedShapes) : [];
        this.store.set('customShapes', this.customShapes);

        const loadedBrushes = localStorage.getItem('pixel_brush_library');
        this.savedBrushes = loadedBrushes ? JSON.parse(loadedBrushes) : this.getDefaultBrushes();
    }

    getDefaultBrushes() {
        return [
            { id: 'pixel-1', name: '1px Pixel', size: 1, shape: 'square', mode: 'normal', pixelPerfect: true },
            { id: 'round-3', name: '3px Round', size: 3, shape: 'circle', mode: 'normal' },
            { id: 'round-5', name: '5px Round', size: 5, shape: 'circle', mode: 'normal' },
            { id: 'dither-check', name: 'Checker', size: 4, shape: 'square', mode: 'dither' },
            { id: 'shade-plus', name: 'Shade +', size: 3, shape: 'circle', mode: 'shade-up' },
            { id: 'shade-minus', name: 'Shade -', size: 3, shape: 'circle', mode: 'shade-down' }
        ];
    }

    /**
     * Creates the DOM element for the Brush Library Sidebar.
     * Used by ToolbarUI to inject into the tool options panel.
     */
    createLibraryElement() {
        // CHANGED: Border is now on the LEFT (border-l), Padding Left (pl-2), Removed right margins
        const container = dom('div', { class: "flex flex-col h-full w-40 border-l border-neutral-700 pl-2 ml-1" });

        // Header
        const header = dom('div', { class: "flex justify-between items-center mb-2 px-1 pt-2" },
            dom('span', { class: "text-[10px] font-bold text-neutral-500 uppercase" }, "Presets"),
            dom('button', {
                class: "text-neutral-400 hover:text-white transition",
                title: "Save Current as Preset",
                onClick: () => this.saveCurrentBrush()
            }, DomBuilder.icon('plus', 'text-xs'))
        );
        container.appendChild(header);

        // List
        const list = dom('div', { class: "flex-1 overflow-y-auto scrollbar-hide flex flex-col gap-1 pb-2" });

        this.savedBrushes.forEach((brush, index) => {
            const isActive = this.store.get('activeBrush').id === brush.id;

            // Preview
            const canvas = dom('canvas', { width: 24, height: 24, class: "w-6 h-6 bg-neutral-900 rounded border border-neutral-700 shrink-0" });
            this.drawBrushPreview(canvas, brush);

            const item = dom('div', {
                class: `group flex items-center gap-2 p-1 rounded cursor-pointer transition text-xs ${isActive ? 'bg-sky-900/40 border border-sky-500/30' : 'hover:bg-neutral-700 border border-transparent'}`,
                onClick: () => this.loadBrush(brush)
            },
                canvas,
                dom('span', { class: "truncate text-gray-300 flex-1" }, brush.name),
                // Delete Action
                dom('button', {
                    class: "opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-rose-400 transition",
                    onClick: (e) => { e.stopPropagation(); this.deleteBrush(index); }
                }, DomBuilder.icon('times', 'text-[10px]'))
            );
            list.appendChild(item);
        });

        container.appendChild(list);
        return container;
    }

    drawBrushPreview(canvas, brush) {
        const ctx = canvas.getContext('2d');
        const customShapes = this.store.get('customShapes');
        const footprint = BrushGenerator.generate(brush.shape, brush.size, customShapes);

        ctx.clearRect(0, 0, 24, 24);
        ctx.fillStyle = '#ccc';

        const cx = 12, cy = 12;
        const zoom = brush.size > 16 ? 16 / brush.size : 1;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(zoom, zoom);
        footprint.forEach(pt => ctx.fillRect(pt.x, pt.y, 1, 1));
        ctx.restore();
    }

    loadBrush(brush) {
        const newBrushState = JSON.parse(JSON.stringify(brush));
        const customShapes = this.store.get('customShapes');
        newBrushState.footprint = BrushGenerator.generate(newBrushState.shape, newBrushState.size, customShapes);

        this.store.set('activeBrush', newBrushState);

        // Force ToolbarUI to refresh so highlights update
        this.bus.emit('cmd:setToolSetting', { toolId: 'pen' });
    }

    saveCurrentBrush() {
        const current = this.store.get('activeBrush');
        const name = prompt("Preset Name:", current.name || "My Brush");

        if (name) {
            const preset = {
                ...current,
                id: Math.random().toString(36).substr(2, 9),
                name: name,
                footprint: undefined
            };
            this.savedBrushes.push(preset);
            this.persistLibrary();
            this.bus.emit('cmd:setToolSetting', { toolId: 'pen' });
        }
    }

    deleteBrush(index) {
        if (confirm("Delete preset?")) {
            this.savedBrushes.splice(index, 1);
            this.persistLibrary();
            this.bus.emit('cmd:setToolSetting', { toolId: 'pen' });
        }
    }

    persistLibrary() {
        localStorage.setItem('pixel_brush_library', JSON.stringify(this.savedBrushes));
    }

    // --- Shape Editor (Unchanged) ---
    openShapeEditor(shapeIdToEdit = null) { this.modal.classList.remove('hidden'); this.editorData = new Uint8Array(32 * 32).fill(0); this.editingShapeId = null; this.editingShapeName = "My Shape"; if (shapeIdToEdit) { const existing = this.customShapes.find(s => s.id === shapeIdToEdit); if (existing) { this.editorData.set(existing.data); this.editingShapeId = shapeIdToEdit; this.editingShapeName = existing.name; } } this.renderEditorUI(); }
    closeEditor() { this.modal.classList.add('hidden'); }
    saveCustomShape() { const id = this.editingShapeId || `custom-${Math.random().toString(36).substr(2, 6)}`; const name = this.editingShapeName || "Custom Shape"; const shapeObj = { id, name, data: Array.from(this.editorData) }; const idx = this.customShapes.findIndex(s => s.id === id); if (idx !== -1) this.customShapes[idx] = shapeObj; else this.customShapes.push(shapeObj); localStorage.setItem('pixel_custom_shapes', JSON.stringify(this.customShapes)); this.store.set('customShapes', [...this.customShapes]); const activeBrush = this.store.get('activeBrush'); if (activeBrush.shape === id) { const fp = BrushGenerator.generate(id, activeBrush.size, this.customShapes); this.store.set('activeBrush', { ...activeBrush, footprint: fp }); } this.closeEditor(); }
    renderEditorUI() { this.modal.innerHTML = ''; const canvasSize = 320; const gridSize = 32; const cellSize = canvasSize / gridSize; const canvas = dom('canvas', { width: canvasSize, height: canvasSize, class: "bg-[#111] border border-neutral-600 cursor-crosshair touch-none shadow-inner", style: { imageRendering: 'pixelated' } }); const renderGrid = () => { const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvasSize, canvasSize); ctx.strokeStyle = '#222'; ctx.lineWidth = 1; ctx.beginPath(); for (let i = 0; i <= gridSize; i++) { ctx.moveTo(i * cellSize, 0); ctx.lineTo(i * cellSize, canvasSize); ctx.moveTo(0, i * cellSize); ctx.lineTo(canvasSize, i * cellSize); } ctx.stroke(); ctx.fillStyle = '#0ea5e9'; for (let i = 0; i < this.editorData.length; i++) { if (this.editorData[i] > 0) { const x = i % gridSize; const y = Math.floor(i / gridSize); ctx.fillRect(x * cellSize + 1, y * cellSize + 1, cellSize - 2, cellSize - 2); } } ctx.strokeStyle = '#444'; ctx.beginPath(); ctx.moveTo(canvasSize / 2, 0); ctx.lineTo(canvasSize / 2, canvasSize); ctx.moveTo(0, canvasSize / 2); ctx.lineTo(canvasSize, canvasSize / 2); ctx.stroke(); }; const paint = (e) => { const rect = canvas.getBoundingClientRect(); const x = Math.floor((e.clientX - rect.left) / (rect.width / gridSize)); const y = Math.floor((e.clientY - rect.top) / (rect.height / gridSize)); if (x >= 0 && x < gridSize && y >= 0 && y < gridSize) { const isErase = e.buttons === 2 || e.shiftKey; this.editorData[y * gridSize + x] = isErase ? 0 : 255; renderGrid(); } }; canvas.onpointerdown = (e) => { e.preventDefault(); canvas.setPointerCapture(e.pointerId); paint(e); canvas.onpointermove = paint; }; canvas.onpointerup = () => { canvas.onpointermove = null; }; canvas.oncontextmenu = (e) => e.preventDefault(); setTimeout(renderGrid, 0); const content = dom('div', { class: "bg-neutral-800 w-full max-w-sm rounded-xl shadow-2xl border border-neutral-700 overflow-hidden flex flex-col animate-fade-in-down" }, dom('div', { class: "flex justify-between items-center p-4 bg-neutral-900 border-b border-neutral-700" }, dom('h3', { class: "font-bold text-white" }, DomBuilder.icon('pencil-alt', 'mr-2 text-sky-500'), "Brush Shape Editor"), dom('button', { class: "text-neutral-400 hover:text-white", onClick: () => this.closeEditor() }, DomBuilder.icon('times'))), dom('div', { class: "p-6 flex flex-col items-center gap-4" }, dom('div', { class: "flex justify-between w-full text-[10px] text-neutral-400 uppercase font-bold" }, dom('span', {}, "Draw 32x32 Shape"), dom('span', {}, "L-Click: Draw | R-Click: Erase")), canvas, dom('div', { class: "w-full" }, dom('label', { class: "text-xs text-neutral-500 uppercase font-bold block mb-1" }, "Shape Name"), dom('input', { type: 'text', value: this.editingShapeName, class: "w-full bg-neutral-900 text-white text-sm rounded px-3 py-2 border border-neutral-600 focus:border-sky-500 outline-none transition", onInput: (e) => this.editingShapeName = e.target.value })), dom('div', { class: "flex gap-3 w-full mt-2" }, dom('button', { class: "flex-1 bg-neutral-700 hover:bg-neutral-600 text-white py-2 rounded text-sm font-bold transition", onClick: () => this.closeEditor() }, "Cancel"), dom('button', { class: "flex-1 bg-sky-600 hover:bg-sky-500 text-white py-2 rounded text-sm font-bold shadow-lg shadow-sky-900/20 transition", onClick: () => this.saveCustomShape() }, "Save Shape")))); this.modal.appendChild(content); }
}