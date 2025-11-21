import DomBuilder from '../utils/DomBuilder.js';
const dom = DomBuilder.create;

export default class AnimationUIPlugin {
    init(app) {
        this.app = app;
        this.list = document.getElementById('frames-list');
        this.draggedFrameIndex = null;

        // Layout Fix
        const header = this.list.previousElementSibling;
        if (header) {
            header.classList.remove('justify-between');
            header.classList.add('justify-start', 'gap-4');
            const titleSpan = header.querySelector('span');
            const buttonsDiv = header.querySelector('div.flex');
            if (titleSpan && buttonsDiv) header.insertBefore(buttonsDiv, titleSpan);
        }

        this.bindBtn('add-frame-btn', () => app.bus.emit('addFrame'));
        this.bindBtn('dup-frame-btn', () => app.bus.emit('duplicateFrame'));
        this.bindBtn('play-btn', () => this.togglePlay());
        this.bindBtn('onion-btn', () => app.bus.emit('toggleOnionSkin'));

        this.playBtn = document.getElementById('play-btn');
        this.onionBtn = document.getElementById('onion-btn');

        this.isPlaying = false;
        this.timer = null;

        app.bus.on('cmd_TogglePlay', () => this.togglePlay());
        app.bus.on('dataChanged', (state) => this.renderUI(state));
        app.bus.on('onionSkinChanged', (enabled) => {
            if (this.onionBtn) this.onionBtn.className = enabled ? 'text-sky-400 hover:text-sky-300' : 'text-neutral-500 hover:text-white';
        });
    }

    bindBtn(id, action) {
        const btn = document.getElementById(id);
        if (btn) btn.onclick = action;
    }

    togglePlay() {
        this.isPlaying = !this.isPlaying;
        this.playBtn.innerHTML = '';
        this.playBtn.appendChild(DomBuilder.icon(this.isPlaying ? 'pause text-green-400' : 'play'));

        if (this.isPlaying) {
            this.timer = setInterval(() => {
                const frames = this.app.dataAccess.frames;
                const current = this.app.dataAccess.currentFrameIndex;
                if (frames.length > 0) {
                    const next = (current + 1) % frames.length;
                    this.app.bus.emit('selectFrame', next);
                }
            }, 200);
        } else {
            clearInterval(this.timer);
        }
    }

    renderUI(state) {
        this.list.innerHTML = '';
        if (!state || !state.frames) return;

        state.frames.forEach((frame, index) => {
            const isActive = index === state.currentFrame;

            const el = dom('div', {
                class: `min-w-[60px] h-16 bg-neutral-800 rounded flex items-center justify-center cursor-pointer border-2 transition shrink-0 select-none ${isActive ? 'border-yellow-500 bg-neutral-700' : 'border-neutral-700 hover:bg-neutral-700'}`,
                draggable: true,

                // Drag Start
                ondragstart: (e) => {
                    this.draggedFrameIndex = index;
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', index.toString()); // REQUIRED
                    requestAnimationFrame(() => el.classList.add('opacity-50'));
                },

                // Drag End
                ondragend: (e) => {
                    el.classList.remove('opacity-50');
                    this.draggedFrameIndex = null;
                    Array.from(this.list.children).forEach(c => c.style.transform = 'none');
                },

                // Drag Over
                ondragover: (e) => {
                    e.preventDefault(); // Essential
                    if (this.draggedFrameIndex === null || this.draggedFrameIndex === index) return;
                    e.dataTransfer.dropEffect = 'move';
                    el.style.transform = 'scale(0.90)'; // Visual feedback
                },

                // Drag Leave
                ondragleave: () => {
                    el.style.transform = 'none';
                },

                // Drop
                ondrop: (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    el.style.transform = 'none';

                    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));

                    if (!isNaN(fromIndex) && fromIndex !== index) {
                        this.app.bus.emit('cmd_ReorderFrames', {
                            fromIndex: fromIndex,
                            toIndex: index
                        });
                    }
                },

                onClick: () => this.app.bus.emit('selectFrame', index)
            },
                dom('span', { class: "text-xs text-neutral-400 pointer-events-none" }, index + 1)
            );

            this.list.appendChild(el);
        });
    }
}