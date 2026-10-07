function show(el) {
  if (!el) return;
  const target = typeof el === 'string' ? document.getElementById(el) : el;
  if (!target || !target.style) return;
  target.style.display = 'block';
  target.classList.add('active');
  void target.offsetHeight; // Force reflow
  target.classList.add('fade-slide-in');
  target.style.opacity = '1';
  
  // Ensure child elements with fade-slide also animate in
  const children = target.querySelectorAll('.fade-slide');
  children.forEach(child => {
    child.classList.add('fade-slide-in');
    child.style.opacity = '1';
    child.style.transform = 'translateY(0)';
  });
}

function hide(el) {
  if (!el) return;
  const target = typeof el === 'string' ? document.getElementById(el) : el;
  if (!target || !target.style) return;
  target.classList.remove('fade-slide-in');
  target.classList.remove('active');
  target.style.opacity = '0';
  target.style.display = 'none';
}

// Shared pre-report feedback checkpoint for both the standard and TML flows.
// It keeps the technician's feedback in the diagnostic payload for admin review.
(function () {
  let feedbackCallback = null;
  let feedbackValues = { clarity: '', unclearSteps: '', comments: '' };

  function feedbackText(key, fallback) {
    return typeof t === 'function' && t(key) !== key ? t(key) : fallback;
  }

  function renderFeedbackModal() {
    const modal = document.getElementById('diagnosticFeedbackModal');
    if (!modal) return;
    modal.innerHTML = `
      <div role="dialog" aria-modal="true" aria-labelledby="diagnosticFeedbackTitle" style="width:min(620px,100%); max-height:90vh; overflow:auto; background:#fff; border-radius:16px; padding:24px; box-shadow:0 24px 70px rgba(15,23,42,.35);">
        <h2 id="diagnosticFeedbackTitle" style="margin:0 0 8px; color:#0b5daa;">${feedbackText('feedback_title', 'Diagnostic Feedback')}</h2>
        <p style="margin:0 0 18px; color:#475569;">${feedbackText('feedback_intro', 'Before generating the report, please tell us whether the diagnostic steps were clear and useful.')}</p>
        <label style="display:block; margin:12px 0; font-weight:700;">${feedbackText('feedback_clarity', 'How clear were the diagnostic steps?')}
          <select id="diagnosticFeedbackClarity" required style="display:block; width:100%; margin-top:6px; padding:10px; border:1px solid #cbd5e1; border-radius:8px;">
            <option value="">${feedbackText('feedback_select', 'Select one')}</option>
            <option value="5">${feedbackText('feedback_very_clear', 'Very clear')}</option>
            <option value="4">${feedbackText('feedback_clear', 'Clear')}</option>
            <option value="3">${feedbackText('feedback_average', 'Needs some improvement')}</option>
            <option value="2">${feedbackText('feedback_unclear', 'Unclear')}</option>
            <option value="1">${feedbackText('feedback_very_unclear', 'Very unclear')}</option>
          </select>
        </label>
        <label style="display:block; margin:12px 0; font-weight:700;">${feedbackText('feedback_steps', 'Which diagnostic step needs improvement?')}
          <textarea id="diagnosticFeedbackSteps" rows="3" style="display:block; width:100%; margin-top:6px; padding:10px; border:1px solid #cbd5e1; border-radius:8px; resize:vertical;" placeholder="${feedbackText('feedback_steps_placeholder', 'Optional')}"></textarea>
        </label>
        <label style="display:block; margin:12px 0; font-weight:700;">${feedbackText('feedback_comments', 'Additional comments')}
          <textarea id="diagnosticFeedbackComments" rows="3" style="display:block; width:100%; margin-top:6px; padding:10px; border:1px solid #cbd5e1; border-radius:8px; resize:vertical;" placeholder="${feedbackText('feedback_comments_placeholder', 'Optional')}"></textarea>
        </label>
        <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:18px; flex-wrap:wrap;">
          <button type="button" id="diagnosticFeedbackSubmit" class="btn">${feedbackText('feedback_continue', 'Continue to Report')}</button>
        </div>
      </div>`;
    const clarity = document.getElementById('diagnosticFeedbackClarity');
    const steps = document.getElementById('diagnosticFeedbackSteps');
    const comments = document.getElementById('diagnosticFeedbackComments');
    if (clarity) clarity.value = feedbackValues.clarity;
    if (steps) steps.value = feedbackValues.unclearSteps;
    if (comments) comments.value = feedbackValues.comments;
  }

  function finishFeedback(skipped) {
    const clarity = document.getElementById('diagnosticFeedbackClarity');
    const steps = document.getElementById('diagnosticFeedbackSteps');
    const comments = document.getElementById('diagnosticFeedbackComments');
    if (!skipped && !clarity?.value) {
      clarity?.focus();
      clarity?.setCustomValidity(feedbackText('feedback_required', 'Please select a clarity rating before continuing.'));
      clarity?.reportValidity();
      return;
    }
    feedbackValues = skipped ? { clarity: '', unclearSteps: '', comments: '' } : {
      clarity: clarity?.value || '',
      unclearSteps: steps?.value.trim() || '',
      comments: comments?.value.trim() || ''
    };
    const result = { ...feedbackValues, skipped, language: typeof getLang === 'function' ? getLang() : 'en', languageName: typeof getLanguageName === 'function' ? getLanguageName() : 'English', recordedAt: new Date().toISOString() };
    const modal = document.getElementById('diagnosticFeedbackModal');
    if (modal) modal.remove();
    const callback = feedbackCallback;
    feedbackCallback = null;
    window._diagnosticFeedback = result;
    if (callback) callback(result);
  }

  window.requestDiagnosticFeedback = function (callback) {
    feedbackCallback = callback;
    const existing = document.getElementById('diagnosticFeedbackModal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'diagnosticFeedbackModal';
    modal.style.cssText = 'position:fixed; inset:0; z-index:10000; display:flex; align-items:center; justify-content:center; padding:20px; background:rgba(15,23,42,.55);';
    document.body.appendChild(modal);
    renderFeedbackModal();
    document.getElementById('diagnosticFeedbackSubmit').onclick = () => finishFeedback(false);
  };
  window.refreshDiagnosticFeedback = function () {
    if (!document.getElementById('diagnosticFeedbackModal')) return;
    renderFeedbackModal();
    document.getElementById('diagnosticFeedbackSubmit').onclick = () => finishFeedback(false);
  };
})();

/* =================== Step 1 Wizard State Machine =================== */
// NOTE: stepToRibbon is defined inside the IIFE below (~line 714) — the authoritative version.

(function () {
  // Load steps from diagnosticSteps.js
  const { originalSteps, triageSteps, intermittentSteps } = window.DIAGNOSTIC_DATA;
  const steps = originalSteps.slice();

  // Minimal router to support jumpTo/stop/next
  let currentKey = "green";
  const stepByKey = Object.fromEntries(steps.map(s => [s.key, s]));
  let loopVisitCounts = {};

  function getCurrentStep() {
    return stepByKey[currentKey];
  }

  // ================================
  // stepToRibbon — maps every step key to its wireflow section node.
  // This is the critical lookup used by badges, ribbon %, section headers,
  // live wiring visual, and progress tracking.
  // ================================
  const stepToRibbon = {
    // Step 1 — Customer Mating Connector
    green:               'wf-conn',
    green_fuse:          'wf-conn',
    green_abs3:          'wf-conn',
    green_vehicle_conn:  'wf-conn',
    black:               'wf-conn',
    yellow:              'wf-conn',
    // Step 2 — ECU Speed Box
    sb_green:            'wf-speed',
    sb_green_continuity: 'wf-speed',
    sb_black:            'wf-speed',
    sb_black_continuity: 'wf-speed',
    sb_grey_pulses:      'wf-speed',
    sb_bypass_check:     'wf-speed',
    sb_yellow_path:      'wf-speed',
    sb_violet_output:    'wf-speed',
    // Step 3 — Retarder Switch
    sw_violet_input:      'wf-switch',
    sw_violet_continuity: 'wf-switch',
    sw_pink_output:       'wf-switch',
    // Step 4 — Air Pressure Switch
    aps_pin1_input:       'wf-aps',
    aps_pin1_continuity:  'wf-aps',
    aps_pin1_recheck:     'wf-aps',
    aps_internal_supply:  'wf-aps',
    aps_output_check:     'wf-aps',
    aps_stage1:           'wf-aps',
    aps_stage2:           'wf-aps',
    aps_stage3:           'wf-aps',
    aps_stage4:           'wf-aps',
    aps_hose_check:       'wf-aps',
    // Step 5 — Relay Box
    rb_precheck_seated:        'wf-relay',
    rb_precheck_pins:          'wf-relay',
    rb_cutoff_pos:             'wf-relay',
    rb_cutoff_output:          'wf-relay',
    rb_cutoff_input:           'wf-relay',
    rb_battery_check:          'wf-relay',
    rb_verify_ground:          'wf-relay',
    rb_ground_contact:         'wf-relay',
    rb_negative_cable_condition: 'wf-relay',
    rb_aps_signal_check:       'wf-relay',
    rb_energization:           'wf-relay',
    rb_fuse_check:             'wf-relay',
    rb_output_check:           'wf-relay',
    rb_output_stage1:          'wf-relay',
    rb_output_stage2:          'wf-relay',
    rb_output_stage3:          'wf-relay',
    rb_output_stage4:          'wf-relay',
    rb_final_confirmation:     'wf-relay',
    // Step 6 — Retarder Unit
    ret_mb_check:            'wf-retarder',
    ret_power_check:         'wf-retarder',
    ret_coil_ground_check:   'wf-retarder',
    ret_power_voltage_check: 'wf-retarder',
    dash_backlight_check:   'wf-conn',
    dash_indicator_check:   'wf-conn',
    dash_taillamp_check:    'wf-conn',
    dash_final_check:       'wf-conn',
    // Quick Triage
    triage_q1: 'wf-conn',
    triage_q2: 'wf-relay',
    triage_q3: 'wf-relay',
    // Intermittent
    int_q1: 'wf-conn',
    int_q2: 'wf-conn',
    int_q3: 'wf-conn',
    int_q4: 'wf-relay',
    int_q5: 'wf-retarder',
  };

  function showBanner(badge, reason) {
    if (!stepResult || !reason) return;

    // Clear and show the result panel safely
    stepResult.innerHTML = ""; // Clear existing content

    const reasonDiv = document.createElement("div");
    reasonDiv.className = "result-reason-text";
    // We set innerHTML here because the reason strings might contain <br> or <strong> tags
    // For full XSS protection, a sanitization library would be ideal, but for now this is controlled content.
    reasonDiv.innerHTML = reason; 

    const okBtn = document.createElement("button");
    okBtn.className = "btn btn-primary";
    okBtn.style.cssText = "margin-top: 15px; width: 100%; border: none; background: #0B5DAA; color: white; padding: 10px; border-radius: 8px; font-weight: 700; cursor: pointer;";
    okBtn.textContent = "OK — Continue Diagnostic";
    okBtn.onclick = window._proceedAfterAction;

    if (badge !== 'step-pass') {
      const evidenceLabel = document.createElement('label');
      evidenceLabel.className = 'step-evidence-label';
      evidenceLabel.textContent = 'Add photo evidence (optional)';
      const evidenceInput = document.createElement('input');
      evidenceInput.type = 'file';
      evidenceInput.accept = 'image/*';
      evidenceInput.capture = 'environment';
      evidenceInput.className = 'step-evidence-input';
      evidenceInput.addEventListener('change', async event => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        const evidence = await compressEvidenceImage(file);
        window._stepEvidence[currentKey] = evidence;
        await saveDiagnosticDraft();
        evidenceLabel.firstChild.textContent = 'Photo attached — tap to replace';
        let preview = evidenceLabel.querySelector('.step-evidence-preview');
        if (!preview) {
          preview = document.createElement('img');
          preview.className = 'step-evidence-preview';
          preview.style.cssText = 'display:block; width:120px; height:90px; object-fit:cover; margin-top:8px; border-radius:8px; border:1px solid #cbd5e1;';
          evidenceLabel.appendChild(preview);
        }
        preview.src = evidence.dataUrl;
        preview.alt = `Attached evidence for ${currentKey}`;
      });
      evidenceLabel.appendChild(evidenceInput);
      stepResult.appendChild(evidenceLabel);
    }

    stepResult.appendChild(reasonDiv);
    stepResult.appendChild(okBtn);

    // Set appropriate styling class
    stepResult.className = `step-result-enhanced ${badge || 'step-action'}`;
    stepResult.style.display = 'block';

    // Disable primary choice buttons while showing instruction
    if (stepBtnYes) stepBtnYes.disabled = true;
    if (stepBtnNo) stepBtnNo.disabled = true;
  }

  function compressEvidenceImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error('Unable to read image'));
        image.onload = () => {
          const maxSize = 1280;
          const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve({ name: file.name, type: 'image/jpeg', dataUrl: canvas.toDataURL('image/jpeg', 0.68) });
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // Global helper for the button above
  window._proceedAfterAction = function () {
    if (stepResult) stepResult.style.display = 'none';
    if (stepBtnYes) stepBtnYes.disabled = false;
    if (stepBtnNo) stepBtnNo.disabled = false;

    if (window._pendingTerminal) {
      const pendingTerminal = window._pendingTerminal;
      window._pendingTerminal = null;
      endWizard(pendingTerminal.reason, pendingTerminal.outcome);
      return;
    }

    // Move to the next key that was queued
    if (window._nextKeyQueue) {
      currentKey = window._nextKeyQueue;
      window._nextKeyQueue = null;
      renderStep(getCurrentStep());
    }
  };

  // Timer logic
  let timerInterval = null;
  let elapsedMs = 0;
  let wizardStartTime = null;
  let lastGuidedReportArgs = null;

  function startElapsedTimer() {
    if (timerInterval) return; // Don't reset if already running
    wizardStartTime = Date.now();
    timerInterval = setInterval(() => {
      elapsedMs = Date.now() - wizardStartTime;
      const mm = String(Math.floor(elapsedMs / 60000)).padStart(2, "0");
      const ss = String(Math.floor((elapsedMs % 60000) / 1000)).padStart(2, "0");
      const el = document.getElementById("elapsedTime");
      if (el) el.textContent = `${mm}:${ss}`;
    }, 500);
  }

  function stopElapsedTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
  }

  function endWizard(reason, outcome = "FAULT FOUND") {
    // 1. Disable buttons
    if (typeof stepBtnYes !== 'undefined') stepBtnYes.disabled = true;
    if (typeof stepBtnNo !== 'undefined') stepBtnNo.disabled = true;

    // 2. Stop timer
    stopElapsedTimer();

    // 3. Capture technician feedback before generating and submitting the report.
    const finishReport = () => {
      generateGuidedReport(outcome, reason);
      clearDiagnosticDraft().catch(error => console.error('[Draft] Clear failed:', error));
    };
    if (typeof window.requestDiagnosticFeedback === 'function') window.requestDiagnosticFeedback(finishReport);
    else finishReport();

    // 4. Alert removed as per request
  }

  // --- Authenticated API and offline store-and-forward sync ---
  const API_BASE_URL = window.RIQ_API_BASE_URL ||
    (window.location.protocol === 'file:' ? 'http://localhost:3000' : '');

  function getAuthToken() {
    return sessionStorage.getItem('riq_access_token') || '';
  }

  let queueDbPromise;
  function openQueueDb() {
    if (!('indexedDB' in window)) return Promise.resolve(null);
    if (queueDbPromise) return queueDbPromise;
    queueDbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open('retarder_iq_offline', 2);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('queue')) request.result.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
        if (!request.result.objectStoreNames.contains('drafts')) request.result.createObjectStore('drafts', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return queueDbPromise;
  }

  async function getSyncQueue() {
    const db = await openQueueDb();
    if (!db) return [];
    const queue = await new Promise((resolve, reject) => {
      const request = db.transaction('queue', 'readonly').objectStore('queue').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return queue;
  }

  async function replaceSyncQueue(queue) {
    const db = await openQueueDb();
    if (!db) return;
    await new Promise((resolve, reject) => {
      const transaction = db.transaction('queue', 'readwrite');
      const store = transaction.objectStore('queue');
      store.clear();
      queue.forEach(item => store.add({ data: item.data, idempotencyKey: item.idempotencyKey || crypto.randomUUID(), timestamp: item.timestamp, attempts: item.attempts || 0 }));
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  }

  function draftTransaction(mode) {
    return openQueueDb().then(db => {
      if (!db) return null;
      return db.transaction('drafts', mode).objectStore('drafts');
    });
  }

  async function saveDiagnosticDraft() {
    const store = await draftTransaction('readwrite');
    if (!store) return;
    const draft = {
      id: 'active',
      complaintType: window._riqComplaintMode || 'Not Working',
      currentKey,
      answers: { ...(window._stepAnswers || {}) },
      sectionStatus: { ...sectionStatus },
      history: guidedHistory.map(item => ({
        key: item.key,
        sectionStatus: { ...item.sectionStatus },
        stepAnswers: { ...item.stepAnswers }
      })),
      evidence: { ...(window._stepEvidence || {}) },
      channelChecks: { ...(window._channelChecks || {}) },
      savedAt: Date.now()
    };
    await new Promise((resolve, reject) => {
      const request = store.put(draft);
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error);
    });
  }

  async function loadDiagnosticDraft() {
    const store = await draftTransaction('readonly');
    if (!store) return null;
    return new Promise((resolve, reject) => {
      const request = store.get('active');
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async function clearDiagnosticDraft() {
    const store = await draftTransaction('readwrite');
    if (!store) return;
    await new Promise((resolve, reject) => {
      const request = store.delete('active');
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error);
    });
  }

  async function restoreDiagnosticDraft() {
    const draft = await loadDiagnosticDraft();
    if (!draft || !draft.currentKey || !window.confirm('Resume your unfinished diagnostic?')) {
      if (draft) await clearDiagnosticDraft();
      return;
    }
    window._restoringDiagnosticDraft = true;
    window._riqComplaintMode = draft.complaintType || 'Not Working';
    window.setComplaintMode(window._riqComplaintMode);
    currentKey = draft.currentKey;
    window._stepAnswers = { ...(draft.answers || {}) };
    window._stepEvidence = { ...(draft.evidence || {}) };
    window._channelChecks = { ...(draft.channelChecks || {}) };
    Object.assign(sectionStatus, draft.sectionStatus || {});
    guidedHistory = draft.history || [];
    window._restoringDiagnosticDraft = false;
    renderStep(getCurrentStep());
  }

  async function saveToSyncQueue(data, idempotencyKey = crypto.randomUUID()) {
    const queue = await getSyncQueue();
    const fingerprint = JSON.stringify(data);
    if (!queue.some(item => JSON.stringify(item.data) === fingerprint)) {
      queue.push({ data, idempotencyKey, timestamp: Date.now(), attempts: 0 });
      await replaceSyncQueue(queue);
    }
    console.log(`[Sync] Saved diagnostic locally. Pending: ${queue.length}`);
  }

  async function ensureGuestToken(data) {
    const response = await fetch(`${API_BASE_URL}/api/auth/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: data['FSE Name'],
        phone: data['Technician Phone'],
        dealer: data['Dealer / Location']
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to start technician session.');
    sessionStorage.setItem('riq_access_token', result.token);
    return result.token;
  }

  async function submitDiagnostic(data) {
    const idempotencyKey = crypto.randomUUID();
    if (!navigator.onLine) {
      await saveToSyncQueue(data, idempotencyKey);
      return false;
    }

    try {
      const token = getAuthToken() || await ensureGuestToken(data);
      const response = await fetch(`${API_BASE_URL}/api/diagnostics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error(`API rejected diagnostic (${response.status})`);
      return true;
    } catch (error) {
      console.error('[Sync] Submission failed:', error);
      await saveToSyncQueue(data, idempotencyKey);
      window.setTimeout(() => {
        window.flushSyncQueue().catch(retryError => console.error('[Sync] Delayed retry failed:', retryError));
      }, 5000);
      return false;
    }
  }

  window.flushSyncQueue = async function () {
    if (!navigator.onLine) return;
    const queue = await getSyncQueue();
    if (!queue.length) return;

    if (!getAuthToken()) {
      try { await ensureGuestToken(queue[0].data); }
      catch (error) { console.error('[Sync] Could not create guest session:', error); return; }
    }

    const remaining = [];
    for (const item of queue) {
      const idempotencyKey = item.idempotencyKey || crypto.randomUUID();
      if (await submitDiagnosticWithKey(item.data, idempotencyKey)) continue;
      remaining.push({ ...item, idempotencyKey, attempts: (item.attempts || 0) + 1 });
    }
    await replaceSyncQueue(remaining);
    console.log(`[Sync] Completed flush. Remaining: ${remaining.length}`);
  };

  async function submitDiagnosticWithKey(data, idempotencyKey) {
    if (!navigator.onLine) return false;
    try {
      const token = getAuthToken() || await ensureGuestToken(data);
      const response = await fetch(`${API_BASE_URL}/api/diagnostics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Idempotency-Key': idempotencyKey || crypto.randomUUID() },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error(`API rejected diagnostic (${response.status})`);
      return true;
    } catch (error) {
      console.error('[Sync] Retry failed:', error);
      return false;
    }
  }

  window.addEventListener('online', window.flushSyncQueue);
  window.flushSyncQueue().catch(error => console.error('[Sync] Initial queue flush failed:', error));
  window.sendDataToGoogleSheet = submitDiagnostic;
  window.sendDataToPowerAutomate = () => Promise.resolve(false);

  function setupAuthentication() {
    return;
    if (document.getElementById('riqAuthCard')) return;

    const card = document.createElement('div');
    card.id = 'riqAuthCard';
    card.className = 'card';
    card.style.cssText = 'position:fixed;inset:16px;z-index:10000;max-width:460px;height:max-content;margin:auto;padding:24px;background:#fff;box-shadow:0 20px 50px rgba(0,0,0,.25);';
    card.innerHTML = `
      <h2 style="margin-top:0;color:#0b5daa;">Retarder IQ Sign In</h2>
      <p class="muted">Sign in to securely save diagnostic reports.</p>
      <form id="riqAuthForm">
        <label>Email<input id="riqAuthEmail" type="email" autocomplete="username" required style="width:100%;margin:6px 0 14px;padding:10px;"></label>
        <label>Password<input id="riqAuthPassword" type="password" autocomplete="current-password" required style="width:100%;margin:6px 0 14px;padding:10px;"></label>
        <button class="btn" type="submit" style="width:100%;background:#0b5daa;color:#fff;">Sign In</button>
        <p id="riqAuthStatus" role="alert" style="color:#b91c1c;min-height:20px;"></p>
      </form>`;
    document.body.appendChild(card);

    card.querySelector('#riqAuthForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const status = card.querySelector('#riqAuthStatus');
      status.textContent = 'Signing in…';
      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: card.querySelector('#riqAuthEmail').value,
            password: card.querySelector('#riqAuthPassword').value
          })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Sign in failed.');
        sessionStorage.setItem('riq_access_token', result.token);
        card.remove();
        await window.flushSyncQueue();
      } catch (error) {
        status.textContent = error.message;
      }
    });
  }

  window.addEventListener('DOMContentLoaded', setupAuthentication, { once: true });
  if (document.readyState !== 'loading') setupAuthentication();

  // XSS-safe HTML encoder: prevents user-input strings from injecting markup
  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function generateGuidedReport(outcome, failedReason, submit = true) {
    lastGuidedReportArgs = { outcome, failedReason };
    const resultCard = document.getElementById("resultCard");
    const resultSummary = document.getElementById("resultSummary");
    const guidedFlowCard = document.getElementById("guidedFlowCard");

    if (!resultCard || !resultSummary) return;

    const isSuccess = outcome === "WORKING SATISFACTORY";
    const displayOutcome = isSuccess ? t('working_sat') : t('fault_found_status');
    const outcomeColor = isSuccess ? "#16a34a" : "#dc2626";
    const outcomeBg = isSuccess ? "#dcfce7" : "#fee2e2";
    const detailColor = isSuccess ? "#15803d" : "#b91c1c";
    const detailBorder = isSuccess ? "#22c55e" : "#ef4444";
    const detailLabel = isSuccess ? t('rep_diag_details') : t('rep_fault_details');

    // Collect data from Registration form (escaped to prevent XSS in innerHTML templates)
    const techName   = esc(document.getElementById("techName")?.value   || "-");
    const techPhone  = esc(document.getElementById("techPhone")?.value  || "-");
    const dealerName = esc(document.getElementById("dealerName")?.value || "-");
    const city       = esc(document.getElementById("city")?.value       || "-");
    const state      = esc(document.getElementById("state")?.value      || "-");
    const vehReg     = esc(document.getElementById("vehReg")?.value     || "-");
    const odometer   = esc(document.getElementById("odometer")?.value   || "-");
    const chassisNo  = esc(document.getElementById("chassisNo")?.value  || "-");
    const vehModelRaw = document.getElementById("vehModel")?.value || "-";
    const vehModel   = esc(vehModelRaw);
    const normalizedVehModel = vehModelRaw.replace(/[‑–—]/g, '-').trim();
    const odometerValue = odometer; // same field — reuse escaped value

    // Region logic based on state
    const stateRegionMap = {
      'Jammu & Kashmir': 'North', 'Himachal Pradesh': 'North', 'Punjab': 'North', 'Chandigarh': 'North', 'Uttarakhand': 'North', 'Haryana': 'North', 'Delhi': 'North', 'Rajasthan': 'North', 'Uttar Pradesh': 'North',
      'Bihar': 'East', 'West Bengal': 'East', 'Odisha': 'East', 'Jharkhand': 'East', 'Assam': 'East', 'Arunachal Pradesh': 'East', 'Manipur': 'East', 'Meghalaya': 'East', 'Mizoram': 'East', 'Nagaland': 'East', 'Sikkim': 'East', 'Tripura': 'East',
      'Madhya Pradesh': 'West', 'Gujarat': 'West', 'Goa': 'West', 'Maharashtra': 'West',
      'Andhra Pradesh': 'South', 'Karnataka': 'South', 'Kerala': 'South', 'Tamil Nadu': 'South', 'Telangana': 'South', 'Puducherry': 'South',
    };
    const region = stateRegionMap[state] || 'Other';

    // Duration logic: start time to end time in minutes
    let warrantyStatus = 'Warranty';
    let duration = '-';
    const odoNum = Number(odometer.replace(/[^0-9]/g, ''));
    if (odoNum >= 200000) {
      warrantyStatus = 'Post Warranty';
    }
    if (typeof wizardStartTime === 'number') {
      const now = Date.now();
      const diffMs = now - wizardStartTime;
      duration = Math.round(diffMs / 1000) + ' sec';
    }

    // Suspected part extraction from failedReason
    let suspectedPart = '-';
    const partKeywords = ['wiring', 'connector', 'ecu', 'speed box', 'retarder switch', 'air pressure switch', 'relay box', 'retarder'];
    for (const keyword of partKeywords) {
      if (failedReason && failedReason.toLowerCase().includes(keyword)) {
        suspectedPart = keyword.charAt(0).toUpperCase() + keyword.slice(1);
        break;
      }
    }

    // --- Enhanced Google Sheets Data Mapping ---
    // Track serial number globally (increment for each report)
    if (typeof window._slNo === "undefined") window._slNo = 1;

    // Map vehicle model selection to manufacturer, customer, and model fields
    let vehicleManufacturer = "-";
    let customer = "-";
    let model = "-";
    switch (normalizedVehModel) {
      case "12M BS-IV (Retarder)":
      case "Viking BS-IV (Retarder)":
      case "Other BS-IV Retarder Bus":
      case "12M BS-VI (Retarder)":
      case "Viking BS-VI (Retarder)":
      case "Other BS-VI Retarder Bus":
      case "13.5M BS-VI (Retarder)":
        vehicleManufacturer = "ASHOK LEYLAND";
        customer = "ASHOK LEYLAND";
        model = vehModelRaw;
        break;
      case "VECV — 6016":
      case "VECV — 6019":
        vehicleManufacturer = "VECV";
        customer = "VECV";
        model = vehModelRaw;
        break;
      case "TML — 1822":
        customer = "TML";
        model = "TML, 13.5M";
        break;
      default:
        customer = vehModel.split("—")[0]?.trim() || "-";
        model = vehModel;
    }

    if (vehicleManufacturer === "-" && /^TML\b/i.test(normalizedVehModel)) {
      vehicleManufacturer = "TATA MOTORS";
      customer = "TML";
    }
    if (vehicleManufacturer === "-" && /^VECV\b/i.test(normalizedVehModel)) {
      vehicleManufacturer = "VECV";
      customer = "VECV";
    }
    if (vehicleManufacturer === "-") {
      vehicleManufacturer = normalizedVehModel.split('-')[0]?.trim() || "-";
      customer = vehicleManufacturer;
    }

    // Placeholders for new fields (update with actual values as needed)
    const arrangementType = window.arrangementType || "-";
    const attendedOn = window.attendedOn || new Date().toLocaleDateString();
    const kmsAndDateOfSale = window.kmsAndDateOfSale || odometer;
    const customerVoice = window.customerVoice || failedReason;
    const techComments = window.techComments || outcome;
    const repeatComplaint = window.repeatComplaint || "No";
    const liability = window.liability || "Non BI";
    const action = window.action || "For information";
    const qaComments = window.qaComments || "—";

    const diagnosticCaseId = typeof crypto?.randomUUID === 'function'
      ? crypto.randomUUID()
      : `RIQ-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const emissionStandard = typeof EMISSION !== 'undefined' && EMISSION ? EMISSION : "-";
    const complaintType = typeof COMPLAINT !== 'undefined' && COMPLAINT ? COMPLAINT : "-";
    const diagnosticStatus = outcome === "WORKING SATISFACTORY"
      ? "WORKING SATISFACTORY"
      : outcome === "INCOMPLETE" ? "INCOMPLETE" : "FAULT FOUND";
    const recommendedPartNo = failedReason?.match(/Part No:\s*([^\s.]+)/i)?.[1] || "-";

    const sheetData = {
      "Diagnostic Case ID": diagnosticCaseId,
      "Diagnostic Data Version": window.DIAGNOSTIC_DATA?.version || "1.0.0",
      "Diagnostic Language": typeof getLang === 'function' ? getLang() : 'en',
      "Diagnostic Language Name": typeof getLanguageName === 'function' ? getLanguageName() : 'English',
      "Report Language Used": typeof getLang === 'function' ? getLang() : 'en',
      "Report Language Name": typeof getLanguageName === 'function' ? getLanguageName() : 'English',
      "Admin Report Language": "English",
      "Sl. No.": window._slNo++,
      "Business Unit": "HVBU",
      "Segment": "HCV",
      "Customer": customer,
      "Vehicle Manufacturer": vehicleManufacturer,
      "Model": model,
      "Vehicle Registration No.": vehReg,
      "Emission Standard": emissionStandard,
      "Complaint Type": complaintType,
      "Type of brake": "Air",
      "Type of arrangement": arrangementType,
      "Product": "EMR",
      "Region": region,
      "Dealer / Location": dealerName,
      "Complaint Attended on": attendedOn,
      "FSE Name": techName,
      "Technician Phone": techPhone,
      "City": city,
      "State": state,
      "Diagnostic Duration": duration,
      "Diagnostic Status": diagnosticStatus,
      "Chassis No.": chassisNo,
      "Kms & Date of Sale": kmsAndDateOfSale,
      "Customer Voice / Field Complaints reported": customerVoice,
      "Technical Service comments": techComments,
      "Suspected Product": suspectedPart,
      "Recommended Part No.": recommendedPartNo,
      "Vehicle under warranty period?": warrantyStatus === "Warranty" ? "Yes" : "No",
      "Repeat complaint? Yes / No": repeatComplaint,
      "Liability BI / Not off BI": liability,
      "Action (if any)": action,
      "QA Comments": qaComments,
      "Diagnostic Feedback": window._diagnosticFeedback || { skipped: true },
      "Step Evidence": window._stepEvidence || {},
      "Channel Checks": window._channelChecks || {},
      "Diagnostic Step History": steps
        .filter(step => window._stepAnswers && window._stepAnswers[step.key] !== undefined)
        .map(step => ({ key: step.key, question: step.q, response: window._stepAnswers[step.key] ? "Yes" : "No" }))
    };
    if (submit) submitDiagnostic(sheetData);

    // Odometer Recommendation Logic
    const vOdoNum = Number(odometerValue.replace(/[^0-9]/g, ''));
    let odoRecommendationHtml = '';
    if (vOdoNum >= 200000) {
      odoRecommendationHtml = `
          <div style="margin-top:24px; background:#f0f9ff; border:1px solid #bae6fd; border-radius:12px; padding:20px; font-family:'Outfit', sans-serif; box-shadow: 0 4px 12px rgba(0,149,255,0.06); -webkit-print-color-adjust: exact; print-color-adjust: exact;">
            <div style="display:flex; align-items:center; gap:12px; margin-bottom:14px; border-bottom:1px solid #e0f2fe; padding-bottom:12px;">
               <div style="background:#0369a1; width:36px; height:36px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:18px; color:white; box-shadow: 0 2px 4px rgba(3,105,161,0.2);">🛡️</div>
               <h4 style="margin:0; color:#0369a1; font-size:16px; font-weight:800; letter-spacing:0.2px;">
                  ${typeof t === 'function' ? t('odo_recommendation_title') : 'Maintenance Recommendation'}
               </h4>
            </div>
            <div style="font-size:14.5px; color:#0c4a6e; line-height:1.75;">
              ${typeof t === 'function' ? t('odo_recommendation_text') : '...'}
            </div>
          </div>
        `;
    }

    // Elapsed time from DOM or local variable
    const elapsedTimeText = document.getElementById("elapsedTime")?.textContent || "00:00";
    const date = new Date().toLocaleString();

    // Build step history from window._stepAnswers
    const reportHistory = steps.filter(step => window._stepAnswers && window._stepAnswers[step.key] !== undefined).map(step => ({
      key: step.key,
      question: t(step.key),
      response: window._stepAnswers[step.key] ? t('yes') : t('no')
    }));
    const stepRows = window.RIQReportRenderer
      ? window.RIQReportRenderer.renderHistoryRows(reportHistory, { includeEvidence: true, evidence: window._stepEvidence })
      : reportHistory.map((step, index) => {
          const evidence = window._stepEvidence?.[step.key];
          const evidenceCell = evidence?.dataUrl ? `<img src="${evidence.dataUrl}" alt="Evidence" style="width:72px;height:54px;object-fit:cover;border-radius:6px;border:1px solid #cbd5e1;">` : '<span style="color:#94a3b8;">—</span>';
          return `<tr><td style="padding:10px;border:1px solid #e2e8f0;">${String(index + 1).padStart(2, '0')}</td><td style="padding:10px;border:1px solid #e2e8f0;">${step.question}</td><td style="padding:10px;border:1px solid #e2e8f0;">${step.response}</td><td style="padding:8px;border:1px solid #e2e8f0;text-align:center;">${evidenceCell}</td></tr>`;
        }).join('');

    // Build the final HTML for the report
    const translatedReason = typeof t === 'function' ? t(failedReason) : failedReason;
    let faultHtml = `<div style="color:${detailColor}; font-weight:600; font-size:15px; border-left:4px solid ${detailBorder}; padding-left:12px; line-height:1.5;">${translatedReason}</div>`;

    if (failedReason && /Part No:/i.test(failedReason)) {
      // 1. Extract clean description from translated string or original
      let description = translatedReason;
      const partIdx = translatedReason.search(/Replace with|பாகம் எண்|പാർട്ട് നമ്പർ|पार्ट नंबर|పార్ట్ నంబర్|ಭಾಗ ಸಂಖ್ಯೆ/i);
      if (partIdx !== -1) {
        description = translatedReason.substring(0, partIdx)
          .replace(/(?:ब्रेक्स इंडिया|Brakes India|பிரேக்ஸ் இந்தியா|ബ്രേക്സ് ഇന്ത്യ|బ్రేక్స్ ఇండియా|ಬ್ರೇಕ್ಸ್ ಇಂಡಿಯಾ)?\s*$/i, '')
          .trim();
      }
      if (!description.endsWith(".") && !description.endsWith("।")) description += ".";

      // 2. Extract Brand and Part Number with multiple logic fallbacks
      let brand = "BRAKES INDIA";
      let partNo = "N/A";

      const partInfoMatch = failedReason.match(/Replace with\s+(.*?)\s+Part No:\s*(\S+)/i);
      if (partInfoMatch) {
        brand = partInfoMatch[1].trim().toUpperCase();
        partNo = partInfoMatch[2].trim();
      } else {
        const fallbackPart = failedReason.match(/Part No:\s*([\w\-.]+)/i);
        if (fallbackPart) partNo = fallbackPart[1];
      }

      faultHtml = `
        <div style="color:#b91c1c; font-weight:600; font-size:14px; border-left:4px solid #ef4444; padding-left:12px; line-height:1.5; margin-bottom:15px;">
            ${description}
        </div>
        <div style="background:#fff7ed; border:1px solid #fb923c; border-radius:10px; display:flex; align-items:center; gap:12px; padding:10px; font-family:'Outfit', sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; box-shadow: 0 2px 6px rgba(0,0,0,0.05);">
            <div style="background:#ffedd5; width:40px; height:40px; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:20px; border:1px solid #fed7aa; -webkit-print-color-adjust: exact; print-color-adjust: exact;">📦</div>
            <div style="flex:1;">
                <div style="font-size:9px; color:#c2410c; text-transform:uppercase; font-weight:800; letter-spacing:0.8px; margin-bottom:2px;">${t('rep_recommended_part')}</div>
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    <span style="font-size:14px; font-weight:800; color:#431407;">${brand}</span>
                    <span style="background:#7c2d12; color:#ffffff; padding:2px 10px; border-radius:5px; font-family:'Outfit'; font-size:16px; font-weight:800; border:1px solid #431407; display:inline-block; -webkit-print-color-adjust: exact; print-color-adjust: exact; box-shadow: 0 2px 4px rgba(0,0,0,0.15);">
                        ${partNo}
                    </span>
                </div>
            </div>
        </div>
      `;
    }

    resultSummary.innerHTML = `
        <div style="background:#f8fafc; border:2px solid #e2e8f0; border-radius:12px; padding:24px; margin-bottom:24px; font-family:'Outfit', sans-serif;">
            <div class="report-grid" style="display:grid; grid-template-columns: 1fr 1fr; gap:24px;">
                <div>
                    <h4 style="margin:0 0 12px; color:#0B5DAA; font-size:14px; text-transform:uppercase; letter-spacing:1px; border-bottom:1px solid #dbeafe; padding-bottom:4px;">${t('rep_tech_details')}</h4>
                    <p style="margin:4px 0; font-size:15px;"><strong>${t('rep_name')}:</strong> ${techName}</p>
                    <p style="margin:4px 0; font-size:15px;"><strong>${t('rep_phone')}:</strong> ${techPhone}</p>
                    <p style="margin:4px 0; font-size:15px;"><strong>${t('rep_workshop')}:</strong> ${dealerName}</p>
                    <p style="margin:4px 0; font-size:15px;"><strong>${t('rep_location')}:</strong> ${city}, ${state}</p>
                </div>
                <div>
                    <h4 style="margin:0 0 12px; color:#0B5DAA; font-size:14px; text-transform:uppercase; letter-spacing:1px; border-bottom:1px solid #dbeafe; padding-bottom:4px;">${t('rep_veh_details')}</h4>
                    <p style="margin:4px 0; font-size:15px;"><strong>${t('rep_reg_no')}:</strong> ${vehReg}</p>
                    <p style="margin:4px 0; font-size:15px;"><strong>Vehicle Manufacturer:</strong> ${esc(vehicleManufacturer)}</p>
                    <p style="margin:4px 0; font-size:15px;"><strong>${t('rep_model')}:</strong> ${vehModel}</p>
                    <p style="margin:4px 0; font-size:15px;"><strong>${t('rep_odometer')}:</strong> ${odometer} km</p>
                    <p style="margin:4px 0; font-size:15px;"><strong>${t('rep_chassis')}:</strong> ${chassisNo}</p>
                </div>
            </div>
            
            <div style="margin-top:24px; background:#fff; border:1px solid #dbeafe; border-radius:10px; padding:16px;">
                <div class="report-grid" style="display:grid; grid-template-columns: 1fr 1fr; gap:24px;">
                    <div>
                        <h4 style="margin:0 0 12px; color:#64748b; font-size:12px; text-transform:uppercase;">${t('rep_diag_summary')}</h4>
                        <p style="margin:4px 0; font-size:16px;"><strong>${t('rep_outcome')}:</strong> <span style="background:${outcomeBg}; color:${outcomeColor}; padding:2px 8px; border-radius:4px; font-weight:800;">${displayOutcome}</span></p>
                        <p style="margin:4px 0; font-size:14px; color:#64748b;"><strong>${t('rep_duration')}:</strong> ${elapsedTimeText}</p>
                        <p style="margin:4px 0; font-size:14px; color:#64748b;"><strong>${t('rep_date')}:</strong> ${date}</p>
                    </div>
                    <div>
                        <h4 style="margin:0 0 12px; color:#64748b; font-size:12px; text-transform:uppercase;">${detailLabel}</h4>
                        ${faultHtml}
                    </div>
                </div>
            </div>
        </div>
        ${odoRecommendationHtml}
        
        <h4 style="margin:0 0 12px; color:#0f172a; font-weight:700;">${t('rep_step_history')}</h4>
        <div class="table-wrapper" style="overflow:hidden; border:1px solid #e2e8f0; border-radius:10px;">
            <table style="width:100%; border-collapse:collapse; font-size:14px;">
                <thead>
                    <tr style="background:#f1f5f9;">
                        <th style="padding:12px; border-bottom:2px solid #e2e8f0; text-align:center; color:#475569; width:50px; white-space:nowrap;">#</th>
                        <th style="padding:12px; border-bottom:2px solid #e2e8f0; text-align:left; color:#475569;">${t('rep_diag_question')}</th>
                        <th style="padding:12px; border-bottom:2px solid #e2e8f0; text-align:left; color:#475569; width:100px; white-space:nowrap;">${t('rep_response')}</th>
                        <th style="padding:12px; border-bottom:2px solid #e2e8f0; text-align:center; color:#475569; width:100px; white-space:nowrap;">Evidence</th>
                    </tr>
                </thead>
                <tbody>
                    ${stepRows}
                </tbody>
            </table>
        </div>
        
        <div style="margin-top:30px; text-align:center; color:#94a3b8; font-size:12px; border-top:1px dashed #e2e8f0; padding-top:20px;">
            ${t('rep_generated_by')}
        </div>
    `;

    // Visual Transition
    if (guidedFlowCard) hide(guidedFlowCard);

    // Toggle Retry button visibility
    const retryBtn = document.getElementById("retryBtn");
    if (retryBtn) {
      retryBtn.style.display = isSuccess ? 'none' : 'inline-block';
    }

    // Ensure result card is visible
    if (resultCard) {
      show(resultCard);
      resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // Auto trigger print removed to allow user manual control
  }

  window.refreshGeneratedReport = function () {
    if (lastGuidedReportArgs && document.getElementById('resultCard')?.classList.contains('active')) {
      generateGuidedReport(lastGuidedReportArgs.outcome, lastGuidedReportArgs.failedReason, false);
    }
  };

  function renderStep(step) {
    if (!step) return;
    const isBs4 = window.SELECTED_EMISSION === 'BS-IV';
    const bs4Questions = {
      yellow: 'Is Yellow (Vehicle Speed digital signal) present? (Check frequency: should be > 15 Hz while wheels rotate)',
      sb_bypass_check: 'Is Yellow/White (vehicle speed) reaching the Speed Booster bypass and continuing as Yellow/White to the ECU Speed Box?',
      sb_yellow_path: 'Check continuity between Customer Mating Connector (Yellow wire) and Speed Box Booster connector (Yellow wire). Is it OK?'
    };
    const bsviQuestions = {
      yellow: 'Is Yellow/White (Vehicle Speed digital signal) present? (Check frequency: should be > 15 Hz while wheels rotate)',
      sb_grey_pulses: 'With wheels rotating (>5 km/h), are Yellow/White speed pulses present at the ECU Speed Box input? (Check frequency: should be > 15 Hz)',
      sb_bypass_check: 'Is the Yellow/White speed signal reaching the ECU Speed Box input?',
      sb_yellow_path: 'Check continuity between the Customer Mating Connector Yellow/White wire and the ECU Speed Box connector. Is it OK?',
      sb_violet_output: 'With Green=24V, Black=GND and Yellow/White speed pulses present, when vehicle speed > 5 km/h does ECU Speed Box output (Violet) go to 24V?'
    };
    const isBsvi = window.SELECTED_EMISSION === 'BS-VI';
    const displayQuestion = isBs4 && bs4Questions[step.key]
      ? bs4Questions[step.key]
      : isBsvi && bsviQuestions[step.key]
        ? bsviQuestions[step.key]
        : step.q;
    // Use bilingual translation if available, else fallback to step.q
    if (typeof bi === 'function') {
      const translated = bi(step.key);
      // If bi() returned the key itself (meaning no translation found), use original step.q
      stepQA.innerHTML = (translated === step.key || isBs4 && bs4Questions[step.key] || isBsvi && bsviQuestions[step.key]) ? displayQuestion : translated;
    } else {
      stepQA.innerHTML = displayQuestion;
    }

    // Show ECU Speed Box popup only for Grey and Violet wire checking steps
    // On Retarder Switch (wf-switch), it will show after location modal closes
    const stepKey = (step.key || '').toLowerCase();
    if (stepKey.includes('grey') || stepKey.includes('violet')) {
      const ecuSpeedPopup = document.getElementById('ecuSpeedPopup');
      const sectionKey = stepToRibbon[step.key];
      // Don't show immediately on wf-switch; it will show after location modal closes
      if (sectionKey !== 'wf-switch' && ecuSpeedPopup) {
        ecuSpeedPopup.classList.remove('hidden');
      }
    }

    // Progress bar: use the high-level section index (1 of 6, etc)
    const section = stepToRibbon[step.key];
    const info = SECTION_INFO[section];
    if (info) {
      const pct = Math.round((info.stepIndex / 6) * 100);
      stepProgressBarEnhanced.style.width = pct + "%";
    }
    stepResult.className = "step-result-enhanced"; // hide
    // Enable buttons
    stepBtnYes.disabled = false;
    stepBtnNo.disabled = false;

    // Toggle Back button visibility (Secondary button in header)
    const stepBtnBack = document.getElementById("stepBtnBack");
    if (stepBtnBack) {
      stepBtnBack.style.display = guidedHistory.length > 0 ? "inline-block" : "none";
      if (!stepBtnBack.onclick) {
        stepBtnBack.onclick = handleBack;
      }
    }

    // MutationObserver moved to init block below — created ONCE, not on every renderStep call.

    // --- wf-node status update logic ---
    const currentSection = stepToRibbon[step.key];
    if (currentSection) {
      updateNodeStatus(step.key);
      updateRibbonPercentage(currentSection);
    }

    // --- Badge Highlight Logic ---
    renderBadgesForSection(section);
    updateBadges(step.key);

    // --- Live Wiring Visual ---
    if (section && typeof window.updateWiringVisual === 'function') {
      window.updateWiringVisual(section);
    }

    // --- Header & Step Counter Logic ---
    updateSectionHeader(section);

    if (renderChannelCheck(step)) return;
  }

  function renderChannelCheck(step) {
    const configs = {
      aps_output_check: { label: 'Air Pressure Switch', item: 'switch', prompt: 'Does this pressure-switch channel show 24V output when the brake is pressed?' },
      rb_energization: { label: 'Relay', item: 'relay', prompt: 'Does this relay energize/click when positive, ground, and signal are present?' }
    };
    const config = configs[step.key];
    if (!config || window._channelChecks?.[step.key]?.completed) {
      stepBtnYes.style.display = '';
      stepBtnNo.style.display = '';
      return false;
    }

    stepBtnYes.style.display = 'none';
    stepBtnNo.style.display = 'none';
    const buttonStyle = 'border:1px solid #bfdbfe;background:#eff6ff;color:#0b5daa;padding:12px;border-radius:9px;font-weight:700;cursor:pointer;';
    stepQA.innerHTML = `<div style="font-weight:700;margin-bottom:12px;">Which ${config.item} are you testing?</div><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;"><button type="button" data-channel-mode="single" data-channel="1" style="${buttonStyle}">${config.label} 1</button><button type="button" data-channel-mode="single" data-channel="2" style="${buttonStyle}">${config.label} 2</button><button type="button" data-channel-mode="single" data-channel="3" style="${buttonStyle}">${config.label} 3</button><button type="button" data-channel-mode="single" data-channel="4" style="${buttonStyle}">${config.label} 4</button><button type="button" data-channel-mode="all" style="${buttonStyle}grid-column:1/-1;">Test all ${config.item}s</button><button type="button" data-channel-mode="skip" style="border:1px solid #cbd5e1;background:#f8fafc;color:#475569;padding:12px;border-radius:9px;font-weight:700;cursor:pointer;grid-column:1/-1;">Skip with reason</button></div>`;
    stepQA.querySelectorAll('[data-channel-mode]').forEach(button => button.addEventListener('click', () => {
      const mode = button.dataset.channelMode;
      if (mode === 'skip') {
        const reason = window.prompt(`Why are you skipping the ${config.label} check?`);
        if (!reason?.trim()) return;
        window._channelChecks[step.key] = { mode: 'skip', reason: reason.trim(), results: [], completed: true };
        handleAnswer(false);
        return;
      }
      const channels = mode === 'all' ? [1, 2, 3, 4] : [Number(button.dataset.channel)];
      askChannel(config, step, channels, 0, []);
    }));
    return true;
  }

  function askChannel(config, step, channels, index, results) {
    const channel = channels[index];
    const buttonStyle = 'padding:12px;border-radius:9px;font-weight:700;cursor:pointer;';
    stepQA.innerHTML = `<div style="font-weight:700;margin-bottom:12px;">${config.label} ${channel} of ${channels.length}</div><div style="margin-bottom:14px;">${config.prompt}</div><div style="display:flex;gap:10px;"><button type="button" data-channel-answer="yes" style="flex:1;border:1px solid #86efac;background:#dcfce7;color:#166534;${buttonStyle}">Yes — Working</button><button type="button" data-channel-answer="no" style="flex:1;border:1px solid #fca5a5;background:#fee2e2;color:#991b1b;${buttonStyle}">No — Fault</button></div>`;
    stepQA.querySelectorAll('[data-channel-answer]').forEach(button => button.addEventListener('click', () => {
      results.push({ channel, response: button.dataset.channelAnswer === 'yes' ? 'Yes' : 'No', passed: button.dataset.channelAnswer === 'yes' });
      if (index + 1 < channels.length) {
        askChannel(config, step, channels, index + 1, results);
        return;
      }
      window._channelChecks[step.key] = { mode: channels.length === 4 ? 'all' : 'affected-channel', results, completed: true };
      handleAnswer(results.every(result => result.passed));
    }));
  }

  window.showLocationHelp = showLocationHelp;

  // Define Section Metadata
  const SECTION_INFO = {
    'wf-conn': {
      stepIndex: 1,
      title: 'Step 1 — Customer Mating Connector',
      subtitle: 'Test the main power and signal connections',
      note: '<strong>💡 BSVI Vehicle Connector Color Code:</strong><br>Black = Negative &nbsp;|&nbsp; Yellow/White = Speed Signal &nbsp;|&nbsp; Green = Positive* &nbsp;|&nbsp; Green/White = MB Indicator.<br><strong>*Positive:</strong> 24V positive from the 3rd braking (ABS 3rd relay) positive.',
      locationImg: 'asset/optimized/customermatingconnector.jpg',
      locationDesc: 'Located near the retarder assembly on the left side, inside the wiring tray.',
      connType: '4 Pin Male (Customer-mating connector in signal wiring harness)'
    },
    'wf-speed': {
      stepIndex: 2,
      title: 'Step 2 — ECU Speed Box',
      subtitle: 'Check power input, ground, and speed signal processing',
      note: '<strong>💡 ECU Speed Box Logic:</strong> The ECU Speed Box validates vehicle speed and enables the retarder only when speed exceeds 5 km/h.<br>It prevents retarder activation at standstill or very low speed.',
      locationImg: 'asset/optimized/ecuspeedbox.jpg',
      locationDesc: 'Mounted on the Right‑hand inner chassis frame behind the front engine area.',
      connType: '4 Pin Female (ECU Speed Box) / 4 Pin Male & Female (Booster Bypass)'
    },
    'wf-switch': {
      stepIndex: 3,
      title: 'Step 3 — Retarder Switch',
      subtitle: 'Verify dashboard switch request signal',
      note: '<strong>💡 Switch Logic:</strong> The dashboard retarder switch acts as an enable gate. When turned ON, it passes the 24V output from the ECU Speed Box to the Air Pressure Switch.',
      locationImg: 'asset/optimized/retarderswitch.jpg',
      locationDesc: 'Located on the dashboard panel to the right of the steering wheel.',
      connType: '8 Pin Female (Switch) / 2 x 1 Pin Female (Indicator)'
    },
    'wf-aps': {
      stepIndex: 4,
      title: 'Step 4 — Air Pressure Switch',
      subtitle: 'Check pneumatic pressure confirmation signal',
      note: '<strong>💡 Safety Cut-off:</strong> The Air Pressure Switch converts brake air pressure into electrical signals to activate the retarder in stages.<br>Without air pressure input, the retarder will not function.',
      locationImg: 'asset/optimized/aps.jpg',
      locationDesc: 'Mounted on the Right‑hand inner chassis frame, below the DBV area. Positioned horizontally on the pressure manifold block. Easily identifiable by the multiple pressure switches arranged in a row on the manifold.',
      connType: '6 Pin Female'
    },
    'wf-relay': {
      stepIndex: 5,
      title: 'Step 5 — Relay Box',
      subtitle: 'Verify relay actuation and power output',
      note: '<strong>💡 Power Stage:</strong> The Relay Box switches high-current battery power to the retarder coils based on low-current stage signals from the Air Pressure Switch.',
      locationImg: 'asset/optimized/relaybox.jpg',
      locationDesc: 'Mounted on the left‑hand longitudinal chassis frame member, positioned externally along the side frame. Installed next left to the retarder assembly. Includes the main relay box and an ON/OFF toggle switch located on the right side of the relay box.',
      connType: '8 Pin Male'
    },
    'wf-retarder': {
      stepIndex: 6,
      title: 'Step 6 — Retarder Unit',
      subtitle: 'Check final coil resistance and ground',
      note: '<strong>💡 Retarder Logic:</strong> A retarder provides auxiliary braking to reduce vehicle speed without using the service (friction) brakes.',
      locationImg: 'asset/optimized/retarderassy.jpg',
      locationDesc: 'The main retarder unit mounted on the drive shaft/transmission output.',
      connType: 'N/A (Coil connections)'
    },
    'wf-triage': {
      stepIndex: 1,
      title: '⚡ Quick 3-Point Triage',
      subtitle: 'Fast fault isolation — covers 80% of cases in < 5 min',
      note: '<strong>⚡ Quick Triage Logic:</strong> Tests the 3 most critical power checkpoints in sequence. If a fault is found, you get the part to replace immediately. If all pass, switch to NOT WORKING mode for full diagnosis.'
    },
    'wf-intermittent': {
      stepIndex: 1,
      title: '🔁 Intermittent Fault Check',
      subtitle: 'Targeted checks for connectors, harness and ground',
      note: '<strong>🔁 Intermittent Tip:</strong> Most intermittent retarder faults are caused by connector vibration, pin corrosion, or high ground resistance — not component failure. Check these first before replacing parts.'
    }
  };

  let currentHeaderSection = null;
  let currentHeaderLang = null;

  function updateSectionHeader(sectionKey) {
    const activeLang = (typeof getLang === 'function') ? getLang() : 'en';
    if (currentHeaderSection === sectionKey && currentHeaderLang === activeLang) return;
    currentHeaderSection = sectionKey;
    currentHeaderLang = activeLang;

    const info = SECTION_INFO[sectionKey];
    if (!info) return;

    // Update Step Counter
    const counterEl = document.getElementById('stepCurrentNo');
    if (counterEl) counterEl.textContent = info.stepIndex;

    // Update Header Title
    const headerEl = document.querySelector('.step-header-enhanced h2');
    if (headerEl) {
      if (typeof bi === 'function') {
        const tTitle = bi(sectionKey + '_title');
        headerEl.textContent = (tTitle === sectionKey + '_title') ? info.title : tTitle;
      } else {
        headerEl.textContent = info.title;
      }
    }

    // Update Subtitle
    const subEl = document.querySelector('.step-subtitle');
    if (subEl) {
      if (typeof bi === 'function') {
        const tSub = bi(sectionKey + '_subtitle');
        subEl.textContent = (tSub === sectionKey + '_subtitle') ? info.subtitle : tSub;
      } else {
        subEl.textContent = info.subtitle;
      }
    }

    // Update Info Note
    const noteEl = document.querySelector('.step-note-enhanced');
    if (noteEl && info.note) {
      if (sectionKey === 'wf-conn' && window.SELECTED_EMISSION === 'BS-IV') {
        noteEl.innerHTML = '<strong>💡 MB Indicator (Red/Yellow):</strong> It glows only when the full system is working. Supply comes from backlight fuse block.';
      } else if (typeof bi === 'function') {
        const tNote = bi(sectionKey + '_note');
        noteEl.innerHTML = (tNote === sectionKey + '_note') ? info.note : tNote;
      } else {
        noteEl.innerHTML = info.note;
      }
    }

    // --- Location Helper Logic ---
    // 1. Auto-show location modal on first entry to this section
    // (Use a flag or check if we already showed it for this section to avoid annoyance if re-rendering)
    if (!window._hasShownLocFor) window._hasShownLocFor = {};

    // Check for splash screen: do not auto-show if splash is visible
    const splashEl = document.getElementById('splash');
    const isSplashActive = splashEl && !splashEl.classList.contains('hide');

    // NEW: Also check if the wizard card itself is visible to prevent 
    // modals popping up during a background reset (like clicking 'New Diagnostic')
    const wizardCard = document.getElementById('guidedFlowCard');
    const isWizardVisible = wizardCard && wizardCard.classList.contains('active') && wizardCard.style.display !== 'none';

    if (!window._hasShownLocFor[sectionKey] && !isSplashActive && isWizardVisible) {
      showLocationHelp(sectionKey);
      window._hasShownLocFor[sectionKey] = true;
    }

    // 2. Add/Update "Show Location" button in header
    // Check if button exists, if not add it to .header-actions
    const headerActions = document.querySelector('.header-actions');
    if (headerActions) {
      let btn = document.getElementById('btnShowLoc');
      if (!btn) {
        btn = document.createElement('button');
        btn.id = 'btnShowLoc';
        btn.className = 'header-action-btn';
        btn.onclick = () => showLocationHelp(currentHeaderSection);

        // Prepend to headerActions so it comes before the Back button
        headerActions.prepend(btn);
      }
      btn.innerHTML = '<span>📍</span> ' + (typeof bi === 'function' ? bi('show_location') : 'Show Location');
    }

    // Auto-scroll wireflow to active node
    setTimeout(() => {
      const activeNode = document.getElementById(sectionKey);
      const wireFlowContainer = document.getElementById('wireFlow');
      if (activeNode && wireFlowContainer) {
        // Calculate offset to center the node wrapper
        const wrapper = activeNode.closest('.wf-node-wrap') || activeNode;
        const scrollLeft = wrapper.offsetLeft - (wireFlowContainer.clientWidth / 2) + (wrapper.clientWidth / 2);
        wireFlowContainer.scrollTo({ left: scrollLeft, behavior: 'smooth' });
      }
    }, 50);
  }

  // Helper: Open Location Modal
  function showLocationHelp(sectionKey, overrideInfo = null) {
    const info = overrideInfo || SECTION_INFO[sectionKey];
    if (!info || !info.locationImg) return; // No location info available

    const modal = document.getElementById('locationHelpModal');
    const title = document.getElementById('locHelpTitle');
    const img = document.getElementById('locHelpImg');
    const desc = document.getElementById('locHelpDesc');
    const conn = document.getElementById('locHelpConn');
    const closeBtn = document.getElementById('locHelpClose');

    if (modal && title && img && desc) {
      const translatedTitle = overrideInfo?.title || (typeof t === 'function' ? t(sectionKey + '_title') : info.title);
      const titleSuffix = typeof t === 'function' ? t('loc_helper_title_suffix') : " Location";
      title.textContent = translatedTitle + titleSuffix;
      img.src = info.locationImg;

      const isBs4Connector = sectionKey === 'wf-conn' && window.SELECTED_EMISSION === 'BS-IV';
      const bs4Location = 'Located behind the dashboard instrument cluster. Remove the instrument cluster panel to access the dashboard cavity. The 4-pin customer-mating socket will be found inside the cavity along the main wiring harness routed through the circular opening at the rear side of the dashboard.';
      const locationKey = sectionKey + '_loc';
      const locationTranslation = typeof t === 'function' ? t(locationKey) : '';
      const translatedLoc = isBs4Connector
        ? bs4Location
        : (locationTranslation && locationTranslation !== locationKey ? locationTranslation : info.locationDesc);
      const fallbackLoc = typeof t === 'function' ? t('loc_manual_hint') : "Consult service manual for precise location.";
      desc.textContent = translatedLoc || fallbackLoc;

      // Connector Info
      if (conn && info.connType) {
        conn.style.display = 'block';
        const connLabel = typeof t === 'function' ? t('conn_type_label') : '🔌 Connector Type:';
        const connVal = isBs4Connector ? '4 Pin Male (Customer-mating connector in signal wiring harness)' : (typeof t === 'function' ? t(sectionKey + '_conn') : info.connType);
        conn.innerHTML = `<strong>${connLabel}</strong> ${connVal}`;
      } else if (conn) {
        conn.style.display = 'none';
      }

      modal.classList.remove('hidden');
      modal.style.display = 'flex';

      // One-time bind for close
      closeBtn.onclick = () => {
        modal.classList.add('hidden');
        setTimeout(() => {
          modal.style.display = 'none';
          
          // After location modal closes, show speed popup if current step is Grey or Violet
          const currentStep = getCurrentStep();
          if (currentStep) {
            const stepKey = (currentStep.key || '').toLowerCase();
            if (stepKey.includes('grey') || stepKey.includes('violet')) {
              const ecuSpeedPopup = document.getElementById('ecuSpeedPopup');
              if (ecuSpeedPopup) {
                ecuSpeedPopup.classList.remove('hidden');
              }
            }
          }
        }, 300);
      };
    }
  }

  // Define Badge Sets per Section
  const SECTION_BADGES = {
    'wf-conn': [
      { id: 'badge-green', label: (typeof bi === 'function' ? bi('green_label') : 'Green +24V'), icon: '🟢', key: 'green' },
      { id: 'badge-black', label: (typeof bi === 'function' ? bi('black_label') : 'Black Negative'), icon: '⚫', key: 'black' },
      { id: 'badge-yellow', label: (typeof bi === 'function' ? bi('yellow_label') : 'Yellow/White Speed Signal'), icon: '🟡', key: 'yellow' },
      { id: 'badge-mb', label: 'Green/White MB Indicator', icon: '', key: 'mb' }
    ],
    'wf-speed': [
      { id: 'badge-sb-green', label: (typeof bi === 'function' ? bi('sb_green_label') : 'Input +24V'), icon: '🟢', key: 'sb_green' },
      { id: 'badge-sb-black', label: (typeof bi === 'function' ? bi('sb_black_label') : 'Input GND'), icon: '⚫', key: 'sb_black' },
      { id: 'badge-sb-grey', label: (typeof bi === 'function' ? bi('sb_grey_label') : 'Speed Out'), icon: '⚪', key: 'sb_grey_pulses' },
      { id: 'badge-sb-violet', label: (typeof bi === 'function' ? bi('sb_violet_label') : 'Output +24V'), icon: '🟣', key: 'sb_violet_output' }
    ],
    'wf-switch': [
      { id: 'badge-sw-violet', label: (typeof bi === 'function' ? bi('sw_violet_label') : 'Violet In'), icon: '🟣', key: 'sw_violet_input' },
      { id: 'badge-sw-pink', label: (typeof bi === 'function' ? bi('sw_pink_label') : 'Pink Out'), icon: '🩷', key: 'sw_pink_output' }
    ],
    'wf-aps': [
      { id: 'badge-aps-pin1', label: (typeof bi === 'function' ? bi('aps_pin1_label') : 'Pink In'), icon: '🩷', key: 'aps_pin1_input' },
      { id: 'badge-aps-supply', label: (typeof bi === 'function' ? bi('aps_supply_label') : 'Common Supply'), icon: '⚡', key: 'aps_internal_supply' },
      { id: 'badge-aps-output', label: (typeof bi === 'function' ? bi('aps_output_label') : 'Pressure Out'), icon: '💨', key: 'aps_output_check' }
    ],
    'wf-relay': [
      { id: 'badge-rb-conn', label: (typeof bi === 'function' ? bi('rb_conn_label') : '8-Pin Conn'), icon: '🔌', key: 'rb_precheck_seated' },
      { id: 'badge-rb-cutoff', label: (typeof bi === 'function' ? bi('rb_cutoff_label') : 'Cut-off Sw'), icon: '⚡', key: 'rb_cutoff_pos' },
      { id: 'badge-rb-ground', label: (typeof bi === 'function' ? bi('rb_ground_label') : 'Ground'), icon: '⚫', key: 'rb_verify_ground' },
      { id: 'badge-rb-internal', label: (typeof bi === 'function' ? bi('rb_internal_label') : 'Internal Relay'), icon: '🧠', key: 'rb_energization' }
    ],
    'wf-retarder': [
      { id: 'badge-ret-conn', label: (typeof bi === 'function' ? bi('ret_conn_label') : 'MB Connector'), icon: '🔌', key: 'ret_mb_check' },
      { id: 'badge-ret-coil', label: (typeof bi === 'function' ? bi('ret_coil_label') : 'Isolator earth terminal'), icon: '🌀', key: 'ret_coil_ground_check' }
    ]
  };

  let currentRenderedSection = null;
  let currentRenderedLang = null;

  const BADGE_LABEL_META = {
    'badge-green': { key: 'green_label', fallback: 'Green +24V' },
    'badge-black': { key: 'black_label', fallback: 'Black Negative' },
    'badge-yellow': { key: 'yellow_label', fallback: 'Yellow/White Speed Signal' },
    'badge-mb': { key: 'mb_indicator', fallback: 'Green/White MB Indicator' },
    'badge-sb-green': { key: 'sb_green_label', fallback: 'Input +24V' },
    'badge-sb-black': { key: 'sb_black_label', fallback: 'Input GND' },
    'badge-sb-grey': { key: 'sb_grey_label', fallback: 'Speed Out' },
    'badge-sb-violet': { key: 'sb_violet_label', fallback: 'Output +24V' },
    'badge-sw-violet': { key: 'sw_violet_label', fallback: 'Violet In' },
    'badge-sw-pink': { key: 'sw_pink_label', fallback: 'Pink Out' },
    'badge-aps-pin1': { key: 'aps_pin1_label', fallback: 'Pink In' },
    'badge-aps-supply': { key: 'aps_supply_label', fallback: 'Common Supply' },
    'badge-aps-output': { key: 'aps_output_label', fallback: 'Pressure Out' },
    'badge-rb-conn': { key: 'rb_conn_label', fallback: '8-Pin Conn' },
    'badge-rb-cutoff': { key: 'rb_cutoff_label', fallback: 'Cut-off Sw' },
    'badge-rb-ground': { key: 'rb_ground_label', fallback: 'Ground' },
    'badge-rb-internal': { key: 'rb_internal_label', fallback: 'Internal Relay' },
    'badge-ret-conn': { key: 'ret_conn_label', fallback: 'MB Connector' },
    'badge-ret-coil': { key: 'ret_coil_label', fallback: 'Isolator earth terminal' }
  };

  function getBadgeLabel(badgeId, fallback) {
    const meta = BADGE_LABEL_META[badgeId];
    if (!meta) return fallback || '';
    if (window.SELECTED_EMISSION === 'BS-IV') {
      if (badgeId === 'badge-green') return 'Green +24V';
      if (badgeId === 'badge-black') return 'Ground';
      if (badgeId === 'badge-yellow') return 'Speed Signal';
      if (badgeId === 'badge-mb') return 'MB Indicator';
    }
    if (window.SELECTED_EMISSION === 'BS-VI' && badgeId === 'badge-sb-grey') return 'Yellow/White Speed Signal';
    if (typeof bi === 'function') {
      const translated = bi(meta.key);
      if (translated !== meta.key) return translated;
    }
    return meta.fallback || fallback || '';
  }

  function renderBadgesForSection(sectionKey) {
    const activeLang = (typeof getLang === 'function') ? getLang() : 'en';
    if (currentRenderedSection === sectionKey && currentRenderedLang === activeLang) return; // No need to re-render
    currentRenderedSection = sectionKey;
    currentRenderedLang = activeLang;

    const badgeContainer = document.querySelector('.step-badges-enhanced');
    if (!badgeContainer) return;
    badgeContainer.innerHTML = ''; // Clear

    const badges = SECTION_BADGES[sectionKey] || [];
    badges.forEach(b => {
      const item = document.createElement('div');
      item.className = 'badge-item';

      let iconHtml = `<span id="${b.id}" class="step-badge-enhanced">${b.icon}</span>`;

      // Special override for MB Indicator
      if (b.key === 'mb') {
        const mbBackground = window.SELECTED_EMISSION === 'BS-IV'
          ? 'linear-gradient(135deg, #ef4444 50%, #eab308 50%)'
          : 'linear-gradient(to bottom, #22c55e 0 35%, #ffffff 35% 65%, #22c55e 65% 100%)';
        iconHtml = `<span id="${b.id}" class="step-badge-enhanced"
                style="background: ${mbBackground}; width: 24px; height: 24px; display: inline-block; border-radius: 50%; border: 1px solid rgba(0,0,0,0.1);"></span>`;
      } else if (window.SELECTED_EMISSION === 'BS-VI' && (b.id === 'badge-yellow' || b.id === 'badge-sb-grey')) {
        iconHtml = `<span id="${b.id}" class="step-badge-enhanced"
                style="background: linear-gradient(to bottom, #facc15 0 35%, #ffffff 35% 65%, #facc15 65% 100%); width: 24px; height: 24px; display: inline-block; border-radius: 50%; border: 1px solid rgba(0,0,0,0.1);"></span>`;
      } else if (b.id === 'badge-sw-pink' || b.id === 'badge-aps-pin1') {
        iconHtml = `<span id="${b.id}" class="step-badge-enhanced"
                style="background: #ff69b4; width: 20px; height: 20px; display: inline-block; border-radius: 50%; border: 1px solid rgba(0,0,0,0.1);"></span>`;
      }

      item.innerHTML = `
        ${iconHtml}
        <span class="badge-label">${getBadgeLabel(b.id, b.label)}</span>
      `;
      badgeContainer.appendChild(item);
    });
  }

  // Update stepToBadge map to include new keys dynamically or statically
  // For simplicity, we make the mapping function dynamic or just expand this object
  const stepToBadgeMap = {
    // WF-CONN (C1)
    green: "badge-green",
    green_fuse: "badge-green",
    green_abs3: "badge-green",
    green_vehicle_conn: "badge-green",
    black: "badge-black",
    yellow: "badge-yellow",

    // WF-SPEED (SB)
    sb_green: "badge-sb-green",
    sb_green_c1: "badge-sb-green",
    sb_green_continuity_fix: "badge-sb-green",
    sb_green_vehicle_power_fix: "badge-sb-green",

    sb_black: "badge-sb-black",
    sb_black_c1: "badge-sb-black",
    sb_black_continuity_fix: "badge-sb-black",
    sb_black_vehicle_ground_fix: "badge-sb-black",

    sb_yellow_path: "badge-sb-grey",
    sb_bypass_check: "badge-sb-grey",
    sb_grey_pulses: "badge-sb-grey",
    sb_violet_output: "badge-sb-violet",

    // WF-SWITCH (RS)
    sw_violet_input: "badge-sw-violet",
    sw_violet_continuity: "badge-sw-violet",
    sw_pink_output: "badge-sw-pink",

    // WF-APS
    aps_pin1_input: "badge-aps-pin1",
    aps_pin1_continuity: "badge-aps-pin1",
    aps_pin1_recheck: "badge-aps-pin1",
    aps_internal_supply: "badge-aps-supply",
    aps_output_check: "badge-aps-output",
    aps_hose_check: "badge-aps-output",

    // WF-RELAY
    rb_precheck_seated: "badge-rb-conn",
    rb_precheck_pins: "badge-rb-conn",
    rb_cutoff_pos: "badge-rb-cutoff",
    rb_cutoff_output: "badge-rb-cutoff",
    rb_cutoff_input: "badge-rb-cutoff",
    rb_battery_check: "badge-rb-cutoff",
    rb_verify_ground: "badge-rb-ground",
    rb_ground_contact: "badge-rb-ground",
    rb_negative_cable_condition: "badge-rb-ground",
    rb_aps_signal_check: "badge-rb-internal",
    rb_energization: "badge-rb-internal",
    rb_output_check: "badge-rb-internal",
    rb_fuse_check: "badge-rb-internal",
    rb_final_confirmation: "badge-rb-internal",

    // WF-RETARDER
    ret_mb_check: "badge-ret-conn",
    ret_coil_resistance: "badge-ret-coil",
    ret_coil_ground_check: "badge-ret-coil",
    ret_power_voltage_check: "badge-ret-coil"
  };

  function updateBadges(currentKey) {
    const activeBadgeId = stepToBadgeMap[currentKey];

    // 1. Reset all active states
    document.querySelectorAll('.badge-item').forEach(b => {
      b.classList.remove('badge-active');
      b.style.opacity = '0.7';
    });

    // 2. Highlight current
    if (activeBadgeId) {
      const activeBadge = document.getElementById(activeBadgeId);
      if (activeBadge) {
        activeBadge.closest('.badge-item').classList.add('badge-active');
        activeBadge.closest('.badge-item').style.opacity = '1';
      }
    }

    // 3. Update Statuses based on answers
    // WF-CONN
    checkBadgeStatus('green', 'badge-green');
    checkBadgeStatus('black', 'badge-black');
    checkBadgeStatus('yellow', 'badge-yellow');

    // WF-SPEED
    checkBadgeStatus('sb_green', 'badge-sb-green');
    checkBadgeStatus('sb_black', 'badge-sb-black');
    // For complex multi-step like grey, we check final success step
    checkBadgeStatus('sb_grey_pulses', 'badge-sb-grey');
    checkBadgeStatus('sb_violet_output', 'badge-sb-violet');

    // WF-SWITCH
    checkBadgeStatus('sw_violet_input', 'badge-sw-violet');
    checkBadgeStatus('sw_pink_output', 'badge-sw-pink');
    // BUG-003 FIX: sw_continuity and sw_pink_continuity are phantom keys;
    // correct key is sw_violet_continuity, badge is badge-sw-violet (handled above).
  }

  function checkBadgeStatus(stepKey, badgeId) {
    if (window._stepAnswers[stepKey] === true) updateBadgeIcon(badgeId, 'pass');
    else if (window._stepAnswers[stepKey] === false) updateBadgeIcon(badgeId, 'fail');
  }

  function updateBadgeIcon(id, status) {
    const el = document.getElementById(id);
    if (!el) return;

    if (status === 'pass') {
      el.textContent = '✅';
      el.className = 'step-badge-enhanced';
      // clear custom styles if any (like MB indicator) override
      el.removeAttribute('style');
    } else if (status === 'fail') {
      el.textContent = '❌';
      el.className = 'step-badge-enhanced';
      el.removeAttribute('style');
    }
  }

  // Update ribbon node with percentage for a section
  function updateRibbonPercentage(section) {
    const node = document.getElementById(section);
    if (!node) return;

    // Get "Main Steps" from SECTION_BADGES if available, otherwise fallback to getSectionSteps
    let mainStepKeys = [];
    if (SECTION_BADGES[section]) {
      // For progress, we only count items that have a specific key (excluding utility badges like 'mb' if desired)
      // but for now let's count all that are defined in badges
      mainStepKeys = SECTION_BADGES[section]
        .filter(b => b.key && b.key !== 'mb') // exclude the MB Indicator from percentage calculation
        .map(b => b.key);
    } else {
      // Fallback if section not explicitly defined in SECTION_BADGES
      mainStepKeys = getSectionSteps(section);
    }

    if (mainStepKeys.length === 0) return;

    // Count how many are completed (passed)
    let completed = 0;
    for (const key of mainStepKeys) {
      if (window._stepAnswers && window._stepAnswers[key] === true) completed++;
    }

    const percent = Math.round((completed / mainStepKeys.length) * 100);
    // Add or update a child span for percent
    let percentSpan = node.querySelector('.ribbon-percent');
    if (!percentSpan) {
      percentSpan = document.createElement('span');
      percentSpan.className = 'ribbon-percent';
      percentSpan.style.position = 'absolute';
      percentSpan.style.bottom = '2px';
      percentSpan.style.right = '6px';
      percentSpan.style.fontSize = '13px';
      percentSpan.style.fontWeight = 'bold';
      percentSpan.style.color = '#0B5DAA';
      percentSpan.style.background = 'rgba(255,255,255,0.95)';
      percentSpan.style.padding = '1px 6px';
      percentSpan.style.borderRadius = '8px';
      percentSpan.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
      node.style.position = 'relative';
      node.appendChild(percentSpan);
    }
    percentSpan.textContent = percent + '%';

    // Update global section status if verified
    if (percent === 100) {
      sectionStatus[section] = "completed";
      const statusEl = document.getElementById(section + '-status');
      if (statusEl) statusEl.textContent = "Passed";
    }

    percentSpan.style.display = (percent > 0) ? 'block' : 'none';
  }

  // Calculate overall diagnostic progress (0-100)
  window.getDiagnosticProgress = function () {
    const sections = ["wf-conn", "wf-speed", "wf-switch", "wf-aps", "wf-relay", "wf-retarder"];
    let totalProgress = 0;

    sections.forEach(section => {
      let mainStepKeys = [];
      if (SECTION_BADGES[section]) {
        mainStepKeys = SECTION_BADGES[section]
          .filter(b => b.key && b.key !== 'mb') // exclude MB Indicator
          .map(b => b.key);
      } else {
        mainStepKeys = getSectionSteps(section);
      }

      if (mainStepKeys.length > 0) {
        let completed = 0;
        for (const key of mainStepKeys) {
          if (window._stepAnswers && window._stepAnswers[key] === true) completed++;
        }
        totalProgress += (completed / mainStepKeys.length);
      }
    });

    return Math.round((totalProgress / sections.length) * 100);
  };

  // Track section completion/fail state (all 6 sections initialised)
  const sectionStatus = {
    "wf-conn":     "pending",
    "wf-speed":    "pending",
    "wf-switch":   "pending",
    "wf-aps":      "pending",
    "wf-relay":    "pending",
    "wf-retarder": "pending",
  };

  // Helper: get all step keys for a section
  function getSectionSteps(section) {
    // For wf-conn (C1), only count the three main questions for progress
    if (section === 'wf-conn') {
      return ['green', 'black', 'yellow'];
    }
    return Object.entries(stepToRibbon)
      .filter(([key, val]) => val === section)
      .map(([key]) => key);
  }

  // Helper: update .wf-node class for each section
  function updateNodeStatus(currentStepKey) {
    // Determine which section is active
    const currentSection = stepToRibbon[currentStepKey];
    // Set all to neutral first
    ["wf-conn", "wf-speed", "wf-switch", "wf-aps", "wf-relay", "wf-retarder"].forEach(section => {
      const node = document.getElementById(section);
      const statusEl = document.getElementById(section + '-status');

      if (node) {
        node.classList.remove("testing", "completed", "fail", "pending");
        if (sectionStatus[section] === "fail") {
          node.classList.add("fail");
        } else if (section === currentSection) {
          node.classList.add("testing");
        } else if (sectionStatus[section] === "completed") {
          node.classList.add("completed");
        } else {
          node.classList.add("pending");
        }
      }

      if (statusEl) {
        statusEl.classList.remove("testing", "pass", "fail", "pending");
        if (sectionStatus[section] === "fail") {
          statusEl.classList.add("fail");
          statusEl.textContent = typeof t === 'function' ? t('fault_found') : "Fault Found";
        } else if (section === currentSection) {
          statusEl.classList.add("testing");
          statusEl.textContent = typeof t === 'function' ? t('testing') : "Testing...";
        } else if (sectionStatus[section] === "completed") {
          statusEl.classList.add("pass");
          statusEl.textContent = typeof t === 'function' ? t('pass') : "Passed";
        } else {
          statusEl.classList.add("pending");
          statusEl.textContent = typeof t === 'function' ? t('not_tested') : "Not Tested";
        }
      }
    });
  }

  // Helper: mark section completed or failed
  function markSectionStatus(section, status) {
    sectionStatus[section] = status;
    updateNodeStatus();
  }

  // Track answers for percentage calculation
  window._stepAnswers = window._stepAnswers || {};
  window._stepEvidence = window._stepEvidence || {};
  window._channelChecks = window._channelChecks || {};
  let guidedHistory = [];

  function handleAnswer(answerYes) {
    const step = getCurrentStep();
    const branch = answerYes ? step.onYes : step.onNo;
    const emissionReason = (reason) => window.SELECTED_EMISSION === 'BS-VI' && reason
      ? reason.replaceAll('Yellow/Grey', 'Yellow/White').replaceAll('Grey', 'Yellow/White').replaceAll('grey', 'Yellow/White')
      : reason;
    const branchReason = emissionReason(branch.reason);
    const branchTarget = branch.jumpTo || branch.next;

    if (!branch.stop && branchTarget) {
      loopVisitCounts[branchTarget] = (loopVisitCounts[branchTarget] || 0) + 1;
      if (loopVisitCounts[branchTarget] > 3) {
        const stepText = String(step.q || '').replace(/<[^>]*>/g, '');
        endWizard(`This diagnostic step was revisited too many times. Stop the guided flow and escalate for manual inspection. Last step: ${stepText}`, "FAULT FOUND");
        return;
      }
    }

    // Save state for multi-step Back functionality (full undo stack)
    guidedHistory.push({
      key: currentKey,
      sectionStatus: { ...sectionStatus },
      stepAnswers: { ...window._stepAnswers }
    });

    // Track answer for percentage
    window._stepAnswers[step.key] = answerYes;
    saveDiagnosticDraft().catch(error => console.error('[Draft] Save failed:', error));

    // Refresh percentage for the section you just answered
    const thisSection = stepToRibbon[step.key];
    if (thisSection) updateRibbonPercentage(thisSection);

    // Update live wiring visual for this section
    if (thisSection && typeof window.updateWiringVisual === 'function') {
      window.updateWiringVisual(thisSection);
    }

    // Show instruction display if reason is present
    if (branchReason && !branch.stop) {
      window._nextKeyQueue = branch.jumpTo || branch.next;
      showBanner(branch.badge || "step-action", branchReason);
      return; // Do not render next step yet; wait for OK click
    }

    // If this answer causes a stop, end the session
    if (branch.stop) {
      const section = stepToRibbon[step.key];
      const isPass = branch.badge === "step-pass";
      markSectionStatus(section, isPass ? "completed" : "fail");

      const outcomeText = isPass ? "WORKING SATISFACTORY" : "FAULT FOUND";
      if (!isPass && branchReason) {
        window._pendingTerminal = { reason: branchReason, outcome: outcomeText };
        showBanner(branch.badge || "step-fail", branchReason);
        return;
      }
      endWizard(branchReason, outcomeText);
      return;
    }

    // If this answer completes a section, mark completed
    // Completed if next step is in a different section or is 'done' or 'retarder_switch'
    if (branch.next) {
      const thisSection = stepToRibbon[step.key];
      const nextSection = stepToRibbon[branch.next];
      if (nextSection && nextSection !== thisSection) {
        markSectionStatus(thisSection, "completed");
      }
      // If next is 'done' or 'retarder_switch', mark completed
      if (["done", "retarder_switch"].includes(branch.next)) {
        markSectionStatus(thisSection, "completed");
      }
    }

    if (branch.jumpTo) {
      currentKey = branch.jumpTo;
    } else if (branch.next) {
      currentKey = branch.next;
    } else {
      console.warn("No next/jumpTo/stop; staying on current step");
    }

    renderStep(getCurrentStep());
    if (typeof updateTimerDisplay === 'function') updateTimerDisplay();
  }

  function handleBack() {
    if (guidedHistory.length === 0) return;

    const prevState = guidedHistory.pop(); // Clear history after one use
    currentKey = prevState.key;

    // Restore section statuses
    for (let s in prevState.sectionStatus) {
      sectionStatus[s] = prevState.sectionStatus[s];
    }

    // Restore step answers
    window._stepAnswers = { ...prevState.stepAnswers };

    // Explicitly reset the answer for the step we are going back TO
    delete window._stepAnswers[currentKey];

    renderStep(getCurrentStep());

    // Refresh ribbon and nodes
    const currentSection = stepToRibbon[currentKey];
    if (currentSection) {
      updateNodeStatus(currentKey);
      updateRibbonPercentage(currentSection);
    }
  }

  const state = {
    index: 0,
    answers: { green: null, black: null, yellow: null },
    done: false
  };

  // DOM refs
  const stepQA = document.getElementById("stepQA");
  const stepBtnYes = document.getElementById("stepBtnYes");
  const stepBtnNo = document.getElementById("stepBtnNo");
  const stepResult = document.getElementById("stepResult");
  const stepProgressBarEnhanced = document.getElementById("stepProgressBarEnhanced");
  const diagnosticHeader = document.getElementById("diagnosticHeader");
  const stepCard = document.getElementById("stepCard");
  // Ensure diagnosticHeader is visible when stepCard is shown
  // Always show diagnosticHeader when stepCard is shown
  if (stepCard && diagnosticHeader) {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && stepCard.classList.contains('active')) {
          diagnosticHeader.style.display = 'flex';
          // Start timer if not already running
          if (typeof window.startGuidedStepTimer === 'function') {
            window.startGuidedStepTimer();
          }
        }
      });
    });
    observer.observe(stepCard, { attributes: true });
  }

  function updateBadge(which, status) {
    const map = {
      green: badgeGreen,
      black: badgeBlack,
      yellow: badgeYellow
    };
    const el = map[which];
    if (!el) return;
    el.classList.remove("step-pass", "step-fail");
    if (status === "step-pass") {
      el.textContent = "✅";
      el.classList.add("step-pass");
    }
    if (status === "step-fail") {
      el.textContent = "❌";
      el.classList.add("step-fail");
    }
  }

  // Initialize on DOM ready
  if (stepQA && stepBtnYes && stepBtnNo) {
    // Timer initialization logic moved to top of IIFE
    window.startGuidedStepTimer = startElapsedTimer;
    renderStep(getCurrentStep());

    // Expose refresh function to allow re-rendering when language changes
    window.refreshWizardStep = () => renderStep(getCurrentStep());

    stepBtnYes.addEventListener("click", () => handleAnswer(true));
    stepBtnNo.addEventListener("click", () => handleAnswer(false));

    // Single MutationObserver for guidedFlowCard timer — created ONCE at init (fixes memory leak)
    const guidedFlowCard = document.getElementById('guidedFlowCard');
    if (guidedFlowCard) {
      const _flowObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'attributes' && guidedFlowCard.classList.contains('active')) {
            if (typeof window.startGuidedStepTimer === 'function') {
              window.startGuidedStepTimer();
            }
            if (currentHeaderSection && !window._hasShownLocFor[currentHeaderSection]) {
              showLocationHelp(currentHeaderSection);
              window._hasShownLocFor[currentHeaderSection] = true;
            }
          }
        });
      });
      _flowObserver.observe(guidedFlowCard, { attributes: true });
    }

    // Expose timer controls globally so inline HTML functions can call them safely
    window.stopTimer = stopElapsedTimer;
    window.startMainTimer = startElapsedTimer;
  }

  // Global retry for resuming testing after repairing a fault
  window.retryFailedStep = function () {
    // 1. Show guided flow card safely using index.html's global UI manager
    if (typeof showSection === 'function') {
      showSection('guidedFlowCard');
    } else {
      const resultCard = document.getElementById("resultCard");
      const guidedFlowCard = document.getElementById("guidedFlowCard");
      if (resultCard) { resultCard.style.display = 'none'; resultCard.style.opacity = '0'; resultCard.classList.remove('active'); }
      if (guidedFlowCard) { guidedFlowCard.style.display = 'block'; guidedFlowCard.style.opacity = '1'; guidedFlowCard.classList.add('active'); }
    }

    // 2. Remove the answer that caused the stop
    if (window._stepAnswers) {
      delete window._stepAnswers[currentKey];
    }

    // 3. Reset the section status back to testing/pending
    const section = stepToRibbon[currentKey];
    if (section && typeof sectionStatus !== 'undefined') {
      sectionStatus[section] = "pending";
    }

    // 4. Restart timers
    if (typeof window.startGuidedStepTimer === 'function') {
      window.startGuidedStepTimer();
    } else if (typeof window.startMainTimer === 'function') {
      window.startMainTimer();
    } else if (typeof startElapsedTimer === 'function') {
      startElapsedTimer();
    }

    // 5. Re-render the current step (this clears the previous result UI and enables buttons)
    renderStep(getCurrentStep());
    
    // 6. Scroll back into view
    if (guidedFlowCard) {
      guidedFlowCard.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Global reset for New Diagnostic button
  window.resetWizardState = function () {
    // Restore full 'Not Working' steps
    steps.splice(0, steps.length, ...originalSteps);
    Object.keys(stepByKey).forEach(k => delete stepByKey[k]);
    originalSteps.forEach(s => { stepByKey[s.key] = s; });

    currentKey = "green";
    loopVisitCounts = {};
    window._stepAnswers = {};
    window._stepEvidence = {};
    window._channelChecks = {};
    clearDiagnosticDraft().catch(error => console.error('[Draft] Clear failed:', error));
    elapsedMs = 0;

    // Reset section statuses
    Object.keys(sectionStatus).forEach(key => sectionStatus[key] = "pending");

    // Reset UI tracking flags
    currentHeaderSection = null;
    currentRenderedSection = null;
    window._hasShownLocFor = {};

    // Stop timers
    stopElapsedTimer();

    // Reset badges and nodes
    updateNodeStatus("green");

    // Clear ribbon percentages
    document.querySelectorAll('.ribbon-percent').forEach(el => el.style.display = 'none');

    // Clear live wiring visual
    const wvPanel = document.getElementById('wiringVisual');
    if (wvPanel) { wvPanel.innerHTML = ''; wvPanel.style.display = 'none'; wvPanel.classList.remove('active'); }

    // Final UI refresh
    renderStep(getCurrentStep());
  };

  // Switch active step set based on complaint type
  window.setComplaintMode = function (type) {
    window._riqComplaintMode = type;
    if (!window._restoringDiagnosticDraft) {
      window._stepEvidence = {};
      window._channelChecks = {};
      clearDiagnosticDraft().catch(error => console.error('[Draft] Clear failed:', error));
    }
    let activeSet, startKey;

    if (type === 'Quick Triage') {
      activeSet = triageSteps;
      startKey = "triage_q1";
    } else if (type === 'Intermittent') {
      activeSet = intermittentSteps;
      startKey = "int_q1";
    } else {
      // 'Not Working' — full guided flow
      activeSet = originalSteps;
      startKey = "green";
    }

    // Swap active steps in place
    steps.splice(0, steps.length, ...activeSet);
    Object.keys(stepByKey).forEach(k => delete stepByKey[k]);
    activeSet.forEach(s => { stepByKey[s.key] = s; });

    // Reset state
    currentKey = startKey;
    loopVisitCounts = {};
    window._stepAnswers = {};
    window._channelChecks = {};
    guidedHistory = [];
    elapsedMs = 0;
    currentHeaderSection = null;
    currentRenderedSection = null;
    window._hasShownLocFor = {};
    Object.keys(sectionStatus).forEach(k => sectionStatus[k] = "pending");
    stopElapsedTimer();
    document.querySelectorAll('.ribbon-percent').forEach(el => el.style.display = 'none');
    
    // Fix: Re-render the first step for the newly selected mode
    renderStep(getCurrentStep());
  };

  window.addEventListener('emissionchanged', () => {
    currentRenderedSection = null;
    currentRenderedLang = null;
    renderBadgesForSection(currentHeaderSection || 'wf-conn');
    renderStep(getCurrentStep());
  });

  window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => restoreDiagnosticDraft().catch(error => console.error('[Draft] Restore failed:', error)), 700);
  }, { once: true });
})();

