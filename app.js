// ============================================================================
// App — controlador principal
// ============================================================================

const App = (() => {

  const state = {
    // Datos
    school: null,
    teacher: null,
    schoolYear: null,
    subjects: [],
    courses: [],
    students: [],
    attendanceCache: new Map(),  // key: "studentId|dateISO" → status
    ntdMap: {},                  // key: dateISO → ntd record

    // Curso / materia seleccionados
    currentCourse: null,
    currentSubject: null,

    // Navegación
    viewMode: 'mes',             // 'dia' | 'semana' | 'mes' | 'ciclo'
    anchor: Calendar.today(),
    dateRange: { from: '', to: '' },
    currentDay: '',

    // Fechas visibles
    visibleDays: [],

    // Helpers
    cacheKey: (studentId, date) => `${studentId}|${date}`
  };

  const $ = id => document.getElementById(id);

  // ===== Carga de datos ====================================================

  async function loadAttendanceCache() {
    const { currentCourse } = state;
    if (!currentCourse) return;
    const records = await DataService.getAttendance(currentCourse.id, '2020-01-01', '2099-12-31');
    state.attendanceCache.clear();
    for (const r of records) {
      state.attendanceCache.set(state.cacheKey(r.student_id, r.attendance_date), r.status);
    }
  }

  async function loadNonTeachingDays() {
    if (!state.school) return;
    const days = await DataService.getNonTeachingDays(state.school.id, '2020-01-01', '2099-12-31');
    state.ntdMap = {};
    for (const d of days) state.ntdMap[d.date] = d;
  }

  // ===== Rango de fechas ===================================================

  function computeDateRange() {
    const { viewMode, schoolYear } = state;
    let anchor = state.anchor;

    if (schoolYear) anchor = Calendar.clampDate(anchor, schoolYear);

    if (viewMode === 'dia') {
      // Si cayó en el fin de semana, ir a la semana hábil correspondiente
      const dow = anchor.getDay();
      if (dow === 0) anchor = Calendar.addDays(anchor, 1);
      if (dow === 6) anchor = Calendar.addDays(anchor, 2);
      state.dateRange = { from: Calendar.toISO(anchor), to: Calendar.toISO(anchor) };

    } else if (viewMode === 'semana') {
      const from = Calendar.startOfWeek(anchor);
      const to   = Calendar.endOfWeek(anchor);
      state.dateRange = { from: Calendar.toISO(from), to: Calendar.toISO(to) };

    } else if (viewMode === 'mes') {
      const from = Calendar.startOfMonth(anchor);
      const to   = Calendar.endOfMonth(anchor);
      state.dateRange = { from: Calendar.toISO(from), to: Calendar.toISO(to) };

    } else { // ciclo
      if (schoolYear && schoolYear.start_date && schoolYear.end_date) {
        state.dateRange = { from: schoolYear.start_date, to: schoolYear.end_date };
      } else {
        const y = Calendar.today().getFullYear();
        state.dateRange = {
          from: Calendar.toISO(new Date(y, 2, 1)),
          to:   Calendar.toISO(new Date(y + 1, 11, 31))
        };
      }
    }

    const RangeEl = $('rangeLabel');
    if (RangeEl) {
      RangeEl.textContent = Calendar.formatRangeLabel(
        Calendar.parseDate(state.dateRange.from),
        Calendar.parseDate(state.dateRange.to)
      );
    }
    state.anchor = anchor;
  }

  // ===== Render ============================================================

  async function render() {
    computeDateRange();
    if (state.school) $('appBarTitle').textContent = state.school.name;

    await loadAttendanceCache();
    await loadNonTeachingDays();

    updateViewModeButtons();
    updateNavigationLabel();
    renderSubjects();

    Attendance.renderGrid();
    Students.renderList();
    updateCourseDisplay();
  }

  // ===== Navegación =========================================================

  function shiftBusinessDays(d, n) {
    let r = new Date(d);
    const step = n > 0 ? 1 : -1;
    let remaining = Math.abs(n);
    while (remaining > 0) {
      r = Calendar.addDays(r, step);
      const dow = r.getDay();
      if (dow !== 0 && dow !== 6) remaining--;
    }
    return r;
  }

  function navigate(dir) {
    const { viewMode } = state;
    if (viewMode === 'dia') {
      state.anchor = shiftBusinessDays(state.anchor, dir);
    } else if (viewMode === 'semana') {
      state.anchor = Calendar.addDays(state.anchor, dir * 7);
    } else if (viewMode === 'mes') {
      state.anchor = Calendar.addMonths(state.anchor, dir);
    } else {
      state.anchor = Calendar.addMonths(state.anchor, dir * 12);
    }
    render();
  }

  function goToToday() {
    state.anchor = Calendar.today();
    render();
  }

  function setViewMode(mode) {
    state.viewMode = mode;
    render();
  }

  function goToDate(iso) {
    state.anchor = Calendar.parseDate(iso);
    state.viewMode = state.viewMode === 'dia' ? 'dia' : 'mes';
    render();
  }

  function updateNavigationLabel() {
    const label = $('navLabel');
    if (!label) return;

    const { viewMode } = state;
    const from = Calendar.parseDate(state.dateRange.from);
    const to   = Calendar.parseDate(state.dateRange.to);

    if (viewMode === 'dia') {
      label.textContent = `${Calendar.DAY_LONG[from.getDay()]} ${Calendar.toArg(from)}`;
    } else if (viewMode === 'semana') {
      label.textContent = `Semana del ${Calendar.toArg(from)}`;
    } else if (viewMode === 'mes') {
      label.textContent = `${Calendar.MONTH_LONG[from.getMonth()]} ${from.getFullYear()}`;
    } else {
      label.textContent = `Ciclo lectivo ${from.getFullYear()}`;
    }
  }

  function updateViewModeButtons() {
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === state.viewMode);
    });
  }

  // ===== Materias ===========================================================

  function renderSubjects() {
    const sel = $('subjectSelect');
    if (!sel) return;
    sel.innerHTML = state.subjects.map(s =>
      `<option value="${s.id}" ${s.id === state.currentSubject?.id ? 'selected' : ''}>${UI.esc(s.name)}</option>`
    ).join('');

    $('subjectBadge').textContent = state.currentSubject ? state.currentSubject.name : '';
  }

  async function handleNewSubject() {
    const name = (window.prompt('Nombre de la materia:') || '').trim();
    if (!name) return;
    try {
      state.currentSubject = await DataService.ensureSubject(name);
      state.subjects = [state.currentSubject, ...state.subjects.filter(s => s.id !== state.currentSubject.id)];
      renderSubjects();
      UI.toast('Materia creada', 'success');
    } catch (err) {
      console.error(err);
      UI.toast('No se pudo crear la materia', 'error');
    }
  }

  // ===== Cursos =============================================================

  async function initCourses() {
    const years = await DataService.getSchoolYears();
    if (!years.length) {
      state.schoolYear = await DataService.ensureSchoolYear(Calendar.today().getFullYear());
    } else {
      state.schoolYear = years[0];
    }

    state.courses = await DataService.getCourses(state.schoolYear.id);

    if (!state.courses.length) {
      state.currentCourse = await DataService.createCourse({
        year_level: 3,
        division: 'B',
        shift: 'mañana',
        school_year_id: state.schoolYear.id
      });
    } else {
      state.currentCourse = state.courses[0];
    }

    // Materia por defecto
    state.currentSubject = state.subjects[0] || await DataService.ensureSubject('Matemática');
    if (!state.subjects.some(s => s.id === state.currentSubject.id)) {
      state.subjects.unshift(state.currentSubject);
    }
  }

  function updateCourseDisplay() {
    const display = $('currentCourseLabel');
    if (display && state.currentCourse) {
      display.textContent =
        `${state.currentCourse.year_level}° ${state.currentCourse.division} — ${state.currentCourse.shift}`;
    }

    const sel = $('courseSelect');
    if (sel) {
      sel.innerHTML = state.courses.map(c =>
        `<option value="${c.id}" ${c.id === state.currentCourse?.id ? 'selected' : ''}>
          ${c.year_level}° ${c.division} — ${c.shift}
        </option>`).join('');
    }
  }

  async function onCourseSelect(courseId) {
    state.currentCourse = state.courses.find(c => c.id === courseId);
    if (!state.currentCourse) return;
    state.students = await DataService.getStudents(state.currentCourse.id);
    await render();
  }

  async function handleNewCourse(e) {
    e.preventDefault();

    const year_level = parseInt($('newCourseYear').value);
    const division   = $('newCourseDivision').value.trim().toUpperCase();
    const shift      = $('newCourseShift').value;

    if (!division) {
      UI.toast('Ingresá la división', 'error');
      return;
    }

    try {
      const course = await DataService.createCourse({
        year_level, division, shift, school_year_id: state.schoolYear.id
      });
      state.courses.push(course);
      state.currentCourse = course;
      state.students = [];
      UI.closeModal('newCourseModal');
      await render();
      UI.toast('Curso creado', 'success');
    } catch (err) {
      console.error('Error creando curso:', err);
      UI.toast('No se pudo crear el curso', 'error');
    }
  }

  // ===== Settings (Supabase) ===============================================

  function openSettingsModal() {
    $('settingsUrl').value = localStorage.getItem('sb_url') || window.APP_CONFIG.SUPABASE_URL || '';
    $('settingsKey').value = localStorage.getItem('sb_key') || window.APP_CONFIG.SUPABASE_KEY || '';
    $('settingsSchool').value = state.school?.name || '';
    UI.openModal('settingsModal');
  }

  function saveSettings() {
    localStorage.setItem('sb_url', $('settingsUrl').value.trim());
    localStorage.setItem('sb_key', $('settingsKey').value.trim());
    localStorage.setItem('sb_school', $('settingsSchool').value.trim());
    UI.closeModal('settingsModal');
    UI.toast('Configuración guardada. Recargá la página para aplicar.', 'info');
  }

  // ===== Inicialización =====================================================

  async function init() {
    // Config posiblemente guardada en localStorage
    const savedUrl = localStorage.getItem('sb_url');
    const savedKey = localStorage.getItem('sb_key');
    if (savedUrl) window.APP_CONFIG.SUPABASE_URL = savedUrl;
    if (savedKey) window.APP_CONFIG.SUPABASE_KEY = savedKey;

    await DataService.init();
    state.school = DataService.school;

    state.teacher = await DataService.getTeacher();
    state.subjects = await DataService.getSubjects();
    await initCourses();

    if (state.currentCourse) {
      state.students = await DataService.getStudents(state.currentCourse.id);
    }

    bindAll();
    render();

    // Banner modo demo
    if (DataService.isDemo) {
      $('demoBanner').style.display = 'flex';
      $('badgeDemo').style.display = '';
      UI.toast('Modo demo: los datos se guardan en este navegador. Configurá Supabase en ⚙.', 'warning', 6000);
    }
  }

  // ===== Bindings ===========================================================

  function bindAll() {
    // Navegación
    $('btnPrev')?.addEventListener('click', () => navigate(-1));
    $('btnNext')?.addEventListener('click', () => navigate(1));
    $('btnToday')?.addEventListener('click', goToToday);

    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => setViewMode(btn.dataset.view));
    });

    $('jumpToDate')?.addEventListener('change', e => {
      if (e.target.value) goToDate(e.target.value);
    });

    $('activeDayTitle')?.addEventListener('change', e => {
      if (!e.target.value) return;
      state.currentDay = e.target.value;
      Attendance.highlightActiveColumn();
      Attendance.updateDaySummary();
      Attendance.updateGeneralPanel();
    });

    // Cursos
    $('courseSelect')?.addEventListener('change', e => onCourseSelect(e.target.value));
    $('newCourseBtn')?.addEventListener('click', () => UI.openModal('newCourseModal'));
    $('newCourseForm')?.addEventListener('submit', handleNewCourse);
    $('newCourseModal')?.addEventListener('click', e => {
      if (e.target.classList.contains('modal')) UI.closeModal('newCourseModal');
    });

    // Materias
    $('subjectSelect')?.addEventListener('change', e => {
      state.currentSubject = state.subjects.find(s => s.id === e.target.value) || null;
      renderSubjects();
    });
    $('newSubjectBtn')?.addEventListener('click', handleNewSubject);

    // Alumnos
    Students.bindEvents();

    // Panel de alumnos (abrir/cerrar)
    const panel = $('studentPanel');
    $('studentPanelToggle')?.addEventListener('click', () => panel.classList.toggle('open'));
    $('closeStudentPanel')?.addEventListener('click', () => panel.classList.remove('open'));

    // Settings
    $('settingsBtn')?.addEventListener('click', openSettingsModal);
    $('settingsSaveBtn')?.addEventListener('click', saveSettings);
    $('settingsCancelBtn')?.addEventListener('click', () => UI.closeModal('settingsModal'));
    $('settingsModal')?.addEventListener('click', e => {
      if (e.target.classList.contains('modal')) UI.closeModal('settingsModal');
    });

    // Cerrar modales con Escape
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
      }
    });
  }

  return {
    state,
    init,
    render,
    navigate,
    goToToday,
    setViewMode,
    onCourseSelect
  };
})();

// ===== Boot =================================================================
document.addEventListener('DOMContentLoaded', () => {
  App.init().catch(err => {
    console.error('Error inicializando la aplicación:', err);
    UI.toast('Error al iniciar la aplicación', 'error');
  });
});