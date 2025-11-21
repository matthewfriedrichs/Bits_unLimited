import DomBuilder from '../utils/DomBuilder.js';
const dom = DomBuilder.create;
import ColorUtils from '../utils/ColorUtils.js';

export default class FileManagerPlugin {
    init(app) {
        this.app = app;
        this.btn = document.getElementById('file-menu-btn');
        this.menu = document.getElementById('file-dropdown');

        // -- 1. Setup Project Load Input --
        this.projectInput = document.getElementById('load-project-input');
        if (this.projectInput) {
            this.projectInput.onchange = (e) => {
                if (e.target.files.length > 0) {
                    this.loadProject(e.target.files[0]);
                }
            };
        }

        // -- 2. Setup Image Import Input --
        this.imageInput = dom('input', {
            type: 'file',
            accept: 'image/*',
            class: 'hidden',
            onChange: (e) => {
                if (e.target.files.length > 0) {
                    // No screen pos = center of screen
                    this.handleImageUpload(e.target.files[0], null);
                }
            }
        });
        document.body.appendChild(this.imageInput);

        // -- 3. Menu Logic --
        if (this.btn && this.menu) {
            this.btn.onclick = (e) => {
                e.stopPropagation();
                this.menu.classList.toggle('hidden');
                this.menu.classList.toggle('flex');
            };
            window.addEventListener('click', () => {
                this.menu.classList.add('hidden');
                this.menu.classList.remove('flex');
            });
        }

        const bind = (id, fn) => {
            const el = document.getElementById(id);
            if (el) el.onclick = fn;
        };

        bind('save-project-btn', () => this.saveProject());
        bind('export-png-btn', () => this.exportPNG());
        bind('export-sheet-btn', () => this.exportSpritesheet());
        bind('export-quick-btn', () => this.saveProject());

        // Inject Import Button
        if (!document.getElementById('import-img-btn') && this.menu) {
            const importBtn = dom('button', {
                id: 'import-img-btn',
                class: "text-left px-4 py-3 hover:bg-neutral-700 text-sm text-gray-200 border-b border-neutral-700 flex items-center gap-3",
                onClick: () => this.imageInput.click()
            }, DomBuilder.icon('file-image', 'text-neutral-400'), "Import Image");

            const openLabel = this.menu.querySelector('label');
            if (openLabel) this.menu.insertBefore(importBtn, openLabel.nextSibling);
        }

        // -- 4. Drag & Drop --
        this.initDragAndDrop();
    }

