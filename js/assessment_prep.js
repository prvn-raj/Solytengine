// js/assessment_prep.js
// Prep wizard using Option A (no sessions table).
// Requires: user_assessments_api.js, assignments_api.js, env_check.js, accessibility.js, mood.js
(() => {
  let assignmentId = null;
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

    // --- Render brief (dynamic from assessments) ---
    const brief = $id('brief-content');
    if (brief) {
      try {
        // fetch assignment -> get assessment_id
        const { data: assign, error: aErr } = await client
          .from("assessment_assignments")
          .select("assessment_id")
          .eq("id", assignmentId)
          .single();
        if (aErr || !assign) throw new Error("Assignment not found");

        const { data: asmt, error: asmErr } = await client
          .from("assessments")
          .select("name, description, total_questions, time_limit_minutes, allow_resume")
          .eq("id", assign.assessment_id)
          .single();
        if (asmErr || !asmt) throw new Error("Assessment not found");

        brief.innerHTML = `
  <div class="qa-row">
    <span class="qa-label">📌 Title</span>
    <span class="qa-value">${asmt.name}</span>
  </div>
  <div class="qa-row">
    <span class="qa-label">📊 What it measures</span>
    <span class="qa-value">${asmt.description || "—"}</span>
  </div>
  <div class="qa-row">
    <span class="qa-label">⏱ Time</span>
    <span class="qa-value">${asmt.time_limit_minutes ? asmt.time_limit_minutes + " minutes" : "Unlimited"}</span>
  </div>
  <div class="qa-row">
    <span class="qa-label">❓ Total questions</span>
    <span class="qa-value">${asmt.total_questions}</span>
  </div>
  <div class="qa-row">
    <span class="qa-label">👀 Who sees results</span>
    <span class="qa-value">Assessment results are protected under strict confidentiality. <br> Access is strictly limited to authorized individuals.</span>
  </div>
`;

      } catch (err) {
        console.error("Overview load failed:", err);
        brief.innerHTML = `<p class="callout">⚠ Unable to load assessment details.</p>`;
      }
    }

    // Consent
    const consentCb = $id('consent-checkbox');
const toEligibility = $id('to-eligibility');

if (consentCb && toEligibility) {
  // Button is always enabled
  toEligibility.disabled = false;

  // Intercept click
  toEligibility.addEventListener('click', async (e) => {
    if (!consentCb.checked) {
      e.preventDefault();
      e.stopImmediatePropagation(); // ✅ block other listeners from firing
      alert("⚠️ You need to provide consent before continuing to the assessment.");
      return false;
    }

    // Record consent when valid
    await safePatchFuturePrepMeta({
      consent: { version: 'v1', at: new Date().toISOString() }
    });

    // Normal navigation continues here (your existing step logic will handle it)
  }, true); // capture phase to ensure our check runs first
}

const downloadConsent = $id('download-consent');

if (downloadConsent) {
  downloadConsent.addEventListener('click', () => {
    const consentText = `
Solyte Consent Agreement – v1.0
Date: ${new Date().toISOString().split("T")[0]}

By downloading and proceeding, you acknowledge and agree to the following:

1. Purpose:
   This assessment is conducted for personal and professional development, research, and analytics purposes within Solyte.

2. Data Use:
   Your responses will be collected, stored, and processed solely to generate assessment results, provide feedback, and support aggregated research insights.
   No data will be sold or used for marketing without your explicit consent.

3. Access:
   Results will be accessible only to authorized administrators and, where applicable, your organization’s designated representatives.
   Individual responses will not be disclosed to unauthorized parties.

4. Storage:
   Data will be retained in accordance with Solyte’s data retention policy and applicable legal requirements.
   Reasonable safeguards are applied to protect confidentiality and security.

5. Voluntary Participation:
   Participation is voluntary. You may withdraw at any time before submission of your assessment.
   Once submitted, responses form part of the analysis record.

6. Rights:
   You may request access, correction, or deletion of your personal data as permitted by applicable law (e.g., GDPR or equivalent).

7. Contact:
   For questions regarding this consent or data processing, contact connect@solyte.life.

By continuing, you confirm that you have read, understood, and agreed to the above terms.
`;

    const blob = new Blob([consentText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Solyte_Consent_Agreement.txt';
    a.click();
    URL.revokeObjectURL(url);
  });
}


// --- Eligibility (Emoji Recognition Challenge) ---
const badgeWrap = $id('eligibility-badges');
const btnEnv = $id('to-environment');

if (badgeWrap && btnEnv) {
  let wrongAttempts = 0;

  function generatePuzzle() {
    const fruits = ["🍎", "🍌", "🍊", "🍇"];
    // Pick 2 distinct fruits
    const shuffled = fruits.sort(() => 0.5 - Math.random());
    const f1 = shuffled[0], f2 = shuffled[1];

    // Random counts 1–5
    const a = Math.floor(Math.random() * 5) + 1;
    const b = Math.floor(Math.random() * 5) + 1;

    // Randomize question type
    const questionTypes = [
      { text: `How many ${f1}?`, answer: a },
      { text: `How many ${f2}?`, answer: b },
      { text: `How many fruits in total?`, answer: a + b }
    ];
    const chosen = questionTypes[Math.floor(Math.random() * questionTypes.length)];

    badgeWrap.innerHTML = `
      <div class="emoji-math">
        <span class="emoji-num">${f1.repeat(a)}</span>
        <span class="emoji-op">+</span>
        <span class="emoji-num">${f2.repeat(b)}</span>
      </div>
      <div class="emoji-question">${chosen.text}</div>
      <input type="number" id="emoji-answer" min="0" placeholder="?" />
      <div class="eligibility-actions">
        <button type="button" id="validate-answer" class="btn-secondary">✅ Validate</button>
        <button type="button" id="shuffle-puzzle" class="btn-ghost">♻️ Shuffle</button>
      </div>
      <p id="eligibility-feedback" class="eligibility-feedback"></p>
    `;

    const input = $id('emoji-answer');
    const shuffleBtn = $id('shuffle-puzzle');
    const validateBtn = $id('validate-answer');
    const feedback = $id('eligibility-feedback');

    // Reset state
    btnEnv.disabled = true;
    btnEnv.classList.add('btn-disabled');
    feedback.textContent = "";

    // Shuffle regenerates puzzle
    shuffleBtn.addEventListener('click', () => {
      wrongAttempts = 0;
      generatePuzzle();
    });

    // Validate answer
    validateBtn.addEventListener('click', () => {
      const val = parseInt(input.value, 10);
      if (val === chosen.answer) {
        feedback.textContent = "✅ Correct! You may continue.";
        feedback.style.color = "green";
        btnEnv.disabled = false;
        btnEnv.classList.remove('btn-disabled');
      } else {
        wrongAttempts++;
        feedback.textContent = `❌ Wrong! Attempt ${wrongAttempts} of 3.`;
        feedback.style.color = "red";
        btnEnv.disabled = true;
        btnEnv.classList.add('btn-disabled');

        if (wrongAttempts >= 3) {
          // Kick user back to dashboard
          alert("Too many failed attempts. Redirecting to dashboard.");
          window.location.href = "user_dashboard.html";
        }
      }
    });
  }

  // Initial load
  generatePuzzle();
}



    // Buttons wiring
    if (toEligibility) toEligibility.onclick = ()=> show('prep-eligibility');
    
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
  startBtn.onclick = async () => {
    try {
      // If API exists, let it handle; else local fallback
      if (window.userAssessmentsApi?.startAssessmentForAssignment) {
        const ua = await userAssessmentsApi.startAssessmentForAssignment(
          assignmentId,
          prefs,
          { carryForward: true }   // 👈 only prefs + options now
        );
        const url = `user_take.html?assignment_id=${encodeURIComponent(assignmentId)}&user_assessment_id=${encodeURIComponent(ua.id)}`;
        window.location.href = url;
        return;
      }

      // local fallback without mood
      await localStartAssessment(assignmentId, prefs);
    } catch (e) {
      console.error(e);
      alert(`Start failed: ${e.message || e}`);
    }
  };
}


    // Apply prefs immediately
    a11y.applyPrefs(prefs);

    setStatus('Ready');
    show('prep-brief-consent');
  }

// --- environment step ---
async function renderEnvironment() {
  setStatus('Checking device…');

  // ✅ Safe fallbacks
  let conn = { online: navigator.onLine, avgLatencyMs: 0 };
  let dev = {
    screen: { w: window.innerWidth, h: window.innerHeight },
    battery: { level: 100, charging: true },
    keyboardLikely: true
  };

  // Try envCheck, fall back if it fails
  try {
    const c = await envCheck.probeConnectivity();
    if (c) conn = c;
  } catch (e) {
    console.warn("⚠ envCheck.probeConnectivity failed, using fallback:", e);
  }

  try {
    const d = await envCheck.getDeviceSummary();
    if (d) dev = d;
  } catch (e) {
    console.warn("⚠ envCheck.getDeviceSummary failed, using fallback:", e);
  }

  const envDiv = $id('env-results');
  if (envDiv) {
    // Threshold logic
    const latency = conn.avgLatencyMs ?? 0;
    const battery = dev.battery?.level ?? 100;
    const screenOk = dev.screen?.w >= 1024 && dev.screen?.h >= 600;
    const keyboardOk = dev.keyboardLikely ?? true;

    // Connectivity
    let connClass = 'good', connMsg = 'Stable connection';
    if (!conn.online) {
      connClass = 'bad'; connMsg = 'Offline – cannot proceed';
    } else if (latency > 300) {
      connClass = 'warn'; connMsg = 'High latency – may affect performance';
    }

    // Screen
    let screenClass = screenOk ? 'good' : 'warn';
    let screenMsg = screenOk ? 'Screen resolution is sufficient'
                             : 'Low resolution – experience may be degraded';

    // Keyboard
    let kbClass = keyboardOk ? 'good' : 'warn';
    let kbMsg = keyboardOk ? 'Keyboard detected'
                           : 'Keyboard not detected – if this is mobile, may be okay';

    // Battery
    let batClass = 'good', batMsg = 'Battery sufficient';
    if (battery < 20 && !dev.battery?.charging) {
      batClass = 'bad'; batMsg = 'Battery critically low – plug in before continuing';
    } else if (battery < 50 && !dev.battery?.charging) {
      batClass = 'warn'; batMsg = 'Battery moderate – consider charging';
    }

    envDiv.innerHTML = `
      <div class="env-badge ${connClass}">
        <strong>📶Connectivity:</strong> ${conn.online ? 'Online' : 'Offline'} · ~${latency} ms latency
        <div class="env-msg">${connMsg}</div>
      </div>
      <div class="env-badge ${screenClass}">
        <strong>🖥️Screen:</strong> ${dev.screen?.w}×${dev.screen?.h}
        <div class="env-msg">${screenMsg}</div>
      </div>
      <div class="env-badge ${kbClass}">
        <strong>⌨️Keyboard:</strong> ${keyboardOk ? 'Present/likely' : 'Unknown'}
        <div class="env-msg">${kbMsg}</div>
      </div>
      <div class="env-badge ${batClass}">
        <strong>🔋Battery:</strong> ${battery}% ${dev.battery?.charging ? '(charging)' : ''}
        <div class="env-msg">${batMsg}</div>
      </div>
    `;

    // --- calculate readiness score ---
    let score = 100;
    if (!conn.online) score = 0;
    else {
      if (latency > 300) score -= 20;
      if (!screenOk) score -= 15;
      if (!keyboardOk) score -= 10;
      if (battery < 50 && !dev.battery?.charging) score -= 20;
      if (battery < 20 && !dev.battery?.charging) score -= 50;
    }
    score = Math.max(0, score);

    const label = $id('readiness-label');
    if (label) {
      if (score >= 80) {
        label.className = 'readiness-badge readiness-good';
        label.textContent = `✅ Good to go (${score}%)`;
      } else if (score >= 50) {
        label.className = 'readiness-badge readiness-warn';
        label.textContent = `⚠️ Okay but not ideal (${score}%)`;
      } else {
        label.className = 'readiness-badge readiness-poor';
        label.textContent = `❌ Poor conditions (${score}%)`;
      }
    }
  }

  // --- save env_check to DB (safe-guarded) ---
  try {
    const { data: userRes } = await client.auth.getUser();
    if (!userRes?.user) throw new Error("No auth user");

    const { data: appUser } = await client
      .from('app_users')
      .select('id')
      .eq('supabase_user_id', userRes.user.id)
      .single();
    if (!appUser) throw new Error("No app_user found");

    const { data: uas } = await client
      .from('user_assessments')
      .select('id, prep_meta, created_at')
      .eq('app_user_id', appUser.id)
      .neq('status', 'completed')
      .order('created_at', { ascending: false });

    if (!uas || uas.length === 0) {
      console.warn("⚠ No user_assessments found, skipping env_check save");
    } else {
      const ua = uas[0];
      const newMeta = { ...(ua.prep_meta || {}), env_check: { conn, dev } };
      await client
        .from('user_assessments')
        .update({ prep_meta: newMeta, updated_at: new Date().toISOString() })
        .eq('id', ua.id);
      console.log(`✅ Environment saved to prep_meta for user_assessments.id = ${ua.id}`);
    }
  } catch (e) {
    console.error('❌ Failed to update env_check:', e);
  }

  const chkEnv = $id('chk-env');
  if (chkEnv) chkEnv.checked = true;

  setStatus('Ready');
  show('prep-environment');
}


// --- Mood Section Logic ---
(() => {
  const moodBtns = document.querySelectorAll('#mood-options .mood-btn');
  const sleepSel = document.getElementById('mood-sleep');
  const distSel  = document.getElementById('mood-distraction');
  const btnNext  = document.getElementById('to-a11y');

  let selectedMood = null;

  function validateMoodForm() {
    if (selectedMood && sleepSel.value && distSel.value) {
      btnNext.disabled = false;
      btnNext.classList.remove('btn-disabled');
    } else {
      btnNext.disabled = true;
      btnNext.classList.add('btn-disabled');
    }
  }

  // Mood button click
  moodBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      moodBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedMood = btn.dataset.value;
      validateMoodForm();
    });
  });

  [sleepSel, distSel].forEach(sel => {
    sel.addEventListener('change', validateMoodForm);
  });

  // Save on continue
  btnNext.addEventListener('click', async () => {
    if (!selectedMood || !sleepSel.value || !distSel.value) return;

    try {
      const { data: userRes } = await client.auth.getUser();
      if (!userRes?.user) return;

      const { data: appUser } = await client
        .from('app_users')
        .select('id')
        .eq('supabase_user_id', userRes.user.id)
        .single();

      const { data: uas } = await client
        .from('user_assessments')
        .select('id, prep_meta, created_at')
        .eq('app_user_id', appUser.id)
        .neq('status', 'completed')
        .order('created_at', { ascending: false });

      if (!uas || uas.length === 0) return;

      const ua = uas[0];
      const newMeta = {
        ...(ua.prep_meta || {}),
        mood: {
          affect: selectedMood,
          sleep: sleepSel.value,
          distraction: distSel.value
        }
      };

      await client
        .from('user_assessments')
        .update({ prep_meta: newMeta, updated_at: new Date().toISOString() })
        .eq('id', ua.id);

      console.log(`✅ Mood saved to prep_meta for user_assessments.id = ${ua.id}`);
    } catch (e) {
      console.error('❌ Failed to update mood:', e);
    }
  });

  // Init
  validateMoodForm();
})();



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

  // --- attempt creation / resume (local fallback if API not present) ---
  async function localStartAssessment(assignmentId, prefs, mood){
    // who am I
    const { data: userRes } = await client.auth.getUser();
    const supaUser = userRes?.user;
    if (!supaUser) throw new Error('No session');
    const { data: me } = await client.from('app_users').select('id').eq('supabase_user_id', supaUser.id).single();
    const appUserId = me?.id;
    if (!appUserId) throw new Error('Profile not found');

    // assignment & assessment
    const { data: assign } = await client
      .from('assessment_assignments')
      .select('id, assessment_id, max_attempts')
      .eq('id', assignmentId)
      .single();
    if (!assign) throw new Error('Assignment not found');

    // If any in-progress UA exists -> resume it
    const { data: inprog } = await client
      .from('user_assessments')
      .select('id')
      .eq('assignment_id', assignmentId)
      .eq('app_user_id', appUserId)
      .eq('status', 'in_progress')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (inprog?.id) {
      const url = `user_take.html?assignment_id=${encodeURIComponent(assignmentId)}&user_assessment_id=${encodeURIComponent(inprog.id)}`;
      window.location.href = url;
      return;
    }

    // Count attempts (all rows) & find last attempt (for carry-forward)
    const { data: priorRows } = await client
      .from('user_assessments')
      .select('id, attempt_number, started_at, status')
      .eq('assignment_id', assignmentId)
      .eq('app_user_id', appUserId)
      .order('created_at', { ascending: false });

    const prior = priorRows || [];
    const lastAttemptNum = Math.max(0, ...prior.map(r => r.attempt_number || 0));
    const attempt_number = lastAttemptNum + 1;

    // Create fresh UA (attempt starts here)
    const nowIso = new Date().toISOString();
    const { data: uaRow, error: uaErr } = await client
      .from('user_assessments')
      .insert({
        app_user_id: appUserId,
        assessment_id: assign.assessment_id,
        assignment_id: assignmentId,
        status: 'in_progress',
        attempt_number,
        started_at: nowIso,
        prep_meta: { prefs, mood }
      })
      .select('id')
      .single();
    if (uaErr || !uaRow) throw new Error('Failed to start attempt');

    // Carry-forward answers from most recent prior attempt (completed or abandoned)
    const latestPrev = prior.find(Boolean);
    if (latestPrev?.id) {
      const { data: prevAnswers } = await client
        .from('user_responses')
        .select('question_id, response, time_spent_seconds')
        .eq('user_assessment_id', latestPrev.id);

      if (prevAnswers?.length) {
        const rows = prevAnswers.map(r => ({
          user_assessment_id: uaRow.id,
          question_id: r.question_id,
          response: r.response,
          time_spent_seconds: r.time_spent_seconds || null
        }));
        // chunk inserts (supa limit safety)
        const chunkSize = 500;
        for (let i = 0; i < rows.length; i += chunkSize) {
          const slice = rows.slice(i, i + chunkSize);
          await client.from('user_responses').insert(slice);
        }
      }
    }

    const url = `user_take.html?assignment_id=${encodeURIComponent(assignmentId)}&user_assessment_id=${encodeURIComponent(uaRow.id)}`;
    window.location.href = url;
  }

  // Store prep_meta ahead of time (note: tied to next attempt by API if supported)
  async function safePatchFuturePrepMeta(obj){
    try {
      if (window.userAssessmentsApi?.patchPrepMetaForNextAttempt) {
        await userAssessmentsApi.patchPrepMetaForNextAttempt(assignmentId, obj);
      }
    } catch(e){ /* optional best-effort */ }
  }

  // --- boot ---
  window.addEventListener('DOMContentLoaded', init);
})();

