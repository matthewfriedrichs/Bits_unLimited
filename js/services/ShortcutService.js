export default class ShortcutService {
    init(app) {
        this.app = app;
        this.bus = app.bus;
        this.store = app.store;

        this.shortcuts = [
            // Tools
            { key: 'KeyB', action: () => this.store.set('activeTool', 'pen') },
            { key: 'KeyE', action: () => this.store.set('activeTool', 'eraser') },
            { key: 'KeyG', action: () => this.store.set('activeTool', 'bucket') },
            { key: 'KeyS', action: () => this.store.set('activeTool', 'select') },
            { key: 'KeyI', action: () => this.store.set('activeTool', 'eyedropper') },
            { key: 'KeyM', action: () => this.store.set('activeTool', 'frame') },

            // History
            { key: 'KeyZ', ctrl: true, shift: false, action: () => this.bus.emit('cmd:undo') },
            { key: 'KeyZ', ctrl: true, shift: true, action: () => this.bus.emit('cmd:redo') },
            { key: 'KeyY', ctrl: true, action: () => this.bus.emit('cmd:redo') },

            // Clipboard
            { key: 'KeyC', ctrl: true, action: () => { this.bus.emit('cmd:copy'); return true; } },
            { key: 'KeyX', ctrl: true, action: () => { this.bus.emit('cmd:cut'); return true; } },
            { key: 'KeyV', ctrl: true, action: () => { this.bus.emit('cmd:paste'); return true; } },
            { key: 'KeyJ', ctrl: true, action: () => { this.bus.emit('cmd:duplicate'); return true; } },
            // Duplicate mapped to Ctrl+D as well for common habits
            { key: 'KeyD', ctrl: true, action: () => { this.bus.emit('cmd:duplicate'); return true; } },

            // Project
            { key: 'KeyS', ctrl: true, action: () => { this.bus.emit('cmd:saveProject'); return true; } },

            // Animation
            {
                key: 'Space', action: () => {
                    const btn = document.getElementById('play-btn');
                    if (btn) btn.click();
                }
            },

            { key: 'ArrowLeft', action: () => this.navFrame(-1) },
            { key: 'ArrowRight', action: () => this.navFrame(1) }
        ];

        window.addEventListener('keydown', (e) => this.handleKey(e));
    }

    handleKey(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        const match = this.shortcuts.find(s => {
            return s.key === e.code &&
                (!!s.ctrl === (e.ctrlKey || e.metaKey)) &&
                (!!s.shift === e.shiftKey);
        });

        if (match) {
            const preventDefault = match.action();
            if (preventDefault !== false) e.preventDefault();
        }
    }

    navFrame(dir) {
        const proj = this.store.activeProject;
        if (!proj) return;
        const total = proj.frames.length;
        const next = (proj.currentFrameIndex + dir + total) % total;
        this.bus.emit('cmd:selectFrame', next);
    }
}