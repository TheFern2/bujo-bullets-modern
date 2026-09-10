import {
  App,
  Editor,
  MarkdownView,
  Menu,
  Plugin,
  PluginSettingTab,
  Setting,
} from "obsidian";

/**
 * A single Bullet Journal signifier / task state.
 *
 * `symbol` is the single character placed inside the markdown checkbox, e.g.
 * the `/` in `- [/] write plugin`. A single space (" ") represents an open,
 * not-yet-started task (`- [ ]`).
 */
interface BujoStatusDef {
  id: string;
  symbol: string;
  name: string;
  description: string;
  /** Whether this state is part of the click/cycle rotation by default. */
  defaultInCycle: boolean;
}

/**
 * The full BuJo vocabulary this plugin understands. Order matters: the status
 * cycle walks these top-to-bottom (filtered to the enabled ones), and the
 * right-click menu lists them in this order.
 */
const STATUSES: BujoStatusDef[] = [
  {
    id: "todo",
    symbol: " ",
    name: "To-do",
    description: "An open task you still need to do.",
    defaultInCycle: true,
  },
  {
    id: "inProgress",
    symbol: "/",
    name: "In progress (WIP)",
    description: "A task you have started but not finished.",
    defaultInCycle: true,
  },
  {
    id: "done",
    symbol: "x",
    name: "Done",
    description: "A completed task.",
    defaultInCycle: true,
  },
  {
    id: "migrated",
    symbol: ">",
    name: "Migrated",
    description: "Moved forward to a later day or another collection.",
    defaultInCycle: false,
  },
  {
    id: "scheduled",
    symbol: "<",
    name: "Scheduled",
    description: "Moved into the future log / calendar.",
    defaultInCycle: false,
  },
  {
    id: "cancelled",
    symbol: "-",
    name: "Cancelled",
    description: "No longer relevant; dropped.",
    defaultInCycle: false,
  },
  {
    id: "event",
    symbol: "o",
    name: "Event",
    description: "An event or appointment.",
    defaultInCycle: false,
  },
  {
    id: "note",
    symbol: "n",
    name: "Note",
    description: "A note, fact or observation.",
    defaultInCycle: false,
  },
  {
    id: "important",
    symbol: "!",
    name: "Important",
    description: "A priority signifier.",
    defaultInCycle: false,
  },
  {
    id: "question",
    symbol: "?",
    name: "Question / explore",
    description: "Something to investigate or decide.",
    defaultInCycle: false,
  },
];

/** States that can be colour-customised (every state except the empty to-do box). */
const COLORABLE_STATUSES = STATUSES.filter((s) => s.id !== "todo");

interface BujoSettings {
  /** Status ids (from STATUSES) in the primary cycle (everyday states). */
  primaryCycleIds: string[];
  /** Status ids (from STATUSES) in the secondary cycle (less-used states). */
  secondaryCycleIds: string[];
  /** Add a BuJo submenu to the editor right-click menu. */
  showContextMenu: boolean;
  /** Strike through the text of done tasks. */
  strikethroughDone: boolean;
  /** Strike through the text of cancelled tasks. */
  strikethroughCancelled: boolean;
  /** Base colour used by every state without its own override. "" = theme accent. */
  baseColor: string;
  /** Per-state colour overrides keyed by status id. Missing = use base colour. */
  colors: Record<string, string>;
}

const DEFAULT_SETTINGS: BujoSettings = {
  primaryCycleIds: ["todo", "inProgress", "done"],
  secondaryCycleIds: ["migrated", "scheduled", "cancelled"],
  showContextMenu: true,
  strikethroughDone: true,
  strikethroughCancelled: true,
  baseColor: "",
  colors: {},
};

/** CSS custom property that carries a given state's colour. */
function colorVarName(id: string): string {
  return `--bujo-color-${id.toLowerCase()}`;
}

/** Parses one editor line into its list/checkbox parts. */
interface ParsedLine {
  /** Leading whitespace. */
  indent: string;
  /** List bullet token, e.g. "-", "*", "+", "1.", "2)". Empty if not a list item. */
  bullet: string;
  /** Whitespace between the bullet and the content. */
  gap: string;
  /** true when the line is a markdown list item. */
  isListItem: boolean;
  /** true when the list item already has a `[x]` style checkbox. */
  hasCheckbox: boolean;
  /** The character currently inside the checkbox (" " for an open task). */
  symbol: string | null;
  /** The task/content text after the (optional) checkbox. */
  rest: string;
}

const LINE_RE = /^(\s*)([-*+]|\d+[.)])(\s+)(\[(.)\]\s+)?(.*)$/;

