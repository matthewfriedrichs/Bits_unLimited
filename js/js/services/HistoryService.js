export default class HistoryService {
    init(app) {
        this.app = app;
        this.history = new Map();
        this.currentBatch = [];
        this.isUndoing = false;

        this.app.bus.on('cmd:undo', () => this.undo());
        this.app.bus.on('cmd:redo', () => this.redo());

        // FIX: Listen for the Batch event from ProjectService
        this.app.bus.on('data:pixelsChanged', (payload) => {
            if (payload.batch && !this.isUndoing) {
                this.addAction('PIXEL_BATCH', payload.batch, null);
            }
        });

        // Listen for individual pixels (Eraser might still use this)
        this.app.bus.on('pixelChangeApplied', (change) => {
            if (!this.isUndoing) this.currentBatch.push(change);
        });

        this.app.bus.on('cmd:transactionEnd', () => {
            if (this.currentBatch.length > 0 && !this.isUndoing) {
                this.addAction('PIXEL_BATCH', [...this.currentBatch], null);
                this.currentBatch = [];
            }
        });

        this.app.bus.on('cmd:recordFloat', (data) => this.addAction('SELECTION_FLOAT', data, null));
        this.app.bus.on('cmd:clearFloat', () => { }); // Handled by tool
        this.app.bus.on('cmd:addLayer', (d) => this.addAction('ADD_LAYER', d, { id: d.id }));
    }

    // ... (Rest of HistoryService remains mostly the same, just ensuring execute() handles the data correctly) ...
    get activeHist() {
        const id = this.app.store.get('activeProjectId');
        if (!id) return null;
        if (!this.history.has(id)) this.history.set(id, { undo: [], redo: [] });
        return this.history.get(id);
    }

    addAction(type, doData, undoData) {
        if (this.isUndoing) return;
        const hist = this.activeHist;
        if (!hist) return;

        hist.undo.push({ type, doData, undoData });
        hist.redo = [];
        if (hist.undo.length > 50) hist.undo.shift();
    }

    undo() {
        const hist = this.activeHist;
        if (!hist || hist.undo.length === 0) return;

        this.isUndoing = true;
        const action = hist.undo.pop();
        hist.redo.push(action);
        this.execute(action, true);
        this.isUndoing = false;
    }

    redo() {
        const hist = this.activeHist;
        if (!hist || hist.redo.length === 0) return;

        this.isUndoing = true;
        const action = hist.redo.pop();
        hist.undo.push(action);
        this.execute(action, false);
        this.isUndoing = false;
    }

    execute(action, isUndo) {
        const data = isUndo ? action.undoData : action.doData;

        switch (action.type) {
            case 'PIXEL_BATCH':
                // If doData is the batch of deltas, we can derive undo/redo from it
                // doData = [{ x, y, oldColor, newColor }, ...]
                const pixels = isUndo
                    ? action.doData.map(p => ({ ...p, color: p.oldColor, erase: p.oldColor === null })).reverse()
                    : action.doData.map(p => ({ ...p, color: p.newColor, erase: p.newColor === null }));
                this.app.bus.emit('requestBatchPixels', pixels);
                break;

            case 'ADD_LAYER':
                const cmd = isUndo ? 'cmd:deleteLayer' : 'cmd:addLayer';
                this.app.bus.emit(cmd, data);
                break;

            case 'SELECTION_FLOAT':
                this.app.store.set('activeTool', 'select');
                if (isUndo) this.app.bus.emit('cmd:clearFloat');
                else this.app.bus.emit('cmd:restoreFloat', action.doData);
                break;
        }
    }
}