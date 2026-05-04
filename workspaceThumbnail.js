import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import St from 'gi://St';

import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Background from 'resource:///org/gnome/shell/ui/background.js';
import * as WorkspaceThumbnail from 'resource:///org/gnome/shell/ui/workspaceThumbnail.js';

import * as Util from './util.js';

const NUM_WORKSPACES_THRESHOLD = 2;
var MAX_THUMBNAIL_SCALE = 0.05;
var RESCALE_ANIMATION_TIME = 200;
var SLIDE_ANIMATION_TIME = 200;
var WORKSPACE_CUT_SIZE = 10;
var WORKSPACE_KEEP_ALIVE_TIME = 100;
var MUTTER_SCHEMA = 'org.gnome.mutter';

function _laterAdd(type, callback) {
    if (global.compositor?.get_laters) {
        global.compositor.get_laters().add(type, () => {
            callback();
            return GLib.SOURCE_REMOVE;
        });
    } else {
        Meta.later_add(type, callback);
    }
}

export function override() {
    global.vertical_overview.GSFunctions['ThumbnailsBox'] = Util.overrideProto(
        WorkspaceThumbnail.ThumbnailsBox.prototype, ThumbnailsBoxOverride);
    global.vertical_overview.GSFunctions['WorkspaceThumbnail'] = Util.overrideProto(
        WorkspaceThumbnail.WorkspaceThumbnail.prototype, WorkspaceThumbnailOverride);
    Main.overview._overview._controls._thumbnailsBox.x_align = Clutter.ActorAlign.FILL;
}

export function reset() {
    Util.overrideProto(
        WorkspaceThumbnail.ThumbnailsBox.prototype,
        global.vertical_overview.GSFunctions['ThumbnailsBox']);
    Util.overrideProto(
        WorkspaceThumbnail.WorkspaceThumbnail.prototype,
        global.vertical_overview.GSFunctions['WorkspaceThumbnail']);
    Main.overview._overview._controls._thumbnailsBox.x_align = Clutter.ActorAlign.CENTER;
}

export function thumbnails_old_style() {
    const thumbnailsBox = Main.overview._overview._controls._thumbnailsBox;
    if (global.vertical_overview.old_style_enabled &&
        global.vertical_overview.default_old_style_enabled)
        thumbnailsBox.add_style_class_name('vertical-overview');
    else
        thumbnailsBox.remove_style_class_name('vertical-overview');
}

