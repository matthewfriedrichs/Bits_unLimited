export default class HistoryUI {
    init(app) {
        this.bus = app.bus;
        
        const undoBtn = document.getElementById('undo-btn');
        const redoBtn = document.getElementById('redo-btn');

        if (undoBtn) {
            undoBtn.onclick = () => this.bus.emit('cmd:undo');
            // Optional: Listen to history stack changes to disable button if stack empty
        }

        if (redoBtn) {
            redoBtn.onclick = () => this.bus.emit('cmd:redo');
        }
    }
}