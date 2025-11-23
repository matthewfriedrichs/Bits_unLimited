import PixelApp from './core/PixelApp.js';

// Logic Services
import ProjectService from './services/ProjectService.js';
import RenderService from './services/RenderService.js';
import ToolService from './services/ToolService.js';
import HistoryService from './services/HistoryService.js';
import FileService from './services/FileService.js';
import ShortcutService from './services/ShortcutService.js';
import AutoSaveService from './services/AutoSaveService.js';
import EffectRegistry from './services/EffectRegistry.js'; // Import Registry

// Tools
import BrushTool from './tools/BrushTool.js';
import BucketTool from './tools/BucketTool.js';
import SelectTool from './tools/SelectTool.js';
import BorderTool from './tools/BorderTool.js';
import EyedropperTool from './tools/EyedropperTool.js';
import PaletteTool from './tools/PaletteTool.js';

// Effects
import InvertEffect from './effects/InvertEffect.js';
import PixelateEffect from './effects/PixelateEffect.js';
import TiledEffect from './effects/TiledEffect.js';
import WobbleEffect from './effects/WobbleEffect.js';
import WaveEffect from './effects/WaveEffect.js';

// UI (Views)
import ToolbarUI from './ui/ToolbarUI.js';
import LayerUI from './ui/LayerUI.js';
import BrushUI from './ui/BrushUI.js';
import FileMenuUI from './ui/FileMenuUI.js';
import SettingsUI from './ui/SettingsUI.js';
import TabsUI from './ui/TabsUI.js';
import AnimationUI from './ui/AnimationUI.js';
import DialogUI from './ui/DialogUI.js';
import HistoryUI from './ui/HistoryUI.js';

window.onload = () => {
    const app = new PixelApp();

    app.services.register('project', new ProjectService());
    app.services.register('renderer', new RenderService());

    const toolService = new ToolService();
    app.services.register('tools', toolService);

    app.services.register('history', new HistoryService());
    app.services.register('files', new FileService());
    app.services.register('shortcuts', new ShortcutService());
    app.services.register('autosave', new AutoSaveService());

    // --- Register Effects ---
    const effectRegistry = new EffectRegistry();
    app.services.register('effects', effectRegistry);

    effectRegistry.register('invert', 'Invert', new InvertEffect());
    effectRegistry.register('pixelate', 'Pixelate', new PixelateEffect());
    effectRegistry.register('tiled', 'Tiled Mode', new TiledEffect());
    effectRegistry.register('wobble', 'Wobble', new WobbleEffect());
    effectRegistry.register('wave', 'Wave', new WaveEffect());

    // Register Tools
    toolService.register('pen', new BrushTool(app));
    toolService.register('eraser', new BrushTool(app, true));
    toolService.register('bucket', new BucketTool(app));
    toolService.register('select', new SelectTool(app));
    toolService.register('frame', new BorderTool(app));
    toolService.register('eyedropper', new EyedropperTool(app));
    toolService.register('palette', new PaletteTool(app));

    // Register UI
    app.services.register('ui_toolbar', new ToolbarUI());
    app.services.register('ui_layers', new LayerUI());
    app.services.register('ui_brush', new BrushUI());
    app.services.register('ui_file', new FileMenuUI());
    app.services.register('ui_settings', new SettingsUI());
    app.services.register('ui_tabs', new TabsUI());
    app.services.register('ui_animation', new AnimationUI());
    app.services.register('ui_dialog', new DialogUI());
    app.services.register('ui_history', new HistoryUI());

    if (app.store.get('projects').length === 0) {
        app.bus.emit('cmd:createProject', 'New Project');
    }
};