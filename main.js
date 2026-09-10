/*
BuJo Bullets Modern - bundled by esbuild.
If you want to view the source, please visit the GitHub repository of this plugin.
*/
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => BujoBulletsPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var STATUSES = [
  {
    id: "todo",
    symbol: " ",
    name: "To-do",
    description: "An open task you still need to do.",
    defaultInCycle: true
  },
  {
    id: "inProgress",
    symbol: "/",
    name: "In progress (WIP)",
    description: "A task you have started but not finished.",
    defaultInCycle: true
  },
  {
    id: "done",
    symbol: "x",
    name: "Done",
    description: "A completed task.",
    defaultInCycle: true
  },
  {
    id: "migrated",
    symbol: ">",
    name: "Migrated",
    description: "Moved forward to a later day or another collection.",
    defaultInCycle: false
  },
  {
    id: "scheduled",
    symbol: "<",
    name: "Scheduled",
    description: "Moved into the future log / calendar.",
    defaultInCycle: false
  },
  {
    id: "cancelled",
    symbol: "-",
    name: "Cancelled",
    description: "No longer relevant; dropped.",
    defaultInCycle: false
  },
  {
    id: "event",
    symbol: "o",
    name: "Event",
    description: "An event or appointment.",
    defaultInCycle: false
  },
  {
    id: "note",
    symbol: "n",
    name: "Note",
    description: "A note, fact or observation.",
    defaultInCycle: false
  },
  {
    id: "important",
    symbol: "!",
    name: "Important",
    description: "A priority signifier.",
    defaultInCycle: false
  },
  {
    id: "question",
    symbol: "?",
    name: "Question / explore",
    description: "Something to investigate or decide.",
    defaultInCycle: false
  }
];
var COLORABLE_STATUSES = STATUSES.filter((s) => s.id !== "todo");
var DEFAULT_SETTINGS = {
  primaryCycleIds: ["todo", "inProgress", "done"],
  secondaryCycleIds: ["migrated", "scheduled", "cancelled"],
  showContextMenu: true,
  strikethroughDone: true,
  strikethroughCancelled: true,
  baseColor: "",
  colors: {}
};
function colorVarName(id) {
  return `--bujo-color-${id.toLowerCase()}`;
}
var LINE_RE = /^(\s*)([-*+]|\d+[.)])(\s+)(\[(.)\]\s+)?(.*)$/;
function parseLine(text) {
  const m = text.match(LINE_RE);
  if (!m) {
    const indentMatch = text.match(/^(\s*)/);
    const indent2 = indentMatch ? indentMatch[1] : "";
    return {
      indent: indent2,
      bullet: "",
      gap: "",
      isListItem: false,
      hasCheckbox: false,
      symbol: null,
      rest: text.slice(indent2.length)
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
    rest
  };
}
function isPromotable(text) {
  const trimmed = text.trim();
  if (trimmed.length === 0)
    return false;
  if (/^#{1,6}(\s|$)/.test(trimmed))
    return false;
  if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed))
    return false;
  if (/^(```|~~~)/.test(trimmed))
    return false;
  if (trimmed.startsWith(">"))
    return false;
  return true;
}
function buildLine(parsed, symbol) {
  if (!parsed.isListItem) {
    if (!isPromotable(parsed.rest))
      return null;
    return `${parsed.indent}- [${symbol}] ${parsed.rest}`;
  }
  return `${parsed.indent}${parsed.bullet}${parsed.gap}[${symbol}] ${parsed.rest}`;
}
var BujoBulletsPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.settings = { ...DEFAULT_SETTINGS };
    /** The most recent right-click event, used to resolve the clicked line. */
    this.lastContextEvent = null;
  }
  async onload() {
    await this.loadSettings();
    this.updateBodyClasses();
    this.updateColors();
    this.registerDomEvent(
      document,
      "contextmenu",
      (evt) => {
        this.lastContextEvent = evt;
      },
      { capture: true }
    );
    this.addCommand({
      id: "cycle-bujo-status",
      name: "Cycle task status (primary)",
      editorCallback: (editor) => this.cycleSelection(editor, this.settings.primaryCycleIds)
    });
    this.addCommand({
      id: "cycle-bujo-status-secondary",
      name: "Cycle task status (secondary)",
      editorCallback: (editor) => this.cycleSelection(editor, this.settings.secondaryCycleIds)
    });
    for (const status of STATUSES) {
      this.addCommand({
        id: `set-bujo-${status.id}`,
        name: `Set status: ${status.name} [${status.symbol === " " ? "space" : status.symbol}]`,
        editorCallback: (editor) => this.applyToSelection(editor, status.symbol)
      });
    }
    this.addRibbonIcon("circle-slash", "Cycle BuJo task status", () => {
      var _a;
      const editor = (_a = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView)) == null ? void 0 : _a.editor;
      if (editor)
        this.cycleSelection(editor, this.settings.primaryCycleIds);
    });
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor) => {
        if (!this.settings.showContextMenu)
          return;
        this.buildContextMenu(menu, editor);
      })
    );
    this.addSettingTab(new BujoSettingTab(this.app, this));
  }
  onunload() {
    document.body.removeClass("bujo-strike-done", "bujo-strike-cancelled");
    document.body.style.removeProperty("--bujo-color-default");
    for (const status of COLORABLE_STATUSES) {
      document.body.style.removeProperty(colorVarName(status.id));
    }
  }
  /** Adds a "BuJo status" submenu to the editor context menu. */
  buildContextMenu(menu, editor) {
    menu.addItem((item) => {
      item.setTitle("BuJo status").setIcon("check-circle");
      const sub = item.setSubmenu();
      const clickedLine = this.resolveClickLine(editor);
      for (const status of STATUSES) {
        sub.addItem(
          (sc) => sc.setTitle(`${status.name}  [${status.symbol === " " ? "\u2423" : status.symbol}]`).onClick(() => {
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
  cycleSymbols(ids) {
    return STATUSES.filter((s) => ids.includes(s.id)).map((s) => s.symbol);
  }
  /** Line numbers touched by the current selection(s), or the cursor line. */
  targetLines(editor) {
    const lines = /* @__PURE__ */ new Set();
    for (const sel of editor.listSelections()) {
      const start = Math.min(sel.anchor.line, sel.head.line);
      const end = Math.max(sel.anchor.line, sel.head.line);
      for (let l = start; l <= end; l++)
        lines.add(l);
    }
    if (lines.size === 0)
      lines.add(editor.getCursor().line);
    return [...lines].sort((a, b) => a - b);
  }
  /**
   * Resolves the editor line under the last right-click using its pixel
   * coordinates (CodeMirror maps the y position to a document line, which is
   * far more reliable than the cursor after a right-click). Returns null when
   * it cannot be determined (e.g. not in the CM editor).
   */
  resolveClickLine(editor) {
    const evt = this.lastContextEvent;
    if (!evt)
      return null;
    const cm = editor.cm;
    if (!cm || typeof cm.posAtCoords !== "function")
      return null;
    const offset = cm.posAtCoords({ x: evt.clientX, y: evt.clientY });
    if (offset == null)
      return null;
    return editor.offsetToPos(offset).line;
  }
  /** Sets an explicit status symbol on each of the given lines. */
  applyToLines(editor, lines, symbol) {
    for (const line of lines) {
      if (line < 0 || line >= editor.lineCount())
        continue;
      const parsed = parseLine(editor.getLine(line));
      const next = buildLine(parsed, symbol);
      if (next !== null)
        editor.setLine(line, next);
    }
  }
  /** Sets an explicit status symbol on every line touched by the selection/cursor. */
  applyToSelection(editor, symbol) {
    this.applyToLines(editor, this.targetLines(editor), symbol);
  }
  /** Advances every targeted line to the next status in the given cycle. */
  cycleSelection(editor, ids) {
    const order = this.cycleSymbols(ids);
    if (order.length === 0)
      return;
    for (const line of this.targetLines(editor)) {
      const parsed = parseLine(editor.getLine(line));
      if (!parsed.isListItem)
        continue;
      const current = parsed.hasCheckbox ? parsed.symbol : null;
      let nextSymbol;
      if (current === null) {
        nextSymbol = order[0];
      } else {
        const idx = order.indexOf(current);
        nextSymbol = idx === -1 ? order[0] : order[(idx + 1) % order.length];
      }
      const next = buildLine(parsed, nextSymbol);
      if (next !== null)
        editor.setLine(line, next);
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
    var _a;
    const style = document.body.style;
    const set = (name, value) => {
      if (value)
        style.setProperty(name, value);
      else
        style.removeProperty(name);
    };
    set("--bujo-color-default", this.settings.baseColor);
    for (const status of COLORABLE_STATUSES) {
      set(colorVarName(status.id), (_a = this.settings.colors[status.id]) != null ? _a : "");
    }
  }
  async loadSettings() {
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
    if (data && data.cycleStatusIds && !data.primaryCycleIds) {
      this.settings.primaryCycleIds = data.cycleStatusIds;
    }
    if (!this.settings.colors)
      this.settings.colors = {};
  }
  async saveSettings() {
    await this.saveData(this.settings);
    this.updateBodyClasses();
    this.updateColors();
  }
};
var BujoSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  /** Renders a per-status toggle list bound to one of the cycle settings. */
  addCycleSection(containerEl, title, desc, key) {
    new import_obsidian.Setting(containerEl).setName(title).setHeading();
    containerEl.createEl("p", { text: desc, cls: "setting-item-description" });
    for (const status of STATUSES) {
      const label = status.symbol === " " ? "space" : status.symbol;
      new import_obsidian.Setting(containerEl).setName(`${status.name}  [${label}]`).setDesc(status.description).addToggle(
        (toggle) => toggle.setValue(this.plugin.settings[key].includes(status.id)).onChange(async (value) => {
          const set = new Set(this.plugin.settings[key]);
          if (value)
            set.add(status.id);
          else
            set.delete(status.id);
          this.plugin.settings[key] = STATUSES.filter(
            (s) => set.has(s.id)
          ).map((s) => s.id);
          await this.plugin.saveSettings();
        })
      );
    }
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    this.addCycleSection(
      containerEl,
      "Primary cycle",
      'Your everyday states. Bind a hotkey to "Cycle task status (primary)" (also on the ribbon). States rotate in the order listed below.',
      "primaryCycleIds"
    );
    this.addCycleSection(
      containerEl,
      "Secondary cycle",
      'Less-used states. Bind a hotkey to "Cycle task status (secondary)". Pressing it on a task not already in this cycle sets the first state below.',
      "secondaryCycleIds"
    );
    new import_obsidian.Setting(containerEl).setName("Appearance & behaviour").setHeading();
    new import_obsidian.Setting(containerEl).setName("Right-click menu").setDesc("Add a BuJo status submenu to the editor context menu.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.showContextMenu).onChange(async (value) => {
        this.plugin.settings.showContextMenu = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Strike through done tasks").setDesc("Render the text of completed tasks with a line through it.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.strikethroughDone).onChange(async (value) => {
        this.plugin.settings.strikethroughDone = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Strike through cancelled tasks").setDesc("Render the text of cancelled tasks with a line through it.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.strikethroughCancelled).onChange(async (value) => {
        this.plugin.settings.strikethroughCancelled = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Colors").setHeading();
    containerEl.createEl("p", {
      text: "By default every state uses the base color, so the whole set looks consistent. Change the base color, or give individual states their own. The reset button returns a state to the base color.",
      cls: "setting-item-description"
    });
    const fallback = this.accentHex();
    new import_obsidian.Setting(containerEl).setName("Base color").setDesc("Used by every state without its own color. Reset to follow your theme's accent color.").addColorPicker(
      (picker) => picker.setValue(this.plugin.settings.baseColor || fallback).onChange(async (value) => {
        this.plugin.settings.baseColor = value;
        await this.plugin.saveSettings();
      })
    ).addExtraButton(
      (btn) => btn.setIcon("rotate-ccw").setTooltip("Follow theme accent").onClick(async () => {
        this.plugin.settings.baseColor = "";
        await this.plugin.saveSettings();
        this.display();
      })
    );
    for (const status of COLORABLE_STATUSES) {
      const label = status.symbol === " " ? "space" : status.symbol;
      const current = this.plugin.settings.colors[status.id];
      new import_obsidian.Setting(containerEl).setName(`${status.name}  [${label}]`).addColorPicker(
        (picker) => picker.setValue(current || this.plugin.settings.baseColor || fallback).onChange(async (value) => {
          this.plugin.settings.colors[status.id] = value;
          await this.plugin.saveSettings();
        })
      ).addExtraButton(
        (btn) => btn.setIcon("rotate-ccw").setTooltip("Follow base color").onClick(async () => {
          delete this.plugin.settings.colors[status.id];
          await this.plugin.saveSettings();
          this.display();
        })
      );
    }
  }
  /** Best-effort hex value of the theme accent, used as the color pickers' starting point. */
  accentHex() {
    const raw = getComputedStyle(document.body).getPropertyValue("--interactive-accent").trim();
    return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw) ? raw : "#7c6bf0";
  }
};
