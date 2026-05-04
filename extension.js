const __DEBUG__ = false;

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as WindowManager from 'resource:///org/gnome/shell/ui/windowManager.js';

import * as Util from './util.js';
import * as OverviewControlsOverride from './overviewControls.js';
import * as WorkspacesViewOverrides from './workspacesView.js';
import * as WorkspaceThumbnailOverrides from './workspaceThumbnail.js';
import * as DashOverride from './dash.js';
import * as Gestures from './gestures.js';
import * as WorkspaceOverrides from './workspace.js';

export default class VerticalOverviewExtension extends Extension {
    enable() {
        if (__DEBUG__) console.log('[VERTICAL-OVERVIEW] starting overrides');
        global.vertical_overview = {};
        global.vertical_overview.GSFunctions = {};

        Util.init(this);
        this._bindSettings();

        OverviewControlsOverride.override();
        WorkspacesViewOverrides.override();
        WorkspaceThumbnailOverrides.override();
        WorkspaceOverrides.override();
        Gestures.override();
        DashOverride.override();

        global.workspace_manager.override_workspace_layout(
            Meta.DisplayCorner.TOPLEFT, true, -1, 1);

        this._rebindKeys(Main.overview._overview._controls);

        if (__DEBUG__) console.log('[VERTICAL_OVERVIEW] enabled');
    }

    disable() {
        if (__DEBUG__) console.log('[VERTICAL-OVERVIEW] resetting overrides');

        OverviewControlsOverride.reset();
        WorkspacesViewOverrides.reset();
        WorkspaceOverrides.reset();
        WorkspaceThumbnailOverrides.reset();
        Gestures.reset();
        DashOverride.reset(true);

        this._rebindKeys(Main.overview._overview._controls);

        global.workspaceManager.override_workspace_layout(
            Meta.DisplayCorner.TOPLEFT, false, 1, -1);

        for (const key in global.vertical_overview.settings.signals)
            Util.unbindSetting(key);

        delete global.vertical_overview;
        if (__DEBUG__) console.log('[VERTICAL-OVERVIEW] disabled');
    }

    _bindSettings() {
        const controlsManager = Main.overview._overview._controls;

        Util.bindSetting('left-offset', (settings, label) => {
            const { scaleFactor } = St.ThemeContext.get_for_stage(global.stage);
            controlsManager.layoutManager.leftOffset = settings.get_int(label) * scaleFactor;
        });

        Util.bindSetting('right-offset', (settings, label) => {
            const { scaleFactor } = St.ThemeContext.get_for_stage(global.stage);
            controlsManager.layoutManager.rightOffset = settings.get_int(label) * scaleFactor;
        });

        Util.bindSetting('scaling-workspace-background', (settings, label) => {
            global.vertical_overview.scaling_workspaces_hidden = settings.get_boolean(label);
            if (settings.get_boolean(label))
                WorkspaceOverrides.scalingWorkspaceBackgroundOverride();
            else
                WorkspaceOverrides.scalingWorkspaceBackgroundReset();
        });

        Util.bindSetting('static-background', (settings, label) => {
            if (settings.get_boolean(label))
                WorkspaceOverrides.staticBackgroundOverride();
            else
                WorkspaceOverrides.staticBackgroundReset();
        });

        Util.bindSetting('workspace-peek-distance', (settings, label) => {
            global.vertical_overview.workspacePeek = settings.get_int(label);
        });

        Util.bindSetting('dash-to-panel-left-right-fix', (settings, label) => {
            global.vertical_overview.misc_dTPLeftRightFix = settings.get_boolean(label);
        });

        Util.bindSetting('default-old-style', (settings, label) => {
            global.vertical_overview.default_old_style_enabled = settings.get_boolean(label);
            DashOverride.dash_old_style();
            WorkspaceThumbnailOverrides.thumbnails_old_style();
        });

        Util.bindSetting('old-style', (settings, label) => {
            global.vertical_overview.old_style_enabled = settings.get_boolean(label);
            DashOverride.dash_old_style();
            WorkspaceThumbnailOverrides.thumbnails_old_style();
        });

        Util.bindSetting('panel-in-overview', (settings, label) => {
            if (settings.get_boolean(label)) {
                if (global.vertical_overview.panel_signal_found) {
                    global.vertical_overview.panel_signal.disconnected = true;
                } else {
                    const callbackString = "()=>{this.add_style_pseudo_class('overview');}";
                    let i = 0;
                    while (i < Main.overview._signalConnections.length) {
                        const signal = Main.overview._signalConnections[i];
                        if (signal.name === 'showing') {
                            if (signal.callback.toString().replace(/[\ \n]/g, '') === callbackString) {
                                global.vertical_overview.panel_signal = signal;
                                global.vertical_overview.panel_signal_found = true;
                                signal.disconnected = true;
                                break;
                            }
                        }
                        i++;
                    }
                }
            } else {
                if (global.vertical_overview.panel_signal_found)
                    global.vertical_overview.panel_signal.disconnected = false;
            }
        });
    }

    _rebindKeys(self) {
        Main.wm.removeKeybinding('toggle-application-view');
        Main.wm.removeKeybinding('shift-overview-up');
        Main.wm.removeKeybinding('shift-overview-down');
        Main.wm.addKeybinding(
            'toggle-application-view',
            new Gio.Settings({ schema_id: WindowManager.SHELL_KEYBINDINGS_SCHEMA }),
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            self._toggleAppsPage.bind(self));

        Main.wm.addKeybinding('shift-overview-up',
            new Gio.Settings({ schema_id: WindowManager.SHELL_KEYBINDINGS_SCHEMA }),
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            () => self._shiftState(Meta.MotionDirection.UP));

        Main.wm.addKeybinding('shift-overview-down',
            new Gio.Settings({ schema_id: WindowManager.SHELL_KEYBINDINGS_SCHEMA }),
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            () => self._shiftState(Meta.MotionDirection.DOWN));
    }
}
