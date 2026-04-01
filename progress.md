Original prompt: อยากได้หน้าหน้าจอประมาณนี้ ในรูปคือหน้าจอเมนูจะแสดงขึ้นมาเมื่อกดปุ่มข้างล่าง ที่มีสี่ปุ่ม กดปุ่มไหนก็ได้ หน้าจอแสดงผลเมนูมีขนาด 48x48 pixel มีเมนูดังนี้ status แสดงหน้าจอ status ของสัตว์เลี้ยง feed เมนูให้อาหาร มีให้เลือกว่าจะให้ข้าวเพื่อเพิ่มความอิ่ม หรือให้ขนมเพื่อเพิ่มความสนุกและน้ำหนัก medicine ใช้รักษาเมื่อป่วย play เมนูแสดงรายชื่อ mini game clean ทำความสะอาด sleep ปิดไฟนอนหลับ โดยจะแสดงครั้งละ 1 เมนูเท่านั้น เลื่อนไปเมนูถัดไปด้วยการกดปุ่มลูกศรลง เลื่อนไปเมนูก่อนหน้าด้วยการกดปุ่มลูกศรขึ้น เลือกเมนูด้วยการกดลูกศรขวา ออกจากเมนูด้วยการกดลูกศรซ้าย

- Replaced the old multi-panel HUD markup with a single 48x48 menu canvas overlay and four directional hardware buttons.
- Added a canvas-driven menu state machine in `scenes/UIScene.js` for main menu, feed submenu, status screen, play list, message screen, and a right-button tap mini game.
- Extended pet state with `weight` plus new `meal` and `snack` feeding actions in `gameState.js`.
- Verified JavaScript syntax with `node --check` on `gameState.js`, `main.js`, and all scene files.
- Tried to run the Playwright validation loop after serving the app locally; browser automation is still blocked by module resolution for the cached `playwright` package, so visual verification is still pending.
- Updated the mini game flow in `scenes/UIScene.js` so finishing a run shows a result screen for 3 seconds via a dedicated duration constant and ignores both keyboard and on-screen button input during that summary pause.
