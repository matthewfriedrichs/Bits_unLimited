import ColorUtils from '../utils/ColorUtils.js';
import DomBuilder from '../utils/DomBuilder.js';
const dom = DomBuilder.create;

export default class PalettePlugin {
    init(app) {
        this.app = app;
        this.sidebar = document.getElementById('left-sidebar');
        this.modal = document.getElementById('color-modal');

        // Presets
        this.presets = {
            "Default": ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff'],
            "Dawnbringer 16": ['#140c1c', '#442434', '#30346d', '#4e4a4e', '#854c30', '#346524', '#d04648', '#757161', '#597dce', '#d27d2c', '#8595a1', '#6daa2c', '#d2aa99', '#6dc2ca', '#dad45e', '#deeed6'],
            "Dawnbringer 32": ['#000000', '#222034', '#45283c', '#663931', '#8f563b', '#df7126', '#d9a066', '#eec39a', '#fbf236', '#99e550', '#6abe30', '#37946e', '#4b692f', '#524b24', '#323c39', '#3f3f74', '#306082', '#5b6ee1', '#639bff', '#5fcde4', '#cbdbfc', '#ffffff', '#9badb7', '#847e87', '#696a6a', '#595652', '#76428a', '#ac3232', '#d95763', '#d77bba', '#8f974a', '#8a6f30'],
            "Pico-8": ['#000000', '#1D2B53', '#7E2553', '#008751', '#AB5236', '#5F574F', '#C2C3C7', '#FFF1E8', '#FF004D', '#FFA300', '#FFEC27', '#00E436', '#29ADFF', '#83769C', '#FF77A8', '#FFCCAA'],
            "Gameboy": ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
            "CGA": ['#000000', '#55FFFF', '#FF55FF', '#FFFFFF'],
            "NES": ['#7C7C7C', '#0000FC', '#0000BC', '#4428BC', '#940084', '#A80020', '#A81000', '#881400', '#503000', '#007800', '#006800', '#005800', '#004058', '#000000', '#BCBCBC', '#0078F8', '#0058F8', '#6844FC', '#D800CC', '#E40058', '#F83800', '#E45C10', '#AC7C00', '#00B800', '#00A800', '#00A844', '#008888', '#BCBCBC', '#F8F8F8', '#3CBCFC', '#6888FC', '#9878F8', '#F878F8', '#F85898', '#F87858', '#FCA044', '#F8B800', '#B8F818', '#58D854', '#58F898', '#00E8D8', '#787878', '#FCFCFC', '#A4E4FC', '#B8B8F8', '#D8B8F8', '#F8B8F8', '#F8A4C0', '#F0D0B0', '#FCE0A8', '#F8D878', '#D8F878', '#B8F8B8', '#B8F8D8', '#00FCFC', '#F8D8F8', '#000000']
        };

        // Sidebar UI
        this.mainSwatch = dom('div', {
            class: "w-10 h-10 rounded-full border-2 border-white shadow-md cursor-pointer hover:scale-105 transition",
            style: { backgroundColor: app.state.primaryColor },
            onClick: () => this.openModal()
        });

        this.miniGrid = dom('div', { class: "grid grid-cols-2 gap-1 mt-1" });

        const container = dom('div', { class: "w-full pt-4 border-t border-neutral-700 flex flex-col items-center gap-2" },
            this.mainSwatch,
            this.miniGrid
        );
        this.sidebar.appendChild(container);

        // Event Listeners
        app.bus.on('colorChange', c => {
            app.state.primaryColor = c;
            this.mainSwatch.style.backgroundColor = c;
        });

        app.bus.on('paletteLoaded', (palette) => {
            this.renderMiniPalette();
        });

        app.bus.on('refreshPaletteUI', (paletteData) => {
            if (this.app.dataAccess.activeProject) {
                this.app.dataAccess.activeProject.palette = [...paletteData];
            }
            this.renderMiniPalette();
            if (!this.modal.classList.contains('hidden')) this.renderModalContent();
        });

        this.renderMiniPalette();
    }

