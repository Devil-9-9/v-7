# BLOCK OPS

Minecraft building + Call of Duty shooting, in the browser. Phone first. P2P multiplayer. Installable PWA.

## Run
Static site, no build step. ES modules need a server (not `file://`):

    npx serve .          # or: python3 -m http.server 8080

Deploy: push to GitHub, import into Vercel (Framework: Other, no build command). `vercel.json` is included.
For phone install, open the deployed HTTPS URL, then Add to Home Screen.

## Offline / no-CDN (recommended before shipping)
Libraries load from unpkg at pinned versions (Three r160, cannon-es 0.20, PeerJS 1.5.2) and are cached by the service worker.
To bundle them locally, run once with internet: `bash scripts/vendor.sh`

## The world (no limits)
- **Infinite in every direction, including up and down.** Chunks are 16x16x16 cubes generated on demand from the seed; there is no height or depth cap.
  (Practical limit: past roughly 100,000 blocks from the origin, 32-bit float precision makes movement jittery.)
- **Overworld:** continents, oceans, lakes, beaches, trees. Swim with JUMP (rise) / DUCK (dive). Water cancels fall damage.
- **Sky realms:** above the open sky (y 128+) an endless stack of floating-island realms, one every 128 blocks, each with its own
  islands and clouds. Reach them by building a tower or bridging upward. Clouds are soft: landing on one cancels fall damage.
- **Underworld:** dig down. Caves everywhere, then huge caverns with lava lakes and glowing crystals, forever downward. You get a headlamp underground.
- Blocks that lose their support fall (cannon-es, g = 9.81). Anything disconnected from the ground falls, including sky bases, so anchor them to an island.

## Life
- **Wildlife:** cows, pigs, sheep and chickens roam the land; fish swim in every ocean and lake. Shooting them heals you +10 HP.
- **Villages:** every ~160 blocks there is a village: flattened ground, a well, stone paths and five houses. Each house has a villager who
  walks the village by day, goes home at dusk and sleeps in bed at night, chats when you come close, and flees if you shoot them.
  A killed villager is replaced after a minute.

## Home screen (lobby)
A 3D lobby opens first: your soldier stands on a plaza in a blocky mountain village. Tap LOOK (or your name) to change name, skin, hair, face paint, hoodie and pants.
Your look is saved on the device and friends see it in the game. The SQUAD panel shows who joined; INVITE copies/shares a link (`?join=BO-XXXX-1234`) that joins the host automatically when a friend opens it.

## Realistic characters
LOOK -> CHARACTER: REMY, KACHUJIN, EVE (realistic textured models with real animations: idle, run, jump, reload, hit, die) or BLOCKY (colours, hair, face, jacket).
Your choice is saved and friends see it. GFX HIGH shows realistic bots and friends; GFX LOW keeps them blocky (faster on weak phones).
Models are in `assets/models/*.glb` (+ `meta.json` for the rifle grip). They are loaded on demand; if they cannot load the game falls back to blocky characters.
To change or add models: `python3 tools/fbx2glb.py --char X.fbx --out assets/models/x.glb --anims name=clip.fbx ...` (Mixamo FBX in, small GLB out; needs Pillow + numpy),
then `python3 tools/gun_meta.py assets/models/meta.json assets/models/x.glb x`. Keep the repo private: Mixamo characters may be used in your game but not redistributed as raw assets.

## Fly, BAG, build sets, portals, weapons, vehicles
- **Fly (infinite):** double-tap JUMP (SPACE), or the FLY button / Z. JUMP = up, DUCK (C) = down, RUN = faster. No gravity, no fall damage, works at any height,
  in the sky realms and in the underworld. Land (DUCK on the ground) or press FLY again to walk.
