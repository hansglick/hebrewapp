// Port de l'animation "Atelier du Butin" (prototype Artifact validé par le
// user) : rendu 3D logiciel du cadeau sur <canvas> (rotation + projection en
// perspective + éclairage directionnel recalculés à chaque frame — pas de
// texture CSS qui se déforme), puis éventail des cartes réellement gagnées
// et gems qui filent devant elles. Module purement impératif (DOM/canvas,
// pas de state React), exactement l'approche du prototype.

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const GIFT_SIZE = {
  bronze: { w: 84, h: 68 },
  silver: { w: 128, h: 102 },
  gold: { w: 180, h: 144 },
};
const GIFT_COLORS = {
  bronze: { box: "#c97a3e", lid: "#d98a4d", ribbon: "#6e3c1c" },
  silver: { box: "#dde3ec", lid: "#f2f5f9", ribbon: "#8b6cf5" },
  gold: { box: "#f3b93b", lid: "#ffd772", ribbon: "#e0483c" },
};
const GIFT_TILT_DEG = -24;
const RIBBON_U = [-0.16, 0.16];
const RIBBON_V = [-0.11, 0.11];
const LIGHT_DIR = (function () {
  const v = [-0.4, -0.75, 0.55];
  const m = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  return [v[0] / m, v[1] / m, v[2] / m];
})();
const PALETTE = {
  bronze: ["#c97a3e", "#8b4a22", "#f0c08a"],
  silver: ["#c9d2e0", "#8fa0bf", "#ffffff"],
  gold: ["#f3b93b", "#ffd772", "#e0483c", "#8b6cf5"],
  reveal: ["#f3b93b", "#8b6cf5", "#c9d2e0", "#c97a3e", "#f2eeff"],
};
const ICONS = ["🕊️", "⚔️", "📜", "🌟", "🏛️", "⚱️", "🔥", "🌙", "🗝️", "🪶"];
const CARD_GLOW_SHADOW = "0 14px 32px -10px rgba(0,0,0,0.75)";

// ---------------- confetti (canvas plein écran, singleton partagé) ----------------
let particleCanvas = null;
let particleCtx = null;
const particles = [];
let rafId = null;

function ensureParticleCanvas() {
  if (particleCanvas) return;
  particleCanvas = document.createElement("canvas");
  particleCanvas.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:999;";
  document.body.appendChild(particleCanvas);
  particleCtx = particleCanvas.getContext("2d");
  resizeParticleCanvas();
  window.addEventListener("resize", resizeParticleCanvas);
}

function resizeParticleCanvas() {
  particleCanvas.width = window.innerWidth * devicePixelRatio;
  particleCanvas.height = window.innerHeight * devicePixelRatio;
  particleCtx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}

function spawnBurst(x, y, colors, count, spread) {
  ensureParticleCanvas();
  const n = reduceMotion ? Math.min(count, 12) : count;
  for (let i = 0; i < n; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * spread;
    const speed = 4 + Math.random() * 7;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.35,
      size: 5 + Math.random() * 5,
      color: colors[(Math.random() * colors.length) | 0],
      shape: Math.random() < 0.5 ? "rect" : "circle",
      life: 1,
      decay: 0.008 + Math.random() * 0.006,
    });
  }
  if (!rafId) tick();
}

function spawnRadialBurst(x, y, colors, count) {
  ensureParticleCanvas();
  const n = reduceMotion ? Math.min(count, 20) : count;
  for (let i = 0; i < n; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 9;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.4,
      size: 5 + Math.random() * 6,
      color: colors[(Math.random() * colors.length) | 0],
      shape: Math.random() < 0.5 ? "rect" : "circle",
      life: 1,
      decay: 0.006 + Math.random() * 0.006,
    });
  }
  if (!rafId) tick();
}

