// Célébration "montée de niveau" : une explosion de confettis multicolores,
// puis (dans un second temps) des pièces qui volent en ligne droite jusqu'au
// compteur de shekels et le percutent une à une — chaque impact déclenche une
// lueur sur l'icône shekels et incrémente le nombre affiché — cf. demande
// explicite du user. Module purement impératif (DOM/WAAPI), volontairement
// indépendant de giftBoxAnimation.js (portée différente : pas de canvas 3D
// ici, et un canvas de confettis jetable — contrairement au canvas singleton
// partagé là-bas pensé pour des rafales répétées — puisque cette célébration
// n'a lieu qu'une fois par écran).

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const RAINBOW = [
  "#e63946", "#f3722c", "#f8961e", "#f9c74f", "#90be6d",
  "#43aa8b", "#4d908e", "#577590", "#277da1", "#8b6cf5", "#f072e0",
];

// Explosion unique, multicolore, depuis le centre-haut de l'écran.
function burstConfetti() {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:999;";
  document.body.appendChild(canvas);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const particles = [];
  const n = reduceMotion ? 30 : 260;
  const originX = window.innerWidth / 2;
  for (let i = 0; i < n; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.05;
    const speed = 5 + Math.random() * 11;
    particles.push({
      x: originX,
      y: -10,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed + 2,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.35,
      size: 5 + Math.random() * 6,
      color: RAINBOW[(Math.random() * RAINBOW.length) | 0],
      shape: Math.random() < 0.5 ? "rect" : "circle",
      life: 1,
      decay: 0.005 + Math.random() * 0.004,
    });
  }

  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    for (const p of particles) {
      if (p.life <= 0) continue;
      p.vy += 0.16;
      p.vx *= 0.992;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vrot;
      p.life -= p.decay;
      if (p.life <= 0 || p.y > window.innerHeight + 40) continue;
      alive = true;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.shape === "rect") ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
      else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    if (alive) requestAnimationFrame(tick);
    else canvas.remove();
  }
  requestAnimationFrame(tick);
}

// Le nettoyage (suppression du glow) est piloté par un setTimeout calé sur
// la durée de l'animation, PAS par `.onfinish` : un onglet mis en arrière-
// plan pendant l'animation peut geler la timeline WAAPI indéfiniment côté
// navigateur (constaté en conditions réelles), ce qui laisserait l'élément
// orphelin dans le DOM pour toujours si le nettoyage en dépendait.
function pulseIcon(rect) {
  const glow = document.createElement("div");
  const size = Math.max(rect.width, rect.height) * 2.4;
  glow.style.cssText = `
    position:fixed; left:${rect.left + rect.width / 2 - size / 2}px; top:${rect.top + rect.height / 2 - size / 2}px;
    width:${size}px; height:${size}px; border-radius:50%; pointer-events:none; z-index:997;
    background: radial-gradient(circle, rgba(245,179,1,0.6) 0%, rgba(245,179,1,0) 70%);
  `;
  document.body.appendChild(glow);
  const duration = reduceMotion ? 180 : 420;
  glow.animate(
    [
      { opacity: 0, transform: "scale(0.5)" },
      { opacity: 1, transform: "scale(1)", offset: 0.3 },
      { opacity: 0, transform: "scale(1.3)" },
    ],
    { duration, easing: "ease-out" }
  );
  setTimeout(() => glow.remove(), duration);
}

// Le compteur desktop (.wallet-strip-item) affiche déjà le vrai total (texte
// React "{icône} {nombre}") : on lit/écrit directement le nœud texte plutôt
// que de dupliquer le state du wallet ici — sans risque, cette animation ne
// dure que ~1s et React ne re-rendra pas ce nœud entre-temps ; un futur
// re-rendu (ex: prochain refreshWallet) retombera de toute façon sur la
// bonne valeur.
function findNumberTextNode(el) {
  return Array.from(el.childNodes).find((n) => n.nodeType === Node.TEXT_NODE && /\d/.test(n.nodeValue));
}

function setupDesktopCounter(target) {
  const textNode = findNumberTextNode(target);
  if (!textNode) return null;
  const start = parseInt(textNode.nodeValue.replace(/\D/g, ""), 10) || 0;
  return { start, setValue: (v) => { textNode.nodeValue = ` ${v}`; } };
}

