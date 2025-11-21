import BaseTool from './BaseTool.js';

export default class EyedropperTool extends BaseTool {
    onPointerDown(p) {
        this.pick(p);
    }

    onPointerMove(p) {
        // Allow dragging to continuously sample colors
        if (this.app.activePointers.size > 0) {
            this.pick(p);
        }
    }

    pick(p) {
        const color = this.app.dataAccess.getPixelColor(p.x, p.y);
        if (color) {
            this.app.bus.emit('colorChange', color);
        }
    }
}