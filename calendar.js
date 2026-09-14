// ============================================================================
// Calendar — utilidades de fechas para la planilla de asistencia
// ============================================================================

const Calendar = (() => {

  const DAY_SHORT  = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const DAY_LONG   = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const MONTH_LONG = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                       'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  function pad(n) { return String(n).padStart(2, '0'); }

  // Date local → "YYYY-MM-DD" (sin problemas de timezone)
  function toISO(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  // Date → "DD/MM/YYYY"
  function toArg(d) {
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  }

  function parseDate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function addDays(d, n) {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  }

  function addMonths(d, n) {
    const r = new Date(d);
    r.setMonth(r.getMonth() + n);
    return r;
  }

  function startOfWeek(d) {
    const r = new Date(d);
    const day = r.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Lunes como primer día
    r.setDate(r.getDate() + diff);
    return r;
  }

  function endOfWeek(d) {
    return addDays(startOfWeek(d), 6); // Domingo
  }

  function startOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  function endOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth() + 1, 0);
  }

  function isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear()
        && a.getMonth() === b.getMonth()
        && a.getDate() === b.getDate();
  }

  function isToday(d) { return isSameDay(d, new Date()); }

  function today() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  // Días hábiles (Lun–Vie) entre dos fechas inclusive
  function buildBusinessDays(from, to) {
    const days = [];
    let cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    while (cursor <= end) {
      const dow = cursor.getDay();
      if (dow !== 0 && dow !== 6) days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }

  // Días hábiles de la semana que contiene `d`
  function weekDays(d) { return buildBusinessDays(startOfWeek(d), endOfWeek(d)); }

  // Días hábiles del mes que contiene `d`
  function monthDays(d) { return buildBusinessDays(startOfMonth(d), endOfMonth(d)); }

  // Días hábiles del ciclo lectivo
  function yearDays(schoolYear) {
    if (!schoolYear || !schoolYear.start_date || !schoolYear.end_date) return [];
    return buildBusinessDays(parseDate(schoolYear.start_date), parseDate(schoolYear.end_date));
  }

  // Clamp de una fecha a los límites del ciclo
  function clampDate(d, schoolYear) {
    if (!schoolYear || !schoolYear.start_date || !schoolYear.end_date) return d;
    const start = parseDate(schoolYear.start_date);
    const end   = parseDate(schoolYear.end_date);
    if (d < start) return start;
    if (d > end) return end;
    return d;
  }

  function formatRangeLabel(from, to) {
    if (from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear()) {
      return `${MONTH_LONG[from.getMonth()]} ${from.getFullYear()}`;
    }
    return `${toArg(from)} — ${toArg(to)}`;
  }

  function formatDayHeader(d) {
    return `${DAY_SHORT[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  }

  return {
    DAY_SHORT, DAY_LONG, MONTH_LONG,
    pad, toISO, toArg, parseDate,
    addDays, addMonths, startOfWeek, endOfWeek,
    startOfMonth, endOfMonth,
    isSameDay, isToday, today, clampDate,
    buildBusinessDays, weekDays, monthDays, yearDays,
    formatRangeLabel, formatDayHeader
  };
})();