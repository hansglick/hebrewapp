// "Cabinet des Cartes" — carrousel à trois cartes (centrale en grand, deux
// voisines réduites en perspective) pour parcourir la collection possédée.
// Porté depuis le prototype Artifact du même nom : mêmes techniques
// (recyclage de 5 nœuds DOM permanents pour une transition de position
// fluide, scintillement à l'arrivée au centre, lueur dorée continue façon
// bougie sur la carte centrale, fiche en overlay centré par-dessus les
// trois cartes) — repeint avec les tokens de thème de l'app (pas de palette
// ni de toggle propres, contrairement au prototype) et branché sur la vraie
// économie (1 gem la première fois par carte, via `onReveal`).
//
// Module purement impératif (DOM direct, pas de state React) — même
// approche que giftBoxAnimation.js pour la même raison : la technique de
// recyclage de nœuds a besoin de garder la même identité DOM d'une carte à
// l'autre pour que la transition CSS anime une vraie position plutôt que de
// popper un nouveau contenu.

const POSITIONS = ["farleft", "left", "center", "right", "farright"];

function mod(a, m) {
  return ((a % m) + m) % m;
}

// initCardCabinet(container, { cards, onReveal }) -> { destroy() }
// cards: [{ index, img }] déjà résolues (mediaUrl appliqué par l'appelant).
// onReveal: async (index) => { name_hebreu, name_latin, apports } — peut
// rejeter avec une Error dont le message est déjà prêt à afficher (gems
// insuffisants, etc.).
export function initCardCabinet(container, { cards, onReveal }) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const n = cards.length;

  container.innerHTML = "";
  container.className = "cab-root";

  if (n === 0) {
    const empty = document.createElement("p");
    empty.className = "cab-empty";
    empty.textContent = "Aucune carte pour l'instant — les premières arrivent en ouvrant un lot.";
    container.appendChild(empty);
    return { destroy() { container.innerHTML = ""; } };
  }

  const carouselEl = document.createElement("div");
  carouselEl.className = "cab-carousel";
  container.appendChild(carouselEl);

  const btnPrev = document.createElement("div");
  btnPrev.className = "cab-nav prev";
  btnPrev.setAttribute("role", "button");
  btnPrev.setAttribute("tabindex", "0");
  btnPrev.setAttribute("aria-label", "Carte précédente");
  btnPrev.textContent = "‹";
  carouselEl.appendChild(btnPrev);

  const slotsEl = document.createElement("div");
  slotsEl.className = "cab-slots";
  carouselEl.appendChild(slotsEl);

  const btnNext = document.createElement("div");
  btnNext.className = "cab-nav next";
  btnNext.setAttribute("role", "button");
  btnNext.setAttribute("tabindex", "0");
  btnNext.setAttribute("aria-label", "Carte suivante");
  btnNext.textContent = "›";
  carouselEl.appendChild(btnNext);

  const fichePanel = document.createElement("div");
  fichePanel.className = "cab-fiche";
  carouselEl.appendChild(fichePanel);

  // Enfant de .cab-carousel (pas de container) et positionné en absolu
  // pour rester collé au bord bas de la carte centrale, quelle que soit la
  // hauteur du carrousel (qui doit accommoder les cartes latérales).
  const hint = document.createElement("p");
  hint.className = "cab-hint";
  hint.textContent = "clique la carte centrale pour révéler sa fiche";
  carouselEl.appendChild(hint);

  let index = 0;
  let busy = false;
  const nodes = [];

  function cardAt(offset) {
    return cards[mod(index + offset, n)];
  }

  function makeNode(offset) {
    const slot = document.createElement("div");
    slot.className = "cab-slot";
    const inner = document.createElement("div");
    inner.className = "cab-inner";
    slot.appendChild(inner);
    slotsEl.appendChild(slot);
    const node = { slot, inner, card: null };
    setNodeCard(node, cardAt(offset));
    return node;
  }

  function setNodeCard(node, card) {
    node.card = card;
    if (!card) {
      node.inner.style.backgroundImage = "";
      return;
    }
    node.inner.style.backgroundImage = `url(${card.img})`;
    node.inner.innerHTML = `<span class="cab-badge">#${card.index}</span>`;
  }

  function applyPositions() {
    nodes.forEach((node, i) => {
      node.slot.className = "cab-slot pos-" + POSITIONS[i];
    });
  }

  for (let i = -2; i <= 2; i++) nodes.push(makeNode(i));
  applyPositions();

  function centerNode() {
    return nodes[2];
  }

  function spawnSparkle(node) {
    if (reduceMotion || !node) return;
    const overlay = document.createElement("div");
    overlay.className = "cab-sparkle";
    const positions = [
      [12, 14], [38, 8], [64, 12], [88, 18],
      [22, 34], [50, 28], [76, 38], [94, 46],
      [10, 55], [34, 62], [58, 52], [82, 64],
      [18, 80], [44, 88], [70, 78], [90, 90],
    ];
    positions.forEach(([x, y], idx) => {
      const pt = document.createElement("div");
      pt.className = "pt";
      pt.style.left = x + "%";
      pt.style.top = y + "%";
      const size = 6 + Math.random() * 8;
      pt.style.width = size + "px";
      pt.style.height = size + "px";
      pt.style.animation = `cab-sparkle-pt ${900 + Math.random() * 500}ms ease-out ${idx * 70}ms`;
      overlay.appendChild(pt);
    });
    node.inner.appendChild(overlay);
    setTimeout(() => overlay.remove(), 1700);
  }

  function move(direction) {
    if (busy || n === 0) return;
    busy = true;
    btnPrev.classList.add("is-disabled");
    btnNext.classList.add("is-disabled");
    fichePanel.classList.remove("visible"); // la fiche ne concerne que la carte quittée

    if (direction === "next") {
      const recycled = nodes.shift();
      recycled.slot.className = "cab-slot pos-gone-right";
      // eslint-disable-next-line no-unused-expressions
      recycled.slot.offsetWidth; // force le reflow avant de replacer la classe finale
      index = mod(index + 1, n);
      setNodeCard(recycled, cardAt(2));
      nodes.push(recycled);
    } else {
      const recycled = nodes.pop();
      recycled.slot.className = "cab-slot pos-gone-left";
      // eslint-disable-next-line no-unused-expressions
      recycled.slot.offsetWidth;
      index = mod(index - 1, n);
      setNodeCard(recycled, cardAt(-2));
      nodes.unshift(recycled);
    }

    applyPositions();
    spawnSparkle(centerNode());

    setTimeout(() => {
      busy = false;
      btnPrev.classList.remove("is-disabled");
      btnNext.classList.remove("is-disabled");
    }, reduceMotion ? 80 : 580);
  }

  function onActivate(el, handler) {
    el.addEventListener("click", handler);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handler();
      }
    });
  }

  onActivate(btnPrev, () => move("prev"));
  onActivate(btnNext, () => move("next"));

  function keydownHandler(e) {
    if (e.key === "ArrowLeft") move("prev");
    if (e.key === "ArrowRight") move("next");
  }
  document.addEventListener("keydown", keydownHandler);

  function closeFiche() {
    fichePanel.classList.remove("visible");
  }
  fichePanel.addEventListener("click", (e) => {
    if (e.target.closest(".cab-fiche-close")) closeFiche();
  });
  fichePanel.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.closest(".cab-fiche-close")) {
      e.preventDefault();
      closeFiche();
    }
  });

  function renderFicheLoading() {
    fichePanel.innerHTML = `<p class="cab-fiche-loading">Ouverture de la fiche…</p>`;
    fichePanel.classList.remove("visible");
    requestAnimationFrame(() => fichePanel.classList.add("visible"));
  }

  function renderFicheContent(fiche) {
    fichePanel.innerHTML =
      `<div class="cab-fiche-close" role="button" tabindex="0" aria-label="Fermer la fiche">✕</div>` +
      `<p class="cab-fiche-hebreu">${fiche.name_hebreu}</p>` +
      `<p class="cab-fiche-latin">${fiche.name_latin}</p>` +
      `<p class="cab-fiche-apports">${fiche.apports}</p>`;
  }

  function renderFicheError(message) {
    fichePanel.innerHTML =
      `<div class="cab-fiche-close" role="button" tabindex="0" aria-label="Fermer la fiche">✕</div>` +
      `<p class="cab-fiche-error">${message}</p>`;
  }

  const ficheCache = {}; // index -> fiche déjà obtenue cette session, évite de re-solliciter le serveur

  slotsEl.addEventListener("click", (e) => {
    const node = centerNode();
    if (!node.slot.contains(e.target)) return; // seule la carte centrale est cliquable
    const card = node.card;
    if (!card) return;

    if (ficheCache[card.index]) {
      renderFicheContent(ficheCache[card.index]);
      fichePanel.classList.remove("visible");
      requestAnimationFrame(() => fichePanel.classList.add("visible"));
      return;
    }

    renderFicheLoading();
    Promise.resolve(onReveal(card.index))
      .then((fiche) => {
        ficheCache[card.index] = fiche;
        renderFicheContent(fiche);
      })
      .catch((err) => {
        renderFicheError(err && err.message ? err.message : "Impossible d'afficher la fiche.");
      });
  });

  return {
    destroy() {
      document.removeEventListener("keydown", keydownHandler);
      container.innerHTML = "";
    },
  };
}
