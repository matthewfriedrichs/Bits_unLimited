import PixelApp from './core/PixelApp.js';
import DataPlugin from './plugins/DataPlugin.js';
import HistoryPlugin from './plugins/HistoryPlugin.js';
import FileManagerPlugin from './plugins/FileManagerPlugin.js';
import SettingsPlugin from './plugins/SettingsPlugin.js';
import ToolPlugin from './plugins/ToolPlugin.js';
import BrushPlugin from './plugins/BrushPlugin.js';
import PalettePlugin from './plugins/PalettePlugin.js';
import LayerUIPlugin from './plugins/LayerUIPlugin.js';
import AnimationUIPlugin from './plugins/AnimationUIPlugin.js';
import AutoSavePlugin from './plugins/AutoSavePlugin.js';
import TabsUIPlugin from './plugins/TabsUIPlugin.js'; 
import DialogPlugin from './plugins/DialogPlugin.js';
import ShortcutPlugin from './plugins/ShortcutPlugin.js';

window.onload = () => {
    const app = new PixelApp();

    app.registerPlugin(new DataPlugin());
    app.registerPlugin(new HistoryPlugin());
    app.registerPlugin(new FileManagerPlugin());
    app.registerPlugin(new SettingsPlugin());
    app.registerPlugin(new AutoSavePlugin());

    app.registerPlugin(new ToolPlugin());
    app.registerPlugin(new BrushPlugin());
    app.registerPlugin(new PalettePlugin());

    app.registerPlugin(new LayerUIPlugin());
    app.registerPlugin(new AnimationUIPlugin());
    app.registerPlugin(new TabsUIPlugin()); // <--- REGISTER
    app.registerPlugin(new DialogPlugin());

    app.registerPlugin(new ShortcutPlugin());

    app.bus.emit('refreshState');
};