import Command from '../core/Command.js';

export class AddBorderCommand extends Command {
    constructor(app, borderData) {
        super(app);
        this.borderData = borderData;
        this.projectService = app.services.get('project');
    }

    execute() {
        // FIX: Call service directly instead of emitting event to prevent recursion
        this.projectService.addBorder(this.borderData);
    }

    undo() {
        this.projectService.deleteBorder(this.borderData.id);
    }
}

export class UpdateBorderCommand extends Command {
    constructor(app, oldBorder, newBorder) {
        super(app);
        this.oldBorder = oldBorder;
        this.newBorder = newBorder;
        this.projectService = app.services.get('project');
    }

    execute() {
        // FIX: Call service directly
        this.projectService.updateBorder(this.newBorder);
    }

    undo() {
        this.projectService.updateBorder(this.oldBorder);
    }
}

export class DeleteBorderCommand extends Command {
    constructor(app, borderId) {
        super(app);
        this.borderId = borderId;
        this.projectService = app.services.get('project');
        this.backupBorder = null;
    }

    execute() {
        const project = this.projectService.activeProject;
        const frame = project.frames[project.currentFrameIndex];
        this.backupBorder = frame.borders.find(b => b.id === this.borderId);

        if (this.backupBorder) {
            // FIX: Call service directly
            this.projectService.deleteBorder(this.borderId);
        }
    }

    undo() {
        if (this.backupBorder) {
            this.projectService.addBorder(this.backupBorder);
        }
    }
}