/* =================== Live Wiring Visual =================== */
(function () {
  window.updateWiringVisual = function () {};
})();

// Test node configuration with instructions and time estimates
const NODE_CONFIG = {
  'wf-conn': {
    name: 'Retarder Connection (C1)',
    instructions: [
      'Ensure wiring connector is fully inserted',
      'Keep ignition switch OFF (position 0)',
      'Check for any loose connections'
    ],
    timeEstimate: '15 seconds'
  },
  'wf-speed': {
    name: 'ECU Speed Box (SB)',
    instructions: [
      'Check ECU connector for corrosion',
      'Ensure all pins are intact',
      'Verify proper seat in the connector'
    ],
    timeEstimate: '20 seconds'
  },
  'wf-switch': {
    name: 'Retarder Switch (RS)',
    instructions: [
      'Locate switch on retarder housing',
      'Check for proper alignment',
      'Verify no mechanical damage'
    ],
    timeEstimate: '18 seconds'
  },
  'wf-aps': {
    name: 'Air Pressure Switch (APS)',
    instructions: [
      'Check air line connections',
      'Look for any splits or cracks in tubing',
      'Verify switch is responding to pressure changes'
    ],
    timeEstimate: '25 seconds'
  },
  'wf-relay': {
    name: 'Relay Box (RB)',
    instructions: [
      'Inspect relay contacts for oxidation',
      'Verify relay clicks when powered',
      'Check for loose relay seats'
    ],
    timeEstimate: '22 seconds'
  },
  'wf-retarder': {
    name: 'Retarder Unit (R)',
    instructions: [
      'Check retarder solenoid connections',
      'Verify oil level and condition',
      'Look for any external leaks or damage'
    ],
    timeEstimate: '20 seconds'
  }
};

