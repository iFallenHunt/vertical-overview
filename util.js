import Gio from 'gi://Gio';

let _extension = null;

export function init(extension) {
    _extension = extension;
}

export function overrideProto(proto, overrides) {
    const backup = {};

    for (const symbol in overrides) {
        if (symbol.startsWith('after_')) {
            const actualSymbol = symbol.slice('after_'.length);
            const fn = proto[actualSymbol];
            const afterFn = overrides[symbol];
            proto[actualSymbol] = function() {
                const args = Array.prototype.slice.call(arguments);
                const res = fn.apply(this, args);
                afterFn.apply(this, args);
                return res;
            };
            backup[actualSymbol] = fn;
        } else {
            backup[symbol] = proto[symbol];
            proto[symbol] = overrides[symbol];
        }
    }
    return backup;
}

export function bindSetting(label, callback, executeOnBind = true) {
    let settings = global.vertical_overview.settings;
    if (!settings) {
        settings = global.vertical_overview.settings = {
            object: _extension.getSettings('org.gnome.shell.extensions.vertical-overview'),
            signals: {},
            callbacks: {},
        };
    }

    if (settings.signals[label])
        settings.object.disconnect(settings.signals[label]);

    const signal = global.vertical_overview.settings.object.connect(
        `changed::${label}`, callback);
    global.vertical_overview.settings.signals[label] = signal;
    settings.callbacks[label] = callback;

    if (executeOnBind)
        callback(settings.object, label);
    return signal;
}

export function unbindSetting(label, callback) {
    const settings = global.vertical_overview.settings;
    if (!settings || !settings.signals[label])
        return;

    if (callback)
        callback(settings.object, label);

    settings.object.disconnect(settings.signals[label]);
    delete settings.signals[label];

    if (settings.callbacks[label])
        delete settings.callbacks[label];
}
