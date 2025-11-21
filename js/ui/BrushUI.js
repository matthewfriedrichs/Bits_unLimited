import DomBuilder from '../utils/DomBuilder.js';
import BrushGenerator from '../utils/BrushGenerator.js';
const dom = DomBuilder.create;

export default class BrushUI {
    init(app) {
        this.app = app;
        this.store = app.store;
        this.bus = app.bus;

        this.sidebar = document.getElementById('left-sidebar');
        this.modal = document.getElementById('brush-modal');

        // Load Custom Shapes & Sync to Store
        const loadedShapes = localStorage.getItem('pixel_custom_shapes');
        this.customShapes = loadedShapes ? JSON.parse(loadedShapes) : [];
        this.store.set('customShapes', this.customShapes); // Push to store for PenTool

        this.savedBrushes = [
            { id: 'basic', name: '1px Pixel', size: 1, shape: 'square', mode: 'normal' },
            { id: 'round-3', name: '3px Round', size: 3, shape: 'circle', mode: 'normal' },
            { id: 'dither', name: 'Dither', size: 4, shape: 'square', mode: 'dither', pattern: 'checker' }
        ];

        // Setup current brush
        const current = this.store.get('activeBrush');
        if (!current.footprint) {
            current.footprint = BrushGenerator.generate(current.shape, current.size, this.customShapes);
            this.store.set('activeBrush', current, true);
        }

        this.editingBrush = { ...current };
        this.isEditingShape = false;
        this.editorData = null;

        this.renderSidebar();

        this.bus.on('state:activeBrush', (b) => {
            this.editingBrush = { ...b };
            if (!this.editingBrush.footprint) {
                this.editingBrush.footprint = BrushGenerator.generate(this.editingBrush.shape, this.editingBrush.size, this.customShapes);
            }
            this.renderMiniList();
            if (!this.modal.classList.contains('hidden')) {
                this.renderModalContent();
                this.renderPreview();
            }
        });
    }

    renderSidebar() {
        this.trigger = dom('button', {
            class: "w-10 h-10 rounded bg-neutral-700 hover:bg-sky-700 flex items-center justify-center transition text-white",
            onClick: () => this.openModal()
        }, DomBuilder.icon('paint-brush'));

        this.miniList = dom('div', { class: "flex flex-col gap-1 w-full px-1" });

        const container = dom('div', { class: "w-full pt-4 border-t border-neutral-700 flex flex-col items-center gap-2" },
            this.trigger,
            this.miniList
        );
        this.sidebar.appendChild(container);
        this.renderMiniList();
    }

    renderMiniList() {
        this.miniList.innerHTML = '';
        const activeId = this.store.get('activeBrush').id;

        this.savedBrushes.forEach(b => {
            const isActive = activeId === b.id;
            const el = dom('div', {
                class: `w-full h-6 rounded text-[9px] flex items-center justify-center cursor-pointer truncate px-1 border ${isActive ? 'bg-sky-900 border-sky-500 text-white' : 'bg-neutral-800 border-transparent text-neutral-400 hover:border-neutral-600'}`,
                onClick: () => {
                    const footprint = BrushGenerator.generate(b.shape, b.size, this.customShapes);
                    this.store.set('activeBrush', { ...b, footprint });
                }
            }, b.name);
            this.miniList.appendChild(el);
        });
    }

    openModal() {
        this.modal.classList.remove('hidden');
        this.isEditingShape = false;
        this.editingBrush.footprint = BrushGenerator.generate(this.editingBrush.shape, this.editingBrush.size, this.customShapes);
        this.renderModalContent();
        this.renderPreview();
    }

    closeModal() {
        this.modal.classList.add('hidden');
    }

    updateProp(key, val) {
        this.editingBrush[key] = val;
        if (key === 'shape' || key === 'size') {
            this.editingBrush.footprint = BrushGenerator.generate(this.editingBrush.shape, this.editingBrush.size, this.customShapes);
        }
        this.store.set('activeBrush', { ...this.editingBrush });
        this.renderPreview();
    }

    saveBrush() {
        const idx = this.savedBrushes.findIndex(b => b.id === this.editingBrush.id);
        if (idx !== -1) this.savedBrushes[idx] = { ...this.editingBrush };
        else {
            this.editingBrush.id = Math.random().toString(36).substr(2, 5);
            this.savedBrushes.push({ ...this.editingBrush });
        }
        this.store.set('activeBrush', { ...this.editingBrush });
        this.closeModal();
        this.renderMiniList();
    }

    openShapeEditor(shapeIdToEdit = null) {
        this.isEditingShape = true;
        this.editorData = new Uint8Array(32 * 32).fill(0);
        if (shapeIdToEdit) {
            const existing = this.customShapes.find(s => s.id === shapeIdToEdit);
            if (existing) {
                this.editorData.set(existing.data);
                this.editingShapeId = shapeIdToEdit;
                this.editingShapeName = existing.name;
            }
        } else {
            this.editingShapeId = null;
            this.editingShapeName = "New Shape";
        }
        this.renderShapeEditor();
    }

