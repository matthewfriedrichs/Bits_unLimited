import BaseTool from './BaseTool.js';

export default class EyedropperTool extends BaseTool {
    onPointerDown(p) {
        this.pick(p);
    }

    onPointerMove(p) {
        // Allow dragging to continuously sample colors
        // Check for primary button (1) in bitmask or just existence of pointer
        // In the new Event structure, we trust the event emission
        this.pick(p);
    }

    pick(p) {
        // Only pick if mouse is actually down (tracked by BaseTool or app input)
        // But since onPointerMove is only fired by ToolService when delegated...
        // actually ToolService delegates move regardless of button state.
        // We should check if the button is pressed.

        if (p.originalEvent && p.originalEvent.buttons !== 1) return;

        const color = this.app.services.get('project').getPixelColor(p.x, p.y);

        if (color) {
            // Direct Store Update
            this.app.store.set('primaryColor', color);
        }
    }
}