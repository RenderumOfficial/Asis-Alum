// ============================================================================
// UI — utilidades de interfaz y estados de asistencia
// ============================================================================

const UI = (() => {

  // ===== Estados de asistencia ===========================================
  // Ciclo de click: present → absent → half_absent → justified → present
  const STATES = [
    { key: 'present',      code: 'P', label: 'Presente',    className: 'st-present',     color: '#16a34a' },
    { key: 'absent',       code: 'A', label: 'Ausente',     className: 'st-absent',      color: '#dc2626' },
    { key: 'half_absent',  code: 'M', label: 'Media falta', className: 'st-half-absent', color: '#d97706' },
    { key: 'justified',    code: 'J', label: 'Justificado', className: 'st-justified',   color: '#2563eb' }
  ];

  function stateInfo(key) {
    return STATES.find(s => s.key === key) || { key: '', code: '', label: '', className: '' };
  }

  function nextState(key) {
    if (!key) return STATES[0].key;
    const idx = STATES.findIndex(s => s.key === key);
    return STATES[(idx + 1) % STATES.length].key;
  }

  // ===== Helpers =========================================================

  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v);
      }
    }
    for (const c of children) {
      if (c === null || c === undefined) continue;
      node.append(c.nodeType ? c : document.createTextNode(c));
    }
    return node;
  }

  function empty(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  // ===== Toast ===========================================================

  let toastContainer = null;

  function toast(msg, type = 'info', ms = 3200) {
    if (!toastContainer) {
      toastContainer = el('div', { class: 'toast-container' });
      document.body.appendChild(toastContainer);
    }
    const icons = { info: 'ℹ', success: '✓', error: '✕', warning: '⚠' };
    const t = el('div', { class: `toast toast-${type}` },
      el('span', { class: 'toast-icon', text: icons[type] || 'ℹ' }),
      el('span', { text: msg })
    );
    toastContainer.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 300);
    }, ms);
  }

  // ===== Modal ===========================================================

  function openModal(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.add('open');
    const focusEl = m.querySelector('[data-autofocus]');
    if (focusEl) setTimeout(() => focusEl.focus(), 60);
  }

  function closeModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.remove('open');
  }

  function confirmDialog({ title, message, danger = true, okText = 'Confirmar' } = {}) {
    return new Promise(resolve => {
      const backdrop = el('div', { class: 'confirm-backdrop' },
        el('div', { class: 'confirm-dialog' },
          el('h3', { text: title }),
          el('p', { text: message }),
          el('div', { class: 'confirm-actions' },
            el('button', { class: 'btn', text: 'Cancelar', onClick: () => {
                backdrop.remove(); resolve(false);
              } }),
            el('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, text: okText, onClick: () => {
                backdrop.remove(); resolve(true);
              } })
          )
        )
      );
      document.body.appendChild(backdrop);
      requestAnimationFrame(() => backdrop.classList.add('show'));
    });
  }

  return {
    STATES, stateInfo, nextState,
    esc, debounce, el, empty,
    toast, openModal, closeModal, confirmDialog
  };
})();