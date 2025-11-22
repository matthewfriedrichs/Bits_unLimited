export default class BaseTool {
    constructor(app) {
        this.app = app;
    }

    // Lifecycle Hooks
    onActivate() { }
    onDeactivate() { }

    // Input Events
    onPointerDown(p) { }
    onPointerMove(p) { }
    onPointerUp(p) { }

    // Render Loop (for tools that draw overlays like Selection or Frame handles)
    onRender(ctx) { }
}