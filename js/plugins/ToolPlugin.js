import DomBuilder from '../utils/DomBuilder.js';
const dom = DomBuilder.create;

// Tools
import PenTool from '../tools/PenTool.js';
import BucketTool from '../tools/BucketTool.js';
import SelectTool from '../tools/SelectTool.js';
import FrameTool from '../tools/FrameTool.js';
import EyedropperTool from '../tools/EyedropperTool.js';

export default class ToolPlugin {
    init(app) {
        this.app = app;
        this.clipboard = null;
        this.lastWorldPos = null;
        
        // Initialize Tools
        this.tools = {
            'pen': new PenTool(app),
            'eraser': new PenTool(app, true),
            'bucket': new BucketTool(app),
            'select': new SelectTool(app),
            'frame': new FrameTool(app),
            'eyedropper': new EyedropperTool(app),
            'pan': null
        };
        
        this.currentTool = null;

        // --- MOUSE TRACKING ---
        const container = document.getElementById('canvas-container');
        container.addEventListener('pointermove', (e) => {
            this.lastWorldPos = this.app.screenToWorld(e.clientX, e.clientY);
        });
        container.addEventListener('pointerleave', () => { this.lastWorldPos = null; });

        // --- INPUT DELEGATION ---
        app.bus.on('pointerDown', p => this.delegate('onPointerDown', p));
        app.bus.on('pointerDrag', p => this.delegate('onPointerMove', p));
        app.bus.on('pointerUp', p => {
            this.delegate('onPointerUp', p);
            this.app.bus.emit('transactionEnd'); // Critical for History grouping
        });
        app.bus.on('render', ctx => this.delegate('onRender', ctx));

        // --- CLIPBOARD COMMANDS ---
        app.bus.on('cmd_Copy', () => {
            if (this.tools['select'].selection) {
                const data = this.tools['select'].copy();
                if (data) {
                    this.clipboard = data;
                    console.log("Copied pixels:", this.clipboard.length);
                }
            }
        });

        app.bus.on('cmd_Paste', () => {
            if (this.clipboard) {
                this.app.bus.emit('toolChanged', 'select');
                // Paste at cursor if available, otherwise center of screen
                this.tools['select'].paste(this.clipboard, this.lastWorldPos);
            }
        });

        // --- MISSING LISTENER RESTORED HERE ---
        // This allows FileManagerPlugin to send images to the Select Tool
        app.bus.on('cmd_PasteBuffer', ({ buffer, anchor }) => {
            this.app.bus.emit('toolChanged', 'select');
            this.tools['select'].paste(buffer, anchor);
        });
        // --------------------------------------

        app.bus.on('cmd_Duplicate', () => {
            const selTool = this.tools['select'];
            if (selTool.selection) {
                const data = selTool.copy();
                const rect = selTool.normalizeRect(selTool.selection);
                const center = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };

                if (data) {
                    this.app.bus.emit('toolChanged', 'select');
                    selTool.paste(data, center);
                }
            }
        });

        // --- TOOL SWITCHING ---
        app.bus.on('toolChanged', (id) => {
            // Note: We removed the "if (state.tool === id) return" check 
            // to ensure tools initialize correctly on first load.
            
            if (this.currentTool && this.currentTool.onDeactivate) {
                this.currentTool.onDeactivate();
            }
            
            this.app.state.tool = id;
            this.updateToolbarUI();
            
            const toolInstance = this.tools[id];
            if (toolInstance) {
                this.currentTool = toolInstance;
                if (this.currentTool.onActivate) this.currentTool.onActivate();
            } else {
                this.currentTool = null;
            }
        });

        this.renderToolbar();
        
        // Force initialization of the default tool (Pen)
        this.app.bus.emit('toolChanged', 'pen');
    }

    delegate(method, arg) {
        if (this.currentTool && this.currentTool[method]) {
            this.currentTool[method](arg);
        }
    }

    renderToolbar() {
        const sidebar = document.getElementById('left-sidebar');
        let container = document.getElementById('tool-group');
        if (!container) {
            container = dom('div', { id: 'tool-group', class: 'flex flex-col gap-2 mb-4' });
            if(sidebar.firstChild) sidebar.insertBefore(container, sidebar.firstChild);
            else sidebar.appendChild(container);
        }
        container.innerHTML = '';
        
        const tools = [
            {id:'select', icon:'vector-square', color:'text-green-400', key:'(S)'}, 
            {id:'pen', icon:'pen', color:'text-sky-400', key:'(B)'}, 
            {id:'eraser', icon:'eraser', color:'text-rose-400', key:'(E)'}, 
            {id:'bucket', icon:'fill-drip', color:'text-amber-400', key:'(G)'}, 
            {id:'eyedropper', icon:'eye-dropper', color:'text-fuchsia-400', key:'(I)'},
            {id:'pan', icon:'hand-paper', color:'text-neutral-400', key:'(P)'},
            {id:'frame', icon:'crop-alt', color:'text-yellow-400', key:'(M)'}
        ];

        tools.forEach(t => {
            const btn = dom('button', {
                id: `tool-btn-${t.id}`,
                title: `${t.id.charAt(0).toUpperCase() + t.id.slice(1)} ${t.key}`,
                class: `w-10 h-10 rounded bg-neutral-700 hover:bg-neutral-600 flex items-center justify-center transition tool-btn`,
                onClick: () => this.app.bus.emit('toolChanged', t.id)
            }, DomBuilder.icon(t.icon, t.color));
            container.appendChild(btn);
        });
        this.updateToolbarUI();
    }

    updateToolbarUI() {
        const active = this.app.state.tool;
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.classList.remove('ring-2', 'ring-sky-500', 'bg-neutral-600');
            btn.classList.add('bg-neutral-700');
            if (btn.id === `tool-btn-${active}`) {
                btn.classList.remove('bg-neutral-700');
                btn.classList.add('ring-2', 'ring-sky-500', 'bg-neutral-600');
            }
        });
    }
}