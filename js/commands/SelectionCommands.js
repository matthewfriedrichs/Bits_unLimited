import Command from '../core/Command.js';

// Moves pixels FROM the layer INTO the floating buffer (Cut/Move)
export class LiftSelectionCommand extends Command {
    constructor(app, selectionRect, pixels) {
        super(app);
        this.selectionRect = selectionRect; // {x, y, w, h}
        this.pixels = pixels; // Array of {x, y, color} from the layer
        this.projectService = app.services.get('project');
        this.toolService = app.services.get('tools');
    }

    execute() {
        const selectTool = this.toolService.tools['select'];
        if (!selectTool) return;

        // 1. Create Floating Buffer in Tool
        // Transform absolute pixels to relative buffer pixels
        const buffer = this.pixels.map(p => ({
            relX: p.x - this.selectionRect.x,
            relY: p.y - this.selectionRect.y,
            color: p.color
        }));
        
        selectTool.setFloatingBuffer(buffer, this.selectionRect);

        // 2. Erase pixels from the Layer (Model)
        // We don't use PixelBatchCommand here to avoid double-history entries; 
        // this command handles the erasure atomically.
        this.pixels.forEach(p => {
            this.projectService.setPixel({
                x: p.x, y: p.y, color: null, erase: true
            }, false); // false = no event emission loop
        });

        // 3. Force switch to Select Tool
        this.app.store.set('primaryTool', 'select');
        this.app.bus.emit('render', this.app.ctx);
    }

    undo() {
        const selectTool = this.toolService.tools['select'];
        
        // 1. Restore pixels to Layer
        this.pixels.forEach(p => {
            this.projectService.setPixel({
                x: p.x, y: p.y, color: p.color
            }, false);
        });

        // 2. Clear Floating Buffer
        if (selectTool) selectTool.clearSelection();
        
        this.app.bus.emit('render', this.app.ctx);
    }
}

// Stamps the floating buffer ONTO the layer (Paste/Commit)
export class AnchorSelectionCommand extends Command {
    constructor(app, anchorPos, buffer) {
        super(app);
        this.anchorPos = anchorPos; // {x, y} (Top-Left of destination)
        this.buffer = buffer;       // Array of {relX, relY, color}
        
        this.projectService = app.services.get('project');
        this.toolService = app.services.get('tools');
        
        // We calculate the "pixels under the stamp" at execution time or constructor?
        // Constructor is safer for deterministic Undo.
        this.pixelsOverwritten = []; 
        this.captureOverwrittenPixels();
    }

    captureOverwrittenPixels() {
        this.buffer.forEach(p => {
            const absX = this.anchorPos.x + p.relX;
            const absY = this.anchorPos.y + p.relY;
            const oldColor = this.projectService.getPixelColor(absX, absY);
            this.pixelsOverwritten.push({ x: absX, y: absY, color: oldColor });
        });
    }

    execute() {
        const selectTool = this.toolService.tools['select'];

        // 1. Draw Buffer onto Layer
        this.buffer.forEach(p => {
            const absX = this.anchorPos.x + p.relX;
            const absY = this.anchorPos.y + p.relY;
            this.projectService.setPixel({ x: absX, y: absY, color: p.color }, false);
        });

        // 2. Clear Tool State
        if (selectTool) selectTool.clearSelection();
        
        this.app.bus.emit('render', this.app.ctx);
    }

    undo() {
        const selectTool = this.toolService.tools['select'];

        // 1. Restore overwritten pixels
        this.pixelsOverwritten.forEach(p => {
            this.projectService.setPixel({ x: p.x, y: p.y, color: p.color, erase: p.color === null }, false);
        });

        // 2. Restore Floating Buffer in Tool (so user can try placing it again)
        if (selectTool) {
            // We need to reconstruct the selection rect based on anchor
            // This assumes the buffer determines the size.
            // (Simplified for brevity, ideally we track the exact rect size too)
            let maxX = 0, maxY = 0;
            this.buffer.forEach(p => {
                if(p.relX > maxX) maxX = p.relX;
                if(p.relY > maxY) maxY = p.relY;
            });
            
            const rect = { x: this.anchorPos.x, y: this.anchorPos.y, w: maxX + 1, h: maxY + 1 };
            selectTool.setFloatingBuffer(this.buffer, rect);
        }

        this.app.bus.emit('render', this.app.ctx);
    }
}