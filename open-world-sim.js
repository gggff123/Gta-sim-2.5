(async function () {
  if (window.simCleanup) window.simCleanup();

  // ── Load Three.js ──────────────────────────────────────────────────────────
  if (!window.THREE) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  const THREE = window.THREE;

  // ── Container / Renderer ───────────────────────────────────────────────────
  const container = document.createElement('div');
  container.id = 'gta-sim';
  container.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:999999;background:#000;overflow:hidden;';
  document.body.appendChild(container);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x87ceeb, 80, 600);
  scene.background = new THREE.Color(0x87ceeb);

  const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);

  // ── Lighting ───────────────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const sun = new THREE.DirectionalLight(0xfff4cc, 1.0);
  sun.position.set(100, 200, 100);
  sun.castShadow = true;
  scene.add(sun);

  // ══════════════════════════════════════════════════════════════════════════
  // WORLD GENERATION — chunk-based infinite grid
  // ══════════════════════════════════════════════════════════════════════════
  const CHUNK = 100;          // world units per chunk
  const RENDER_CHUNKS = 5;    // radius of chunks around player
  const chunkCache = new Map(); // key -> THREE.Group
  const rng = (seed) => {
    // deterministic pseudo-random from seed
    let s = Math.sin(seed) * 43758.5453123;
    return s - Math.floor(s);
  };
  const chunkRng = (cx, cz, idx) => rng(cx * 9301 + cz * 49297 + idx * 233);

  const roadMat  = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
  const grassMat = new THREE.MeshLambertMaterial({ color: 0x3d8b3d });
  const lineMat  = new THREE.MeshBasicMaterial({ color: 0xdddd00 });
  const sidewalkMat = new THREE.MeshLambertMaterial({ color: 0xaaaaaa });
  const buildingPalette = [0x8899aa,0x667788,0x99aabb,0x556677,0xaabbcc,0x7a8b6f,0xc4a882,0x9b7b5e];
  const windowMat = new THREE.MeshBasicMaterial({ color: 0xffffcc, side: THREE.DoubleSide });

  function buildChunk(cx, cz) {
    const key = `${cx},${cz}`;
    if (chunkCache.has(key)) return;

    const g = new THREE.Group();
    g.position.set(cx * CHUNK, 0, cz * CHUNK);

    // Ground tile
    const gnd = new THREE.Mesh(new THREE.PlaneGeometry(CHUNK, CHUNK), grassMat);
    gnd.rotation.x = -Math.PI / 2;
    gnd.position.set(0, 0, 0);
    gnd.receiveShadow = true;
    g.add(gnd);

    // Road along X axis (z=0 edge of chunk)
    const roadH = new THREE.Mesh(new THREE.PlaneGeometry(CHUNK, 12), roadMat);
    roadH.rotation.x = -Math.PI / 2;
    roadH.position.set(0, 0.01, 0);
    roadH.receiveShadow = true;
    g.add(roadH);

    // Road along Z axis (x=0 edge of chunk)
    const roadV = new THREE.Mesh(new THREE.PlaneGeometry(12, CHUNK), roadMat);
    roadV.rotation.x = -Math.PI / 2;
    roadV.position.set(0, 0.01, 0);
    roadV.receiveShadow = true;
    g.add(roadV);

    // Sidewalks
    for (let side = -1; side <= 1; side += 2) {
      const swH = new THREE.Mesh(new THREE.PlaneGeometry(CHUNK, 2), sidewalkMat);
      swH.rotation.x = -Math.PI / 2;
      swH.position.set(0, 0.015, side * 7);
      g.add(swH);
      const swV = new THREE.Mesh(new THREE.PlaneGeometry(2, CHUNK), sidewalkMat);
      swV.rotation.x = -Math.PI / 2;
      swV.position.set(side * 7, 0.015, 0);
      g.add(swV);
    }

    // Dashed center lines
    for (let t = -45; t <= 45; t += 10) {
      const dl = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.25), lineMat);
      dl.rotation.x = -Math.PI / 2;
      dl.position.set(t, 0.02, 0);
      g.add(dl);
      const dl2 = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 6), lineMat);
      dl2.rotation.x = -Math.PI / 2;
      dl2.position.set(0, 0.02, t);
      g.add(dl2);
    }

    // Buildings in the four quadrants
    const quadrants = [
      [ 25,  25], [ 25, -25],
      [-25,  25], [-25, -25],
    ];
    quadrants.forEach(([qx, qz], qi) => {
      // skip if rng says empty lot
      if (chunkRng(cx, cz, qi * 10) < 0.15) return;

      const h   = 8  + chunkRng(cx, cz, qi * 10 + 1) * 50;
      const w   = 14 + chunkRng(cx, cz, qi * 10 + 2) * 22;
      const d   = 14 + chunkRng(cx, cz, qi * 10 + 3) * 22;
      const col = buildingPalette[Math.floor(chunkRng(cx, cz, qi * 10 + 4) * buildingPalette.length)];
      const ox  = (chunkRng(cx, cz, qi * 10 + 5) - 0.5) * 12;
      const oz  = (chunkRng(cx, cz, qi * 10 + 6) - 0.5) * 12;

      const bMesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshLambertMaterial({ color: col })
      );
      bMesh.position.set(qx + ox, h / 2, qz + oz);
      bMesh.castShadow = true;
      bMesh.receiveShadow = true;
      g.add(bMesh);

      // Windows
      const wStep = 3;
      for (let wy = 3; wy < h - 2; wy += 4) {
        for (let wx2 = -w / 2 + 2; wx2 < w / 2 - 2; wx2 += wStep) {
          const win = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2), windowMat);
          win.position.set(wx2, wy - h / 2, d / 2 + 0.05);
          bMesh.add(win);
          const win2 = win.clone();
          win2.position.z = -d / 2 - 0.05;
          win2.rotation.y = Math.PI;
          bMesh.add(win2);
        }
      }
    });

    scene.add(g);
    chunkCache.set(key, g);
  }

  function updateChunks(px, pz) {
    const ccx = Math.round(px / CHUNK);
    const ccz = Math.round(pz / CHUNK);
    const needed = new Set();
    for (let dx = -RENDER_CHUNKS; dx <= RENDER_CHUNKS; dx++) {
      for (let dz = -RENDER_CHUNKS; dz <= RENDER_CHUNKS; dz++) {
        const key = `${ccx + dx},${ccz + dz}`;
        needed.add(key);
        buildChunk(ccx + dx, ccz + dz);
      }
    }
    // Unload far chunks
    for (const [key, grp] of chunkCache) {
      if (!needed.has(key)) {
        scene.remove(grp);
        grp.traverse(c => { if (c.geometry) c.geometry.dispose(); });
        chunkCache.delete(key);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYER CAR
  // ══════════════════════════════════════════════════════════════════════════
  function makeCar(color = 0xff3333) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.75, 4),
      new THREE.MeshLambertMaterial({ color }));
    body.position.y = 0.5; body.castShadow = true; g.add(body);

    const top = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 2),
      new THREE.MeshLambertMaterial({ color }));
    top.position.set(0, 1.15, -0.3); top.castShadow = true; g.add(top);

    const wGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.35, 12);
    const wMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const wpos = [[-1,0.4,1.3],[1,0.4,1.3],[-1,0.4,-1.3],[1,0.4,-1.3]];
    const wheels = wpos.map(p => {
      const w = new THREE.Mesh(wGeo, wMat);
      w.rotation.z = Math.PI / 2; w.position.set(...p); w.castShadow = true; g.add(w);
      return w;
    });

    // lights
    const hlm = new THREE.MeshBasicMaterial({ color: 0xffffaa });
    const tlm = new THREE.MeshBasicMaterial({ color: 0xff2200 });
    [[-0.6, 0.5, 2.02],[0.6, 0.5, 2.02]].forEach(p => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.18, 8), hlm);
      m.position.set(...p); g.add(m);
    });
    [[-0.6, 0.5, -2.02],[0.6, 0.5, -2.02]].forEach(p => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.14, 8), tlm);
      m.position.set(...p); m.rotation.y = Math.PI; g.add(m);
    });

    g._wheels = wheels;
    g._type = 'car';
    return g;
  }

  const playerCar = makeCar(0xff3333);
  playerCar.position.set(0, 0, 5);
  scene.add(playerCar);

  // ══════════════════════════════════════════════════════════════════════════
  // PLAYER CHARACTER (on-foot mode)
  // ══════════════════════════════════════════════════════════════════════════
  function makeCharacter(color = 0x4488ff, isPolice = false) {
    const g = new THREE.Group();
    const bodyC = isPolice ? 0x003080 : color;
    const headC = 0xffd09b;

    // torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.3),
      new THREE.MeshLambertMaterial({ color: bodyC }));
    torso.position.y = 1.0; torso.castShadow = true; g.add(torso);

    // head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4),
      new THREE.MeshLambertMaterial({ color: headC }));
    head.position.y = 1.65; head.castShadow = true; g.add(head);

    // legs
    const legMat = new THREE.MeshLambertMaterial({ color: isPolice ? 0x001a4d : 0x222244 });
    [[-0.15, 0.3, 0],[0.15, 0.3, 0]].forEach((p, i) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.6, 0.25), legMat);
      leg.position.set(...p); leg.castShadow = true; g.add(leg);
      g[i === 0 ? '_legL' : '_legR'] = leg;
    });

    // arms
    const armMat = new THREE.MeshLambertMaterial({ color: bodyC });
    [[-0.45, 0.95, 0],[0.45, 0.95, 0]].forEach((p, i) => {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.2), armMat);
      arm.position.set(...p); arm.castShadow = true; g.add(arm);
      g[i === 0 ? '_armL' : '_armR'] = arm;
    });

    // gun arm held out
    const gunMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.35), gunMat);
    gunBody.position.set(0.55, 0.95, 0.25);
    g.add(gunBody);
    g._gun = gunBody;

    if (isPolice) {
      // police hat
      const hatMat = new THREE.MeshLambertMaterial({ color: 0x001a4d });
      const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 8), hatMat);
      hat.position.y = 1.92; g.add(hat);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 8), hatMat);
      brim.position.y = 1.86; g.add(brim);
      // badge
      const badge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.02),
        new THREE.MeshBasicMaterial({ color: 0xffd700 }));
      badge.position.set(0, 1.05, 0.16); g.add(badge);
    }

    g._type = 'character';
    g._isPolice = isPolice || false;
    g._health = 100;
    g._walkTimer = 0;
    return g;
  }

  const player = makeCharacter(0x4488ff, false);
  player.visible = false;
  player.position.set(0, 0, 5);
  scene.add(player);

  // ══════════════════════════════════════════════════════════════════════════
  // GAME STATE
  // ══════════════════════════════════════════════════════════════════════════
  let mode = 'car'; // 'car' | 'foot'
  let playerHealth = 100;
  let wantedLevel  = 0;
  let wantedTimer  = 0;
  let ammo = 30;
  let score = 0;
  let lastShot = 0;

  // Camera yaw for on-foot mode
  let camYaw   = 0;
  let camPitch = -0.25;

  // ══════════════════════════════════════════════════════════════════════════
  // NPCs
  // ══════════════════════════════════════════════════════════════════════════
  const npcs = [];
  const NPC_COUNT = 25;
  const POLICE_BASE = 3;
  const npcColors = [0xff8844, 0x44ff88, 0x8844ff, 0xffff44, 0xff44aa, 0x44aaff];

  function spawnNPC(x, z, isPolice = false) {
    const npc = makeCharacter(npcColors[Math.floor(Math.random() * npcColors.length)], isPolice);
    npc.position.set(x, 0, z);
    npc.rotation.y = Math.random() * Math.PI * 2;
    npc._speed = isPolice ? 0.07 : 0.03 + Math.random() * 0.02;
    npc._state = 'wander'; // wander | flee | chase | dead
    npc._stateTimer = 0;
    npc._target = null;
    npc._health = isPolice ? 80 : 40;
    npc._shootTimer = 0;
    scene.add(npc);
    npcs.push(npc);
    return npc;
  }

  // spawn initial NPCs spread around origin
  for (let i = 0; i < NPC_COUNT; i++) {
    const ang = Math.random() * Math.PI * 2;
    const dist = 20 + Math.random() * 150;
    spawnNPC(Math.cos(ang) * dist, Math.sin(ang) * dist, false);
  }
  for (let i = 0; i < POLICE_BASE; i++) {
    spawnNPC((Math.random() - 0.5) * 200, (Math.random() - 0.5) * 200, true);
  }

  function respawnNPC(npc) {
    const playerPos = mode === 'foot' ? player.position : playerCar.position;
    const ang = Math.random() * Math.PI * 2;
    const dist = 80 + Math.random() * 80;
    npc.position.set(playerPos.x + Math.cos(ang) * dist, 0, playerPos.z + Math.sin(ang) * dist);
    npc._health = npc._isPolice ? 80 : 40;
    npc._state = 'wander';
    npc.visible = true;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BULLETS
  // ══════════════════════════════════════════════════════════════════════════
  const bullets = [];
  const bulletGeo = new THREE.SphereGeometry(0.08, 6, 6);
  const bulletMatPlayer = new THREE.MeshBasicMaterial({ color: 0xffff00 });
  const bulletMatEnemy  = new THREE.MeshBasicMaterial({ color: 0xff4400 });

  function fireBullet(origin, dir, isPlayer) {
    const b = new THREE.Mesh(bulletGeo, isPlayer ? bulletMatPlayer : bulletMatEnemy);
    b.position.copy(origin);
    b._vel = dir.clone().normalize().multiplyScalar(isPlayer ? 2.5 : 1.5);
    b._isPlayer = isPlayer;
    b._life = 0;
    scene.add(b);
    bullets.push(b);
  }

  // Muzzle flash effect
  const flashGeo = new THREE.SphereGeometry(0.25, 6, 6);
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
  let flashMesh = new THREE.Mesh(flashGeo, flashMat);
  flashMesh.visible = false;
  scene.add(flashMesh);
  let flashTimer = 0;

  // ══════════════════════════════════════════════════════════════════════════
  // BLOOD / HIT PARTICLES (simple)
  // ══════════════════════════════════════════════════════════════════════════
  const particles = [];
  function spawnBlood(pos) {
    for (let i = 0; i < 6; i++) {
      const p = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 4, 4),
        new THREE.MeshBasicMaterial({ color: 0xcc0000 })
      );
      p.position.copy(pos).add(new THREE.Vector3((Math.random()-0.5)*0.5, 0.5+Math.random()*0.5, (Math.random()-0.5)*0.5));
      p._vel = new THREE.Vector3((Math.random()-0.5)*0.15, 0.1+Math.random()*0.1, (Math.random()-0.5)*0.15);
      p._life = 0;
      scene.add(p);
      particles.push(p);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CROSSHAIR / HUD
  // ══════════════════════════════════════════════════════════════════════════
  const hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;font-family:monospace;';
  container.appendChild(hud);

  // Crosshair
  const xhair = document.createElement('div');
  xhair.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:white;font-size:22px;text-shadow:0 0 4px #000;line-height:1;';
  xhair.textContent = '+';
  hud.appendChild(xhair);

  // Stats panel
  const stats = document.createElement('div');
  stats.style.cssText = 'position:absolute;top:16px;left:16px;color:#fff;font-size:14px;text-shadow:1px 1px 3px #000;line-height:1.7;background:rgba(0,0,0,0.45);padding:10px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);';
  hud.appendChild(stats);

  // Wanted panel
  const wantedPanel = document.createElement('div');
  wantedPanel.style.cssText = 'position:absolute;top:16px;right:16px;color:#fff;font-size:14px;text-shadow:1px 1px 3px #000;background:rgba(0,0,0,0.45);padding:10px 14px;border-radius:8px;border:1px solid rgba(255,200,0,0.3);text-align:right;';
  hud.appendChild(wantedPanel);

  // Kill feed
  const killFeed = document.createElement('div');
  killFeed.style.cssText = 'position:absolute;bottom:60px;right:16px;color:#ff6666;font-size:13px;text-shadow:1px 1px 2px #000;text-align:right;';
  hud.appendChild(killFeed);
  const killMessages = [];
  function addKill(msg) {
    killMessages.push({ msg, t: 0 });
    if (killMessages.length > 5) killMessages.shift();
  }

  // Controls hint
  const hint = document.createElement('div');
  hint.style.cssText = 'position:absolute;bottom:16px;left:50%;transform:translateX(-50%);color:rgba(255,255,255,0.7);font-size:12px;text-shadow:1px 1px 2px #000;background:rgba(0,0,0,0.35);padding:6px 14px;border-radius:6px;text-align:center;';
  hint.innerHTML = 'WASD Move &nbsp;|&nbsp; Mouse Look &nbsp;|&nbsp; F Enter/Exit Car &nbsp;|&nbsp; Click Shoot &nbsp;|&nbsp; R Reload &nbsp;|&nbsp; ESC Close';
  hud.appendChild(hint);

  // Damage flash
  const dmgFlash = document.createElement('div');
  dmgFlash.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;background:rgba(255,0,0,0);transition:background 0.1s;';
  hud.appendChild(dmgFlash);
  let dmgFlashTimer = 0;

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = 'position:absolute;top:12px;right:12px;background:rgba(0,0,0,0.6);color:white;border:1px solid rgba(255,255,255,0.3);border-radius:50%;width:32px;height:32px;font-size:16px;cursor:pointer;z-index:10;pointer-events:all;display:none;';
  closeBtn.onclick = () => window.simCleanup && window.simCleanup();
  hud.appendChild(closeBtn);

  // ══════════════════════════════════════════════════════════════════════════
  // POINTER LOCK
  // ══════════════════════════════════════════════════════════════════════════
  let pointerLocked = false;
  renderer.domElement.addEventListener('click', () => {
    if (!pointerLocked) renderer.domElement.requestPointerLock();
  });
  document.addEventListener('pointerlockchange', () => {
    pointerLocked = document.pointerLockElement === renderer.domElement;
    xhair.style.display = pointerLocked ? 'block' : 'block';
    closeBtn.style.display = pointerLocked ? 'none' : 'block';
    hint.style.display = pointerLocked ? 'block' : 'block';
  });
  document.addEventListener('mousemove', (e) => {
    if (!pointerLocked) return;
    camYaw   -= e.movementX * 0.002;
    camPitch -= e.movementY * 0.002;
    camPitch = Math.max(-1.2, Math.min(0.5, camPitch));
  });

  // ══════════════════════════════════════════════════════════════════════════
  // CONTROLS
  // ══════════════════════════════════════════════════════════════════════════
  const keys = {};
  const onKey = (e, v) => {
    keys[e.key.toLowerCase()] = v;
    if (e.key === ' ' || e.key.startsWith('Arrow')) e.preventDefault();
    // Enter/exit car
    if (v && e.key.toLowerCase() === 'f') toggleMode();
    // Reload
    if (v && e.key.toLowerCase() === 'r') { ammo = 30; addKill('🔄 Reloaded'); }
    // Escape exits pointer lock
    if (e.key === 'Escape') {
      if (pointerLocked) document.exitPointerLock();
    }
  };
  document.addEventListener('keydown', e => onKey(e, true));
  document.addEventListener('keyup',   e => onKey(e, false));

  // Shoot on click
  document.addEventListener('mousedown', (e) => {
    if (e.button === 0 && pointerLocked && mode === 'foot') shootPlayer();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // CAR PHYSICS
  // ══════════════════════════════════════════════════════════════════════════
  let carSpeed = 0, carSteering = 0;
  const MAX_SPEED = 1.6, ACCEL = 0.025, DECEL = 0.012, BRAKE = 0.06, TURN = 0.045;

  // ══════════════════════════════════════════════════════════════════════════
  // FOOT PHYSICS
  // ══════════════════════════════════════════════════════════════════════════
  const FOOT_SPEED = 0.12;

  // ══════════════════════════════════════════════════════════════════════════
  // MODE TOGGLE
  // ══════════════════════════════════════════════════════════════════════════
  function toggleMode() {
    if (mode === 'car') {
      mode = 'foot';
      player.position.copy(playerCar.position);
      player.position.x += 2.5;
      player.rotation.y = playerCar.rotation.y;
      player.visible = true;
      playerCar.visible = true;
      camYaw = playerCar.rotation.y;
    } else {
      // check distance to car
      const d = player.position.distanceTo(playerCar.position);
      if (d < 6) {
        mode = 'car';
        player.visible = false;
        playerCar.position.copy(player.position);
        playerCar.position.x -= 2.5;
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SHOOTING
  // ══════════════════════════════════════════════════════════════════════════
  function shootPlayer() {
    const now = performance.now();
    if (now - lastShot < 200) return; // rate limit
    if (ammo <= 0) { addKill('⚠️ Out of ammo! Press R'); return; }
    lastShot = now;
    ammo--;

    // Direction from camera
    const dir = new THREE.Vector3(0, 0, 1);
    dir.applyEuler(new THREE.Euler(camPitch, camYaw, 0, 'YXZ'));
    const origin = player.position.clone().add(new THREE.Vector3(0, 1.5, 0));
    fireBullet(origin, dir, true);

    // Muzzle flash
    flashMesh.position.copy(origin).add(dir.clone().multiplyScalar(0.8));
    flashMesh.visible = true;
    flashTimer = 0.08;

    // Increase wanted level
    wantedLevel = Math.min(5, wantedLevel + 0.2);
    wantedTimer = 10;
  }

  function npcShoot(npc) {
    if (npc._state === 'dead') return;
    const target = mode === 'foot' ? player.position : playerCar.position;
    const origin = npc.position.clone().add(new THREE.Vector3(0, 1.4, 0));
    const dir = target.clone().add(new THREE.Vector3(0, 1, 0)).sub(origin);
    // Add inaccuracy
    dir.x += (Math.random() - 0.5) * 0.5;
    dir.z += (Math.random() - 0.5) * 0.5;
    fireBullet(origin, dir, false);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MAIN LOOP
  // ══════════════════════════════════════════════════════════════════════════
  let animId;
  const clock = new THREE.Clock();

  function animate() {
    animId = requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    const playerPos = mode === 'foot' ? player.position : playerCar.position;

    // ── Chunk streaming ──────────────────────────────────────────────────
    updateChunks(playerPos.x, playerPos.z);

    // ── CAR MODE ─────────────────────────────────────────────────────────
    if (mode === 'car') {
      if (keys['w'] || keys['arrowup'])       carSpeed = Math.min(carSpeed + ACCEL, MAX_SPEED);
      else if (keys['s'] || keys['arrowdown']) carSpeed = Math.max(carSpeed - ACCEL, -MAX_SPEED * 0.5);
      else {
        if (carSpeed > 0) carSpeed = Math.max(carSpeed - DECEL, 0);
        if (carSpeed < 0) carSpeed = Math.min(carSpeed + DECEL, 0);
      }
      if (keys[' ']) {
        carSpeed += carSpeed > 0 ? -BRAKE : BRAKE;
        if (Math.abs(carSpeed) < 0.01) carSpeed = 0;
      }
      if (keys['a'] || keys['arrowleft'])       carSteering = Math.min(carSteering + 0.05, 1);
      else if (keys['d'] || keys['arrowright'])  carSteering = Math.max(carSteering - 0.05, -1);
      else carSteering *= 0.85;

      if (Math.abs(carSpeed) > 0.01) {
        const steerDir = carSpeed >= 0 ? 1 : -1;
        playerCar.rotation.y += carSteering * TURN * (carSpeed / MAX_SPEED) * steerDir;
      }
      playerCar.translateZ(carSpeed);
      playerCar.position.y = 0;
      playerCar._wheels.forEach(w => w.rotation.x += carSpeed * 0.3);

      // Car camera (third person, uses camYaw for optional look-around — default behind)
      const carBack = new THREE.Vector3(0, 5, -12).applyQuaternion(playerCar.quaternion).add(playerCar.position);
      camera.position.lerp(carBack, 0.12);
      camera.lookAt(playerCar.position.clone().add(new THREE.Vector3(0, 1, 0)));
    }

    // ── FOOT MODE ─────────────────────────────────────────────────────────
    if (mode === 'foot') {
      const moveDir = new THREE.Vector3();
      if (keys['w'] || keys['arrowup'])        moveDir.z += 1;
      if (keys['s'] || keys['arrowdown'])       moveDir.z -= 1;
      if (keys['a'] || keys['arrowleft'])       moveDir.x -= 1;
      if (keys['d'] || keys['arrowright'])      moveDir.x += 1;

      if (moveDir.length() > 0) {
        moveDir.normalize();
        // rotate move direction by camera yaw
        moveDir.applyEuler(new THREE.Euler(0, camYaw, 0));
        player.position.addScaledVector(moveDir, FOOT_SPEED);
        player.rotation.y = camYaw;

        // Walk animation
        player._walkTimer += dt * 10;
        if (player._legL) player._legL.rotation.x = Math.sin(player._walkTimer) * 0.5;
        if (player._legR) player._legR.rotation.x = Math.sin(player._walkTimer + Math.PI) * 0.5;
        if (player._armL) player._armL.rotation.x = Math.sin(player._walkTimer + Math.PI) * 0.4;
        if (player._armR) player._armR.rotation.x = Math.sin(player._walkTimer) * 0.4;
      }
      player.position.y = 0;

      // First/third person camera
      const camDist = 6;
      const camHeight = 2.5;
      const behind = new THREE.Vector3(
        player.position.x - Math.sin(camYaw) * camDist,
        player.position.y + camHeight,
        player.position.z - Math.cos(camYaw) * camDist
      );
      // apply pitch offset
      const pitchOffset = new THREE.Vector3(0, Math.sin(camPitch) * camDist, Math.cos(camPitch) * camDist);
      pitchOffset.applyEuler(new THREE.Euler(0, camYaw, 0));
      const idealCam = player.position.clone().add(new THREE.Vector3(0, camHeight, 0)).sub(pitchOffset);
      camera.position.lerp(idealCam, 0.2);

      const lookTarget = player.position.clone().add(new THREE.Vector3(0, 1.5, 0));
      const fwd = new THREE.Vector3(Math.sin(camYaw), -Math.sin(camPitch), Math.cos(camYaw));
      camera.lookAt(lookTarget.clone().add(fwd.multiplyScalar(5)));
    }

    // ── FLASH ────────────────────────────────────────────────────────────
    if (flashTimer > 0) {
      flashTimer -= dt;
      if (flashTimer <= 0) flashMesh.visible = false;
    }

    // ── DAMAGE FLASH ─────────────────────────────────────────────────────
    if (dmgFlashTimer > 0) {
      dmgFlashTimer -= dt;
      dmgFlash.style.background = `rgba(255,0,0,${Math.min(0.5, dmgFlashTimer * 2)})`;
    }

    // ── NPC AI ───────────────────────────────────────────────────────────
    const now = performance.now() / 1000;
    for (let i = npcs.length - 1; i >= 0; i--) {
      const npc = npcs[i];
      if (!npc.visible) continue;
      if (npc._state === 'dead') continue;

      const distToPlayer = npc.position.distanceTo(playerPos);

      // Respawn far NPCs
      if (distToPlayer > 300) { respawnNPC(npc); continue; }

      npc._stateTimer -= dt;

      if (npc._isPolice) {
        // Police always chase if wanted
        if (wantedLevel >= 1) {
          npc._state = 'chase';
        } else {
          if (npc._stateTimer <= 0) {
            npc._state = 'wander';
            npc._stateTimer = 2 + Math.random() * 3;
          }
        }
      } else {
        // Civilians flee when shooting nearby
        if (wantedLevel >= 2 && distToPlayer < 40) {
          npc._state = 'flee';
        } else if (npc._stateTimer <= 0) {
          npc._state = 'wander';
          npc._stateTimer = 2 + Math.random() * 4;
          npc.rotation.y = Math.random() * Math.PI * 2;
        }
      }

      // Movement
      if (npc._state === 'wander') {
        npc.translateZ(npc._speed * 0.5);
      } else if (npc._state === 'flee') {
        const away = npc.position.clone().sub(playerPos).normalize();
        npc.position.addScaledVector(away, npc._speed * 0.8);
        npc.rotation.y = Math.atan2(away.x, away.z);
      } else if (npc._state === 'chase') {
        const toPlayer = playerPos.clone().sub(npc.position).normalize();
        if (distToPlayer > 8) {
          npc.position.addScaledVector(toPlayer, npc._speed);
        }
        npc.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);

        // Police shoot
        if (npc._isPolice && distToPlayer < 30) {
          npc._shootTimer = (npc._shootTimer || 0) - dt;
          if (npc._shootTimer <= 0) {
            npcShoot(npc);
            npc._shootTimer = 1.5 + Math.random();
          }
        }
      }

      npc.position.y = 0;

      // Walk anim
      npc._walkTimer = (npc._walkTimer || 0) + dt * 8;
      if (npc._legL) npc._legL.rotation.x = Math.sin(npc._walkTimer) * 0.4;
      if (npc._legR) npc._legR.rotation.x = Math.sin(npc._walkTimer + Math.PI) * 0.4;
    }

    // ── BULLETS ──────────────────────────────────────────────────────────
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.position.add(b._vel);
      b._life += dt;
      if (b._life > 2.5) { scene.remove(b); bullets.splice(i, 1); continue; }

      if (b._isPlayer) {
        // Check NPC hits
        for (const npc of npcs) {
          if (npc._state === 'dead' || !npc.visible) continue;
          if (b.position.distanceTo(npc.position.clone().add(new THREE.Vector3(0, 1, 0))) < 0.9) {
            npc._health -= 25 + Math.random() * 15;
            spawnBlood(b.position.clone());
            scene.remove(b); bullets.splice(i, 1);
            if (npc._health <= 0) {
              npc._state = 'dead';
              npc.position.y = -0.3;
              npc.rotation.x = Math.PI / 2;
              score += npc._isPolice ? 50 : 10;
              addKill(npc._isPolice ? '🚔 Police Officer down! +50' : '💀 NPC down! +10');
              wantedLevel = Math.min(5, wantedLevel + (npc._isPolice ? 1.0 : 0.3));
              wantedTimer = 15;
              setTimeout(() => respawnNPC(npc), 8000);
            } else {
              npc._state = 'chase';
            }
            break;
          }
        }
      } else {
        // Enemy bullet hits player
        const target = mode === 'foot' ? player.position : playerCar.position;
        if (b.position.distanceTo(target.clone().add(new THREE.Vector3(0, 1, 0))) < 1.2) {
          playerHealth = Math.max(0, playerHealth - 8);
          dmgFlashTimer = 0.5;
          dmgFlash.style.background = 'rgba(255,0,0,0.45)';
          scene.remove(b); bullets.splice(i, 1);
          if (playerHealth <= 0) respawnPlayer();
        }
      }
    }

    // ── PARTICLES ────────────────────────────────────────────────────────
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p._vel.y -= 0.01;
      p.position.add(p._vel);
      p._life += dt;
      if (p._life > 1.5) { scene.remove(p); particles.splice(i, 1); }
    }

    // ── WANTED LEVEL ─────────────────────────────────────────────────────
    if (wantedTimer > 0) {
      wantedTimer -= dt;
      if (wantedTimer <= 0 && wantedLevel > 0) wantedLevel = Math.max(0, wantedLevel - 0.5);
    }

    // Spawn extra police for high wanted
    if (wantedLevel >= 3 && Math.random() < 0.002) {
      const ang = Math.random() * Math.PI * 2;
      spawnNPC(playerPos.x + Math.cos(ang) * 60, playerPos.z + Math.sin(ang) * 60, true);
    }

    // ── HUD UPDATE ───────────────────────────────────────────────────────
    const speedVal = Math.abs(carSpeed * 60).toFixed(0);
    const wStars = '★'.repeat(Math.ceil(wantedLevel)) + '☆'.repeat(5 - Math.ceil(wantedLevel));
    const hpColor = playerHealth > 60 ? '#44ff88' : playerHealth > 30 ? '#ffcc00' : '#ff4444';
    stats.innerHTML =
      `❤️ <span style="color:${hpColor}">${playerHealth}</span>  &nbsp;🔫 ${ammo}/30 &nbsp;⭐ ${score}<br>` +
      `Mode: <b>${mode === 'car' ? '🚗 Driving' : '🚶 On Foot'}</b><br>` +
      (mode === 'car' ? `Speed: ${speedVal} km/h<br>` : '') +
      `F = ${mode === 'car' ? 'Exit Car' : 'Enter Car'}`;

    const wColor = wantedLevel < 2 ? '#ffcc00' : wantedLevel < 4 ? '#ff8800' : '#ff2200';
    wantedPanel.innerHTML = `WANTED<br><span style="color:${wColor};font-size:20px;">${wStars}</span>`;

    // Kill feed
    const feedLines = killMessages.map(k => `<div style="opacity:${Math.max(0.2, 1 - k.t/5)}">${k.msg}</div>`).join('');
    killFeed.innerHTML = feedLines;
    killMessages.forEach(k => k.t += dt);

    renderer.render(scene, camera);
  }

  function respawnPlayer() {
    playerHealth = 100;
    wantedLevel = 0;
    ammo = 30;
    playerCar.position.set(0, 0, 0);
    playerCar.rotation.y = 0;
    player.position.set(2.5, 0, 0);
    player.rotation.y = 0;
    carSpeed = 0;
    addKill('💀 Wasted! Respawned.');
  }

  animate();

  // Resize
  const onResize = () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  };
  window.addEventListener('resize', onResize);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  window.simCleanup = () => {
    cancelAnimationFrame(animId);
    document.removeEventListener('keydown', e => onKey(e, true));
    document.removeEventListener('keyup',   e => onKey(e, false));
    window.removeEventListener('resize', onResize);
    if (pointerLocked) document.exitPointerLock();
    container.remove();
    renderer.dispose();
    delete window.simCleanup;
  };

  // Auto-request pointer lock with instructions overlay
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.75);z-index:5;cursor:pointer;';
  overlay.innerHTML = `
    <div style="text-align:center;color:white;font-family:monospace;max-width:480px;padding:30px;border:1px solid rgba(255,255,255,0.2);border-radius:12px;background:rgba(0,0,0,0.6);">
      <div style="font-size:32px;margin-bottom:12px;">🏙️ OPEN WORLD SIM</div>
      <div style="font-size:15px;line-height:2;color:#ccc;">
        <b style="color:#fff">WASD</b> — Move &nbsp; <b style="color:#fff">Mouse</b> — Look<br>
        <b style="color:#fff">F</b> — Enter / Exit Car<br>
        <b style="color:#fff">Click</b> — Shoot (on foot)<br>
        <b style="color:#fff">R</b> — Reload &nbsp; <b style="color:#fff">ESC</b> — Release Mouse<br>
        <span style="color:#ff8888">Shoot civilians → raise wanted level → police chase you!</span>
      </div>
      <div style="margin-top:20px;font-size:18px;color:#ffcc44;">Click to Start ▶</div>
    </div>`;
  container.appendChild(overlay);
  overlay.addEventListener('click', () => {
    overlay.remove();
    renderer.domElement.requestPointerLock();
  });

  console.log('🏙️ Open World Sim loaded!');
})();
