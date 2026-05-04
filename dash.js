import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Overview from 'resource:///org/gnome/shell/ui/overview.js';
import * as Dash from 'resource:///org/gnome/shell/ui/dash.js';

import * as Util from './util.js';

const { DashIcon, DashItemContainer, getAppFromSource, DragPlaceholderItem } = Dash;

var DASH_ANIMATION_TIME = 200;
var DASH_ITEM_LABEL_SHOW_TIME = 150;
var DASH_ITEM_LABEL_HIDE_TIME = 100;
var DASH_ITEM_HOVER_TIMEOUT = 300;

const baseIconSizes = [16, 22, 24, 32, 48, 64];

export function override() {
    Util.bindSetting('override-dash', (settings, label) => {
        if (settings.get_boolean(label)) {
            global.vertical_overview.GSFunctions['Dash'] = Util.overrideProto(
                Dash.Dash.prototype, DashOverride);
            global.vertical_overview.GSFunctions['DashItemContainer'] = Util.overrideProto(
                Dash.DashItemContainer.prototype, DashItemContainerOverride);
            set_to_vertical();
            Util.bindSetting('dash-max-height', dash_max_height);
            Util.bindSetting('hide-dash', hide_dash);
            Util.bindSetting('show-apps-on-top', show_apps_on_top);
            Util.bindSetting('dash-max-icon-size', dash_max_icon_size);
            Util.bindSetting('custom-run-indicator', custom_run_indicator);
            Util.bindSetting('dash-move-labels', dash_move_labels);
            global.vertical_overview.dash_override = true;
        } else {
            reset(false);
        }
    });
}

export function reset(isDisable) {
    if (global.vertical_overview.dash_override) {
        set_to_horizontal();
        Util.overrideProto(
            Dash.Dash.prototype,
            global.vertical_overview.GSFunctions['Dash']);
        Util.overrideProto(
            Dash.DashItemContainer.prototype,
            global.vertical_overview.GSFunctions['DashItemContainer']);
        global.vertical_overview.dash_override = false;

        Util.unbindSetting('dash-max-height', () => {
            delete Main.overview._overview._controls.layoutManager.dashMaxHeightScale;
        });

        Util.unbindSetting('hide-dash', (settings, label) => {
            if (settings.get_boolean(label))
                Main.overview._overview._controls.dash.show();
        });

        Util.unbindSetting('show-apps-on-top', () => {
            const dash = Main.overview._overview._controls.dash;
            dash._dashContainer.set_child_at_index(dash._showAppsIcon, 1);
        });

        Util.unbindSetting('dash-max-icon-size', () => {
            delete Main.overview._overview._controls.dash.maxIconSizeOverride;
        });

        Util.unbindSetting('custom-run-indicator', () => {
            delete Main.overview._overview._controls.dash.customRunIndicatorEnabled;
        });

        Util.unbindSetting('dash-move-labels', () => {
            delete global.vertical_overview.dash_move_labels;
        });
    }

    if (isDisable)
        Util.unbindSetting('override-dash');
}

function set_to_vertical() {
    const dash = Main.overview._overview._controls.dash;
    global.vertical_overview.dash_workId = dash._workId;
    dash._workId = Main.initializeDeferredWork(dash._box, dash._redisplay.bind(dash));

    dash._box.layout_manager.orientation = Clutter.Orientation.VERTICAL;
    dash._dashContainer.layout_manager.orientation = Clutter.Orientation.VERTICAL;
    dash._dashContainer.y_expand = false;
    dash._dashContainer.x_expand = true;
    dash.x_align = Clutter.ActorAlign.START;
    dash.y_align = Clutter.ActorAlign.CENTER;

    dash.add_style_class_name('vertical-overview');
    if (global.vertical_overview.old_style_enabled &&
        global.vertical_overview.default_old_style_enabled)
        dash.add_style_class_name('vertical-overview-old-dash');

    const sizerBox = dash._background.get_children()[0];
    sizerBox.clear_constraints();
    sizerBox.add_constraint(new Clutter.BindConstraint({
        source: dash._showAppsIcon.icon,
        coordinate: Clutter.BindCoordinate.WIDTH,
    }));
    sizerBox.add_constraint(new Clutter.BindConstraint({
        source: dash._dashContainer,
        coordinate: Clutter.BindCoordinate.HEIGHT,
    }));
    dash._box.remove_all_children();
    dash._separator = null;
    dash._queueRedisplay();
}

