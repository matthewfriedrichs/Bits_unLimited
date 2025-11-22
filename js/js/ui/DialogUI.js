import DomBuilder from '../utils/DomBuilder.js';
const dom = DomBuilder.create;

export default class DialogUI {
    init(app) {
        this.app = app;
        this.bus = app.bus;
        this.pendingCloseId = null;

        // UI Elements
        this.projNameSpan = dom('span', { class: 'text-white font-mono' });

        const cancelBtn = dom('button', {
            class: 'px-4 py-2 rounded text-sm font-medium text-neutral-300 hover:text-white hover:bg-neutral-700 transition',
            onClick: () => this.hide()
        }, 'Cancel');

        const confirmBtn = dom('button', {
            class: 'px-4 py-2 rounded text-sm font-bold text-white bg-rose-600 hover:bg-rose-500 transition shadow-lg shadow-rose-900/20',
            onClick: () => this.confirm()
        }, 'Close Project');

        // Modal Overlay
        this.overlay = dom('div', { class: 'fixed inset-0 bg-black/80 z-[100] hidden flex items-center justify-center p-4 backdrop-blur-sm' },
            dom('div', { class: 'bg-neutral-800 w-full max-w-sm rounded-xl shadow-2xl border border-neutral-700 overflow-hidden animate-bounce-in' },
                dom('div', { class: 'p-5 text-center' },
                    // Icon
                    dom('div', { class: 'w-12 h-12 rounded-full bg-amber-900/50 text-amber-500 flex items-center justify-center mx-auto mb-4' },
                        DomBuilder.icon('exclamation-triangle', 'text-xl')
                    ),
                    // Title
                    dom('h3', { class: 'text-lg font-bold text-white mb-2' }, 'Unsaved Changes'),
                    // Body
                    dom('p', { class: 'text-neutral-400 text-sm mb-6' },
                        "Project ", this.projNameSpan, " has unsaved changes. Are you sure you want to close it?"
                    ),
                    // Buttons
                    dom('div', { class: 'flex gap-3 justify-center' }, cancelBtn, confirmBtn)
                )
            )
        );

        document.body.appendChild(this.overlay);

        // Listen for the request from ProjectService
        this.bus.on('requestCloseConfirmation', (data) => this.show(data));
    }

    show({ id, name }) {
        this.pendingCloseId = id;
        this.projNameSpan.innerText = `"${name}"`;
        this.overlay.classList.remove('hidden');
        this.overlay.classList.add('flex');
    }

    hide() {
        this.pendingCloseId = null;
        this.overlay.classList.add('hidden');
        this.overlay.classList.remove('flex');
    }

    confirm() {
        if (this.pendingCloseId) {
            // Resend command with force: true
            this.bus.emit('cmd:closeProject', { id: this.pendingCloseId, force: true });
        }
        this.hide();
    }
}