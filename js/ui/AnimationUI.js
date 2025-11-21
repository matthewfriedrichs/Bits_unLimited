import DomBuilder from '../utils/DomBuilder.js';
const dom = DomBuilder.create;

export default class AnimationUI {
    init(app) {
        this.app = app;
        this.bus = app.bus;
        this.store = app.store;

        this.list = document.getElementById('frames-list');
        this.playBtn = document.getElementById('play-btn');
        this.onionBtn = document.getElementById('onion-btn');
        this.draggedIndex = null;
        this.isPlaying = false;
        this.timer = null;

        // Bind Static Buttons
        const bind = (id, fn) => {
            const el = document.getElementById(id);
            if (el) el.onclick = fn;
        };

        bind('add-frame-btn', () => this.bus.emit('cmd:addFrame'));
        bind('dup-frame-btn', () => this.bus.emit('cmd:duplicateFrame'));
        bind('play-btn', () => this.togglePlay());
        // bind('onion-btn', () => this.bus.emit('cmd:toggleOnionSkin')); 

        // Listen for changes
        this.bus.on('stateChanged', (e) => {
            if (e.key === 'projects' || e.key === 'activeProjectId') {
                this.render();
            }
        });

        this.render();
    }

    togglePlay() {
        this.isPlaying = !this.isPlaying;
        this.playBtn.innerHTML = '';
        this.playBtn.appendChild(DomBuilder.icon(this.isPlaying ? 'pause text-green-400' : 'play'));

        if (this.isPlaying) {
            this.timer = setInterval(() => {
                const proj = this.store.activeProject;
                if (proj && proj.frames.length > 1) {
                    const next = (proj.currentFrameIndex + 1) % proj.frames.length;
                    this.bus.emit('cmd:selectFrame', next);
                }
            }, 200); // 5 FPS default
        } else {
            clearInterval(this.timer);
        }
    }

    render() {
        this.list.innerHTML = '';
        const proj = this.store.activeProject;
        if (!proj) return;

        proj.frames.forEach((frame, index) => {
            const isActive = index === proj.currentFrameIndex;

            // --- Drag & Drop Logic ---
            const onDragStart = (e) => {
                this.draggedIndex = index;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', index.toString());
                e.target.style.opacity = '0.5';
            };

            const onDragEnd = (e) => {
                e.target.style.opacity = '1';
                this.draggedIndex = null;
            };

            const onDragOver = (e) => {
                e.preventDefault();
                if (this.draggedIndex === index) return;
                e.dataTransfer.dropEffect = 'move';

                // Calculate direction for visual feedback (Horizontal List)
                // If dragging from left (0) to right (2), we insert AFTER the target -> Right Border
                const isMovingRight = this.draggedIndex < index;
                const borderClass = isMovingRight ? 'border-r-4' : 'border-l-4'; // Thicker border for visibility

                const oldClass = e.currentTarget.dataset.borderClass;
                if (oldClass && oldClass !== borderClass) {
                    e.currentTarget.classList.remove(oldClass);
                }

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
                if (!isNaN(fromIndex) && fromIndex !== index) {
                    this.bus.emit('cmd:reorderFrames', { from: fromIndex, to: index });
                }
            };

            const el = dom('div', {
                class: `min-w-[60px] h-16 bg-neutral-800 rounded flex items-center justify-center cursor-pointer border-2 transition shrink-0 select-none ${isActive ? 'border-yellow-500 bg-neutral-700' : 'border-neutral-700 hover:bg-neutral-700'}`,
                draggable: 'true', // Fixed: Must be string 'true'

                ondragstart: onDragStart,
                ondragend: onDragEnd,
                ondragover: onDragOver,
                ondragleave: onDragLeave,
                ondrop: onDrop,

                onClick: () => this.bus.emit('cmd:selectFrame', index)
            },
                dom('span', { class: "text-xs text-neutral-400 pointer-events-none" }, index + 1)
            );

            this.list.appendChild(el);
        });
    }
}