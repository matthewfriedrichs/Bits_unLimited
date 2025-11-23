import BaseTool from './BaseTool.js';
import { ToolIcon } from '../ui/components/ToolDef.js';

export default class EyedropperTool extends BaseTool {
    get iconDef() {
        return new ToolIcon({
            icon: 'eye-dropper',
            label: 'Eyedropper',
            color: 'text-fuchsia-400',
            hotkey: 'I'
        });
    }

    // No settings panel needed for eyedropper

    onPointerDown(p) {
        this.pick(p);
    }

    onPointerMove(p) {
        this.pick(p);
    }

    pick(p) {
        if (p.originalEvent && p.originalEvent.buttons !== 1) return;
        const color = this.app.services.get('project').getPixelColor(p.x, p.y);
        if (color) {
            this.app.store.set('primaryColor', color);
        }
    }
}