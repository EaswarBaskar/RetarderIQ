(function () {
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  function clean(value) {
    return String(value || '-').replace(/<br\s*\/?\s*>/gi, ' ').replace(/<[^>]*>/g, '').trim();
  }

  function normalizeFaults(payload) {
    if (Array.isArray(payload?.['Diagnostic Fault Details']) && payload['Diagnostic Fault Details'].length) {
      return payload['Diagnostic Fault Details'];
    }
    if (payload?.['Diagnostic Status'] === 'WORKING SATISFACTORY') {
      return [{ action: 'Retarder is working satisfactorily.' }];
    }
    return clean(payload?.['Customer Voice / Field Complaints reported'])
      .split(/(?=Root Cause:)/i)
      .map(action => ({ action: action.trim() }))
      .filter(entry => entry.action && entry.action !== '-');
  }

  function renderFaultDetails(payload, options = {}) {
    const faults = normalizeFaults(payload);
    const partFallback = payload?.['Recommended Part No.'] || '-';
    if (!faults.length) return '<div class="fault-text">No fault details recorded.</div>';
    return faults.map(entry => {
      const title = options.escapeTitle === false ? (entry.title || '') : escapeHtml(entry.title || '');
      const action = escapeHtml(clean(entry.action || entry.title || '-')).replace(/(Root Cause:|Corrective Action:)/gi, '<strong>$1</strong>');
      const part = entry.partNo || (faults.length === 1 ? partFallback : '');
      return '<div class="fault-entry"><div class="fault-text">' + (title ? '<strong>' + title + '</strong><br>' : '') + action + '</div>' + (part && part !== '-' ? '<p class="recommendation"><strong>Recommended Part:</strong> ' + escapeHtml(entry.brand ? entry.brand + ' ' + part : part) + '</p>' : '') + '</div>';
    }).join('');
  }

  function renderHistoryRows(history, options = {}) {
    return (Array.isArray(history) ? history : []).map((step, index) => {
      const response = step.response || step.result || '-';
      const responseClass = String(response).toLowerCase() === 'yes' ? 'response-yes' : String(response).toLowerCase() === 'no' ? 'response-no' : '';
      const question = clean(step.question || step.key || step.title || '-');
      const evidence = options.evidence?.[step.key];
      const evidenceCell = options.includeEvidence ? (evidence?.dataUrl ? '<img src="' + escapeHtml(evidence.dataUrl) + '" alt="Evidence" style="width:72px;height:54px;object-fit:cover;border-radius:6px;border:1px solid #cbd5e1;">' : '<span style="color:#94a3b8;">—</span>') : '';
      return '<tr><td>' + String(index + 1).padStart(2, '0') + '</td><td>' + escapeHtml(question) + '</td><td class="' + responseClass + '">' + escapeHtml(response) + '</td>' + (options.includeEvidence ? '<td>' + evidenceCell + '</td>' : '') + '</tr>';
    }).join('');
  }

  window.RIQReportRenderer = { clean, normalizeFaults, renderFaultDetails, renderHistoryRows };
})();
