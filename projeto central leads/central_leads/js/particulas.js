/* =====================================================================
   particulas.js — partículas suaves no painel escuro das telas de acesso
   (.acesso-lado) e na abertura do portal (.hero-portal). Pontos de
   "heliografia" que flutuam, se ligam por fios finos quando ficam perto e
   se afastam do mouse. Não depende de nada; respeita "reduzir movimento",
   pausa com a aba escondida e fora da tela.
   ===================================================================== */
(function () {
  const alvos = document.querySelectorAll('.acesso-lado, .hero-portal');
  if (!alvos.length) return;
  const reduzir = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COR = '170,200,255', SINAL = '255,131,72';

  alvos.forEach(iniciar);

  function iniciar(el) {
    const cv = document.createElement('canvas');
    cv.className = 'particulas';
    cv.setAttribute('aria-hidden', 'true');
    el.insertBefore(cv, el.firstChild);
    const ctx = cv.getContext('2d');
    let w = 0, h = 0, dpr = 1, ps = [], raf = 0, visivel = true;
    const mouse = { x: -9999, y: -9999 };

    function medir() {
      const r = el.getBoundingClientRect();
      w = Math.max(1, r.width); h = Math.max(1, r.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.max(18, Math.min(90, Math.round(w * h / 8500)));
      ps = Array.from({ length: n }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - .5) * .35, vy: (Math.random() - .5) * .35,
        r: Math.random() * 1.6 + .8, s: Math.random() < .08
      }));
    }

    function quadro() {
      ctx.clearRect(0, 0, w, h);
      const lim = 120;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < -10) p.x = w + 10; else if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10; else if (p.y > h + 10) p.y = -10;
        const dx = p.x - mouse.x, dy = p.y - mouse.y, d2 = dx * dx + dy * dy;
        if (d2 < 14400 && d2 > 1) { const d = Math.sqrt(d2), f = (120 - d) / 120 * .6; p.x += dx / d * f; p.y += dy / d * f; }
        for (let j = i + 1; j < ps.length; j++) {
          const q = ps[j], ax = p.x - q.x, ay = p.y - q.y, dd = ax * ax + ay * ay;
          if (dd < lim * lim) {
            ctx.strokeStyle = 'rgba(' + COR + ',' + (0.3 * (1 - Math.sqrt(dd) / lim)).toFixed(3) + ')';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
          }
        }
        ctx.fillStyle = 'rgba(' + (p.s ? SINAL + ',.9' : COR + ",.75") + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.s ? p.r + .6 : p.r, 0, 6.2832); ctx.fill();
      }
    }
    function laco() { if (visivel && !document.hidden) quadro(); raf = requestAnimationFrame(laco); }

    medir();
    if (reduzir) { quadro(); }          // sem movimento: só um quadro parado
    else raf = requestAnimationFrame(laco);

    /* a tela só aparece depois de checar a sessão: o observador refaz as medidas quando o painel ganha tamanho */
    let t; const remedir = () => { clearTimeout(t); t = setTimeout(() => { medir(); if (reduzir) quadro(); }, 120); };
    if ('ResizeObserver' in window) new ResizeObserver(remedir).observe(el); else window.addEventListener('resize', remedir);
    if (!reduzir) {
      window.addEventListener('mousemove', ev => {
        const r = el.getBoundingClientRect();
        mouse.x = ev.clientX - r.left; mouse.y = ev.clientY - r.top;
      }, { passive: true });
      if ('IntersectionObserver' in window) new IntersectionObserver(es => { visivel = es[0].isIntersecting; }).observe(el);
    }
  }
})();
