import PixelApp from './core/PixelApp.js';

// Services (Logic)
import ProjectService from './services/ProjectService.js';
import ToolService from './services/ToolService.js';
import HistoryService from './services/HistoryService.js';
import FileService from './services/FileService.js';
import ShortcutService from './services/ShortcutService.js';
import AutoSaveService from './services/AutoSaveService.js';

// UI (Views)
import ToolbarUI from './ui/ToolbarUI.js';
import LayerUI from './ui/LayerUI.js';
import PaletteUI from './ui/PaletteUI.js';
import BrushUI from './ui/BrushUI.js';
import FileMenuUI from './ui/FileMenuUI.js';
import SettingsUI from './ui/SettingsUI.js';
import TabsUI from './ui/TabsUI.js';
import AnimationUI from './ui/AnimationUI.js';
import DialogUI from './ui/DialogUI.js';
import HistoryUI from './ui/HistoryUI.js';
// ... import other UI components as they are ported ...

window.onload = () => {
    const app = new PixelApp();

    // 1. Register Core Services
    app.services.register('project', new ProjectService());
    app.services.register('tools', new ToolService());
    app.services.register('history', new HistoryService());
    app.services.register('files', new FileService());
    app.services.register('shortcuts', new ShortcutService());
    app.services.register('autosave', new AutoSaveService());

    // 2. Register UI Components
    app.services.register('ui_toolbar', new ToolbarUI());
    app.services.register('ui_layers', new LayerUI());
    app.services.register('ui_palette', new PaletteUI());
    app.services.register('ui_brush', new BrushUI());
    app.services.register('ui_file', new FileMenuUI());
    app.services.register('ui_settings', new SettingsUI());
    app.services.register('ui_tabs', new TabsUI());
    app.services.register('ui_animation', new AnimationUI());
    app.services.register('ui_dialog', new DialogUI());
    app.services.register('ui_history', new HistoryUI());

    // 3. Initialize Data
    // Create default project if none exists
    if (app.store.get('projects').length === 0) {
        app.bus.emit('cmd:createProject', 'New Project');
    }
};