    saveCustomShape() {
        const id = this.editingShapeId || `custom-${Math.random().toString(36).substr(2, 6)}`;
        const name = this.editingShapeName || "Custom Shape";
        const shapeObj = { id, name, data: Array.from(this.editorData) };

        const idx = this.customShapes.findIndex(s => s.id === id);
        if (idx !== -1) this.customShapes[idx] = shapeObj;
        else this.customShapes.push(shapeObj);

        localStorage.setItem('pixel_custom_shapes', JSON.stringify(this.customShapes));
        this.store.set('customShapes', this.customShapes); // Sync to store

        this.isEditingShape = false;
        this.updateProp('shape', id);
        this.renderModalContent();
    }

    renderShapeEditor() {
        this.modal.innerHTML = '';
        const canvasSize = 256;
        const gridSize = 32;
        const canvas = dom('canvas', {
            width: canvasSize, height: canvasSize,
            class: "bg-[#000] border border-neutral-600 cursor-crosshair touch-none",
            style: { imageRendering: 'pixelated' }
        });

        const draw = (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = Math.floor((e.clientX - rect.left) / (rect.width / gridSize));
            const y = Math.floor((e.clientY - rect.top) / (rect.height / gridSize));
            if (x >= 0 && x < gridSize && y >= 0 && y < gridSize) {
                const isErase = e.buttons === 2 || e.shiftKey;
                this.editorData[y * gridSize + x] = isErase ? 0 : 255;
                renderGrid();
            }
        };

        const renderGrid = () => {
            const ctx = canvas.getContext('2d');
            const cellSize = canvasSize / gridSize;
            ctx.clearRect(0, 0, canvasSize, canvasSize);
            ctx.strokeStyle = '#222';
            ctx.beginPath();
            for (let i = 0; i <= gridSize; i++) {
                ctx.moveTo(i * cellSize, 0); ctx.lineTo(i * cellSize, canvasSize);
                ctx.moveTo(0, i * cellSize); ctx.lineTo(canvasSize, i * cellSize);
            }
            ctx.stroke();
            ctx.fillStyle = '#fff';
            for (let i = 0; i < this.editorData.length; i++) {
                if (this.editorData[i] > 0) {
                    const cx = i % gridSize;
                    const cy = Math.floor(i / gridSize);
                    ctx.fillRect(cx * cellSize, cy * cellSize, cellSize, cellSize);
                }
            }
        };

        canvas.onpointerdown = (e) => {
            e.preventDefault();
            canvas.setPointerCapture(e.pointerId);
            draw(e);
            canvas.onpointermove = draw;
        };
        canvas.onpointerup = () => { canvas.onpointermove = null; };
        setTimeout(renderGrid, 0);

        const content = dom('div', { class: "bg-neutral-800 w-full max-w-xs rounded-xl shadow-2xl border border-neutral-700 overflow-hidden flex flex-col" },
            dom('div', { class: "flex justify-between items-center p-4 bg-neutral-900 border-b border-neutral-700" },
                dom('h3', { class: "font-bold text-sky-500" }, DomBuilder.icon('pencil-alt', 'mr-2'), "Shape Editor"),
                dom('button', { class: "text-neutral-400 hover:text-white", onClick: () => { this.isEditingShape = false; this.renderModalContent(); } }, DomBuilder.icon('times'))
            ),
            dom('div', { class: "p-5 flex flex-col gap-4 items-center" },
                dom('div', { class: "text-[10px] text-neutral-400 w-full text-center mb-1" }, "Draw High-Res Shape (32x32)"),
                canvas,
                dom('div', { class: "w-full" },
                    dom('label', { class: "text-xs text-neutral-500 uppercase font-bold" }, "Shape Name"),
                    dom('input', {
                        type: 'text', value: this.editingShapeName,
                        class: "w-full bg-neutral-700 text-white text-sm rounded px-2 py-1 mt-1 border-none outline-none",
                        onInput: (e) => this.editingShapeName = e.target.value
                    })
                ),
                dom('div', { class: "flex gap-2 w-full mt-2" },
                    dom('button', { class: "flex-1 bg-neutral-700 hover:bg-neutral-600 text-white py-2 rounded text-sm", onClick: () => { this.isEditingShape = false; this.renderModalContent(); } }, "Cancel"),
                    dom('button', { class: "flex-1 bg-sky-600 hover:bg-sky-500 text-white py-2 rounded font-bold text-sm", onClick: () => this.saveCustomShape() }, "Save Shape")
                )
            )
        );
        this.modal.appendChild(content);
    }

