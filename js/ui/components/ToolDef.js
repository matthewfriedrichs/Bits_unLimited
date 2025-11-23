import DomBuilder from '../../utils/DomBuilder.js';
import BrushGenerator from '../../utils/BrushGenerator.js';
const dom = DomBuilder.create;

export class ToolIcon {
    constructor({ icon, overlayIcon, label, color, hexColor, hotkey }) {
        this.icon = icon;
        this.overlayIcon = overlayIcon;
        this.label = label;
        this.color = color;
        this.hexColor = hexColor;
        this.hotkey = hotkey || '';
    }
}

export class ToolSidebar {
    constructor() {
        this.elements = [];
        this.libraryRenderer = null;
    }

    // --- Builder Methods ---

    addHeader(text) { this.elements.push({ type: 'header', text }); return this; }
    addSlider(opts) { this.elements.push({ type: 'range', ...opts }); return this; }
    addSelect(opts) { this.elements.push({ type: 'select', ...opts }); return this; }
    addToggle(opts) { this.elements.push({ type: 'toggle', ...opts }); return this; }
    addBrushPicker(opts) { this.elements.push({ type: 'brush-picker', ...opts }); return this; }
    addButton(opts) { this.elements.push({ type: 'button', ...opts }); return this; }
    addCustom(rendererFn) { this.elements.push({ type: 'custom', renderer: rendererFn }); return this; }
    setToolLibrary(rendererFn) { this.libraryRenderer = rendererFn; return this; }

    /**
     * Adds a text or number input.
     * @param {Object} opts - { id, label, type: 'text'|'number', value, placeholder }
     */
    addInput({ id, label, type = 'text', value, placeholder }) {
        this.elements.push({ type: 'input', inputType: type, id, label, value, placeholder });
        return this;
    }

    /**
     * Adds a color picker input.
     * @param {Object} opts - { id, label, value }
     */
    addColor({ id, label, value }) {
        this.elements.push({ type: 'color', id, label, value });
        return this;
    }

    // --- Rendering Engine ---

    render(toolId, app) {
        const container = dom('div', { class: "flex-1 p-2 overflow-y-auto scrollbar-hide flex flex-col gap-1" });

        this.elements.forEach(el => {
            const wrapper = dom('div', { class: "py-1" });

            if (el.type === 'custom') {
                wrapper.id = `tool-custom-${toolId}-${el.id || 'preview'}`;
                wrapper.appendChild(el.renderer());
            } else if (el.type === 'header') {
                wrapper.appendChild(dom('h4', { class: "text-[10px] uppercase text-sky-500 font-bold mb-1 border-b border-neutral-700 pb-1 mt-1" }, el.text));
            }
            // ... (Previous types)
            else if (el.type === 'range') wrapper.appendChild(this._buildRange(toolId, el, app));
            else if (el.type === 'select') wrapper.appendChild(this._buildSelect(toolId, el, app));
            else if (el.type === 'toggle') wrapper.appendChild(this._buildToggle(toolId, el, app));
            else if (el.type === 'brush-picker') wrapper.appendChild(this._buildBrushPicker(toolId, el, app));
            else if (el.type === 'button') {
                wrapper.appendChild(dom('button', {
                    class: "w-full bg-neutral-700 hover:bg-neutral-600 text-white text-xs py-1.5 rounded flex items-center justify-center gap-2",
                    onClick: el.action
                }, el.icon ? DomBuilder.icon(el.icon) : null, el.label));
            }
            // ... (New types)
            else if (el.type === 'input') wrapper.appendChild(this._buildInput(toolId, el, app));
            else if (el.type === 'color') wrapper.appendChild(this._buildColor(toolId, el, app));

            container.appendChild(wrapper);
        });

        return container;
    }

    update(domContainer, toolId, app) {
        if (!domContainer) return;

        this.elements.forEach(el => {
            if (el.type === 'custom') {
                const wrapper = domContainer.querySelector(`#tool-custom-${toolId}-${el.id || 'preview'}`);
                if (wrapper) { wrapper.innerHTML = ''; wrapper.appendChild(el.renderer()); }
                return;
            }

            const inputId = `tool-opt-${toolId}-${el.id}`;
            const inputEl = domContainer.querySelector(`#${inputId}`);

            // Don't interrupt active editing
            if (inputEl && document.activeElement !== inputEl) {
                if (el.type === 'range' || el.type === 'select' || el.type === 'input' || el.type === 'color') {
                    inputEl.value = el.value;
                    // Range label update
                    if (el.type === 'range' && inputEl.previousSibling) {
                        const display = inputEl.previousSibling.lastChild;
                        if (display) display.innerText = `${el.value}${el.unit || ''}`;
                    }
                }
                // ... (Toggle/Brush Picker updates same as before)
            }
        });
    }

    // --- Internal Widget Factories ---

