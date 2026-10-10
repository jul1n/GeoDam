// Effets visuels : confettis, compteur animé, toasts. Tout est désactivé si l'utilisateur préfère moins d'animations.
const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const COLORS = ["#ee813c", "#5e70d0", "#76b861", "#111a4c", "#f5c542", "#ffffff"];

export function confetti(n = 120) {
  if (calm()) return;
  const cv = document.createElement("canvas");
  cv.className = "confetti"; cv.setAttribute("aria-hidden", "true");
  cv.width = innerWidth; cv.height = innerHeight; document.body.append(cv);
  const g = cv.getContext("2d");
  const ps = Array.from({ length: n }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 200, y: innerHeight * 0.35, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 13 - 3,
    s: 5 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: COLORS[(Math.random() * COLORS.length) | 0],
  }));
  let f = 0;
  (function tick() {
    g.clearRect(0, 0, cv.width, cv.height);
    for (const p of ps) { p.vy += 0.38; p.x += p.vx; p.y += p.vy; p.r += p.vr; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); g.restore(); }
    if (++f < 130) requestAnimationFrame(tick); else cv.remove();
  })();
}

export function countUp(el, to, ms = 900, fmt = (n) => Math.round(n).toLocaleString()) {
  if (calm() || to === 0) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  (function step(t) {
    const k = Math.min(1, (t - t0) / ms), e = 1 - (1 - k) ** 3;
    el.textContent = fmt(to * e);
    if (k < 1) requestAnimationFrame(step);
  })(t0);
}

export function toast(html, kind = "") {
  let box = document.getElementById("toasts");
  if (!box) { box = document.createElement("div"); box.id = "toasts"; box.setAttribute("role", "status"); document.body.append(box); }
  const el = document.createElement("div");
  el.className = "toast " + kind; el.innerHTML = html; box.append(el);
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 400); }, 4200);
}

import { getLang } from "./i18n.js";
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const fmt = (n) => new Intl.NumberFormat(getLang() === "fr" ? "fr-FR" : "en-US").format(Math.round(n));

// Drapeau d'un pays (SVG embarqués dans /flags, licence MIT flag-icons). Les emojis de drapeaux ne s'affichent pas sous Windows.
export const flag = (d, cls = "") => (d?.iso ? `<img class="flag ${cls}" src="flags/${String(d.iso).toLowerCase()}.svg" alt="" width="28" height="21" loading="lazy">` : "");
