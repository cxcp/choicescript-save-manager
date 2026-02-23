# ChoiceScript Save Manager

![version](https://img.shields.io/badge/version-1.0.0-blue)
![license](https://img.shields.io/badge/license-MIT-green)

Adds a multi-slot save/load system to ChoiceScript games with quick saves and portable backups.

ChoiceScript titles normally rely on autosave and do not provide manual save slots.  
This userscript injects a minimal-overhead, in-browser save manager that allows multiple named saves, quick save rotation, and export/import of save data.

---

## Features

- Multiple manual save slots
- Quick save rotation
- Rename and delete saves
- Import / export save backups (JSON)
- Per-game save isolation
- Local browser storage (IndexedDB)
- Optional compression (enabled by default)
- Minimal-overhead UI overlay
- Compatible with official and hosted ChoiceScript games

---

## Installation

1. Install a userscript manager:
   - Tampermonkey
   - Violentmonkey
   - Greasemonkey

2. Install the script:
   - **GreasyFork:** *(link after publish)*
   - or **Direct (GitHub):** https://raw.githubusercontent.com/cxcp/choicescript-save-manager/main/choicescript-save-manager.user.js

---

## Usage

When a ChoiceScript game loads, a floating control panel appears.

Buttons:

- **Save**: create a new named save
- **Quick Save**: rotate through quick slots
- **Manager**: open save manager UI

Manager allows:

- load
- rename
- delete
- export
- import
- search and sort

---

## Data Storage

- Saves are stored locally in your browser (IndexedDB)
- No network requests or external services
- Saves are isolated per game
- Export produces portable JSON backups

---

## Compatibility

Works with:

- Choice of Games titles
- Hosted ChoiceScript games
- Self-hosted ChoiceScript builds

Optional matches (disabled by default):

```js
// @match *://cogdemos.ink/play/*
// @match *://*.itch.zone/*
```

These platforms may already include their own save systems.

---

## License

MIT License

Copyright (c) 2026 cxcp

---

## Acknowledgments

Inspired by earlier community save plugins:

ChoiceScriptSavePlugin (CJW / ChoiceScriptIDE)

- https://github.com/ChoicescriptIDE/ChoiceScriptSavePlugin
- https://forum.choiceofgames.com/t/choicescript-saving-plugin-update-sept-2019/983

ChoiceScriptSavePluginInjector (AbrahamAriel)

- https://gist.githubusercontent.com/AbrahamAriel/7a8d7cea1d8cbcd82700d67a09942a47/
- https://www.reddit.com/r/choiceofgames/comments/ovo3eh/choicescriptsaveplugininjector_add_save_system_to/

This project is an independent implementation using IndexedDB and modern userscript architecture.

---

## Repository

Source and issues:
https://github.com/cxcp/choicescript-save-manager
