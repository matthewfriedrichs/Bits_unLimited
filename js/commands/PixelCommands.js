import Command from '../core/Command.js';

export class PixelBatchCommand extends Command {
    constructor(app, pixels) {
        super(app);
        this.pixels = pixels;
        this.projectService = app.services.get('project');
    }

    execute() {
        // 1. Update Model
        this.pixels.forEach(p => {
            this.projectService.setPixel({
                x: p.x,
                y: p.y,
                color: p.color,
                layerId: p.layerId,
                frameIndex: p.frameIndex,
                erase: p.color === null
            }, false); // false = don't emit individual events
        });

        // 2. Update View (Cache)
        this.app.bus.emit('data:pixelsChanged', { batch: this.pixels });

        // 3. Request Render
        this.app.bus.emit('render', this.app.ctx);
    }

    undo() {
        // 1. Revert Model
        const undoBatch = [];
        for (let i = this.pixels.length - 1; i >= 0; i--) {
            const p = this.pixels[i];
            this.projectService.setPixel({
                x: p.x,
                y: p.y,
                color: p.oldColor,
                layerId: p.layerId,
                frameIndex: p.frameIndex,
                erase: p.oldColor === null
            }, false);

            undoBatch.push({
                ...p,
                color: p.oldColor // Revert
            });
        }

        // 2. Update View (Cache)
        this.app.bus.emit('data:pixelsChanged', { batch: undoBatch });

        // 3. Request Render
        this.app.bus.emit('render', this.app.ctx);
    }
}