function dash_max_height(settings, label) {
    Main.overview._overview._controls.layoutManager.dashMaxHeightScale =
        settings.get_int(label) / 100.0;
}

function hide_dash(settings, label) {
    if (settings.get_boolean(label))
        Main.overview._overview._controls.dash.hide();
    else
        Main.overview._overview._controls.dash.show();
}

function show_apps_on_top(settings, label) {
    const dash = Main.overview._overview._controls.dash;
    if (settings.get_boolean(label))
        dash._dashContainer.set_child_at_index(dash._showAppsIcon, 0);
    else
        dash._dashContainer.set_child_at_index(dash._showAppsIcon, 1);
}

function dash_max_icon_size(settings, label) {
    const dash = Main.overview._overview._controls.dash;
    dash.maxIconSizeOverride = settings.get_int(label);
    dash._queueRedisplay();
}

function custom_run_indicator(settings, label) {
    const dash = Main.overview._overview._controls.dash;
    dash.customRunIndicatorEnabled = settings.get_boolean(label);
    dash._box.remove_all_children();
    dash._separator = null;
    dash._queueRedisplay();
}

function dash_move_labels(settings, label) {
    global.vertical_overview.dash_move_labels = settings.get_boolean(label);
}

export function dash_old_style() {
    const dash = Main.overview._overview._controls.dash;

    if (global.vertical_overview.dash_override) {
        if (global.vertical_overview.default_old_style_enabled)
            dash.add_style_class_name('vertical-overview');
        else
            dash.remove_style_class_name('vertical-overview');

        if (global.vertical_overview.old_style_enabled)
            dash.add_style_class_name('vertical-overview-old-dash');
        else
            dash.remove_style_class_name('vertical-overview-old-dash');
    }
}

function dash_disable_style() {
    const dash = Main.overview._overview._controls.dash;
    dash.remove_style_class_name('vertical-overview');
    dash.remove_style_class_name('vertical-overview-old-dash');
}

function set_to_horizontal() {
    const dash = Main.overview._overview._controls.dash;
    dash._workId = global.vertical_overview.dash_workId;
    dash._box.layout_manager.orientation = Clutter.Orientation.HORIZONTAL;
    dash._dashContainer.layout_manager.orientation = Clutter.Orientation.HORIZONTAL;
    dash._dashContainer.y_expand = true;
    dash._dashContainer.x_expand = false;
    dash.x_align = Clutter.ActorAlign.CENTER;
    dash.y_align = 0;

    dash_disable_style();

    const sizerBox = dash._background.get_children()[0];
    sizerBox.clear_constraints();
    sizerBox.add_constraint(new Clutter.BindConstraint({
        source: dash._showAppsIcon.icon,
        coordinate: Clutter.BindCoordinate.HEIGHT,
    }));
    sizerBox.add_constraint(new Clutter.BindConstraint({
        source: dash._dashContainer,
        coordinate: Clutter.BindCoordinate.WIDTH,
    }));

    dash._box.remove_all_children();
    dash._separator = null;
    dash._queueRedisplay();
}

