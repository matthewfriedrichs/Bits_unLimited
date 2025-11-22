import DomBuilder from '../utils/DomBuilder.js';
const dom = DomBuilder.create;

export default class SettingsUI {
    init(app) {
        this.app = app;
        this.store = app.store;
        
        this.btn = document.getElementById('settings-menu-btn');
        this.modal = document.getElementById('settings-modal');

        if (this.btn) this.btn.onclick = () => this.openModal();
    }

    openModal() {
        this.renderModal();
        this.modal.classList.remove('hidden');
    }

    closeModal() {
        this.modal.classList.add('hidden');
    }

    update(path, val) {
        // Store handles deep updates
        this.store.update(path, val);
        
        // Force re-render of canvas to see changes immediately
        this.app.bus.emit('render', this.app.ctx);
    }

    renderModal() {
        this.modal.innerHTML = '';
        const s = this.store.get('settings');

        // --- Helpers ---
        const sectionTitle = (t) => dom('h4', { class: 'text-xs uppercase text-sky-500 font-bold mb-3 border-b border-neutral-700 pb-1' }, t);
        const label = (t, ...c) => dom('label', { class: 'flex items-center gap-2 text-sm text-gray-300 cursor-pointer' }, ...c, t);
        const smallLabel = (t) => dom('span', { class: 'text-xs text-gray-400 block mb-1' }, t);

        const content = dom('div', { class: 'bg-neutral-800 w-full max-w-md rounded-xl shadow-2xl border border-neutral-700 overflow-hidden flex flex-col' },
            
            // Header
            dom('div', { class: 'flex justify-between items-center p-4 bg-neutral-900 border-b border-neutral-700' },
                dom('h3', { class: 'font-bold text-neutral-200' }, DomBuilder.icon('cog', 'mr-2'), 'Interface Settings'),
                dom('button', { class: 'text-neutral-400 hover:text-white', onClick: () => this.closeModal() }, DomBuilder.icon('times'))
            ),

            // Body
            dom('div', { class: 'p-6 flex flex-col gap-6' },

                // Grid Section
                dom('div', {},
                    sectionTitle('Pixel Grid'),
                    dom('div', { class: 'grid grid-cols-2 gap-4' },
                        label('Show Grid', dom('input', { type: 'checkbox', checked: s.grid.show, onChange: (e) => this.update('settings.grid.show', e.target.checked) })),
                        
                        dom('div', { class: 'flex items-center gap-2' },
                            dom('span', { class: 'text-xs text-gray-400' }, 'Color'),
                            dom('input', { type: 'color', value: s.grid.color, class: 'bg-transparent h-6 w-8 cursor-pointer', onInput: (e) => this.update('settings.grid.color', e.target.value) })
                        ),

                        dom('div', { class: 'col-span-2' },
                            dom('div', { class: 'flex justify-between text-xs text-gray-400 mb-1' }, dom('span', {}, 'Opacity'), dom('span', {}, Math.round(s.grid.opacity * 100) + '%')),
                            dom('input', { type: 'range', min: 0, max: 1, step: 0.1, value: s.grid.opacity, style: { width: '100%' }, onInput: (e) => {
                                this.update('settings.grid.opacity', parseFloat(e.target.value));
                                e.target.previousSibling.lastChild.innerText = Math.round(e.target.value * 100) + '%';
                            }})
                        )
                    )
                ),

                // Background Section
                dom('div', {},
                    sectionTitle('Canvas Background'),
                    dom('div', { class: 'grid grid-cols-2 gap-4' },
                        dom('div', {},
                            smallLabel('Style'),
                            dom('select', { class: 'w-full bg-neutral-700 text-white text-xs rounded px-2 py-1', onChange: (e) => this.update('settings.background.style', e.target.value) },
                                dom('option', { value: 'checker', selected: s.background.style === 'checker' }, 'Checkerboard'),
                                dom('option', { value: 'dots', selected: s.background.style === 'dots' }, 'Polka Dots'),
                                dom('option', { value: 'solid', selected: s.background.style === 'solid' }, 'Solid Color')
                            )
                        ),
                        
                        dom('div', { class: 'flex items-center gap-2 mt-4' },
                             dom('span', { class: 'text-xs text-gray-400' }, 'Color 1'),
                             dom('input', { type: 'color', value: s.background.color1, class: 'bg-transparent h-6 w-8 cursor-pointer', onInput: (e) => this.update('settings.background.color1', e.target.value) })
                        ),

                         dom('div', { class: 'col-span-2' },
                            dom('div', { class: 'flex justify-between text-xs text-gray-400 mb-1' }, dom('span', {}, 'Size'), dom('span', {}, s.background.size + 'px')),
                            dom('input', { type: 'range', min: 5, max: 100, step: 1, value: s.background.size, style: { width: '100%' }, onInput: (e) => {
                                this.update('settings.background.size', parseInt(e.target.value));
                                e.target.previousSibling.lastChild.innerText = e.target.value + 'px';
                            }})
                        )
                    )
                )
            )
        );
        
        this.modal.appendChild(content);
    }
}