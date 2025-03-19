const { GLib, GObject, St, Shell, Clutter, Gio } = imports.gi;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const Me = imports.misc.extensionUtils.getCurrentExtension();

let indicator;

function checkUnread() {
    return new Promise((resolve, reject) => {
        try {
            let proc = new Gio.Subprocess({
                argv: ['wmctrl', '-l'],
                flags: Gio.SubprocessFlags.STDOUT_PIPE
            });

            proc.init(null); // Initialize the subprocess

            proc.communicate_utf8_async(null, null, (proc, result) => {
                try {
                    let [success, output] = proc.communicate_utf8_finish(result);
                    if (!success || !output) return resolve(false);

                    // Check if Microsoft Teams window is open and contains the string "Teams - Chat"
                    const isUnread = !output.includes('Teams - Chat');

                    resolve(isUnread);
                } catch (e) {
                    logError(e, 'Error processing unread messages');
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

            this.icon = new St.Icon({
                gicon: Gio.icon_new_for_string(Me.path + '/ms-teams-indicator-icon.svg'),
                style_class: 'system-status-icon'
            });
            this.add_child(this.icon);

            this._updateIcon();
            this._timeout = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT,
                5,
                () => {
                    this._updateIcon();
                    return true;
                }
            );

            // Add the click event handler to open the Microsoft Teams window
            this.connect('button-press-event', this._onClick.bind(this));
        }

        _updateIcon() {
            checkUnread().then((unread) => {
                // Update the icon based on the unread status
                this.icon.gicon = Gio.icon_new_for_string(
                    Me.path + (unread ? '/ms-teams-indicator-icon-alert.svg' : '/ms-teams-indicator-icon.svg')
                );
            }).catch((error) => {
                console.error('Error checking unread status:', error);
            });
        }

        _onClick() {
            try {
                // Use wmctrl to activate the Microsoft Teams window
                const [success, pid] = GLib.spawn_async(
                    null, // Working directory (null for current)
                    ['wmctrl', '-a', 'Microsoft Teams'], // Command and arguments
                    null, // Environment (null for default)
                    GLib.SpawnFlags.SEARCH_PATH, // Use SEARCH_PATH to find the command
                    null // Child setup function (null for default)
                );

                if (success) {
                    console.log('Successfully opened or focused Microsoft Teams window');
                } else {
                    console.error('Failed to open or focus Teams window');
                }
            } catch (e) {
                console.error('Error opening Teams window:', e.message);
            }
        }

        stop() {
            if (this._timeout) GLib.source_remove(this._timeout);
            this._timeout = null;
        }
    });

function init() {
}

function enable() {
    indicator = new TeamsIndicator();
    Main.panel.addToStatusArea('ms-teams-indicator', indicator);
}

function disable() {
    if (indicator) {
        indicator.stop();
        indicator.destroy();
        indicator = null;
    }
}