    get currentPalette() {
        return this.app.dataAccess.activeProject
            ? this.app.dataAccess.activeProject.palette
            : [];
    }

    set currentPalette(val) {
        if (this.app.dataAccess.activeProject) {
            this.app.dataAccess.activeProject.palette = val;
            this.app.state.currentPalette = val;
        }
    }

    renderMiniPalette() {
        this.miniGrid.innerHTML = '';
        const palette = this.currentPalette;

        palette.forEach(c => {
            const d = dom('div', {
                class: "w-4 h-4 rounded cursor-pointer border border-neutral-600 hover:scale-110 transition",
                style: { backgroundColor: c },
                onClick: () => this.app.bus.emit('colorChange', c)
            });
            this.miniGrid.appendChild(d);
        });
        this.app.state.currentPalette = palette;
    }

    openModal() { this.modal.classList.remove('hidden'); const hex = this.app.state.primaryColor; this.hsv = ColorUtils.hexToHsv(hex); this.renderModalContent(); }
    closeModal() { this.modal.classList.add('hidden'); }

    addToPalette() {
        const hex = ColorUtils.hsvToHex(this.hsv.h, this.hsv.s, this.hsv.v);
        const palette = this.currentPalette;

        if (!palette.includes(hex)) {
            const oldVal = [...palette];
            palette.push(hex);
            this.renderModalContent();
            this.renderMiniPalette();
            this.app.bus.emit('cmd_PaletteChange', { oldVal, newVal: [...palette] });
        }
    }

    loadPreset(name) {
        if (this.presets[name]) {
            const oldVal = [...this.currentPalette];
            this.currentPalette = [...this.presets[name]];
            this.renderModalContent();
            this.renderMiniPalette();
            this.app.bus.emit('cmd_PaletteChange', { oldVal, newVal: [...this.currentPalette] });
        }
    }

    updateFromSlider(key, val) { this.hsv[key] = parseInt(val); const hex = ColorUtils.hsvToHex(this.hsv.h, this.hsv.s, this.hsv.v); this.app.bus.emit('colorChange', hex); this.renderModalContent(); }