function tick() {
  particleCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.vy += 0.16;
    p.vx *= 0.992;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vrot;
    p.life -= p.decay;
    if (p.life <= 0 || p.y > window.innerHeight + 40) {
      particles.splice(i, 1);
      continue;
    }
    particleCtx.save();
    particleCtx.globalAlpha = Math.max(0, p.life);
    particleCtx.translate(p.x, p.y);
    particleCtx.rotate(p.rot);
    particleCtx.fillStyle = p.color;
    if (p.shape === "rect") {
      particleCtx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
    } else {
      particleCtx.beginPath();
      particleCtx.arc(0, 0, p.size / 2.4, 0, Math.PI * 2);
      particleCtx.fill();
    }
    particleCtx.restore();
  }
  rafId = particles.length > 0 ? requestAnimationFrame(tick) : null;
}

// ---------------- rendu 3D logiciel du cadeau ----------------
function litColor(hex, intensity) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const k = Math.max(0.32, Math.min(1.22, 0.2 + 0.92 * intensity));
  const ch = (c) => Math.max(0, Math.min(255, Math.round(c * k)));
  return `rgb(${ch(r)},${ch(g)},${ch(b)})`;
}

function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

// rotateX∘rotateZ∘rotateY appliqué à un point/vecteur 3D — mêmes angles que
// ceux utilisés pour dessiner, donc géométrie ET lumière restent en phase.
function rotatePoint(p, rxDeg, ryDeg, rzDeg) {
  const rx = (rxDeg * Math.PI) / 180, ry = (ryDeg * Math.PI) / 180, rz = (rzDeg * Math.PI) / 180;
  const x = p[0], y = p[1], z = p[2];
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const x1 = x * cy + z * sy, y1 = y, z1 = -x * sy + z * cy;
  const cz = Math.cos(rz), sz = Math.sin(rz);
  const x2 = x1 * cz - y1 * sz, y2 = x1 * sz + y1 * cz, z2 = z1;
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const y3 = y2 * cx - z2 * sx, z3 = y2 * sx + z2 * cx, x3 = x2;
  return [x3, y3, z3];
}

function addScaled(center, uAxis, u, vAxis, v) {
  return [
    center[0] + uAxis[0] * u + vAxis[0] * v,
    center[1] + uAxis[1] * u + vAxis[1] * v,
    center[2] + uAxis[2] * u + vAxis[2] * v,
  ];
}

// Géométrie locale des faces visibles de la boîte (corps + collerette de
// "couvercle" légèrement plus large, ruban prolongé à largeur constante) —
// permet un vrai volume perçu plutôt qu'un simple cube plein.
function buildBoxGeom(w, h) {
  const hw = w / 2, hd = w / 2, hh = h / 2;
  const lidH = h * 0.15;
  const outset = 1.08;
  const bodyHalfH = hh - lidH / 2;
  const bodyCenterY = lidH / 2;
  const lidHalfH = lidH / 2;
  const lidCenterY = -hh + lidH / 2;
  const lw = hw * outset, ld = hd * outset;
  const collarU = RIBBON_U[1] / outset;

  return {
    hw, hh, hd,
    faces: [
      { name: "front", normal: [0, 0, 1], center: [0, bodyCenterY, hd], uAxis: [hw, 0, 0], vAxis: [0, bodyHalfH, 0] },
      { name: "back", normal: [0, 0, -1], center: [0, bodyCenterY, -hd], uAxis: [-hw, 0, 0], vAxis: [0, bodyHalfH, 0] },
      { name: "right", normal: [1, 0, 0], center: [hw, bodyCenterY, 0], uAxis: [0, 0, -hd], vAxis: [0, bodyHalfH, 0] },
      { name: "left", normal: [-1, 0, 0], center: [-hw, bodyCenterY, 0], uAxis: [0, 0, hd], vAxis: [0, bodyHalfH, 0] },
      {
        name: "front-lid", normal: [0, 0, 1], center: [0, lidCenterY, ld], uAxis: [lw, 0, 0], vAxis: [0, lidHalfH, 0],
        ribbonU: [-collarU, collarU], noRibbonH: true,
      },
      {
        name: "back-lid", normal: [0, 0, -1], center: [0, lidCenterY, -ld], uAxis: [-lw, 0, 0], vAxis: [0, lidHalfH, 0],
        ribbonU: [-collarU, collarU], noRibbonH: true,
      },
      {
        name: "right-lid", normal: [1, 0, 0], center: [lw, lidCenterY, 0], uAxis: [0, 0, -ld], vAxis: [0, lidHalfH, 0],
        ribbonU: [-collarU, collarU], noRibbonH: true,
      },
      {
        name: "left-lid", normal: [-1, 0, 0], center: [-lw, lidCenterY, 0], uAxis: [0, 0, ld], vAxis: [0, lidHalfH, 0],
        ribbonU: [-collarU, collarU], noRibbonH: true,
      },
      { name: "top", normal: [0, -1, 0], center: [0, -hh, 0], uAxis: [lw, 0, 0], vAxis: [0, 0, ld] },
    ],
  };
}