/**
 * Set a node to "testing" state with visual feedback and instruction card
 */
function startNodeTesting(nodeId) {
  const node = document.getElementById(nodeId);
  const status = document.getElementById(nodeId + '-status');
  const config = NODE_CONFIG[nodeId];

  if (!node || !config) return;

  // Update node and status classes
  node.classList.remove('pending', 'pass', 'fail');
  node.classList.add('testing');

  status.classList.remove('pending', 'pass', 'fail');
  status.classList.add('testing');
  status.textContent = typeof t === 'function' ? t('testing') : '🔄 Testing...';

  // Show action instruction card
  const actionCard = document.getElementById('actionCard');
  if (actionCard) {
    document.getElementById('currentTestName').textContent = typeof bi === 'function' ? bi(nodeId + '_title') : config.name;
    document.getElementById('timeEstimate').textContent = config.timeEstimate;

    const instructionList = document.getElementById('instructionList');
    instructionList.innerHTML = config.instructions
      .map(instruction => `<li>${instruction}</li>`)
      .join('');

    actionCard.classList.add('active');
  }
}

/**
 * Complete a node test with pass or fail result
 */
function completeNodeTesting(nodeId, passed) {
  const node = document.getElementById(nodeId);
  const status = document.getElementById(nodeId + '-status');

  if (!node) return;

  node.classList.remove('pending', 'testing');
  status.classList.remove('pending', 'testing');

  if (passed) {
    node.classList.add('pass');
    status.classList.add('pass');
    status.textContent = typeof t === 'function' ? t('pass') : '✅ Pass';
  } else {
    node.classList.add('fail');
    status.classList.add('fail');
    status.textContent = typeof t === 'function' ? t('failed') : '❌ Failed';
  }

  // Hide action card after a short delay
  setTimeout(() => {
    const actionCard = document.getElementById('actionCard');
    if (actionCard) {
      actionCard.classList.remove('active');
    }
  }, 1000);
}

