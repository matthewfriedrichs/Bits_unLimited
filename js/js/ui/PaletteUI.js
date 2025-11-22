import DomBuilder from '../utils/DomBuilder.js';
import ColorUtils from '../utils/ColorUtils.js';
const dom = DomBuilder.create;

export default class PaletteUI {
    init(app) {
        this.app = app;
        this.store = app.store;
        this.bus = app.bus;

        this.sidebar = document.getElementById('left-sidebar');
        this.modal = document.getElementById('color-modal');
        this.hsv = { h: 0, s: 0, v: 0 };

        this.presets = {
            "Default": ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff'],
            "Gameboy": ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
            "Pico-8": ['#000000', '#1D2B53', '#7E2553', '#008751', '#AB5236', '#5F574F', '#C2C3C7', '#FFF1E8', '#FF004D', '#FFA300', '#FFEC27', '#00E436', '#29ADFF', '#83769C', '#FF77A8', '#FFCCAA']
        };

        this.renderSidebar();

        // --- LISTENERS ---

        // 1. External color changes (Eyedropper, Undo)
        this.bus.on('state:primaryColor', (c) => {
            if (this.mainSwatch) this.mainSwatch.style.backgroundColor = c;
        });

        // 2. Palette updates (Switch Project, Add Color, Load Preset)
        this.bus.on('state:currentPalette', () => {
            this.renderMiniPalette();
            // Only re-render modal if it's actually open
            if (!this.modal.classList.contains('hidden')) {
                this.renderModalContent();
                // FIX: Must re-apply gradients/previews after DOM is rebuilt
                this.updateUIPreviews();
            }
        });
    }

    // --- SIDEBAR VIEW ---

    renderSidebar() {
        const primary = this.store.get('primaryColor');

        this.mainSwatch = dom('div', {
            class: "w-10 h-10 rounded-full border-2 border-white shadow-md cursor-pointer hover:scale-105 transition",
            style: { backgroundColor: primary },
            onClick: () => this.openModal()
        });

        this.miniGrid = dom('div', { class: "grid grid-cols-2 gap-1 mt-1" });

        const container = dom('div', { class: "w-full pt-4 border-t border-neutral-700 flex flex-col items-center gap-2" },
            this.mainSwatch,
            this.miniGrid
        );

        // Insert at top of sidebar (after tool group if it exists)
        const tools = document.getElementById('tool-group');
        if (tools && tools.nextSibling) {
            this.sidebar.insertBefore(container, tools.nextSibling);
        } else {
            this.sidebar.appendChild(container);
        }

        this.renderMiniPalette();
    }

    renderMiniPalette() {
        this.miniGrid.innerHTML = '';
        const palette = this.store.get('currentPalette') || [];

        palette.forEach(c => {
            const d = dom('div', {
                class: "w-4 h-4 rounded cursor-pointer border border-neutral-600 hover:scale-110 transition",
                style: { backgroundColor: c },
                onClick: () => this.store.set('primaryColor', c)
            });
            this.miniGrid.appendChild(d);
        });
    }

    // --- MODAL VIEW ---

    openModal() {
        this.modal.classList.remove('hidden');
        const hex = this.store.get('primaryColor');
        this.hsv = ColorUtils.hexToHsv(hex);

        this.renderModalContent();
        this.updateUIPreviews();
    }

    closeModal() {
        this.modal.classList.add('hidden');
    }

    updateFromSlider(key, val) {
        this.hsv[key] = parseInt(val);
        const hex = ColorUtils.hsvToHex(this.hsv.h, this.hsv.s, this.hsv.v);

        this.store.set('primaryColor', hex);
        this.updateUIPreviews();
    }

    updateUIPreviews() {
        const { h, s, v } = this.hsv;
        const hex = ColorUtils.hsvToHex(h, s, v);

        // 1. Update Preview Swatch
        const preview = document.getElementById('modal-color-preview');
        if (preview) preview.style.backgroundColor = hex;

        // 2. Update Slider Backgrounds (Dynamic Gradients)
        const sliderH = document.getElementById('slider-h');
        const sliderS = document.getElementById('slider-s');
        const sliderV = document.getElementById('slider-v');

        if (sliderH) {
            sliderH.style.background = `linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)`;
        }

        if (sliderS) {
            const minS = ColorUtils.hsvToHex(h, 0, v);
            const maxS = ColorUtils.hsvToHex(h, 100, v);
            sliderS.style.background = `linear-gradient(to right, ${minS}, ${maxS})`;
        }

        if (sliderV) {
            const minV = '#000000';
            const maxV = ColorUtils.hsvToHex(h, s, 100);
            sliderV.style.background = `linear-gradient(to right, ${minV}, ${maxV})`;
        }

        // 3. Update Recommendations
        this.renderRecommendations(h, s, v);
    }