- **BAG (B key / BAG button):** 28 block types (colour blocks, cobble, snow, ice, lamp, floor tile, obsidian, sandstone, roof tile, ...). Pick a hotbar slot, tap a block. Saved on the device.
  BUILD SETS: house, hotel (4 floors, lobby, stairs, rooms, roof), tower, bridge, castle wall, platform, two portals. Pick one, aim at the ground, press BUILD SET (P).
- **Portals:** obsidian frame (opening 3 wide x 3 tall, up to 5x5) with a CRYSTAL block in the middle of the top row = sky portal, LAMP block = underworld portal, PURPLE block = home portal.
  The opening lights up by itself; walk in and wait a second. A hub with a return portal is built at the other side (and synced to friends).
- **Weapons (8):** AK, sniper, pistol, shotgun, SMG, sword (tap to slash, also chops blocks), bow (hold to draw, release to shoot, arrows drop), rocket launcher (blast hurts you too, blows holes in blocks).
  Tab / T = next / previous weapon.
- **Camera views:** Y key or the CAM button cycles first person, third person (behind you) and front view (look at your own character). In third person the crosshair still shoots where it points. Scopes always use first person. Saved on the device.
- **Vehicles:** BAG > VEHICLES spawns a jeep, boat or glider in front of you. USE (V) to get in / out. Local only: friends do not see your vehicle.

## Customise your HUD
Main menu or Pause -> CUSTOMIZE HUD. Drag any button or HUD element, then use Size / Opacity / Hide, Mirror L/R (left-handed), Reset.
Saved on your device. Pause with the pause button (phone) or Esc (PC).

## Tests
    node tests/run.mjs        # world, villages, oceans, infinite physics, combat, wildlife, HUD layout, IDs

## Controls
PC: WASD, Shift sprint, Space jump (hold to swim up), C crouch (dive), Esc pause, LMB shoot, RMB scope (place in build mode), R reload, 1-4 weapons,
F toggle BUILD/COMBAT, G place, X break, Q/E or wheel = block, 5-9 = block slots, Tab / T weapon, Z fly, B bag, P build set, V vehicle.
Phone: left stick move (push past the ring to sprint), drag right side to look, SHOOT / JUMP / RELOAD / SCOPE / BUILD /
PLACE / DUCK / RUN / SWAP / BLOCK buttons. In BUILD mode, SHOOT breaks blocks; PLACE works in any mode.

## Multiplayer
Your permanent ID (`BO-XXXX-1234`) is in the menu with a COPY button. A friend pastes it into JOIN.
The host's ID decides the world seed; the host sends all block edits to late joiners. Shots, block edits and hits sync over WebRTC.
Uses the free public PeerJS signalling server. Strict NAT/corporate networks may need a TURN server.

## Layout
    index.html  manifest.json  service-worker.js  vercel.json
    src/main.js                  menu + boot
    src/core/      Game, Physics (cannon-es), DayNight, Effects, Noise, Constants
    src/blocks/    World (3D chunks), Terrain, Village, ChunkMesher, BlockManager, BuildTool, TextureAtlas, BlockTypes
    src/weapons/   Weapon, AK47, Sniper, Pistol, Shotgun, SMG, Sword, Bow, RocketLauncher, WeaponManager, Projectiles, Ballistics, ViewModel
    src/vehicles/  Vehicles (jeep, boat, glider)
    src/player/    Player, VoxelBody, Humanoid, Character (blocky), Model (realistic GLB characters)
    src/ai/        Bot, Wildlife, Animal, Fish, Villager, Models
    src/controls/  InputState, DesktopControls, MobileControls
    src/multiplayer/ UniqueID, Network, RemotePlayer
    src/ui/        HUD, HudEditor, HudLayout, Lobby3D, Profile, Wardrobe, styles.css
    assets/models/ remy.glb kachujin.glb eve.glb meta.json   (realistic characters)
    tools/         fbx2glb.py, gun_meta.py, preview_glb.py (FBX -> GLB conversion + CPU preview)
    tests/         node tests/run.mjs
    src/audio/     Audio (synthesised, no audio files)
