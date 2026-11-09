import { Game } from './core/Game.js';
import { getUniqueId, copyToClipboard } from './multiplayer/UniqueID.js';
import { Network } from './multiplayer/Network.js';
import { DesktopControls } from './controls/DesktopControls.js';
import { MobileControls, isTouchDevice } from './controls/MobileControls.js';
import { HudEditor } from './ui/HudEditor.js';
import { Profile, joinIdFromSearch, inviteLink } from './ui/Profile.js';
import { Lobby3D } from './ui/Lobby3D.js';
import { buildWardrobe } from './ui/Wardrobe.js';
import { loadModel, gfx } from './player/Model.js';

const $ = (id) => document.getElementById(id);
const touch = isTouchDevice();
const myId = getUniqueId();
$('my-id').textContent = myId;

// ---- network (optional: the game works fully offline against bots) ----
const profile = new Profile((() => { try { return window.localStorage; } catch (_) { return null; } })(), myId);
const net = new Network(myId);
net.profile = profile.toJSON();
net.onStatus = (s) => { $('net-status').textContent = s; };
net.start();

// ---- game ----
let game;
try {
  game = new Game({ canvas: $('game'), net, myId, touch });
  game.loadWorld(net.hostSeed, [], $('opt-bots').checked);
} catch (err) {
  $('net-status').textContent = 'Could not start 3D: ' + err.message;
  console.error(err);
  throw err;
}

net.onSeed = (seed, edits) => {
  game.loadWorld(seed, edits, $('opt-bots').checked);
  game.player.sens = sens;
  game.hud.toast('Joined host world');
};

// ---- controls ----
const desktop = new DesktopControls(game.input, $('game'));
desktop.getMode = () => game.mode;
const mobile = new MobileControls(game.input);
mobile.getMode = () => game.mode;

// ---- look sensitivity (saved) ----
const SENS_KEY = 'blockops.sens';
let sens = 1;
try { const v = parseFloat(localStorage.getItem(SENS_KEY)); if (v >= 0.4 && v <= 3) sens = v; } catch (_) { /* storage blocked */ }
$('pm-sens').value = sens;
game.player.sens = sens;
$('pm-sens').addEventListener('input', (e) => {
  sens = Number(e.target.value); game.player.sens = sens;
  try { localStorage.setItem(SENS_KEY, String(sens)); } catch (_) { /* ignore */ }
});

// ---- pause + HUD editor ----
let editFrom = 'menu';
const editor = new HudEditor({ touch, onExit: () => {
  if (touch) mobile.setEditing(false);
  if (editFrom === 'menu') {                                  // back to the main menu, hide the game HUD again
    game.hud.show(false);
    if (touch) mobile.setEnabled(false);
    $('menu').classList.remove('hidden');
  } else $('pause-menu').classList.remove('hidden');          // back to the pause menu
} });

function startEdit(from) {
  editFrom = from;
  $('menu').classList.add('hidden'); $('pause-menu').classList.add('hidden');
  game.hud.show(true);
  if (touch) { mobile.setEnabled(true); mobile.setEditing(true); }
  editor.enter();
}

function pause() {
  if (!game.running || game.paused || editor.active) return;
  game.paused = true;
  game.input.reset();
  desktop.setEnabled(false);
  $('pause-menu').classList.remove('hidden');
  document.exitPointerLock?.();
}

function resume() {
  $('pause-menu').classList.add('hidden');
  game.paused = false;
  game.input.reset();
  game.last = performance.now();
  if (!touch) { desktop.setEnabled(true); $('game').requestPointerLock?.(); }
}

