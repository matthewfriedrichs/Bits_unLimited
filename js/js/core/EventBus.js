export default class EventBus {
    constructor() { this.listeners = {}; }
    on(event, callback) { if (!this.listeners[event]) this.listeners[event] = []; this.listeners[event].push(callback); }
    emit(event, payload) { if (this.listeners[event]) this.listeners[event].forEach(cb => cb(payload)); }
}