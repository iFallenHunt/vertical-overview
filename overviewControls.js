import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Overview from 'resource:///org/gnome/shell/ui/overview.js';
import * as WorkspacesView from 'resource:///org/gnome/shell/ui/workspacesView.js';
import * as OverviewControls from 'resource:///org/gnome/shell/ui/overviewControls.js';
import * as MiscUtil from 'resource:///org/gnome/shell/misc/util.js';

import * as Util from './util.js';

const DASH_MAX_HEIGHT_RATIO = 0.15;

export var SIDE_CONTROLS_ANIMATION_TIME = Overview.ANIMATION_TIME;

export var ControlsState = {
    HIDDEN: 0,
    WINDOW_PICKER: 1,
    APP_GRID: 2,
};

export function override() {
    // ControlsManagerLayout is not exported in GNOME Shell 45+; get prototype from live instance
    const controlsManager = Main.overview._overview._controls;
    global.vertical_overview.GSFunctions['ControlsManagerLayout'] = Util.overrideProto(
        Object.getPrototypeOf(controlsManager.layout_manager), ControlsManagerLayoutOverride);
    global.vertical_overview.GSFunctions['ControlsManager'] = Util.overrideProto(
        OverviewControls.ControlsManager.prototype, ControlsManagerOverride);

    global.vertical_overview._updateID = controlsManager._stateAdjustment.connect(
        'notify::value', _updateWorkspacesDisplay.bind(controlsManager));
    global.vertical_overview._workspaceDisplayVisibleID =
        controlsManager._workspacesDisplay.connect(
            'notify::visible',
            controlsManager._workspacesDisplay._updateWorkspacesViews.bind(
                controlsManager._workspacesDisplay));
}

export function reset() {
    const controlsManager = Main.overview._overview._controls;
    Util.overrideProto(
        Object.getPrototypeOf(controlsManager.layout_manager),
        global.vertical_overview.GSFunctions['ControlsManagerLayout']);
    Util.overrideProto(
        OverviewControls.ControlsManager.prototype,
        global.vertical_overview.GSFunctions['ControlsManager']);

    controlsManager._stateAdjustment.disconnect(global.vertical_overview._updateID);
    controlsManager._workspacesDisplay.disconnect(global.vertical_overview._workspaceDisplayVisibleID);
    controlsManager._workspacesDisplay.reactive = true;
    controlsManager._workspacesDisplay.setPrimaryWorkspaceVisible(true);
}

function enterOverviewAnimation() {
    const controlsManager = Main.overview._overview._controls;

    if (global.vertical_overview.dash_override) {
        controlsManager.dash.translation_x = -controlsManager.dash.width;
        controlsManager.dash.ease({
            translation_x: 0,
            duration: Overview.ANIMATION_TIME,
        });
    }

    controlsManager._searchEntry.opacity = 0;
    controlsManager._searchEntry.ease({
        opacity: 255,
        duration: Overview.ANIMATION_TIME,
    });

    const { scaleFactor } = St.ThemeContext.get_for_stage(global.stage);
    const rightOffset = controlsManager.layoutManager.rightOffset * scaleFactor;

    controlsManager._thumbnailsBox.translation_x = rightOffset;
    controlsManager._thumbnailsBox.ease({
        translation_x: 0,
        duration: Overview.ANIMATION_TIME,
    });

    if (controlsManager._workspacesDisplay._workspacesViews) {
        controlsManager._workspacesDisplay._workspacesViews.forEach((workspace, i) => {
            if (i !== Main.layoutManager.primaryIndex) {
                const scale =
                    Main.layoutManager.getWorkAreaForMonitor(workspace._monitorIndex).width /
                    Main.layoutManager.primaryMonitor.width;
                workspace._thumbnails.translation_x = rightOffset * scale;
                workspace._thumbnails.ease({
                    translation_x: 0,
                    duration: Overview.ANIMATION_TIME,
                });
            }
        });
    }
}

function exitOverviewAnimation() {
    const controlsManager = Main.overview._overview._controls;

    if (global.vertical_overview.dash_override) {
        controlsManager.dash.ease({
            translation_x: -controlsManager.dash.width,
            duration: Overview.ANIMATION_TIME,
        });
    }

    controlsManager._searchEntry.ease({
        opacity: 0,
        duration: Overview.ANIMATION_TIME,
    });

    controlsManager._thumbnailsBox.ease({
        translation_x: controlsManager._thumbnailsBox.width,
        duration: Overview.ANIMATION_TIME,
    });

    if (controlsManager._workspacesDisplay._workspacesViews) {
        controlsManager._workspacesDisplay._workspacesViews.forEach((workspace, i) => {
            if (i !== Main.layoutManager.primaryIndex) {
                workspace._thumbnails.ease({
                    translation_x: workspace._thumbnails.width,
                    duration: Overview.ANIMATION_TIME,
                });
            }
        });
    }
}