function fillQuad(ctx, pts, color) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

// Dessine la boîte à un instant T donné : rotation, division perspective,
// tri en profondeur (peintre) et éclairage par face, recalculés à chaque
// appel — un vrai rendu 3D image par image, pas une texture qui se déforme.
function renderGiftBox(ctx, geom, colors, cx, cy, camD, rxDeg, ryDeg, rzDeg) {
  function project(p) {
    const r = rotatePoint(p, rxDeg, ryDeg, rzDeg);
    const depth = camD - r[2];
    const s = camD / depth;
    return { pt: [cx + r[0] * s, cy + r[1] * s], z: r[2] };
  }
  function quad(center, uAxis, vAxis, uRange, vRange) {
    const corners = [
      [uRange[0], vRange[0]], [uRange[1], vRange[0]],
      [uRange[1], vRange[1]], [uRange[0], vRange[1]],
    ];
    return corners.map((c) => project(addScaled(center, uAxis, c[0], vAxis, c[1])).pt);
  }

  const visible = [];
  geom.faces.forEach((face) => {
    const n = rotatePoint(face.normal, rxDeg, ryDeg, rzDeg);
    if (n[2] <= 0.02) return; // face cachée (dos tourné vers la caméra)
    const intensity = dot3(n, LIGHT_DIR);
    const baseColor = face.name === "top" ? colors.lid : colors.box;
    const main = quad(face.center, face.uAxis, face.vAxis, [-1, 1], [-1, 1]);
    const ribbonV = quad(face.center, face.uAxis, face.vAxis, face.ribbonU || RIBBON_U, [-1, 1]);
    const ribbonH = face.noRibbonH ? null : quad(face.center, face.uAxis, face.vAxis, [-1, 1], RIBBON_V);
    const centerProj = project(face.center);
    visible.push({ main, ribbonV, ribbonH, intensity, baseColor, ribbonColor: colors.ribbon, z: centerProj.z });
  });

  visible.sort((a, b) => a.z - b.z); // du plus loin au plus proche
  visible.forEach((f) => {
    fillQuad(ctx, f.main, litColor(f.baseColor, f.intensity));
    fillQuad(ctx, f.ribbonV, litColor(f.ribbonColor, f.intensity * 1.1));
    if (f.ribbonH) fillQuad(ctx, f.ribbonH, litColor(f.ribbonColor, f.intensity * 1.1));
  });
}

