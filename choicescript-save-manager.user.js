// ==UserScript==
// @name         ChoiceScript Save Manager
// @namespace    https://github.com/cxcp/choicescript-save-manager
// @version      1.0.0
// @description  Adds a full save/load system to ChoiceScript games with multiple slots, quick saves, compression and import/export.
// @author       cxcp
// @license      MIT
//
// @match        *://*.choiceofgames.com/*
// @exclude      *://*.choiceofgames.com/category/*
// @exclude      *://*.choiceofgames.com/profile/*
// @exclude      *://*.choiceofgames.com/blog/*
// @exclude      *://*.choiceofgames.com/api/*
// @exclude      *://*.choiceofgames.com/about-us/*
// @exclude      *://*.choiceofgames.com/contact-us/*
// @exclude      *://*.choiceofgames.com/privacy-policy/*
// @exclude      *://*.choiceofgames.com/looking-for-writers/*
// @exclude      *://*.choiceofgames.com/make-your-own-games/*
//
// @grant        none
// @require      https://cdn.jsdelivr.net/npm/lz-string@1.5.0/libs/lz-string.min.js
// @run-at       document-start
// ==/UserScript==

/* To enable itch.io embedded ChoiceScript games, add:
 * @match *://*.itch.zone/*
 * Disabled by default to avoid overly broad matching to non-ChoiceScript itch content
 *
 * To enable cogdemos support, add:
 * @match *://cogdemos.ink/play/*
 * Disabled by default since it already includes a built-in save system
 */

/*
 * ChoiceScript Save Manager
 * Designed for use with ChoiceScript by Dan Fabulich (https://github.com/dfabulich/choicescript)
 *
 * Copyright (c) 2026 cxcp
 * Licensed under the MIT License. See LICENSE file or https://opensource.org/licenses/MIT
 *
 * Uses LZ-String 1.5.0 by Pieroxy (MIT)
 * https://github.com/pieroxy/lz-string
 * Loaded via jsDelivr CDN
 * 
 * Inspired by the prior work of the ChoiceScript community:
 * ChoiceScriptSavePlugin by CJW (ChoiceScriptIDE):
 * https://github.com/ChoicescriptIDE/ChoiceScriptSavePlugin
 * https://forum.choiceofgames.com/t/choicescript-saving-plugin-update-sept-2019/983
 *
 * ChoiceScriptSavePluginInjector by AbrahamAriel:
 * https://gist.githubusercontent.com/AbrahamAriel/7a8d7cea1d8cbcd82700d67a09942a47/
 * https://www.reddit.com/r/choiceofgames/comments/ovo3eh/choicescriptsaveplugininjector_add_save_system_to/
 */

/* global LZString */

