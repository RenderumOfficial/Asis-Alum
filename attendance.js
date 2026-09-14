// ============================================================================
// Attendance — planilla de asistencia (grid estilo Excel)
// ============================================================================

const Attendance = (() => {

  // Cola de guardados pendientes (por si el usuario hace clicks muy rápido)
  const pending = new Map();
  let flushTimer = null;

  // ===== Construcción del grid ============================================

  function currentDays() {
    const { dateRange } = App.state;
    return Calendar.buildBusinessDays(
      Calendar.parseDate(dateRange.from),
      Calendar.parseDate(dateRange.to)
    ).map(d => ({ iso: Calendar.toISO(d), today: Calendar.isToday(d) }));
  }

  function renderGrid() {
    const wrap = document.getElementById('sheetWrap');
    if (!wrap) return;

    const { students } = App.state;
    const days = currentDays();
    App.state.visibleDays = days;
    const ntdMap = App.state.ntdMap || {};

    const dateColsHtml = days.map(d => {
      const ntd = ntdMap[d.iso];
      const cls = ['col-date'];
      if (d.today) cls.push('day-today');
      if (ntd) cls.push('day-ntd');
      if (d.iso === App.state.currentDay) cls.push('day-active');

      const dt = Calendar.parseDate(d.iso);
      const tip = ntd
        ? `${Calendar.DAY_LONG[dt.getDay()]} ${Calendar.toArg(dt)} — ${UI.esc(ntd.reason)}`
        : `${Calendar.DAY_LONG[dt.getDay()]} ${Calendar.toArg(dt)}`;

      return `<th class="${cls.join(' ')}" data-date="${d.iso}" title="${tip}">
          <div class="dow">${Calendar.DAY_SHORT[dt.getDay()]}</div>
          <div class="dnum">${UI.esc(Calendar.toArg(dt))}</div>
          ${ntd ? '<div class="ntd-badge">◼</div>' : ''}
        </th>`;
    }).join('');

    let bodyRows = '';
    for (const st of students) {
      bodyRows += buildRowHtml(st, days, ntdMap);
    }

    wrap.innerHTML = `
      <div class="sheet-scroll" id="sheetScroll">
        <table class="sheet" id="sheetTable">
          <thead>
            <tr>
              <th class="col-froz col-num">N°</th>
              <th class="col-froz col-name">Apellido y Nombre</th>
              ${dateColsHtml}
              <th class="col-froz col-summary">Resumen</th>
            </tr>
          </thead>
          <tbody id="sheetTbody">
            ${bodyRows || '<tr><td colspan="999" class="empty-sheet">No hay alumnos en este curso. Usá «+ Alumno» o el panel 👤 para agregar.</td></tr>'}
          </tbody>
        </table>
      </div>`;

    bindEvents();
    if (!App.state.currentDay || !days.some(d => d.iso === App.state.currentDay)) {
      setDefaultActiveDay();
    } else {
      highlightActiveColumn();
    }
    updateDaySummary();
    updateRowSummaries();
    updateGeneralPanel();
  }

  function buildRowHtml(st, days, ntdMap) {
    const fullName = `${UI.esc(st.last_name)}, ${UI.esc(st.first_name)}`;

    const cells = days.map(d => {
      const iso = d.iso;
      const status = App.state.attendanceCache.get(App.state.cacheKey(st.id, iso)) || '';
      const ntd = ntdMap[iso];

      const cls = ['cell'];
      if (ntd) cls.push('cell-ntd');
      if (d.today) cls.push('cell-today');
      if (status) cls.push('st-' + status);

      const info = UI.stateInfo(status);
      const title = ntd
        ? 'Día no lectivo'
        : status ? `${info.label} — ${Calendar.toArg(Calendar.parseDate(iso))}` : '';

      return `<td class="${cls.join(' ')}"
                 data-student="${st.id}" data-date="${iso}" data-status="${status}"
                 title="${title}" ${ntd ? 'data-ntd="1"' : ''}>${status ? info.code : ''}</td>`;
    }).join('');

    return `<tr data-row="${st.id}">
        <td class="col-froz col-num">${st.list_number ?? '—'}</td>
        <td class="col-froz col-name"><span class="student-name">${fullName}</span></td>
        ${cells}
        <td class="col-froz col-summary" data-summary="${st.id}">—</td>
      </tr>`;
  }

  // ===== Eventos ==========================================================

  function bindEvents() {
    const scroll = document.getElementById('sheetScroll');
    scroll.addEventListener('click', handleClick);
    scroll.addEventListener('dblclick', handleDblClick);
  }

  function handleClick(e) {
    const th = e.target.closest('th.col-date');
    if (th && th.dataset.date) {
      App.state.currentDay = th.dataset.date;
      highlightActiveColumn();
      updateDaySummary();
      updateGeneralPanel();
      return;
    }

    const cell = e.target.closest('td.cell');
    if (!cell) return;
    if (cell.dataset.ntd) {
      UI.toast('Día no lectivo: no se puede registrar asistencia', 'warning');
      return;
    }
    cycleCell(cell);
  }

  // Doble click sobre el nombre del alumno → editar
  function handleDblClick(e) {
    const nameCell = e.target.closest('td.col-name');
    if (nameCell) {
      const row = nameCell.closest('tr');
      if (row) Students.openEditStudent(row.dataset.row);
    }
  }

  // Ciclo: '' → present → absent → half_absent → justified → present
  function cycleCell(cell) {
    const studentId = cell.dataset.student;
    const date = cell.dataset.date;
    const current = cell.dataset.status || '';
    const next = UI.nextState(current);

    // Optimístico: actualizar interfaz de inmediato
    App.state.attendanceCache.set(App.state.cacheKey(studentId, date), next);
    cell.dataset.status = next;
    applyCellVisual(cell, next);

    scheduleSave(studentId, date, next);

    updateDaySummary();
    updateRowSummary(studentId);
    updateGeneralPanel();
  }

  // Guardado diferido en cola (permite clicks rápidos sin perder ninguna celda)
  function scheduleSave(studentId, date, status) {
    const { currentCourse, currentSubject, teacher } = App.state;
    if (!currentCourse) return;

    pending.set(`${studentId}|${date}`, {
      student_id: studentId,
      course_id: currentCourse.id,
      subject_id: currentSubject ? currentSubject.id : null,
      teacher_id: teacher ? teacher.id : null,
      attendance_date: date,
      status
    });

    clearTimeout(flushTimer);
    flushTimer = setTimeout(flushPending, 400);
  }

  async function flushPending() {
    if (!pending.size) return;
    const items = [...pending.values()];
    pending.clear();
    await Promise.allSettled(items.map(rec =>
      DataService.upsertAttendance(rec).catch(err => {
        console.error('Error guardando asistencia:', err);
        UI.toast('No se pudo guardar la asistencia', 'error');
      })
    ));
  }

  function applyCellVisual(cell, status) {
    const info = UI.stateInfo(status);
    cell.classList.remove('st-present', 'st-absent', 'st-half-absent', 'st-justified');
    cell.textContent = status ? info.code : '';
    if (status) {
      cell.classList.add(info.className);
      cell.title = `${info.label} — ${Calendar.toArg(Calendar.parseDate(cell.dataset.date))}`;
    } else {
      cell.title = '';
    }
  }

  // ===== Columna activa / día de referencia ===============================

  function setDefaultActiveDay() {
    const days = App.state.visibleDays || [];
    if (!days.length) return;
    const today = days.find(d => d.iso === Calendar.toISO(Calendar.today()));
    App.state.currentDay = today ? today.iso : days[0].iso;
    highlightActiveColumn();
  }

  function highlightActiveColumn() {
    const table = document.getElementById('sheetTable');
    if (!table) return;
    table.querySelectorAll('th.col-date:not([data-ntd]), td.cell:not([data-ntd])').forEach(node => {
      const active = node.dataset.date === App.state.currentDay;
      node.classList.toggle('day-active', active);
    });

    const picker = document.getElementById('activeDayTitle');
    if (picker && App.state.currentDay) {
      picker.value = App.state.currentDay;
      const d = Calendar.parseDate(App.state.currentDay);
      picker.setAttribute('title',
        `${Calendar.DAY_LONG[d.getDay()]} ${Calendar.toArg(d)}`);
    }
  }

  // ===== Resumen del día (panel superior) =================================

  function updateDaySummary() {
    const day = App.state.currentDay;
    const { students } = App.state;
    const counts = { present: 0, absent: 0, half_absent: 0, justified: 0, unset: 0 };

    for (const st of students) {
      const status = App.state.attendanceCache.get(App.state.cacheKey(st.id, day)) || '';
      if (status) counts[status]++;
      else counts.unset++;
    }

    const set = (id, value) => {
      const n = document.getElementById(id);
      if (n) n.textContent = value;
    };

    set('gAlumnos', students.length);
    set('dayPresent', counts.present);
    set('dayAbsent', counts.absent);
    set('dayHalf', counts.half_absent);
    set('dayJustified', counts.justified);
    set('dayUnset', counts.unset);

    const marked = counts.present + counts.absent + counts.half_absent + counts.justified;
    const attended = counts.present + counts.half_absent * 0.5;
    const pct = marked ? Math.round((attended / marked) * 1000) / 10 : 0;
    set('dayPct', pct + '%');
  }

  // ===== Resumen por alumno ===============================================

  function updateRowSummaries() {
    for (const st of App.state.students) updateRowSummary(st.id);
  }

  function updateRowSummary(studentId) {
    const td = document.querySelector(`td.col-summary[data-summary="${studentId}"]`);
    if (!td) return;

    const c = { present: 0, absent: 0, half_absent: 0, justified: 0 };
    App.state.attendanceCache.forEach((status, key) => {
      if (key.startsWith(studentId + '|')) c[status] = (c[status] || 0) + 1;
    });

    const total = c.present + c.absent + c.half_absent + c.justified;
    const attended = c.present + c.half_absent * 0.5;
    const pct = total ? Math.round((attended / total) * 1000) / 10 : 0;

    td.innerHTML = `
      <div class="mini-stats">
        <span class="ms ms-p" title="Presentes">${c.present} <b>P</b></span>
        <span class="ms ms-a" title="Ausentes">${c.absent} <b>A</b></span>
        <span class="ms ms-m" title="Medias faltas">${c.half_absent} <b>M</b></span>
        <span class="ms ms-j" title="Justificados">${c.justified} <b>J</b></span>
        <span class="ms-pct" title="Porcentaje de asistencia">${pct}%</span>
      </div>`;
  }

  // ===== Panel general ====================================================

  function updateGeneralPanel() {
    const el = id => document.getElementById(id);
    if (el('gAlumnos')) el('gAlumnos').textContent = App.state.students.length;
  }

  // ===== Public ===========================================================

  return {
    renderGrid,
    currentDays,
    updateDaySummary,
    updateRowSummary,
    updateRowSummaries,
    updateGeneralPanel,
    setDefaultActiveDay,
    highlightActiveColumn
  };
})();