/**
 * Reset node to pending state
 */
function resetNodeState(nodeId) {
  const node = document.getElementById(nodeId);
  const status = document.getElementById(nodeId + '-status');

  if (!node) return;

  node.classList.remove('testing', 'pass', 'fail');
  node.classList.add('pending');

  status.classList.remove('testing', 'pass', 'fail');
  status.classList.add('pending');
  status.textContent = 'Not tested';
}

// Example: Simulate testing C1 node for demo
// Uncomment to test:
// startNodeTesting('wf-conn');
// setTimeout(() => { completeNodeTesting('wf-conn', true); }, 3000);

/* =================== Progress Tracking & Visualization =================== */

const TEST_TIMING = {
  'wf-conn': 15,
  'wf-speed': 20,
  'wf-switch': 18,
  'wf-aps': 25,
  'wf-relay': 22,
  'wf-retarder': 20
};

const TOTAL_TEST_TIME = Object.values(TEST_TIMING).reduce((a, b) => a + b, 0);

const testResults = {
  'wf-conn': null,
  'wf-speed': null,
  'wf-switch': null,
  'wf-aps': null,
  'wf-relay': null,
  'wf-retarder': null
};

/**
 * Set a node to active (highlighted)
 */
function setActiveNode(nodeId) {
  document.querySelectorAll('.wf-node.active').forEach(el => el.classList.remove('active'));
  const node = document.getElementById(nodeId);
  if (node) node.classList.add('active');
}

