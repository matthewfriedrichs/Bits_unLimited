import Command from '../core/Command.js';

export class UpdateFrameBorderCommand extends Command {
    constructor(app, oldRect, newRect) {
        super(app);
        this.oldRect = oldRect;
        this.newRect = newRect;
        this.projectService = app.services.get('project');
    }

    execute() {
        this.projectService.updateFrameBorder(this.newRect);
    }

    undo() {
        this.projectService.updateFrameBorder(this.oldRect);
    }
}