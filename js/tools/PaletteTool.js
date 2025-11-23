import BaseTool from './BaseTool.js';
import { ToolIcon, ToolSidebar } from '../ui/components/ToolDef.js';
import ColorUtils from '../utils/ColorUtils.js';
import DomBuilder from '../utils/DomBuilder.js';
const dom = DomBuilder.create;

export default class PaletteTool extends BaseTool {
    constructor(app) {
        super(app);

        // 1. Initialize Color State
        const hex = this.app.store.get('primaryColor');
        this.hsv = ColorUtils.hexToHsv(hex);

        // 2. Load Palette Library
        const loadedLibs = localStorage.getItem('pixel_palette_library');
        this.savedPalettes = loadedLibs ? JSON.parse(loadedLibs) : this.getDefaultPalettes();

        // Ensure persistence for the widget height
        if (!this.app.store.get('paletteWidgetHeight')) {
            this.app.store.set('paletteWidgetHeight', 120, true);
        }

        // 3. Listeners
        this.app.bus.on('state:primaryColor', (c) => {
            this.hsv = ColorUtils.hexToHsv(c);
        });

        // Auto-Resize and Refresh when palette changes
        this.app.bus.on('state:currentPalette', () => {
            this.autoResizeWidget();
            this.app.bus.emit('cmd:setToolSetting', { toolId: 'palette' });
            this.app.bus.emit('tool:extensionUpdate', 'palette');
        });
    }

    autoResizeWidget() {
        const palette = this.app.store.get('currentPalette') || [];
        const rows = Math.ceil(palette.length / 2);

        // Calculate Height:
        // Rows * 16px (h-4) + (Rows - 1) * 2px (gap) + 4px (padding) + 8px (handle)
        // Simplified: Rows * 18 + 12
        const newHeight = (rows * 18) + 12;

        // Clamp to reasonable limits (e.g. don't let it be 0, max 500)
        const clamped = Math.max(40, Math.min(600, newHeight));

        this.app.store.set('paletteWidgetHeight', clamped);
    }

