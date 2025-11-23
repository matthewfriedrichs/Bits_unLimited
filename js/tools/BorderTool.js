import BaseTool from './BaseTool.js';
import { AddBorderCommand, UpdateBorderCommand, DeleteBorderCommand } from '../commands/BorderCommands.js';
import { ToolIcon, ToolSidebar } from '../ui/components/ToolDef.js';

export default class BorderTool extends BaseTool {
    // ... constructor and iconDef ...
    constructor(app) {
        super(app);
        this.selectedBorderId = null;
        this.dragMode = null;
        this.dragStart = null;
        this.initialState = null;
        this.creationCurrent = null;
        this.lastClickTime = 0;
        this.lastClickId = null;
    }

    get iconDef() {
        return new ToolIcon({
            icon: 'crop-alt',
            label: 'Border & Regions',
            color: 'text-yellow-400',
            hotkey: 'M'
        });
    }

    get sidebarDef() {
        const ui = new ToolSidebar();
        const projectService = this.app.services.get('project');
        const project = projectService.activeProject;

        if (!project) return ui;
        const frame = project.frames[project.currentFrameIndex];
        if (!frame) return ui;

        const borders = frame.borders || [];
        const selected = borders.find(b => b.id === this.selectedBorderId);

        if (selected) {
            ui.addHeader('Properties');
            ui.addInput({ id: 'name', label: 'Name', value: selected.name || 'Region', placeholder: 'Region Name' });
            ui.addColor({ id: 'color', label: 'Color', value: selected.color || '#0ea5e9' });

            ui.addHeader('Geometry');
            ui.addInput({ id: 'x', label: 'X', type: 'number', value: selected.x });
            ui.addInput({ id: 'y', label: 'Y', type: 'number', value: selected.y });
            ui.addInput({ id: 'w', label: 'Width', type: 'number', value: selected.w });
            ui.addInput({ id: 'h', label: 'Height', type: 'number', value: selected.h });

            ui.addHeader('Configuration');
            ui.addSelect({
                id: 'type', label: 'Type', value: selected.type,
                options: [
                    { id: 'viewport', label: 'Viewport' },
                    { id: 'effect', label: 'Effect Zone' },
                    { id: 'mask', label: 'Mask' }
                ]
            });

            if (selected.type === 'effect') {
                // DYNAMIC EFFECT LOADING
                const effectService = this.app.services.get('effects');
                const effectOptions = [
                    { id: 'none', label: 'None' },
                    ...effectService.getAvailableEffects().map(e => ({ id: e.id, label: e.name }))
                ];

                ui.addSelect({
                    id: 'effect', label: 'Effect', value: selected.effect || 'none',
                    options: effectOptions
                });

                // NEW: Add Slider for Wave Effect
                if (selected.effect === 'wave') {
                    ui.addSlider({
                        id: 'effectValue',
                        label: 'Phase',
                        min: 0,
                        max: 100,
                        value: selected.effectValue || 0,
                        step: 1
                    });
                }
            }

            ui.addButton({ label: 'Delete Region', icon: 'trash', action: () => this.deleteSelected() });
        } else {
            ui.addCustom(() => {
                const d = document.createElement('div');
                d.className = "text-neutral-500 text-xs italic p-2 text-center";
                d.innerText = "Double-click Left: Rename\nDouble-click Right: Change Type";
                return d;
            });
        }
        return ui;
    }

    // ... setSetting, deleteSelected, and interaction methods remain unchanged ...
    setSetting(key, val) {
        if (this.selectedBorderId) {
            const projectService = this.app.services.get('project');
            const project = projectService.activeProject;
            if (!project) return;

            const frame = project.frames[project.currentFrameIndex];
            if (!frame || !frame.borders) return;

            const oldBorder = frame.borders.find(b => b.id === this.selectedBorderId);

            if (oldBorder) {
                const newBorder = { ...oldBorder, [key]: val };
                this.app.services.get('history').execute(new UpdateBorderCommand(this.app, oldBorder, newBorder));
            }
        }
    }

