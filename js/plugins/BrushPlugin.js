import DomBuilder from '../utils/DomBuilder.js';
const dom = DomBuilder.create;

export default class BrushPlugin {
    init(app) {
        this.app = app;
        this.sidebar = document.getElementById('left-sidebar');
        this.modal = document.getElementById('brush-modal');

        this.brushes = [
            { id: 'basic', name: '1px Pixel', size: 1, shape: 'square', mode: 'normal' },
            { id: 'round-3', name: '3px Round', size: 3, shape: 'circle', mode: 'normal' },
            { id: 'dither', name: 'Dither', size: 4, shape: 'square', mode: 'dither', pattern: 'checker' },
            { id: 'shade-plus', name: 'Shade +', size: 2, shape: 'circle', mode: 'shade-up' },
            { id: 'shade-minus', name: 'Shade -', size: 2, shape: 'circle', mode: 'shade-down' }
        ];

        // Sidebar UI
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

        // Listen for History
        app.bus.on('refreshBrushUI', (brushData) => {
            this.editingBrush = { ...brushData };
            this.app.state.activeBrush = { ...brushData };
            this.renderMiniList();
            if (!this.modal.classList.contains('hidden')) this.renderModal();
        });
    }

    renderMiniList() {
        this.miniList.innerHTML = '';
        this.brushes.forEach(b => {
            const active = this.app.state.activeBrush.id === b.id;
            const el = dom('div', {
                class: `w-full h-6 rounded text-[9px] flex items-center justify-center cursor-pointer truncate px-1 border ${active ? 'bg-sky-900 border-sky-500 text-white' : 'bg-neutral-800 border-transparent text-neutral-400 hover:border-neutral-600'}`,
                onClick: () => {
                    this.app.state.activeBrush = { ...b };
                    this.renderMiniList();
                }
            }, b.name);
            this.miniList.appendChild(el);
        });
    }

    openModal() { this.modal.classList.remove('hidden'); this.editingBrush = { ...this.app.state.activeBrush }; this.renderModal(); }
    closeModal() { this.modal.classList.add('hidden'); this.renderMiniList(); }

    saveBrush() {
        const idx = this.brushes.findIndex(b => b.id === this.editingBrush.id);
        if (idx !== -1) this.brushes[idx] = { ...this.editingBrush };
        else {
            this.editingBrush.id = Math.random().toString(36).substr(2, 5);
            this.brushes.push({ ...this.editingBrush });
        }
        this.app.state.activeBrush = { ...this.editingBrush };
        this.closeModal();
    }

    updateProp(key, val) {
        const oldVal = { ...this.editingBrush };
        this.editingBrush[key] = val;
        if (key === 'size' && this.editingBrush.shape === 'custom') { this.editingBrush.customPattern = new Array(val * val).fill(1); }
        if (key === 'shape' && val === 'custom') { if (!this.editingBrush.customPattern || this.editingBrush.customPattern.length !== this.editingBrush.size ** 2) { this.editingBrush.customPattern = new Array(this.editingBrush.size ** 2).fill(1); } }

        const newVal = { ...this.editingBrush };
        this.app.state.activeBrush = newVal;
        this.renderModal();
        this.app.bus.emit('cmd_BrushProp', { oldVal, newVal });
    }

    togglePatternBit(idx) {
        if (!this.editingBrush.customPattern) return;
        const oldVal = JSON.parse(JSON.stringify(this.editingBrush));
        this.editingBrush.customPattern[idx] = this.editingBrush.customPattern[idx] ? 0 : 1;
        this.app.state.activeBrush = { ...this.editingBrush };
        this.renderModal();
        const newVal = JSON.parse(JSON.stringify(this.editingBrush));
        this.app.bus.emit('cmd_BrushProp', { oldVal, newVal });
    }

