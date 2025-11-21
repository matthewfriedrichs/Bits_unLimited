import Storage from '../utils/Storage.js';

export default class AutoSavePlugin {
    init(app) {
        this.app = app;
        this.storage = new Storage();
        this.debounceTimer = null;
        this.AUTOSAVE_KEY = 'current_project_v1';

        // 1. Attempt to restore previous session on startup
        this.restoreSession();

        // 2. Listen for ANY change that modifies data
        // We debounce this so we don't write to disk 60 times a second while drawing
        const schedule = () => this.scheduleSave();

        this.app.bus.on('dataChanged', schedule);        // Layer/Frame structure changes
        this.app.bus.on('pixelChangeApplied', schedule); // Actual drawing changes
        this.app.bus.on('cmd_PaletteChange', schedule);  // Palette changes
    }

    async restoreSession() {
        try {
            const data = await this.storage.load(this.AUTOSAVE_KEY);
            if (data && data.frames && data.frames.length > 0) {
                console.log("AutoSave: Session restored.");
                // IndexedDB supports structured cloning, so Maps are preserved!
                // We can pass the data directly to the app.
                this.app.bus.emit('loadProject', data);
            }
        } catch (e) {
            console.log("AutoSave: No previous session found.");
        }
    }

    scheduleSave() {
        // Cancel previous timer if it exists (Debouncing)
        if (this.debounceTimer) clearTimeout(this.debounceTimer);

        // Wait 1 second after the LAST action before saving
        this.debounceTimer = setTimeout(() => this.save(), 1000);
    }

    async save() {
        // Get the raw state snapshot
        const data = this.app.dataAccess.getSnapshot();

        try {
            await this.storage.save(this.AUTOSAVE_KEY, data);
            // Optional: Visual feedback (console for now)
            console.log(`AutoSave: Saved at ${new Date().toLocaleTimeString()}`);
        } catch (err) {
            console.error("AutoSave: Failed to save", err);
        }
    }
}