function drawGroundShadow(ctx, cx, cy, rx, opacity) {
  if (opacity <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, rx * 0.22, 0, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, rx);
  g.addColorStop(0, "rgba(0,0,0,0.55)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

function buildGift(tier) {
  const size = GIFT_SIZE[tier];
  const colors = GIFT_COLORS[tier];
  const w = size.w, h = size.h;
  const canvasSize = Math.round(Math.max(w, h) * 3.6);
  const dpr = Math.min(2, window.devicePixelRatio || 1);

  const wrap = document.createElement("div");
  wrap.className = "gift-wrap";
  wrap.style.width = canvasSize + "px";
  wrap.style.height = canvasSize + "px";

  const canvas = document.createElement("canvas");
  canvas.width = canvasSize * dpr;
  canvas.height = canvasSize * dpr;
  canvas.style.width = canvasSize + "px";
  canvas.style.height = canvasSize + "px";
  canvas.style.display = "block";
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  wrap.appendChild(canvas);

  return {
    wrap, scene: canvas, ctx,
    geom: buildBoxGeom(w, h),
    colors, w, h, canvasSize,
    camD: Math.max(w, h) * 1.8,
    cx: canvasSize / 2,
    cy: canvasSize / 2 - h * 0.12,
    groundY: canvasSize / 2 + h * 0.58,
    groundR: w * 0.62,
  };
}

// Dessine une frame complète (fond effacé, ombre au sol, boîte) — appelé en
// boucle par playLotAnimation à chaque requestAnimationFrame.
function drawGift(gift, rxDeg, ryDeg, rzDeg, blurPx, floatPx, shadowLift) {
  const ctx = gift.ctx;
  ctx.clearRect(0, 0, gift.canvasSize, gift.canvasSize);
  drawGroundShadow(
    ctx, gift.cx, gift.groundY,
    gift.groundR * (1 - 0.22 * (shadowLift || 0)),
    1 - 0.45 * (shadowLift || 0)
  );
  ctx.save();
  ctx.filter = blurPx > 0.05 ? `blur(${blurPx.toFixed(2)}px)` : "none";
  renderGiftBox(ctx, gift.geom, gift.colors, gift.cx, gift.cy + (floatPx || 0), gift.camD, rxDeg, ryDeg, rzDeg);
  ctx.restore();
}

function backOutEase(t) {
  const c1 = 1.7, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function intensityFor(n) {
  if (n <= 1) return { bursts: 1, particles: 40, spread: 1.0 };
  if (n <= 3) return { bursts: 1, particles: 90, spread: 1.3 };
  if (n <= 6) return { bursts: 2, particles: 130, spread: 1.6 };
  return { bursts: 3, particles: 170, spread: 2.0 };
}

function spawnSmoke(fan) {
  const puffCount = reduceMotion ? 3 : 8;
  for (let i = 0; i < puffCount; i++) {
    const delay = reduceMotion ? 0 : i * 90;
    setTimeout(() => {
      const puff = document.createElement("div");
      puff.className = "smoke-puff";
      const size = 46 + Math.random() * 54;
      puff.style.width = size + "px";
      puff.style.height = size + "px";
      puff.style.marginLeft = ((Math.random() - 0.5) * 70).toFixed(1) + "px";
      fan.appendChild(puff);

      const riseY = -(90 + Math.random() * 90);
      const driftX = (Math.random() - 0.5) * 60;
      const endScale = 1.6 + Math.random() * 1.1;
      const rot = (Math.random() - 0.5) * 40;

      puff.animate(
        [
          { transform: "translate(-50%,0) scale(0.35) rotate(0deg)", opacity: 0 },
          {
            transform: `translate(calc(-50% + ${(driftX * 0.4).toFixed(1)}px), ${(riseY * 0.4).toFixed(1)}px) scale(${(endScale * 0.65).toFixed(2)}) rotate(${(rot * 0.4).toFixed(1)}deg)`,
            opacity: 0.5,
            offset: 0.35,
          },
          {
            transform: `translate(calc(-50% + ${driftX.toFixed(1)}px), ${riseY.toFixed(1)}px) scale(${endScale.toFixed(2)}) rotate(${rot.toFixed(1)}deg)`,
            opacity: 0,
          },
        ],
        { duration: reduceMotion ? 400 : 1500 + Math.random() * 500, easing: "ease-out", fill: "forwards" }
      );
    }, delay);
  }
}

function spawnGemTrail(fan, kf, duration) {
  if (reduceMotion) return;
  const ghostCount = 5;
  for (let g = 1; g <= ghostCount; g++) {
    const lag = g * 28;
    const fade = 1 - g / (ghostCount + 1);
    setTimeout(() => {
      const ghost = document.createElement("div");
      ghost.className = "gem-trail";
      fan.appendChild(ghost);
      const ghostKf = kf.map((k) => {
        const copy = { ...k };
        if (typeof copy.opacity !== "undefined") copy.opacity = Number(copy.opacity) * fade * 0.65;
        return copy;
      });
      ghost.animate(ghostKf, { duration, easing: "linear", fill: "forwards" }).onfinish = () => ghost.remove();
    }, lag);
  }
}

// Les gems arrivent de très loin à grande vitesse (ligne quasi droite),
// virent sec juste devant une carte tirée au sort (qui capte un reflet bleu
// à cet instant) puis repartent à grande vitesse dans un angle différent.
function spawnGems(fan, cards, count, duration, stagger) {
  const n = Math.min(count, 16);
  if (n <= 0) return;

  function polar(r, angDeg) {
    const rad = (angDeg * Math.PI) / 180;
    return { x: r * Math.sin(rad), y: -r * Math.cos(rad) };
  }

  for (let i = 0; i < n; i++) {
    setTimeout(() => {
      const card = cards.length ? cards[(Math.random() * cards.length) | 0] : null;
      const grazeAngle = card ? card.angle : Math.random() * 50 - 25;
      const turnDir = Math.random() < 0.5 ? 1 : -1;
      const entryAngle = grazeAngle + (Math.random() * 70 - 35);
      const exitAngle = grazeAngle + turnDir * (95 + Math.random() * 55);
      const entryR = 640 + Math.random() * 240;
      const grazeR = 130 + Math.random() * 35;
      const exitR = 640 + Math.random() * 240;

      const p0 = polar(entryR, entryAngle);
      const p1 = polar(grazeR, grazeAngle);
      const p2 = polar(grazeR * 1.05, grazeAngle + turnDir * 20);
      const p3 = polar(exitR, exitAngle);

      const gem = document.createElement("div");
      gem.className = "gem-fx";
      fan.appendChild(gem);

      function frame(p, rot, scale, op) {
        return {
          transform: `translate(-50%,-50%) translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) rotate(${rot.toFixed(0)}deg) scale(${scale.toFixed(2)})`,
          opacity: op,
        };
      }

      const kf = reduceMotion
        ? [frame(p0, entryAngle, 1, 1), frame(p1, grazeAngle, 1.3, 1), frame(p3, exitAngle, 0.9, 1)]
        : [
            { ...frame(p0, entryAngle, 0.75, 0), offset: 0 },
            { ...frame(p0, entryAngle, 0.85, 1), offset: 0.06 },
            { ...frame(p1, grazeAngle + turnDir * 40, 1.35, 1), offset: 0.42 },
            { ...frame(p2, grazeAngle + turnDir * 75, 1.1, 1), offset: 0.5 },
            { ...frame(p3, exitAngle, 0.8, 1), offset: 1 },
          ];

      gem.animate(kf, { duration, easing: "linear", fill: "forwards" }).onfinish = () => gem.remove();
      spawnGemTrail(fan, kf, duration);

      if (card) {
        setTimeout(() => {
          card.el.animate(
            [
              { filter: "brightness(1) saturate(1)", boxShadow: CARD_GLOW_SHADOW },
              {
                filter: "brightness(1.3) saturate(1.4)",
                boxShadow: CARD_GLOW_SHADOW + ", 0 0 36px 10px rgba(90,170,255,0.9)",
                offset: 0.5,
              },
              { filter: "brightness(1) saturate(1)", boxShadow: CARD_GLOW_SHADOW },
            ],
            { duration: 700, easing: "ease-out" }
          );
        }, duration * 0.42);
      }
    }, i * stagger);
  }
}

// Un seul geste : achat -> cadeau qui tourne, ralentit, gigote, explose ->
// révélation des cartes réellement gagnées (déjà connues à l'appel : le
// serveur a tiré le résultat avant que l'animation ne démarre). Pilotée par
// une boucle requestAnimationFrame qui redessine le canvas ; seule
// l'explosion finale (burst) reste une animation WAAPI classique sur le
// <canvas> lui-même. Renvoie une Promise résolue quand la séquence est
// entièrement terminée (cartes envolées) ; `onWalletSettle` est appelé au
// moment où le récapitulatif "+cartes/+gems" apparaît, pour synchroniser la
// mise à jour visible du wallet avec la révélation plutôt qu'avec l'achat.
export function playLotAnimation(stageEl, tier, reward, onWalletSettle) {
  const count = reward.count;
  const gemsGained = reward.gems;
  const imageUrls = reward.imageUrls || [];

  return new Promise((resolve) => {
    stageEl.classList.remove("flat");
    stageEl.innerHTML = "";

    const gift = buildGift(tier);
    stageEl.appendChild(gift.wrap);

    const turns = tier === "gold" ? 4.5 : tier === "silver" ? 3.5 : 2.5;
    const spinMs = reduceMotion ? 300 : tier === "gold" ? 2600 : tier === "silver" ? 2100 : 1700;
    const totalDeg = turns * 360;
    const maxBlur = tier === "gold" ? 2.6 : tier === "silver" ? 2 : 1.4;
    const appearMs = 380;
    const wiggleMs = reduceMotion ? 150 : 750;
    const TILT_BASE = GIFT_TILT_DEG;

    // tangage + roulis légèrement déphasés : combinés, ils tracent une petite
    // ellipse (précession/nutation d'une toupie) plutôt qu'un aller-retour plat.
    function wobX(t) { return Math.sin(t * Math.PI * 4) * 3.5; }
    function wobZ(t) { return Math.sin(t * Math.PI * 4 + Math.PI / 2) * 2.5; }
    const floatAmp = Math.max(4, gift.w * 0.09);
    function floatY(t) { return -Math.sin(t * Math.PI * 3) * floatAmp; }

    const start = performance.now();
    function frame(now) {
      const elapsed = now - start;

      if (elapsed < appearMs) {
        const t = elapsed / appearMs;
        const scale = 0.4 + 0.6 * backOutEase(t);
        drawGift(gift, TILT_BASE, 0, 0, 0, 0, 0);
        gift.wrap.style.transform = `scale(${scale.toFixed(3)})`;
        gift.wrap.style.opacity = Math.min(1, t * 1.4).toFixed(2);
        requestAnimationFrame(frame);
        return;
      }
      gift.wrap.style.transform = "";
      gift.wrap.style.opacity = "1";

      // Décélération ease-out cubique calculée nous-mêmes sur du temps
      // linéaire — une easing CSS toute faite atteindrait ~100% de la
      // rotation dès les premiers 20-30% du temps imparti puis resterait
      // figée le reste de la durée.
      const spinElapsed = elapsed - appearMs;
      if (spinElapsed < spinMs) {
        const st = spinElapsed / spinMs;
        const eased = 1 - Math.pow(1 - st, 3);
        const rot = totalDeg * eased;
        const blurAmt = reduceMotion ? 0 : maxBlur * Math.pow(1 - st, 1.6);
        const fy = reduceMotion ? 0 : floatY(st);
        const lift = Math.min(1, Math.abs(fy) / floatAmp);
        drawGift(gift, TILT_BASE + wobX(st), rot, wobZ(st), blurAmt, fy, lift);
        requestAnimationFrame(frame);
        return;
      }

      const wiggleElapsed = spinElapsed - spinMs;
      if (wiggleElapsed < wiggleMs) {
        const wt = wiggleElapsed / wiggleMs;
        const decay = 1 - wt;
        const wobble = Math.sin(wt * Math.PI * 5) * 11 * decay;
        const wscale = 1 + Math.sin(wt * Math.PI * 5) * 0.05 * decay;
        gift.wrap.style.transform = `scale(${wscale.toFixed(3)})`;
        drawGift(gift, TILT_BASE, totalDeg + wobble, 0, 0, 0, 0);
        requestAnimationFrame(frame);
        return;
      }

      gift.wrap.style.transform = "";
      drawGift(gift, TILT_BASE, totalDeg, 0, 0, 0, 0);
      burst();
    }
    requestAnimationFrame(frame);

    function burst() {
      const rect = gift.wrap.getBoundingClientRect();
      const burstX = rect.left + rect.width / 2;
      const burstY = rect.top + rect.height / 2;

      const flash = document.createElement("div");
      flash.className = "flash";
      stageEl.appendChild(flash);
      flash.animate(
        [{ opacity: 0 }, { opacity: 0.65, offset: 0.12 }, { opacity: 0 }],
        { duration: 420, easing: "ease-out" }
      );

      gift.scene.animate(
        [
          { transform: "scale(1.12)", opacity: 1 },
          { transform: "scale(1.4)", opacity: 1, offset: 0.3 },
          { transform: "scale(0.2)", opacity: 0 },
        ],
        { duration: 380, easing: "cubic-bezier(.5,0,.75,0)", fill: "forwards" }
      );

      const conf = intensityFor(count);
      spawnRadialBurst(burstX, burstY, PALETTE.reveal, Math.max(80, conf.particles + 20));
      setTimeout(() => spawnRadialBurst(burstX, burstY, PALETTE[tier], 55), 90);

      setTimeout(() => revealCards(), 340);
    }

    function revealCards() {
      stageEl.innerHTML = "";
      stageEl.classList.add("flat");
      const fan = document.createElement("div");
      fan.className = "card-fan";
      stageEl.appendChild(fan);

      // Angles répartis en éventail autour d'un même point de pivot
      // (bas-centre) : plus il y a de cartes, plus l'éventail s'ouvre.
      const spread = Math.min(66, 13 * (count - 1));
      const startAngle = count > 1 ? -spread / 2 : 0;
      const stepAngle = count > 1 ? spread / (count - 1) : 0;

      const cards = [];
      for (let i = 0; i < count; i++) {
        const c = document.createElement("div");
        c.className = "loot-card fan-card";
        const angle = startAngle + i * stepAngle;
        c.style.zIndex = i;
        const url = imageUrls[i];
        if (url) {
          c.style.backgroundImage = `url(${url})`;
        } else {
          const hue = (i * 47 + Math.random() * 30) | 0;
          c.style.background = `linear-gradient(150deg, hsl(${hue} 70% 62%), hsl(${hue + 40} 60% 38%))`;
          c.textContent = ICONS[(Math.random() * ICONS.length) | 0];
        }
        const foil = document.createElement("div");
        foil.className = "foil";
        c.appendChild(foil);
        const sparkle = document.createElement("div");
        sparkle.className = "sparkle";
        c.appendChild(sparkle);
        fan.appendChild(c);
        cards.push({ el: c, foil, sparkle, angle });
      }

      function angleOvershoot(a) { return a + (a >= 0 ? 6 : -6); }

      // dévoilement : chaque carte se déploie en éventail depuis le centre
      cards.forEach((c, i) => {
        const delay = reduceMotion ? 0 : i * 100;
        setTimeout(() => {
          c.el.animate(
            [
              { opacity: 0, transform: "translateX(-50%) rotate(0deg) translateY(60px) scale(0.4)" },
              {
                opacity: 1,
                transform: `translateX(-50%) rotate(${angleOvershoot(c.angle)}deg) translateY(-14px) scale(1.08)`,
                offset: 0.68,
              },
              { opacity: 1, transform: `translateX(-50%) rotate(${c.angle}deg) translateY(0) scale(1)` },
            ],
            { duration: 560, easing: "cubic-bezier(.34,1.56,.64,1)", fill: "forwards" }
          ).onfinish = () => {
            c.foil.classList.add("sweep");
            c.sparkle.classList.add("twinkle");
          };

          const r = c.el.getBoundingClientRect();
          const conf = intensityFor(count);
          spawnBurst(r.left + r.width / 2, r.top + r.height / 2, PALETTE.reveal, Math.round(conf.particles / count) + 10, 1.1);
        }, delay);
      });

      if (count > 0) {
        const conf = intensityFor(count);
        const rect = stageEl.getBoundingClientRect();
        for (let b = 0; b < conf.bursts; b++) {
          setTimeout(() => {
            const x = rect.left + rect.width * (0.5 + (b - (conf.bursts - 1) / 2) * 0.28);
            spawnBurst(x, rect.top + 30, PALETTE.reveal, conf.particles, conf.spread);
          }, b * 180);
        }
      } else {
        // Aucune carte : pas de confettis de révélation — à la place, un peu
        // de fumée qui s'échappe, pour que "0 carte" reste visuellement
        // lisible plutôt qu'un stage qui semble juste vide.
        spawnSmoke(fan);
      }

      const fanSettleAt = (count - 1) * 100 + 620;

      setTimeout(() => {
        const summary = document.createElement("div");
        summary.className = "reveal-summary";
        summary.innerHTML = `🃏 +${count} carte${count > 1 ? "s" : ""} &nbsp;·&nbsp; 💎 +${gemsGained} gems`;
        fan.appendChild(summary);
        summary.animate(
          [
            { opacity: 0, transform: "translateX(-50%) translateY(-8px)" },
            { opacity: 1, transform: "translateX(-50%) translateY(0)" },
          ],
          { duration: reduceMotion ? 0 : 380, easing: "ease-out", fill: "forwards" }
        );

        if (onWalletSettle) onWalletSettle();

        // Reste bien lisible un instant, puis s'estompe lentement avant de disparaître.
        setTimeout(() => {
          summary.animate(
            [{ opacity: 1 }, { opacity: 0 }],
            { duration: reduceMotion ? 0 : 2500, easing: "ease-in", fill: "forwards" }
          ).onfinish = () => summary.remove();
        }, reduceMotion ? 0 : 1200);
      }, fanSettleAt);

      const gemDuration = reduceMotion ? 220 : 620;
      const gemStagger = reduceMotion ? 0 : 70;
      const gemSpan = gemsGained > 0 ? (gemsGained - 1) * gemStagger + gemDuration : 0;
      const windDelay = gemsGained > 0 ? 150 + gemSpan + 300 : 550;

      setTimeout(() => spawnGems(fan, cards, gemsGained, gemDuration, gemStagger), fanSettleAt + 150);

      // effet venteux : la carte au premier plan s'envole en premier, puis
      // chacune des suivantes à tour de rôle, jusqu'à dispersion complète.
      setTimeout(() => blowAway(cards.slice().reverse(), 0), fanSettleAt + windDelay);

      function blowAway(list, idx) {
        if (idx >= list.length) {
          resolve();
          return;
        }
        const c = list[idx];
        const dir = Math.random() < 0.5 ? 1 : -1;
        const flyX = dir * (240 + Math.random() * 140);
        const flyY = -(130 + Math.random() * 110);
        const flyRot = c.angle + dir * (150 + Math.random() * 90);
        c.el.animate(
          [
            { transform: `translateX(-50%) rotate(${c.angle}deg) translateY(0) scale(1)`, opacity: 1 },
            {
              transform: `translateX(calc(-50% + ${flyX * 0.5}px)) rotate(${c.angle + flyRot * 0.4}deg) translateY(${flyY * 0.3}px) scale(0.92)`,
              opacity: 1,
              offset: 0.3,
            },
            {
              transform: `translateX(calc(-50% + ${flyX}px)) rotate(${flyRot}deg) translateY(${flyY}px) scale(0.65)`,
              opacity: 0,
            },
          ],
          { duration: reduceMotion ? 220 : 700, easing: "cubic-bezier(.5,0,.85,.4)", fill: "forwards" }
        );
        setTimeout(() => blowAway(list, idx + 1), reduceMotion ? 100 : 230);
      }
    }
  });
}