// Le bouton configuration mobile (.mobile-menu-btn) n'affiche aucun nombre
// (le total ne vit que dans le panneau, replié) : une pastille flottante
// posée juste au-dessus incarne le compteur le temps de l'animation, cf.
// demande explicite du user ("distinguer l'affichage desktop et mobile").
function setupMobileCounter(target) {
  const rect = target.getBoundingClientRect();
  const badge = document.createElement("div");
  badge.textContent = "+0";
  badge.style.cssText = `
    position:fixed; left:${rect.left + rect.width / 2}px; top:${rect.top - 8}px; transform:translate(-50%,-100%);
    font-weight:700; color:#f5b301; font-size:14px; background:#16171d; border:1px solid #a9d6f5;
    border-radius:999px; padding:2px 9px; pointer-events:none; z-index:996; white-space:nowrap;
  `;
  document.body.appendChild(badge);
  return {
    start: 0,
    setValue: (v) => { badge.textContent = `+${v}`; },
    remove: () => badge.remove(),
  };
}

// Pièces en ligne droite (pas d'arc) jusqu'au compteur, une à une — chaque
// impact incrémente le compteur (desktop: vrai nombre du header ; mobile:
// pastille flottante) et déclenche une lueur sur l'icône, cf. demande
// explicite du user.
function flyCoinsAndIncrement(fromRect, targetEl, isMobile, amount) {
  const coinCount = Math.max(1, Math.min(10, amount));

  // Parts cumulées arrondies pour que la somme totale reste exactement
  // `amount`, même si la division n'est pas entière.
  const shares = [];
  let prevCum = 0;
  for (let i = 1; i <= coinCount; i++) {
    const cum = Math.round((amount * i) / coinCount);
    shares.push(cum - prevCum);
    prevCum = cum;
  }

  const counter = isMobile ? setupMobileCounter(targetEl) : setupDesktopCounter(targetEl);
  let current = counter ? counter.start : 0;

  const fromX = fromRect.left + fromRect.width / 2;
  const fromY = fromRect.top + fromRect.height / 2;

  for (let i = 0; i < coinCount; i++) {
    const delay = reduceMotion ? 0 : i * 100;
    setTimeout(() => {
      const toRect = targetEl.getBoundingClientRect();
      const toX = toRect.left + toRect.width / 2;
      const toY = toRect.top + toRect.height / 2;

      const coin = document.createElement("div");
      coin.textContent = "₪";
      coin.style.cssText =
        "position:fixed; left:0; top:0; font-size:22px; font-weight:700; color:#f5b301; text-shadow:0 1px 3px rgba(0,0,0,0.4); pointer-events:none; z-index:998;";
      document.body.appendChild(coin);

      const flightDuration = reduceMotion ? 150 : 360;
      coin.animate(
        [
          { transform: `translate(${fromX}px, ${fromY}px) scale(0.7)`, opacity: 0 },
          { transform: `translate(${fromX}px, ${fromY}px) scale(1)`, opacity: 1, offset: 0.08 },
          { transform: `translate(${toX}px, ${toY}px) scale(0.35)`, opacity: 1 },
        ],
        { duration: flightDuration, easing: "cubic-bezier(.45,0,.75,1)", fill: "forwards" }
      );

      // L'impact (retrait de la pièce + incrément + lueur) est piloté par un
      // setTimeout calé sur `flightDuration`, PAS par `.onfinish` : un onglet
      // mis en arrière-plan pendant le vol peut geler la timeline WAAPI
      // indéfiniment (constaté en conditions réelles), ce qui laisserait la
      // pièce bloquée à l'écran et le compteur figé en plein incrément si la
      // logique en dépendait.
      setTimeout(() => {
        coin.remove();
        current += shares[i];
        if (counter) counter.setValue(current);
        pulseIcon(targetEl.getBoundingClientRect());
      }, flightDuration);
    }, delay);
  }

  if (counter && counter.remove) {
    const totalDuration = coinCount * 100 + 360 + 700;
    setTimeout(counter.remove, totalDuration);
  }
}

// Point d'entrée : confettis multicolores immédiatement, puis (dans un
// second temps) les pièces vers l'icône shekels (desktop, .wallet-strip-item)
// ou le bouton configuration (mobile, .mobile-menu-btn) — cf. demande
// explicite du user. `originEl` est l'élément DOM depuis lequel les pièces
// s'envolent (la carte "Tes gains").
export function celebrateNiveauUp(originEl, amount) {
  burstConfetti();

  if (!originEl || amount <= 0) return;

  const isMobile = window.matchMedia("(max-width: 600px)").matches;
  const target = isMobile
    ? document.querySelector(".mobile-menu-btn")
    : document.querySelector(".wallet-strip-item");
  if (!target) return;

  const fromRect = originEl.getBoundingClientRect();
  setTimeout(() => {
    flyCoinsAndIncrement(fromRect, target, isMobile, amount);
  }, reduceMotion ? 120 : 550);
}
