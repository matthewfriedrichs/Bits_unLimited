export default class ShortcutService {
    init(app) {
        this.app = app;
        this.bus = app.bus;
        this.store = app.store;

        this.shortcuts = [
            // Tools (Shift = Set Secondary)
            { key: 'KeyB', action: (e) => this.setTool('pen', e.shiftKey) },
            { key: 'KeyE', action: (e) => this.setTool('eraser', e.shiftKey) },
            { key: 'KeyG', action: (e) => this.setTool('bucket', e.shiftKey) },
            { key: 'KeyS', action: (e) => this.setTool('select', e.shiftKey) },
            { key: 'KeyI', action: (e) => this.setTool('eyedropper', e.shiftKey) },
            { key: 'KeyM', action: (e) => this.setTool('frame', e.shiftKey) },

            // Quick Slots (1-8)
            { key: 'Digit1', action: () => this.loadQuickSlot(0) },
            { key: 'Digit2', action: () => this.loadQuickSlot(1) },
            { key: 'Digit3', action: () => this.loadQuickSlot(2) },
            { key: 'Digit4', action: () => this.loadQuickSlot(3) },
            { key: 'Digit5', action: () => this.loadQuickSlot(4) },
            { key: 'Digit6', action: () => this.loadQuickSlot(5) },
            { key: 'Digit7', action: () => this.loadQuickSlot(6) },
            { key: 'Digit8', action: () => this.loadQuickSlot(7) },

            // History
            { key: 'KeyZ', ctrl: true, shift: false, action: () => this.bus.emit('cmd:undo') },
            { key: 'KeyZ', ctrl: true, shift: true, action: () => this.bus.emit('cmd:redo') },
            { key: 'KeyY', ctrl: true, action: () => this.bus.emit('cmd:redo') },

            // Clipboard
            { key: 'KeyC', ctrl: true, action: () => { this.bus.emit('cmd:copy'); return true; } },
            { key: 'KeyX', ctrl: true, action: () => { this.bus.emit('cmd:cut'); return true; } },
            { key: 'KeyV', ctrl: true, action: () => { this.bus.emit('cmd:paste'); return true; } },
            { key: 'KeyJ', ctrl: true, action: () => { this.bus.emit('cmd:duplicate'); return true; } },
            { key: 'KeyD', ctrl: true, action: () => { this.bus.emit('cmd:duplicate'); return true; } },

            // Project
            { key: 'KeyS', ctrl: true, action: () => { this.bus.emit('cmd:saveProject'); return true; } },

            // Animation
            { key: 'Space', action: () => { const btn = document.getElementById('play-btn'); if (btn) btn.click(); } },
            { key: 'ArrowLeft', action: () => this.navFrame(-1) },
            { key: 'ArrowRight', action: () => this.navFrame(1) }
        ];

        window.addEventListener('keydown', (e) => this.handleKey(e));
    }

    setTool(id, isSecondary) {
        const target = isSecondary ? 'secondaryTool' : 'primaryTool';
        this.store.set(target, id);
        return true;
    }

    loadQuickSlot(index) {
        const slots = this.store.get('quickSlots');
        if (slots && slots[index]) {
            const s = slots[index];
            this.store.set('primaryTool', s.p);
            this.store.set('secondaryTool', s.s);
            // Visual feedback in console or toast could go here
        }
        return true;
    }

    handleKey(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        const match = this.shortcuts.find(s => {
            return s.key === e.code &&
                (!!s.ctrl === (e.ctrlKey || e.metaKey)) &&
                (!!s.shift === e.shiftKey || s.shift === undefined); // Allow shift if not strictly defined
        });

        if (match) {
            const preventDefault = match.action(e); // Pass Event
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