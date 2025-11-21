export default class ShortcutPlugin {
    init(app) {
        this.app = app;

        this.shortcuts = [
            // Tools
            { key: 'KeyB', action: () => this.setTool('pen') },
            { key: 'KeyE', action: () => this.setTool('eraser') },
            { key: 'KeyG', action: () => this.setTool('bucket') },
            { key: 'KeyF', action: () => this.setTool('bucket') },
            { key: 'KeyS', action: () => this.setTool('select') }, 
            { key: 'KeyI', action: () => this.setTool('eyedropper') },
            { key: 'KeyP', action: () => this.setTool('pan') },
            { key: 'KeyM', action: () => this.setTool('frame') },

            // History
            { key: 'KeyZ', ctrl: true, shift: false, action: () => this.app.bus.emit('cmd_Undo') },
            { key: 'KeyZ', ctrl: true, shift: true, action: () => this.app.bus.emit('cmd_Redo') },
            { key: 'KeyY', ctrl: true, action: () => this.app.bus.emit('cmd_Redo') },

            // Clipboard (NEW)
            { key: 'KeyC', ctrl: true, action: () => { this.app.bus.emit('cmd_Copy'); return true; } },
            { key: 'KeyV', ctrl: true, action: () => { this.app.bus.emit('cmd_Paste'); return true; } },
            { key: 'KeyJ', ctrl: true, action: () => { this.app.bus.emit('cmd_Duplicate'); return true; } }, // Ctrl+J is standard in Layer-based apps
            // Ctrl+D is often "Deselect", but we can map it to duplicate if you prefer.
            // { key: 'KeyD', ctrl: true, action: () => { this.app.bus.emit('cmd_Duplicate'); return true; } },

            // File / Animation
            { key: 'ArrowLeft', action: () => this.prevFrame() },
            { key: 'ArrowRight', action: () => this.nextFrame() },
            { key: 'Space', action: () => this.app.bus.emit('cmd_TogglePlay') },
            { key: 'KeyS', ctrl: true, action: () => { this.app.bus.emit('cmd_Save'); return true; } }
        ];

        window.addEventListener('keydown', (e) => this.handleKey(e));
    }

    // ... (handleKey, setTool, prevFrame, nextFrame remain the same) ...
    handleKey(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        const match = this.shortcuts.find(s => {
            const kMatch = s.key === e.code;
            const cMatch = !!s.ctrl === (e.ctrlKey || e.metaKey);
            const sMatch = !!s.shift === e.shiftKey;
            return kMatch && cMatch && sMatch;
        });
        if (match) {
            const preventDefault = match.action();
            if (preventDefault !== false) e.preventDefault();
        }
    }

    setTool(id) {
        this.app.bus.emit('toolChanged', id);
    }

    prevFrame() {
        const current = this.app.dataAccess.currentFrameIndex;
        const total = this.app.dataAccess.frames.length;
        const prev = (current - 1 + total) % total;
        this.app.bus.emit('selectFrame', prev);
    }

    nextFrame() {
        const current = this.app.dataAccess.currentFrameIndex;
        const total = this.app.dataAccess.frames.length;
        const next = (current + 1) % total;
        this.app.bus.emit('selectFrame', next);
    }
}