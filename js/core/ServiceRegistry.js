export default class ServiceRegistry {
    constructor(app) {
        this.app = app;
        this.services = new Map();
    }

    register(name, serviceInstance) {
        if (this.services.has(name)) {
            console.warn(`Service ${name} is being overwritten.`);
        }
        this.services.set(name, serviceInstance);

        // Initialize immediately if the app is ready
        if (serviceInstance.init) {
            serviceInstance.init(this.app);
        }
        return serviceInstance;
    }

    get(name) {
        const service = this.services.get(name);
        if (!service) {
            throw new Error(`Service '${name}' not found.`);
        }
        return service;
    }
}