/**
 * Update status summary bar
 */
function updateStatusSummary() {
  const nodes = ['wf-conn', 'wf-speed', 'wf-switch', 'wf-aps', 'wf-relay', 'wf-retarder'];
  nodes.forEach(nodeId => {
    const summaryItem = document.getElementById('summary-' + nodeId);
    if (!summaryItem) return;
    summaryItem.className = 'status-item ' + (testResults[nodeId] === null ? 'pending' :
      testResults[nodeId] === true ? 'pass' : 'fail');
  });
}

// NOTE: Timer is managed exclusively by the wizard IIFE (startElapsedTimer).
// startTestTimer / stopTestTimer removed to prevent dual-timer conflict.

/**
 * Update progress/step-count displays.
 * Elapsed time is handled by the wizard IIFE's startElapsedTimer — do not duplicate here.
 */
function updateTimerDisplay() {
  // Step-based diagnostic progress (0-100)
  let progress = 0;
  if (typeof window.getDiagnosticProgress === 'function') {
    progress = window.getDiagnosticProgress();
  }
  const progressEl = document.getElementById('progressPercent');
  if (progressEl) progressEl.textContent = `${progress}%`;

  // Sync the step count display (Step X / 6)
  const stepCountDisplay = document.getElementById('stepCountDisplay');
  if (stepCountDisplay) {
    const stepNo = document.getElementById('stepCurrentNo');
    const current = stepNo ? stepNo.textContent.trim() : '1';
    stepCountDisplay.textContent = `${current} / 6`;
  }
}

