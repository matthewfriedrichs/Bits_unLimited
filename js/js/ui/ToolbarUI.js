import DomBuilder from '../utils/DomBuilder.js';
import BrushGenerator from '../utils/BrushGenerator.js';
const dom = DomBuilder.create;

export default class ToolbarUI {
    init(app) {
        this.app = app;
        this.bus = app.bus;
        this.store = app.store;
        this.hoverTimer = null;
        this.optionsPanel = null;
        this.autoCloseHandler = null;

        this.toolsDef = [
            { id: 'select', icon: 'vector-square', color: 'text-green-400' },
            { id: 'pen', icon: 'pen', color: 'text-sky-400' },
            { id: 'eraser', icon: 'eraser', color: 'text-rose-400' },
            { id: 'bucket', icon: 'fill-drip', color: 'text-amber-400' },
            { id: 'eyedropper', icon: 'eye-dropper', color: 'text-fuchsia-400' },
            { id: 'frame', icon: 'crop-alt', color: 'text-yellow-400' }
        ];

        this.render();

        this.bus.on('state:primaryTool', () => this.updateUI());
        this.bus.on('state:secondaryTool', () => this.updateUI());
        
        this.bus.on('tool:modeChanged', (data) => {
            if (data.toolId === 'bucket') this.updateBucketIcon(data.mode);
            if (data.toolId === 'select') this.updateSelectIcon(data.mode);
            this.hideOptionsPanel();
        });

        this.bus.on('state:activeBrush', () => this.updatePenIcon());
        this.bus.on('state:eraserBrush', () => this.updateEraserIcon());

        document.addEventListener('mousedown', (e) => {
            if (this.optionsPanel && !this.optionsPanel.contains(e.target)) {
                this.hideOptionsPanel();
            }
        });
        
        setTimeout(() => {
            this.updatePenIcon();
            this.updateEraserIcon();
            this.updateBucketIcon('normal');
            this.updateSelectIcon('color');
        }, 0);
    }

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
        container.innerHTML = '';

        this.toolsDef.forEach(t => {
            const btn = dom('button', {
                id: `tool-btn-${t.id}`,
                title: `${t.id} (L: Primary, R: Secondary, Dbl: Mode)`,
                class: `w-10 h-10 rounded bg-neutral-700 hover:bg-neutral-600 flex items-center justify-center transition tool-btn relative overflow-visible`,
                
                onClick: () => this.store.set('primaryTool', t.id),
                onContextMenu: (e) => {
                    e.preventDefault();
                    this.store.set('secondaryTool', t.id);
                },
                onDblClick: () => this.bus.emit('cmd:toggleToolMode', t.id),
                
                onMouseEnter: () => this.startHoverTimer(t.id, btn),
                onMouseLeave: () => this.cancelHoverTimer(),
                onTouchStart: () => this.startHoverTimer(t.id, btn),
                onTouchEnd: () => this.cancelHoverTimer()
            }, DomBuilder.icon(t.icon, t.color));
            
            container.appendChild(btn);
        });

