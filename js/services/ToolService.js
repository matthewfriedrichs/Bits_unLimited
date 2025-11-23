export default class ToolService {
    constructor() {
        this.tools = {};
        this.currentToolId = null;
        this.clipboard = null;
        this.isPanning = false;
        this.lastPanPos = null;
    }

    init(app) {
        this.app = app;
        this.bus = app.bus;
        this.store = app.store;

        // Input
        this.bus.on('input:pointerDown', p => this.handlePointerDown(p));
        this.bus.on('input:pointerMove', p => this.handlePointerMove(p));
        this.bus.on('input:pointerUp', p => this.handlePointerUp(p));
        this.bus.on('render', ctx => this.delegateRender(ctx));

        // State Listeners (Internal Reaction)
        this.bus.on('state:primaryTool', (id) => this._activateTool(id));
        this.bus.on('state:secondaryTool', (id) => this._activateTool(id));

        // --- TOOL COMMANDS (External Control) ---

        // 1. Switch Tool
        this.bus.on('cmd:selectTool', ({ id, isSecondary }) => {
            const target = isSecondary ? 'secondaryTool' : 'primaryTool';
            this.store.set(target, id);
        });

        // 2. Change Mode
        this.bus.on('cmd:toggleToolMode', (toolId) => {
            const tool = this.tools[toolId];
            if (tool && tool.toggleMode) tool.toggleMode();
        });

        this.bus.on('cmd:setToolMode', ({ toolId, mode }) => {
            const tool = this.tools[toolId];
            if (tool && tool.setMode) tool.setMode(mode);
        });

        // 3. Change Settings
        this.bus.on('cmd:setToolSetting', ({ toolId, setting, value }) => {
            const tool = this.tools[toolId];
            if (tool && tool.setSetting) tool.setSetting(setting, value);
        });

        // Clipboard
        this.bus.on('cmd:copy', () => this.handleCopy());
        this.bus.on('cmd:cut', () => this.handleCut());
        this.bus.on('cmd:paste', () => this.handlePaste());
        this.bus.on('cmd:duplicate', () => this.handleDuplicate());

        this._activateTool(this.store.get('primaryTool'));
    }

    register(id, toolInstance) {
        this.tools[id] = toolInstance;
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
        Object.values(this.tools).forEach(tool => {
            if (tool.onRender) tool.onRender(ctx);
        });
    }

    _activateTool(id) {
        const tool = this.tools[id];
        if (tool && tool.onActivate) tool.onActivate();
    }

    // --- Clipboard ---

    handleCopy() {
        let tool = this.tools[this.store.get('primaryTool')];
        let data = tool && tool.copy ? tool.copy() : null;
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
        let tool = this.tools[this.store.get('primaryTool')];
        if (tool && tool.copy) {
            let data = tool.copy();
            if (data) {
                this.clipboard = data;
                if (tool.deleteSelection) tool.deleteSelection();
                return;
            }
        }
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
            if (pId !== 'select' && sId !== 'select') {
                this.store.set('primaryTool', 'select');
            }
            this.bus.emit('cmd:pasteBuffer', { buffer: this.clipboard, anchor: null });
        }
    }

    handleDuplicate() {
        let tool = this.tools[this.store.get('primaryTool')];
        let data = tool && tool.copy ? tool.copy() : null;
        let sourceTool = tool;

        if (!data) {
            tool = this.tools[this.store.get('secondaryTool')];
            data = tool && tool.copy ? tool.copy() : null;
            sourceTool = tool;
        }

        if (data) {
            let anchor = null;
            if (sourceTool && sourceTool.selection) {
                const s = sourceTool.selection;
                anchor = {
                    x: Math.floor(s.x + s.w / 2) + 10,
                    y: Math.floor(s.y + s.h / 2) + 10
                };
            }
            const pId = this.store.get('primaryTool');
            const sId = this.store.get('secondaryTool');
            if (pId !== 'select' && sId !== 'select') {
                this.store.set('primaryTool', 'select');
            }
            this.bus.emit('cmd:pasteBuffer', { buffer: data, anchor: anchor });
        }
    }
}