    _buildRange(toolId, el, app) {
        const inputId = `tool-opt-${toolId}-${el.id}`;
        const valueDisplay = dom('span', { class: "text-xs" }, `${el.value}${el.unit || ''}`);
        return dom('div', {},
            dom('div', { class: "flex justify-between text-[10px] text-neutral-400 font-bold uppercase mb-1" }, dom('span', {}, el.label), valueDisplay),
            dom('input', {
                id: inputId, type: 'range', min: el.min, max: el.max, step: el.step || 1, value: el.value,
                class: "w-full h-2 bg-neutral-600 rounded-lg appearance-none cursor-pointer",
                onInput: (e) => {
                    const val = parseFloat(e.target.value);
                    valueDisplay.innerText = `${val}${el.unit || ''}`;
                    app.bus.emit('cmd:setToolSetting', { toolId, setting: el.id, value: val });
                }
            })
        );
    }

    _buildSelect(toolId, el, app) {
        const inputId = `tool-opt-${toolId}-${el.id}`;
        return dom('div', {},
            dom('label', { class: "text-[10px] text-neutral-400 font-bold uppercase block mb-1" }, el.label),
            dom('select', {
                id: inputId,
                class: "w-full bg-neutral-700 text-white text-xs rounded px-2 py-1 border-none outline-none cursor-pointer",
                onChange: (e) => app.bus.emit('cmd:setToolSetting', { toolId, setting: el.id, value: e.target.value })
            }, ...el.options.map(opt => dom('option', { value: opt.id, selected: opt.id === el.value }, opt.label)))
        );
    }

    _buildToggle(toolId, el, app) {
        const inputId = `tool-opt-${toolId}-${el.id}`;
        return dom('div', {
            id: inputId,
            class: "flex items-center justify-between bg-neutral-700 p-1.5 rounded cursor-pointer hover:bg-neutral-600 transition",
            onClick: () => app.bus.emit('cmd:setToolSetting', { toolId, setting: el.id, value: !el.value })
        },
            dom('span', { class: "text-xs ml-1 font-bold text-gray-300" }, el.label),
            dom('div', { class: `w-8 h-4 rounded-full relative transition toggle-track ${el.value ? 'bg-sky-500' : 'bg-neutral-500'}` },
                dom('div', { class: `absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition transform toggle-thumb ${el.value ? 'translate-x-4' : 'translate-x-0.5'}` })
            )
        );
    }

    _buildBrushPicker(toolId, el, app) {
        const inputId = `tool-opt-${toolId}-${el.id}`;
        const list = dom('div', { id: inputId, class: "grid grid-cols-4 gap-1 max-h-32 overflow-y-auto p-1 bg-neutral-900 rounded border border-neutral-700 scrollbar-hide" });
        const customShapes = app.store.get('customShapes') || [];
        el.options.forEach(opt => {
            const isSelected = opt.id === el.value;
            const canvas = dom('canvas', { width: 24, height: 24, class: "w-full h-full" });
            const ctx = canvas.getContext('2d');
            const fp = BrushGenerator.generate(opt.id, 14, customShapes);
            ctx.fillStyle = isSelected ? '#0ea5e9' : '#999';
            const cx = 12, cy = 12;
            fp.forEach(pt => ctx.fillRect(cx + pt.x, cy + pt.y, 1, 1));
            const btn = dom('button', {
                title: opt.label,
                class: `w-8 h-8 rounded flex items-center justify-center hover:bg-neutral-700 transition border ${isSelected ? 'border-sky-500 bg-neutral-800' : 'border-transparent'}`,
                onClick: () => { app.bus.emit('cmd:setToolSetting', { toolId, setting: el.id, value: opt.id }); }
            }, canvas);
            list.appendChild(btn);
        });
        return dom('div', {}, dom('label', { class: "text-[10px] text-neutral-400 font-bold uppercase block mb-1" }, el.label), list);
    }

    // --- NEW: Input Builders ---

    _buildInput(toolId, el, app) {
        const inputId = `tool-opt-${toolId}-${el.id}`;
        return dom('div', {},
            dom('label', { class: "text-[10px] text-neutral-400 font-bold uppercase block mb-1" }, el.label),
            dom('input', {
                id: inputId,
                type: el.inputType || 'text',
                value: el.value || '',
                placeholder: el.placeholder || '',
                class: "w-full bg-neutral-900 text-white text-xs rounded px-2 py-1 border border-neutral-700 focus:border-sky-500 outline-none transition",
                onInput: (e) => {
                    const val = el.inputType === 'number' ? parseFloat(e.target.value) : e.target.value;
                    app.bus.emit('cmd:setToolSetting', { toolId, setting: el.id, value: val });
                }
            })
        );
    }

    _buildColor(toolId, el, app) {
        const inputId = `tool-opt-${toolId}-${el.id}`;
        return dom('div', { class: "flex justify-between items-center" },
            dom('label', { class: "text-[10px] text-neutral-400 font-bold uppercase" }, el.label),
            dom('div', { class: "flex items-center gap-2" },
                dom('span', { class: "text-xs font-mono text-gray-500" }, el.value),
                dom('input', {
                    id: inputId,
                    type: 'color',
                    value: el.value || '#000000',
                    class: "w-6 h-6 bg-transparent border-none cursor-pointer",
                    onInput: (e) => app.bus.emit('cmd:setToolSetting', { toolId, setting: el.id, value: e.target.value })
                })
            )
        );
    }
}