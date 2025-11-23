import DomBuilder from '../utils/DomBuilder.js';
import BrushGenerator from '../utils/BrushGenerator.js';
const dom = DomBuilder.create;

export default class ToolbarUI {
    init(app) {
        this.app = app;
        this.bus = app.bus;
        this.store = app.store;
        this.toolService = app.services.get('tools');

        this.hoverTimer = null;
        this.optionsPanel = null;
        this.activeSidebarToolId = null;
        this.draggedIndex = null;

        // Ensure default order
        if (!this.store.get('toolOrder')) {
            this.store.set('toolOrder', ['palette', 'select', 'pen', 'eraser', 'bucket', 'eyedropper', 'frame'], true);
        }

        this.render();

        // --- Listeners ---
        this.bus.on('state:toolOrder', () => this.render());
        this.bus.on('state:primaryTool', () => this.updateUI());
        this.bus.on('state:secondaryTool', () => this.updateUI());

        // Reactive Updates
        this.bus.on('state:activeBrush', () => this.handleToolUpdate('pen'));
        this.bus.on('state:eraserBrush', () => this.handleToolUpdate('eraser'));
        this.bus.on('cmd:setToolSetting', ({ toolId }) => this.handleToolUpdate(toolId));

        // Color update -> Refresh Palette Icon
        this.bus.on('state:primaryColor', () => this.handleToolUpdate('palette'));

        // Listen for extension updates (e.g. Palette added color)
        this.bus.on('tool:extensionUpdate', (toolId) => this.renderStack());

        document.addEventListener('mousedown', (e) => {
            if (this.optionsPanel && !this.optionsPanel.contains(e.target)) {
                this.hideOptionsPanel();
            }
        });
    }

    handleToolUpdate(toolId) {
        // Update Icons (Overlays)
        this.renderStack();

        // Update Sidebar if open
        if (this.optionsPanel && this.activeSidebarToolId === toolId) {
            this.refreshOptionsPanel(toolId);
        }
    }

    refreshOptionsPanel(toolId) {
        const tool = this.toolService.tools[toolId];
        if (!tool || !tool.sidebarDef) return;

        // Use the internal update method on ToolSidebar
        tool.sidebarDef.update(this.optionsPanel, toolId, this.app);
    }

    // --- Rendering (Icons & Drag-Drop) ---

    render() {
        const sidebar = document.getElementById('left-sidebar');
        let indicator = document.getElementById('active-tool-indicator');

        if (!indicator) {
            indicator = dom('div', {
                id: 'active-tool-indicator',
                class: 'w-12 h-12 mb-4 relative shrink-0 cursor-pointer',
                onMouseEnter: () => this.startSlotHoverTimer(indicator),
                onMouseLeave: () => this.cancelHoverTimer()
            });
            if (sidebar.firstChild) sidebar.insertBefore(indicator, sidebar.firstChild);
            else sidebar.appendChild(indicator);
        }
        this.indicatorEl = indicator;

        let container = document.getElementById('tool-group');
        if (!container) {
            container = dom('div', { id: 'tool-group', class: 'flex flex-col gap-2 mb-4 relative z-20' });
            sidebar.appendChild(container);
        }
        this.containerEl = container;

        this.renderStack();
    }

