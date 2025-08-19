const a11y = (() => {
  const THEMES = ['brand','calm','warm','neutral','high-contrast'];

  function applyTheme(name){
    document.documentElement.setAttribute('data-theme', name);
  }
  function applyPrefs({ textScale=112, reducedMotion=false, highContrast=false, dyslexiaFont=false, theme='brand' } = {}){
    // theme
    applyTheme(highContrast ? 'high-contrast' : theme);
    // text scale classes
    document.documentElement.classList.remove('text-scale-100','text-scale-112','text-scale-125','text-scale-150');
    const cls = `text-scale-${Math.min(150, Math.max(100, textScale))}`;
    document.documentElement.classList.add(cls);
    // motion
    document.documentElement.classList.toggle('reduced-motion', !!reducedMotion);
    // font
    document.documentElement.classList.toggle('dyslexia-font', !!dyslexiaFont);
  }

  function renderThemeSwatches(containerId, onPick){
    const el = document.getElementById(containerId);
    el.innerHTML = '';
    THEMES.forEach(t=>{
      const s = document.createElement('button');
      s.className = 'swatch';
      s.title = t;
      s.setAttribute('aria-label', `Theme ${t}`);
      s.onclick = ()=>onPick(t);
      // quick visual using CSS vars preview
      s.style.background = getComputedStyle(document.documentElement).getPropertyValue('--primary');
      el.appendChild(s);
    });
  }

  return { applyPrefs, applyTheme, renderThemeSwatches };
})();
