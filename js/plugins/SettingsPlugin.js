import DomBuilder from '../utils/DomBuilder.js';
const dom = DomBuilder.create;

export default class SettingsPlugin {
    init(app) {
        this.app = app;
        this.btn = document.getElementById('settings-menu-btn');
        this.modal = document.getElementById('settings-modal');

        this.btn.onclick = () => this.openModal();
    }

    openModal() {
        this.renderModal();
        this.modal.classList.remove('hidden');
    }

    closeModal() {
        this.modal.classList.add('hidden');
    }

    update(path, val) {
        // 1. Update the settings object
        const keys = path.split('.');
        let obj = this.app.settings;
        for (let i = 0; i < keys.length - 1; i++) {
            obj = obj[keys[i]];
        }
        obj[keys[keys.length - 1]] = val;

        // 2. Special Handling
        // If background changes, clear the cached pattern so it regenerates
        if (path.includes('background')) {
            this.app.bgPattern = null;
        }

        // 3. Re-render Canvas
        this.app.bus.emit('render', this.app.ctx);
    }

    renderModal() {
        this.modal.innerHTML = ''; // Clear previous render
        const s = this.app.settings;

        // --- HELPER COMPONENTS ---

        // Section Header
        const sectionTitle = (text) => dom('h4', {
            class: 'text-xs uppercase text-sky-500 font-bold mb-3 border-b border-neutral-700 pb-1'
        }, text);

        // Label Wrapper
        const label = (text, ...children) => dom('label', {
            class: 'flex items-center gap-2 text-sm text-gray-300 cursor-pointer'
        }, ...children, text);

        // Small Label for Inputs
        const smallLabel = (text) => dom('span', { class: 'text-xs text-gray-400 block mb-1' }, text);

        // --- UI CONSTRUCTION ---

        const content = dom('div', { class: 'bg-neutral-800 w-full max-w-md rounded-xl shadow-2xl border border-neutral-700 overflow-hidden flex flex-col' },

            // 1. Header
            dom('div', { class: 'flex justify-between items-center p-4 bg-neutral-900 border-b border-neutral-700' },
                dom('h3', { class: 'font-bold text-neutral-200' },
                    DomBuilder.icon('cog', 'mr-2'),
                    'Interface Settings'
                ),
                dom('button', {
                    class: 'text-neutral-400 hover:text-white',
                    onClick: () => this.closeModal()
                }, DomBuilder.icon('times'))
            ),

            // 2. Body
            dom('div', { class: 'p-6 flex flex-col gap-6' },

                // --- SECTION: PIXEL GRID ---
                dom('div', {},
                    sectionTitle('Pixel Grid'),
                    dom('div', { class: 'grid grid-cols-2 gap-4' },

                        // Show Grid Toggle
                        label('Show Grid', dom('input', {
                            type: 'checkbox',
                            checked: s.grid.show,
                            onChange: (e) => this.update('grid.show', e.target.checked)
                        })),

                        // Grid Color
                        dom('div', { class: 'flex items-center gap-2' },
                            dom('span', { class: 'text-xs text-gray-400' }, 'Color'),
                            dom('input', {
                                type: 'color',
                                value: s.grid.color,
                                class: 'bg-transparent h-6 w-8 cursor-pointer',
                                onInput: (e) => this.update('grid.color', e.target.value)
                            })
                        ),

                        // Opacity Slider
                        dom('div', { class: 'col-span-2' },
                            dom('div', { class: 'flex justify-between text-xs text-gray-400 mb-1' },
                                dom('span', {}, 'Opacity'),
                                dom('span', {}, Math.round(s.grid.opacity * 100) + '%')
                            ),
                            dom('input', {
                                type: 'range', min: 0, max: 1, step: 0.1, value: s.grid.opacity,
                                style: { width: '100%' },
                                onInput: (e) => {
                                    this.update('grid.opacity', parseFloat(e.target.value));
                                    // Quick hack to update the % label instantly
                                    e.target.previousSibling.lastChild.innerText = Math.round(e.target.value * 100) + '%';
                                }
                            })
                        ),

                        // Major Lines (Select)
                        dom('div', {},
                            smallLabel('Major Lines (Ruler)'),
                            dom('select', {
                                class: 'w-full bg-neutral-700 text-white text-xs rounded px-2 py-1 border-none outline-none',
                                onChange: (e) => this.update('grid.major', parseInt(e.target.value))
                            },
                                dom('option', { value: 0, selected: s.grid.major === 0 }, 'None'),
                                dom('option', { value: 8, selected: s.grid.major === 8 }, 'Every 8px'),
                                dom('option', { value: 16, selected: s.grid.major === 16 }, 'Every 16px'),
                                dom('option', { value: 32, selected: s.grid.major === 32 }, 'Every 32px')
                            )
                        ),

                        // Major Color
                        dom('div', { class: 'flex items-center gap-2 mt-5' },
                            dom('span', { class: 'text-xs text-gray-400' }, 'Major Color'),
                            dom('input', {
                                type: 'color',
                                value: s.grid.majorColor,
                                class: 'bg-transparent h-6 w-8 cursor-pointer',
                                onInput: (e) => this.update('grid.majorColor', e.target.value)
                            })
                        )
                    )
                ),

                // --- SECTION: BACKGROUND ---
                dom('div', {},
                    sectionTitle('Canvas Background'),
                    dom('div', { class: 'grid grid-cols-2 gap-4' },

                        // Style Select
                        dom('div', {},
                            smallLabel('Style'),
                            dom('select', {
                                class: 'w-full bg-neutral-700 text-white text-xs rounded px-2 py-1 border-none outline-none',
                                onChange: (e) => this.update('background.style', e.target.value)
                            },
                                dom('option', { value: 'checker', selected: s.background.style === 'checker' }, 'Checkerboard'),
                                dom('option', { value: 'dots', selected: s.background.style === 'dots' }, 'Polka Dots'),
                                dom('option', { value: 'solid', selected: s.background.style === 'solid' }, 'Solid Color')
                            )
                        ),

                        // Motion Select
                        dom('div', {},
                            smallLabel('Motion'),
                            dom('select', {
                                class: 'w-full bg-neutral-700 text-white text-xs rounded px-2 py-1 border-none outline-none',
                                onChange: (e) => this.update('background.mode', e.target.value)
                            },
                                dom('option', { value: 'static', selected: s.background.mode === 'static' }, 'Static (Screen)'),
                                dom('option', { value: 'panned', selected: s.background.mode === 'panned' }, 'Panned (World)')
                            )
                        ),

                        // Color A
                        dom('div', { class: 'flex items-center gap-2' },
                            dom('span', { class: 'text-xs text-gray-400' }, 'Color A'),
                            dom('input', {
                                type: 'color', value: s.background.color1, class: 'bg-transparent h-6 w-8 cursor-pointer',
                                onInput: (e) => this.update('background.color1', e.target.value)
                            })
                        ),

                        // Color B
                        dom('div', { class: 'flex items-center gap-2' },
                            dom('span', { class: 'text-xs text-gray-400' }, 'Color B'),
                            dom('input', {
                                type: 'color', value: s.background.color2, class: 'bg-transparent h-6 w-8 cursor-pointer',
                                onInput: (e) => this.update('background.color2', e.target.value)
                            })
                        ),

                        // Size Slider
                        dom('div', { class: 'col-span-2' },
                            dom('div', { class: 'flex justify-between text-xs text-gray-400 mb-1' },
                                dom('span', {}, 'Pattern Size'),
                                dom('span', {}, s.background.size + 'px')
                            ),
                            dom('input', {
                                type: 'range', min: 5, max: 100, step: 1, value: s.background.size,
                                style: { width: '100%' },
                                onInput: (e) => {
                                    this.update('background.size', parseInt(e.target.value));
                                    e.target.previousSibling.lastChild.innerText = e.target.value + 'px';
                                }
                            })
                        )
                    )
                )
            )
        );

        this.modal.appendChild(content);
    }
}