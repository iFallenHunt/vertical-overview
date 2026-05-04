import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { SwipeTracker } from './swipeTracker.js';

const USE_3_FINGER_SWIPES = false;

export function override() {
    if (USE_3_FINGER_SWIPES) {
        global.vertical_overview.swipeTracker = Main.overview._swipeTracker;
        global.vertical_overview.swipeTracker.enabled = false;

        const swipeTracker = new SwipeTracker(global.stage,
            Clutter.Orientation.VERTICAL,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            { allowDrag: false, allowScroll: false });
        swipeTracker.connectObject('begin', Main.overview._gestureBegin.bind(Main.overview),
            swipeTracker);
        swipeTracker.connectObject('update', Main.overview._gestureUpdate.bind(Main.overview),
            swipeTracker);
        swipeTracker.connectObject('end', Main.overview._gestureEnd.bind(Main.overview),
            swipeTracker);
        Main.overview._swipeTracker = swipeTracker;
    } else {
        const workspacesDisplay =
            Main.overview._overview._controls._workspacesDisplay;
        global.vertical_overview.swipeTracker = workspacesDisplay._swipeTracker;
        global.vertical_overview.swipeTracker.enabled = false;

        const swipeTracker = new SwipeTracker(
            Main.layoutManager.overviewGroup,
            Clutter.Orientation.VERTICAL,
            Shell.ActionMode.OVERVIEW,
            { allowDrag: false });
        swipeTracker.allowLongSwipes = true;
        swipeTracker.connectObject('begin',
            workspacesDisplay._switchWorkspaceBegin.bind(workspacesDisplay), swipeTracker);
        swipeTracker.connectObject('update',
            workspacesDisplay._switchWorkspaceUpdate.bind(workspacesDisplay), swipeTracker);
        swipeTracker.connectObject('end',
            workspacesDisplay._switchWorkspaceEnd.bind(workspacesDisplay), swipeTracker);
        workspacesDisplay._swipeTracker = swipeTracker;

        const workspaceAnimation = Main.wm._workspaceAnimation;
        global.vertical_overview.animationSwipeTracker = workspaceAnimation._swipeTracker;
        global.vertical_overview.animationSwipeTracker.enabled = false;

        const swipeTrackerAnimation = new SwipeTracker(global.stage,
            Clutter.Orientation.VERTICAL,
            Shell.ActionMode.NORMAL,
            { allowDrag: false });
        swipeTrackerAnimation.connectObject('begin',
            workspaceAnimation._switchWorkspaceBegin.bind(workspaceAnimation),
            swipeTrackerAnimation);
        swipeTrackerAnimation.connectObject('update',
            workspaceAnimation._switchWorkspaceUpdate.bind(workspaceAnimation),
            swipeTrackerAnimation);
        swipeTrackerAnimation.connectObject('end',
            workspaceAnimation._switchWorkspaceEnd.bind(workspaceAnimation),
            swipeTrackerAnimation);
        workspaceAnimation._swipeTracker = swipeTrackerAnimation;

        global.display.bind_property('compositor-modifiers',
            workspaceAnimation._swipeTracker, 'scroll-modifiers',
            GObject.BindingFlags.SYNC_CREATE);
    }
}

export function reset() {
    if (USE_3_FINGER_SWIPES) {
        const swipeTracker = Main.overview._swipeTracker;
        Main.overview._swipeTracker = global.vertical_overview.swipeTracker;
        swipeTracker.destroy();
        Main.overview._swipeTracker.enabled = true;
    } else {
        const workspacesDisplay =
            Main.overview._overview._controls._workspacesDisplay;
        const swipeTracker = workspacesDisplay._swipeTracker;
        workspacesDisplay._swipeTracker = global.vertical_overview.swipeTracker;
        swipeTracker.destroy();

        const workspaceAnimation = Main.wm._workspaceAnimation;
        const animationSwipeTracker = workspaceAnimation._swipeTracker;
        animationSwipeTracker.destroy();

        workspaceAnimation._swipeTracker = global.vertical_overview.animationSwipeTracker;
        workspaceAnimation._swipeTracker.enabled = true;
    }
}
