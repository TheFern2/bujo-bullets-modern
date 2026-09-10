# BuJo Bullets Modern

A modern [Bullet Journal](https://bulletjournal.com/) task workflow for Obsidian. It adds the classic BuJo signifiers as first-class checkbox states — including the **work-in-progress `/`** state — and lets you set or cycle them with commands, hotkeys, the ribbon, or a right-click menu.

## States

| Marker    | Meaning              | Rendered as                    |
| --------- | -------------------- | ------------------------------ |
| `- [ ]`   | To-do                | Empty box                      |
| `- [/]`   | In progress (WIP)    | Half-filled amber box          |
| `- [x]`   | Done                 | Checked box (optional strike)  |
| `- [>]`   | Migrated             | Blue right chevron             |
| `- [<]`   | Scheduled            | Purple left chevron            |
| `- [-]`   | Cancelled            | Muted box + strikethrough      |
| `- [o]`   | Event                | Cyan ring                      |
| `- [n]`   | Note                 | Green dot                      |
| `- [!]`   | Important            | Red box                        |
| `- [?]`   | Question / explore   | Yellow box                     |

Colors use Obsidian's theme tokens, so they adapt to light and dark themes.

## Usage

- **Cycle a task**: run `BuJo Bullets Modern: Cycle task status` (bind a hotkey), click the ribbon icon, or select multiple lines to cycle them together. By default the cycle is To-do → In progress → Done.
- **Set a specific state**: run `BuJo Bullets Modern: Set status: …` (one command per state — bind hotkeys to the ones you use).
- **Right-click** in the editor and pick a state from the **BuJo status** submenu.

All actions work on the current line or across a multi-line selection. Non-list lines are promoted to `- [ ]` tasks automatically.

## Settings

- Choose which states are part of the cycle rotation (and the order follows the table above).
- Toggle the right-click submenu.
- Toggle strikethrough for done / cancelled tasks.

## Development

```bash
npm install
npm run dev      # watch + rebuild main.js
npm run build    # type-check + production bundle
```

### Installing into a vault manually

Copy `manifest.json`, `main.js`, and `styles.css` into
`<your-vault>/.obsidian/plugins/bujo-bullets-modern/`, then enable the plugin
in **Settings → Community plugins**.

You can also symlink this folder there during development:

```bash
ln -s "$(pwd)" "<your-vault>/.obsidian/plugins/bujo-bullets-modern"
```

## License

MIT
