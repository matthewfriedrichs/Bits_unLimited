export default class HistoryService {
    init(app) {
        this.app = app;
        this.undoStack = [];
        this.redoStack = [];
        this.maxHistory = 50;

        // Listen for standard commands
        this.app.bus.on('cmd:undo', () => this.undo());
        this.app.bus.on('cmd:redo', () => this.redo());

        // Other services will call this directly: history.push(new Command(...))
    }

    execute(command) {
        command.execute();
        this.undoStack.push(command);

        // Clear Redo stack on new action
        this.redoStack = [];

        // Limit size
        if (this.undoStack.length > this.maxHistory) {
            this.undoStack.shift();
        }

        console.log(`[History] Executed ${command.constructor.name}`);
    }

    undo() {
        if (this.undoStack.length === 0) return;

        const command = this.undoStack.pop();
        command.undo();
        this.redoStack.push(command);

        this.app.bus.emit('render', this.app.ctx);
    }

    redo() {
        if (this.redoStack.length === 0) return;

        const command = this.redoStack.pop();
        command.execute();
        this.undoStack.push(command);

        this.app.bus.emit('render', this.app.ctx);
    }
}