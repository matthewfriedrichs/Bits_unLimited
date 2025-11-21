import BaseTool from './BaseTool.js';

export default class FrameTool extends BaseTool {
    constructor(app) {
        super(app);
        this.isResizing = false;
        this.isMoving = false;
        this.dragStart = null;
        this.initialRect = null;
    }

    onPointerDown(p) {
        const frame = this.app.dataAccess.frames[this.app.dataAccess.currentFrameIndex];
        const b = frame.border;
        const handleSize = 0.5;

        // Resize Handle (Bottom-Right)
        if (Math.abs(p.x - (b.x + b.w)) < handleSize && Math.abs(p.y - (b.y + b.h)) < handleSize) {
            this.isResizing = true;
        } 
        // Move Body
        else if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
            this.isMoving = true;
        }

        this.dragStart = { x: p.x, y: p.y };
        this.initialRect = { ...b };
    }

    onPointerMove(p) {
        if (!this.isResizing && !this.isMoving) return;

        const dx = Math.round(p.x - this.dragStart.x);
        const dy = Math.round(p.y - this.dragStart.y);
        const newRect = { ...this.initialRect };

        if (this.isResizing) {
            newRect.w = Math.max(1, this.initialRect.w + dx);
            newRect.h = Math.max(1, this.initialRect.h + dy);
        } else if (this.isMoving) {
            newRect.x = this.initialRect.x + dx;
            newRect.y = this.initialRect.y + dy;
        }

        this.app.bus.emit('updateFrameBorder', newRect);
    }

    onPointerUp(p) {
        this.isResizing = false;
        this.isMoving = false;
    }
}