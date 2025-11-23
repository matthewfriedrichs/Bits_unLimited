import Command from '../core/Command.js';

export class AddLayerCommand extends Command {
    constructor(app, name) {
        super(app);
        this.name = name || 'New Layer';
        this.layerId = Math.random().toString(36).substr(2, 9); // Generate ID once
        this.projectService = app.services.get('project');
    }

    execute() {
        // We call a specialized method on ProjectService that accepts an ID
        this.projectService.createLayerWithId(this.layerId, this.name);
    }

    undo() {
        this.projectService.deleteLayer(this.layerId);
    }
}

export class DeleteLayerCommand extends Command {
    constructor(app, layerId) {
        super(app);
        this.layerId = layerId;
        this.projectService = app.services.get('project');
        this.backupLayer = null;
        this.backupIndex = -1;
    }

    execute() {
        // Save state before deleting
        const project = this.projectService.activeProject;
        const frame = project.frames[project.currentFrameIndex];
        const layer = frame.layers.find(l => l.id === this.layerId);
        
        if (layer) {
            // Clone the layer data so we can restore it
            this.backupLayer = JSON.parse(JSON.stringify({
                ...layer,
                data: Array.from(layer.data.entries()) // Serialize Map
            }));
            this.backupIndex = frame.layers.findIndex(l => l.id === this.layerId);
            
            this.projectService.deleteLayer(this.layerId);
        }
    }

    undo() {
        if (this.backupLayer && this.backupIndex !== -1) {
            // Hydrate Map
            const restoredData = new Map(this.backupLayer.data);
            const layerObj = { ...this.backupLayer, data: restoredData };
            
            this.projectService.restoreLayer(layerObj, this.backupIndex);
        }
    }
}