    renderPreview() {
        const canvas = document.getElementById('brush-preview-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const fp = this.editingBrush.footprint;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#333';
        const zoom = 10;
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        ctx.fillStyle = '#0ea5e9';
        fp.forEach(pt => { ctx.fillRect(cx + pt.x * zoom, cy + pt.y * zoom, zoom - 1, zoom - 1); });
        ctx.strokeStyle = '#555';
        ctx.beginPath(); ctx.moveTo(cx - 5, cy); ctx.lineTo(cx + 5, cy); ctx.moveTo(cx, cy - 5); ctx.lineTo(cx, cy + 5); ctx.stroke();
    }

    renderModalContent() {
        if (this.isEditingShape) { this.renderShapeEditor(); return; }
        this.modal.innerHTML = '';
        const b = this.editingBrush;
        const isCustom = this.customShapes.some(s => s.id === b.shape);
        const shapeOptions = [
            { val: 'square', label: 'Square' }, { val: 'circle', label: 'Circle' }, { val: 'diamond', label: 'Diamond' }, { val: 'star', label: 'Star' },
            ...this.customShapes.map(s => ({ val: s.id, label: s.name }))
        ];
        const makeSelect = (key, options) => dom('select', {
            class: "w-full bg-neutral-700 text-white text-sm rounded mt-1 px-2 py-1 border-none outline-none",
            onChange: (e) => this.updateProp(key, e.target.value)
        }, ...options.map(opt => dom('option', { value: opt.val, selected: b[key] === opt.val }, opt.label)));

        const content = dom('div', { class: "bg-neutral-800 w-full max-w-xs rounded-xl shadow-2xl border border-neutral-700 overflow-hidden flex flex-col" },
            dom('div', { class: "flex justify-between items-center p-4 bg-neutral-900 border-b border-neutral-700" },
                dom('h3', { class: "font-bold text-sky-500" }, DomBuilder.icon('paint-brush', 'mr-2'), "Brush Settings"),
                dom('button', { class: "text-neutral-400 hover:text-white", onClick: () => this.closeModal() }, DomBuilder.icon('times'))
            ),
            dom('div', { class: "p-5 flex flex-col gap-4" },
                dom('div', { class: "w-full h-32 bg-[#1a1a1a] rounded border border-neutral-700 flex items-center justify-center overflow-hidden relative" },
                    dom('canvas', { id: 'brush-preview-canvas', width: 200, height: 120 }),
                    dom('div', { class: "absolute bottom-1 right-2 text-[10px] text-neutral-500" }, "Pixel Preview")
                ),
                dom('div', {}, dom('label', { class: "text-xs text-neutral-500 uppercase font-bold" }, "Name"),
                    dom('input', { type: 'text', value: b.name, class: "w-full bg-neutral-700 text-white text-sm rounded px-2 py-1 mt-1 border-none outline-none", onInput: (e) => this.updateProp('name', e.target.value) })
                ),
                dom('div', {},
                    dom('div', { class: "flex justify-between text-xs text-neutral-400 mb-1" }, dom('span', { class: "uppercase font-bold" }, "Size"), dom('span', {}, `${b.size}px`)),
                    dom('input', { type: 'range', min: 1, max: 32, step: 1, value: b.size, class: "w-full", onInput: (e) => { const val = parseInt(e.target.value); e.target.previousSibling.lastChild.innerText = `${val}px`; this.updateProp('size', val); } })
                ),
                dom('div', {},
                    dom('div', { class: "flex justify-between items-end" }, dom('label', { class: "text-xs text-neutral-500 uppercase font-bold" }, "Shape Generator"), dom('div', { class: "flex gap-1" },
                        isCustom ? dom('button', { class: "text-[10px] bg-neutral-700 hover:bg-neutral-600 text-white px-2 py-0.5 rounded", onClick: () => this.openShapeEditor(b.shape) }, DomBuilder.icon('edit'), " Edit") : null,
                        dom('button', { class: "text-[10px] bg-sky-700 hover:bg-sky-600 text-white px-2 py-0.5 rounded", onClick: () => this.openShapeEditor(null) }, DomBuilder.icon('plus'), " New")
                    )),
                    makeSelect('shape', shapeOptions)
                ),
                dom('div', {}, dom('label', { class: "text-xs text-neutral-500 uppercase font-bold" }, "Mode"),
                    makeSelect('mode', [{ val: 'normal', label: 'Normal' }, { val: 'dither', label: 'Dither' }, { val: 'shade-up', label: 'Shade (+)' }, { val: 'shade-down', label: 'Shade (-)' }])
                ),
                dom('button', { class: "bg-sky-600 hover:bg-sky-500 text-white py-2 rounded font-bold text-sm mt-2", onClick: () => this.saveBrush() }, "Save Brush")
            )
        );
        this.modal.appendChild(content);
    }
}