    renderStack() {
        if (!this.containerEl) return;
        this.containerEl.innerHTML = '';

        const order = this.store.get('toolOrder');
        const tools = this.toolService.tools;

        order.forEach((toolId, index) => {
            const tool = tools[toolId];
            if (!tool) return;

            const def = tool.iconDef;

            // 1. The Wrapper is the Draggable Unit
            const wrapper = dom('div', {
                class: 'flex flex-col items-center w-full relative group transition-all duration-200',
                draggable: 'true',

                // Drag Events
                ondragstart: (e) => {
                    this.draggedIndex = index;
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', index.toString());
                    e.currentTarget.style.opacity = '0.5';
                    this.hideOptionsPanel();
                },
                ondragend: (e) => {
                    e.currentTarget.style.opacity = '1';
                    this.draggedIndex = null;
                    Array.from(this.containerEl.children).forEach(child => {
                        child.classList.remove('border-t-2', 'border-b-2', 'border-sky-500');
                    });
                },
                ondragover: (e) => {
                    e.preventDefault();
                    if (this.draggedIndex === index) return;
                    e.dataTransfer.dropEffect = 'move';

                    const rect = e.currentTarget.getBoundingClientRect();
                    const midY = rect.top + rect.height / 2;
                    const isTop = e.clientY < midY;

                    e.currentTarget.classList.remove('border-t-2', 'border-b-2', 'border-sky-500');
                    if (isTop) e.currentTarget.classList.add('border-t-2', 'border-sky-500');
                    else e.currentTarget.classList.add('border-b-2', 'border-sky-500');
                },
                ondragleave: (e) => {
                    e.currentTarget.classList.remove('border-t-2', 'border-b-2', 'border-sky-500');
                },
                ondrop: (e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove('border-t-2', 'border-b-2', 'border-sky-500');

                    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
                    let toIndex = index;

                    if (fromIndex === toIndex) return;

                    const rect = e.currentTarget.getBoundingClientRect();
                    const midY = rect.top + rect.height / 2;
                    const insertAfter = e.clientY > midY;

                    const newOrder = [...this.store.get('toolOrder')];
                    const item = newOrder.splice(fromIndex, 1)[0];

                    if (fromIndex < toIndex) toIndex--;

                    if (insertAfter) newOrder.splice(toIndex + 1, 0, item);
                    else newOrder.splice(toIndex, 0, item);

                    this.store.set('toolOrder', newOrder);
                }
            });

            // 2. Tool Button
            const btn = dom('button', {
                id: `tool-btn-${toolId}`,
                title: `${def.label} ${def.hotkey ? `(${def.hotkey})` : ''}`,
                class: `w-10 h-10 rounded bg-neutral-700 hover:bg-neutral-600 flex items-center justify-center transition tool-btn relative overflow-visible cursor-pointer mb-1`,

                onClick: () => this.bus.emit('cmd:selectTool', { id: toolId, isSecondary: false }),
                onContextMenu: (e) => {
                    e.preventDefault();
                    this.bus.emit('cmd:selectTool', { id: toolId, isSecondary: true });
                },
                onDblClick: () => {
                    if (tool.onDoubleClick) tool.onDoubleClick();
                },

                onMouseEnter: () => this.startHoverTimer(toolId, btn),
                onMouseLeave: () => this.cancelHoverTimer(),
                onTouchStart: () => this.startHoverTimer(toolId, btn),
                onTouchEnd: () => this.cancelHoverTimer()
            }, DomBuilder.icon(def.icon, def.hexColor ? '' : def.color));

            // Apply dynamic hex color
            if (def.hexColor) {
                btn.firstChild.style.color = def.hexColor;
                btn.firstChild.style.textShadow = `0 0 8px ${def.hexColor}60`;
            }

            // Apply Overlay Icon (e.g. Pixel Perfect Pen)
            if (def.overlayIcon) {
                const badge = dom('div', {
                    class: 'absolute -top-1 -right-1 text-[10px] bg-neutral-900 rounded-full w-4 h-4 flex items-center justify-center border border-neutral-600 shadow-sm z-10 pointer-events-none'
                }, DomBuilder.icon(def.overlayIcon, def.color));
                btn.appendChild(badge);
            }

            wrapper.appendChild(btn);

            // 3. Toolbar Extension (e.g. Color Strip)
            const extension = tool.renderToolbarExtension ? tool.renderToolbarExtension() : null;
            if (extension) wrapper.appendChild(extension);

            this.containerEl.appendChild(wrapper);
        });

        this.updateUI();
    }

    // --- Options Panel ---

    showOptionsPanel(toolId, btnElement) {
        this.hideOptionsPanel();
        this.activeSidebarToolId = toolId;

        const tool = this.toolService.tools[toolId];
        if (!tool) return;

        const sidebarDef = tool.sidebarDef;
        if (!sidebarDef || sidebarDef.elements.length === 0) return;

        const rect = btnElement.getBoundingClientRect();
        const hasLibrary = !!sidebarDef.libraryRenderer;

        // Container
        this.optionsPanel = dom('div', {
            class: "fixed bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl flex flex-col z-[100] animate-fade-in-right overflow-hidden",
            style: {
                left: `${rect.right + 10}px`,
                top: `${rect.top}px`,
                width: hasLibrary ? '420px' : '240px',
                height: hasLibrary ? '350px' : 'auto'
            }
        },
            dom('div', { class: "text-[10px] font-bold text-neutral-500 uppercase tracking-wider px-3 py-2 border-b border-neutral-700 flex-shrink-0" }, `${tool.iconDef.label} Options`)
        );

        // Content Area
        const contentArea = dom('div', { class: "flex flex-1 overflow-hidden" });
        this.optionsPanel.appendChild(contentArea);

        // Delegate Rendering to ToolSidebar
        const settingsEl = sidebarDef.render(toolId, this.app);
        contentArea.appendChild(settingsEl);

        // Render Library Column (Right Side)
        if (hasLibrary) {
            const libraryEl = sidebarDef.libraryRenderer();
            contentArea.appendChild(libraryEl);
        }

        this.autoCloseHandler = (e) => {
            if (!this.optionsPanel) return;
            const r = this.optionsPanel.getBoundingClientRect();
            const x = e.clientX, y = e.clientY;
            const distRight = (x > r.right) ? x - r.right : 0;
            const distVert = (y < r.top) ? r.top - y : (y > r.bottom) ? y - r.bottom : 0;
            if (distRight > 40 || distVert > 40) this.hideOptionsPanel();
        };
        document.addEventListener('mousemove', this.autoCloseHandler);

        document.body.appendChild(this.optionsPanel);
    }

