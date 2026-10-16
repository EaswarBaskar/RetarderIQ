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
    const recommendedPartLabel = options.labels?.recommendedPart || 'Recommended Part';
    const referencePartLabel = options.labels?.referencePart || 'Reference part number';
    if (!faults.length) return '<div class="fault-text">No fault details recorded.</div>';
    return faults.map(entry => {
      const title = options.escapeTitle === false ? (entry.title || '') : escapeHtml(entry.title || '');
      const action = escapeHtml(clean(entry.action || entry.title || '-')).replace(/(Root Cause:|Corrective Action:)/gi, '<strong>$1</strong>');
      const part = entry.partNo || (faults.length === 1 ? partFallback : '');
      const references = Array.isArray(entry.referenceParts) && entry.referenceParts.length
        ? '<p class="recommendation reference-part"><strong>' + escapeHtml(referencePartLabel) + ':</strong> ' + escapeHtml(entry.referenceParts.map(item => `${item.brand} ${item.number}`).join(' / ')) + '</p>'
        : '';
      const orderActions = part && part !== '-'
        ? renderOrderActions(part, { brand: entry.brand, technicianName: options.technicianName || options.engineerName, phoneNumber: options.phoneNumber || options.engineerPhone, caseNumber: options.caseNumber, registrationNo: options.registrationNo, chassisNo: options.chassisNo, model: options.model, dealer: options.dealer, region: options.region, location: options.location, technicianType: options.technicianType })
        : '';
      return '<div class="fault-entry"><div class="fault-text">' + (title ? '<strong>' + title + '</strong><br>' : '') + action + '</div>' + (part && part !== '-' ? '<p class="recommendation"><strong>' + escapeHtml(recommendedPartLabel) + ':</strong> ' + escapeHtml(entry.brand ? entry.brand + ' ' + part : part) + '</p>' + orderActions : '') + references + '</div>';
    }).join('');
  }

  function renderOrderActions(partNo, options = {}) {
    const part = escapeHtml(partNo);
    const brand = escapeHtml(options.brand || '');
    const technicianName = escapeHtml(options.technicianName || options.engineerName || '-');
    const phoneNumber = escapeHtml(options.phoneNumber || options.engineerPhone || '-');
    const orderContext = {
      caseNumber: options.caseNumber || '',
      registrationNo: options.registrationNo || '',
      chassisNo: options.chassisNo || '',
      model: options.model || '',
      dealer: options.dealer || '',
      region: options.region || '',
      location: options.location || '',
      technicianType: options.technicianType || ''
    };
    return `<div class="order-part-actions" style="margin:10px 0 14px; padding:12px; border:1px solid #bfdbfe; border-radius:9px; background:#eff6ff;">
      <div style="display:flex; flex-wrap:wrap; gap:8px;">
        <button type="button" class="btn order-now-btn" data-order-part="${part}" data-order-brand="${brand}" data-order-technician="${technicianName}" data-order-phone="${phoneNumber}" data-order-context="${escapeHtml(JSON.stringify(orderContext))}" onclick="window.RIQReportRenderer.handleOrderClick(event)">Order Now</button>
      </div>
    </div>`;
  }

  function handleOrderClick(event) {
    event.preventDefault();
    const button = event.currentTarget;
    const context = (() => { try { return JSON.parse(button.dataset.orderContext || '{}'); } catch { return {}; } })();
    const order = { portal: 'INTERNAL', brand: button.dataset.orderBrand || '', partNo: button.dataset.orderPart, technicianName: button.dataset.orderTechnician, phoneNumber: button.dataset.orderPhone, ...context };
    if (window._activeDiagnosticCaseNumber) order.caseNumber = window._activeDiagnosticCaseNumber;
    if (typeof window.recordPartOrder === 'function') {
      Promise.resolve(window.recordPartOrder(order))
        .then(() => window.alert(typeof t === 'function' ? t('order_shared_success') : 'Your request has been shared with our engineer. They will call you shortly.'))
        .catch(error => { console.error('[Order] Could not record order:', error); window.alert(typeof t === 'function' ? t('order_share_error') : 'We could not share your request. Please try again.'); });
    } else {
      window.alert(typeof t === 'function' ? t('order_noted_success') : 'Your request has been noted. Our engineer will call you shortly.');
    }
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

  window.RIQReportRenderer = { clean, normalizeFaults, renderFaultDetails, renderHistoryRows, renderOrderActions, handleOrderClick };
})();
