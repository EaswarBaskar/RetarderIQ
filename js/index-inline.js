// Enable Accept button only when mandatory checkbox is checked
      (function () {
        var cb = document.getElementById('acceptCheck');
        var btn = document.getElementById('acceptDisclaimerBtn');
        if (cb && btn) {
          cb.addEventListener('change', function () {
            btn.disabled = !cb.checked;
            btn.setAttribute('aria-disabled', String(!cb.checked));
          });
        }
      })();

// ===== EXCLUSIVE SECTION MANAGEMENT HELPERS =====
      function hide(el) {
        if (!el) return;
        const target = typeof el === 'string' ? document.getElementById(el) : el;
        if (!target || !target.style) return;
        target.classList.remove('active');
        target.style.display = 'none';
        target.style.opacity = '0';
      }

      function show(el) {
        if (!el) return;
        const target = typeof el === 'string' ? document.getElementById(el) : el;
        if (!target || !target.style) return;
        target.style.display = 'block';
        target.classList.add('active');
        void target.offsetHeight; // Force reflow
        target.classList.add('fade-slide-in');
        target.style.opacity = '1';

        if (target.id === 'regCard' && typeof autoDetectLocationOnLoad === 'function') {
          setTimeout(autoDetectLocationOnLoad, 500);
        }
        if (target.id === 'preDiagCard') {
          const simPanel = document.getElementById('simPanel');
          if (simPanel) {
            simPanel.style.display = 'block';
            simPanel.style.opacity = '1';
          }
        }
      }

      function hideAllSections() {
        const allSections = document.querySelectorAll('section.card, .container');
        allSections.forEach(section => {
          if (section && section.style) {
            section.classList.remove('active');
            section.style.display = 'none';
            section.style.opacity = '0';
          }
        });
      }

      function showSection(id) {
        hideAllSections();
        show(id);
      }

      // Force exclusive view on initial DOM load: show ONLY disclaimerScreen
      document.addEventListener('DOMContentLoaded', () => {
        showSection('disclaimerScreen');
        document.querySelector('#vecvLocked .emission-btn-label')?.replaceChildren('VECV');
        document.querySelector('[onclick="handleEmissionSelect(\'VECV\')"] .emission-btn-label')?.replaceChildren('VECV');
        document.querySelector('[onclick="handleEmissionSelect(\'TML\')"] .emission-btn-label')?.replaceChildren('TML');
      });

function handleEmissionSelect(variant) {
            // Forward to the unified function at the bottom
            if (typeof selectEmission === 'function') {
              selectEmission(variant);
            } else {
              console.error('selectEmission not found');
}

}

function showVehicleModelGroup(manufacturer) {
  const wrapper = document.getElementById('vehicleModelGroups');
  const vecv = document.getElementById('vecvModelGroup');
  const tml = document.getElementById('tmlModelGroup');
  if (!wrapper || !vecv || !tml) return;
  wrapper.style.display = 'block';
  vecv.style.display = manufacturer === 'VECV' ? 'grid' : 'none';
  tml.style.display = manufacturer === 'TML' ? 'grid' : 'none';
}

function selectTmlVehicleModel(model) {
  window.SELECTED_TML_MODEL = model;
  handleEmissionSelect('TML');
  const select = document.getElementById('vehModel');
  if (select) select.value = model;
}
function handleComplaintSelect(complaint) {
        // Forward to the unified function at the bottom
        if (typeof selectComplaint === 'function') {
          selectComplaint(complaint);
        } else {
          console.error('selectComplaint not found');
        }
      }

function isRegValid(val) {
        const clean = val.replace(/[\s-]/g, '').toUpperCase();

        // List of all valid Indian State/UT codes
        const stateCodes = [
          'AN', 'AP', 'AR', 'AS', 'BR', 'CH', 'CG', 'DD', 'DN', 'DL', 'GA', 'GJ', 'HR', 'HP',
          'JK', 'JH', 'KA', 'KL', 'LA', 'LD', 'MP', 'MH', 'MN', 'ML', 'MZ', 'NL', 'OD', 'PB',
          'PY', 'RJ', 'SK', 'TN', 'TS', 'TR', 'UK', 'UA', 'UP', 'WB'
        ];

        const statePart = clean.substring(0, 2);
        const isStandardIndia = stateCodes.includes(statePart) && /^[A-Z]{2}[0-9]{2}[A-Z]{1,3}[0-9]{4}$/.test(clean);
        const isBHSeries = /^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$/.test(clean);

        return isStandardIndia || isBHSeries;
      }

      function validateVehReg(input) {
        let val = input.value.toUpperCase().replace(/[\s-]/g, '');
        val = val.replace(/[^A-Z0-9]/g, '');
        input.value = val;

        const hint = document.getElementById('regHint');

        if (isRegValid(val)) {
          input.style.borderColor = "#10B981"; // OK Green
          input.style.boxShadow = "0 0 0 3px rgba(16, 185, 129, 0.1)";
          if (hint) {
            hint.textContent = "✅ Valid Format";
            hint.style.color = "#10B981";
          }
        } else {
          input.style.borderColor = "";
          input.style.boxShadow = "";
          if (hint) {
            hint.textContent = "Format: TN01AB1234";
            hint.style.color = "#6B7280";
          }
          if (val.length > 4) {
            input.style.borderColor = "#EF4444"; // Invalid Red
          }
        }
      }

      function handleProceedToTools() {
        const name = document.getElementById("techName")?.value?.trim();
        const phone = document.getElementById("techPhone")?.value?.trim();
        const dealer = document.getElementById("dealerName")?.value?.trim();
        const type = document.getElementById("techType")?.value?.trim();
        const city = document.getElementById("city")?.value?.trim();
        const state = document.getElementById("state")?.value?.trim();
        const regNo = document.getElementById("vehReg")?.value?.trim();
        const odometer = document.getElementById("odometer")?.value?.trim();
        const model = document.getElementById("vehModel")?.value?.trim();
        const chassis = document.getElementById("chassisNo")?.value?.trim();

        // Specific field validation with clear messages
        if (!name) { alert(t('alert_name')); document.getElementById("techName").focus(); return; }
        if (!phone) { alert(t('alert_phone')); document.getElementById("techPhone").focus(); return; }
        if (!dealer) { alert(t('alert_workshop')); document.getElementById("dealerName").focus(); return; }
        if (!type) { alert(t('alert_tech_type')); document.getElementById("techType").focus(); return; }
        if (!city) { alert(t('alert_city')); document.getElementById("city").focus(); return; }
        if (!state) { alert(t('alert_state')); document.getElementById("state").focus(); return; }
        if (!regNo) { alert(t('alert_reg_no')); document.getElementById("vehReg").focus(); return; }
        if (!odometer) { alert(t('alert_odometer')); document.getElementById("odometer").focus(); return; }
        if (!model) { alert(t('alert_model')); document.getElementById("vehModel").focus(); return; }

        if (phone.replace(/\D/g, '').length !== 10) {
          alert(t('alert_mobile_invalid'));
          return;
        }

        if (!isRegValid(regNo)) {
          alert(t('alert_reg_no_invalid'));
          document.getElementById("vehReg").focus();
          return;
        }

        // Chassis validation ONLY if entered
        if (chassis && chassis.length < 6) {
          alert(t('alert_chassis_invalid'));
          document.getElementById("chassisNo").focus();
          return;
        }

        if (false && String(EMISSION).startsWith('TML')) {
          // Bypass tools and safety checklist, go straight to TML diagnostic flow
          const allSections = document.querySelectorAll('section.card');
          allSections.forEach(section => {
            if (typeof hide === 'function') {
              hide(section);
            } else {
              section.style.display = 'none';
              section.classList.remove('active');
            }
          });
          if (typeof window.startTmlDiagnosis === 'function') {
            window.startTmlDiagnosis();
          }
          console.log('[handleProceedToTools] → skipping to TML diagnosis');
          return;
        }

        // Show only Tools Required section exclusively
        showSection('preCard');
        
        console.log('[handleProceedToTools] → showing preCard');
      }

      function autofillRegistrationDemo() {
        const demo = {
          techName: "Easwar",
          techPhone: "8939465098",
          dealerName: "Eicher Service Centre",
          techType: "Authorized Dealer",
          city: "Chennai",
          state: "Tamil Nadu",
          vehReg: "TN01AB1234",
          odometer: "125430",
          chassisNo: "A3B421",
          vehModel: "12M BS-IV (Retarder)"
        };

        Object.entries(demo).forEach(([key, value]) => {
          const el = document.getElementById(key);
          if (!el) return;
          el.value = value;
          if (el.tagName === "SELECT") {
            el.dispatchEvent(new Event("change", { bubbles: true }));
          } else {
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
          }
        });

        const hint = document.getElementById("regHint");
        if (hint) {
          hint.textContent = typeof t === "function" ? t("hint_reg_format") : "Format: TN01AB1234";
          hint.style.color = "#10B981";
        }
      }

      function handleBackToComplaint() {
        const regCard = document.getElementById('regCard');
        const complaintCard = document.getElementById('complaintCard');

        if (regCard) {
          regCard.style.display = 'none';
          regCard.classList.remove('active');
        }

        if (complaintCard) {
          complaintCard.style.display = 'block';
          complaintCard.classList.add('active');
        }

        console.log('[handleBackToComplaint] → showing complaintCard');
      }