    getDefaultPalettes() {
        return [
            { id: 'pico-8', name: 'Pico-8', colors: ['#000000', '#1D2B53', '#7E2553', '#008751', '#AB5236', '#5F574F', '#C2C3C7', '#FFF1E8', '#FF004D', '#FFA300', '#FFEC27', '#00E436', '#29ADFF', '#83769C', '#FF77A8', '#FFCCAA'] },
            { id: 'gameboy', name: 'Gameboy', colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'] },
            { id: 'cga', name: 'CGA', colors: ['#000000', '#555555', '#ffffff', '#ff5555', '#55ffff', '#ff55ff'] }
        ];
    }

    get iconDef() {
        const color = this.app.store.get('primaryColor');
        return new ToolIcon({
            icon: 'circle',
            label: 'Color Palette',
            hexColor: color,
            hotkey: 'C'
        });
    }

    get sidebarDef() {
        const ui = new ToolSidebar();
        ui.addCustom(() => this.renderMainPanel());
        ui.setToolLibrary(() => this.renderLibraryPanel());
        return ui;
    }

    // --- Toolbar Widget Implementation ---

    renderToolbarExtension() {
        const currentPalette = this.app.store.get('currentPalette') || [];
        const height = this.app.store.get('paletteWidgetHeight');

        // 1. Container
        const container = dom('div', {
            class: "w-10 flex flex-col items-center bg-neutral-800 rounded-b mb-2 overflow-hidden transition-all border-x border-b border-neutral-700 relative group/palette",
            style: { height: `${height}px`, transition: 'height 0.2s ease' } // Add transition for smooth auto-resize
        });

        // 2. Color Grid
        const grid = dom('div', {
            class: "w-full flex-1 overflow-y-auto scrollbar-hide flex flex-col gap-0.5 p-0.5"
        });

        for (let i = 0; i < currentPalette.length; i += 2) {
            const row = dom('div', { class: "flex gap-0.5 w-full h-4 shrink-0" });

            // Color 1
            const c1 = currentPalette[i];
            row.appendChild(this._makeSwatch(c1));

            // Color 2 (or Spacer)
            if (i + 1 < currentPalette.length) {
                const c2 = currentPalette[i + 1];
                row.appendChild(this._makeSwatch(c2));
            } else {
                // SPACER: Ensures the odd color stays 50% width
                row.appendChild(dom('div', { class: "flex-1 h-full bg-transparent" }));
            }
            grid.appendChild(row);
        }
        container.appendChild(grid);

        // 3. Drag Handle
        const handle = dom('div', {
            class: "w-full h-2 bg-neutral-900 cursor-ns-resize flex items-center justify-center hover:bg-sky-500/50 transition shrink-0",
            title: "Drag to resize"
        }, dom('div', { class: "w-4 h-0.5 bg-neutral-600 rounded-full" }));

        handle.onpointerdown = (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Disable transition during drag for responsiveness
            container.style.transition = 'none';

            const startY = e.clientY;
            const startH = container.clientHeight;

            const onMove = (ev) => {
                const dy = ev.clientY - startY;
                const newH = Math.max(20, Math.min(600, startH + dy));
                container.style.height = `${newH}px`;
            };

            const onUp = () => {
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
                container.style.transition = 'height 0.2s ease'; // Re-enable transition
                this.app.store.set('paletteWidgetHeight', parseInt(container.style.height));
            };

            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
        };

        container.appendChild(handle);

        return container;
    }

    _makeSwatch(color) {
        return dom('div', {
            class: "flex-1 h-full rounded-sm cursor-pointer hover:scale-110 transition shadow-sm",
            style: { backgroundColor: color },
            onClick: (e) => {
                e.stopPropagation();
                this.app.store.set('primaryColor', color);
            },
            onContextMenu: (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.app.store.set('primaryColor', color); // Optionally set secondary if you add that logic later
            }
        });
    }

    // --- Main Panel ---

    renderMainPanel() {
        const container = dom('div', { class: "flex flex-col gap-4 w-full" });
        const { h, s, v } = this.hsv;
        const currentHex = ColorUtils.hsvToHex(h, s, v);

        // Preview & Sliders
        const preview = dom('div', {
            class: "w-full h-8 rounded border border-neutral-600 shadow-inner mb-2",
            style: { backgroundColor: currentHex }
        });

        const makeSlider = (label, max, val, bg) => {
            const input = dom('input', {
                type: 'range', min: 0, max: max, value: val,
                class: "w-full h-3 rounded-full appearance-none cursor-pointer bg-neutral-700",
                style: { background: bg },
                onInput: (e) => {
                    this.hsv[label.toLowerCase()] = parseInt(e.target.value);
                    this.updateColor();
                }
            });
            return dom('div', { class: "flex items-center gap-2" },
                dom('span', { class: "text-xs font-mono w-3 text-neutral-400" }, label),
                input
            );
        };

        const gradH = `linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)`;
        const gradS = `linear-gradient(to right, ${ColorUtils.hsvToHex(h, 0, v)}, ${ColorUtils.hsvToHex(h, 100, v)})`;
        const gradV = `linear-gradient(to right, #000, ${ColorUtils.hsvToHex(h, s, 100)})`;

        container.appendChild(preview);
        container.appendChild(makeSlider('H', 360, h, gradH));
        container.appendChild(makeSlider('S', 100, s, gradS));
        container.appendChild(makeSlider('V', 100, v, gradV));

        // Recommendations
        const recs = ColorUtils.getRecommendations(h, s, v);
        const recContainer = dom('div', { class: "grid grid-cols-6 gap-1 mt-2" });
        recs.forEach(r => {
            const swatch = dom('div', {
                title: r.label,
                class: "w-6 h-6 rounded border border-neutral-600 cursor-pointer hover:scale-110 transition",
                style: { backgroundColor: r.color },
                onClick: () => this.app.store.set('primaryColor', r.color)
            });
            recContainer.appendChild(swatch);
        });

        container.appendChild(dom('div', { class: "mt-1" },
            dom('span', { class: "text-[9px] uppercase font-bold text-neutral-500" }, "Harmony"),
            recContainer
        ));

        // Project Palette
        const projectPalette = this.app.store.get('currentPalette') || [];

        const paletteHeader = dom('div', { class: "flex justify-between items-center mt-4 mb-1" },
            dom('span', { class: "text-[9px] uppercase font-bold text-neutral-500" }, "Project Colors"),
            dom('button', {
                class: "text-neutral-400 hover:text-sky-400 transition",
                title: "Add Current Color",
                onClick: () => this.addToProjectPalette()
            }, DomBuilder.icon('plus', 'text-xs'))
        );

        const paletteGrid = dom('div', { class: "grid grid-cols-6 gap-1" });
        projectPalette.forEach(c => {
            const el = dom('div', {
                class: "w-6 h-6 rounded cursor-pointer border border-neutral-700 hover:scale-110 transition hover:border-white relative group",
                style: { backgroundColor: c },
                onClick: () => this.app.store.set('primaryColor', c),
                onContextMenu: (e) => {
                    e.preventDefault();
                    this.removeFromProjectPalette(c);
                }
            });
            paletteGrid.appendChild(el);
        });

        container.appendChild(paletteHeader);
        container.appendChild(paletteGrid);

        return container;
    }

    // --- Library Panel ---

    renderLibraryPanel() {
        const container = dom('div', { class: "flex flex-col h-full w-40 border-l border-neutral-700 pl-2 ml-1" });

        container.appendChild(dom('div', { class: "flex justify-between items-center mb-2 px-1 pt-2" },
            dom('span', { class: "text-[10px] font-bold text-neutral-500 uppercase" }, "Libraries"),
            dom('button', {
                class: "text-neutral-400 hover:text-white transition",
                title: "Save Current Project Palette as Preset",
                onClick: () => this.saveCurrentPaletteAsPreset()
            }, DomBuilder.icon('save', 'text-xs'))
        ));

        const list = dom('div', { class: "flex-1 overflow-y-auto scrollbar-hide flex flex-col gap-1 pb-2" });

        this.savedPalettes.forEach((p, index) => {
            const previewStrip = dom('div', { class: "flex h-2 w-full rounded-sm overflow-hidden mt-1" });
            p.colors.slice(0, 5).forEach(c => {
                previewStrip.appendChild(dom('div', { class: "flex-1 h-full", style: { backgroundColor: c } }));
            });

            const item = dom('div', {
                class: "group p-2 rounded cursor-pointer bg-neutral-800 border border-transparent hover:border-sky-500 transition mb-1",
                onClick: () => this.loadPalette(p)
            },
                dom('div', { class: "flex justify-between items-center" },
                    dom('span', { class: "text-xs font-bold text-gray-300 truncate" }, p.name),
                    dom('button', {
                        class: "opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-rose-400 transition",
                        onClick: (e) => { e.stopPropagation(); this.deletePalette(index); }
                    }, DomBuilder.icon('times', 'text-[10px]'))
                ),
                previewStrip,
                dom('span', { class: "text-[9px] text-neutral-500 block mt-1" }, `${p.colors.length} colors`)
            );
            list.appendChild(item);
        });

        container.appendChild(list);
        return container;
    }

    // --- Logic Methods ---

    updateColor() {
        const hex = ColorUtils.hsvToHex(this.hsv.h, this.hsv.s, this.hsv.v);
        this.app.store.set('primaryColor', hex);
    }

    addToProjectPalette() {
        const current = this.app.store.get('currentPalette');
        const hex = this.app.store.get('primaryColor');
        if (!current.includes(hex)) {
            this.app.bus.emit('cmd:updatePalette', [...current, hex]);
        }
    }

    removeFromProjectPalette(hex) {
        const current = this.app.store.get('currentPalette');
        this.app.bus.emit('cmd:updatePalette', current.filter(c => c !== hex));
    }

    saveCurrentPaletteAsPreset() {
        const currentColors = this.app.store.get('currentPalette');
        if (!currentColors || currentColors.length === 0) {
            alert("Current palette is empty.");
            return;
        }

        const name = prompt("Palette Name:", `My Palette ${this.savedPalettes.length + 1}`);
        if (name) {
            const preset = {
                id: Math.random().toString(36).substr(2, 9),
                name: name,
                colors: [...currentColors]
            };
            this.savedPalettes.push(preset);
            this.persistLibrary();
            this.app.bus.emit('cmd:setToolSetting', { toolId: 'palette' });
        }
    }

    loadPalette(preset) {
        // Direct load without confirmation
        this.app.bus.emit('cmd:updatePalette', [...preset.colors]);
    }

    deletePalette(index) {
        if (confirm("Delete this palette preset?")) {
            this.savedPalettes.splice(index, 1);
            this.persistLibrary();
            this.app.bus.emit('cmd:setToolSetting', { toolId: 'palette' });
        }
    }

    persistLibrary() {
        localStorage.setItem('pixel_palette_library', JSON.stringify(this.savedPalettes));
    }

    onPointerDown(p) { }
}