    renderModal() {
        this.modal.innerHTML = '';
        const b = this.editingBrush;

        // --- Helper for Select Inputs ---
        const makeSelect = (key, options) => dom('select', {
            class: "w-full bg-neutral-700 text-white text-sm rounded mt-1 px-2 py-1 border-none outline-none",
            onChange: (e) => this.updateProp(key, e.target.value)
        }, ...options.map(opt => dom('option', { value: opt.val, selected: b[key] === opt.val }, opt.label)));

        // --- Pattern Editor ---
        let gridEditor = null;
        if (b.shape === 'custom') {
            const s = b.size;
            const pat = b.customPattern || new Array(s * s).fill(1);

            const grid = dom('div', {
                class: "grid gap-[1px] bg-neutral-700 mt-1 border border-neutral-600",
                style: { gridTemplateColumns: `repeat(${s}, 1fr)` }
            }, ...pat.map((val, i) => dom('div', {
                class: `aspect-square cursor-pointer ${val ? 'bg-black' : 'bg-white'}`,
                onClick: () => this.togglePatternBit(i)
            })));

            gridEditor = dom('div', { class: "mt-2" },
                dom('label', { class: "text-xs text-neutral-500 uppercase font-bold flex justify-between items-center" },
                    `Pattern Editor (${s}x${s})`,
                    dom('div', { class: "flex items-center gap-1" },
                        dom('input', {
                            type: 'checkbox', checked: b.aligned,
                            onChange: (e) => this.updateProp('aligned', e.target.checked)
                        }),
                        dom('span', { class: "text-[9px]" }, "Force Align")
                    )
                ),
                grid
            );
        }

        const content = dom('div', { class: "bg-neutral-800 w-full max-w-xs rounded-xl shadow-2xl border border-neutral-700 overflow-hidden flex flex-col" },

            // Header
            dom('div', { class: "flex justify-between items-center p-4 bg-neutral-900 border-b border-neutral-700" },
                dom('h3', { class: "font-bold text-sky-500" }, DomBuilder.icon('paint-brush', 'mr-2'), "Brush Designer"),
                dom('button', { class: "text-neutral-400 hover:text-white", onClick: () => this.closeModal() }, DomBuilder.icon('times'))
            ),

            // Body
            dom('div', { class: "p-5 flex flex-col gap-4 max-h-[60vh] overflow-y-auto" },

                // Name
                dom('div', {},
                    dom('label', { class: "text-xs text-neutral-500 uppercase font-bold" }, "Name"),
                    dom('input', {
                        type: 'text', value: b.name,
                        class: "w-full bg-neutral-700 text-white text-sm rounded px-2 py-1 mt-1 border-none outline-none focus:ring-1 focus:ring-sky-500",
                        onInput: (e) => this.updateProp('name', e.target.value)
                    })
                ),

                // Size
                dom('div', {},
                    dom('div', { class: "flex justify-between text-xs text-neutral-400 mb-1" },
                        dom('span', { class: "uppercase font-bold" }, "Size"),
                        dom('span', {}, `${b.size}px`)
                    ),
                    dom('input', {
                        type: 'range', min: 1, max: 8, step: 1, value: b.size,
                        class: "w-full",
                        onInput: (e) => this.updateProp('size', parseInt(e.target.value))
                    })
                ),

                // Shape
                dom('div', {},
                    dom('label', { class: "text-xs text-neutral-500 uppercase font-bold" }, "Shape"),
                    makeSelect('shape', [
                        { val: 'square', label: 'Square' }, { val: 'circle', label: 'Circle' }, { val: 'custom', label: 'Custom' }
                    ])
                ),

                gridEditor, // Optional Grid

                // Mode
                dom('div', {},
                    dom('label', { class: "text-xs text-neutral-500 uppercase font-bold" }, "Mode"),
                    makeSelect('mode', [
                        { val: 'normal', label: 'Normal' }, { val: 'dither', label: 'Dither' },
                        { val: 'shade-up', label: 'Shade (Palette +)' }, { val: 'shade-down', label: 'Shade (Palette -)' }
                    ])
                ),

                // Pattern (Conditional)
                b.mode === 'dither' ? dom('div', {},
                    dom('label', { class: "text-xs text-neutral-500 uppercase font-bold" }, "Pattern"),
                    makeSelect('pattern', [
                        { val: 'checker', label: 'Checker' }, { val: 'lines-v', label: 'Lines (V)' }, { val: 'lines-h', label: 'Lines (H)' }
                    ])
                ) : null,

                // Save Button
                dom('button', {
                    class: "bg-sky-600 hover:bg-sky-500 text-white py-2 rounded font-bold text-sm mt-2",
                    onClick: () => this.saveBrush()
                }, "Save Brush")
            )
        );

        this.modal.appendChild(content);
    }
}