// Accessibility and visual feedback for tool selection
      function toggleToolCheck(id) {
        var cb = document.getElementById(id);
        if (cb) {
          cb.checked = !cb.checked;
          // Visual feedback: highlight parent
          var parent = cb.closest('.precheck-item');
          if (parent) {
            if (cb.checked) {
              parent.classList.add('checked');
              parent.setAttribute('aria-checked', 'true');
            } else {
              parent.classList.remove('checked');
              parent.setAttribute('aria-checked', 'false');
            }
          }
        }
      }
      // Initialize ARIA checked state on load
      document.addEventListener('DOMContentLoaded', function () {
        ['tool_multimeter', 'tool_clamp_meter'].forEach(function (id) {
          var cb = document.getElementById(id);
          var parent = cb && cb.closest('.precheck-item');
          if (cb && parent) {
            parent.setAttribute('aria-checked', cb.checked ? 'true' : 'false');
            if (cb.checked) parent.classList.add('checked');
          }
        });
      });

function handleBackToReg() {
        const preCard = document.getElementById('preCard');
        const regCard = document.getElementById('regCard');

        if (preCard) {
          preCard.style.display = 'none';
          preCard.classList.remove('active');
        }

        if (regCard) {
          regCard.style.display = 'block';
          regCard.classList.add('active');
        }

        console.log('[handleBackToReg] → showing regCard');
      }

// Visual feedback for safety checklist
      function toggleToolCheck(id) {
        var cb = document.getElementById(id);
        if (cb) {
          var parent = cb.closest('label.check');
          if (parent) {
            if (cb.checked) {
              parent.classList.add('checked');
            } else {
              parent.classList.remove('checked');
            }
          }
        }
        // Enable Proceed button only if all safety checks are ticked
        var allChecked = ["safety1", "safety2", "safety3"].every(function (id) { return document.getElementById(id).checked; });
        var btn = document.getElementById('proceedBtn');
        if (btn) {
          btn.disabled = !allChecked;
          btn.setAttribute('aria-disabled', (!allChecked).toString());
        }
      }