var ThumbnailsBoxOverride = {
    after__init() {
        if (global.vertical_overview.old_style_enabled &&
            global.vertical_overview.default_old_style_enabled)
            this.add_style_class_name('vertical-overview');
    },

    _updateShouldShow() {
        if (this._shouldShow === true)
            return;
        this._shouldShow = true;
        this.notify('should-show');
    },

    _activateThumbnailAtPoint(stageX, stageY, time) {
        const [_r, _x, y] = this.transform_stage_point(stageX, stageY);
        const thumbnail = this._thumbnails.find(t => y >= t.y && y <= t.y + t.height);
        if (thumbnail)
            thumbnail.activate(time);
    },

    _getPlaceholderTarget(index, spacing, _rtl) {
        const workspace = this._thumbnails[index];

        let targetY1 = workspace.y - spacing - WORKSPACE_CUT_SIZE;
        let targetY2 = workspace.y + WORKSPACE_CUT_SIZE;

        if (index === 0)
            targetY1 += spacing + WORKSPACE_CUT_SIZE;

        if (index === this._dropPlaceholderPos) {
            const placeholderHeight = this._dropPlaceholder.get_height() + spacing;
            targetY1 -= placeholderHeight;
        }

        return [targetY1, targetY2];
    },

    _withinWorkspace(y, index, _rtl) {
        const length = this._thumbnails.length;
        const workspace = this._thumbnails[index];

        let workspaceY1 = workspace.y + WORKSPACE_CUT_SIZE;
        let workspaceY2 = workspace.y + workspace.height - WORKSPACE_CUT_SIZE;

        if (index === length - 1)
            workspaceY2 += WORKSPACE_CUT_SIZE;

        return y > workspaceY1 && y <= workspaceY2;
    },

    handleDragOver(source, actor, x, y, time) {
        if (!source.metaWindow &&
            (!source.app || !source.app.can_open_new_window()) &&
            (source.app || !source.shellWorkspaceLaunch) &&
            source !== Main.xdndHandler)
            return DND.DragMotionResult.CONTINUE;

        const rtl = Clutter.get_default_text_direction() === Clutter.TextDirection.RTL;
        const canCreateWorkspaces = Meta.prefs_get_dynamic_workspaces();
        const spacing = this.get_theme_node().get_length('spacing');

        this._dropWorkspace = -1;
        let placeholderPos = -1;
        const length = this._thumbnails.length;

        for (let i = 0; i < length; i++) {
            const index = rtl ? length - i - 1 : i;

            if (canCreateWorkspaces && source !== Main.xdndHandler) {
                const [targetStart, targetEnd] =
                    this._getPlaceholderTarget(index, spacing, rtl);
                if (y > targetStart && y <= targetEnd) {
                    placeholderPos = index;
                    break;
                }
            }

            if (this._withinWorkspace(y, index, rtl)) {
                this._dropWorkspace = index;
                break;
            }
        }

        if (this._dropPlaceholderPos !== placeholderPos) {
            this._dropPlaceholderPos = placeholderPos;
            this.queue_relayout();
        }

        if (this._dropWorkspace !== -1)
            return this._thumbnails[this._dropWorkspace]
                .handleDragOverInternal(source, actor, time);
        else if (this._dropPlaceholderPos !== -1)
            return source.metaWindow
                ? DND.DragMotionResult.MOVE_DROP
                : DND.DragMotionResult.COPY_DROP;
        else
            return DND.DragMotionResult.CONTINUE;
    },

    vfunc_allocate(box) {
        box.y1 += 16;
        box.y2 -= 32;
        this.set_allocation(box);

        if (this._thumbnails.length === 0)
            return;

        let themeNode = this.get_theme_node();
        box = themeNode.get_content_box(box);

        const portholeWidth = this._porthole.width;
        const portholeHeight = this._porthole.height;
        const ratio = portholeHeight / portholeWidth;

        var width = box.get_width();
        var height = Math.round(width * ratio);

        const vScale = width / portholeWidth;
        const hScale = height / portholeHeight;

        var spacing = themeNode.get_length('spacing');

        const indicatorValue = this._scrollAdjustment.value;
        const indicatorUpperWs = Math.ceil(indicatorValue);
        const indicatorLowerWs = Math.floor(indicatorValue);

        let indicatorLowerY1 = 0;
        let indicatorLowerY2 = 0;
        let indicatorUpperY1 = 0;
        let indicatorUpperY2 = 0;

        if (this._dropPlaceholderPos === -1) {
            this._dropPlaceholder.allocate_preferred_size(
                ...this._dropPlaceholder.get_position());
            _laterAdd(Meta.LaterType.BEFORE_REDRAW, () => {
                this._dropPlaceholder.hide();
            });
        }

        const thumbnailsPosition =
            global.vertical_overview.settings.object.get_int('thumbnails-position') || 1;
        const totalHeight = (height + spacing) * this._thumbnails.length;
        box.y1 = Math.max(0, (box.get_height() - totalHeight) / (100 / thumbnailsPosition));

        const additionalScale = box.get_height() < totalHeight
            ? box.get_height() / totalHeight : 1;
        height *= additionalScale;
        width *= additionalScale;
        spacing *= additionalScale;

        const childBox = new Clutter.ActorBox();
        for (let i = 0; i < this._thumbnails.length; i++) {
            const thumbnail = this._thumbnails[i];

            let y1 = box.y1 + (height + spacing) * i;

            const [, placeholderHeight] = this._dropPlaceholder.get_preferred_height(-1);
            if (i === this._dropPlaceholderPos) {
                childBox.set_origin(box.x1, y1);
                childBox.set_size(
                    this._dropPlaceholder.get_preferred_width(-1)[1],
                    placeholderHeight);
                this._dropPlaceholder.allocate(childBox);
                _laterAdd(Meta.LaterType.BEFORE_REDRAW, () => {
                    this._dropPlaceholder.show();
                });
            }

            if (this._dropPlaceholderPos !== -1 && this._dropPlaceholderPos <= i)
                y1 += placeholderHeight + spacing;

            childBox.set_origin(box.x1 + (box.get_width() - width), y1);
            childBox.set_size(width, height);
            thumbnail.setScale(vScale, hScale);
            thumbnail.allocate(childBox);

            if (i === indicatorUpperWs) {
                indicatorUpperY1 = childBox.y1;
                indicatorUpperY2 = childBox.y2;
            }
            if (i === indicatorLowerWs) {
                indicatorLowerY1 = childBox.y1;
                indicatorLowerY2 = childBox.y2;
            }
        }

        const indicatorThemeNode = this._indicator.get_theme_node();
        const indicatorTopFullBorder =
            indicatorThemeNode.get_padding(St.Side.TOP) +
            indicatorThemeNode.get_border_width(St.Side.TOP);
        const indicatorBottomFullBorder =
            indicatorThemeNode.get_padding(St.Side.BOTTOM) +
            indicatorThemeNode.get_border_width(St.Side.BOTTOM);
        const indicatorLeftFullBorder =
            indicatorThemeNode.get_padding(St.Side.LEFT) +
            indicatorThemeNode.get_border_width(St.Side.LEFT);
        const indicatorRightFullBorder =
            indicatorThemeNode.get_padding(St.Side.RIGHT) +
            indicatorThemeNode.get_border_width(St.Side.RIGHT);

        childBox.x1 = box.x1 + (box.get_width() - width);
        childBox.x2 = box.x1 + box.get_width();

        const indicatorY1 = indicatorLowerY1 +
            (indicatorUpperY1 - indicatorLowerY1) * (indicatorValue % 1);
        const indicatorY2 = indicatorLowerY2 +
            (indicatorUpperY2 - indicatorLowerY2) * (indicatorValue % 1);

        childBox.y1 = indicatorY1 - indicatorTopFullBorder;
        childBox.y2 = indicatorY2 + indicatorBottomFullBorder;
        childBox.x1 -= indicatorLeftFullBorder;
        childBox.x2 += indicatorRightFullBorder;
        this._indicator.allocate(childBox);
    },
};

var WorkspaceThumbnailOverride = {
    after__init() {
        this._bgManager = new Background.BackgroundManager({
            monitorIndex: this.monitorIndex,
            container: this._viewport,
            vignette: false,
            controlPosition: false,
        });
        this._viewport.set_child_below_sibling(this._bgManager.backgroundActor, null);

        this.connectObject('destroy', () => {
            this._bgManager.destroy();
            this._bgManager = null;
        }, this);
    },
};
