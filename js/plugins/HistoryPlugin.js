export default class HistoryPlugin {
    init(app) {
        this.app = app;
        this.historyMap = new Map();
        this.currentBatch = null;
        this.isUndoing = false;

        // --- EVENT LISTENERS ---
        this.app.bus.on('pointerDown', () => this.startBatch());
        this.app.bus.on('transactionEnd', () => this.endBatch());
        this.app.bus.on('cmd_StartBatch', () => this.startBatch());

        this.app.bus.on('pixelChangeApplied', c => this.recordPixelChange(c));
        this.app.bus.on('cmd_AddLayer', d => this.addAction('ADD_LAYER', d, { id: d.id }));
        this.app.bus.on('cmd_DeleteLayer', d => this.addAction('DELETE_LAYER', { id: d.id }, d));
        this.app.bus.on('cmd_AddFrame', d => this.addAction('ADD_FRAME', d, { index: d.index }));
        this.app.bus.on('cmd_BrushProp', d => this.addAction('BRUSH_PROP', d.newVal, d.oldVal));
        this.app.bus.on('cmd_PaletteChange', d => this.addAction('PALETTE_MOD', d.newVal, d.oldVal));

        // NEW: Selection Buffer History
        this.app.bus.on('cmd_RecordFloat', (data) => {
            // data = { buffer, selection }
            this.addAction('SELECTION_FLOAT', data, null);
        });

        this.app.bus.on('cmd_Undo', () => this.undo());
        this.app.bus.on('cmd_Redo', () => this.redo());

        const undoBtn = document.getElementById('undo-btn');
        const redoBtn = document.getElementById('redo-btn');
        if (undoBtn) undoBtn.onclick = () => this.undo();
        if (redoBtn) redoBtn.onclick = () => this.redo();
    }

    // ... (get activeHist, startBatch, endBatch, recordPixelChange, addAction, undo, redo remain the same) ...
    get activeHist() {
        const id = this.app.dataAccess.activeProjectId;
        if (!id) return null;
        if (!this.historyMap.has(id)) {
            this.historyMap.set(id, { undo: [], redo: [] });
        }
        return this.historyMap.get(id);
    }

    startBatch() { if (this.isUndoing) return; this.currentBatch = []; }
    endBatch() {
        if (this.isUndoing || !this.currentBatch || this.currentBatch.length === 0) return;
        this.addAction('PIXEL_BATCH', this.currentBatch, null);
        this.currentBatch = null;
    }
    recordPixelChange(change) {
        if (this.isUndoing) return;
        if (this.currentBatch) this.currentBatch.push(change);
        else this.addAction('PIXEL_BATCH', [change], null);
    }
    addAction(type, doData, undoData) {
        if (this.isUndoing) return;
        const hist = this.activeHist;
        if (!hist) return;
        hist.undo.push({ type, doData, undoData });
        hist.redo = [];
        if (hist.undo.length > 50) hist.undo.shift();
        console.log(`History: Added ${type}`);
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
                // ... (Same as before) ...
                const pixels = isUndo
                    ? action.doData.map(p => ({ x: p.x, y: p.y, color: p.oldColor, erase: p.oldColor === null, layerId: p.layerId, frameIndex: p.frameIndex })).reverse()
                    : action.doData.map(p => ({ x: p.x, y: p.y, color: p.newColor, erase: p.newColor === null, layerId: p.layerId, frameIndex: p.frameIndex }));
                this.app.bus.emit('requestBatchPixels', pixels);
                const mainFrame = pixels[0]?.frameIndex;
                if (mainFrame !== undefined && mainFrame !== this.app.dataAccess.currentFrameIndex) {
                    this.app.bus.emit('selectFrame', mainFrame);
                }
                break;

            case 'SELECTION_FLOAT':
                // NEW: Handle Floating Buffer
                this.app.bus.emit('toolChanged', 'select'); // Ensure Select Tool is active
                if (isUndo) {
                    // Undo Creation = Destroy Buffer
                    this.app.bus.emit('cmd_ClearFloat');
                } else {
                    // Redo Creation = Restore Buffer
                    this.app.bus.emit('cmd_RestoreFloat', action.doData);
                }
                break;

            case 'ADD_LAYER':
                if (isUndo) this.app.bus.emit('deleteLayer', data.id);
                else this.app.bus.emit('addLayer', data);
                break;
            case 'DELETE_LAYER':
                if (isUndo) this.app.bus.emit('addLayer', { restoreData: data });
                else this.app.bus.emit('deleteLayer', data.id);
                break;
            case 'ADD_FRAME':
                if (isUndo) this.app.bus.emit('deleteFrame', data.index);
                else this.app.bus.emit('addFrame', data);
                break;
            case 'BRUSH_PROP':
                this.app.state.activeBrush = { ...data };
                this.app.bus.emit('refreshBrushUI', data);
                break;
            case 'PALETTE_MOD':
                this.app.state.currentPalette = [...data];
                this.app.bus.emit('refreshPaletteUI', data);
                break;
        }
    }
}