/* Splash (fast, non-blocking) */
    const splash = document.getElementById('splash');
    const rb = document.getElementById('rb');
    let minLoadTime = 800; // 0.8s load time for fast initial rendering
    let startTime = Date.now();

    function endSplashSmart() {
      const elapsed = Date.now() - startTime;
      const remaining = minLoadTime - elapsed;

      setTimeout(() => {
        if (splash && !splash.classList.contains('hide')) {
          splash.classList.add('hide');
          setTimeout(() => {
            splash.style.display = 'none';
            // Show disclaimer screen cleanly once splash fades out
            if (typeof showSection === 'function') {
              showSection('disclaimerScreen');
            }
          }, 300);
        }
      }, Math.max(0, remaining));
    }

    // Start the splash screen timeout
    endSplashSmart();
    rb?.addEventListener('animationend', endSplashSmart, { once: true });

    // Fallback: ensure splash hides and disclaimer shows cleanly
    setTimeout(() => {
      try {
        const s = document.getElementById('splash');
        if (s && s.style.display !== 'none') {
          s.classList.add('hide');
          s.style.display = 'none';
        }
        if (typeof showSection === 'function') {
          showSection('disclaimerScreen');
        }
      } catch (e) { console.error('[fallback] error', e); }
    }, 2000);

    /* DOM refs */
    const $ = s => document.querySelector(s);
    const disclaimerScreen = $("#disclaimerScreen");
    const acceptCheck = $("#acceptCheck");
    const emissionSelect = $("#emissionSelect");
    const complaintCard = $("#complaintCard");
    const regCard = $("#regCard");
    const preCard = $("#preCard");
    const progCard = $("#progCard");
    const preDiagCard = $("#preDiagCard");
    const stepCard = $("#stepCard");
    const resultCard = $("#resultCard");
    const techName = $("#techName");
    const techPhone = $("#techPhone");
    const vehReg = $("#vehReg");
    const locationInput = $("#liveLocation");
    const goPrecheck = $("#goPrecheck");
    const startDiag = $("#startDiag");
    const backToReg = $("#backToReg");
    const backToComplaint = $("#backToComplaint");
    const yesBtn = $("#yesBtn");
    const noBtn = $("#noBtn");
    const nextBtn = $("#nextBtn");
    const restartBtn = $("#restartBtn");
    const progressBar = $("#progressBar");
    const progHint = $("#progHint");
    const progTag = $("#progTag");
    const stepTitle = $("#stepTitle");
    const loc = $("#loc");
    const tool = $("#tool");
    const test = $("#test");
    const expectEl = $("#expect");
    const advice = $("#advice");
    const resultSummary = $("#resultSummary");
    // Button elements will be used later with proper error handling
    const emissionTag = $("#emissionTag");
    const preDiagTag = $("#preDiagTag");
    const stepEmissionTag = $("#stepEmissionTag");
    let EMISSION = null;

    // ECU Speed Box Popup close button
    const ecuSpeedPopupOK = $("#ecuSpeedPopupOK");
    if (ecuSpeedPopupOK) {
      ecuSpeedPopupOK.addEventListener('click', function () {
        const ecuSpeedPopup = document.getElementById('ecuSpeedPopup');
        if (ecuSpeedPopup) {
          ecuSpeedPopup.classList.add('hidden');
        }
      });
    }


    // Primary wizard controls. The guided diagnostic implementation lives in app.js and tml.js.
    document.getElementById('printBtn')?.addEventListener('click', () => window.print());
    document.getElementById('newBtn')?.addEventListener('click', () => {
      window.resetWizardState?.();
      document.querySelectorAll('section.card, .container:not(#splash), #emissionSelect').forEach(card => {
        card.style.display = 'none';
        card.classList.remove('active');
        card.style.opacity = '1';
      });
      ['techName', 'techPhone', 'dealerName', 'city', 'odometer', 'chassisNo', 'vehReg', 'vehModel'].forEach(id => {
        const element = document.getElementById(id);
        if (element) element.value = '';
      });
      showSection('emissionSelect');
    });

    /* ======== Wiring Diagram State Helpers (nodes + status + links) ======== */
    const WF = {
      // Nodes
      conn: document.getElementById('wf-conn'),
      speed: document.getElementById('wf-speed'),
      switch: document.getElementById('wf-switch'),
      aps: document.getElementById('wf-aps'),
      relay: document.getElementById('wf-relay'),
      ret: document.getElementById('wf-retarder'),

      // Status chips
      s_conn: document.getElementById('wf-conn-status'),
      s_speed: document.getElementById('wf-speed-status'),
      s_switch: document.getElementById('wf-switch-status'),
      s_aps: document.getElementById('wf-aps-status'),
      s_relay: document.getElementById('wf-relay-status'),
      s_ret: document.getElementById('wf-retarder-status'),

      // Links
      l0: document.getElementById('wf-link-0'),
      l0b: document.getElementById('wf-link-0b'),
      l1: document.getElementById('wf-link-1'),
      l2: document.getElementById('wf-link-2'),
      l3: document.getElementById('wf-link-3'),
    };

    function setState(el, state) {
      if (!el) return;
      el.classList.remove('pass', 'fail', 'pending');
      el.classList.add(state);
    }
    function setText(el, txt) { if (el) el.textContent = txt; }
    function stateText(s) {
      if (s === 'pass') return t('wf_status_pass');
      if (s === 'fail') return t('wf_status_fault');
      return t('wf_status_not_tested');
    }

    function markConn(state) { setState(WF.conn, state); setState(WF.s_conn, state); setText(WF.s_conn, stateText(state)); }
    function markSpeedBox(state) { setState(WF.speed, state); setState(WF.s_speed, state); setText(WF.s_speed, stateText(state)); }
    function markRelay(state) { setState(WF.relay, state); setState(WF.s_relay, state); setText(WF.s_relay, stateText(state)); }
    function markSwitch(state) { setState(WF.switch, state); setState(WF.s_switch, state); setText(WF.s_switch, stateText(state)); }
    function markAPS(state) { setState(WF.aps, state); setState(WF.s_aps, state); setText(WF.s_aps, stateText(state)); }
    function markRetarder(state) { setState(WF.ret, state); setState(WF.s_ret, state); setText(WF.s_ret, stateText(state)); }

    function link0(state) { setState(WF.l0, state); }
    function link0b(state) { setState(WF.l0b, state); }
    function link1(state) { setState(WF.l1, state); }
    function link2(state) { setState(WF.l2, state); }
    function link3(state) { setState(WF.l3, state); }

    function resetWiringFlow() {
      markConn('pending');
      markSpeedBox('pending');
      markSwitch('pending');
      markAPS('pending');
      markRelay('pending');
      markRetarder('pending');
      link0('pending');
      link0b('pending');
      link1('pending');
      link2('pending');
      link3('pending');
    }

    function previewNode(el, on) {
      if (!el) return;
      el.classList.toggle('preview', !!on);
    }

    if (false) {
    const stepCountHint = document.getElementById("stepCountHint");
    const timerHint = document.getElementById("timerHint");
    // BUG-001 FIX: declare timerInterval in this scope so stopTimer() does not ReferenceError
    var timerInterval = null;

    function formatTime(ms) {
      const totalSec = Math.floor(ms / 1000);
      const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
      const ss = String(totalSec % 60).padStart(2, "0");
      return `${mm}:${ss}`;
    }


    // Expose a global function to start the timer and set startedAt in the correct scope
    window.startMainTimer = function () {
      startedAt = Date.now();
      stopTimer();
      timerInterval = setInterval(() => {
        if (!startedAt) return;
        const elapsed = Date.now() - startedAt;
        if (timerHint) timerHint.textContent = `Elapsed: ${formatTime(elapsed)}`;
      }, 500);
    }
    function startTimer() {
      stopTimer();
      timerInterval = setInterval(() => {
        if (!startedAt) return;
        const elapsed = Date.now() - startedAt;
        if (timerHint) timerHint.textContent = `Elapsed: ${formatTime(elapsed)}`;
      }, 500);
    }

    function stopTimer() {
      if (timerInterval) clearInterval(timerInterval);
      timerInterval = null;
    }

    // Retained only as a compatibility reference; the active timer/progress
    // implementation is owned by app.js and the TML flow owns its own state.
    /* UI helpers (show/hide defined in app.js) */
    function setProgress(idx) {
      const total = steps.length || 0;
      const currentStepNo = Math.min(idx + 1, total);
      const remaining = Math.max(total - currentStepNo, 0);

      const pct = total ? Math.round((currentStepNo / total) * 100) : 0;
      progressBar.style.width = pct + '%';

      progHint.textContent = total
        ? `${pct}% ${t('complete')}`
        : t('not_started');

      progTag.textContent = total
        ? `${t('step_tag')} ${currentStepNo}/${total}`
        : t('ready');

      if (stepCountHint) {
        stepCountHint.textContent = `${t('step_tag')} ${currentStepNo} ${t('of')} ${total} • ${t('remaining')}: ${remaining}`;
      }
    }
    function legacyRenderStep(idx) {
      const s = steps[idx]; if (!s) return;
      stepTitle.textContent = s.title;
      loc.textContent = s.location;
      tool.textContent = s.tool;
      test.textContent = s.test;
      expectEl.textContent = s.expect;
      hide(advice); lastAnswer = null; setProgress(idx); show(progCard); show(stepCard);

      // Always start both timers if defined
      if (typeof window.startMainTimer === 'function') window.startMainTimer();
      if (typeof window.startGuidedStepTimer === 'function') window.startGuidedStepTimer();
      // Only scroll if navigating between steps (not first entry)
      if (typeof idx === 'number' && idx > 0) {
        window.scrollTo({ top: stepCard.offsetTop - 10, behavior: 'smooth' });
      }
    }
    function showSwitchPanel() {
      // Show switch panel first
      document.getElementById("switchPanel").style.display = "block";
      // Scroll to the switch panel
      document.getElementById("switchPanel").scrollIntoView({ behavior: 'smooth' });
    }

    }

    /* Disclaimer */
    function acceptDisclaimer() {
      console.log('[acceptDisclaimer] clicked');

      const acceptCheckEl = document.getElementById('acceptCheck');
      if (!acceptCheckEl || !acceptCheckEl.checked) {
        alert(typeof t === 'function' ? t('alert_trained') : 'Please confirm safety compliance to proceed.');
        return;
      }

      // Normal flow: show emission selection exclusively
      console.log('[acceptDisclaimer] showing emissionSelect');
      showSection('emissionSelect');
    }

    /* Emission selection */
    function selectEmission(variant) {
      EMISSION = variant;
      window.SELECTED_EMISSION = variant;
      window.dispatchEvent(new Event('emissionchanged'));
      if (emissionTag) {
        if (variant === 'BS-IV') emissionTag.textContent = 'AL · BS‑IV';
        else if (variant === 'BS-VI') emissionTag.textContent = 'AL · BS‑VI';
        else if (variant === 'TML') emissionTag.textContent = 'TML · 1822';
      }
      if (preDiagTag) preDiagTag.textContent = emissionTag.textContent;
      if (stepEmissionTag) stepEmissionTag.textContent = emissionTag.textContent;

      if (variant === 'BS-IV') {
        if (typeof window.setComplaintMode === 'function') {
          window.setComplaintMode('Not Working');
        }
      } else if (variant === 'BS-VI') {
        if (typeof window.setComplaintMode === 'function') {
          window.setComplaintMode('Not Working');
        }
      } else if (String(variant).startsWith('TML')) {
        // TML logic will be handled specifically in goToECUTest
        }

      const complaintCards = document.querySelectorAll('#complaintCard .complaint-card');
      if (complaintCards.length >= 3) {
        if (String(variant).startsWith('TML')) {
          complaintCards[1].style.display = 'none';
          complaintCards[2].style.display = 'none';
        } else {
          complaintCards[1].style.display = 'block';
          complaintCards[2].style.display = 'block';
        }
      }

      onEmissionSelected();
      showSection('complaintCard');
    }

    // Complaint selection
    let COMPLAINT = null;

    function selectComplaint(type) {
      COMPLAINT = type;
      console.log("Complaint selected:", COMPLAINT);

      if (typeof window.setComplaintMode === 'function') {
        window.setComplaintMode(type);
      }

      showSection('regCard');

    }

    window.selectEmission = selectEmission;

    // Auto-detect location when registration form is shown
    function autoDetectLocationOnLoad() {
      // Only auto-detect if city field is empty
      const cityInput = document.getElementById("city");
      const statusEl = document.getElementById("cityLocStatus");

      if (cityInput && !cityInput.value) {
        // Show initial status
        if (statusEl) {
          statusEl.textContent = "🔄 Auto-detecting location...";
          statusEl.className = "loc-status info";
        }

        // Small delay to ensure form is fully loaded
        setTimeout(() => {
          requestLocationOnce({ cityStatusEl: statusEl });
        }, 1000);
      } else if (cityInput && cityInput.value && statusEl) {
        // City already has a value, show confirmation
        statusEl.textContent = `✅ Location: ${cityInput.value}`;
        statusEl.className = "loc-status success";
      }
    }

    document.addEventListener('DOMContentLoaded', () => {
      autoDetectLocationOnLoad();
    });

    // Location Auto-detection
    const liveLocationInput = document.getElementById("liveLocation");
    const cityInput = document.getElementById("city");
    const stateSelect = document.getElementById("state");
    const locStatus = document.getElementById("locStatus");
    const vehModelSelect = document.getElementById("vehModel");

    let locationRequestMade = false;
    let locationRequestInProgress = false;
    let cachedLocationData = null;

    function setStatusElement(el, text, variant = "") {
      if (!el) return;
      el.textContent = text;
      if (variant) {
        el.className = `loc-status ${variant}`;
      } else {
        el.className = "loc-status";
      }
    }

    function matchStateOption(stateName) {
      if (!stateName || !stateSelect) return;
      const normalized = stateName.toLowerCase();
      const options = Array.from(stateSelect.options);
      const matched = options.find(opt => {
        const label = (opt.text || "").toLowerCase();
        return label === normalized ||
          label.includes(normalized) ||
          normalized.includes(label);
      });
      if (matched) stateSelect.value = matched.value;
    }

    function applyCachedLocation({ locStatusEl = locStatus, cityStatusEl = document.getElementById("cityLocStatus") } = {}) {
      if (!cachedLocationData) return;
      const { city, state, fullAddress } = cachedLocationData;
      if (liveLocationInput && fullAddress) liveLocationInput.value = fullAddress;
      if (city && cityInput && !cityInput.value) cityInput.value = city;
      if (state) matchStateOption(state);
      setStatusElement(locStatusEl, "Location captured ✓", "success");
      setStatusElement(cityStatusEl, city ? `✅ ${city}` : "Location captured ✓", "success");
    }

    function requestLocationOnce({ statusEl = locStatus, cityStatusEl = document.getElementById("cityLocStatus") } = {}) {
      if (locationRequestMade) {
        if (cachedLocationData) {
          applyCachedLocation({ locStatusEl: statusEl, cityStatusEl });
        } else if (locationRequestInProgress) {
          setStatusElement(statusEl, "🔄 Location request in progress...", "info");
          setStatusElement(cityStatusEl, "🔄 Location request in progress...", "info");
        }
        return;
      }

      locationRequestMade = true;

      if (!navigator.geolocation) {
        setStatusElement(statusEl, "Location not supported. Please enter manually.", "error");
        setStatusElement(cityStatusEl, "Location not supported. Please enter manually.", "error");
        return;
      }

      locationRequestInProgress = true;
      setStatusElement(statusEl, "🔄 Detecting location...", "info");
      setStatusElement(cityStatusEl, "🔄 Detecting location...", "info");

      navigator.geolocation.getCurrentPosition(
        (position) => {
          locationRequestInProgress = false;
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;

          if (!navigator.onLine) {
            locationRequestInProgress = false;
            setStatusElement(statusEl, "Offline: enter city and state manually.", "info");
            setStatusElement(cityStatusEl, "Offline: enter city and state manually.", "info");
            document.getElementById("city")?.focus();
            return;
          }

          fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`, { headers: { Accept: 'application/json' } })
            .then(res => res.json())
            .then(data => {
              const address = data.address || {};
              const country = address.country || "";
              const city =
                address.city ||
                address.town ||
                address.village ||
                address.suburb ||
                address.county ||
                "";
              const state = address.state || "";
              const fullAddress = data.display_name || `${lat}, ${lon}`;

              cachedLocationData = { lat, lon, city, state, country, fullAddress, raw: data };
              if (liveLocationInput) liveLocationInput.value = fullAddress;

              const vpnWarningEl = document.getElementById("vpnWarning");
              const isIndia = country.toLowerCase().includes("india") || data.display_name?.toLowerCase().includes("india");
              const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
              const isIST = userTimezone === "Asia/Kolkata" || userTimezone === "Asia/Calcutta";
              if (!isIndia && !isIST) {
                if (vpnWarningEl) vpnWarningEl.style.display = "block";
                console.warn("VPN Detected: Location is outside India and Timezone is not IST.");
              } else if (!isIndia && isIST) {
                if (vpnWarningEl) {
                  vpnWarningEl.textContent = "⚠️ VPN Potential: Detect location is outside India, but device time is IST.";
                  vpnWarningEl.style.display = "block";
                }
              } else {
                if (vpnWarningEl) vpnWarningEl.style.display = "none";
              }

              applyCachedLocation({ locStatusEl: statusEl, cityStatusEl });
            })
            .catch(err => {
              locationRequestInProgress = false;
              setStatusElement(statusEl, "Could not reverse-geocode. Enter city and state manually.", "info");
              setStatusElement(cityStatusEl, "Could not reverse-geocode. Enter city and state manually.", "info");
              document.getElementById("city")?.focus();
              console.warn('Optional geocoding unavailable:', err);
            });
        },
        (error) => {
          locationRequestInProgress = false;
          let message = "Location blocked or unavailable. Enter manually.";
          switch (error.code) {
            case error.PERMISSION_DENIED:
              message = "❌ Location access denied. Please allow GPS access.";
              break;
            case error.POSITION_UNAVAILABLE:
              message = "❌ Location information unavailable.";
              break;
            case error.TIMEOUT:
              message = "❌ Location request timed out.";
              break;
          }
          setStatusElement(statusEl, message, "error");
          setStatusElement(cityStatusEl, message, "error");
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0
        }
      );
    }

    // Update vehicle model dropdown based on emission type
    function updateVehicleModelState() {
      const hint = vehModelSelect.nextElementSibling;
      vehModelSelect.innerHTML = '<option value="" data-i18n="select_opt">Select Bus</option>';
      if (EMISSION === "BS-IV") {
        vehModelSelect.disabled = false;
        vehModelSelect.required = true;
        vehModelSelect.innerHTML += '<option value="12M BS‑IV (Retarder)" data-i18n="model_12m">12M Bus</option>';
        vehModelSelect.innerHTML += '<option value="Viking BS‑IV (Retarder)" data-i18n="model_viking">Viking Bus</option>';
        vehModelSelect.innerHTML += '<option value="Other BS‑IV Retarder Bus" data-i18n="model_other">Other BS‑IV Retarder Bus</option>';
        if (hint && hint.tagName.toLowerCase() === 'small') hint.textContent = "Only BS‑IV retarder buses supported";
      } else if (EMISSION === "BS-VI") {
        vehModelSelect.disabled = false;
        vehModelSelect.required = true;
        vehModelSelect.innerHTML += '<option value="13.5M BS‑VI (Retarder)" data-i18n="model_135m">13.5M Bus</option>';
        vehModelSelect.innerHTML += '<option value="12M BS‑VI (Retarder)" data-i18n="model_12m">12M Bus</option>';
        vehModelSelect.innerHTML += '<option value="Viking BS‑VI (Retarder)" data-i18n="model_viking">Viking Bus</option>';
        vehModelSelect.innerHTML += '<option value="Other BS‑VI Retarder Bus" data-i18n="model_other">Other BS‑VI Retarder Bus</option>';
        if (hint && hint.tagName.toLowerCase() === 'small') hint.textContent = "Only BS‑VI retarder buses supported";
      } else if (EMISSION === "VECV") {
        vehModelSelect.disabled = false;
        vehModelSelect.required = true;
        vehModelSelect.innerHTML += '<option value="VECV 6016">VECV 6016</option>';
        vehModelSelect.innerHTML += '<option value="VECV 6019">VECV 6019</option>';
        if (hint && hint.tagName.toLowerCase() === 'small') hint.textContent = "VECV 6016 / VECV 6019 supported";
      } else if (EMISSION === "TML") {
        vehModelSelect.disabled = false;
        vehModelSelect.required = true;
        vehModelSelect.innerHTML += '<option value="TML 1822">TML 1822</option>';
        vehModelSelect.innerHTML += '<option value="TML 1622">TML 1622</option>';
        if (hint && hint.tagName.toLowerCase() === 'small') hint.textContent = "TML 1822 / TML 1622 supported";
      } else {
        vehModelSelect.disabled = true;
        vehModelSelect.required = false;
        if (hint && hint.tagName.toLowerCase() === 'small') hint.textContent = "";
      }
    }

    // Call this when emission is selected
    function onEmissionSelected() {
      updateVehicleModelState();
      autoDetectLocation();
    }

    function autoDetectLocation() {
      if (cachedLocationData) {
        applyCachedLocation({ locStatusEl: locStatus });
      }
    }

    /* Registration & Prechecks */
    goPrecheck.addEventListener("click", handleProceedToTools);

    backToReg?.addEventListener('click', () => { showSection('regCard'); });
    backToComplaint?.addEventListener('click', () => { showSection('complaintCard'); });

    startDiag.addEventListener('click', () => {
      try {
        if (!$("#tool_multimeter").checked && !$("#tool_clamp_meter").checked) {
          alert(t('alert_tools'));
          return;
        }

        if (String(EMISSION).startsWith('TML')) {
          showSection('tmlCard');
          if (typeof window.startTmlDiagnosis === 'function') window.startTmlDiagnosis();
          return;
        }

        console.log('Showing Pre-Diagnostic Instructions');
        showSection('preDiagCard');
        setTimeout(initPreDiagGate, 100);
      } catch (err) {
        console.error('Error in startDiag:', err);
        alert(t('alert_generic_error') + err.message);
      }
    });

    // The former standalone diagnostic flow is disabled. app.js and tml.js
    // are the single active implementations.
    if (false) {
    /* Step interactions (legacy card listeners null-checked) */
    yesBtn?.addEventListener('click', () => {
      lastAnswer = 'YES';
      if (advice) {
        advice.style.display = 'block';
        advice.innerHTML = `<strong class="ok">${typeof t === 'function' ? bi('ok_label') : 'OK'}:</strong> ${typeof bi === 'function' ? bi('advice_ok') : 'Proceed to the next check.'}`;
      }
    });
    noBtn?.addEventListener('click', () => {
      lastAnswer = 'NO';
      const s = steps[i];
      if (advice && s && s.onFail) {
        advice.style.display = 'block';
        advice.innerHTML = `<strong class="bad">${typeof bi === 'function' ? bi('fault') : 'Fault'}:</strong> ${s.onFail.fault}<br><strong>${typeof bi === 'function' ? bi('root_cause') : 'Root Cause'}:</strong> ${s.onFail.root}<br><strong>${typeof bi === 'function' ? bi('action') : 'Action'}:</strong> ${s.onFail.action}`;
      }
    });

    // Helper function to mark wiring nodes based on step ID
    function markNodeForStep(stepId, result) {
      const state = result === 'PASS' ? 'pass' : 'fail';

      if (stepId.includes('conn')) markConn(state);
      if (stepId.includes('speed')) markSpeedBox(state);
      if (stepId.includes('switch')) markSwitch(state);
      if (stepId.includes('aps')) markAPS(state);
      if (stepId.includes('relay')) markRelay(state);
      if (stepId.includes('retarder')) markRetarder(state);
    }

    nextBtn?.addEventListener('click', () => {
      if (!lastAnswer) {
        if (advice) {
          advice.style.display = 'block';
          advice.innerHTML = `<strong>${typeof bi === 'function' ? bi('note_label') : 'Note'}:</strong> ${typeof bi === 'function' ? bi('note_select_ans') : 'Select YES or NO to continue.'}`;
        }
        return;
      }
      const s = steps[i];
      if (s) {
        answers.push({ id: s.id, title: s.title, answer: lastAnswer, fault: lastAnswer === 'NO' ? s.onFail.fault : '', action: lastAnswer === 'NO' ? s.onFail.action : '' });
      }

      // Mark the wiring node based on test result
      if (lastAnswer === 'YES') {
        markNodeForStep(s ? s.id : '', 'PASS');
      } else {
        markNodeForStep(s ? s.id : '', 'FAIL');
      }

      if (lastAnswer === 'NO') { finish('FAIL', s); return; }
      if (i < steps.length - 1) { i++; legacyRenderStep(i); } else { finish('PASS', null); }
    });

    restartBtn?.addEventListener('click', () => {
      stopTimer();
      hide(stepCard); hide(progCard); hide(preDiagCard); show(preCard);
      if (progressBar) progressBar.style.width = '0%';
      if (progHint) progHint.textContent = t('not_started');
      if (progTag) progTag.textContent = t('ready');
    });

    /* Finish & Report */
    function finish(outcome, failedStep) {
      if (typeof stopTimer === 'function') stopTimer();
      hide(stepCard);
      show(resultCard);
      if (progressBar) progressBar.style.width = '100%';
      if (progHint) progHint.textContent = '100% ' + t('complete');
      if (progTag) progTag.textContent = t('complete');

      const end = Date.now();
      const durationMs = startedAt ? (end - startedAt) : 0;
      const durationText = formatTime(durationMs);

      // Collect data (reuse elements defined in script)
      const tName = techName.value || "-";
      const tPhone = techPhone.value || "-";
      const dName = document.getElementById("dealerName")?.value || "-";
      const cCity = document.getElementById("city")?.value || "-";
      const sState = document.getElementById("state")?.value || "-";
      const vReg = (vehReg.value || "-").toUpperCase();
      const vOdo = document.getElementById("odometer")?.value || "-";
      const vChassis = (document.getElementById("chassisNo")?.value || "-").toUpperCase();
      const vModelEl = document.getElementById("vehModel");
      const vModel = vModelEl ? (vModelEl.options[vModelEl.selectedIndex]?.text || "-") : "-";
      const techTypeEl = document.getElementById("techType");
      const vType = techTypeEl ? (techTypeEl.options[techTypeEl.selectedIndex]?.text || "-") : "-";

      // Odometer Recommendation Logic
      const vOdoNum = Number(vOdo.replace(/[^0-9]/g, ''));
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

      const stepHtml = answers.map((a, idx) => `
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding:10px; border:1px solid #e2e8f0; white-space:nowrap; width:50px; text-align:center; font-weight:600;">${String(idx + 1).padStart(2, '0')}</td>
          <td style="padding:10px; border:1px solid #e2e8f0;">${a.title}</td>
          <td style="padding:10px; border:1px solid #e2e8f0; font-weight:800; ${a.answer === 'YES' ? 'color:#16a34a' : 'color:#dc2626'}">${a.answer === 'YES' ? t('yes') : t('no')}</td>
          <td style="padding:10px; border:1px solid #e2e8f0;">${a.fault || '-'}</td>
          <td style="padding:10px; border:1px solid #e2e8f0;">${a.action || '-'}</td>
        </tr>`).join('');

      resultSummary.innerHTML = `
        <div style="background:#f8fafc; border:2px solid #e2e8f0; border-radius:12px; padding:24px; margin-bottom:24px; font-family:'Outfit', sans-serif;">
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:24px;">
                <div>
                    <h4 style="margin:0 0 12px; color:#0B5DAA; font-size:14px; text-transform:uppercase; letter-spacing:1px; border-bottom:1px solid #dbeafe; padding-bottom:4px;">${t('rep_tech_details')}</h4>
                    <p style="margin:4px 0; font-size:15px;"><strong>${t('rep_name')}:</strong> ${tName}</p>
                    <p style="margin:4px 0; font-size:15px;"><strong>${t('rep_phone')}:</strong> ${tPhone}</p>
                    <p style="margin:4px 0; font-size:15px;"><strong>${t('rep_workshop')}:</strong> ${dName}</p>
                    <p style="margin:4px 0; font-size:15px;"><strong>${t('rep_location')}:</strong> ${cCity}, ${sState}</p>
                </div>
                <div>
                    <h4 style="margin:0 0 12px; color:#0B5DAA; font-size:14px; text-transform:uppercase; letter-spacing:1px; border-bottom:1px solid #dbeafe; padding-bottom:4px;">${t('rep_veh_details')}</h4>
                    <p style="margin:4px 0; font-size:15px;"><strong>${t('rep_reg_no')}:</strong> ${vReg}</p>
                    <p style="margin:4px 0; font-size:15px;"><strong>${t('rep_model')}:</strong> ${vModel}</p>
                    <p style="margin:4px 0; font-size:15px;"><strong>${t('rep_odometer')}:</strong> ${vOdo} km</p>
                    <p style="margin:4px 0; font-size:15px;"><strong>${t('rep_chassis')}:</strong> ${vChassis}</p>
                </div>
            </div>
            
            <div style="margin-top:24px; background:#fff; border:1px solid #dbeafe; border-radius:10px; padding:16px;">
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:24px;">
                    <div>
                        <h4 style="margin:0 0 12px; color:#64748b; font-size:12px; text-transform:uppercase;">${t('rep_diag_summary')}</h4>
                        <p style="margin:4px 0; font-size:16px;"><strong>${t('rep_outcome')}:</strong> <span style="background:${outcome === 'PASS' ? '#ecfdf5' : '#fee2e2'}; color:${outcome === 'PASS' ? '#16a34a' : '#dc2626'}; padding:2px 8px; border-radius:4px; font-weight:800;">${outcome === 'PASS' ? t('outcome_pass') : t('outcome_fail')}</span></p>
                        <p style="margin:4px 0; font-size:14px; color:#64748b;"><strong>${t('rep_duration')}:</strong> ${durationText}</p>
                        <p style="margin:4px 0; font-size:14px; color:#64748b;"><strong>${t('rep_date')}:</strong> ${new Date(end).toLocaleString()}</p>
                    </div>
                    <div>
                        <h4 style="margin:0 0 12px; color:#64748b; font-size:12px; text-transform:uppercase;">${t('rep_result_detail')}</h4>
                        ${outcome === 'FAIL' && failedStep ? `
                          <div style="color:#b91c1c; font-weight:600; font-size:15px; border-left:4px solid #ef4444; padding-left:12px; line-height:1.5;">
                            <strong>${t('rep_fault')}:</strong> ${t(failedStep.onFail.fault)}<br>
                            <strong>${t('rep_root_cause')}:</strong> ${t(failedStep.onFail.root)}<br>
                            <strong>${t('rep_action')}:</strong> ${t(failedStep.onFail.action)}
                          </div>
                        ` : `
                          <div style="color:#166534; font-weight:600; font-size:15px; border-left:4px solid #22c55e; padding-left:12px; line-height:1.5;">
                            ${t('rep_diag_passed')}
                          </div>
                        `}
                    </div>
                </div>
            </div>
        </div>
        ${odoRecommendationHtml}

        <h4 style="margin:0 0 12px; color:#0f172a; font-weight:700;">${t('rep_step_history')}</h4>
        <div style="overflow:hidden; border:1px solid #e2e8f0; border-radius:10px; margin-top:10px">
          <table style="width:100%; border-collapse:collapse; font-size:14px;">
            <thead>
              <tr style="background:#f1f5f9;">
                <th style="padding:12px; border-bottom:2px solid #e2e8f0; text-align:center; color:#475569; width:50px; white-space:nowrap;">#</th>
                <th style="padding:12px; border-bottom:2px solid #e2e8f0; text-align:left; color:#475569;">${t('rep_step')}</th>
                <th style="padding:12px; border-bottom:2px solid #e2e8f0; text-align:left; color:#475569;">${t('rep_answer')}</th>
                <th style="padding:12px; border-bottom:2px solid #e2e8f0; text-align:left; color:#475569;">${t('rep_fault')}</th>
                <th style="padding:12px; border-bottom:2px solid #e2e8f0; text-align:left; color:#475569;">${t('rep_action')}</th>
              </tr>
            </thead>
            <tbody>${stepHtml}</tbody>
          </table>
        </div>
        <div style="margin-top:30px; text-align:center; color:#94a3b8; font-size:12px; border-top:1px dashed #e2e8f0; padding-top:20px;">
            ${t('rep_generated_by')}
        </div>`;

      // Auto trigger print removed to allow user manual control
    }

    // Initialize buttons with error handling
    const printBtn = document.getElementById('printBtn');
    const newBtn = document.getElementById('newBtn');
    const retryBtn = document.getElementById('retryBtn');

    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        if (typeof window.retryFailedStep === 'function') {
          window.retryFailedStep();
        }
      });
    }

    if (printBtn) {
      printBtn.addEventListener('click', () => {
        try {
          const pd = document.getElementById('printDate');
          if (pd) pd.textContent = new Date().toLocaleString();
          // ensure result card visible for print
          show(resultCard);
          // show print header only when printing
          const ph = document.querySelector('.printHeader');
          if (ph) ph.style.display = 'block';
          window.print();
          if (ph) ph.style.display = 'none';
        } catch (error) {
          console.error('Print failed:', error);
        }
      });
    }

    if (newBtn) {
      newBtn.addEventListener('click', () => {
        // 0. First hide everything to prevent UI flashes/modals being triggered by reset
        const allCards = document.querySelectorAll('section.card, .container:not(#splash), #emissionSelect');
        allCards.forEach(card => {
          card.style.display = 'none';
          card.classList.remove('active');
          card.style.opacity = '1'; // Reset opacity for future shows
        });

        // 1. Reset Internal Logic (app.js)
        if (typeof window.resetWizardState === 'function') {
          window.resetWizardState();
        }

        // 2. Reset Multi-step states (index.html)
        i = 0;
        lastAnswer = null;
        answers = [];
        startedAt = null;
        EMISSION = null;
        steps = []; // Clear current steps

        // 3. Clear Form Fields
        const fields = ['techName', 'techPhone', 'dealerName', 'city', 'odometer', 'chassisNo', 'vehReg', 'vehModel'];
        fields.forEach(id => {
          const el = document.getElementById(id);
          if (el) el.value = '';
        });

        // 4. Reset Checklist & Tools
        const prechecks = document.querySelectorAll('input.precheck, .precheck input');
        prechecks.forEach(cb => cb.checked = false);
        const multimeter = document.getElementById("tool_multimeter");
        const clampmeter = document.getElementById("tool_clamp_meter");
        if (multimeter) multimeter.checked = false;
        if (clampmeter) clampmeter.checked = false;

        // 5. Reset Wiring Diagram Visuals
        if (typeof resetWiringFlow === 'function') resetWiringFlow();

        // 6. Navigate to Emission Selection exclusively
        showSection('emissionSelect');
      });
    }

    }

    // Retarder Simulation JS
    let speed = 0;
    let rpm = 600;
    let prevSpeed = 0;
    let accelerating = false;
    let braking = false;
    let retarderOn = false;
    let lastRetarderOn = false;
    let accelInterval = null;
    let brakeInterval = null;
    let accSoundPlaying = false;
    let brakeSoundPlaying = false;

    const retarderSound = document.getElementById("retarderSound");
    const accSound = document.getElementById("accSound");
    const brakeSound = document.getElementById("brakeSound");

    // --- Engine sound model ---
    let engineStarted = false;
    let engineVol = 0.15;        // current volume
    let engineRate = 0.9;        // current playback rate
    const IDLE_VOL = 0.12;       // idle volume
    const THROTTLE_VOL = 0.55;   // volume when accelerating
    const IDLE_RATE = 0.85;      // idle pitch
    const MAX_RATE = 1.55;       // high pitch

    // Initialize retarder sound loop
    if (retarderSound) retarderSound.loop = true;

    // Initialize engine audio on user gesture
    function startEngineAudioOnce() {
      if (engineStarted || !accSound) return;
      engineStarted = true;

      accSound.loop = true;
      accSound.volume = IDLE_VOL;
      accSound.playbackRate = IDLE_RATE;

      accSound.play().catch(() => { });
    }

    // MAIN PHYSICS & DASHBOARD LOOP (50ms tick)
    setInterval(() => {
      // Skip physics when all simulation containers are hidden (saves CPU)
      const simPanel = document.getElementById('simPanel');
      const driverSimCard = document.getElementById('driverSimCard');
      const switchPanel = document.getElementById('switchPanel');
      const preDiagCard = document.getElementById('preDiagCard');

      const isVisible = (el) => {
        if (!el) return false;
        try {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden';
        } catch (e) {
          return el.style.display !== 'none';
        }
      };

      if (!isVisible(simPanel) && !isVisible(driverSimCard) && !isVisible(switchPanel) && !isVisible(preDiagCard)) return;

      // 1. Natural drag when no pedals pressed
      if (!accelerating && !braking && speed > 0) {
        speed -= 0.25;
        if (speed < 0) speed = 0;
      }

      // 2. Engine RPM calculation
      if (accelerating) {
        let targetRpm = 600 + (speed / 80) * 1700 + Math.random() * 25;
        rpm += (targetRpm - rpm) * 0.2;
      } else if (speed > 0) {
        let targetRpm = 600 + (speed / 80) * 1100;
        rpm += (targetRpm - rpm) * 0.15;
      } else {
        rpm += (600 - rpm) * 0.2;
      }
      rpm = Math.min(2400, Math.max(600, rpm));

      // 3. Update speed and dashboard gauges
      const displays = document.querySelectorAll(".js-speed-display");
      displays.forEach(d => d.innerText = Math.round(speed));

      const simSpeedDisplay = document.getElementById("simSpeedDisplay");
      if (simSpeedDisplay) simSpeedDisplay.innerText = Math.round(speed);

      const speedBars = document.querySelectorAll(".js-speed-bar");
      speedBars.forEach(bar => bar.style.width = Math.min(100, (speed / 80) * 100) + "%");

      const rpmDisplays = document.querySelectorAll(".js-rpm-display");
      rpmDisplays.forEach(d => d.innerText = Math.round(rpm));

      const rpmBars = document.querySelectorAll(".js-rpm-bar");
      rpmBars.forEach(bar => {
        let pct = Math.min(100, Math.max(0, ((rpm - 600) / 1800) * 100));
        bar.style.width = pct + "%";
      });

      // 4. Update Drive & Pedal Status Badges
      const driveStatusText = document.querySelectorAll(".js-drive-status");
      const driveStatusDot = document.querySelectorAll(".js-status-dot");

      if (retarderOn) {
        driveStatusText.forEach(el => el.innerText = "RETARDER ENGAGED");
        driveStatusDot.forEach(dot => dot.style.background = "#ef4444");
      } else if (accelerating) {
        driveStatusText.forEach(el => el.innerText = "THROTTLE ACTIVE");
        driveStatusDot.forEach(dot => dot.style.background = "#10b981");
      } else if (braking) {
        driveStatusText.forEach(el => el.innerText = "FOOT BRAKING");
        driveStatusDot.forEach(dot => dot.style.background = "#f59e0b");
      } else {
        driveStatusText.forEach(el => el.innerText = "COASTING");
        driveStatusDot.forEach(dot => dot.style.background = "#64748b");
      }

      updateWheel();
      updateRetarder();

      // Track deceleration
      prevSpeed = speed;

      // 5. Engine audio pitch & volume sync
      if (engineStarted && accSound) {
        if (!accelerating && speed < 1) {
          engineVol *= 0.9;
          if (engineVol < 0.01) {
            accSound.pause();
            engineStarted = false;
            engineVol = 0.15;
          } else {
            accSound.volume = engineVol;
          }
        } else {
          const targetVol = accelerating ? THROTTLE_VOL : IDLE_VOL;
          const speedFactor = Math.min(speed / 80, 1);
          const throttleBoost = accelerating ? 0.35 : 0.0;
          const targetRate = IDLE_RATE + speedFactor * (MAX_RATE - IDLE_RATE) + throttleBoost;
          const clampedRate = Math.min(Math.max(targetRate, IDLE_RATE), MAX_RATE);

          engineVol += (targetVol - engineVol) * 0.1;
          engineRate += (clampedRate - engineRate) * 0.1;

          accSound.volume = engineVol;
          accSound.playbackRate = engineRate;

          if (accSound.paused) accSound.play().catch(() => { });
        }
      }
    }, 50);

    // PEDAL CONTROLS WITH SMOOTH PHYSICS
    function accelerate(state) {
      if (state === accelerating) return;
      accelerating = state;

      document.querySelectorAll(".js-acc-pedal").forEach(el => el.classList.toggle("pressed", state));
      const simAccelPedal = document.getElementById("simAccelPedal");
      if (simAccelPedal) simAccelPedal.classList.toggle("accel-active", state);

      if (state) startEngineAudioOnce();

      if (state) {
        clearInterval(accelInterval);
        accelInterval = setInterval(() => {
          if (speed < 80) {
            // Torque curve: slow initial heavy bus pickup (0-10 km/h) to clearly demonstrate Retarder 5 km/h threshold
            let inc = (speed < 10) ? 0.12 : (speed < 60 ? 0.6 : 0.4);
            speed = Math.min(80, speed + inc);
          }
        }, 50);
      } else {
        clearInterval(accelInterval);
      }
    }

    function brake(state) {
      if (state === braking) return;
      braking = state;

      document.querySelectorAll(".js-brake-pedal").forEach(el => el.classList.toggle("pressed", state));
      const simBrakePedal = document.getElementById("simBrakePedal");
      if (simBrakePedal) simBrakePedal.classList.toggle("brake-active", state);

      if (state) {
        if (speed > 2 && brakeSound && !brakeSoundPlaying) {
          brakeSoundPlaying = true;
          brakeSound.currentTime = 0;
          brakeSound.play().catch(() => { });
        }
        clearInterval(brakeInterval);
        brakeInterval = setInterval(() => {
          if (speed > 0) {
            // Retarder progressive braking: smooth gradual deceleration (0.45 km/h per tick) when Retarder is active
            let decelForce = (speed >= 5) ? 0.45 : 0.25;
            speed = Math.max(0, speed - decelForce);
          }

          if (speed <= 1 && brakeSoundPlaying && brakeSound) {
            brakeSound.pause();
            brakeSoundPlaying = false;
          }
        }, 50);
      } else {
        clearInterval(brakeInterval);
        if (brakeSoundPlaying && brakeSound) {
          brakeSound.pause();
          brakeSoundPlaying = false;
        }
      }
    }

    // BUS SIMULATION LOGIC
    let roadPos = 0;
    let obstacleTimer = 0;

    function updateWheel() {
      const roads = document.querySelectorAll(".js-road-layer");
      const cities = document.querySelectorAll(".js-city-layer");
      const simRoadLanes = document.getElementById("simRoadLanes");
      const buses = document.querySelectorAll(".js-bus-element");
      const simBusWrapper = document.getElementById("simBusWrapper");
      const wheels = document.querySelectorAll(".js-bus-wheel");
      const simWheelFront = document.getElementById("simWheelFront");
      const simWheelRear = document.getElementById("simWheelRear");
      const obsLayers = document.querySelectorAll(".js-obstacle-layer");

      if (speed > 0) {
        roadPos -= speed * 0.8;
        if (roadPos <= -1800) roadPos += 1800;
        roads.forEach(r => r.style.transform = `translate3d(${roadPos.toFixed(1)}px, 0, 0)`);
        let cityPos = roadPos * 0.3;
        cities.forEach(c => c.style.transform = `translate3d(${cityPos.toFixed(1)}px, 0, 0)`);
        if (simRoadLanes) simRoadLanes.style.transform = `translateY(-50%) translate3d(${roadPos.toFixed(1)}px, 0, 0)`;

        buses.forEach(b => b.classList.add("bus-vibrate"));
        if (simBusWrapper) {
          const bounce = (Math.sin(Date.now() / 80) * Math.min(speed / 25, 2.5)).toFixed(1);
          simBusWrapper.style.transform = `translateY(${bounce}px)`;
        }

        wheels.forEach(w => {
          let spinTime = Math.max(0.08, 1.2 - speed / 50);
          w.style.animation = `wheelSpin ${spinTime}s linear infinite`;
        });

        let wheelAngle = (Date.now() * speed * 0.5) % 360;
        if (simWheelFront) simWheelFront.style.transform = `rotate(${wheelAngle}deg)`;
        if (simWheelRear) simWheelRear.style.transform = `rotate(${wheelAngle}deg)`;

        obstacleTimer += speed;
        if (obstacleTimer > 3500) {
          obsLayers.forEach(layer => spawnObstacle(layer));
          obstacleTimer = 0;
        }
      } else {
        buses.forEach(b => b.classList.remove("bus-vibrate"));
        if (simBusWrapper) simBusWrapper.style.transform = 'translateY(0)';
        wheels.forEach(w => w.style.animation = "none");
      }

      const activeObs = document.querySelectorAll(".obstacle");
      activeObs.forEach(obs => {
        let currentLeft = parseFloat(obs.dataset.pos || 120);
        currentLeft -= (speed * 0.6 + 5);
        obs.style.left = currentLeft + "px";
        obs.dataset.pos = currentLeft;
        if (currentLeft < -100) obs.remove();
      });

      buses.forEach(b => {
        if (retarderOn) {
          b.style.filter = "drop-shadow(0 0 16px rgba(239, 68, 68, 0.9))";
        } else {
          b.style.filter = "none";
        }
      });
      if (simBusWrapper) {
        const busBody = simBusWrapper.querySelector('.bus-body');
        if (busBody) {
          if (retarderOn) {
            busBody.style.filter = "drop-shadow(0 0 16px rgba(239, 68, 68, 0.9))";
          } else {
            busBody.style.filter = "none";
          }
        }
      }
    }

    function spawnObstacle(layer) {
      if (!layer) return;
      const obs = document.createElement("div");
      obs.className = "obstacle";
      obs.style.left = "100%";
      obs.dataset.pos = 500;
      layer.appendChild(obs);
    }

    // RETARDER LOGIC
    function setRetarder(state) {
      if (!retarderSound) return;
      if (state && retarderSound.paused) {
        retarderSound.currentTime = 0;
        retarderSound.play().catch(() => { });
      }
      if (!state) {
        retarderSound.pause();
      }
    }

    function updateRetarder() {
      const isSpeedOk = speed >= 5;
      const isRetarding = isSpeedOk && braking;
      retarderOn = isRetarding;

      if (retarderOn !== lastRetarderOn) {
        setRetarder(retarderOn);
        lastRetarderOn = retarderOn;
      }

      const statusEls = document.querySelectorAll(".js-retarder-status");
      const iconEls = document.querySelectorAll(".js-retarder-icon");
      const textEls = document.querySelectorAll(".js-retarder-text");
      const stageEls = document.querySelectorAll(".js-retarder-stage");
      const powerTextEls = document.querySelectorAll(".js-retarder-power-text");
      const retarderBars = document.querySelectorAll(".js-retarder-bar");

      const simRetarderStatus = document.getElementById("simRetarderStatus");
      const simStatusText = document.getElementById("simStatusText");

      if (isRetarding) {
        statusEls.forEach(el => el.className = "retarder on js-retarder-status");
        textEls.forEach(el => el.innerText = (typeof t === 'function' ? t('pd_sim_ret_on') : 'RETARDER ON'));
        iconEls.forEach(el => {
          el.style.filter = "drop-shadow(0 0 10px rgba(34, 197, 94, 0.9)) grayscale(0) opacity(1)";
          el.style.transform = "scale(1.35)";
          el.style.transition = "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.3s ease";
        });

        if (simRetarderStatus) simRetarderStatus.className = "sim-retarder-banner on";
        if (simStatusText) simStatusText.innerText = (typeof t === 'function' ? t('pd_sim_ret_on') : 'RETARDER ON');

        let powerPct = Math.min(100, Math.round(50 + (speed / 80) * 50));
        stageEls.forEach(el => el.innerText = powerPct + "%");
        powerTextEls.forEach(el => el.innerText = "STAGE 1 ACTIVE");
        retarderBars.forEach(bar => bar.style.width = powerPct + "%");
      } else if (isSpeedOk) {
        statusEls.forEach(el => el.className = "retarder ready js-retarder-status");
        textEls.forEach(el => el.innerText = (typeof t === 'function' ? t('pd_sim_ready') : 'RETARDER READY FOR OPERATION'));
        iconEls.forEach(el => {
          el.style.filter = "drop-shadow(0 0 5px rgba(234, 179, 8, 0.6)) grayscale(0) opacity(0.85)";
          el.style.transform = "scale(1.1)";
          el.style.transition = "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.3s ease";
        });

        if (simRetarderStatus) simRetarderStatus.className = "sim-retarder-banner ready";
        if (simStatusText) simStatusText.innerText = (typeof t === 'function' ? t('pd_sim_ready') : 'RETARDER READY');

        stageEls.forEach(el => el.innerText = "READY");
        powerTextEls.forEach(el => el.innerText = "STANDBY (≥5 km/h)");
        retarderBars.forEach(bar => bar.style.width = "10%");
      } else {
        statusEls.forEach(el => el.className = "retarder off js-retarder-status");
        textEls.forEach(el => el.innerText = (typeof t === 'function' ? t('pd_sim_ret_off') : 'RETARDER OFF'));
        iconEls.forEach(el => {
          el.style.filter = "grayscale(1) opacity(0.3)";
          el.style.transform = "scale(1)";
          el.style.transition = "transform 0.3s ease, filter 0.3s ease";
        });

        if (simRetarderStatus) simRetarderStatus.className = "sim-retarder-banner off";
        if (simStatusText) simStatusText.innerText = (typeof t === 'function' ? t('pd_sim_ret_off') : 'RETARDER OFF');

        stageEls.forEach(el => el.innerText = "0%");
        powerTextEls.forEach(el => el.innerText = "INACTIVE (<5 km/h)");
        retarderBars.forEach(bar => bar.style.width = "0%");
      }
    }

    // BULLETPROOF PEDAL RELEASE SAFEGUARDS
    function forceReleaseAllPedals() {
      accelerate(false);
      brake(false);
    }

    window.addEventListener("mouseup", forceReleaseAllPedals);
    window.addEventListener("pointerup", forceReleaseAllPedals);
    window.addEventListener("pointercancel", forceReleaseAllPedals);
    window.addEventListener("touchend", forceReleaseAllPedals, { passive: true });
    window.addEventListener("touchcancel", forceReleaseAllPedals, { passive: true });
    window.addEventListener("blur", forceReleaseAllPedals);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) forceReleaseAllPedals();
    });

    // Safety Checklist Logic
    function initPreDiagGate() {
      // Prefer the actual input elements. Support both `input.precheck` and containers with `.precheck input`.
      const prechecks = Array.from(document.querySelectorAll('input.precheck, .precheck input'));
      const proceedBtn = document.getElementById('proceedBtn');

      if (!proceedBtn) return;

      function checkAllRequired() {
        const allChecked = prechecks.length === 0 ? true : prechecks.every(checkbox => checkbox.checked);
        console.log('[initPreDiagGate] prechecks:', prechecks.length, 'allChecked:', allChecked);
        prechecks.forEach((cb, i) => console.log('[initPreDiagGate] cb', i, 'checked=', cb.checked));
        proceedBtn.disabled = !allChecked;
        proceedBtn.setAttribute('aria-disabled', !allChecked);
        // Visual hint (in case CSS styles a .disabled class)
        proceedBtn.classList.toggle('disabled', !allChecked);
      }

      // Add event listeners to all precheck inputs and attach label click fallback
      prechecks.forEach((checkbox, idx) => {
        checkbox.addEventListener('change', (e) => {
          console.log('[initPreDiagGate] change event on', e.target);
          checkAllRequired();
        });

        // If the input is wrapped in a label (common pattern), attach a click handler
        const label = checkbox.closest('label');
        if (label) {
          label.addEventListener('click', (ev) => {
            // Allow the browser to toggle the checkbox first, then check state.
            setTimeout(() => {
              // If for some reason the checkbox did not toggle (custom UI), toggle it manually.
              if (typeof checkbox.checked === 'boolean') {
                // nothing extra — just re-evaluate
                console.log('[initPreDiagGate] label click; checkbox state now', checkbox.checked);
                checkAllRequired();
              }
            }, 0);
          });
        }
      });

      // Initial check
      checkAllRequired();
    }

    // Enhanced switch press function

    // Ensure pre-diagnostic gate is initialized once DOM is ready.
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initPreDiagGate);
    } else {
      initPreDiagGate();
    }


    function goToECUTest() {
      if (String(EMISSION).startsWith('TML')) {
        if (typeof window.startTmlDiagnosis === 'function') {
          const preDiagCard = document.getElementById('preDiagCard');
          if (preDiagCard) {
            preDiagCard.style.display = 'none';
            preDiagCard.classList.remove('active');
          }
          window.startTmlDiagnosis();
          return;
        }
      }

      // Initialize standard mode elements (nodes/links)
      if (typeof initializeStandardMode === 'function') {
        initializeStandardMode();
      }

      // Hide Pre-Diagnostic Instructions
      const preDiagCard = document.getElementById('preDiagCard');
      if (preDiagCard) {
        preDiagCard.style.display = 'none';
        preDiagCard.classList.remove('active');
      }

      // Hide all other sections except guidedFlowCard
      const allSections = document.querySelectorAll('section.card');
      allSections.forEach(section => {
        if (section.id !== 'guidedFlowCard') {
          if (typeof hide === 'function') {
            hide(section);
          } else {
            section.style.display = 'none';
            section.classList.remove('active');
          }
        }
      });

      // Show Guided Steps pager and questions
      const guidedFlowCard = document.getElementById('guidedFlowCard');
      const standardModeTestSection = document.getElementById('standardModeTestSection');
      if (guidedFlowCard) {
        if (typeof show === 'function') {
          show(guidedFlowCard);
        } else {
          guidedFlowCard.style.display = 'block';
          guidedFlowCard.classList.add('active');
          guidedFlowCard.style.opacity = '1';
        }
        guidedFlowCard.scrollIntoView({ behavior: 'smooth' });
        if (typeof window.startMainTimer === 'function') window.startMainTimer();
      }
      // Show questions section inside Guided Steps
      if (standardModeTestSection) {
        if (typeof show === 'function') {
          show(standardModeTestSection);
        } else {
          standardModeTestSection.style.display = 'block';
          standardModeTestSection.classList.add('active');
          standardModeTestSection.style.opacity = '1';
        }
      }
      console.log('[goToECUTest] → showing guidedFlowCard and questions');
    }

    /* Guided Flow removed - Step 1 Wizard is primary entry point */

    // Standard Mode System Logic moved higher up or remains here as needed

    // ===== Standard Mode System =====
    let currentMode = 'standard';

    const STANDARD_FLOW = ['conn', 'speed', 'switch', 'aps', 'relay', 'retarder'];

    const NODE_ID_MAP = {
      'conn': { wrap: 'wf-conn-wrap', link0: 'wf-link-0', link0b: 'wf-link-0b' },
      'speed': { wrap: 'wf-speed-wrap', link0b: 'wf-link-0b' },
      'switch': { wrap: 'wf-switch-wrap', link1: 'wf-link-1' },
      'aps': { wrap: 'wf-aps-wrap', link2: 'wf-link-2' },
      'relay': { wrap: 'wf-relay-wrap', link3: 'wf-link-3' },
      'retarder': { wrap: 'wf-retarder-wrap' }
    };

    function initializeStandardMode() {
      // Initialize standard mode content
      renderWiringForStandard();
      const testSection = document.getElementById('standardModeTestSection');
      if (testSection) {
        if (typeof show === 'function') {
          show(testSection);
        } else {
          testSection.style.display = 'block';
          testSection.style.opacity = '1';
        }
      }
    }

    function renderWiringForStandard() {
      // Hide all wf-node-wrap and wf-link elements first
      const allWraps = document.querySelectorAll('.wf-node-wrap');
      const allLinks = document.querySelectorAll('.wf-link');

      allWraps.forEach(w => w.classList.add('hidden'));
      allLinks.forEach(l => l.classList.add('hidden'));

      // Show all nodes for standard mode: conn → speed → switch → aps → relay → retarder
      showNode('conn');
      showLink('wf-link-0');
      showNode('speed');
      showLink('wf-link-0b');
      showNode('switch');
      showLink('wf-link-1');
      showNode('aps');
      showLink('wf-link-2');
      showNode('relay');
      showLink('wf-link-3');
      showNode('retarder');
    }

    function showNode(nodeName) {
      // Avoid :has() for better browser/WebView compatibility.
      const nodeEl = document.querySelector(`[id^="wf-${nodeName}"][id$="-wrap"]`);
      if (nodeEl) nodeEl.classList.remove('hidden');
      // Alternative: find parent wrap by iterating
      const nodeId = `wf-${nodeName}`;
      const node = document.getElementById(nodeId);
      if (node) {
        const wrap = node.closest('.wf-node-wrap');
        if (wrap) wrap.classList.remove('hidden');
      }
    }

    function showLink(linkId) {
      const link = document.getElementById(linkId);
      if (link) link.classList.remove('hidden');
    }

    // Completion message for Step 1 Wizard or Skip Guided
    function showCompletionMessage(title, message) {
      const completionCard = document.createElement('div');
      completionCard.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); background:#fff; padding:40px; border-radius:12px; box-shadow:0 10px 40px rgba(0,0,0,0.2); max-width:500px; text-align:center; z-index:1000;';
      completionCard.innerHTML = `
    <h2 style="color:#0B5DAA; margin-bottom:16px; font-size:24px;">${title}</h2>
    <p style="color:#4b5563; font-size:16px; line-height:1.6; margin-bottom:20px;">${message}</p>
    <button onclick="document.getElementById('newBtn').click()" style="background:#0B5DAA; color:white; border:none; padding:12px 24px; border-radius:8px; font-weight:700; cursor:pointer;">${typeof t === 'function' ? t('new_diag') : 'Start New Diagnosis'}</button>
  `;
      document.body.appendChild(completionCard);
    }

    function startDiagnosticsAfterStep1() {
      // After Step 1 Wizard completes, show completion message
      const testSection = document.getElementById('standardModeTestSection');
      const guidedFlowCard = document.getElementById('guidedFlowCard');

      if (testSection) hide(testSection);

      // Show completion message
      if (guidedFlowCard) {
        const completionMsg = document.createElement('div');
        completionMsg.style.cssText = 'text-align:center; padding:30px; font-size:18px; color:#2e7d32; background:#e8f5e9; border-radius:12px; margin-top:20px;';
        completionMsg.innerHTML = `<strong>✅ ${typeof t === 'function' ? t('wizard_complete') : 'Step 1 Wizard Complete!'}</strong><br><br>${typeof t === 'function' ? t('wizard_pass_msg') : 'All connector tests passed. Diagnosis complete.'}`;
        guidedFlowCard.querySelector('.card-b').appendChild(completionMsg);
      }
    }

    /* ===== Driver Simulation Card Controls Setup ===== */
    (function initDriverSimCardControls() {
      function bindPedals() {
        const accelPedal = document.getElementById('simAccelPedal');
        const brakePedal = document.getElementById('simBrakePedal');

        function setupPedal(pedalEl, pedalFn) {
          if (!pedalEl) return;

          const startPress = (e) => {
            if (e.cancelable) e.preventDefault();
            pedalFn(true);
          };

          const endPress = (e) => {
            pedalFn(false);
          };

          pedalEl.addEventListener('mousedown', startPress);
          pedalEl.addEventListener('mouseup', endPress);
          pedalEl.addEventListener('mouseleave', endPress);

          pedalEl.addEventListener('pointerdown', startPress);
          pedalEl.addEventListener('pointerup', endPress);
          pedalEl.addEventListener('pointercancel', endPress);
          pedalEl.addEventListener('pointerleave', endPress);

          pedalEl.addEventListener('touchstart', startPress, { passive: false });
          pedalEl.addEventListener('touchend', endPress, { passive: false });
          pedalEl.addEventListener('touchcancel', endPress, { passive: false });
        }

        setupPedal(accelPedal, accelerate);
        setupPedal(brakePedal, brake);
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindPedals);
      } else {
        bindPedals();
      }
    })();