$('menu-hud-btn').addEventListener('click', () => startEdit('menu'));
$('pm-hud').addEventListener('click', () => startEdit('pause'));
$('pm-resume').addEventListener('click', resume);
$('pm-menu').addEventListener('click', () => location.reload());
$('pause-btn').addEventListener('click', pause);
document.addEventListener('pointerlockchange', () => {      // Esc on desktop releases the mouse -> pause
  if (!touch && game.running && !game.paused && !editor.active && !game.inventory?.isOpen && document.pointerLockElement !== $('game')) pause();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

// ---- main menu ----
$('copy-id').addEventListener('click', async () => {
  const ok = await copyToClipboard(myId);
  $('copy-id').textContent = ok ? 'COPIED' : 'SELECT';
  setTimeout(() => ($('copy-id').textContent = 'COPY'), 1400);
});
$('join-btn').addEventListener('click', () => net.join($('friend-id').value));
$('friend-id').addEventListener('keydown', (e) => { if (e.key === 'Enter') net.join($('friend-id').value); });

// ---- lobby: 3D home screen, wardrobe, squad ----
let lobby = null;
try {
  lobby = new Lobby3D($('lobby-canvas'), profile.look, () => !$('menu').classList.contains('hidden'));
  lobby.onLoading = (on) => $('lb-loading').classList.toggle('hidden', !on);
  lobby.setLook(profile.look);                     // again, now that the loading chip is wired
  lobby.start();
  window.__lobby = lobby;
} catch (err) { console.warn('3D lobby unavailable, using the plain menu:', err); }   // the game itself must never depend on the lobby

const TIPS = ['Dig down to find caves, lava and glowing crystals.', 'Build a tower into the sky to reach floating islands.', 'Share your invite link: friends join with one tap.',
  'Shooting animals heals you.', 'Customize your HUD to fit your thumbs.', 'Water cancels fall damage. Clouds too.', 'Villagers sleep at night. Be quiet!'];
let tipI = 0; const showTip = () => { $('lb-tip').textContent = TIPS[tipI++ % TIPS.length]; }; showTip(); setInterval(showTip, 6000);

function refreshProfileUi() {
  $('lb-name').textContent = profile.name;
  $('lb-avatar').textContent = (profile.name[0] || 'P').toUpperCase();
  net.setProfile(profile.toJSON());
}
refreshProfileUi();

// ---- realistic characters: the chosen one loads first (lobby), then the one the bots use; GFX LOW keeps bots/friends blocky ----
const GFX_KEY = 'blockops.gfx';
try { if (localStorage.getItem(GFX_KEY) === 'low') gfx.models = false; } catch (_) { /* storage blocked */ }
const botModelFor = (look) => (look.model === 'remy' ? 'eve' : 'remy');   // enemies never look like you
function preloadModels() {
  game.botModel = botModelFor(profile.look);
  const mine = profile.look.model !== 'blocky' ? loadModel(profile.look.model) : Promise.resolve();
  mine.then(() => { if (gfx.models) loadModel(game.botModel); });
}
game.getLook = () => profile.look;
preloadModels();
const showGfx = () => { $('gfx-label').textContent = gfx.models ? 'GFX HIGH' : 'GFX LOW'; };
showGfx();
$('gfx-btn').addEventListener('click', () => {
  gfx.models = !gfx.models; showGfx();
  try { localStorage.setItem(GFX_KEY, gfx.models ? 'high' : 'low'); } catch (_) { /* ignore */ }
  if (gfx.models) preloadModels();
  $('net-status').textContent = gfx.models ? 'Graphics HIGH: realistic bots and friends' : 'Graphics LOW: lighter blocky bots and friends (faster on old phones)';
});

let refreshWardrobe = buildWardrobe($('wd-rows'), profile.look, (patch) => {
  profile.setLook(patch); refreshWardrobe(profile.look); lobby?.setLook(profile.look); refreshProfileUi();
  if (patch.model) preloadModels();
});
$('wd-name').value = profile.name;
$('wd-name').addEventListener('change', (e) => { profile.setName(e.target.value); e.target.value = profile.name; refreshProfileUi(); });
const openWardrobe = (on) => { $('wardrobe').classList.toggle('hidden', !on); $('help').classList.add('hidden'); };
$('wd-open').addEventListener('click', () => openWardrobe($('wardrobe').classList.contains('hidden')));
$('lb-profile').addEventListener('click', () => openWardrobe($('wardrobe').classList.contains('hidden')));
$('wd-done').addEventListener('click', () => openWardrobe(false));
$('help-btn').addEventListener('click', () => { $('help').classList.toggle('hidden'); $('wardrobe').classList.add('hidden'); });
$('help-close').addEventListener('click', () => $('help').classList.add('hidden'));

function renderSquad() {
  const box = $('lb-friends'); box.textContent = '';
  const you = document.createElement('div'); you.className = 'squad-slot you'; you.textContent = profile.name; box.appendChild(you);
  for (const id of net.conns.keys()) { const f = document.createElement('div'); f.className = 'squad-slot friend'; f.textContent = net.friendName(id); box.appendChild(f); }
  for (let i = box.children.length; i < 4; i++) { const e = document.createElement('div'); e.className = 'squad-slot'; e.textContent = 'Empty'; box.appendChild(e); }
  const n = 1 + net.conns.size;
  $('lb-count').textContent = n + '/4';
  $('start-sub').textContent = n > 1 ? 'WITH ' + (n - 1) + ' FRIEND' + (n > 2 ? 'S' : '') : 'SOLO';
}
net.onFriends = renderSquad; renderSquad();

const link = () => inviteLink(myId, location.href);
async function shareInvite() {
  const text = `Join my Block Ops world! My ID: ${myId}`;
  try { if (navigator.share) { await navigator.share({ title: 'Block Ops', text, url: link() }); return; } } catch (_) { /* cancelled: fall through to copy */ }
  const ok = await copyToClipboard(link());
  $('net-status').textContent = ok ? 'Invite link copied. Send it to your friend.' : 'Copy this link: ' + link();
}
$('lb-copy-link').addEventListener('click', shareInvite);

// opening a friend's invite link joins them automatically as soon as the network is up
const autoJoin = joinIdFromSearch(location.search);
if (autoJoin) { $('friend-id').value = autoJoin; net.onReady = () => net.join(autoJoin); $('net-status').textContent = 'Joining ' + autoJoin + '...'; }

async function deploy() {
  game.audio.unlock();
  $('menu').classList.add('hidden');
  lobby?.dispose(); lobby = null;
  game.hud.show(true);
  game.paused = false;
  if (touch) {
    mobile.setEnabled(true);
    try { await document.documentElement.requestFullscreen?.(); } catch (_) { /* iOS Safari: not supported */ }
    try { await screen.orientation?.lock?.('landscape'); } catch (_) { /* needs fullscreen/PWA */ }
  } else {
    desktop.setEnabled(true);
    $('game').requestPointerLock?.();
  }
  game.start();
  updateRotateHint();
}
$('play-btn').addEventListener('click', deploy);
$('opt-bots').addEventListener('change', () => game.loadWorld(game.seed, [...game.world.edits].map(([k, v]) => [...k.split(',').map(Number), v]), $('opt-bots').checked));

function updateRotateHint() {
  const portrait = touch && window.innerHeight > window.innerWidth && game.running;
  $('rotate-hint').classList.toggle('hidden', !portrait);
}
window.addEventListener('resize', updateRotateHint);

window.__bootOk = true;
window.__game = game; // handy for debugging in the console
