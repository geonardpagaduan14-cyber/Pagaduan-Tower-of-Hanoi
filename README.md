# Tower of Hanoi (SWI-Prolog + Glassmorphism UI)

## Run in VS Code
1. Install SWI-Prolog and make sure `swipl` works in a terminal (Windows: add `C:\Program Files\swipl\bin` to PATH, then restart VS Code).
2. File > Open Folder... and choose this folder.
3. Press **Ctrl+Shift+B** (task "Run Hanoi Server"), or run `swipl hanoi.pl` in the terminal.
4. Open http://localhost:8080 (Ctrl+Shift+P > "Simple Browser: Show" works too).

Stop with Ctrl+C. Keep the folder out of OneDrive if you can (e.g. `C:\dev\hanoi`).

## Structure
- `hanoi.pl` - server and game logic (move validation, solver)
- `public/` - `index.html`, `style.css`, `game.js`