    renderModalContent() {
        this.modal.innerHTML = '';
        const currentHex = ColorUtils.hsvToHex(this.hsv.h, this.hsv.s, this.hsv.v);

        const makeSlider = (key, label, min, max, val) => {
            let backgroundStyle = '';

            if (key === 'h') {
                // Accurate Rainbow Gradient for Hue
                backgroundStyle = 'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)';
            } else if (key === 's') {
                // Dynamic Saturation: Current Hue/Val, 0% to 100% Saturation
                const startColor = ColorUtils.hsvToHex(this.hsv.h, 0, this.hsv.v);
                const endColor = ColorUtils.hsvToHex(this.hsv.h, 100, this.hsv.v);
                backgroundStyle = `linear-gradient(to right, ${startColor}, ${endColor})`;
            } else if (key === 'v') {
                // Dynamic Value: Black to Current Hue/Sat with 100% Value
                const endColor = ColorUtils.hsvToHex(this.hsv.h, this.hsv.s, 100);
                backgroundStyle = `linear-gradient(to right, #000000, ${endColor})`;
            }

            return dom('div', { class: "flex items-center gap-2" },
                dom('span', { class: "text-[10px] w-4 text-neutral-400 font-mono" }, key.toUpperCase()),
                dom('div', { class: `flex-1 h-2 rounded-full relative overflow-hidden` },
                    // Background Layer
                    dom('div', {
                        class: "absolute inset-0",
                        style: { background: backgroundStyle }
                    }),
                    // Input Layer
                    dom('input', {
                        type: 'range', min, max, value: val,
                        class: "absolute inset-0 opacity-0 z-10 cursor-pointer",
                        onInput: (e) => this.updateFromSlider(key, e.target.value)
                    }),
                    // Indicator Line (Inverted logic to match pointer)
                    dom('div', {
                        class: "h-full bg-white/50 pointer-events-none border-r border-black/50 box-content",
                        style: { width: `${(val / max) * 100}%` }
                    })
                )
            );
        };

        const content = dom('div', { class: "bg-neutral-800 w-full max-w-sm rounded-xl shadow-2xl border border-neutral-700 overflow-hidden flex flex-col" },
            dom('div', { class: "flex justify-between items-center p-4 bg-neutral-900 border-b border-neutral-700" },
                dom('h3', { class: "font-bold text-sky-500" }, DomBuilder.icon('palette', 'mr-2'), "Color Studio"),
                dom('button', { class: "text-neutral-400 hover:text-white", onClick: () => this.closeModal() }, DomBuilder.icon('times'))
            ),
            dom('div', { class: "p-5 flex flex-col gap-6" },
                dom('div', { class: "flex gap-4" },
                    dom('div', { class: "w-16 h-16 rounded-lg border-2 border-white shadow-inner shrink-0", style: { backgroundColor: currentHex } }),
                    dom('div', { class: "flex-1 flex flex-col justify-between" },
                        makeSlider('h', 'Hue', 0, 360, this.hsv.h),
                        makeSlider('s', 'Sat', 0, 100, this.hsv.s),
                        makeSlider('v', 'Val', 0, 100, this.hsv.v)
                    )
                ),
                dom('div', {},
                    dom('h4', { class: "text-xs uppercase text-neutral-500 font-bold mb-2" }, "Recommended"),
                    dom('div', { class: "grid grid-cols-6 gap-2" },
                        ...ColorUtils.getRecommendations(this.hsv.h, this.hsv.s, this.hsv.v).map(r =>
                            dom('div', {
                                class: "flex flex-col items-center gap-1 group cursor-pointer",
                                onClick: () => { this.hsv = ColorUtils.hexToHsv(r.color); this.app.bus.emit('colorChange', r.color); this.renderModalContent(); }
                            },
                                dom('div', { class: "w-8 h-8 rounded-full border border-neutral-600 shadow-sm hover:scale-110 transition", style: { backgroundColor: r.color } }),
                                dom('span', { class: "text-[9px] text-neutral-400 group-hover:text-white" }, r.label)
                            )
                        )
                    )
                ),
                dom('div', {},
                    dom('div', { class: "flex justify-between items-center mb-2" },
                        dom('h4', { class: "text-xs uppercase text-neutral-500 font-bold" }, "Palette"),
                        dom('div', { class: "flex gap-2" },
                            dom('select', {
                                class: "bg-neutral-700 text-white text-xs rounded px-2 py-0.5 border-none outline-none cursor-pointer",
                                onChange: (e) => this.loadPreset(e.target.value)
                            },
                                dom('option', { value: "", disabled: true, selected: true }, "Load Preset..."),
                                ...Object.keys(this.presets).map(k => dom('option', { value: k }, k))
                            ),
                            dom('button', {
                                class: "text-xs bg-sky-600 hover:bg-sky-500 text-white px-2 py-0.5 rounded",
                                onClick: () => this.addToPalette()
                            }, DomBuilder.icon('plus', 'mr-1'), "Add")
                        )
                    ),
                    dom('div', { class: "grid grid-cols-8 gap-2 max-h-32 overflow-y-auto pr-1" },
                        ...this.currentPalette.map(c => dom('div', {
                            class: "w-6 h-6 rounded cursor-pointer border border-neutral-600 hover:scale-110 hover:border-white transition shrink-0",
                            style: { backgroundColor: c },
                            onClick: () => { this.hsv = ColorUtils.hexToHsv(c); this.app.bus.emit('colorChange', c); this.renderModalContent(); }
                        }))
                    )
                )
            )
        );

        this.modal.appendChild(content);
    }
}