    hideOptionsPanel() {
        if (this.optionsPanel) {
            if (this.autoCloseHandler) document.removeEventListener('mousemove', this.autoCloseHandler);
            this.optionsPanel.remove();
            this.optionsPanel = null;
            this.activeSidebarToolId = null;
        }
    }

    // --- Helpers & State ---

    startHoverTimer(toolId, btn) {
        this.cancelHoverTimer();
        this.hoverTimer = setTimeout(() => { this.showOptionsPanel(toolId, btn); }, 0);
    }

    startSlotHoverTimer(element) {
        this.cancelHoverTimer();
        this.hoverTimer = setTimeout(() => { this.showQuickSlotsPanel(element); }, 0);
    }

    cancelHoverTimer() {
        if (this.hoverTimer) { clearTimeout(this.hoverTimer); this.hoverTimer = null; }
    }

    updateUI() {
        const pId = this.store.get('primaryTool');
        const sId = this.store.get('secondaryTool');
        this.renderSplitIcon(pId, sId);
        this.updateListHighlights(pId, sId);
    }

    updateListHighlights(pId, sId) {
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.classList.remove('ring-2', 'ring-4', 'ring-sky-500', 'ring-amber-500', 'ring-offset-1', 'ring-offset-neutral-800', 'bg-neutral-600');
            btn.classList.add('bg-neutral-700');

            const toolId = btn.id.replace('tool-btn-', '');
            const isP = toolId === pId;
            const isS = toolId === sId;

            if (isP && isS) {
                btn.classList.remove('bg-neutral-700');
                btn.classList.add('bg-neutral-600', 'ring-4', 'ring-sky-500/50');
            } else if (isP) {
                btn.classList.remove('bg-neutral-700');
                btn.classList.add('bg-neutral-600', 'ring-2', 'ring-sky-500', 'ring-offset-1', 'ring-offset-neutral-800');
            } else if (isS) {
                btn.classList.remove('bg-neutral-700');
                btn.classList.add('bg-neutral-600', 'ring-2', 'ring-amber-500', 'ring-offset-1', 'ring-offset-neutral-800');
            }
        });
    }

    renderSplitIcon(pId, sId) {
        this.indicatorEl.innerHTML = '';
        const tools = this.toolService.tools;
        const pTool = tools[pId] ? tools[pId].iconDef : { icon: 'question', color: 'text-gray-500' };
        const sTool = tools[sId] ? tools[sId].iconDef : { icon: 'question', color: 'text-gray-500' };

        const commonClass = "absolute inset-0 flex items-center justify-center text-xl rounded-lg border border-neutral-600 bg-neutral-800 shadow-lg overflow-hidden";

        if (pId === sId) {
            const el = dom('div', { class: commonClass }, DomBuilder.icon(pTool.icon, pTool.hexColor ? '' : pTool.color));
            if (pTool.hexColor) el.firstChild.style.color = pTool.hexColor;
            this.indicatorEl.appendChild(el);
        } else {
            const pEl = dom('div', { class: commonClass + " z-10 bg-neutral-800", style: { clipPath: 'polygon(0 0, 100% 0, 0 100%)' } }, dom('div', { class: '-translate-x-1 -translate-y-1' }, DomBuilder.icon(pTool.icon, pTool.hexColor ? '' : pTool.color)));
            if (pTool.hexColor) pEl.querySelector('i').style.color = pTool.hexColor;

            const sEl = dom('div', { class: commonClass + " z-0 bg-neutral-700", style: { clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' } }, dom('div', { class: 'translate-x-1 translate-y-1' }, DomBuilder.icon(sTool.icon, sTool.hexColor ? '' : sTool.color)));
            if (sTool.hexColor) sEl.querySelector('i').style.color = sTool.hexColor;

            const border = dom('div', { class: "absolute inset-0 pointer-events-none z-20 border-white/10", style: { background: 'linear-gradient(135deg, transparent 49.5%, #404040 49.5%, #404040 50.5%, transparent 50.5%)' } });
            this.indicatorEl.appendChild(sEl); this.indicatorEl.appendChild(pEl); this.indicatorEl.appendChild(border);
        }

        const labels = dom('div', { class: "absolute -bottom-2 w-full flex justify-between text-[8px] font-bold px-1 text-neutral-500 uppercase pointer-events-none z-30" }, dom('span', {}, 'L'), dom('span', {}, 'R'));
        this.indicatorEl.appendChild(labels);
    }

    renderMiniSplitIcon(container, pId, sId) {
        const tools = this.toolService.tools;
        const pTool = tools[pId] ? tools[pId].iconDef : { icon: 'question', color: 'text-gray-500' };
        const sTool = tools[sId] ? tools[sId].iconDef : { icon: 'question', color: 'text-gray-500' };

        if (pId === sId) {
            const el = dom('div', { class: "absolute inset-0 flex items-center justify-center text-xs" }, DomBuilder.icon(pTool.icon, pTool.hexColor ? '' : pTool.color));
            if (pTool.hexColor) el.firstChild.style.color = pTool.hexColor;
            container.appendChild(el);
        } else {
            const pEl = dom('div', { class: "absolute inset-0 z-10 bg-neutral-800 flex items-center justify-center text-xs", style: { clipPath: 'polygon(0 0, 100% 0, 0 100%)' } }, dom('div', { class: '-translate-x-1 -translate-y-1' }, DomBuilder.icon(pTool.icon, pTool.hexColor ? '' : pTool.color)));
            if (pTool.hexColor) pEl.querySelector('i').style.color = pTool.hexColor;

            const sEl = dom('div', { class: "absolute inset-0 z-0 bg-neutral-700 flex items-center justify-center text-xs", style: { clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' } }, dom('div', { class: 'translate-x-1 translate-y-1' }, DomBuilder.icon(sTool.icon, sTool.hexColor ? '' : sTool.color)));
            if (sTool.hexColor) sEl.querySelector('i').style.color = sTool.hexColor;

            container.appendChild(sEl); container.appendChild(pEl);
        }
    }

    showQuickSlotsPanel(anchorEl) {
        this.hideOptionsPanel();
        const rect = anchorEl.getBoundingClientRect();
        const slots = this.store.get('quickSlots');

        this.optionsPanel = dom('div', {
            class: "fixed bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl p-2 flex flex-col gap-2 z-[100] animate-fade-in-right",
            style: { left: `${rect.right + 10}px`, top: `${rect.top}px`, width: '180px' }
        },
            dom('div', { class: "text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1 px-2 border-b border-neutral-700 pb-1 flex justify-between" },
                dom('span', {}, "Quick Slots"),
                dom('span', { class: "text-[9px] opacity-50" }, "Right-click to Save")
            )
        );

        this.autoCloseHandler = (e) => {
            if (!this.optionsPanel) return;
            const r = this.optionsPanel.getBoundingClientRect();
            const x = e.clientX, y = e.clientY;
            const distRight = (x > r.right) ? x - r.right : 0;
            const distVert = (y < r.top) ? r.top - y : (y > r.bottom) ? y - r.bottom : 0;
            if (distRight > 20 || distVert > 20) this.hideOptionsPanel();
        };
        document.addEventListener('mousemove', this.autoCloseHandler);

        const grid = dom('div', { class: "grid grid-cols-4 gap-1" });

        slots.forEach((slot, i) => {
            const item = dom('div', {
                title: `Slot ${i + 1}`,
                class: "w-8 h-8 bg-neutral-900 rounded border border-neutral-700 hover:border-sky-500 cursor-pointer relative overflow-hidden group",
                onClick: () => {
                    this.bus.emit('cmd:selectTool', { id: slot.p, isSecondary: false });
                    this.bus.emit('cmd:selectTool', { id: slot.s, isSecondary: true });
                    this.hideOptionsPanel();
                },
                onContextMenu: (e) => {
                    e.preventDefault();
                    const p = this.store.get('primaryTool');
                    const s = this.store.get('secondaryTool');
                    slots[i] = { p, s };
                    this.store.set('quickSlots', slots);
                    this.showQuickSlotsPanel(anchorEl);
                }
            });

            this.renderMiniSplitIcon(item, slot.p, slot.s);

            const num = dom('div', { class: "absolute bottom-0 right-0.5 text-[8px] font-bold text-white/50 pointer-events-none group-hover:text-white" }, i + 1);
            item.appendChild(num);
            grid.appendChild(item);
        });

        this.optionsPanel.appendChild(grid);
        document.body.appendChild(this.optionsPanel);
    }
}