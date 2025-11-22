import Storage from '../utils/Storage.js';

export default class AutoSaveService {
    init(app) {
        this.app = app;
        this.store = app.store;
        this.bus = app.bus;
        this.storage = new Storage(); // Uses existing utils/Storage.js
        this.debounceTimer = null;
        this.AUTOSAVE_KEY = 'current_project_v2'; // Bump version for new format

        // 1. Attempt to restore previous session on startup
        this.restoreSession();

        // 2. Listen for signals that data changed
        const schedule = () => this.scheduleSave();

        this.bus.on('data:pixelsChanged', schedule); // Drawing
        this.bus.on('state:currentPalette', schedule); // Palette
        this.bus.on('stateChanged', (e) => {
            // Structure changes (Layers, Frames) trigger a full project list update
            if (e.key === 'projects') schedule();
        });
    }

    async restoreSession() {
        try {
            const data = await this.storage.load(this.AUTOSAVE_KEY);
            if (data && data.frames && data.frames.length > 0) {
                console.log("[AutoSave] Session restored.");
                this.bus.emit('loadProject', data); // Handled by FileService -> ProjectService
            }
        } catch (e) {
            // No save found, that's fine
        }
    }

    scheduleSave() {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        // Wait 1 second of inactivity before writing to disk
        this.debounceTimer = setTimeout(() => this.save(), 1000);
    }

    async save() {
        // We need to serialize the active project exactly like FileService does
        const project = this.store.activeProject;
        if (!project) return;

        // We save a snapshot similar to the JSON export, 
        // but we can keep Maps if IndexedDB supports structured clone (modern browsers do).
        // However, to be safe and consistent with FileService, let's serialize.
        
        const serializable = {
            name: project.name,
            frames: project.frames.map(f => ({
                layers: f.layers.map(l => ({ ...l, data: Array.from(l.data.entries()) })),
                border: f.border
            })),
            palette: project.palette,
            currentFrame: project.currentFrameIndex,
            activeLayerId: project.activeLayerId
        };

        try {
            await this.storage.save(this.AUTOSAVE_KEY, serializable);
            console.log(`[AutoSave] Saved ${project.name}`);
        } catch (err) {
            console.error("[AutoSave] Failed", err);
        }
    }
}