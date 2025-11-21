import PenTool from '../tools/PenTool.js';
import BucketTool from '../tools/BucketTool.js';
import SelectTool from '../tools/SelectTool.js';
import FrameTool from '../tools/FrameTool.js';
import EyedropperTool from '../tools/EyedropperTool.js';

export default class ToolService {
    init(app) {
        this.app = app;
        this.bus = app.bus;
        this.store = app.store;

        this.tools = {
            'pen': new PenTool(app),
            'eraser': new PenTool(app, true),
            'bucket': new BucketTool(app),
            'select': new SelectTool(app),
            'frame': new FrameTool(app),
            'eyedropper': new EyedropperTool(app)
        };

        this.currentToolId = null;
        this.clipboard = null;
        this.isPanning = false;
        this.lastPanPos = null;

        // Input
        this.bus.on('input:pointerDown', p => this.handlePointerDown(p));
        this.bus.on('input:pointerMove', p => this.handlePointerMove(p));
        this.bus.on('input:pointerUp', p => this.handlePointerUp(p));
        this.bus.on('render', ctx => this.delegateRender(ctx));

        // State Listeners
        this.bus.on('state:primaryTool', (id) => this._activateTool(id));
        this.bus.on('state:secondaryTool', (id) => this._activateTool(id));

        // Mode Toggle Command
        this.bus.on('cmd:toggleToolMode', (toolId) => {
            const tool = this.tools[toolId];
            if (tool && tool.toggleMode) tool.toggleMode();
        });

        // Clipboard
        this.bus.on('cmd:copy', () => this.handleCopy());
        this.bus.on('cmd:cut', () => this.handleCut());
        this.bus.on('cmd:paste', () => this.handlePaste());
        this.bus.on('cmd:duplicate', () => this.handleDuplicate());

        this._activateTool(this.store.get('primaryTool'));
    }

    // --- Input Logic ---

    handlePointerDown(p) {
        if (p.button === 1) {
            this.isPanning = true;
            this.lastPanPos = { x: p.originalEvent.clientX, y: p.originalEvent.clientY };
            return;
        }

        // 0 = Left (Primary), 2 = Right (Secondary)
        let toolId;
        if (p.button === 2) {
            toolId = this.store.get('secondaryTool');
        } else {
            toolId = this.store.get('primaryTool');
        }

        this.currentToolId = toolId;

        const tool = this.tools[toolId];
        if (tool && tool.onPointerDown) {
            tool.onPointerDown(p);
        }
    }

    handlePointerMove(p) {
        if (this.isPanning) {
            const cx = p.originalEvent.clientX;
            const cy = p.originalEvent.clientY;
            const cam = this.store.get('camera');
            cam.x += cx - this.lastPanPos.x;
            cam.y += cy - this.lastPanPos.y;
            this.lastPanPos = { x: cx, y: cy };
            this.store.set('camera', cam);
            return;
        }

        let toolId = this.currentToolId;
        if (p.buttons === 0) {
            toolId = this.store.get('primaryTool');
        }

        const tool = this.tools[toolId];
        if (tool && tool.onPointerMove) {
            tool.onPointerMove(p);
        }
    }

    handlePointerUp(p) {
        if (this.isPanning) {
            this.isPanning = false;
            this.lastPanPos = null;
            return;
        }

        const tool = this.tools[this.currentToolId];
        if (tool && tool.onPointerUp) {
            tool.onPointerUp(p);
        }

        this.bus.emit('cmd:transactionEnd');
        this.currentToolId = null;
    }

    delegateRender(ctx) {
        // Render ALL tools to support secondary tool UI (e.g. Right-click selection box)
        Object.values(this.tools).forEach(tool => {
            if (tool.onRender) tool.onRender(ctx);
        });
    }

    _activateTool(id) {
        const tool = this.tools[id];
        if (tool && tool.onActivate) tool.onActivate();
    }

    // --- Clipboard (Fixed for Secondary Tool) ---

    handleCopy() {
        // Try Primary First
        let tool = this.tools[this.store.get('primaryTool')];
        let data = tool && tool.copy ? tool.copy() : null;

        // If no data (e.g. Pen tool or Empty Selection), try Secondary
        if (!data) {
            tool = this.tools[this.store.get('secondaryTool')];
            data = tool && tool.copy ? tool.copy() : null;
        }

        if (data) {
            this.clipboard = data;
            console.log("Copied", data.length, "pixels");
        }
    }

    handleCut() {
        // Try Primary
        let tool = this.tools[this.store.get('primaryTool')];
        // Check if it CAN copy and IF it has data
        if (tool && tool.copy) {
            let data = tool.copy();
            if (data) {
                this.clipboard = data;
                if (tool.deleteSelection) tool.deleteSelection();
                return;
            }
        }

        // Try Secondary
        tool = this.tools[this.store.get('secondaryTool')];
        if (tool && tool.copy) {
            let data = tool.copy();
            if (data) {
                this.clipboard = data;
                if (tool.deleteSelection) tool.deleteSelection();
            }
        }
    }

    handlePaste() {
        if (this.clipboard) {
            const pId = this.store.get('primaryTool');
            const sId = this.store.get('secondaryTool');

            // If Select tool is not active on EITHER button, assign to Primary
            // If it IS active (e.g. on Right click), just use it as is.
            if (pId !== 'select' && sId !== 'select') {
                this.store.set('primaryTool', 'select');
            }

            this.bus.emit('cmd:pasteBuffer', { buffer: this.clipboard, anchor: null });
        }
    }

    handleDuplicate() {
        // 1. Try Copy from Primary
        let tool = this.tools[this.store.get('primaryTool')];
        let data = tool && tool.copy ? tool.copy() : null;
        let sourceTool = tool;

        // 2. Try Copy from Secondary
        if (!data) {
            tool = this.tools[this.store.get('secondaryTool')];
            data = tool && tool.copy ? tool.copy() : null;
            sourceTool = tool;
        }

        if (data) {
            let anchor = null;

            // If the source was a selection tool, offset the duplicate slightly
            // We check if the source tool has a 'selection' property to confirm
            if (sourceTool && sourceTool.selection) {
                const s = sourceTool.selection;
                anchor = {
                    x: Math.floor(s.x + s.w / 2) + 10,
                    y: Math.floor(s.y + s.h / 2) + 10
                };
            }

            // Ensure Select tool is available to handle the floating buffer
            const pId = this.store.get('primaryTool');
            const sId = this.store.get('secondaryTool');
            if (pId !== 'select' && sId !== 'select') {
                this.store.set('primaryTool', 'select');
            }

            this.bus.emit('cmd:pasteBuffer', { buffer: data, anchor: anchor });
        }
    }
}