/**
 * Add a result to the previous results section
 */
function addTestResult(nodeId, passed) {
  testResults[nodeId] = passed;

  const resultsContainer = document.getElementById('resultsContainer');
  if (!resultsContainer) return;

  const nodeConfig = NODE_CONFIG[nodeId];
  if (!nodeConfig) return;

  // Remove existing result for this node (if any)
  const existing = resultsContainer.querySelector(`[data-node-id="${nodeId}"]`);
  if (existing) {
    existing.remove();
  }

  // Add new result
  const resultEl = document.createElement('div');
  resultEl.className = 'result-item';
  resultEl.setAttribute('data-node-id', nodeId);

  const statusClass = passed ? 'pass' : 'fail';
  const statusIcon = passed ? '✅' : '❌';
  const statusText = passed ? 'Pass' : 'Failed';

  resultEl.innerHTML = `
    <span class="result-item-name">${nodeConfig.name}</span>
    <span class="result-item-status ${statusClass}">${statusIcon} ${statusText}</span>
  `;

  resultsContainer.appendChild(resultEl);

  // Show previous results section if there are any results
  const prevSection = document.getElementById('previousResultsSection');
  if (prevSection && resultsContainer.children.length > 0) {
    prevSection.style.display = 'block';
  }
}

/**
 * Setup previous results toggle
 */