var ControlsManagerLayoutOverride = {
    _computeWorkspacesBoxForState(state, workAreaBox, searchHeight, _dashHeight, _thumbnailsHeight) {
        const workspaceBox = workAreaBox.copy();
        const [startX, startY] = workAreaBox.get_origin();
        const [width, height] = workspaceBox.get_size();
        const spacing = this.spacing ?? 12;
        const { expandFraction } = this._workspacesThumbnails;

        switch (state) {
        case ControlsState.HIDDEN:
            if (global.vertical_overview.misc_dTPLeftRightFix) {
                const [w] = Main.layoutManager.panelBox.get_size();
                const [x] = Main.layoutManager.panelBox.get_transformed_position();
                if (x > 0)
                    workspaceBox.set_size(width - w, workspaceBox.y2);
                else
                    workspaceBox.set_origin(w / 2, workspaceBox.y1);
            }
            break;
        case ControlsState.WINDOW_PICKER:
        case ControlsState.APP_GRID:
            workspaceBox.set_origin(
                this.leftOffset + spacing,
                startY + searchHeight + spacing * expandFraction);
            workspaceBox.set_size(
                width - this.leftOffset - this.rightOffset - spacing * 2,
                height - startY - (searchHeight + spacing * expandFraction) * 2);
            break;
        }

        return workspaceBox;
    },

    _getAppDisplayBoxForState(state, workAreaBox, searchHeight, _dashHeight, _appGridBox) {
        const [startX, startY] = workAreaBox.get_origin();
        const [width, height] = workAreaBox.get_size();
        const appDisplayBox = new Clutter.ActorBox();
        const spacing = this.spacing ?? 12;

        switch (state) {
        case ControlsState.HIDDEN:
        case ControlsState.WINDOW_PICKER:
            appDisplayBox.set_origin(startX, workAreaBox.y2);
            break;
        case ControlsState.APP_GRID:
            appDisplayBox.set_origin(startX, startY + searchHeight + spacing);
            break;
        }

        appDisplayBox.set_size(width, height - startY - searchHeight - spacing);
        return appDisplayBox;
    },

    vfunc_allocate(container, box) {
        const childBox = new Clutter.ActorBox();

        let leftOffset = this.leftOffset;
        const rightOffset = this.rightOffset;
        const spacing = this.spacing ?? 12;

        let startY = 0;

        if (global.vertical_overview.misc_dTPLeftRightFix) {
            const [w] = Main.layoutManager.panelBox.get_size();
            leftOffset -= w;
        } else {
            if (Main.layoutManager.panelBox.y === Main.layoutManager.primaryMonitor.y) {
                startY = Main.layoutManager.panelBox.height;
                box.y1 += startY;
            }
        }

        const [width, height] = box.get_size();
        let availableHeight = height;

        // Search entry
        const [searchHeight] = this._searchEntry.get_preferred_height(width);
        childBox.set_origin(leftOffset, startY);
        childBox.set_size(width - leftOffset - rightOffset, searchHeight);
        this._searchEntry.allocate(childBox);
        availableHeight -= searchHeight + spacing;

        // Dash
        if (global.vertical_overview.dash_override) {
            if (!global.vertical_overview.settings.object.get_boolean('hide-dash')) {
                this._dash.setMaxSize(leftOffset, height * this.dashMaxHeightScale);
                childBox.set_origin(0, startY);
                childBox.set_size(leftOffset, height);
                this._dash.allocate(childBox);
            }
        } else {
            const maxDashHeight = Math.round(box.get_height() * DASH_MAX_HEIGHT_RATIO);
            this._dash.setMaxSize(width, maxDashHeight);
            const [, dashHeight] = this._dash.get_preferred_height(width);
            const clampedDashHeight = Math.min(dashHeight, maxDashHeight);
            childBox.set_origin(0, startY + height - clampedDashHeight);
            childBox.set_size(width, clampedDashHeight);
            this._dash.allocate(childBox);
            availableHeight -= clampedDashHeight + spacing;
        }

        // Workspace Thumbnails
        if (this._workspacesThumbnails.visible) {
            childBox.set_origin(width - rightOffset, startY);
            childBox.set_size(rightOffset, height);
            this._workspacesThumbnails.allocate(childBox);
        }

        // Workspaces
        const params = [box, startY, searchHeight, leftOffset, rightOffset];
        const transitionParams = this._stateAdjustment.getStateTransitionParams();

        for (const state of Object.values(ControlsState)) {
            this._cachedWorkspaceBoxes.set(
                state, this._computeWorkspacesBoxForState(state, ...params));
        }

        let workspacesBox;
        if (!transitionParams.transitioning) {
            workspacesBox = this._cachedWorkspaceBoxes.get(transitionParams.currentState);
        } else {
            const initialBox = this._cachedWorkspaceBoxes.get(transitionParams.initialState);
            const finalBox = this._cachedWorkspaceBoxes.get(transitionParams.finalState);
            workspacesBox = initialBox.interpolate(finalBox, transitionParams.progress);
        }
        this._workspacesDisplay.allocate(workspacesBox);

        // App grid
        if (this._appDisplay.visible) {
            const appParams = [box, startY, searchHeight];
            let appDisplayBox;
            if (!transitionParams.transitioning) {
                appDisplayBox =
                    this._getAppDisplayBoxForState(transitionParams.currentState, ...appParams);
            } else {
                const initialBox =
                    this._getAppDisplayBoxForState(transitionParams.initialState, ...appParams);
                const finalBox =
                    this._getAppDisplayBoxForState(transitionParams.finalState, ...appParams);
                appDisplayBox = initialBox.interpolate(finalBox, transitionParams.progress);
            }
            this._appDisplay.allocate(appDisplayBox);
        }

        // Search
        childBox.set_origin(leftOffset, startY + searchHeight + spacing);
        childBox.set_size(width - leftOffset - rightOffset, availableHeight);
        this._searchController.allocate(childBox);
        this._runPostAllocation();
    },
};