    // ... (Keep deleteSelected, onPointerDown, onPointerMove, onPointerUp, renameBorder, cycleBorderType, onRender) ...
    // I will omit them for brevity as they are unchanged from the previous fix.
    deleteSelected() {
        if (this.selectedBorderId) {
            this.app.services.get('history').execute(new DeleteBorderCommand(this.app, this.selectedBorderId));
            this.selectedBorderId = null;
            this.app.bus.emit('cmd:setToolSetting', { toolId: 'frame' });
        }
    }
    // ... (Interaction logic from previous turn) ...
    onPointerDown(p) {
        const projectService = this.app.services.get('project');
        const project = projectService.activeProject;
        if (!project) return;
        const frame = project.frames[project.currentFrameIndex];
        if (!frame) return;
        const borders = frame.borders || (frame.border ? [frame.border] : []);
        const cam = this.app.store.get('camera');
        const handleSize = 10 / cam.zoom;
        const now = Date.now();
        let clickedBody = null;
        for (let i = borders.length - 1; i >= 0; i--) {
            const b = borders[i];
            if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
                clickedBody = b;
                break;
            }
        }
        if (clickedBody && this.lastClickId === clickedBody.id && (now - this.lastClickTime < 300)) {
            const midX = clickedBody.x + (clickedBody.w / 2);
            if (p.x < midX) this.renameBorder(clickedBody);
            else this.cycleBorderType(clickedBody);
            this.lastClickId = null; this.lastClickTime = 0; this.dragMode = null;
            return;
        }
        this.lastClickTime = now; this.lastClickId = clickedBody ? clickedBody.id : null;
        for (let i = borders.length - 1; i >= 0; i--) {
            const b = borders[i];
            if (Math.abs(p.x - (b.x + b.w)) < handleSize && Math.abs(p.y - (b.y + b.h)) < handleSize) {
                this.selectedBorderId = b.id; this.dragMode = 'resize'; this.initialState = { ...b }; this.dragStart = { x: p.x, y: p.y };
                this.app.bus.emit('cmd:setToolSetting', { toolId: 'frame' }); return;
            }
        }
        if (clickedBody) {
            this.selectedBorderId = clickedBody.id; this.dragMode = 'move'; this.initialState = { ...clickedBody }; this.dragStart = { x: p.x, y: p.y };
            this.app.bus.emit('cmd:setToolSetting', { toolId: 'frame' }); return;
        }
        this.selectedBorderId = null; this.dragMode = 'create'; this.dragStart = { x: p.x, y: p.y };
        this.app.bus.emit('cmd:setToolSetting', { toolId: 'frame' });
    }
    onPointerMove(p) {
        if (!this.dragMode) return;
        const projectService = this.app.services.get('project');
        if (!projectService.activeProject) return;
        const dx = Math.round(p.x - this.dragStart.x);
        const dy = Math.round(p.y - this.dragStart.y);
        if (this.dragMode === 'create') {
            this.creationCurrent = { x: p.x, y: p.y };
            this.app.bus.emit('render', this.app.ctx);
            return;
        }
        const newRect = { ...this.initialState };
        if (this.dragMode === 'resize') {
            newRect.w = Math.max(1, this.initialState.w + dx);
            newRect.h = Math.max(1, this.initialState.h + dy);
        } else if (this.dragMode === 'move') {
            newRect.x = this.initialState.x + dx;
            newRect.y = this.initialState.y + dy;
        }
        projectService.updateBorder(newRect);
    }
    onPointerUp(p) {
        const projectService = this.app.services.get('project');
        if (this.dragMode === 'create') {
            const w = Math.round(p.x - this.dragStart.x); const h = Math.round(p.y - this.dragStart.y);
            if (Math.abs(w) > 2 && Math.abs(h) > 2) {
                const finalX = w < 0 ? p.x : this.dragStart.x;
                const finalY = h < 0 ? p.y : this.dragStart.y;
                const newBorder = {
                    id: Math.random().toString(36).substr(2, 9),
                    name: 'New Region',
                    type: 'effect',
                    x: finalX, y: finalY, w: Math.abs(w), h: Math.abs(h),
                    effect: 'none', color: '#0ea5e9'
                };
                this.app.services.get('history').execute(new AddBorderCommand(this.app, newBorder));
                this.selectedBorderId = newBorder.id;
                this.app.bus.emit('cmd:setToolSetting', { toolId: 'frame' });
            }
        } else if (this.initialState) {
            const project = projectService.activeProject;
            if (project) {
                const frame = project.frames[project.currentFrameIndex];
                const finalBorder = frame.borders.find(b => b.id === this.selectedBorderId);
                if (finalBorder && JSON.stringify(this.initialState) !== JSON.stringify(finalBorder)) {
                    this.app.services.get('history').execute(new UpdateBorderCommand(this.app, this.initialState, finalBorder));
                }
            }
        }
        this.dragMode = null; this.initialState = null; this.dragStart = null; this.creationCurrent = null;
        this.app.bus.emit('render', this.app.ctx);
    }
    renameBorder(b) {
        const name = prompt("Rename Region:", b.name);
        if (name && name !== b.name) {
            const newBorder = { ...b, name };
            this.app.services.get('history').execute(new UpdateBorderCommand(this.app, b, newBorder));
            this.app.bus.emit('cmd:setToolSetting', { toolId: 'frame' });
        }
    }
    cycleBorderType(b) {
        const types = ['viewport', 'effect', 'mask'];
        const nextIndex = (types.indexOf(b.type) + 1) % types.length;
        const newType = types[nextIndex];
        const newBorder = { ...b, type: newType };
        if (newType === 'effect' && !newBorder.effect) newBorder.effect = 'pixelate';
        if (newType === 'viewport') newBorder.effect = null;
        this.app.services.get('history').execute(new UpdateBorderCommand(this.app, b, newBorder));
        this.app.bus.emit('cmd:setToolSetting', { toolId: 'frame' });
        this.app.bus.emit('render', this.app.ctx);
    }
    onRender(ctx) {
        const projectService = this.app.services.get('project');
        const project = projectService.activeProject;
        if (!project) return;
        const frame = project.frames[project.currentFrameIndex];
        if (!frame) return;
        const borders = frame.borders || (frame.border ? [frame.border] : []);
        const cam = this.app.store.get('camera');
        const zoom = cam.zoom;
        ctx.save();
        borders.forEach(b => {
            const isSelected = b.id === this.selectedBorderId;
            const color = b.color || (b.type === 'viewport' ? '#444444' : '#0ea5e9');
            ctx.strokeStyle = isSelected ? '#fbbf24' : color;
            ctx.lineWidth = (isSelected ? 2 : 1) / zoom;
            ctx.setLineDash(b.type === 'effect' ? [4 / zoom, 4 / zoom] : []);
            ctx.strokeRect(b.x, b.y, b.w, b.h);
            if (zoom > 4) { ctx.fillStyle = isSelected ? '#fbbf24' : color; ctx.font = `${10 / zoom}px monospace`; ctx.fillText(b.name || b.type, b.x, b.y - (4 / zoom)); }
            if (isSelected) { this._drawHandle(ctx, b.x + b.w, b.y + b.h, zoom, '#fbbf24'); }
        });
        if (this.dragMode === 'create' && this.creationCurrent) {
            const w = this.creationCurrent.x - this.dragStart.x;
            const h = this.creationCurrent.y - this.dragStart.y;
            ctx.strokeStyle = '#fff'; ctx.setLineDash([4 / zoom, 4 / zoom]); ctx.lineWidth = 1 / zoom;
            ctx.strokeRect(this.dragStart.x, this.dragStart.y, w, h);
            this._drawHUD(ctx, this.creationCurrent.x + (10 / zoom), this.creationCurrent.y + (10 / zoom), zoom, `W: ${Math.abs(w)}  H: ${Math.abs(h)}`);
        }
        if (this.selectedBorderId && this.dragMode) {
            const b = borders.find(border => border.id === this.selectedBorderId);
            if (b) {
                if (this.dragMode === 'move') { this._drawHUD(ctx, b.x, b.y - (20 / zoom), zoom, `X: ${b.x}  Y: ${b.y}`); }
                else if (this.dragMode === 'resize') { this._drawHUD(ctx, b.x + b.w + (10 / zoom), b.y + b.h, zoom, `W: ${b.w}  H: ${b.h}`); }
            }
        }
        ctx.restore();
    }
    _drawHandle(ctx, x, y, zoom, color) { const size = 6 / zoom; ctx.fillStyle = color; ctx.fillRect(x - size / 2, y - size / 2, size, size); ctx.strokeStyle = '#000'; ctx.lineWidth = 1 / zoom; ctx.strokeRect(x - size / 2, y - size / 2, size, size); }
    _drawHUD(ctx, x, y, zoom, text) { ctx.font = `${12 / zoom}px monospace`; const padding = 4 / zoom; const width = ctx.measureText(text).width + (padding * 2); const height = (14 / zoom) + (padding * 2); ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'; ctx.fillRect(x, y, width, height); ctx.strokeStyle = '#555'; ctx.lineWidth = 1 / zoom; ctx.strokeRect(x, y, width, height); ctx.fillStyle = '#fff'; ctx.textBaseline = 'top'; ctx.fillText(text, x + padding, y + padding); }
}