function parseLine(text: string): ParsedLine {
  const m = text.match(LINE_RE);
  if (!m) {
    const indentMatch = text.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : "";
    return {
      indent,
      bullet: "",
      gap: "",
      isListItem: false,
      hasCheckbox: false,
      symbol: null,
      rest: text.slice(indent.length),
    };
  }
  const [, indent, bullet, gap, checkboxPart, symbol, rest] = m;
  return {
    indent,
    bullet,
    gap,
    isListItem: true,
    hasCheckbox: !!checkboxPart,
    symbol: checkboxPart ? symbol : null,
    rest,
  };
}

/**
 * True when a non-list line may be promoted into a task. Blank lines, headings,
 * horizontal rules / frontmatter fences (`---`) and code fences are left alone
 * so we never create a stray checkbox on an unrelated line (e.g. the blank line
 * above a note's title when a command runs on a stale cursor position).
 */
function isPromotable(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  if (/^#{1,6}(\s|$)/.test(trimmed)) return false; // heading
  if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) return false; // hr / frontmatter fence
  if (/^(```|~~~)/.test(trimmed)) return false; // code fence
  if (trimmed.startsWith(">")) return false; // blockquote
  return true;
}

/**
 * Rebuilds a line with the given checkbox symbol, creating list/checkbox
 * scaffolding as needed. Returns `null` when the line should be left untouched
 * (a non-list line that isn't safe to promote).
 */
function buildLine(parsed: ParsedLine, symbol: string): string | null {
  if (!parsed.isListItem) {
    if (!isPromotable(parsed.rest)) return null;
    // Promote a plain text line to a task.
    return `${parsed.indent}- [${symbol}] ${parsed.rest}`;
  }
  return `${parsed.indent}${parsed.bullet}${parsed.gap}[${symbol}] ${parsed.rest}`;
}

export default class BujoBulletsPlugin extends Plugin {
  settings: BujoSettings = { ...DEFAULT_SETTINGS };
  /** The most recent right-click event, used to resolve the clicked line. */
  private lastContextEvent: MouseEvent | null = null;

  async onload() {
    await this.loadSettings();
    this.updateBodyClasses();
    this.updateColors();

    // Capture the right-click position before Obsidian opens the editor menu,
    // so the menu can act on the line under the pointer rather than on the
    // editor's cursor (which does not reliably follow a right-click).
    this.registerDomEvent(
      document,
      "contextmenu",
      (evt) => {
        this.lastContextEvent = evt;
      },
      { capture: true }
    );

    // Primary cycle (everyday states, e.g. To-do -> In progress -> Done).
    this.addCommand({
      id: "cycle-bujo-status",
      name: "Cycle task status (primary)",
      editorCallback: (editor) =>
        this.cycleSelection(editor, this.settings.primaryCycleIds),
    });

    // Secondary cycle (less-used states, e.g. Migrated -> Scheduled -> Cancelled).
    this.addCommand({
      id: "cycle-bujo-status-secondary",
      name: "Cycle task status (secondary)",
      editorCallback: (editor) =>
        this.cycleSelection(editor, this.settings.secondaryCycleIds),
    });

    // One "set" command per status so users can bind hotkeys to their favourites.
    for (const status of STATUSES) {
      this.addCommand({
        id: `set-bujo-${status.id}`,
        name: `Set status: ${status.name} [${
          status.symbol === " " ? "space" : status.symbol
        }]`,
        editorCallback: (editor) => this.applyToSelection(editor, status.symbol),
      });
    }

    // Ribbon: cycle the primary status of the current line in the active editor.
    this.addRibbonIcon("circle-slash", "Cycle BuJo task status", () => {
      const editor = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
      if (editor) this.cycleSelection(editor, this.settings.primaryCycleIds);
    });

    // Right-click menu.
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor) => {
        if (!this.settings.showContextMenu) return;
        this.buildContextMenu(menu, editor);
      })
    );

    this.addSettingTab(new BujoSettingTab(this.app, this));
  }

  onunload() {
    document.body.removeClass("bujo-strike-done", "bujo-strike-cancelled");
    // Remove any colour variables we set inline on <body>.
    document.body.style.removeProperty("--bujo-color-default");
    for (const status of COLORABLE_STATUSES) {
      document.body.style.removeProperty(colorVarName(status.id));
    }
  }

  /** Adds a "BuJo status" submenu to the editor context menu. */
  private buildContextMenu(menu: Menu, editor: Editor) {
    menu.addItem((item) => {
      item.setTitle("BuJo status").setIcon("check-circle");
      // setSubmenu() exists in the current API but is not yet in the public types.
      const sub: Menu = (item as unknown as { setSubmenu: () => Menu }).setSubmenu();
      const clickedLine = this.resolveClickLine(editor);
      for (const status of STATUSES) {
        sub.addItem((sc) =>
          sc
            .setTitle(`${status.name}  [${status.symbol === " " ? "␣" : status.symbol}]`)
            .onClick(() => {
              if (clickedLine !== null) {
                this.applyToLines(editor, [clickedLine], status.symbol);
              } else {
                this.applyToSelection(editor, status.symbol);
              }
            })
        );
      }
    });
  }

  /** Symbols that make up a cycle, in STATUSES order. May be empty. */
  private cycleSymbols(ids: string[]): string[] {
    return STATUSES.filter((s) => ids.includes(s.id)).map((s) => s.symbol);
  }

  /** Line numbers touched by the current selection(s), or the cursor line. */
  private targetLines(editor: Editor): number[] {
    const lines = new Set<number>();
    for (const sel of editor.listSelections()) {
      const start = Math.min(sel.anchor.line, sel.head.line);
      const end = Math.max(sel.anchor.line, sel.head.line);
      for (let l = start; l <= end; l++) lines.add(l);
    }
    if (lines.size === 0) lines.add(editor.getCursor().line);
    return [...lines].sort((a, b) => a - b);
  }

  /**
   * Resolves the editor line under the last right-click using its pixel
   * coordinates (CodeMirror maps the y position to a document line, which is
   * far more reliable than the cursor after a right-click). Returns null when
   * it cannot be determined (e.g. not in the CM editor).
   */
  private resolveClickLine(editor: Editor): number | null {
    const evt = this.lastContextEvent;
    if (!evt) return null;
    const cm = (editor as unknown as { cm?: { posAtCoords: (c: { x: number; y: number }) => number | null } }).cm;
    if (!cm || typeof cm.posAtCoords !== "function") return null;
    const offset = cm.posAtCoords({ x: evt.clientX, y: evt.clientY });
    if (offset == null) return null;
    return editor.offsetToPos(offset).line;
  }

  /** Sets an explicit status symbol on each of the given lines. */
  private applyToLines(editor: Editor, lines: number[], symbol: string) {
    for (const line of lines) {
      if (line < 0 || line >= editor.lineCount()) continue;
      const parsed = parseLine(editor.getLine(line));
      const next = buildLine(parsed, symbol);
      if (next !== null) editor.setLine(line, next);
    }
  }

  /** Sets an explicit status symbol on every line touched by the selection/cursor. */
  private applyToSelection(editor: Editor, symbol: string) {
    this.applyToLines(editor, this.targetLines(editor), symbol);
  }

  /** Advances every targeted line to the next status in the given cycle. */
  private cycleSelection(editor: Editor, ids: string[]) {
    const order = this.cycleSymbols(ids);
    if (order.length === 0) return;
    for (const line of this.targetLines(editor)) {
      const parsed = parseLine(editor.getLine(line));
      // Only cycle lines that are already list items; never conjure a task
      // out of a blank/heading/other line during a cycle.
      if (!parsed.isListItem) continue;
      const current = parsed.hasCheckbox ? parsed.symbol : null;
      let nextSymbol: string;
      if (current === null) {
        nextSymbol = order[0];
      } else {
        const idx = order.indexOf(current);
        nextSymbol =
          idx === -1 ? order[0] : order[(idx + 1) % order.length];
      }
      const next = buildLine(parsed, nextSymbol);
      if (next !== null) editor.setLine(line, next);
    }
  }

  updateBodyClasses() {
    document.body.toggleClass("bujo-strike-done", this.settings.strikethroughDone);
    document.body.toggleClass(
      "bujo-strike-cancelled",
      this.settings.strikethroughCancelled
    );
  }

  /** Pushes the configured colours onto <body> as CSS variables (or clears them). */
  updateColors() {
    const style = document.body.style;
    const set = (name: string, value: string) => {
      if (value) style.setProperty(name, value);
      else style.removeProperty(name);
    };
    set("--bujo-color-default", this.settings.baseColor);
    for (const status of COLORABLE_STATUSES) {
      set(colorVarName(status.id), this.settings.colors[status.id] ?? "");
    }
  }

  async loadSettings() {
    const data = (await this.loadData()) as
      | (Partial<BujoSettings> & { cycleStatusIds?: string[] })
      | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
    // Migrate the old single-cycle setting into the primary cycle.
    if (data && data.cycleStatusIds && !data.primaryCycleIds) {
      this.settings.primaryCycleIds = data.cycleStatusIds;
    }
    if (!this.settings.colors) this.settings.colors = {};
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.updateBodyClasses();
    this.updateColors();
  }
}

class BujoSettingTab extends PluginSettingTab {
  plugin: BujoBulletsPlugin;

  constructor(app: App, plugin: BujoBulletsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  /** Renders a per-status toggle list bound to one of the cycle settings. */
  private addCycleSection(
    containerEl: HTMLElement,
    title: string,
    desc: string,
    key: "primaryCycleIds" | "secondaryCycleIds"
  ): void {
    new Setting(containerEl).setName(title).setHeading();
    containerEl.createEl("p", { text: desc, cls: "setting-item-description" });

    for (const status of STATUSES) {
      const label = status.symbol === " " ? "space" : status.symbol;
      new Setting(containerEl)
        .setName(`${status.name}  [${label}]`)
        .setDesc(status.description)
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings[key].includes(status.id))
            .onChange(async (value) => {
              const set = new Set(this.plugin.settings[key]);
              if (value) set.add(status.id);
              else set.delete(status.id);
              // Preserve canonical STATUSES order.
              this.plugin.settings[key] = STATUSES.filter((s) =>
                set.has(s.id)
              ).map((s) => s.id);
              await this.plugin.saveSettings();
            })
        );
    }
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    this.addCycleSection(
      containerEl,
      "Primary cycle",
      "Your everyday states. Bind a hotkey to \"Cycle task status (primary)\" (also on the ribbon). States rotate in the order listed below.",
      "primaryCycleIds"
    );

    this.addCycleSection(
      containerEl,
      "Secondary cycle",
      "Less-used states. Bind a hotkey to \"Cycle task status (secondary)\". Pressing it on a task not already in this cycle sets the first state below.",
      "secondaryCycleIds"
    );

    new Setting(containerEl).setName("Appearance & behaviour").setHeading();

    new Setting(containerEl)
      .setName("Right-click menu")
      .setDesc("Add a BuJo status submenu to the editor context menu.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showContextMenu)
          .onChange(async (value) => {
            this.plugin.settings.showContextMenu = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Strike through done tasks")
      .setDesc("Render the text of completed tasks with a line through it.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.strikethroughDone)
          .onChange(async (value) => {
            this.plugin.settings.strikethroughDone = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Strike through cancelled tasks")
      .setDesc("Render the text of cancelled tasks with a line through it.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.strikethroughCancelled)
          .onChange(async (value) => {
            this.plugin.settings.strikethroughCancelled = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl).setName("Colors").setHeading();
    containerEl.createEl("p", {
      text: "By default every state uses the base color, so the whole set looks consistent. Change the base color, or give individual states their own. The reset button returns a state to the base color.",
      cls: "setting-item-description",
    });

    const fallback = this.accentHex();

    new Setting(containerEl)
      .setName("Base color")
      .setDesc("Used by every state without its own color. Reset to follow your theme's accent color.")
      .addColorPicker((picker) =>
        picker
          .setValue(this.plugin.settings.baseColor || fallback)
          .onChange(async (value) => {
            this.plugin.settings.baseColor = value;
            await this.plugin.saveSettings();
          })
      )
      .addExtraButton((btn) =>
        btn
          .setIcon("rotate-ccw")
          .setTooltip("Follow theme accent")
          .onClick(async () => {
            this.plugin.settings.baseColor = "";
            await this.plugin.saveSettings();
            this.display();
          })
      );

    for (const status of COLORABLE_STATUSES) {
      const label = status.symbol === " " ? "space" : status.symbol;
      const current = this.plugin.settings.colors[status.id];
      new Setting(containerEl)
        .setName(`${status.name}  [${label}]`)
        .addColorPicker((picker) =>
          picker
            .setValue(current || this.plugin.settings.baseColor || fallback)
            .onChange(async (value) => {
              this.plugin.settings.colors[status.id] = value;
              await this.plugin.saveSettings();
            })
        )
        .addExtraButton((btn) =>
          btn
            .setIcon("rotate-ccw")
            .setTooltip("Follow base color")
            .onClick(async () => {
              delete this.plugin.settings.colors[status.id];
              await this.plugin.saveSettings();
              this.display();
            })
        );
    }
  }

  /** Best-effort hex value of the theme accent, used as the color pickers' starting point. */
  private accentHex(): string {
    const raw = getComputedStyle(document.body)
      .getPropertyValue("--interactive-accent")
      .trim();
    return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw) ? raw : "#7c6bf0";
  }
}