var DashItemContainerOverride = {
    showLabel() {
        if (!this._labelText)
            return;

        this.label.set_text(this._labelText);
        this.label.opacity = 0;
        this.label.show();

        const [stageX, stageY] = this.get_transformed_position();

        let x, y;
        if (global.vertical_overview.dash_move_labels) {
            const itemHeight = this.allocation.get_height();
            const labelHeight = this.label.get_height();
            const yOffset = Math.floor((itemHeight - labelHeight) / 2);
            const node = this.label.get_theme_node();
            const xOffset = node.get_length('-x-offset');

            x = stageX + this.width + xOffset;
            y = Math.clamp(stageY + yOffset, 0, global.stage.height - labelHeight);
        } else {
            const itemWidth = this.allocation.get_width();
            const labelWidth = this.label.get_width();
            const xOffset = Math.floor((itemWidth - labelWidth) / 2);
            const node = this.label.get_theme_node();
            const yOffset = node.get_length('-y-offset');

            x = Math.clamp(stageX + xOffset, 0, global.stage.width - labelWidth);
            y = stageY - this.label.height - yOffset;
        }

        this.label.set_position(x, y);
        this.label.ease({
            opacity: 255,
            duration: DASH_ITEM_LABEL_SHOW_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    },
};

var DashOverride = {
    handleDragOver(_source, _actor, _x, y, _time) {
        const app = getAppFromSource(_source);

        if (app === null || app.is_window_backed())
            return DND.DragMotionResult.NO_DROP;

        if (!global.settings.is_writable('favorite-apps'))
            return DND.DragMotionResult.NO_DROP;

        const favorites = AppFavorites.getAppFavorites().getFavorites();
        const numFavorites = favorites.length;
        const favPos = favorites.indexOf(app);

        const children = this._box.get_children();
        let numChildren = children.length;
        let boxHeight = this._box.height;

        if (this._dragPlaceholder) {
            boxHeight -= this._dragPlaceholder.height;
            numChildren--;
        }

        if (this._separator) {
            boxHeight -= this._separator.height;
            numChildren--;
        }

        let pos;
        if (!this._emptyDropTarget)
            pos = Math.floor(y * numChildren / boxHeight);
        else
            pos = 0;

        if (pos > numFavorites)
            pos = numFavorites;

        if (pos !== this._dragPlaceholderPos && this._animatingPlaceholdersCount === 0) {
            this._dragPlaceholderPos = pos;

            if (favPos !== -1 && (pos === favPos || pos === favPos + 1)) {
                this._clearDragPlaceholder();
                return DND.DragMotionResult.CONTINUE;
            }

            let fadeIn;
            if (this._dragPlaceholder) {
                this._dragPlaceholder.destroy();
                fadeIn = false;
            } else {
                fadeIn = true;
            }

            this._dragPlaceholder = new DragPlaceholderItem();
            this._dragPlaceholder.child.set_width(this.iconSize / 2);
            this._dragPlaceholder.child.set_height(this.iconSize);
            this._box.insert_child_at_index(this._dragPlaceholder, this._dragPlaceholderPos);
            this._dragPlaceholder.show(fadeIn);
        }

        if (!this._dragPlaceholder)
            return DND.DragMotionResult.NO_DROP;

        return favPos !== -1
            ? DND.DragMotionResult.MOVE_DROP
            : DND.DragMotionResult.COPY_DROP;
    },

    _redisplay() {
        const favorites = AppFavorites.getAppFavorites().getFavoriteMap();
        const running = this._appSystem.get_running();

        const children = this._box.get_children().filter(actor =>
            actor.child?._delegate?.app);
        const oldApps = children.map(actor => actor.child._delegate.app);
        const newApps = [];

        for (const id in favorites)
            newApps.push(favorites[id]);

        for (const app of running) {
            if (app.get_id() in favorites)
                continue;
            newApps.push(app);
        }

        const addedItems = [];
        const removedActors = [];

        let newIndex = 0;
        let oldIndex = 0;
        while (newIndex < newApps.length || oldIndex < oldApps.length) {
            const oldApp = oldApps.length > oldIndex ? oldApps[oldIndex] : null;
            const newApp = newApps.length > newIndex ? newApps[newIndex] : null;

            if (oldApp === newApp) {
                oldIndex++;
                newIndex++;
                continue;
            }

            if (oldApp && !newApps.includes(oldApp)) {
                removedActors.push(children[oldIndex]);
                oldIndex++;
                continue;
            }

            if (newApp && !oldApps.includes(newApp)) {
                addedItems.push({
                    app: newApp,
                    item: this._createAppItem(newApp),
                    pos: newIndex,
                });
                newIndex++;
                continue;
            }

            const nextApp = newApps.length > newIndex + 1 ? newApps[newIndex + 1] : null;
            const insertHere = nextApp && nextApp === oldApp;
            const alreadyRemoved = removedActors.reduce((result, actor) => {
                const removedApp = actor.child._delegate.app;
                return result || removedApp === newApp;
            }, false);

            if (insertHere || alreadyRemoved) {
                addedItems.push({
                    app: newApp,
                    item: this._createAppItem(newApp),
                    pos: newIndex + removedActors.length,
                });
                newIndex++;
            } else {
                removedActors.push(children[oldIndex]);
                oldIndex++;
            }
        }

        for (const { item, pos } of addedItems)
            this._box.insert_child_at_index(item, pos);

        for (const item of removedActors) {
            if (Main.overview.visible && !Main.overview.animationInProgress)
                item.animateOutAndDestroy();
            else
                item.destroy();
        }

        this._adjustIconSize();

        const animate = this._shownInitially && Main.overview.visible &&
            !Main.overview.animationInProgress;

        if (!this._shownInitially)
            this._shownInitially = true;

        for (const { item } of addedItems)
            item.show(animate);

        const nFavorites = Object.keys(favorites).length;
        const nIcons = children.length + addedItems.length - removedActors.length;
        if (nFavorites > 0 && nFavorites < nIcons) {
            if (this._separator && this._separator.height !== 1) {
                this._separator.destroy();
                this._separator = null;
            }

            if (!this._separator) {
                this._separator = new St.Widget({
                    style_class: 'dash-separator',
                    x_align: Clutter.ActorAlign.CENTER,
                    y_align: Clutter.ActorAlign.CENTER,
                    width: this.iconSize,
                    height: 1,
                });
                this._box.add_child(this._separator);
            }

            let pos = nFavorites;
            if (this._dragPlaceholder)
                pos++;
            this._box.set_child_at_index(this._separator, pos);
        } else if (this._separator) {
            this._separator.destroy();
            this._separator = null;
        }

        this._box.queue_relayout();
    },

    _adjustIconSize() {
        let iconChildren = this._box.get_children().filter(actor =>
            actor.child?._delegate?.icon && !actor.animatingOut);

        iconChildren.push(this._showAppsIcon);

        if (this._maxWidth === -1 || this._maxHeight === -1)
            return;

        const themeNode = this.get_theme_node();
        const maxAllocation = new Clutter.ActorBox({
            x1: 0, y1: 0, x2: 42, y2: this._maxHeight,
        });

        const maxContent = themeNode.get_content_box(maxAllocation);
        const spacing = themeNode.get_length('spacing');

        const firstButton = iconChildren[0].child;
        const firstIcon = firstButton._delegate.icon;

        firstIcon.icon.ensure_style();
        const [, , iconWidth, iconHeight] = firstIcon.icon.get_preferred_size();
        const [, , buttonWidth, buttonHeight] = firstButton.get_preferred_size();

        let availWidth = this._maxWidth;
        availWidth -= this._background.get_theme_node().get_horizontal_padding();
        availWidth -= themeNode.get_horizontal_padding();
        availWidth -= buttonWidth - iconWidth;

        let availHeight = maxContent.y2 - maxContent.y1;
        availHeight -= iconChildren.length * (buttonHeight - iconHeight) +
            (iconChildren.length - 1) * spacing;

        const maxIconSize = Math.min(availWidth, availHeight / iconChildren.length);

        const scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const iconSizes = baseIconSizes.map(s => s * scaleFactor);

        let newIconSize = baseIconSizes[0];
        for (let i = 0; i < iconSizes.length; i++) {
            if (iconSizes[i] <= maxIconSize)
                newIconSize = baseIconSizes[i];
        }

        if (this.maxIconSizeOverride > 0 && this.maxIconSizeOverride < newIconSize)
            newIconSize = this.maxIconSizeOverride;

        if (newIconSize === this.iconSize)
            return;

        const oldIconSize = this.iconSize;
        this.iconSize = newIconSize;
        this.emit('icon-size-changed');

        const scale = oldIconSize / newIconSize;
        for (const iconChild of iconChildren) {
            const icon = iconChild.child._delegate.icon;
            icon.setIconSize(this.iconSize);

            if (!Main.overview.visible || Main.overview.animationInProgress ||
                !this._shownInitially)
                continue;

            const [targetWidth, targetHeight] = icon.icon.get_size();
            icon.icon.set_size(icon.icon.width * scale, icon.icon.height * scale);
            icon.icon.ease({
                width: targetWidth,
                height: targetHeight,
                duration: DASH_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }

        if (this._separator) {
            this._separator.ease({
                width: this.iconSize,
                duration: DASH_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }
    },

    _createAppItem(app) {
        const appIcon = new DashIcon(app);

        if (this.customRunIndicatorEnabled) {
            const indicator = appIcon._dot;
            indicator.x_align = Clutter.ActorAlign.START;
            indicator.y_align = null;
        }

        appIcon.connectObject('menu-state-changed',
            (o, opened) => {
                this._itemMenuStateChanged(item, opened);
            }, appIcon);

        const item = new DashItemContainer();
        item.setChild(appIcon);

        appIcon.label_actor = null;
        item.setLabelText(app.get_name());

        appIcon.icon.setIconSize(this.iconSize);
        this._hookUpLabel(item, appIcon);

        return item;
    },
};