var ControlsManagerOverride = {
    _getFitModeForState(_state) {
        return WorkspacesView.FitMode.SINGLE;
    },

    _getThumbnailsBoxParams() {
        const { initialState, finalState, progress } =
            this._stateAdjustment.getStateTransitionParams();

        const paramsForState = _s => ({ opacity: 255, scale: 1 });

        const initialParams = paramsForState(initialState);
        const finalParams = paramsForState(finalState);

        return [
            MiscUtil.lerp(initialParams.opacity, finalParams.opacity, progress),
            MiscUtil.lerp(initialParams.scale, finalParams.scale, progress),
        ];
    },

    _updateThumbnailsBox() {
        const { shouldShow } = this._thumbnailsBox;
        if (shouldShow) {
            this._thumbnailsBox.opacity = 255;
            this._thumbnailsBox.visible = true;
        }
    },

    animateToOverview(state, callback) {
        this._ignoreShowAppsButtonToggle = true;

        this._searchController.prepareToEnterOverview();
        this._workspacesDisplay.prepareToEnterOverview();
        this._stateAdjustment.value = ControlsState.HIDDEN;

        this._workspacesDisplay.opacity = 255;
        this._workspacesDisplay.setPrimaryWorkspaceVisible(!this.dash.showAppsButton.checked);
        this._workspacesDisplay.reactive = !this.dash.showAppsButton.checked;

        this._stateAdjustment.ease(state, {
            duration: Overview.ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onStopped: () => {
                if (callback)
                    callback();
            },
        });

        this.dash.showAppsButton.checked = state === ControlsState.APP_GRID;
        this._ignoreShowAppsButtonToggle = false;

        if (global.vertical_overview.scaling_workspaces_hidden)
            enterOverviewAnimation();
    },

    animateFromOverview(callback) {
        this._ignoreShowAppsButtonToggle = true;

        this._workspacesDisplay.prepareToLeaveOverview();
        this._stateAdjustment.ease(ControlsState.HIDDEN, {
            duration: Overview.ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onStopped: () => {
                this.dash.showAppsButton.checked = false;
                this._ignoreShowAppsButtonToggle = false;
                if (callback)
                    callback();
            },
        });

        if (global.vertical_overview.scaling_workspaces_hidden)
            exitOverviewAnimation();
    },
};

function _updateWorkspacesDisplay() {
    const { initialState, finalState, progress } =
        this._stateAdjustment.getStateTransitionParams();
    const { searchActive } = this._searchController;

    const paramsForState = s => {
        switch (s) {
        case ControlsState.HIDDEN:
        case ControlsState.WINDOW_PICKER:
            return { opacity: 255, scale: 1 };
        case ControlsState.APP_GRID:
            return { opacity: 0, scale: 0.5 };
        default:
            return { opacity: 255, scale: 1 };
        }
    };

    const initialParams = paramsForState(initialState);
    const finalParams = paramsForState(finalState);

    const opacity = Math.round(MiscUtil.lerp(initialParams.opacity, finalParams.opacity, progress));
    const scale = MiscUtil.lerp(initialParams.scale, finalParams.scale, progress);
    const workspacesDisplayVisible = opacity !== 0 && !searchActive;

    this._workspacesDisplay.ease({
        opacity,
        scale,
        duration: 0,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        onComplete: () => {
            this._workspacesDisplay.visible =
                !(progress === 1 && finalState === ControlsState.APP_GRID);
            this._workspacesDisplay.reactive = workspacesDisplayVisible;
            this._workspacesDisplay.setPrimaryWorkspaceVisible(workspacesDisplayVisible);
        },
    });
}