function setupPreviousResultsToggle() {
  const toggle = document.getElementById('previousResultsToggle');
  const content = document.getElementById('previousResultsContent');

  if (!toggle || !content) return;

  toggle.addEventListener('click', () => {
    toggle.classList.toggle('expanded');
    content.classList.toggle('visible');
  });
}

/**
 * Enhanced version of startNodeTesting with progress tracking
 */
function startNodeTestingWithProgress(nodeId) {
  startNodeTesting(nodeId);
  setActiveNode(nodeId);
  // startTestTimer removed — timer managed by wizard IIFE (startElapsedTimer)
}

/**
 * Enhanced version of completeNodeTesting with results tracking
 */
function completeNodeTestingWithProgress(nodeId, passed) {
  completeNodeTesting(nodeId, passed);
  addTestResult(nodeId, passed);
  updateStatusSummary();
}

/**
 * Reset all progress
 */
function resetProgress() {
  // stopTestTimer / elapsedSeconds removed — timer managed by wizard IIFE stopElapsedTimer

  // Reset test results
  for (let nodeId in testResults) {
    testResults[nodeId] = null;
    resetNodeState(nodeId);
  }

  updateTimerDisplay();
  updateStatusSummary();

  // Clear previous results
  const resultsContainer = document.getElementById('resultsContainer');
  if (resultsContainer) {
    resultsContainer.innerHTML = '';
  }

  const prevSection = document.getElementById('previousResultsSection');
  if (prevSection) {
    prevSection.style.display = 'none';
  }

  // Remove active node highlight
  document.querySelectorAll('.wf-node.active').forEach(el => {
    el.classList.remove('active');
  });
}

// Initialize timer display and toggle on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    updateTimerDisplay();
    setupPreviousResultsToggle();
  });
} else {
  updateTimerDisplay();
  setupPreviousResultsToggle();
}

// Example: Simulate testing all nodes sequentially
// Uncomment to test full flow:
/*
(async function() {
  const nodes = ['wf-conn', 'wf-speed', 'wf-switch', 'wf-aps', 'wf-relay', 'wf-retarder'];
  for (let nodeId of nodes) {
    startNodeTestingWithProgress(nodeId);
    await new Promise(resolve => setTimeout(resolve, 3000));
    completeNodeTestingWithProgress(nodeId, Math.random() > 0.1);
  }
  stopTestTimer();
})();
*/
