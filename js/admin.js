const apiBase = window.RIQ_API_BASE_URL || '';
    let token = sessionStorage.getItem('riq_admin_token') || '';
    let cases = [];
    let analyticsCases = [];
    let summary = { total: 0, faults: 0, working: 0, incomplete: 0, forwarded: 0, pending_forwarding: 0, manufacturers: [] };
    let pagination = { page: 1, pageSize: 50, total: 0, totalPages: 0 };
    let refreshInFlight = false;
    let adminEventsAbortController = null;
    let adminEventsReconnectTimer = null;
    const $ = (id) => document.getElementById(id);
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
    function animateNumber(element, target, suffix = '') {
      if (!element) return;
      const end = Number(target) || 0;
      const start = Number(element.dataset.value || 0);
      element.dataset.value = String(end);
      const started = performance.now();
      const duration = 1800;
      const tick = now => {
        const progress = Math.min(1, (now - started) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        element.textContent = Math.round(start + (end - start) * eased) + suffix;
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
    async function api(path, options = {}) {
      const response = await fetch(`${apiBase}${path}`, { ...options, headers: { 'Content-Type':'application/json', Authorization:`Bearer ${token}`, ...(options.headers || {}) } });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        token = '';
        sessionStorage.removeItem('riq_admin_token');
        $('dashboard').classList.add('hidden');
        $('loginCard').classList.remove('hidden');
        $('loginStatus').textContent = 'Your admin session expired. Please sign in again.';
      }
      if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
      return data;
    }
    function showDashboard() { $('loginCard').classList.add('hidden'); $('dashboard').classList.remove('hidden'); loadAll(); connectAdminEvents(); }
    async function connectAdminEvents() {
      if (!token || adminEventsAbortController) return;
      adminEventsAbortController = new AbortController();
      try {
        const response = await fetch(`${apiBase}/api/admin/events`, { headers: { Authorization: `Bearer ${token}` }, signal: adminEventsAbortController.signal });
        if (!response.ok || !response.body) throw new Error(`SSE connection failed (${response.status})`);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (token) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const messages = buffer.split('\n\n');
          buffer = messages.pop() || '';
          messages.forEach(message => {
            if (message.includes('event: diagnostic-updated')) loadAll();
          });
        }
      } catch (error) {
        if (error.name !== 'AbortError' && token) console.warn('[Admin events] Reconnecting:', error.message);
      } finally {
        adminEventsAbortController = null;
        if (token) {
          clearTimeout(adminEventsReconnectTimer);
          adminEventsReconnectTimer = setTimeout(connectAdminEvents, 5000);
        }
      }
    }
    function updateKpis(userCount) {
      animateNumber($('kpiTotal'), summary.total || 0);
      animateNumber($('kpiFaults'), summary.faults || 0);
      animateNumber($('kpiWorking'), summary.working || 0);
      animateNumber($('kpiIncomplete'), summary.incomplete || 0);
      if (typeof userCount === 'number') animateNumber($('kpiUsers'), userCount);
    }
    function renderDetail(item) {
      const p = item.payload || {};
      const value = key => escapeHtml(p[key] || '-');
      const plainValue = key => escapeHtml(String(p[key] || '-').replace(/<br\s*\/?\s*>/gi, ' ').replace(/<[^>]*>/g, ''));
      const status = p['Diagnostic Status'] || 'INCOMPLETE';
      const statusClass = status === 'FAULT FOUND' ? 'badge-fault' : status === 'WORKING SATISFACTORY' ? 'badge-ok' : 'badge-incomplete';
      const field = (label, key) => '<div class="detail-item"><small>' + escapeHtml(label) + '</small><strong>' + value(key) + '</strong></div>';
      let detail = [/*
        <div class="detail-hero"><div><h3>\${escapeHtml(item.case_number || p['Diagnostic Case ID'] || 'Diagnostic Case')}</h3><p>\${escapeHtml(new Date(item.created_at).toLocaleString())} · \${value('Dealer / Location')}</p></div><span class="detail-status \${statusClass}">\${escapeHtml(status)}</span></div>
        '<div class="detail-section"><h3>Vehicle</h3><div class="detail-grid">' + field('Manufacturer','Vehicle Manufacturer') + field('Model','Model') + field('Registration','Vehicle Registration No.') + field('Chassis Number','Chassis No.') + field('Emission Standard','Emission Standard') + field('Odometer','Kms & Date of Sale') + '</div></div>',
        '<div class="detail-section"><h3>Technician & Location</h3><div class="detail-grid">' + field('Technician','FSE Name') + field('Phone','Technician Phone') + field('Dealer','Dealer / Location') + field('City','City') + field('State','State') + field('Region','Region') + '</div></div>',
        '<div class="detail-section"><h3>Diagnostic Summary</h3><div class="detail-grid">' + field('Complaint Type','Complaint Type') + field('Duration','Diagnostic Duration') + field('Suspected Product','Suspected Product') + field('Recommended Part','Recommended Part No.') + field('Warranty','Vehicle under warranty period?') + field('Repeat Complaint','Repeat complaint? Yes / No') + '</div></div>',
        '<div class="detail-section"><h3>Technician Finding</h3><div class="detail-callout"><strong>Customer voice / field complaint</strong>' + value('Customer Voice / Field Complaints reported') + '</div></div>',
        '<details class="raw-toggle"><summary>Show raw report data</summary><pre>' + escapeHtml(JSON.stringify(p, null, 2)) + '</pre></details>'
      */].join('');
      detail = '<div class="detail-hero"><div><h3>' + escapeHtml(item.case_number || p['Diagnostic Case ID'] || 'Diagnostic Case') + '</h3><p>' + escapeHtml(new Date(item.created_at).toLocaleString()) + ' · ' + value('Dealer / Location') + '</p></div><span class="detail-status ' + statusClass + '">' + escapeHtml(status) + '</span></div>';
      detail += '<div class="detail-section"><h3>Vehicle</h3><div class="detail-grid">' + field('Manufacturer','Vehicle Manufacturer') + field('Model','Model') + field('Registration','Vehicle Registration No.') + field('Chassis Number','Chassis No.') + field('Emission Standard','Emission Standard') + field('Odometer','Kms & Date of Sale') + '</div></div>';
      detail += '<div class="detail-section"><h3>Technician & Location</h3><div class="detail-grid">' + field('Technician','FSE Name') + field('Phone','Technician Phone') + field('Dealer','Dealer / Location') + field('City','City') + field('State','State') + field('Region','Region') + '</div></div>';
      detail += '<div class="detail-section"><h3>Diagnostic Summary</h3><div class="detail-grid">' + field('Complaint Type','Complaint Type') + field('Duration','Diagnostic Duration') + field('Suspected Product','Suspected Product') + field('Recommended Part','Recommended Part No.') + field('Warranty','Vehicle under warranty period?') + field('Repeat Complaint','Repeat complaint? Yes / No') + field('Language Used','Diagnostic Language Name') + field('Admin Report Language','Admin Report Language') + '</div></div>';
      detail += '<div class="detail-section"><h3>Technician Finding</h3><div class="detail-callout"><strong>Customer voice / field complaint</strong>' + value('Customer Voice / Field Complaints reported') + '</div></div>';
      detail = '<div class="report-header"><h3>RETARDER IQ – Diagnostic Report</h3><p>Generated on: ' + escapeHtml(new Date(item.created_at).toLocaleString()) + '</p><span class="report-case">' + escapeHtml(item.case_number || p['Diagnostic Case ID'] || 'Diagnostic Case') + '</span></div>';
      detail += '<div class="report-info-card"><div class="report-columns"><div><h3>TECHNICIAN DETAILS</h3>' + field('Name','FSE Name') + field('Phone','Technician Phone') + field('Workshop','Dealer / Location') + field('Location','City') + '</div><div><h3>VEHICLE DETAILS</h3>' + field('Reg No','Vehicle Registration No.') + field('Vehicle Manufacturer','Vehicle Manufacturer') + field('Model','Model') + field('Odometer','Kms & Date of Sale') + field('Chassis','Chassis No.') + '</div></div>';
      const latitude = Number(p['GPS Latitude']);
      const longitude = Number(p['GPS Longitude']);
      if (Number.isFinite(latitude) && Number.isFinite(longitude) && latitude !== 0 && longitude !== 0) {
        const mapsUrl = `https://www.google.com/maps?q=${encodeURIComponent(`${latitude},${longitude}`)}`;
        detail += '<div class="detail-section"><h3>GPS Location</h3><div class="detail-callout">' + escapeHtml(p['GPS Address'] || `${latitude}, ${longitude}`) + ' <a href="' + mapsUrl + '" target="_blank" rel="noopener" style="margin-left:10px;">Open in Google Maps</a></div></div>';
      }
      const faultDetailsHtml = window.RIQReportRenderer.renderFaultDetails(p);
      detail += '<div class="report-summary"><div><h3>DIAGNOSTIC SUMMARY</h3><p><strong>Outcome:</strong> <span class="outcome-pill ' + statusClass + '">' + escapeHtml(status) + '</span></p>' + field('Duration','Diagnostic Duration') + field('Date','Complaint Attended on') + field('Language Used','Diagnostic Language Name') + field('Admin Report Language','Admin Report Language') + '</div><div><h3>FAULT DETAILS</h3>' + faultDetailsHtml + '</div></div></div>';
      detail += '<div class="detail-section"><h3>Additional Diagnostic Details</h3><div class="detail-grid">' + field('Complaint Type','Complaint Type') + field('Suspected Product','Suspected Product') + field('Emission Standard','Emission Standard') + field('Warranty','Vehicle under warranty period?') + field('Repeat Complaint','Repeat complaint? Yes / No') + field('Region','Region') + '</div></div>';
      const evidence = p['Step Evidence'] || {};
      const evidenceCards = Object.entries(evidence).map(([stepKey, photo]) => '<figure class="evidence-card"><img loading="lazy" decoding="async" src="' + escapeHtml(photo.dataUrl || '') + '" alt="Evidence for ' + escapeHtml(stepKey) + '"><figcaption>' + escapeHtml(stepKey) + '</figcaption></figure>').join('');
      if (evidenceCards) detail += '<div class="detail-section"><h3>Failed-step evidence</h3><div class="evidence-grid">' + evidenceCards + '</div></div>';
      const feedback = p['Diagnostic Feedback'];
      if (feedback && typeof feedback === 'object' && feedback.clarity) {
        const rating = Math.max(1, Math.min(5, Number(feedback.clarity) || 0));
        const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
        detail += '<div class="detail-section"><h3>Diagnostic Feedback</h3><div class="detail-callout"><strong>Rating:</strong> <span style="color:#f59e0b; font-size:20px; letter-spacing:2px;">' + stars + '</span> <span>(' + rating + '/5)</span></div></div>';
      }
      const history = Array.isArray(p['Diagnostic Step History']) ? p['Diagnostic Step History'] : [];
      if (history.length) {
        const historyRows = window.RIQReportRenderer.renderHistoryRows(history, { includeEvidence: false });
        detail += '<div class="detail-section report-step-history"><h3>Step History</h3><div class="table-wrap"><table class="history-table"><thead><tr><th>#</th><th>Diagnostic Question</th><th>Response</th></tr></thead><tbody>' + historyRows + '</tbody></table></div></div>';
      } else {
        detail += '<div class="detail-section report-step-history"><h3>Step History</h3><p class="muted">Step history was not captured for this older report. New reports will include it.</p></div>';
      }
      detail += '<details class="raw-toggle"><summary>Show raw report data</summary><pre>' + escapeHtml(JSON.stringify(p, null, 2)) + '</pre></details>';
      $('detailContent').innerHTML = detail;
      $('detailContent').querySelectorAll('.evidence-card img').forEach(image => image.addEventListener('click', () => openEvidencePreview(image.src, image.alt)));
      $('printDetailBtn').onclick = () => printDetail(item.case_number || p['Diagnostic Case ID'] || 'diagnostic-report');
    }
    function openEvidencePreview(source, alt) {
      let modal = $('evidencePreviewModal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'evidencePreviewModal';
        modal.style.cssText = 'position:fixed; inset:0; z-index:1000; display:flex; align-items:center; justify-content:center; padding:24px; background:rgba(15,23,42,.82); cursor:zoom-out;';
        modal.innerHTML = '<button type="button" aria-label="Close photo preview" style="position:absolute; right:24px; top:20px; width:42px; height:42px; padding:0; border-radius:50%; font-size:25px; line-height:1; background:#fff; color:#0f172a;">&times;</button><img style="max-width: min(1100px, 94vw); max-height: 88vh; object-fit:contain; border-radius:12px; box-shadow:0 20px 60px rgba(0,0,0,.35); cursor:default;" alt="">';
        modal.addEventListener('click', event => { if (event.target === modal || event.target.tagName === 'BUTTON') modal.remove(); });
        document.body.appendChild(modal);
      }
      const preview = modal.querySelector('img');
      preview.src = source;
      preview.alt = alt || 'Diagnostic evidence';
      modal.style.display = 'flex';
    }
    function printDetail(caseNumber) {
      const reportWindow = window.open('', '_blank', 'width=1000,height=800');
      if (!reportWindow) { $('reportStatus').textContent = 'Allow pop-ups to export the PDF report.'; return; }
      reportWindow.document.write('<!doctype html><html><head><title>' + escapeHtml(caseNumber) + '</title><style>body{font-family:Arial,sans-serif;color:#172033;margin:32px}h2{color:#0b5daa}.report-header{position:relative;padding:4px 0 18px;border-bottom:3px solid #0b5daa;margin-bottom:22px}.report-header h3{margin:0;color:#0b5daa;font-size:24px}.report-header p{margin:7px 0 0;color:#64748b;font-size:12px}.report-case{position:absolute;right:0;top:7px;color:#64748b;font-size:12px;font-weight:800}.report-info-card{padding:24px;border:2px solid #e2e8f0;border-radius:14px;background:#f8fafc}.report-columns,.report-summary{display:grid;grid-template-columns:1fr 1fr;gap:24px}.report-columns h3,.report-summary h3{margin:0 0 12px;padding-bottom:7px;border-bottom:1px solid #dbeafe;color:#0b5daa;font-size:13px}.report-summary{margin-top:24px;padding:16px;border:1px solid #dbeafe;border-radius:10px;background:#fff}.report-summary .detail-item{border:0;background:transparent;padding:4px 0}.outcome-pill{display:inline-block;padding:4px 8px;border-radius:5px;font-weight:800}.fault-text{border-left:4px solid #ef4444;padding-left:12px;color:#b91c1c;font-weight:700;line-height:1.5}.recommendation{color:#7c2d12}.detail-section{margin-top:18px}.detail-section h3{font-size:13px;text-transform:uppercase;color:#52708f}.detail-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.detail-item{padding:12px;border:1px solid #dbe4ef;border-radius:9px}.detail-item small{display:block;color:#71839a;font-size:11px;font-weight:bold;margin-bottom:5px}.detail-item strong{display:block;overflow-wrap:anywhere}.detail-callout{padding:14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:9px;line-height:1.5}table{width:100%;border-collapse:collapse}th,td{padding:9px;border-bottom:1px solid #dbe4ef;text-align:left}th{background:#f1f5f9}.evidence-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.evidence-card{margin:0;border:1px solid #dbe4ef;border-radius:10px;overflow:hidden}.evidence-card img{width:100%;aspect-ratio:4/3;object-fit:cover}.evidence-card figcaption{padding:7px;font-size:12px;font-weight:bold}@media print{body{margin:12mm}.raw-toggle{display:none}}</style></head><body><h2>Retarder IQ Diagnostic Report</h2>' + $('detailContent').innerHTML + '</body></html>');
      reportWindow.document.close();
      reportWindow.focus();
      setTimeout(() => reportWindow.print(), 300);
    }
    function printDetail(caseNumber) {
      const reportWindow = window.open('', '_blank', 'width=1000,height=800');
      if (!reportWindow) { $('reportStatus').textContent = 'Allow pop-ups to export the PDF report.'; return; }
      const printCss = `
        @page { size: A4; margin: 12mm; }
        * { box-sizing: border-box; }
        body { margin: 0; font-family: Arial, sans-serif; color: #172033; font-size: 12px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .report-header { position: relative; padding: 0 0 14px; border-bottom: 3px solid #0b5daa; margin-bottom: 18px; }
        .report-header h3 { margin: 0; color: #0b5daa; font-size: 21px; }
        .report-header p { margin: 5px 0 0; color: #64748b; font-size: 10px; }
        .report-case { position: absolute; right: 0; top: 4px; color: #64748b; font-size: 10px; font-weight: 800; }
        .report-info-card { padding: 16px; border: 1px solid #dbe4ef; border-radius: 10px; background: #f8fafc; }
        .report-columns, .report-summary { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
        .report-columns h3, .report-summary h3 { margin: 0 0 8px; padding-bottom: 5px; border-bottom: 1px solid #dbeafe; color: #0b5daa; font-size: 10px; letter-spacing: .7px; }
        .report-summary { margin-top: 18px; padding: 12px; border: 1px solid #dbeafe; border-radius: 8px; background: #fff; }
        .detail-item { padding: 7px 9px; margin-bottom: 5px; border: 1px solid #e3ebf4; border-radius: 7px; background: #fff; }
        .detail-item small { display: block; color: #71839a; font-size: 9px; font-weight: 700; margin-bottom: 3px; }
        .detail-item strong { display: block; overflow-wrap: anywhere; font-size: 11px; }
        .outcome-pill { display: inline-block; padding: 3px 7px; border-radius: 4px; font-weight: 800; }
        .badge-fault { background: #fee2e2; color: #b91c1c; }
        .badge-ok { background: #d1fae5; color: #047857; }
        .badge-incomplete { background: #fef3c7; color: #a16207; }
        .fault-text { border-left: 3px solid #ef4444; padding-left: 9px; color: #b91c1c; font-weight: 700; line-height: 1.45; }
        .fault-entry + .fault-entry { margin-top: 12px; padding-top: 12px; border-top: 1px dashed #cbd5e1; }
        .recommendation { color: #7c2d12; margin: 7px 0 0; }
        .detail-section { margin-top: 16px; break-inside: avoid; }
        .detail-section > h3 { margin: 0 0 8px; color: #52708f; font-size: 11px; text-transform: uppercase; letter-spacing: .8px; }
        .detail-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
        .evidence-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
        .evidence-card { margin: 0; border: 1px solid #dbe4ef; border-radius: 7px; overflow: hidden; break-inside: avoid; }
        .evidence-card img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; }
        .evidence-card figcaption { padding: 5px; font-size: 9px; font-weight: 700; }
        .table-wrap { overflow: visible; }
        .history-table { width: 100%; border-collapse: collapse; font-size: 10px; }
        .history-table th, .history-table td { padding: 7px; border-bottom: 1px solid #dbe4ef; text-align: left; white-space: normal; vertical-align: top; }
        .history-table th { background: #eef5fc; color: #52708f; }
        .history-table thead { display: table-header-group; }
        .history-table tr { break-inside: avoid; }
        .response-yes { color: #15803d; font-weight: 800; }
        .response-no { color: #b91c1c; font-weight: 800; }
        .raw-toggle { display: none; }
        @media print { .detail-section, .report-info-card { break-inside: avoid; } }
      `;
      reportWindow.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + escapeHtml(caseNumber) + '</title><style>' + printCss + '</style></head><body>' + $('detailContent').innerHTML + '</body></html>');
      reportWindow.document.close();
      reportWindow.focus();
      setTimeout(() => reportWindow.print(), 400);
    }
    function getFilteredCases() {
      const search = $('search').value.toLowerCase();
      const status = $('statusFilter').value;
      const region = $('regionFilter').value.toLowerCase();
      const manufacturer = $('manufacturerFilter').value.toLowerCase();
      const language = $('languageFilter').value.toLowerCase();
      const feedback = $('feedbackFilter').value;
      const kmRange = $('kmFilter').value;
      const dateFrom = $('dateFromFilter').value;
      const dateTo = $('dateToFilter').value;
      const caseDate = item => {
        const value = new Date(item.created_at);
        return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
      };
      const getKm = payload => {
        const raw = payload['Odometer Km'] ?? payload['Kms & Date of Sale'] ?? payload.Odometer ?? '';
        const match = String(raw).replace(/,/g, '').match(/\d+(?:\.\d+)?/);
        return match ? Number(match[0]) : null;
      };
      return cases.filter(item => {
        const payload = item.payload || {};
        const haystack = [item.case_number, payload['Diagnostic Case ID'], payload['Chassis No.'], payload['Vehicle Registration No.'], payload['Dealer / Location'], payload['FSE Name'], payload['Suspected Product']].join(' ').toLowerCase();
        const km = getKm(payload);
        const languageMatches = !language || String(payload['Diagnostic Language Name'] || payload['Diagnostic Language'] || '').toLowerCase() === language;
        const clarity = payload['Diagnostic Feedback'] && typeof payload['Diagnostic Feedback'] === 'object' ? String(payload['Diagnostic Feedback'].clarity || '') : '';
        const feedbackMatches = !feedback || (feedback === 'none' ? !clarity : clarity === feedback);
        const kmMatches = !kmRange || (km !== null && (kmRange === '0-50000' ? km <= 50000 : kmRange === '50001-100000' ? km >= 50001 && km <= 100000 : km >= 100001));
        const date = caseDate(item);
        const dateMatches = (!dateFrom || (date && date >= dateFrom)) && (!dateTo || (date && date <= dateTo));
        return (!search || haystack.includes(search)) && (!status || payload['Diagnostic Status'] === status) && (!region || String(payload.Region || '').toLowerCase() === region) && (!manufacturer || String(payload['Vehicle Manufacturer'] || '').toLowerCase() === manufacturer) && languageMatches && feedbackMatches && kmMatches && dateMatches;
      });
    }
    function renderAnalytics() {
      const rows = getFilteredAnalyticsCases();
      const payloads = rows.map(item => item.payload || {});
      const statusCounts = {
        fault: payloads.filter(payload => payload['Diagnostic Status'] === 'FAULT FOUND').length,
        working: payloads.filter(payload => payload['Diagnostic Status'] === 'WORKING SATISFACTORY').length,
        incomplete: payloads.filter(payload => !['FAULT FOUND', 'WORKING SATISFACTORY'].includes(payload['Diagnostic Status'])).length
      };
      const statusTotal = payloads.length || 1;
      const faultAngle = statusCounts.fault / statusTotal * 360;
      const workingAngle = statusCounts.working / statusTotal * 360;
      $('statusDonut').style.background = `conic-gradient(#ef4444 0deg ${faultAngle}deg, #10b981 ${faultAngle}deg ${faultAngle + workingAngle}deg, #f59e0b ${faultAngle + workingAngle}deg 360deg)`;
      animateNumber($('statusTotal'), payloads.length);
      $('statusLegend').innerHTML = '<span data-status-filter="FAULT FOUND" title="Show fault cases"><i class="legend-dot legend-fault"></i>Fault Found <strong>' + statusCounts.fault + '</strong></span><span data-status-filter="WORKING SATISFACTORY" title="Show satisfactory cases"><i class="legend-dot legend-ok"></i>Working Satisfactory <strong>' + statusCounts.working + '</strong></span><span data-status-filter="INCOMPLETE" title="Show incomplete cases"><i class="legend-dot legend-incomplete"></i>Incomplete <strong>' + statusCounts.incomplete + '</strong></span>';
      const statusDonut = $('statusDonut');
      if (statusDonut && !statusDonut.dataset.filterBound) {
        const applyStatusFilter = status => {
          $('statusFilter').value = status || '';
          pagination.page = 1;
          loadCases();
          document.querySelector('.toolbar')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
        statusDonut.addEventListener('click', event => {
          const rect = statusDonut.getBoundingClientRect();
          const dx = event.clientX - (rect.left + rect.width / 2);
          const dy = event.clientY - (rect.top + rect.height / 2);
          if (Math.hypot(dx, dy) <= 46) {
            applyStatusFilter('');
            return;
          }
          let angle = Math.atan2(dy, dx) * 180 / Math.PI + 90;
          if (angle < 0) angle += 360;
          const faultEnd = faultAngle;
          const workingEnd = faultAngle + workingAngle;
          applyStatusFilter(angle < faultEnd ? 'FAULT FOUND' : angle < workingEnd ? 'WORKING SATISFACTORY' : 'INCOMPLETE');
        });
        statusDonut.dataset.filterBound = 'true';
        statusDonut.title = 'Click a segment to filter cases; click the center to clear';
        statusDonut.style.cursor = 'pointer';
      }
      document.querySelectorAll('#statusLegend [data-status-filter]').forEach(item => {
        item.onclick = () => {
          $('statusFilter').value = item.dataset.statusFilter;
          pagination.page = 1;
          loadCases();
          document.querySelector('.toolbar')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
        item.style.cursor = 'pointer';
      });
      animateNumber($('faultRate'), Math.round(statusCounts.fault / statusTotal * 100), '%');
      const localDateKey = date => {
        const value = new Date(date);
        if (Number.isNaN(value.getTime())) return '';
        return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, '0'), String(value.getDate()).padStart(2, '0')].join('-');
      };
      const caseDateKey = item => localDateKey(item.created_at) || localDateKey(item.payload?.['Complaint Attended on']);
      const renderBars = (counts, emptyText) => {
        const entries = Object.entries(counts).sort((a,b) => b[1] - a[1]);
        const maxCount = entries[0]?.[1] || 1;
        return entries.map(([name, count]) => '<div class="bar-row"><span>' + escapeHtml(name) + '</span><div class="bar-track"><div class="bar-fill" style="width:' + Math.round(count / maxCount * 100) + '%"></div></div><strong>' + count + '</strong></div>').join('') || '<p class="muted">' + emptyText + '</p>';
      };
      const renderPie = (counts, emptyText, filterType = '') => {
        const entries = Object.entries(counts).filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
        const total = entries.reduce((sum, [, count]) => sum + count, 0);
        const colors = ['#2563eb', '#06b6d4', '#10b981', '#f59e0b', '#f97316', '#8b5cf6', '#ec4899', '#64748b'];
        let start = 0;
        const slices = entries.map(([name, count], index) => {
          const end = start + count / (total || 1) * 360;
          const item = { name, count, color: colors[index % colors.length], stop: `${colors[index % colors.length]} ${start}deg ${end}deg` };
          start = end;
          return item;
        });
        if (!slices.length) return '<p class="muted">' + emptyText + '</p>';
        return '<div class="insight-pie"><div class="insight-pie-disc" data-filter-type="' + escapeHtml(filterType) + '" style="background:conic-gradient(' + slices.map(item => item.stop).join(', ') + ')"><strong>' + total + '</strong></div><div class="chart-legend">' + slices.map(item => '<span data-filter-type="' + escapeHtml(filterType) + '" data-filter-value="' + escapeHtml(item.name) + '" title="Filter by ' + escapeHtml(item.name) + '"><i class="legend-product" style="background:' + item.color + '"></i>' + escapeHtml(item.name) + ' <strong>' + item.count + '</strong></span>').join('') + '</div></div>';
      };
      const counts = {};
      payloads.forEach(payload => { const name = payload['Suspected Product'] || 'Unknown'; counts[name] = (counts[name] || 0) + 1; });
      const allProducts = Object.entries(counts).sort((a,b) => b[1] - a[1]);
      const products = allProducts.slice(0, 6);
      const max = products[0]?.[1] || 1;
      $('failureChart').innerHTML = products.map(([name, count]) => '<div class="bar-row"><span>' + escapeHtml(name) + '</span><div class="bar-track"><div class="bar-fill" style="width:' + Math.round(count / max * 100) + '%"></div></div><strong>' + count + '</strong></div>').join('') || '<p class="muted">No case data yet.</p>';
      const pieColors = ['#2563eb', '#06b6d4', '#10b981', '#f59e0b', '#f97316', '#8b5cf6'];
      const productTotal = allProducts.reduce((sum, [, count]) => sum + count, 0);
      let pieStart = 0;
      const pieStops = allProducts.map(([name, count], index) => {
        const end = pieStart + (count / (productTotal || 1)) * 360;
        const stop = `${pieColors[index % pieColors.length]} ${pieStart}deg ${end}deg`;
        pieStart = end;
        return { name, count, color: pieColors[index % pieColors.length], stop };
      });
      $('failurePie').style.background = pieStops.length ? `conic-gradient(${pieStops.map(item => item.stop).join(', ')})` : '#e8eef6';
      $('failurePieTotal').textContent = productTotal;
      $('failureLegend').innerHTML = pieStops.map(item => '<span data-filter-type="product" data-filter-value="' + escapeHtml(item.name) + '" title="Filter by ' + escapeHtml(item.name) + '"><i class="legend-product" style="background:' + item.color + '"></i>' + escapeHtml(item.name) + ' <strong>' + item.count + '</strong></span>').join('') || '<span class="muted">No case data yet.</span>';
      $('failureLegend').scrollTop = 0;
      $('recentActivity').innerHTML = rows.slice(0, 5).map(item => '<div class="trend-item" data-case-filter="' + escapeHtml(item.case_number || item.payload?.['Diagnostic Case ID'] || '-') + '" title="Open this case in Case Explorer"><span>' + escapeHtml(item.case_number || item.payload?.['Diagnostic Case ID'] || '-') + '</span><strong>' + escapeHtml(item.payload?.['Diagnostic Status'] || '-') + '</strong></div>').join('') || '<p class="muted">No recent cases.</p>';

      const regionCounts = { North: 0, South: 0, East: 0, West: 0 };
      payloads.forEach(payload => {
        const region = String(payload.Region || '').trim();
        const key = Object.keys(regionCounts).find(name => name.toLowerCase() === region.toLowerCase());
        if (key) regionCounts[key] += 1;
      });
      const regionValues = Object.fromEntries(Object.entries(regionCounts).filter(([, count]) => count > 0));
      $('regionChart').innerHTML = renderPie(regionValues, 'No region data yet.', 'region');

      const manufacturerCounts = {};
      payloads.forEach(payload => {
        const explicitManufacturer = String(payload['Vehicle Manufacturer'] || payload.Customer || '').trim();
        const model = String(payload.Model || '').toUpperCase();
        const name = explicitManufacturer && !['-', 'UNKNOWN', 'N/A'].includes(explicitManufacturer.toUpperCase())
          ? explicitManufacturer
          : model.includes('TML') ? 'TATA MOTORS'
            : model.includes('ASHOK') ? 'ASHOK LEYLAND'
              : model.includes('VECV') ? 'VECV'
                : 'Not provided';
        manufacturerCounts[name] = (manufacturerCounts[name] || 0) + 1;
      });
      $('manufacturerChart').innerHTML = renderPie(Object.fromEntries(Object.entries(manufacturerCounts).sort((a,b) => b[1] - a[1]).slice(0, 8)), 'No manufacturer data yet.', 'manufacturer');

      const feedbackCounts = {};
      payloads.forEach(payload => {
        const feedback = payload['Diagnostic Feedback'];
        const rating = feedback && typeof feedback === 'object' && feedback.clarity ? `${feedback.clarity}/5` : 'Not provided';
        feedbackCounts[rating] = (feedbackCounts[rating] || 0) + 1;
      });
      $('feedbackChart').innerHTML = renderPie(feedbackCounts, 'No feedback data yet.', 'feedback');

      const languageCounts = {};
      payloads.forEach(payload => {
        const language = String(payload['Diagnostic Language Name'] || payload['Diagnostic Language'] || 'English').trim() || 'English';
        languageCounts[language] = (languageCounts[language] || 0) + 1;
      });
      $('languageChart').innerHTML = renderPie(languageCounts, 'No language data yet.', 'language');

      const today = new Date();
      const trend = [];
      for (let offset = 6; offset >= 0; offset -= 1) {
        const date = new Date(today);
        date.setHours(0, 0, 0, 0);
        date.setDate(today.getDate() - offset);
        const key = localDateKey(date);
        const count = rows.filter(item => caseDateKey(item) === key).length;
        trend.push({ label: date.toLocaleDateString(undefined, { weekday: 'short' }), date: key, count });
      }
      $('trendChart').innerHTML = trend.map(item => '<div class="trend-item" data-date-filter="' + item.date + '" title="Filter cases for this date"><span>' + item.label + '</span><strong>' + item.count + ' complaint' + (item.count === 1 ? '' : 's') + '</strong></div>').join('');

      const faultCount = payloads.filter(payload => payload['Diagnostic Status'] === 'FAULT FOUND').length;
      const faultRate = payloads.length ? Math.round(faultCount / payloads.length * 100) : 0;
      const repeatCount = payloads.filter(payload => String(payload['Repeat complaint? Yes / No'] || '').toLowerCase() === 'yes').length;
      const topRegion = Object.entries(regionCounts).sort((a,b) => b[1] - a[1])[0];
      const topManufacturer = Object.entries(manufacturerCounts).sort((a,b) => b[1] - a[1])[0];
      const advice = [];
      if (!payloads.length) advice.push('Submit diagnostic cases to unlock regional and manufacturer recommendations.');
      else {
        if (topRegion?.[1]) advice.push('<strong>' + escapeHtml(topRegion[0]) + '</strong> has the most complaints (' + topRegion[1] + '). Review dealer training, wiring quality, and spare availability in this region.');
        if (topManufacturer?.[1]) advice.push('<strong>' + escapeHtml(topManufacturer[0]) + '</strong> is the leading affected manufacturer (' + topManufacturer[1] + '). Compare its models and diagnostic branches for recurring faults.');
        advice.push('Fault rate is <strong>' + faultRate + '%</strong>. Prioritize the most common suspected product and recommended part for preventive stock planning.');
        if (repeatCount) advice.push('<strong>' + repeatCount + '</strong> repeat complaint' + (repeatCount === 1 ? ' needs' : 's need') + ' root-cause review and follow-up closure.');
        else advice.push('No repeat complaints are recorded yet. Continue capturing registration number, chassis, and recommended part for reliable trend analysis.');
      }
      if ($('insightAdvice')) $('insightAdvice').innerHTML = advice.map(item => '<li>' + item + '</li>').join('');
    }
    function getFilteredAnalyticsCases() {
      const source = analyticsCases.length ? analyticsCases : cases;
      const search = $('search').value.toLowerCase();
      const status = $('statusFilter').value;
      const region = $('regionFilter').value.toLowerCase();
      const manufacturer = $('manufacturerFilter').value.toLowerCase();
      const language = $('languageFilter').value.toLowerCase();
      const feedback = $('feedbackFilter').value;
      const kmRange = $('kmFilter').value;
      const dateFrom = $('dateFromFilter').value;
      const dateTo = $('dateToFilter').value;
      const caseDate = item => {
        const value = new Date(item.created_at);
        return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
      };
      const getKm = payload => {
        const raw = payload['Odometer Km'] ?? payload['Kms & Date of Sale'] ?? payload.Odometer ?? '';
        const match = String(raw).replace(/,/g, '').match(/\d+(?:\.\d+)?/);
        return match ? Number(match[0]) : null;
      };
      return source.filter(item => {
        const payload = item.payload || {};
        const haystack = [item.case_number, payload['Diagnostic Case ID'], payload['Chassis No.'], payload['Vehicle Registration No.'], payload['Dealer / Location'], payload['FSE Name'], payload['Suspected Product']].join(' ').toLowerCase();
        const km = getKm(payload);
        const languageMatches = !language || String(payload['Diagnostic Language Name'] || payload['Diagnostic Language'] || '').toLowerCase() === language;
        const clarity = payload['Diagnostic Feedback'] && typeof payload['Diagnostic Feedback'] === 'object' ? String(payload['Diagnostic Feedback'].clarity || '') : '';
        const feedbackMatches = !feedback || (feedback === 'none' ? !clarity : clarity === feedback);
        const kmMatches = !kmRange || (km !== null && (kmRange === '0-50000' ? km <= 50000 : kmRange === '50001-100000' ? km >= 50001 && km <= 100000 : km >= 100001));
        const date = caseDate(item);
        const dateMatches = (!dateFrom || (date && date >= dateFrom)) && (!dateTo || (date && date <= dateTo));
        return (!search || haystack.includes(search)) && (!status || payload['Diagnostic Status'] === status) && (!region || String(payload.Region || '').toLowerCase() === region) && (!manufacturer || String(payload['Vehicle Manufacturer'] || '').toLowerCase() === manufacturer) && languageMatches && feedbackMatches && kmMatches && dateMatches;
      });
    }
    function renderCases() {
      const rows = getFilteredCases();
      const selectedIds = new Set([...document.querySelectorAll('.case-select:checked')].map(input => input.value));
      const selectAllWasChecked = $('selectAllCases').checked;
      $('reportsBody').innerHTML = rows.map(item => {
        const p = item.payload || {};
        const status = p['Diagnostic Status'] || '-';
        const statusClass = status === 'FAULT FOUND' ? 'badge-fault' : status === 'WORKING SATISFACTORY' ? 'badge-ok' : 'badge-incomplete';
        return `<tr><td><input class="case-select" type="checkbox" value="${escapeHtml(item.id)}" aria-label="Select ${escapeHtml(item.case_number || 'case')}"></td><td>${escapeHtml(item.case_number || p['Diagnostic Case ID'])}</td><td>${escapeHtml(new Date(item.created_at).toLocaleString())}</td><td><span class="badge ${statusClass}">${escapeHtml(status)}</span></td><td>${escapeHtml(p['FSE Name'] || '-')}</td><td>${escapeHtml(p['Vehicle Registration No.'] || p['Chassis No.'] || '-')}</td><td>${escapeHtml(p['Diagnostic Language Name'] || p['Diagnostic Language'] || 'English')}</td><td>${escapeHtml(p['Dealer / Location'] || '-')}</td><td>${escapeHtml(p['Recommended Part No.'] || p['Suspected Product'] || '-')}</td><td><button data-case-id="${escapeHtml(item.id)}" class="viewBtn">View</button></td></tr>`;
      }).join('') || '<tr><td colspan="10">No reports found.</td></tr>';
      document.querySelectorAll('.viewBtn').forEach(button => button.addEventListener('click', async () => {
        try {
          const item = await api(`/api/admin/diagnostics/${button.dataset.caseId}`);
          renderDetail(item);
          $('detailCard').classList.remove('hidden');
          $('detailCard').scrollIntoView({ behavior:'smooth' });
        } catch (error) { $('reportStatus').textContent = error.message; }
      }));
      document.querySelectorAll('.case-select').forEach(input => {
        input.checked = selectedIds.has(input.value);
        input.addEventListener('change', updateSelectionControls);
      });
      $('selectAllCases').checked = selectAllWasChecked && document.querySelectorAll('.case-select').length > 0;
      $('selectAllCases').onchange = event => { document.querySelectorAll('.case-select').forEach(input => { input.checked = event.target.checked; }); updateSelectionControls(); };
      updateSelectionControls();
    }
    function selectedCaseIds() { return [...document.querySelectorAll('.case-select:checked')].map(input => input.value); }
    function updateSelectionControls() { $('deleteSelectedBtn').disabled = selectedCaseIds().length === 0; }
    function populateManufacturerFilter() {
      const select = $('manufacturerFilter');
      const current = select.value;
      const manufacturers = [...(summary.manufacturers || [])].filter(Boolean).sort();
      select.innerHTML = '<option value="">All manufacturers</option>' + manufacturers.map(name => '<option value="' + escapeHtml(name) + '">' + escapeHtml(name) + '</option>').join('');
      if (manufacturers.some(name => name.toLowerCase() === current.toLowerCase())) select.value = current;
    }
    function bindChartInteractions() {
      const setFilter = (type, value) => {
        if (type === 'region') $('regionFilter').value = value;
        if (type === 'manufacturer') $('manufacturerFilter').value = value;
        if (type === 'language') $('languageFilter').value = value;
        if (type === 'feedback') $('feedbackFilter').value = /^([1-5])\/5$/.test(value) ? RegExp.$1 : value === 'Not provided' ? 'none' : '';
        if (type === 'product') $('search').value = value;
        pagination.page = 1;
        loadCases();
        document.querySelector('.toolbar')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      document.querySelectorAll('[data-filter-type][data-filter-value]').forEach(item => {
        item.onclick = () => setFilter(item.dataset.filterType, item.dataset.filterValue);
        item.style.cursor = 'pointer';
      });
      document.querySelectorAll('[data-case-filter]').forEach(item => {
        item.onclick = () => setFilter('product', item.dataset.caseFilter);
        item.style.cursor = 'pointer';
      });
      document.querySelectorAll('[data-date-filter]').forEach(item => {
        item.onclick = () => {
          $('dateFromFilter').value = item.dataset.dateFilter;
          $('dateToFilter').value = item.dataset.dateFilter;
          pagination.page = 1;
          loadCases();
          document.querySelector('.toolbar')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
        item.style.cursor = 'pointer';
      });
    }
    function currentCaseQuery() {
      const params = new URLSearchParams({ page: pagination.page, pageSize: pagination.pageSize });
      const filters = { search: $('search').value.trim(), status: $('statusFilter').value, region: $('regionFilter').value, manufacturer: $('manufacturerFilter').value, language: $('languageFilter').value, feedback: $('feedbackFilter').value, kmRange: $('kmFilter').value, dateFrom: $('dateFromFilter').value, dateTo: $('dateToFilter').value };
      Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
      return params;
    }
    function renderPagination() {
      const container = $('casePagination');
      container.innerHTML = `<button class="secondary" ${pagination.page <= 1 ? 'disabled' : ''} data-page="${pagination.page - 1}">Previous</button><span>Page ${pagination.page} of ${pagination.totalPages || 1} · ${pagination.total} reports</span><button class="secondary" ${pagination.page >= pagination.totalPages ? 'disabled' : ''} data-page="${pagination.page + 1}">Next</button>`;
      container.querySelectorAll('button[data-page]').forEach(button => button.addEventListener('click', () => { pagination.page = Number(button.dataset.page); loadCases(); }));
    }
    async function loadCases() {
      const result = await api(`/api/diagnostics?${currentCaseQuery()}`);
      cases = result.cases;
      pagination = { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages };
      populateManufacturerFilter(); updateKpis(); renderAnalytics(); renderCases(); renderPagination();
    }
    async function loadAnalyticsCases() {
      const result = await api('/api/diagnostics?page=1&pageSize=1000');
      analyticsCases = result.cases || [];
    }
    async function loadSummary() { const result = await api('/api/diagnostics/summary'); summary = result.summary; populateManufacturerFilter(); updateKpis(); }
    async function loadUsers() {
      const result = await api('/api/users');
      updateKpis(result.users.filter(user => user.active).length);
      $('usersBody').innerHTML = result.users.map(user => `<tr><td>${escapeHtml(user.email)}</td><td>${escapeHtml(user.role)}</td><td><span class="badge ${user.active ? 'badge-ok' : 'badge-fault'}">${user.active ? 'Active' : 'Disabled'}</span></td><td>${escapeHtml(new Date(user.created_at).toLocaleString())}</td><td><button class="${user.active ? 'danger' : 'secondary'} userToggle" data-id="${user.id}" data-active="${!user.active}">${user.active ? 'Disable' : 'Enable'}</button> <button class="danger userDelete" data-id="${user.id}" data-email="${escapeHtml(user.email)}">Delete</button></td></tr>`).join('') || '<tr><td colspan="5">No named accounts found.</td></tr>';
      document.querySelectorAll('.userToggle').forEach(button => button.addEventListener('click', async () => { try { await api(`/api/users/${button.dataset.id}/active`, { method:'PATCH', body:JSON.stringify({ active:button.dataset.active === 'true' }) }); await loadUsers(); } catch (error) { $('userStatus').textContent = error.message; } }));
      document.querySelectorAll('.userDelete').forEach(button => button.addEventListener('click', async () => {
        if (!window.confirm(`Permanently delete ${button.dataset.email}? Linked diagnostic reports will be preserved without account ownership.`)) return;
        try { await api(`/api/users/${button.dataset.id}`, { method:'DELETE' }); $('userStatus').textContent = `Deleted ${button.dataset.email}.`; await loadUsers(); }
        catch (error) { $('userStatus').textContent = error.message; }
      }));
    }
    async function loadAll() {
      if (refreshInFlight) return;
      refreshInFlight = true;
      try { await Promise.all([loadCases(), loadAnalyticsCases(), loadSummary(), loadUsers()]); renderAnalytics(); }
      catch (error) { $('reportStatus').textContent = error.message; }
      finally { refreshInFlight = false; }
    }
    $('loginForm').addEventListener('submit', async event => { event.preventDefault(); $('loginStatus').textContent = ''; try { const result = await fetch(`${apiBase}/api/auth/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ email:$('email').value, password:$('password').value }) }); const data = await result.json(); if (!result.ok || data.user?.role !== 'admin') throw new Error('Administrator account required.'); token = data.token; sessionStorage.setItem('riq_admin_token', token); showDashboard(); } catch (error) { $('loginStatus').textContent = error.message; } });
    $('userForm').addEventListener('submit', async event => { event.preventDefault(); $('userStatus').textContent = ''; try { await api('/api/users', { method:'POST', body:JSON.stringify({ email:$('userEmail').value, password:$('userPassword').value, role:$('userRole').value }) }); $('userForm').reset(); await loadUsers(); } catch (error) { $('userStatus').textContent = error.message; } });
    function exportCsv() {
      // Export every matching record, not only the currently visible table page.
      const rows = getFilteredAnalyticsCases();
      const columns = ['Diagnostic Case ID','Diagnostic Status','Diagnostic Language Name','Admin Report Language','FSE Name','Technician Phone','Vehicle Manufacturer','Model','Vehicle Registration No.','Chassis No.','Odometer Km','Kms & Date of Sale','Dealer / Location','City','State','Region','GPS Latitude','GPS Longitude','GPS Address','Suspected Product','Recommended Part No.','Complaint Attended on','Diagnostic Feedback'];
      const csvCell = value => '"' + String(value ?? '').replace(/"/g, '""') + '"';
      const csv = [columns, ...rows.map(item => columns.map(column => {
        const value = item.payload?.[column] ?? (column === 'Diagnostic Case ID' ? item.case_number : '') ?? '';
        if (column === 'Diagnostic Feedback' && value && typeof value === 'object') {
          return value.clarity || '';
        }
        return typeof value === 'object' ? JSON.stringify(value) : value;
      }))].map(row => row.map(csvCell).join(',')).join('\n');
      const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8' })); link.download = 'retarder-iq-cases.csv'; link.click(); URL.revokeObjectURL(link.href);
    }
    let filterTimer;
    const rerenderFilteredView = () => { clearTimeout(filterTimer); filterTimer = setTimeout(() => { pagination.page = 1; loadCases(); }, 250); };
    $('search').addEventListener('input', rerenderFilteredView); $('statusFilter').addEventListener('change', rerenderFilteredView); $('regionFilter').addEventListener('change', rerenderFilteredView); $('manufacturerFilter').addEventListener('change', rerenderFilteredView); $('languageFilter').addEventListener('change', rerenderFilteredView); $('feedbackFilter').addEventListener('change', rerenderFilteredView); $('kmFilter').addEventListener('change', rerenderFilteredView); $('dateFromFilter').addEventListener('change', rerenderFilteredView); $('dateToFilter').addEventListener('change', rerenderFilteredView); $('exportBtn').addEventListener('click', exportCsv); $('refreshBtn').addEventListener('click', loadAll); $('logoutBtn').addEventListener('click', () => { token = ''; adminEventsAbortController?.abort(); clearTimeout(adminEventsReconnectTimer); sessionStorage.removeItem('riq_admin_token'); location.reload(); });
    $('deleteSelectedBtn').addEventListener('click', async () => {
      const ids = selectedCaseIds();
      if (!ids.length || !window.confirm(`Delete ${ids.length} selected report${ids.length === 1 ? '' : 's'} permanently?`)) return;
      try { await api('/api/diagnostics', { method:'DELETE', body:JSON.stringify({ ids }) }); $('detailCard').classList.add('hidden'); $('reportStatus').textContent = `${ids.length} report${ids.length === 1 ? '' : 's'} deleted.`; await loadAll(); } catch (error) { $('reportStatus').textContent = error.message; }
    });
    // Refresh reports frequently so newly submitted diagnostics appear promptly.
    setInterval(() => { if (token && !document.hidden) loadAll(); }, 15000);
    if (token) showDashboard();
