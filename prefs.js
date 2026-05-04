import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

const BuilderScope = GObject.registerClass({
    GTypeName: 'VerticalOverviewBuilderScope',
    Implements: [Gtk.BuilderScope],
}, class BuilderScope extends GObject.Object {
    constructor(settings) {
        super();
        this._settings = settings;
    }

    _init(settings) {
        super._init();
        this._settings = settings;
    }

    vfunc_create_closure(builder, handlerName, flags, connectObject) {
        if (flags & Gtk.BuilderClosureFlags.SWAPPED)
            throw new Error('Unsupported template signal flag "swapped"');

        if (typeof this[handlerName] === 'undefined')
            throw new Error(`${handlerName} is undefined`);

        return this[handlerName].bind(connectObject || this);
    }

    _onIntValueChanged(value) {
        const current = this._settings.get_int(value.name);
        if (value.value !== current)
            this._settings.set_int(value.name, value.value);
    }

    _onBoolValueChanged(value) {
        const current = this._settings.get_boolean(value.name);
        if (value.active !== current)
            this._settings.set_boolean(value.name, value.active);
    }
});

export default class VerticalOverviewPreferences {
    constructor(metadata) {
        this.metadata = metadata;
        this.path = metadata.path;
    }

    getSettings(schema) {
        const GioSSS = Gio.SettingsSchemaSource;
        const schemaSource = GioSSS.new_from_directory(
            `${this.path}/schemas`,
            GioSSS.get_default(),
            false
        );
        const schemaObj = schemaSource.lookup(schema, true);
        if (!schemaObj)
            throw new Error(`Schema ${schema} could not be found`);
        return new Gio.Settings({ settings_schema: schemaObj });
    }

    getPreferencesWidget() {
        const settings = this.getSettings('org.gnome.shell.extensions.vertical-overview');

        const builder = new Gtk.Builder();
        builder.set_scope(new BuilderScope(settings));
        builder.set_translation_domain('gettext-domain');
        builder.add_from_file(`${this.path}/settings.ui`);

        for (const key of settings.list_keys()) {
            const obj = builder.get_object(key);
            if (!obj) continue;
            const value = settings.get_value(key);
            switch (value.get_type_string()) {
            case 'i': obj.set_property('value', value.get_int32()); break;
            case 'b': obj.set_property('active', value.get_boolean()); break;
            }
        }

        return builder.get_object('main_widget');
    }
}
