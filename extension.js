const { GLib, GObject, St, Shell, Clutter, Gio } = imports.gi;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const ExtensionUtils = imports.misc.extensionUtils;

let indicator;

function checkUnread(teamsAppName) {
    return new Promise((resolve, reject) => {
        try {
            // Check if wmctrl is installed
            if (!GLib.find_program_in_path('wmctrl')) {
                logError(new Error('wmctrl is not installed'));
                return resolve(false);
            }

            let proc = new Gio.Subprocess({
                argv: ['wmctrl', '-l'],
                flags: Gio.SubprocessFlags.STDOUT_PIPE
            });

            proc.init(null);

            proc.communicate_utf8_async(null, null, (proc, result) => {
                try {
                    let [success, output] = proc.communicate_utf8_finish(result);
                    if (!success || !output) {
                        logError(new Error('Failed to get window list'));
                        return resolve(false);
                    }

                    const isUnread = !output.includes(teamsAppName);
                    resolve(isUnread);
                } catch (e) {
                    logError(e, 'Error processing window list');
                    resolve(false);
                }
            });
        } catch (e) {
            logError(e, 'Error checking unread messages');
            resolve(false);
        }
    });
}

const TeamsIndicator = GObject.registerClass(
    class TeamsIndicator extends PanelMenu.Button {
        _init() {
            super._init(0.0, 'MS Teams Indicator');

            // Get teams app name from settings
            this._settings = ExtensionUtils.getSettings(
                'org.gnome.shell.extensions.ms-teams-indicator'
            );
            this.teamsAppName = this._settings.get_string('ms-teams-app-name');

            // Create the panel icon
            this.icon = new St.Icon({
                gicon: Gio.icon_new_for_string(Me.path + '/assets/ms-teams-indicator-icon.svg'),
                style_class: 'system-status-icon'
            });
            this.add_child(this.icon);

            // Set up periodic updates
            this._updateIcon(this.teamsAppName);
            this._timeout = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT,
                3,
                () => {
                    this._updateIcon(this.teamsAppName);
                    return true;
                }
            );

            this.connect('button-press-event', this._onClick.bind(this));

            // Watch for settings changes
            this._settingsChangedId = this._settings.connect('changed::ms-teams-app-name',
                () => {
                    this.teamsAppName = this._settings.get_string('ms-teams-app-name');
                }
            );
        }

        _updateIcon(teamsAppName) {
            checkUnread(teamsAppName).then((unread) => {
                this.icon.gicon = Gio.icon_new_for_string(
                    Me.path + (unread ? '/assets/ms-teams-indicator-icon-alert.svg' : '/assets/ms-teams-indicator-icon.svg')
                );
            }).catch((error) => {
                logError(error, 'Error updating icon');
            });
        }

        _onClick() {
            if (!GLib.find_program_in_path('wmctrl')) {
                logError(new Error('wmctrl is not installed. Please install it to use this feature.'));
                return;
            }

            try {
                const [success, pid] = GLib.spawn_async(
                    null,
                    ['wmctrl', '-a', this.teamsAppName],
                    null,
                    GLib.SpawnFlags.SEARCH_PATH,
                    null
                );

                if (!success) {
                    logError(new Error('Failed to focus Teams window'));
                }
            } catch (e) {
                logError(e, 'Error focusing Teams window');
            }
        }

        destroy() {
            if (this._timeout) {
                GLib.source_remove(this._timeout);
                this._timeout = null;
            }

            if (this._settingsChangedId) {
                this._settings.disconnect(this._settingsChangedId);
                this._settingsChangedId = null;
            }

            super.destroy();
        }
    }
);

function init() {
}

function enable() {
    indicator = new TeamsIndicator();
    Main.panel.addToStatusArea('ms-teams-indicator', indicator);
}

function disable() {
    if (indicator) {
        indicator.destroy();
        indicator = null;
    }
}