(function () {
  "use strict";

  /* === CONFIG & UTILS === */
  const DB_NAME = "CS_SaveMgr",
    STORE = "saves",
    SETTINGS_KEY = "CS_SaveMgr_Opts",
    QUICK_SLOTS = 5,
    METADATA_FORMAT_VERSION = 1;
  const STATE_PLAIN = "plain",
    STATE_LZ = "lz",
    POSITIONS = ["top-right", "top-left", "bottom-right", "bottom-left"];
  const defOpts = {
    compression: true,
    buttons: { save: true, quickSave: true, position: "top-right" },
  };
  const HAS_LZ = typeof LZString !== "undefined";

  let settings = (() => {
    try {
      const p = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      return {
        ...defOpts,
        compression: p.compression ?? defOpts.compression,
        buttons: { ...defOpts.buttons, ...(p.buttons || {}) },
      };
    } catch {
      return { ...defOpts, buttons: { ...defOpts.buttons } };
    }
  })();
  if (!POSITIONS.includes(settings.buttons.position)) settings.buttons.position = "top-right";

  const now = () => Date.now();
  const uid = () =>
    crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + now().toString(36);

  const gameId = () => {
    if (window.storeName) return window.storeName;
    // itch.io embed support (requires manual @match)
    if (location.hostname.includes("itch.zone")) {
      const title = document.title.replace(/[^a-z0-9]/gi, "").toLowerCase();
      return title || "unknown_itch_game";
    }
    return location.pathname.replace(/\/$/, "").split("?")[0].split("#")[0];
  };

  const gameSlug = () =>
    (location.pathname.split("/").filter(Boolean).pop() || "game").replace(/[<>:"/\\|?*]/g, "_");

  const isDark = () => {
    try {
      const m = getComputedStyle(document.body).backgroundColor.match(/\d+(\.\d+)?/g);
      return m && m.length >= 3 && (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255 < 0.45;
    } catch {
      return false;
    }
  };

  const esc = (s) =>
    (s || "")
      .toString()
      .replace(
        /[&<>"']/g,
        (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]
      );

  const enc = (o) =>
    settings.compression && HAS_LZ
      ? { state: LZString.compressToBase64(JSON.stringify(o)), enc: STATE_LZ }
      : { state: JSON.stringify(o), enc: STATE_PLAIN };

  const dec = (r) => {
    try {
      if (r.enc === STATE_LZ) {
        if (typeof LZString === "undefined")
          throw new Error("LZString unavailable for decompression.");
        return JSON.parse(LZString.decompressFromBase64(r.state));
      }
      return JSON.parse(r.state);
    } catch (e) {
      throw new Error("Corrupted save data or decode failure.", { cause: e });
    }
  };

  const injectStyles = () => {
    if (document.getElementById("cs-save-styles")) return;
    const style = document.createElement("style");
    style.id = "cs-save-styles";
    style.textContent = `.cs-toast-host{position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:100005;display:flex;flex-direction:column;gap:6px;align-items:center;pointer-events:none}.cs-toast{padding:6px 10px;border-radius:6px;font-size:13px}.cs-toast-dark,.cs-modal-dark{background:#171717;color:#eee}.cs-toast-dark{background:#1f6feb;color:#fff}.cs-toast-light,.cs-modal-light{background:#fff;color:#111}.cs-toast-light{background:#e8f1ff;color:#0a3a73}.cs-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99999;display:flex;justify-content:center;align-items:flex-start;padding-top:40px}.cs-modal-box{width:760px;max-height:86vh;overflow:auto;border-radius:8px;padding:12px;box-sizing:border-box}.cs-header,.cs-row,.cs-list-header{display:flex;justify-content:space-between;align-items:center}.cs-header{margin:0 0 8px}.cs-header h3{margin:0}.cs-close-btn{border:none;background:transparent;color:inherit;font-size:20px;cursor:pointer;padding:0 4px}.cs-bar,.cs-tools,.cs-acts,.cs-info,.cs-row-left{display:flex;gap:6px;align-items:center}.cs-bar,.cs-tools{flex-wrap:wrap;margin-bottom:8px}.cs-settings-panel{margin:6px 0 8px;border:1px solid #8883;border-radius:6px;padding:8px;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:6px}.cs-settings-row{display:flex;align-items:center;gap:6px;cursor:pointer}.cs-search{flex:1;min-width:220px;padding:2px 4px}.cs-inline-inp{min-width:180px;padding:2px 4px;font-size:13px}.cs-count{font-size:12px;opacity:.8}.cs-list-container{max-height:52vh;overflow:auto;border:1px solid #8883;border-radius:6px;padding:4px 8px}.cs-list-header{padding:4px 0 6px;border-bottom:1px solid #8883;margin-bottom:2px;justify-content:flex-start}.cs-row{border-bottom:1px solid #8883;padding:6px 0;gap:8px}.cs-info{margin-left:8px}.cs-quick-badge{font-size:11px;font-weight:700;padding:1px 4px;border-radius:4px;margin-right:4px}.cs-quick-dark{background:#1f6feb;color:#fff}.cs-quick-light{background:#dbeafe;color:#1e3a8a}.cs-title-span{display:inline-block;max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;vertical-align:bottom}.cs-meta-span{margin-left:6px;font-size:12px;opacity:.8;white-space:nowrap}.cs-btn-del{color:#ba0000}.cs-controls{position:fixed;z-index:100001;display:flex;flex-direction:column;gap:6px}.cs-pos-top-right{top:14px;right:14px}.cs-pos-top-left{top:14px;left:14px}.cs-pos-bottom-right{bottom:14px;right:14px}.cs-pos-bottom-left{bottom:14px;left:14px}`;
    document.head.appendChild(style);
  };

  const toast = (m, ms = 2000) => {
    let h =
      document.getElementById("cs-toast-host") ||
      Object.assign(document.createElement("div"), {
        id: "cs-toast-host",
        className: "cs-toast-host",
      });
    if (!h.parentNode) ensureRoot().appendChild(h);

    while (h.children.length >= 5) {
      h.removeChild(h.firstChild);
    }

    const t = Object.assign(document.createElement("div"), {
      textContent: m,
      className: `cs-toast cs-toast-${isDark() ? "dark" : "light"}`,
    });
    h.appendChild(t);
    setTimeout(() => {
      if (t.parentNode) t.remove();
    }, ms);
  };

  const dl = (txt, fn) => {
    const url = URL.createObjectURL(new Blob([txt]));
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: fn,
      style: "display:none",
    });

    (document.body || document.documentElement).appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 400);
  };

  /* === DATABASE WRAPPER === */
  class DB {
    open() {
      return (this.dbP =
        this.dbP ||
        new Promise((res, rej) => {
          const r = indexedDB.open(DB_NAME, 1);
          r.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE)) {
              const s = e.target.result.createObjectStore(STORE, { keyPath: "id" });
              s.createIndex("game", "game");
              s.createIndex("ts", "meta.ts");
            }
          };
          r.onsuccess = (e) => res(e.target.result);
          r.onerror = rej;
        }));
    }
    tx(mode, action, payload) {
      return this.open().then(
        (db) =>
          new Promise((res, rej) => {
            const s = db.transaction(STORE, mode).objectStore(STORE);
            const req = action === "list" ? s.index("game").getAll(payload) : s[action](payload);
            req.onsuccess = (e) => res(e.target.result);
            req.onerror = rej;
          })
      );
    }
    put(o) {
      return this.tx("readwrite", "put", o);
    }
    get(id) {
      return this.tx("readonly", "get", id);
    }
    delete(id) {
      return this.tx("readwrite", "delete", id);
    }
    list(g) {
      return this.tx("readonly", "list", g).then((r) =>
        (r || []).sort((a, b) => b.meta.ts - a.meta.ts)
      );
    }
  }

  /* === CORE SAVE LOGIC === */
  const getCSApi = () => {
    const w =
      typeof unsafeWindow !== "undefined" && unsafeWindow !== window ? unsafeWindow : window;
    return typeof w.restoreObject === "function" && typeof w.initStore === "function"
      ? { r: w.restoreObject, i: w.initStore, w }
      : null;
  };

  class SaveManager {
    constructor() {
      this.db = new DB();
    }

    // Uses internal ChoiceScript restoreObject/initStore API.
    // restoreObject(initStore(), "state") returns canonical game state.
    capture() {
      const a = getCSApi();
      if (!a) return Promise.reject(new Error("Game API not found."));
      return new Promise((res, rej) => {
        a.r(a.i(), "state", null, (s) =>
          s ? res(s) : rej(new Error("No safe state found. Try making a choice first."))
        );
      });
    }

    // Injects save into ChoiceScript cookie slot then triggers engine load.
    // Falls back to direct state injection if engine hooks unavailable.
    async load(id) {
      try {
        const r = await this.db.get(id);
        if (!r) throw new Error("Save file missing from database.");

        const api = getCSApi();
        if (!api) throw new Error("Game API not found.");

        const s = dec(r),
          st = api.i();
        const slot = (api.w.storeName || "CS") + "_SAVE_" + uid();
        const parsedState = typeof s === "string" ? JSON.parse(s) : s;
        const { stats = {}, temps = {}, lineNum = 0, indent = 0 } = parsedState;

        const run = () => {
          try {
            const fn = api.w.loadAndRestoreGame || api.w.restoreGame;
            if (api.w.clearScreen && typeof fn === "function") {
              return api.w.clearScreen(fn.bind(stats.scene, slot));
            }
          } catch (err) {
            console.warn("Standard load execution failed, forcing reload.", err);
          }
          // Hard fallback: Inject full canonical state
          st.set("state", parsedState, () => location.reload());
        };

        try {
          if (api.w.saveCookie) {
            api.w.saveCookie(run, slot, stats, temps, lineNum, indent, false, null);
          } else {
            st.set("state" + slot, parsedState, run);
          }
        } catch (engineErr) {
          console.error("Engine save error, forcing hard state inject.", engineErr);
          // Hard fallback: Inject full canonical state
          st.set("state", parsedState, () => location.reload());
        }
      } catch (e) {
        toast("Load failed: " + e.message);
        console.error(e);
      }
    }

    async create(name = "", quick = null) {
      const s = await this.capture(),
        e = enc(s);
      const max = Math.max(
        0,
        ...(await this.db.list(gameId())).map((r) => {
          if (r.meta.quick || !r.meta.name?.startsWith("Save ")) return 0;
          const n = Number(r.meta.name.slice(5));
          return isNaN(n) ? 0 : n;
        })
      );

      await this.db.put({
        id: `${gameId()}_${now()}_${uid()}`,
        game: gameId(),
        meta: {
          name: name?.trim() || `Save ${max + 1}`,
          scene: s.stats?.sceneName || "",
          ts: now(),
          quick,
          fmt: METADATA_FORMAT_VERSION,
        },
        state: e.state,
        enc: e.enc,
      });
    }

    async quick() {
      const allSaves = await this.db.list(gameId());
      const qSaves = allSaves
        .filter((r) => r.meta?.quick != null)
        .sort((a, b) => a.meta.ts - b.meta.ts);

      let s = 1;
      if (qSaves.length < QUICK_SLOTS) {
        const usedSlots = new Set(qSaves.map((r) => r.meta.quick));
        for (let i = 1; i <= QUICK_SLOTS; i++) {
          if (!usedSlots.has(i)) {
            s = i;
            break;
          }
        }
      } else {
        s = qSaves[0].meta.quick;
      }

      for (const r of qSaves) {
        if (r.meta.quick === s) await this.db.delete(r.id);
      }

      await this.create(`Slot ${s}/${QUICK_SLOTS}`, s);
    }

    async exportCurrent() {
      const s = await this.capture(),
        e = enc(s);
      return JSON.stringify([
        {
          id: `${gameId()}_export_${now()}_${uid()}`,
          game: gameId(),
          meta: {
            name: "Exported State",
            scene: s.stats?.sceneName || "",
            ts: now(),
            quick: null,
            fmt: METADATA_FORMAT_VERSION,
          },
          state: e.state,
          enc: e.enc,
        },
      ]);
    }

    async import(json) {
      try {
        const parsed = JSON.parse(json);
        if (!Array.isArray(parsed)) throw new Error("Invalid format");

        const version = parsed[0]?.meta?.fmt || 0;
        if (version !== METADATA_FORMAT_VERSION) {
          throw new Error("Incompatible save version");
        }

        const valid = parsed.filter((r) => r?.id && r?.state && r?.meta?.ts != null);
        if (!valid.length) throw new Error("No valid saves found in file.");

        await Promise.all(
          valid.map((r) => {
            r.game = gameId();
            return this.db.put(r);
          })
        );
      } catch (err) {
        throw new Error(
          err.message === "Invalid format" ||
            err.message === "No valid saves found in file." ||
            err.message === "Incompatible save version"
            ? err.message
            : "Invalid or corrupted JSON file.",
          { cause: err }
        );
      }
    }
  }

  /* === MODAL (UI) === */
  class Modal {
    constructor(mgr) {
      Object.assign(this, {
        mgr,
        sel: new Set(),
        q: "",
        sort: "newest",
        setOpen: false,
        editId: null,
        rows: [],
      });
    }

    async show() {
      if (document.getElementById("cs-modal")) return;
      this.dark = isDark();
      const ov = Object.assign(document.createElement("div"), {
        id: "cs-modal",
        className: "cs-modal-overlay",
      });
      this.box = Object.assign(document.createElement("div"), {
        className: `cs-modal-box cs-modal-${this.dark ? "dark" : "light"}`,
      });
      ov.appendChild(this.box);
      document.body.appendChild(ov);

      ov.addEventListener("click", (e) => {
        if (e.target === ov) this.close();
      });

      this.onEsc = (e) => {
        if (e.key === "Escape") this.close();
      };
      window.addEventListener("keydown", this.onEsc);
      ["keydown", "keyup", "keypress"].forEach((evt) => {
        this.box.addEventListener(evt, (e) => {
          if (e.key !== "Escape") e.stopPropagation();
        });
      });

      this.renderShell();
      this.attachMasterEvents();
      await this.renderList(true);
    }

    close() {
      document.getElementById("cs-modal")?.remove();
      if (this.onEsc) window.removeEventListener("keydown", this.onEsc);
      this.box = null;
      this.sel.clear();
      this.editId = null;
    }

    apply() {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      } catch (e) {
        console.warn("Could not save settings to localStorage", e);
      }
      document.getElementById("cs-controls")?.remove();
      ensureButtons(this.mgr, this);
    }

    sortRows() {
      const q = this.q.trim().toLowerCase();
      let o = q
        ? this.rows.filter(
            (r) =>
              (r.meta?.name || "").toLowerCase().includes(q) ||
              (r.meta?.scene || "").toLowerCase().includes(q)
          )
        : this.rows.slice();
      return o.sort((a, b) =>
        this.sort === "oldest"
          ? a.meta.ts - b.meta.ts
          : this.sort === "name"
            ? (a.meta.name || "").localeCompare(b.meta.name || "")
            : b.meta.ts - a.meta.ts
      );
    }

    renderShell() {
      const posOpts = POSITIONS.map(
        (p) =>
          `<option value="${p}" ${settings.buttons.position === p ? "selected" : ""}>${p.replace("-", " ")}</option>`
      ).join("");

      this.box.innerHTML = `
        <div class="cs-header"><h3>Saved Games</h3><button data-action="close" class="cs-close-btn">&times;</button></div>
        <div id="cs-main-bar" class="cs-bar"><button data-action="show-save">Save</button><button data-action="show-export">Export</button><button data-action="import">Import</button><button data-action="del-sel">Delete Selected</button><button data-action="toggle-set">Settings</button></div>
        <div id="cs-save-bar" class="cs-bar" style="display:none;"><input type="text" id="cs-save-name-inp" class="cs-inline-inp" placeholder="Leave blank for 'Save N'"><button data-action="save-conf">Confirm</button><button data-action="canc-bar">Cancel</button></div>
        <div id="cs-export-bar" class="cs-bar" style="display:none;"><span style="font-size:13px; font-weight:bold;">Export:</span><button data-action="exp-curr">Current State</button><button data-action="exp-sel">Selected</button><button data-action="exp-all">All</button><button data-action="canc-bar">Cancel</button></div>
        <div id="cs-settings-panel" class="cs-settings-panel" style="display: ${this.setOpen ? "grid" : "none"};">
          <label class="cs-settings-row"><input type="checkbox" id="cs-set-comp" ${settings.compression ? "checked" : ""}><span>Compress saves</span></label>
          <label class="cs-settings-row"><input type="checkbox" id="cs-set-save" ${settings.buttons.save ? "checked" : ""}><span>Save button</span></label>
          <label class="cs-settings-row"><input type="checkbox" id="cs-set-quick" ${settings.buttons.quickSave ? "checked" : ""}><span>Quick Save button</span></label>
          <label class="cs-settings-row"><span>Position</span><select id="cs-set-pos" style="min-width:130px">${posOpts}</select></label>
        </div>
        <div class="cs-list-container">
          <div class="cs-list-header" style="flex-wrap: wrap; justify-content: space-between; gap: 8px;">
            <label style="display:flex;align-items:center;gap:4px;"><input type="checkbox" id="cs-select-all"><span>Select all shown</span></label>
            <div class="cs-tools" style="margin-bottom: 0;">
              <input type="search" class="cs-search" id="cs-search-input" placeholder="Search name or scene..." value="${this.q}">
              <select id="cs-sort-select">
                <option value="newest" ${this.sort === "newest" ? "selected" : ""}>Newest</option>
                <option value="oldest" ${this.sort === "oldest" ? "selected" : ""}>Oldest</option>
                <option value="name" ${this.sort === "name" ? "selected" : ""}>Name</option>
              </select>
              <span class="cs-count" id="cs-count-span"></span>
            </div>
          </div>
          <div id="cs-list-body"></div>
        </div>
      `;
    }

    attachMasterEvents() {
      this.box.addEventListener("click", async (e) => {
        const t = e.target;
        const action = t.dataset.action || t.closest("[data-action]")?.dataset.action;
        const r = t.closest(".cs-row");
        const rid = r?.dataset.id;

        const b = (s) => this.box.querySelector(s);
        const tog = (m, s, ex) => {
          b("#cs-main-bar").style.display = m;
          b("#cs-save-bar").style.display = s;
          b("#cs-export-bar").style.display = ex;
        };

        try {
          switch (action) {
            case "close":
              this.close();
              break;
            case "show-save":
              tog("none", "flex", "none");
              b("#cs-save-name-inp").focus();
              break;
            case "canc-bar":
              tog("flex", "none", "none");
              break;
            case "save-conf":
              await this.mgr.create(b("#cs-save-name-inp").value);
              toast("Saved");
              tog("flex", "none", "none");
              b("#cs-save-name-inp").value = "";
              await this.renderList(true);
              break;
            case "show-export":
              tog("none", "none", "flex");
              break;
            case "exp-curr":
              dl(await this.mgr.exportCurrent(), `cs-curr-${gameSlug()}-${now()}.json`);
              tog("flex", "none", "none");
              break;
            case "exp-sel":
              if (this.sel.size) {
                dl(
                  JSON.stringify(this.rows.filter((x) => this.sel.has(x.id))),
                  `cs-sel-${gameSlug()}-${now()}.json`
                );
                tog("flex", "none", "none");
              } else toast("None selected");
              break;
            case "exp-all":
              dl(JSON.stringify(this.rows), `cs-all-${gameSlug()}-${now()}.json`);
              tog("flex", "none", "none");
              break;
            case "import": {
              const i = Object.assign(document.createElement("input"), {
                type: "file",
                accept: ".json",
              });
              i.onchange = async (ev) => {
                if (ev.target.files[0]) {
                  try {
                    await this.mgr.import(await ev.target.files[0].text());
                    toast("Imported successfully");
                    await this.renderList(true);
                  } catch (err) {
                    toast(err.message);
                  }
                }
              };
              i.click();
              break;
            }
            case "del-sel":
              if (this.sel.size && confirm("Delete selected?")) {
                await Promise.all([...this.sel].map((i) => this.mgr.db.delete(i)));
                this.sel.clear();
                toast("Deleted");
                await this.renderList(true);
              }
              break;
            case "toggle-set":
              this.setOpen = !this.setOpen;
              b("#cs-settings-panel").style.display = this.setOpen ? "grid" : "none";
              break;
            case "load":
              this.close();
              this.mgr.load(rid);
              break;
            case "del":
              if (confirm("Delete?")) {
                await this.mgr.db.delete(rid);
                this.sel.delete(rid);
                this.rows = this.rows.filter((x) => x.id !== rid);
                toast("Deleted");
                this.renderList();
              }
              break;
            case "rename":
              this.editId = rid;
              this.renderList();
              setTimeout(() => r.querySelector(".cs-rename-inp")?.focus(), 10);
              break;
            case "rename-canc":
              this.editId = null;
              this.renderList();
              break;
            case "rename-save": {
              const obj = await this.mgr.db.get(rid);
              if (obj) {
                obj.meta.name = r.querySelector(".cs-rename-inp").value.trim() || "Unnamed Save";
                await this.mgr.db.put(obj);
              }
              this.editId = null;
              toast("Renamed");
              await this.renderList(true);
              break;
            }
          }
        } catch (err) {
          toast(err.message);
          console.error(err);
        }

        if (t.classList.contains("cs-cb")) {
          t.checked ? this.sel.add(rid) : this.sel.delete(rid);
          this.syncCb();
        }
      });

      this.box.addEventListener("change", (e) => {
        const b = (s) => this.box.querySelector(s);
        if (e.target.id === "cs-set-pos") {
          settings.buttons.position = e.target.value;
          this.apply();
        } else if (e.target.id === "cs-select-all") {
          const rows = this.sortRows();
          if (e.target.checked) rows.forEach((r) => this.sel.add(r.id));
          else this.sel.clear();
          this.syncCb();
          this.renderList();
        } else if (e.target.id === "cs-sort-select") {
          this.sort = e.target.value;
          this.renderList();
        } else if (["cs-set-comp", "cs-set-save", "cs-set-quick"].includes(e.target.id)) {
          settings.compression = b("#cs-set-comp").checked;
          settings.buttons.save = b("#cs-set-save").checked;
          settings.buttons.quickSave = b("#cs-set-quick").checked;
          this.apply();
        }
      });

      this.box.addEventListener("input", (e) => {
        if (e.target.id === "cs-search-input") {
          this.q = e.target.value;
          this.editId = null;
          this.renderList();
        }
      });

      this.box.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          if (e.target.id === "cs-save-name-inp")
            this.box.querySelector('[data-action="save-conf"]').click();
          else if (e.target.classList.contains("cs-rename-inp"))
            e.target.closest(".cs-row").querySelector('[data-action="rename-save"]').click();
        }
      });
    }

    syncCb() {
      const cb = this.box.querySelector("#cs-select-all");
      const visibleRows = this.sortRows();

      if (!visibleRows.length) {
        cb.checked = false;
        cb.indeterminate = false;
        cb.disabled = true;
        return;
      }

      const checkedCount = visibleRows.filter((r) => this.sel.has(r.id)).length;
      cb.disabled = false;
      cb.checked = checkedCount > 0 && checkedCount === visibleRows.length;
      cb.indeterminate = checkedCount > 0 && checkedCount < visibleRows.length;
    }

    async renderList(fetch = false) {
      if (fetch) this.rows = await this.mgr.db.list(gameId());
      const rows = this.sortRows(),
        b = (s) => this.box.querySelector(s),
        tbody = b("#cs-list-body");
      b("#cs-count-span").textContent = `${rows.length} / ${this.rows.length}`;

      if (!rows.length) {
        tbody.innerHTML = `<div style="padding:10px 2px;font-size:13px;opacity:.8;">No saves match.</div>`;
        this.syncCb();
        return;
      }

      tbody.innerHTML = rows
        .map((r) => {
          const ed = this.editId === r.id;
          return `
          <div class="cs-row" data-id="${r.id}">
            <div class="cs-row-left">
              <input type="checkbox" class="cs-cb" ${this.sel.has(r.id) ? "checked" : ""}>
              <div class="cs-info">
                ${r.meta?.quick != null ? `<span class="cs-quick-badge cs-quick-${this.dark ? "dark" : "light"}">QUICK</span>` : ""}
                ${
                  ed
                    ? `<input type="text" class="cs-rename-inp cs-inline-inp" value="${esc(r.meta?.name || "")}">`
                    : `<span class="cs-title-span"><strong>${esc(r.meta?.name) || `(${esc(r.meta?.scene) || "Unknown"})`}</strong></span>`
                }
                <span class="cs-meta-span">${esc(r.meta?.scene) || "-"} &middot; ${new Date(r.meta?.ts || 0).toLocaleString()}</span>
              </div>
            </div>
            <div class="cs-acts">
              ${
                ed
                  ? `<button data-action="rename-save">Save</button><button data-action="rename-canc">Cancel</button>`
                  : `<button data-action="load">Load</button><button data-action="rename">Rename</button><button data-action="del" class="cs-btn-del">Delete</button>`
              }
            </div>
          </div>`;
        })
        .join("");

      this.syncCb();
    }
  }

  /* === BOOTSTRAP === */
  const ensureRoot = () => {
    let r = document.getElementById("cs-root");
    if (r) return r;
    r = Object.assign(document.createElement("div"), {
      id: "cs-root",
      style: "position:fixed;top:0;left:0;z-index:99998",
    });
    return (document.documentElement.appendChild(r), r);
  };

  const mgr = new SaveManager(),
    modal = new Modal(mgr);
  const ensureButtons = () => {
    if (document.getElementById("cs-controls")) return;
    const w = Object.assign(document.createElement("div"), {
      id: "cs-controls",
      className: `cs-controls cs-pos-${settings.buttons.position}`,
    });
    const btn = (t, f) =>
      w.appendChild(
        Object.assign(document.createElement("button"), { textContent: t, onclick: f })
      );

    if (settings.buttons.save)
      btn("Save", async () => {
        try {
          await mgr.create();
          toast("Saved");
        } catch (e) {
          toast(e.message);
          console.error(e);
        }
      });
    if (settings.buttons.quickSave)
      btn("Quick Save", async () => {
        try {
          await mgr.quick();
          toast("Quick saved");
        } catch (e) {
          toast(e.message);
          console.error(e);
        }
      });
    btn("Manager", () => modal.show());
    ensureRoot().appendChild(w);
  };

  let didBoot = false,
    bootTries = 0;
  const boot = () => {
    if (didBoot) return;
    if (!getCSApi()) {
      if (bootTries++ < 100) setTimeout(boot, 100); // ~10s max wait for game API
      return;
    }
    didBoot = true;
    injectStyles();
    ensureButtons();
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
