import DomBuilder from '../utils/DomBuilder.js';
const dom = DomBuilder.create;

export default class TabsUI {
    init(app) {
        this.app = app;
        this.bus = app.bus;
        this.store = app.store;
        
        // Create Container if missing
        this.container = document.getElementById('tabs-bar');
        if (!this.container) {
            this.container = dom('div', {
                id: 'tabs-bar',
                class: 'h-9 bg-neutral-900 flex items-end px-2 gap-1 border-b border-neutral-800 overflow-x-auto scrollbar-hide'
            });
            const topBar = document.getElementById('top-bar');
            topBar.parentNode.insertBefore(this.container, topBar.nextSibling);
        }

        // Listen
        this.bus.on('stateChanged', (e) => {
             if (e.key === 'projects' || e.key === 'activeProjectId') {
                this.render();
            }
        });
        
        this.render();
    }

    render() {
        this.container.innerHTML = '';
        const projects = this.store.get('projects');
        const activeId = this.store.get('activeProjectId');

        projects.forEach(p => {
            const isActive = p.id === activeId;
            
            // Styles
            const baseClass = "group flex items-center gap-2 px-3 py-1.5 text-xs rounded-t-md cursor-pointer transition select-none min-w-[100px] max-w-[160px]";
            const activeClass = "bg-neutral-800 text-sky-400 border-t-2 border-sky-500";
            const inactiveClass = "bg-neutral-900 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300 border-t-2 border-transparent";

            const closeBtn = dom('button', {
                class: `hover:text-rose-400 transition ${isActive ? 'text-neutral-500' : 'text-transparent group-hover:text-neutral-500'}`,
                onClick: (e) => { 
                    e.stopPropagation(); 
                    this.bus.emit('cmd:closeProject', p.id); 
                }
            }, DomBuilder.icon('times'));

            const tab = dom('div', {
                class: `${baseClass} ${isActive ? activeClass : inactiveClass}`,
                onClick: () => this.bus.emit('cmd:switchProject', p.id)
            },
                dom('span', { class: 'truncate flex-1 pointer-events-none' }, p.name + (p.modified ? '*' : '')),
                closeBtn
            );

            this.container.appendChild(tab);
        });

        const addBtn = dom('button', {
            class: "w-8 h-8 flex items-center justify-center text-neutral-500 hover:text-sky-400 transition",
            onClick: () => this.bus.emit('cmd:createProject')
        }, DomBuilder.icon('plus'));

        this.container.appendChild(addBtn);
    }
}