        this.updateUI();
    }

    // --- Timers (Instant Response) ---

    startHoverTimer(toolId, btn) {
        this.cancelHoverTimer(); 
        // FIX: Set to 0ms for instant open
        this.hoverTimer = setTimeout(() => {
            this.showOptionsPanel(toolId, btn);
        }, 0);
    }

    startSlotHoverTimer(element) {
        this.cancelHoverTimer();
        // FIX: Set to 0ms for instant open
        this.hoverTimer = setTimeout(() => {
            this.showQuickSlotsPanel(element);
        }, 0);
    }

    cancelHoverTimer() {
        if (this.hoverTimer) {
            clearTimeout(this.hoverTimer);
            this.hoverTimer = null;
        }
    }

    // --- Quick Slots ---

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

        // Auto-close logic
        this.autoCloseHandler = (e) => {
            if (!this.optionsPanel) return;
            const r = this.optionsPanel.getBoundingClientRect();
            const x = e.clientX, y = e.clientY;
            
            // Only check distance if outside the rect
            const distRight = (x > r.right) ? x - r.right : 0;
            const distVert = (y < r.top) ? r.top - y : (y > r.bottom) ? y - r.bottom : 0;
            
            // Ignore x < r.left (Moving left is allowed as it's the toolbar area)
            
            if (distRight > 20 || distVert > 20) {
                this.hideOptionsPanel();
            }
        };
        document.addEventListener('mousemove', this.autoCloseHandler);

        // Grid of Slots
        const grid = dom('div', { class: "grid grid-cols-4 gap-1" });
        
        slots.forEach((slot, i) => {
            const item = dom('div', {
                title: `Slot ${i+1} (Click to Load, R-Click to Save)`,
                class: "w-8 h-8 bg-neutral-900 rounded border border-neutral-700 hover:border-sky-500 cursor-pointer relative overflow-hidden group",
                onClick: () => {
                    this.store.set('primaryTool', slot.p);
                    this.store.set('secondaryTool', slot.s);
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
            
            const num = dom('div', { 
                class: "absolute bottom-0 right-0.5 text-[8px] font-bold text-white/50 pointer-events-none group-hover:text-white" 
            }, i + 1);
            
            item.appendChild(num);
            grid.appendChild(item);
        });

        this.optionsPanel.appendChild(grid);
        document.body.appendChild(this.optionsPanel);
    }

    // --- Tool Options Panel ---

    showOptionsPanel(toolId, btnElement) {
        this.hideOptionsPanel();

        const toolService = this.app.services.get('tools');
        const tool = toolService.tools[toolId];
        
        const hasModes = tool && tool.availableModes;
        const hasSettings = tool && tool.settings;

        if (!hasModes && !hasSettings) return;

        const rect = btnElement.getBoundingClientRect();
        this.optionsPanel = dom('div', {
            class: "fixed bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl p-2 flex flex-col gap-2 z-[100] animate-fade-in-right",
            style: {
                left: `${rect.right + 10}px`,
                top: `${rect.top}px`,
                minWidth: '220px'
            }
        }, 
            dom('div', { class: "text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1 px-2 border-b border-neutral-700 pb-1" }, `${toolId} Options`)
        );

        // Reuse Auto-close logic
        this.autoCloseHandler = (e) => {
            if (!this.optionsPanel) return;
            const r = this.optionsPanel.getBoundingClientRect();
            const x = e.clientX, y = e.clientY;
            const distRight = (x > r.right) ? x - r.right : 0;
            const distVert = (y < r.top) ? r.top - y : (y > r.bottom) ? y - r.bottom : 0;
            
            if (distRight > 20 || distVert > 20) {
                this.hideOptionsPanel();
            }
        };
        document.addEventListener('mousemove', this.autoCloseHandler);

        if (hasModes) {
            tool.availableModes.forEach(mode => {
                const isSelected = tool.mode === mode.id;
                const modeBtn = dom('button', {
                    class: `flex items-center gap-3 w-full p-2 rounded text-left transition ${isSelected ? 'bg-neutral-700' : 'hover:bg-neutral-700'}`,
                    onClick: () => {
                        tool.setMode(mode.id);
                        this.showOptionsPanel(toolId, btnElement);
                    }
                },
                    dom('div', { class: "w-6 h-6 flex items-center justify-center bg-neutral-900 rounded shrink-0" }, 
                        DomBuilder.icon(mode.icon, mode.color)
                    ),
                    dom('div', { class: "flex flex-col" },
                        dom('span', { class: "text-xs font-bold text-gray-200" }, mode.label),
                        dom('span', { class: "text-[10px] text-neutral-500" }, mode.desc)
                    ),
                    isSelected ? DomBuilder.icon('check', 'text-sky-500 ml-auto') : null
                );
                this.optionsPanel.appendChild(modeBtn);
            });
        }

        if (hasSettings) {
            tool.settings.forEach(setting => {
                const label = dom('label', { class: "text-[10px] text-neutral-400 font-bold uppercase block mb-1" }, setting.label);
                let input;

                if (setting.type === 'brush-picker') {
                    const listContainer = dom('div', { class: "grid grid-cols-4 gap-1 max-h-48 overflow-y-auto p-1 bg-neutral-900 rounded border border-neutral-700" });
                    const customShapes = this.store.get('customShapes') || [];

                    setting.options.forEach(opt => {
                        const isSelected = opt.id === setting.value;
                        
                        const previewCanvas = dom('canvas', { width: 24, height: 24, class: "w-full h-full" });
                        const ctx = previewCanvas.getContext('2d');
                        const fp = BrushGenerator.generate(opt.id, 14, customShapes);
                        
                        ctx.fillStyle = isSelected ? '#0ea5e9' : '#999';
                        const cx = 12, cy = 12;
                        fp.forEach(pt => ctx.fillRect(cx + pt.x, cy + pt.y, 1, 1));

                        const item = dom('button', {
                            title: opt.label,
                            class: `w-8 h-8 rounded flex items-center justify-center hover:bg-neutral-700 transition border ${isSelected ? 'border-sky-500 bg-neutral-800' : 'border-transparent'}`,
                            onClick: () => {
                                tool.setSetting(setting.id, opt.id);
                                this.showOptionsPanel(toolId, btnElement);
                            }
                        }, previewCanvas);
                        
                        listContainer.appendChild(item);
                    });
                    input = listContainer;
                }
                else if (setting.type === 'range') {
                    input = dom('div', { class: "flex items-center gap-2" },
                        dom('span', { class: "text-xs w-6" }, setting.value),
                        dom('input', { 
                            type: 'range', min: setting.min, max: setting.max, value: setting.value, 
                            class: "flex-1 h-2 bg-neutral-600 rounded-lg appearance-none",
                            onInput: (e) => {
                                e.target.previousSibling.innerText = e.target.value;
                                tool.setSetting(setting.id, parseInt(e.target.value));
                            }
                        })
                    );
                } else if (setting.type === 'select') {
                    input = dom('select', {
                        class: "w-full bg-neutral-700 text-white text-xs rounded px-2 py-1 border-none outline-none",
                        onChange: (e) => {
                            tool.setSetting(setting.id, e.target.value);
                            this.showOptionsPanel(toolId, btnElement);
                        }
                    }, ...setting.options.map(opt => dom('option', { value: opt.id, selected: opt.id === setting.value }, opt.label)));
                } 
                else if (setting.type === 'toggle') {
                    input = dom('div', { class: "flex items-center justify-between bg-neutral-700 p-1 rounded cursor-pointer", 
                        onClick: () => {
                            tool.setSetting(setting.id, !setting.value);
                            this.showOptionsPanel(toolId, btnElement);
                        } 
                    },
                        dom('span', { class: "text-xs ml-1" }, setting.value ? "On" : "Off"),
                        dom('div', { class: `w-8 h-4 rounded-full relative transition ${setting.value ? 'bg-sky-500' : 'bg-neutral-500'}` },
                            dom('div', { class: `absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition transform ${setting.value ? 'translate-x-4' : 'translate-x-0.5'}` })
                        )
                    );
                }

                this.optionsPanel.appendChild(dom('div', { class: "px-2 py-1" }, label, input));
            });
        }

        if (toolId === 'pen' || toolId === 'eraser') {
            const settingsBtn = dom('button', {
                class: "mt-1 w-full text-[10px] text-neutral-500 hover:text-neutral-300 py-1 border-t border-neutral-700",
                onClick: () => {
                    this.hideOptionsPanel();
                    this.app.services.get('ui_brush').openModal();
                }
            }, DomBuilder.icon('cog', 'mr-1'), "Advanced Settings...");
            this.optionsPanel.appendChild(settingsBtn);
        }

        document.body.appendChild(this.optionsPanel);
    }

    hideOptionsPanel() {
        if (this.optionsPanel) {
            if (this.autoCloseHandler) {
                document.removeEventListener('mousemove', this.autoCloseHandler);
                this.autoCloseHandler = null;
            }
            this.optionsPanel.remove();
            this.optionsPanel = null;
        }
    }

    // ... (Helpers: renderSplitIcon, updateUI, updateListHighlights, updatePenIcon, updateEraserIcon, updateBucketIcon, updateSelectIcon, renderMiniSplitIcon) ...
    updateUI() { const pId = this.store.get('primaryTool'); const sId = this.store.get('secondaryTool'); this.renderSplitIcon(pId, sId); this.updateListHighlights(pId, sId); }
    updatePenIcon() { const btn = document.getElementById('tool-btn-pen'); if (!btn) return; const brush = this.store.get('activeBrush'); const footprint = brush.footprint || [{x:0, y:0}]; const canvas = dom('canvas', { width: 32, height: 32, class: 'w-8 h-8 image-pixelated' }); const ctx = canvas.getContext('2d'); const zoom = Math.min(4, 24 / Math.max(brush.size, 1)); const cx = 16, cy = 16; ctx.fillStyle = '#ffffff'; footprint.forEach(pt => { ctx.fillRect(Math.floor(cx + pt.x * zoom - zoom/2), Math.floor(cy + pt.y * zoom - zoom/2), Math.ceil(zoom), Math.ceil(zoom)); }); const badge = dom('div', { class: 'absolute -top-1 -right-1 text-[10px] bg-neutral-900 rounded-full w-4 h-4 flex items-center justify-center border border-neutral-600 shadow-sm' }, DomBuilder.icon('pen', 'text-sky-400')); btn.innerHTML = ''; btn.appendChild(canvas); btn.appendChild(badge); }
    updateEraserIcon() { const btn = document.getElementById('tool-btn-eraser'); if (!btn) return; const brush = this.store.get('eraserBrush'); const footprint = brush.footprint || [{x:0, y:0}]; const canvas = dom('canvas', { width: 32, height: 32, class: 'w-8 h-8 image-pixelated' }); const ctx = canvas.getContext('2d'); const zoom = Math.min(4, 24 / Math.max(brush.size, 1)); const cx = 16, cy = 16; ctx.fillStyle = 'rgba(255, 150, 150, 0.8)'; footprint.forEach(pt => { ctx.fillRect(Math.floor(cx + pt.x * zoom - zoom/2), Math.floor(cy + pt.y * zoom - zoom/2), Math.ceil(zoom), Math.ceil(zoom)); }); const badge = dom('div', { class: 'absolute -top-1 -right-1 text-[10px] bg-neutral-900 rounded-full w-4 h-4 flex items-center justify-center border border-neutral-600 shadow-sm' }, DomBuilder.icon('eraser', 'text-rose-400')); btn.innerHTML = ''; btn.appendChild(canvas); btn.appendChild(badge); }
    updateBucketIcon(mode) { const btn = document.getElementById('tool-btn-bucket'); if (!btn) return; btn.innerHTML = ''; btn.appendChild(DomBuilder.icon('fill-drip', 'text-amber-400')); if (mode === 'smart') { const badge = dom('div', { class: 'absolute -top-1 -right-1 text-[10px] bg-neutral-900 rounded-full w-4 h-4 flex items-center justify-center border border-neutral-600 shadow-sm' }, DomBuilder.icon('wand-magic-sparkles', 'text-fuchsia-400')); btn.appendChild(badge); } }
    updateSelectIcon(mode) { const btn = document.getElementById('tool-btn-select'); if (!btn) return; btn.innerHTML = ''; const icon = mode === 'color' ? 'magic' : 'shapes'; const color = mode === 'color' ? 'text-fuchsia-400' : 'text-sky-400'; const badge = dom('div', { class: 'absolute -top-1 -right-1 text-[10px] bg-neutral-900 rounded-full w-4 h-4 flex items-center justify-center border border-neutral-600 shadow-sm' }, DomBuilder.icon(icon, color)); btn.appendChild(badge); btn.appendChild(DomBuilder.icon('vector-square', 'text-green-400')); }
    renderSplitIcon(pId, sId) { this.indicatorEl.innerHTML = ''; const getToolDef = (id) => this.toolsDef.find(t => t.id === id) || this.toolsDef[0]; const pTool = getToolDef(pId); const sTool = getToolDef(sId); const commonClass = "absolute inset-0 flex items-center justify-center text-xl rounded-lg border border-neutral-600 bg-neutral-800 shadow-lg overflow-hidden"; if (pId === sId) { const el = dom('div', { class: commonClass }, DomBuilder.icon(pTool.icon, pTool.color)); this.indicatorEl.appendChild(el); } else { const pEl = dom('div', { class: commonClass + " z-10 bg-neutral-800", style: { clipPath: 'polygon(0 0, 100% 0, 0 100%)' } }, dom('div', { class: '-translate-x-1 -translate-y-1' }, DomBuilder.icon(pTool.icon, pTool.color))); const sEl = dom('div', { class: commonClass + " z-0 bg-neutral-700", style: { clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' } }, dom('div', { class: 'translate-x-1 translate-y-1' }, DomBuilder.icon(sTool.icon, sTool.color))); const border = dom('div', { class: "absolute inset-0 pointer-events-none z-20 border-white/10", style: { background: 'linear-gradient(135deg, transparent 49.5%, #404040 49.5%, #404040 50.5%, transparent 50.5%)' } }); this.indicatorEl.appendChild(sEl); this.indicatorEl.appendChild(pEl); this.indicatorEl.appendChild(border); } const labels = dom('div', { class: "absolute -bottom-2 w-full flex justify-between text-[8px] font-bold px-1 text-neutral-500 uppercase pointer-events-none z-30" }, dom('span', {}, 'L'), dom('span', {}, 'R')); this.indicatorEl.appendChild(labels); }
    updateListHighlights(pId, sId) { document.querySelectorAll('.tool-btn').forEach(btn => { btn.classList.remove('ring-2', 'ring-4', 'ring-sky-500', 'ring-amber-500', 'ring-offset-1', 'ring-offset-neutral-800', 'bg-neutral-600'); btn.classList.add('bg-neutral-700'); const isP = btn.id === `tool-btn-${pId}`; const isS = btn.id === `tool-btn-${sId}`; if (isP && isS) { btn.classList.remove('bg-neutral-700'); btn.classList.add('bg-neutral-600', 'ring-4', 'ring-sky-500/50'); } else if (isP) { btn.classList.remove('bg-neutral-700'); btn.classList.add('bg-neutral-600', 'ring-2', 'ring-sky-500', 'ring-offset-1', 'ring-offset-neutral-800'); } else if (isS) { btn.classList.remove('bg-neutral-700'); btn.classList.add('bg-neutral-600', 'ring-2', 'ring-amber-500', 'ring-offset-1', 'ring-offset-neutral-800'); } }); }
    renderMiniSplitIcon(container, pId, sId) { const getTool = (id) => this.toolsDef.find(t => t.id === id) || this.toolsDef[0]; const pTool = getTool(pId); const sTool = getTool(sId); if (pId === sId) { container.appendChild(dom('div', { class: "absolute inset-0 flex items-center justify-center text-xs" }, DomBuilder.icon(pTool.icon, pTool.color))); } else { const pEl = dom('div', { class: "absolute inset-0 z-10 bg-neutral-800 flex items-center justify-center text-xs", style: { clipPath: 'polygon(0 0, 100% 0, 0 100%)' } }, dom('div', { class: '-translate-x-1 -translate-y-1' }, DomBuilder.icon(pTool.icon, pTool.color))); const sEl = dom('div', { class: "absolute inset-0 z-0 bg-neutral-700 flex items-center justify-center text-xs", style: { clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' } }, dom('div', { class: 'translate-x-1 translate-y-1' }, DomBuilder.icon(sTool.icon, sTool.color))); container.appendChild(sEl); container.appendChild(pEl); } }
}