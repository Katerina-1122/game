(function () {
  const BASE_SPEED = 10;
  const EDGE_PAD = 2;
  const GROUND_TOP_RATIO = 0.74;

  const scene = document.querySelector(".scene");
  const bee = document.getElementById("bee");
  const controls = document.getElementById("controls");
  const directionPad = document.getElementById("direction-pad");
  const flowerA = document.getElementById("flower-a");
  const flowerB = document.getElementById("flower-b");
  const okA = document.getElementById("ok-a");
  const okB = document.getElementById("ok-b");
  const successBanner = document.getElementById("pollen-success");
  const berry = document.getElementById("berry");
  const scallion = document.getElementById("scallion");
  const dragonfly = document.getElementById("dragonfly");

  if (
    !scene ||
    !bee ||
    !controls ||
    !directionPad ||
    !flowerA ||
    !flowerB ||
    !okA ||
    !okB ||
    !successBanner ||
    !berry ||
    !scallion ||
    !dragonfly
  ) {
    return;
  }

  let speed = BASE_SPEED;
  let berrySpeedApplied = false;
  let scallionSpeedApplied = false;
  let dragonflyTouching = false;

  const SFX_VOLUME = 0.88;
  const CLICK_THROTTLE_MS = 140;
  const sfxUrls = {
    click: "click.mp3",
    error: "errorse.mp3",
    right: "rightse.mp3",
    win: "winse.mp3",
  };
  const sfx = {};
  for (const key of Object.keys(sfxUrls)) {
    const el = new Audio(sfxUrls[key]);
    el.preload = "auto";
    el.volume = SFX_VOLUME;
    sfx[key] = el;
  }

  let audioCtx = null;
  let bgmOscillatorsStarted = false;
  let lastMoveClick = 0;

  function resumeAudioContext() {
    if (audioCtx && audioCtx.state === "suspended") {
      void audioCtx.resume();
    }
  }

  function startAmbientBgm() {
    if (bgmOscillatorsStarted) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) {
      bgmOscillatorsStarted = true;
      return;
    }

    audioCtx = new AC();
    const master = audioCtx.createGain();
    master.gain.value = 0.05;

    const chord = [
      { f: 196.0, w: 0.42 },
      { f: 246.94, w: 0.32 },
      { f: 293.66, w: 0.22 },
    ];
    chord.forEach(({ f, w }) => {
      const osc = audioCtx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f;
      const g = audioCtx.createGain();
      g.gain.value = w;
      osc.connect(g);
      g.connect(master);
      osc.start();
    });

    const airy = audioCtx.createOscillator();
    airy.type = "triangle";
    airy.frequency.value = 392;
    const airyG = audioCtx.createGain();
    airyG.gain.value = 0.035;
    airy.connect(airyG);
    airyG.connect(master);
    airy.start();

    master.connect(audioCtx.destination);
    bgmOscillatorsStarted = true;
    resumeAudioContext();
  }

  function unlockAudio() {
    if (!bgmOscillatorsStarted) startAmbientBgm();
    else resumeAudioContext();
  }

  function playSfx(name) {
    unlockAudio();
    const base = sfx[name];
    if (!base) return;
    const node = base.cloneNode();
    node.volume = SFX_VOLUME;
    void node.play().catch(() => {});
  }

  function maybePlayMoveClick() {
    unlockAudio();
    const t = performance.now();
    if (t - lastMoveClick < CLICK_THROTTLE_MS) return;
    lastMoveClick = t;
    const node = sfx.click.cloneNode();
    node.volume = SFX_VOLUME * 0.72;
    void node.play().catch(() => {});
  }

  scene.addEventListener("pointerdown", unlockAudio, { passive: true });

  const pollination = { a: false, b: false };

  const keyIntent = { up: false, down: false, left: false, right: false };
  const pointerIntent = { up: false, down: false, left: false, right: false };

  const state = { x: 0, y: 0, facing: 1 };
  let loopStarted = false;

  function beeSize() {
    const attrW = parseInt(bee.getAttribute("width"), 10) || 120;
    const attrH = parseInt(bee.getAttribute("height"), 10) || 120;
    const w = bee.offsetWidth || attrW;
    const h = bee.offsetHeight || attrH;
    return { w, h, halfW: w / 2, halfH: h / 2 };
  }

  function initialBeeCenter(sw, sh, bw, bh) {
    const leftEdge = Math.max(10, Math.min(sw * 0.024, 22));
    return {
      x: leftEdge + bw / 2,
      y: sh * GROUND_TOP_RATIO * 0.48,
    };
  }

  function padRectInScene() {
    const sr = scene.getBoundingClientRect();
    const pr = directionPad.getBoundingClientRect();
    return {
      left: pr.left - sr.left,
      top: pr.top - sr.top,
      right: pr.right - sr.left,
      bottom: pr.bottom - sr.top,
    };
  }

  function forbiddenZone() {
    const { halfW, halfH } = beeSize();
    const m = Math.max(halfW, halfH) + 4;
    const p = padRectInScene();
    if (p.right <= p.left || p.bottom <= p.top) return null;
    return {
      left: p.left - m,
      top: p.top - m,
      right: p.right + m,
      bottom: p.bottom + m,
    };
  }

  function clampToScene(cx, cy) {
    const sw = scene.clientWidth;
    const sh = scene.clientHeight;
    const { halfW, halfH } = beeSize();
    return {
      x: Math.min(
        Math.max(cx, halfW + EDGE_PAD),
        sw - halfW - EDGE_PAD
      ),
      y: Math.min(
        Math.max(cy, halfH + EDGE_PAD),
        sh - halfH - EDGE_PAD
      ),
    };
  }

  function pushOutsideIcons(cx, cy) {
    const r = forbiddenZone();
    if (!r) return { x: cx, y: cy };

    if (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) {
      return { x: cx, y: cy };
    }

    const dL = cx - r.left;
    const dR = r.right - cx;
    const dT = cy - r.top;
    const dB = r.bottom - cy;
    const d = Math.min(dL, dR, dT, dB);
    const eps = 0.5;
    if (d === dL) return { x: r.left - eps, y: cy };
    if (d === dR) return { x: r.right + eps, y: cy };
    if (d === dT) return { x: cx, y: r.top - eps };
    return { x: cx, y: r.bottom + eps };
  }

  function applyConstraints(cx, cy) {
    let p = clampToScene(cx, cy);
    p = pushOutsideIcons(p.x, p.y);
    p = clampToScene(p.x, p.y);
    return p;
  }

  function setBeePosition(cx, cy) {
    state.x = cx;
    state.y = cy;
    bee.style.left = `${cx}px`;
    bee.style.top = `${cy}px`;
    const sx = state.facing < 0 ? -1 : 1;
    bee.style.transform = `translate(-50%, -50%) scaleX(${sx})`;
  }

  function updateFacingFromHorizontal(intent, rawDx) {
    if (intent.right && !intent.left) state.facing = 1;
    else if (intent.left && !intent.right) state.facing = -1;
    else if (rawDx > 0.0001) state.facing = 1;
    else if (rawDx < -0.0001) state.facing = -1;
  }

  function syncBeeToConstraints() {
    const p = applyConstraints(state.x, state.y);
    setBeePosition(p.x, p.y);
  }

  function rectsOverlap(a, b) {
    return !(
      a.right < b.left ||
      a.left > b.right ||
      a.bottom < b.top ||
      a.top > b.bottom
    );
  }

  function checkPollination() {
    const beeRect = bee.getBoundingClientRect();

    if (!pollination.a) {
      const r = flowerA.getBoundingClientRect();
      if (rectsOverlap(beeRect, r)) {
        pollination.a = true;
        okA.hidden = false;
        playSfx("right");
      }
    }

    if (!pollination.b) {
      const r = flowerB.getBoundingClientRect();
      if (rectsOverlap(beeRect, r)) {
        pollination.b = true;
        okB.hidden = false;
        playSfx("right");
      }
    }

    if (pollination.a && pollination.b && successBanner.hidden) {
      playSfx("win");
      successBanner.hidden = false;
    }
  }

  function getInitialPosition() {
    const sw = scene.clientWidth;
    const sh = scene.clientHeight;
    const { w, h } = beeSize();
    const p0 = initialBeeCenter(sw, sh, w, h);
    return applyConstraints(p0.x, p0.y);
  }

  function resetBeeToStart() {
    state.facing = 1;
    const p = getInitialPosition();
    setBeePosition(p.x, p.y);
  }

  function checkPickupsAndDragonfly() {
    const beeRect = bee.getBoundingClientRect();

    if (!berrySpeedApplied && rectsOverlap(beeRect, berry.getBoundingClientRect())) {
      berrySpeedApplied = true;
      speed += 10;
    }

    if (!scallionSpeedApplied && rectsOverlap(beeRect, scallion.getBoundingClientRect())) {
      scallionSpeedApplied = true;
      speed -= 5;
    }

    const onDragonfly = rectsOverlap(beeRect, dragonfly.getBoundingClientRect());
    if (onDragonfly && !dragonflyTouching) {
      playSfx("error");
      resetBeeToStart();
    }
    dragonflyTouching = onDragonfly;
  }

  function mergedIntent() {
    return {
      up: keyIntent.up || pointerIntent.up,
      down: keyIntent.down || pointerIntent.down,
      left: keyIntent.left || pointerIntent.left,
      right: keyIntent.right || pointerIntent.right,
    };
  }

  function setKeyFromCode(code, down) {
    switch (code) {
      case "ArrowUp":
      case "KeyW":
        keyIntent.up = down;
        break;
      case "ArrowDown":
      case "KeyS":
        keyIntent.down = down;
        break;
      case "ArrowLeft":
      case "KeyA":
        keyIntent.left = down;
        break;
      case "ArrowRight":
      case "KeyD":
        keyIntent.right = down;
        break;
      default:
        break;
    }
  }

  function shouldPreventDefault(code) {
    return (
      code === "ArrowUp" ||
      code === "ArrowDown" ||
      code === "ArrowLeft" ||
      code === "ArrowRight" ||
      code === "KeyW" ||
      code === "KeyA" ||
      code === "KeyS" ||
      code === "KeyD"
    );
  }

  window.addEventListener(
    "keydown",
    (e) => {
      if (shouldPreventDefault(e.code)) {
        e.preventDefault();
        unlockAudio();
      }
      if (e.repeat) return;
      setKeyFromCode(e.code, true);
    },
    { passive: false }
  );

  window.addEventListener("keyup", (e) => {
    setKeyFromCode(e.code, false);
  });

  function clearPointerIntent() {
    pointerIntent.up = false;
    pointerIntent.down = false;
    pointerIntent.left = false;
    pointerIntent.right = false;
  }

  directionPad.addEventListener("pointerdown", (e) => {
    unlockAudio();
    const btn = e.target.closest(".dir");
    if (!btn || !btn.dataset.dir) return;
    try {
      directionPad.setPointerCapture(e.pointerId);
    } catch (_) {
      /* ignore */
    }
    clearPointerIntent();
    pointerIntent[btn.dataset.dir] = true;
  });

  directionPad.addEventListener("pointerup", clearPointerIntent);
  directionPad.addEventListener("pointercancel", clearPointerIntent);

  let lastT = performance.now();

  function tick(now) {
    const dt = Math.min(now - lastT, 100);
    lastT = now;
    const move = speed * (dt / (1000 / 60));

    const intent = mergedIntent();
    const rawDx =
      move *
      ((intent.right ? 1 : 0) - (intent.left ? 1 : 0));
    const rawDy =
      move *
      ((intent.down ? 1 : 0) - (intent.up ? 1 : 0));

    const prevX = state.x;
    const prevY = state.y;

    updateFacingFromHorizontal(intent, rawDx);

    if (rawDx !== 0 || rawDy !== 0) {
      const next = applyConstraints(state.x + rawDx, state.y + rawDy);
      setBeePosition(next.x, next.y);
      if (next.x !== prevX || next.y !== prevY) {
        maybePlayMoveClick();
      }
    } else {
      setBeePosition(state.x, state.y);
    }

    checkPollination();
    checkPickupsAndDragonfly();

    requestAnimationFrame(tick);
  }

  function layoutInit() {
    const p = getInitialPosition();
    setBeePosition(p.x, p.y);
  }

  function startLoop() {
    if (loopStarted) return;
    loopStarted = true;
    lastT = performance.now();
    requestAnimationFrame(tick);
  }

  const ro = new ResizeObserver(() => {
    syncBeeToConstraints();
  });
  ro.observe(scene);

  function boot() {
    layoutInit();
    startLoop();
  }

  if (document.readyState === "complete") {
    requestAnimationFrame(boot);
  } else {
    window.addEventListener("load", () => requestAnimationFrame(boot));
  }
})();
