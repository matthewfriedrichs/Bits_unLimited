import DomBuilder from '../utils/DomBuilder.js';
const dom = DomBuilder.create;

export default class FileMenuUI {
    init(app) {
        this.app = app;
        this.bus = app.bus;

        // 1. Bind to Existing DOM Elements
        this.btn = document.getElementById('file-menu-btn');
        this.menu = document.getElementById('file-dropdown');
        this.quickSaveBtn = document.getElementById('export-quick-btn');
        
        // 2. Create Hidden Inputs
        this.createInputs();

        // 3. Bind Events
        this.bindEvents();

        // 4. Drag & Drop Support
        this.initDragAndDrop();
    }

    createInputs() {
        // Project Load Input
        this.projectInput = document.getElementById('load-project-input');
        // If not in HTML, create it
        if (!this.projectInput) {
            this.projectInput = dom('input', { type: 'file', accept: '.json', class: 'hidden' });
            document.body.appendChild(this.projectInput);
        }

        // Image Import Input
        this.imageInput = dom('input', { type: 'file', accept: 'image/*', class: 'hidden' });
        document.body.appendChild(this.imageInput);
    }

    bindEvents() {
        // Toggle Menu
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

        // Quick Save
        if (this.quickSaveBtn) {
            this.quickSaveBtn.onclick = () => this.bus.emit('cmd:saveProject');
        }

        // Menu Items
        const bind = (id, eventName) => {
            const el = document.getElementById(id);
            if (el) el.onclick = () => this.bus.emit(eventName);
        };

        bind('save-project-btn', 'cmd:saveProject');
        bind('export-png-btn', 'cmd:exportPNG');
        bind('export-sheet-btn', 'cmd:exportSheet');

        // Inputs
        this.projectInput.onchange = (e) => {
            if (e.target.files.length > 0) {
                this.bus.emit('cmd:loadProjectFile', e.target.files[0]);
                this.projectInput.value = '';
            }
        };

        this.imageInput.onchange = (e) => {
            if (e.target.files.length > 0) {
                this.bus.emit('cmd:importImageFile', { file: e.target.files[0], dropPos: null });
                this.imageInput.value = '';
            }
        };

        // Add Import Button dynamically if missing
        if (this.menu && !document.getElementById('import-img-btn')) {
            const importBtn = dom('button', {
                id: 'import-img-btn',
                class: "text-left px-4 py-3 hover:bg-neutral-700 text-sm text-gray-200 border-b border-neutral-700 flex items-center gap-3",
                onClick: () => this.imageInput.click()
            }, DomBuilder.icon('file-image', 'text-neutral-400'), "Import Image");

            const openLabel = this.menu.querySelector('label'); // The 'Open Project' label
            if (openLabel) this.menu.insertBefore(importBtn, openLabel.nextSibling);
        }
    }

    initDragAndDrop() {
        const body = document.body;
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(e => {
            body.addEventListener(e, (ev) => { ev.preventDefault(); ev.stopPropagation(); }, false);
        });

        body.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files && files.length > 0) {
                const file = files[0];
                if (file.type.startsWith('image/')) {
                    this.bus.emit('cmd:importImageFile', { 
                        file: file, 
                        dropPos: { x: e.clientX, y: e.clientY } 
                    });
                } else if (file.name.endsWith('.json')) {
                    this.bus.emit('cmd:loadProjectFile', file);
                }
            }
        });
    }
}