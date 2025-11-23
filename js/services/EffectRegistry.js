export default class EffectRegistry {
    constructor() {
        this.effects = new Map();
    }

    init(app) {
        this.app = app;
    }

    register(id, name, effectInstance) {
        this.effects.set(id, { id, name, instance: effectInstance });
    }

    get(id) {
        return this.effects.get(id);
    }

    getAvailableEffects() {
        return Array.from(this.effects.values()).map(e => ({
            id: e.id,
            name: e.name
        }));
    }
}