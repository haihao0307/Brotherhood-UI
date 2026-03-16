# macOS First Run

If macOS blocks the launcher with a security warning, this is usually Gatekeeper quarantine rather than a script bug.

## Recommended first run

1. Open Terminal.
2. `cd` into the project folder.
3. Run:

```bash
xattr -dr com.apple.quarantine .
chmod +x "Brotherhood-UI Launcher.command" "Create Desktop Shortcuts.command" "brotherhood-ui.sh" "Brotherhood-UI Launcher.app/Contents/MacOS/Brotherhood-UI Launcher"
```

4. Then run:

```bash
./Create\ Desktop\ Shortcuts.command
open "Brotherhood-UI Launcher.app"
```

## Finder alternative

You can also try:

1. Right-click `Brotherhood-UI Launcher.app`
2. Click `Open`
3. Click `Open` again in the macOS warning dialog

If you want the desktop shortcut helper, repeat the same for `Create Desktop Shortcuts.command` if needed.
