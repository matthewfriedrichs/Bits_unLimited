export default class Store {
    constructor(bus) {
        this.bus = bus;

        this.state = {
            projects: [],
            activeProjectId: null,

            primaryTool: 'pen',
            secondaryTool: 'eraser',

            primaryColor: '#000000',
            currentPalette: ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff'],

            customShapes: [],

            // Pen Settings
            activeBrush: { id: 'basic', size: 1, shape: 'square', mode: 'normal', pixelPerfect: false },

            // NEW: Eraser Settings (Default to standard 1px eraser)
            eraserBrush: { id: 'eraser-basic', size: 1, shape: 'square', mode: 'normal', pixelPerfect: false },

            camera: { x: 0, y: 0, zoom: 20 },
            settings: {
                grid: { show: true, color: '#333333', major: 8, majorColor: '#555555', opacity: 1.0 },
                background: { mode: 'panned', style: 'checker', color1: '#2a2a2a', color2: '#1a1a1a', size: 2 }
            }
        };
    }

    get(key) { return this.state[key]; }

    get activeProject() {
        return this.state.projects.find(p => p.id === this.state.activeProjectId);
    }

    set(key, value, silent = false) {
        const oldValue = this.state[key];
        this.state[key] = value;
        if (!silent) {
            this.bus.emit('stateChanged', { key, oldValue, newValue: value });
            this.bus.emit(`state:${key}`, value);
        }
    }

    update(path, value) {
        const keys = path.split('.');
        let obj = this.state;
        for (let i = 0; i < keys.length - 1; i++) {
            obj = obj[keys[i]];
        }
        obj[keys[keys.length - 1]] = value;
        this.bus.emit('stateChanged', { key: path, newValue: value });
    }
}