    renderRecommendations(h, s, v) {
        const container = document.getElementById('recommendation-grid');
        if (!container) return;

        container.innerHTML = '';
        const recs = ColorUtils.getRecommendations(h, s, v);

        recs.forEach(r => {
            const el = dom('div', {
                class: "flex flex-col items-center gap-1 cursor-pointer group",
                onClick: () => {
                    this.store.set('primaryColor', r.color);
                    this.hsv = ColorUtils.hexToHsv(r.color);

                    // Update Sliders to match new color
                    ['h', 's', 'v'].forEach(k => {
                        const input = document.getElementById(`slider-${k}`);
                        if (input) input.value = this.hsv[k];
                    });

                    this.updateUIPreviews();
                }
            },
                dom('div', {
                    class: "w-8 h-8 rounded border border-neutral-600 group-hover:scale-110 transition shadow-sm",
                    style: { backgroundColor: r.color }
                }),
                dom('span', { class: "text-[9px] text-neutral-500 uppercase" }, r.label)
            );
            container.appendChild(el);
        });
    }

    addToPalette() {
        const hex = ColorUtils.hsvToHex(this.hsv.h, this.hsv.s, this.hsv.v);
        const current = this.store.get('currentPalette');
        if (!current.includes(hex)) {
            const newPalette = [...current, hex];
            this.bus.emit('cmd:updatePalette', newPalette);
        }
    }

    loadPreset(name) {
        if (this.presets[name]) {
            this.bus.emit('cmd:updatePalette', [...this.presets[name]]);
        }
    }

    renderModalContent() {
        this.modal.innerHTML = '';
        const currentHex = ColorUtils.hsvToHex(this.hsv.h, this.hsv.s, this.hsv.v);
        const palette = this.store.get('currentPalette') || [];

        const makeSlider = (key, label, min, max, val) => {
            return dom('div', { class: "flex items-center gap-2" },
                dom('span', { class: "text-[10px] w-6 text-neutral-400 font-mono" }, label),
                dom('input', {
                    id: `slider-${key}`,
                    type: 'range', min, max, value: val,
                    class: "flex-1 h-3 bg-neutral-700 rounded-full cursor-pointer appearance-none",
                    onInput: (e) => this.updateFromSlider(key, e.target.value)
                })
            );
        };

        const content = dom('div', { class: "bg-neutral-800 w-full max-w-sm rounded-xl shadow-2xl border border-neutral-700 overflow-hidden flex flex-col" },
            // Header
            dom('div', { class: "flex justify-between items-center p-4 bg-neutral-900 border-b border-neutral-700" },
                dom('h3', { class: "font-bold text-sky-500" }, DomBuilder.icon('palette', 'mr-2'), "Color Studio"),
                dom('button', { class: "text-neutral-400 hover:text-white", onClick: () => this.closeModal() }, DomBuilder.icon('times'))
            ),
            // Body
            dom('div', { class: "p-5 flex flex-col gap-6" },
                // Preview & Sliders
                dom('div', { class: "flex gap-4" },
                    dom('div', {
                        id: 'modal-color-preview',
                        class: "w-16 h-16 rounded-lg border-2 border-white shadow-inner shrink-0",
                        style: { backgroundColor: currentHex }
                    }),
                    dom('div', { class: "flex-1 flex flex-col gap-2 justify-center" },
                        makeSlider('h', 'H', 0, 360, this.hsv.h),
                        makeSlider('s', 'S', 0, 100, this.hsv.s),
                        makeSlider('v', 'V', 0, 100, this.hsv.v)
                    )
                ),

                // Recommendations Section
                dom('div', {},
                    dom('h4', { class: "text-xs uppercase text-neutral-500 font-bold mb-2" }, "Harmony & Suggestions"),
                    dom('div', { id: "recommendation-grid", class: "flex justify-between" })
                ),

                // Palette Grid
                dom('div', {},
                    dom('div', { class: "flex justify-between items-center mb-2" },
                        dom('h4', { class: "text-xs uppercase text-neutral-500 font-bold" }, "Project Palette"),
                        dom('div', { class: "flex gap-2" },
                            dom('select', {
                                class: "bg-neutral-700 text-white text-xs rounded px-2 py-0.5 border-none outline-none",
                                onChange: (e) => this.loadPreset(e.target.value)
                            },
                                dom('option', { value: "", disabled: true, selected: true }, "Load..."),
                                ...Object.keys(this.presets).map(k => dom('option', { value: k }, k))
                            ),
                            dom('button', {
                                class: "text-xs bg-sky-600 hover:bg-sky-500 text-white px-2 py-0.5 rounded",
                                onClick: () => this.addToPalette()
                            }, DomBuilder.icon('plus', 'mr-1'), "Add")
                        )
                    ),
                    dom('div', { class: "grid grid-cols-8 gap-2 max-h-32 overflow-y-auto pr-1" },
                        ...palette.map(c => dom('div', {
                            class: "w-6 h-6 rounded cursor-pointer border border-neutral-600 hover:scale-110 transition shrink-0",
                            style: { backgroundColor: c },
                            onClick: () => {
                                this.store.set('primaryColor', c);
                                this.hsv = ColorUtils.hexToHsv(c);
                                ['h', 's', 'v'].forEach(k => {
                                    const el = document.getElementById(`slider-${k}`);
                                    if (el) el.value = this.hsv[k];
                                });
                                this.updateUIPreviews();
                            }
                        }))
                    )
                )
            )
        );

        this.modal.appendChild(content);
    }
}