import DomBuilder from '../utils/DomBuilder.js';
const dom = DomBuilder.create;

export default class LayerUI {
    init(app) {
        this.app = app;
        this.list = document.getElementById('layers-list');
        this.draggedIndex = null;

        const addBtn = document.getElementById('add-layer-btn');
        if (addBtn) addBtn.onclick = () => app.bus.emit('cmd:addLayer');

        // Subscribe to State Changes
        app.bus.on('stateChanged', (evt) => {
            if (evt.key === 'projects' || evt.key === 'activeProjectId') {
                this.render();
            }
        });

        app.bus.on('cmd_AddLayer', () => this.render());

        this.render();
    }

    render() {
        this.list.innerHTML = '';
        const project = this.app.store.activeProject;
        if (!project) return;

        const frame = project.frames[project.currentFrameIndex];
        const activeId = project.activeLayerId;
        const totalLayers = frame.layers.length;

        // Iterate in reverse so "Top" layer is visually at the top
        [...frame.layers].reverse().forEach((layer, displayIndex) => {
            const realIndex = totalLayers - 1 - displayIndex;
            const isActive = layer.id === activeId;

            // --- Drag & Drop Logic ---
            const onDragStart = (e) => {
                this.draggedIndex = realIndex;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', realIndex.toString());
                e.target.style.opacity = '0.5';
            };

            const onDragEnd = (e) => {
                e.target.style.opacity = '1';
                this.draggedIndex = null;
            };

            const onDragOver = (e) => {
                e.preventDefault();
                if (this.draggedIndex === realIndex) return;
                e.dataTransfer.dropEffect = 'move';
                const isMovingDown = this.draggedIndex > realIndex;
                const borderClass = isMovingDown ? 'border-b-2' : 'border-t-2';
                const oldClass = e.currentTarget.dataset.borderClass;
                if (oldClass && oldClass !== borderClass) e.currentTarget.classList.remove(oldClass);
                e.currentTarget.classList.add(borderClass, 'border-sky-500');
                e.currentTarget.dataset.borderClass = borderClass;
            };

            const onDragLeave = (e) => {
                const cls = e.currentTarget.dataset.borderClass;
                if (cls) e.currentTarget.classList.remove(cls, 'border-sky-500');
            };

            const onDrop = (e) => {
                e.preventDefault();
                const cls = e.currentTarget.dataset.borderClass;
                if (cls) e.currentTarget.classList.remove(cls, 'border-sky-500');
                const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
                if (!isNaN(fromIndex) && fromIndex !== realIndex) {
                    this.app.bus.emit('cmd:reorderLayers', { from: fromIndex, to: realIndex });
                }
            };

            // --- Rename Logic ---
            const startRenaming = (container) => {
                const input = dom('input', {
                    type: 'text', value: layer.name,
                    class: 'bg-neutral-900 text-white text-xs p-1 rounded border border-sky-500 outline-none w-full select-text',
                    onClick: (e) => e.stopPropagation(),
                    onDblClick: (e) => e.stopPropagation()
                });
                const save = () => {
                    if (input.value && input.value.trim() !== "" && input.value !== layer.name) {
                        this.app.bus.emit('cmd:renameLayer', { id: layer.id, name: input.value });
                    } else {
                        this.render();
                    }
                };
                input.onblur = save;
                input.onkeydown = (e) => { if (e.key === 'Enter') save(); };
                container.innerHTML = '';
                container.appendChild(input);
                input.focus();
                input.select();
            };

            // --- UI Elements ---
            const nameSpan = dom('span', {
                class: `truncate ${!layer.visible ? 'text-neutral-500 line-through' : 'text-gray-200'}`,
            }, layer.name);

            const nameContainer = dom('div', {
                class: "flex-1 flex items-center overflow-hidden pl-1 mr-2",
                title: "Double-click to rename",
                onDblClick: (e) => {
                    e.stopPropagation();
                    startRenaming(nameContainer);
                }
            }, nameSpan);

            const visBtn = dom('button', {
                class: `w-6 h-6 flex items-center justify-center hover:bg-neutral-700 rounded text-xs ${layer.visible ? 'text-neutral-400' : 'text-neutral-600'}`,
                title: 'Toggle Visibility',
                onClick: (e) => {
                    e.stopPropagation();
                    this.app.bus.emit('cmd:toggleLayer', layer.id);
                }
            }, DomBuilder.icon(layer.visible ? 'eye' : 'eye-slash'));

            const lockBtn = dom('button', {
                class: `w-6 h-6 flex items-center justify-center hover:bg-neutral-700 rounded text-xs ${layer.locked ? 'text-amber-500' : 'text-neutral-600 hover:text-neutral-400'}`,
                title: 'Toggle Lock',
                onClick: (e) => {
                    e.stopPropagation();
                    this.app.bus.emit('cmd:toggleLock', layer.id);
                }
            }, DomBuilder.icon(layer.locked ? 'lock' : 'lock-open'));

            // --- Row Assembly ---
            const row = dom('div', {
                draggable: 'true',
                class: `group p-1 rounded flex items-center justify-between text-sm mb-1 border border-transparent transition select-none cursor-pointer ${isActive ? 'bg-sky-900/40 border-sky-600/50' : 'hover:bg-neutral-800'}`,
                ondragstart: onDragStart,
                ondragend: onDragEnd,
                ondragover: onDragOver,
                ondragleave: onDragLeave,
                ondrop: onDrop,
                onClick: () => {
                    // REFACTOR: Use command instead of direct mutation
                    this.app.bus.emit('cmd:selectLayer', layer.id);
                }
            },
                nameContainer,
                dom('div', { class: 'flex gap-1 shrink-0' }, visBtn, lockBtn)
            );

            this.list.appendChild(row);
        });
    }
}