/* =====================================================================
   revelar.js — animação de rolagem: elementos com [data-reveal] surgem
   (fade + leve subida) quando entram na tela; números com [data-contar]
   sobem até o valor. Sem JavaScript, ou com "reduzir movimento", tudo
   aparece normalmente (a classe js-reveal só é ligada aqui).
   ===================================================================== */
(function () {
  const reduzir = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const itens = document.querySelectorAll('[data-reveal]');

  window.animarContagem = function (el) {
    const alvo = parseFloat(el.dataset.contar);
    if (isNaN(alvo)) return;
    if (reduzir || alvo === 0) { el.textContent = alvo; return; }
    const ini = performance.now(), dur = 1200;
    (function passo(t) {
      const k = Math.min(1, (t - ini) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(alvo * e);
      if (k < 1) requestAnimationFrame(passo);
    })(ini);
  };

  const semIO = reduzir || !('IntersectionObserver' in window);
  let obs = null;
  if (!semIO) {
    document.documentElement.classList.add('js-reveal');
    obs = new IntersectionObserver(es => es.forEach(en => {
      if (!en.isIntersecting) return;
      const el = en.target; el.classList.add('visivel'); obs.unobserve(el);
      el.querySelectorAll('[data-contar]').forEach(window.animarContagem);
    }), { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  }
  /* também para conteúdo criado depois (cards da vitrine, página do empreendimento) */
  window.observarRevelar = function () {
    document.querySelectorAll('[data-reveal]:not(.visivel):not([data-obs])').forEach(el => {
      el.dataset.obs = '1';
      if (obs) obs.observe(el); else el.classList.add('visivel');
    });
    if (!obs) document.querySelectorAll('[data-contar]').forEach(el => { if (el.dataset.contar !== '0') el.textContent = el.dataset.contar; });
  };
  window.observarRevelar();
})();
