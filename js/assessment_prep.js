// js/assessment_prep.js
// Prep wizard using Option A (no sessions table).
// Requires: user_assessments_api.js, assignments_api.js, env_check.js, accessibility.js, mood.js
(() => {
  let assignmentId = null;
  let ua = null; // user_assessments row
  let prefs = { theme:'brand', textScale:112, reducedMotion:false, highContrast:false, dyslexiaFont:false };

  // --- helpers ---
  function qs(k){ return new URLSearchParams(location.search).get(k); }
  function setStatus(txt){ const el = document.getElementById('prep-status'); if (el) el.textContent = txt; }
  function $id(id){ return document.getElementById(id); }

  // Progress helpers (must be in this scope so show() can call them)
  const STEPS = ["prep-brief-consent","prep-eligibility","prep-environment","prep-mood","prep-a11y-theme","prep-readiness"];
  function setProgressById(id){
    const i = Math.max(0, STEPS.indexOf(id));
    const pct = ((i+1)/STEPS.length)*100;
    const bar = document.getElementById('prep-progress');
    if (bar) bar.style.width = pct + '%';
    const prog = bar?.parentElement;
    if (prog) prog.setAttribute('aria-valuenow', String(Math.round(pct)));
  }

  function show(id){
    document.querySelectorAll('.prep-section').forEach(s=>s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
    setProgressById(id);
    window.scrollTo({ top:0, behavior:'smooth' });
  }

  // --- init ---
  async function init() {
    assignmentId = qs('assignment_id');
    if (!assignmentId) { alert('Missing assignment_id'); history.back(); return; }
    setStatus('Initializing…');

    // Ensure UA row exists for this user+assignment
    try {
      ua = await userAssessmentsApi.ensureUserAssessment(assignmentId);
    } catch (e) {
      console.error(e);
      alert(`Init failed: ${e.message || e}`);
      return;
    }

    // Prefs: load from app_users.ui_prefs if available
    try {
      if (typeof client !== 'undefined') {
        const { data: userRes } = await client.auth.getUser();
        if (userRes?.user) {
          const { data: me } = await client
            .from('app_users')
            .select('id, ui_prefs')
            .eq('supabase_user_id', userRes.user.id)
            .single();
          if (me?.ui_prefs) prefs = { ...prefs, ...me.ui_prefs };
        }
      }
    } catch(e){ /* non-fatal */ }

    // Render brief
    const brief = $id('brief-content');
    if (brief) {
      brief.innerHTML = `
        <p><strong>Title:</strong> Your assessment</p>
        <p><strong>What it measures:</strong> Core, Competency, Influence dimensions.</p>
        <p><strong>Time:</strong> ~15–20 minutes. You can pause within the allowed window.</p>
        <p><strong>Who sees results:</strong> Authorized admins only. Stored per policy.</p>
      `;
    }

    // Consent
    const consentCb = $id('consent-checkbox');
    const toEligibility = $id('to-eligibility');
    if (consentCb && toEligibility) {
      toEligibility.disabled = !consentCb.checked;
      consentCb.addEventListener('change', async (e)=>{
        toEligibility.disabled = !e.target.checked;
        if (e.target.checked) {
          await userAssessmentsApi.patchPrepMeta(ua.id, { consent: { version:'v1', at: new Date().toISOString() } });
        }
      });
    }
    const downloadConsent = $id('download-consent');
    if (downloadConsent) {
      downloadConsent.addEventListener('click', ()=>{
        const blob = new Blob([`Solyte Consent v1\n\nPurpose, Use, Access, Retention.\n\nTimestamp: ${new Date().toISOString()}`], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'consent.txt'; a.click();
        URL.revokeObjectURL(url);
      });
    }

    // Eligibility (now a hard gate)
    let eligibility;
    try {
      eligibility = await assignmentsApi.getEligibility(assignmentId);
    } catch (e) {
      console.error(e);
      alert(`Eligibility check failed: ${e.message || e}`);
      return;
    }
    await userAssessmentsApi.patchPrepMeta(ua.id, { eligibility });

    const badgeWrap = $id('eligibility-badges');
    if (badgeWrap) {
      const badges = [
        { label:'Within allowed time window', ok: eligibility.window_ok },
        { label:'Attempts available', ok: eligibility.attempts_ok },
        { label:'Identity verified', ok: eligibility.identity_ok },
        { label:`Version pinned (${eligibility.version_hash || 'n/a'})`, ok: true }
      ];
      badgeWrap.innerHTML = badges
        .map(b=>`<div class="badge ${b.ok?'ok':'block'}"><span class="dot"></span>${b.label}</div>`)
        .join('');

      const canProceed = eligibility.window_ok && eligibility.attempts_ok && eligibility.identity_ok;
      const nextBtn = $id('to-environment');
      if (nextBtn) {
        nextBtn.disabled = !canProceed;
        nextBtn.classList.toggle('btn-disabled', !canProceed);
      }

      if (!eligibility.window_ok || !eligibility.attempts_ok || !eligibility.identity_ok) {
        const reasons = [];
        if (!eligibility.window_ok)  reasons.push('This assessment is outside the allowed date window.');
        if (!eligibility.attempts_ok) reasons.push('You have no attempts left for this assessment.');
        if (!eligibility.identity_ok) reasons.push('You are not assigned to this assessment or cohort.');

        const reasonEl = document.createElement('div');
        reasonEl.className = 'callout';
        reasonEl.innerHTML = reasons.join('<br>');
        // append right below badges
        badgeWrap.parentElement.appendChild(reasonEl);
      }
    }

    // Buttons wiring
    if (toEligibility) toEligibility.onclick = ()=> show('prep-eligibility');
    const btnEnv = $id('to-environment');
    if (btnEnv) btnEnv.onclick = ()=> renderEnvironment();

    const btnMood = $id('to-mood');
    if (btnMood) btnMood.onclick = ()=> show('prep-mood');

    const btnA11y = $id('to-a11y');
    if (btnA11y) btnA11y.onclick = ()=> renderA11y();

    const btnReady = $id('to-readiness');
    if (btnReady) btnReady.onclick = ()=> show('prep-readiness');

    document.querySelectorAll('[data-back]').forEach(b=>{
      b.addEventListener('click', e=> show(e.currentTarget.getAttribute('data-back')));
    });

    const startBtn = $id('start-assessment');
    if (startBtn) {
      startBtn.onclick = async ()=>{
        const mood = moodUtil.normalizeMood($id('mood-form'));
        await userAssessmentsApi.startAssessment(ua.id, prefs, mood);
        const url = `user_take.html?assignment_id=${encodeURIComponent(assignmentId)}&user_assessment_id=${encodeURIComponent(ua.id)}`;
        window.location.href = url;
      };
    }

    // Apply prefs immediately
    a11y.applyPrefs(prefs);

    setStatus('Ready');
    show('prep-brief-consent');
  }

  // --- environment step ---
  async function renderEnvironment(){
    setStatus('Checking device…');
    const conn = await envCheck.probeConnectivity();
    const dev  = await envCheck.getDeviceSummary();
    const warn = envCheck.shouldWarn(dev);

    const envDiv = $id('env-results');
    if (envDiv) {
      envDiv.innerHTML = `
        <div class="prep-card"><strong>Connectivity:</strong> ${conn.online?'Online':'Offline'} · ~${conn.avgLatencyMs} ms</div>
        <div class="prep-card"><strong>Screen:</strong> ${dev.screen.w}×${dev.screen.h}</div>
        <div class="prep-card"><strong>Keyboard:</strong> ${dev.keyboardLikely?'Present/likely':'Unknown'}</div>
        <div class="prep-card"><strong>Battery:</strong> ${dev.battery.level ?? '–'}% ${dev.battery.charging?'(charging)':''}</div>
        ${warn ? `<div class="prep-card">⚠ You can continue, but conditions aren’t ideal.</div>` : ``}
      `;
    }
    await userAssessmentsApi.patchPrepMeta(ua.id, { env_check: { conn, dev, warn } });
    const chkEnv = $id('chk-env'); if (chkEnv) chkEnv.checked = true;

    setStatus('Ready');
    show('prep-environment');
  }

  // --- a11y/theme step ---
  function renderA11y(){
    // Render theme swatches
    a11y.renderThemeSwatches('theme-swatches', (theme)=>{
      prefs.theme = theme;
      a11y.applyPrefs(prefs);
    });

    const scale = $id('text-scale');
    const reduced = $id('reduced-motion');
    const hc = $id('high-contrast');
    const dys = $id('dyslexia-font');
    const useLast = $id('use-last-settings');

    // init UI controls from current prefs
    if (scale) scale.value = prefs.textScale;
    if (reduced) reduced.checked = !!prefs.reducedMotion;
    if (hc) hc.checked = !!prefs.highContrast;
    if (dys) dys.checked = !!prefs.dyslexiaFont;

    if (scale) scale.oninput = ()=>{ prefs.textScale = parseInt(scale.value,10); a11y.applyPrefs(prefs); };
    if (reduced) reduced.onchange = ()=>{ prefs.reducedMotion = reduced.checked; a11y.applyPrefs(prefs); };
    if (hc) hc.onchange = ()=>{ prefs.highContrast = hc.checked; a11y.applyPrefs(prefs); };
    if (dys) dys.onchange = ()=>{ prefs.dyslexiaFont = dys.checked; a11y.applyPrefs(prefs); };

    if (useLast) useLast.onclick = async ()=>{
      try {
        const { data: userRes } = await client.auth.getUser();
        if (!userRes?.user) return;
        const { data: me } = await client.from('app_users').select('id, ui_prefs').eq('supabase_user_id', userRes.user.id).single();
        if (me?.ui_prefs) {
          prefs = { ...prefs, ...me.ui_prefs };
          a11y.applyPrefs(prefs);
          if (scale) scale.value = prefs.textScale;
          if (reduced) reduced.checked = !!prefs.reducedMotion;
          if (hc) hc.checked = !!prefs.highContrast;
          if (dys) dys.checked = !!prefs.dyslexiaFont;
        }
      } catch(e){}
    };

    // persist long-lived prefs on app_users.ui_prefs (best-effort)
    (async () => {
      try {
        const { data: userRes } = await client.auth.getUser();
        if (!userRes?.user) return;
        const { data: me } = await client.from('app_users').select('id').eq('supabase_user_id', userRes.user.id).single();
        if (me?.id) {
          await client.from('app_users').update({ ui_prefs: prefs, updated_at: new Date().toISOString() }).eq('id', me.id);
        }
      } catch(e){ /* non-fatal */ }
    })();

    const chkA = $id('chk-a11y'); if (chkA) chkA.checked = true;
    show('prep-a11y-theme');
  }

  // --- boot ---
  window.addEventListener('DOMContentLoaded', init);
})();
