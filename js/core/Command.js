export default class Command {
    constructor(app) {
        this.app = app;
        this.timestamp = Date.now();
    }

    execute() {
        throw new Error('Execute method not implemented');
    }

    undo() {
        throw new Error('Undo method not implemented');
    }
}