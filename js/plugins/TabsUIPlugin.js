import DomBuilder from '../utils/DomBuilder.js';
const dom = DomBuilder.create;

export default class TabsUIPlugin {
    init(app) {
        this.app = app;
        this.draggedIndex = null;

        // Container
        this.container = dom('div', {
            id: 'tabs-bar',
            class: 'h-9 bg-neutral-900 flex items-end px-2 gap-1 border-b border-neutral-800 overflow-x-auto scrollbar-hide'
        });

        const topBar = document.getElementById('top-bar');
        topBar.parentNode.insertBefore(this.container, topBar.nextSibling);

        app.bus.on('projectListChanged', (projects) => this.render(projects));
        app.bus.on('projectSwitched', (id) => this.updateActive(id));
    }

    render(projects) {
        this.container.innerHTML = '';
        const activeId = this.app.dataAccess.activeProjectId;

        projects.forEach((p, index) => {
            const isActive = p.id === activeId;
            const baseClass = "group flex items-center gap-2 px-3 py-1.5 text-xs rounded-t-md cursor-pointer transition select-none min-w-[100px] max-w-[160px]";
            const activeClass = "bg-neutral-800 text-sky-400 border-t-2 border-sky-500";
            const inactiveClass = "bg-neutral-900 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300 border-t-2 border-transparent";

            const closeBtn = dom('button', {
                class: `hover:text-rose-400 transition ${isActive ? 'text-neutral-500' : 'text-transparent group-hover:text-neutral-500'}`,
                onClick: (e) => { e.stopPropagation(); this.app.bus.emit('cmd_CloseProject', p.id); },
                // Prevent dragstart on the close button
                draggable: true,
                ondragstart: (e) => { e.preventDefault(); e.stopPropagation(); }
            }, DomBuilder.icon('times'));

            const tab = dom('div', {
                class: `${baseClass} ${isActive ? activeClass : inactiveClass}`,
                draggable: true, // Enable Drag

                // --- DRAG LOGIC ---
                ondragstart: (e) => {
                    this.draggedIndex = index;
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', index.toString());
                    tab.style.opacity = '0.5';
                },
                ondragend: (e) => {
                    tab.style.opacity = '1';
                    this.draggedIndex = null;
                },
                ondragover: (e) => {
                    e.preventDefault();
                    if (this.draggedIndex === index) return;
                    e.dataTransfer.dropEffect = 'move';
                },
                ondrop: (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
                    if (!isNaN(fromIndex) && fromIndex !== index) {
                        this.app.bus.emit('cmd_ReorderProjects', { fromIndex, toIndex: index });
                    }
                },

                onClick: () => this.app.bus.emit('cmd_SwitchProject', p.id)
            },
                dom('span', { class: 'truncate flex-1 pointer-events-none' }, p.name + (p.modified ? '*' : '')),
                closeBtn
            );

            this.container.appendChild(tab);
        });

        const addBtn = dom('button', {
            class: "w-8 h-8 flex items-center justify-center text-neutral-500 hover:text-sky-400 transition",
            onClick: () => this.app.bus.emit('cmd_NewProject')
        }, DomBuilder.icon('plus'));

        this.container.appendChild(addBtn);
    }

    updateActive(id) {
        this.render(this.app.dataAccess.projects);
    }
}