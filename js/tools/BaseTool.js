import { ToolIcon, ToolSidebar } from '../ui/components/ToolDef.js';

export default class BaseTool {
    constructor(app) {
        this.app = app;
    }

    // --- UI Configuration ---

    get iconDef() {
        return new ToolIcon({
            icon: 'question-circle',
            label: 'Unknown Tool',
            color: 'text-gray-500'
        });
    }

    get sidebarDef() {
        return new ToolSidebar();
    }

    /**
     * Returns a DOM element to be rendered DIRECTLY in the toolbar, 
     * immediately below the tool's icon.
     * Useful for quick-access widgets like a palette strip.
     * @returns {HTMLElement|null}
     */
    renderToolbarExtension() {
        return null;
    }

    // --- Standard Lifecycle & Events ---

    onDoubleClick() { }
    onActivate() { }
    onDeactivate() { }

    onPointerDown(p) { }
    onPointerMove(p) { }
    onPointerUp(p) { }
    onRender(ctx) { }

    setMode(modeId) { }
    setSetting(key, value) { }
}