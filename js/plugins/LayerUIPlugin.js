import DomBuilder from '../utils/DomBuilder.js';
const dom = DomBuilder.create;

export default class LayerUIPlugin {
    init(app) {
        this.app = app;
        this.list = document.getElementById('layers-list');
        this.draggedItemIndex = null;

        const addBtn = document.getElementById('add-layer-btn');
        const addLocalBtn = document.getElementById('add-local-layer-btn');
        if (addBtn) addBtn.onclick = () => app.bus.emit('addLayer', { global: true });
        if (addLocalBtn) addLocalBtn.onclick = () => app.bus.emit('addLayer', { global: false });

        app.bus.on('dataChanged', (state) => this.renderUI(state));
    }

    renderUI(state) {
        this.list.innerHTML = '';
        if (!state || !state.frames) return;
        const frame = state.frames[state.currentFrame];
        if (!frame) return;

        const reversedLayers = [...frame.layers].reverse();

        reversedLayers.forEach((layer, visualIndex) => {
            const isActive = layer.id === state.activeLayerId;
            const dataIndex = (frame.layers.length - 1) - visualIndex;

            const baseClass = "group p-2 rounded flex items-center justify-between text-sm mb-1 border transition select-none cursor-grab active:cursor-grabbing";
            const activeClass = "bg-sky-900/50 border-sky-600";
            const inactiveClass = "bg-neutral-800 hover:bg-neutral-700 border-transparent";

            const row = dom('div', {
                class: `${baseClass} ${isActive ? activeClass : inactiveClass}`,
                draggable: true,

                ondragstart: (e) => {
                    this.draggedItemIndex = dataIndex;
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', dataIndex.toString());
                    requestAnimationFrame(() => row.classList.add('opacity-50'));
                },
                ondragend: (e) => {
                    row.classList.remove('opacity-50');
                    this.draggedItemIndex = null;
                    Array.from(this.list.children).forEach(el => el.classList.remove('border-sky-400', 'border-t-2', 'border-b-2'));
                },
                ondragover: (e) => {
                    e.preventDefault();
                    if (this.draggedItemIndex === null || this.draggedItemIndex === dataIndex) return;
                    e.dataTransfer.dropEffect = 'move';
                    row.classList.add('border-sky-400'); // Feedback
                },
                ondragleave: () => { row.classList.remove('border-sky-400'); },
                ondrop: (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    row.classList.remove('border-sky-400');
                    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
                    if (!isNaN(fromIndex) && fromIndex !== dataIndex) {
                        this.app.bus.emit('cmd_ReorderLayers', { fromIndex: fromIndex, toIndex: dataIndex });
                    }
                },
                onClick: () => this.app.bus.emit('selectLayer', layer.id)
            },
                dom('div', { class: "flex items-center gap-2 flex-1 overflow-hidden pointer-events-none" },
                    DomBuilder.icon(layer.locked ? 'lock text-amber-500' : `layer-group ${isActive ? 'text-sky-400' : 'text-neutral-500'}`),
                    dom('span', { class: `truncate ${!layer.visible ? 'text-neutral-500 line-through' : ''} ${layer.locked ? 'text-amber-500' : ''}` }, layer.name + (layer.isGlobal === false ? ' (L)' : ''))
                ),
                dom('div', { class: "flex items-center gap-1 opacity-100 transition-opacity" },
                    this.createActionBtn(layer.locked ? 'lock' : 'lock-open', layer.locked ? 'text-amber-500' : 'text-neutral-500', () => this.app.bus.emit('toggleLock', layer.id)),
                    this.createActionBtn(layer.visible ? 'eye' : 'eye-slash', layer.visible ? 'text-neutral-400' : 'text-neutral-500', () => this.app.bus.emit('toggleLayer', layer.id)),
                    this.createActionBtn('times', 'hover:text-rose-400 text-neutral-500', () => this.app.bus.emit('deleteLayer', layer.id))
                )
            );
            this.list.appendChild(row);
        });
    }

    createActionBtn(icon, colorClass, action) {
        return dom('button', {
            class: `px-1 hover:text-white ${colorClass} cursor-pointer`,
            draggable: true, // Hack to prevent drag start
            ondragstart: (e) => { e.preventDefault(); e.stopPropagation(); },
            onClick: (e) => { e.stopPropagation(); action(); }
        }, DomBuilder.icon(icon, 'text-xs'));
    }
}