    initDragAndDrop() {
        const body = document.body;

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            body.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });

        body.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files && files.length > 0) {
                const file = files[0];
                if (file.type.startsWith('image/')) {
                    // Capture drop coordinates for precise placement
                    this.handleImageUpload(file, { x: e.clientX, y: e.clientY });
                } else if (file.name.endsWith('.json')) {
                    this.loadProject(file);
                }
            }
        });
    }

    handleImageUpload(file, dropScreenPos = null) {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => this.importImagePixels(img, dropScreenPos);
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);

        this.imageInput.value = '';
    }

    importImagePixels(img, dropScreenPos) {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, img.width, img.height).data;
        const pixels = [];

        // Track Content Bounds (To calculate exact visual center)
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        for (let i = 0; i < imageData.length; i += 4) {
            const a = imageData[i + 3];
            if (a > 10) {
                const r = imageData[i];
                const g = imageData[i + 1];
                const b = imageData[i + 2];
                const hex = ColorUtils.rgbToHex(r, g, b);

                const x = (i / 4) % img.width;
                const y = Math.floor((i / 4) / img.width);

                // Track bounds
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;

                // Store raw relative to image (0,0)
                pixels.push({ relX: x, relY: y, color: hex });
            }
        }

        if (pixels.length > 0) {
            let anchor = null;

            if (dropScreenPos) {
                // CASE A: Drag & Drop (Align Image Top-Left to Cursor)
                const worldPos = this.app.screenToWorld(dropScreenPos.x, dropScreenPos.y);

                // The SelectTool pastes centered on the anchor.
                // We want Image(0,0) to be at WorldPos.
                // The content's Top-Left is at Image(minX, minY).
                // So Content Top-Left should be at WorldPos + (minX, minY).

                const contentWidth = maxX - minX + 1;
                const contentHeight = maxY - minY + 1;

                // Anchor = DesiredContentTopLeft + ContentSize/2
                anchor = {
                    x: Math.floor(worldPos.x + minX + contentWidth / 2),
                    y: Math.floor(worldPos.y + minY + contentHeight / 2)
                };
            } else {
                // CASE B: Dropdown (Center on Screen)
                // Passing null tells SelectTool to calculate the screen center itself.
                anchor = null;
            }

            // 3. Send to Select Tool
            this.app.bus.emit('cmd_PasteBuffer', { buffer: pixels, anchor });
            console.log(`Imported image: ${pixels.length} pixels.`);
        }
    }

    // --- PROJECT LOGIC (Unchanged) ---
    saveProject() {
        if (!this.app.dataAccess || !this.app.dataAccess.activeProject) {
            alert("No project to save.");
            return;
        }
        const data = this.app.dataAccess.getSnapshot();
        const serializable = {
            name: data.projectName,
            frames: data.frames.map(f => ({ layers: f.layers.map(l => ({ ...l, data: Array.from(l.data.entries()) })), border: f.border })),
            palette: data.palette,
            currentFrame: data.currentFrame,
            activeLayerId: data.activeLayerId
        };
        const blob = new Blob([JSON.stringify(serializable)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `${data.projectName}.json`; a.click();

        const activeId = this.app.dataAccess.activeProjectId;
        this.app.bus.emit('projectSaved', activeId);
    }

    loadProject(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const raw = JSON.parse(e.target.result);
                if (!raw.frames || !Array.isArray(raw.frames)) throw new Error("Invalid file format");

                const restored = {
                    name: file.name.replace('.json', ''),
                    frames: raw.frames.map(f => ({
                        layers: f.layers.map(l => ({ ...l, data: new Map(l.data) })),
                        border: f.border || { x: 0, y: 0, w: 32, h: 32 }
                    })),
                    palette: raw.palette,
                    currentFrame: raw.currentFrame || 0,
                    activeLayerId: raw.activeLayerId
                };
                this.app.bus.emit('loadProject', restored);
            } catch (err) {
                console.error(err);
                alert('Invalid Project File');
            }
            if (this.projectInput) this.projectInput.value = '';
        };
        reader.readAsText(file);
    }

    exportPNG() {
        if (!this.app.dataAccess.activeProject) return;
        const frame = this.app.dataAccess.frames[this.app.dataAccess.currentFrameIndex];
        this._renderAndDownload([frame], 'image.png');
    }

    exportSpritesheet() {
        if (!this.app.dataAccess.activeProject) return;
        this._renderAndDownload(this.app.dataAccess.frames, 'spritesheet.png', true);
    }

    _renderAndDownload(frames, name, isSheet = false) {
        if (frames.length === 0) return;
        const w = frames[0].border.w, h = frames[0].border.h;
        const canvas = document.createElement('canvas'); canvas.width = isSheet ? w * frames.length : w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        frames.forEach((frame, i) => {
            const offsetX = isSheet ? i * w : 0;
            frame.layers.forEach(layer => {
                if (!layer.visible) return;
                for (const [key, color] of layer.data) {
                    const [x, y] = key.split(',').map(Number);
                    if (x >= frame.border.x && x < frame.border.x + frame.border.w && y >= frame.border.y && y < frame.border.y + frame.border.h) {
                        ctx.fillStyle = color; ctx.fillRect(x - frame.border.x + offsetX, y - frame.border.y, 1, 1);
                    }
                }
            });
        });
        const url = canvas.toDataURL(); const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    }
}