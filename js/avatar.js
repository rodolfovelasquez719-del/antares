// v1.19: Avatar de Antares (foto + capas sutiles por estado). Estados: idle | listen | think | speak.
const CSS = `
.av{position:relative;aspect-ratio:1/1;border-radius:50%;overflow:hidden;isolation:isolate;-webkit-mask-image:-webkit-radial-gradient(white,black);transform:translateZ(0);box-shadow:0 0 18px rgba(0,255,156,.35),inset 0 0 0 1px rgba(0,255,156,.45);transition:box-shadow .4s}
.av img{width:100%;height:100%;object-fit:cover;object-position:50% 40%;display:block;border-radius:50%;clip-path:circle(50%);-webkit-clip-path:circle(50%);filter:saturate(1.05) contrast(1.05);animation:av-breath 6s ease-in-out infinite}
.av i{position:absolute;pointer-events:none;border-radius:50%}
.av .eye{width:9%;height:6%;top:32%;background:radial-gradient(circle,rgba(160,240,255,.95),rgba(0,200,255,.35) 45%,transparent 70%);mix-blend-mode:screen;opacity:.35;transform:translate(-50%,-50%)}
.av .e1{left:38.3%}.av .e2{left:62%}
.av .mouth{left:50%;top:55.5%;width:14%;height:5%;transform:translate(-50%,-50%) scaleY(.6);background:radial-gradient(ellipse,rgba(255,80,110,.7),transparent 70%);mix-blend-mode:screen;opacity:0}
.av .scan{inset:0;border-radius:0;background:repeating-linear-gradient(0deg,rgba(0,255,156,.07) 0 1px,transparent 1px 3px);mix-blend-mode:screen}
.av .bar{left:0;right:0;height:14%;border-radius:0;background:linear-gradient(transparent,rgba(0,255,156,.22),transparent);animation:av-scan 4.5s linear infinite}
.av .ring{inset:2px;border:2px dashed rgba(0,255,156,.55);opacity:.5;animation:av-spin 30s linear infinite}
.av.av-lock .scan,.av.av-lock .bar,.av.av-lock .ring,.av.av-lock .eye,.av.av-lock .mouth{display:none}
.av.av-lock img{animation:none}
.av[data-s=listen]{box-shadow:0 0 26px rgba(255,59,78,.55),inset 0 0 0 1px rgba(255,59,78,.6)}
.av[data-s=listen] .ring{border-color:rgba(255,59,78,.8);opacity:.9;animation:av-spin 12s linear infinite,av-pulse 1s ease-in-out infinite}
.av[data-s=listen] .eye{opacity:.7}
.av[data-s=think] .ring{animation-duration:3s;opacity:.9}
.av[data-s=think] .bar{animation-duration:1.2s}
.av[data-s=think] .eye{animation:av-eye 1.1s ease-in-out infinite}
.av[data-s=speak]{box-shadow:0 0 30px rgba(0,255,156,.6),inset 0 0 0 1px rgba(0,255,156,.7)}
.av[data-s=speak] .mouth{animation:av-lip .32s ease-in-out infinite alternate}
.av[data-s=speak] .eye{opacity:.6}
@keyframes av-breath{50%{transform:scale(1.015)}}
@keyframes av-scan{from{top:-14%}to{top:100%}}
@keyframes av-spin{to{transform:rotate(360deg)}}
@keyframes av-pulse{50%{opacity:.35}}
@keyframes av-eye{0%,100%{opacity:.3}50%{opacity:.95}}
@keyframes av-lip{from{opacity:.15;transform:translate(-50%,-50%) scaleY(.5)}to{opacity:.85;transform:translate(-50%,-50%) scaleY(1.3)}}
@media (prefers-reduced-motion:reduce){.av *{animation:none!important}}`;
export function mountAvatar(el, src) {
  if (!el || el.querySelector("img")) return;
  if (!document.getElementById("av-css")) { const s = document.createElement("style"); s.id = "av-css"; s.textContent = CSS; document.head.appendChild(s); }
  el.classList.add("av"); el.dataset.s = el.dataset.s || "idle";
  el.innerHTML = `<img src="${src}" alt="" decoding="async"><i class="eye e1"></i><i class="eye e2"></i><i class="mouth"></i><i class="scan"></i><i class="bar"></i><i class="ring"></i>`;
}
export function setAvatarState(el, s) { if (el) el.dataset.s = s; }
