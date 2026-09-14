// ============================================================================
// DataService — capa de acceso a datos
//   - Modo producción:  Supabase (PostgreSQL remoto)
//   - Modo demo:        localStorage (sin configuración necesaria)
// ============================================================================

const DataService = (() => {
  let sb = null;
  let isDemo = true;
  let school = null;

  // ===== Helpers locales (localStorage) ================================

  const LKEY = 'atd_demo';

  function _local(key)        { return JSON.parse(localStorage.getItem(LKEY + '_' + key) || '[]'); }
  function _save(key, arr)    { localStorage.setItem(LKEY + '_' + key, JSON.stringify(arr)); }
  function _uid()             { return crypto.randomUUID(); }

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function _localInsert(table, row) {
    row.id = _uid();
    row.created_at = new Date().toISOString();
    const arr = _local(table);
    arr.push(row);
    _save(table, arr);
    return row;
  }

  function _localSelect(table, filter) {
    let arr = _local(table);
    if (filter) {
      for (const [k, v] of Object.entries(filter)) {
        if (v === undefined || v === null) continue;
        if (typeof v === 'boolean') arr = arr.filter(r => !!r[k] === v);
        else if (Array.isArray(v)) arr = arr.filter(r => v.includes(r[k]));
        else arr = arr.filter(r => r[k] === v);
      }
    }
    return arr;
  }

  function _localUpdate(table, id, fields) {
    const arr = _local(table);
    const idx = arr.findIndex(r => r.id === id);
    if (idx === -1) return null;
    Object.assign(arr[idx], fields, { updated_at: new Date().toISOString() });
    _save(table, arr);
    return arr[idx];
  }

  function _localDelete(table, id) {
    _save(table, _local(table).filter(r => r.id !== id));
  }

  function _localUpsert(table, match, data) {
    const arr = _local(table);
    const idx = arr.findIndex(r => match(r));
    if (idx >= 0) {
      Object.assign(arr[idx], data, { updated_at: new Date().toISOString() });
      _save(table, arr);
      return arr[idx];
    }
    data.id = data.id || _uid();
    data.created_at = data.created_at || new Date().toISOString();
    arr.push(data);
    _save(table, arr);
    return data;
  }

  // ===== Seed demo ====================================================

  function _seedDemo() {
    const schools = _local('schools');
    if (schools.length > 0) return;

    const scId = _localInsert('schools', {
      name: window.APP_CONFIG.DEMO_SCHOOL_NAME,
      address: 'Calle 40 N°1500, Buenos Aires'
    });

    const syId = _localInsert('school_years', {
      school_id: scId,
      year: new Date().getFullYear(),
      start_date: `${new Date().getFullYear()}-03-01`,
      end_date: `${new Date().getFullYear() + 1}-12-15`
    });

    const crId = _localInsert('courses', {
      school_id: scId,
      school_year_id: syId,
      year_level: 3,
      division: 'B',
      shift: 'mañana',
      active: true
    });

    _localInsert('subjects', { school_id: scId, name: 'Matemática' });

    _localInsert('teachers', {
      school_id: scId,
      first_name: 'María',
      last_name: 'López',
      email: 'docente@escuela.edu.ar'
    });

    const alumnos = [
      { first_name: 'Juan',       last_name: 'Pérez',      list_number: 1 },
      { first_name: 'Ana',        last_name: 'Gómez',      list_number: 2 },
      { first_name: 'Lucas',      last_name: 'Rodríguez',  list_number: 3 },
      { first_name: 'Valentina',  last_name: 'Fernández',  list_number: 4 },
      { first_name: 'Mateo',      last_name: 'López',      list_number: 5 },
      { first_name: 'Sofía',      last_name: 'Martínez',   list_number: 6 },
      { first_name: 'Tomás',      last_name: 'Díaz',       list_number: 7 },
      { first_name: 'Camila',     last_name: 'Torres',     list_number: 8 },
      { first_name: 'Benjamín',   last_name: 'Álvarez',    list_number: 9 },
      { first_name: 'Lucía',      last_name: 'Romero',     list_number: 10 }
    ];

    for (const al of alumnos) {
      const stId = _localInsert('students', {
        school_id: scId,
        first_name: al.first_name,
        last_name: al.last_name,
        list_number: al.list_number,
        active: true
      });
      _localInsert('enrollments', {
        student_id: stId,
        course_id: crId,
        enrolled_at: `${new Date().getFullYear()}-03-01`,
        active: true
      });
    }
  }

  // =====================================================================
  //  PUBLIC API
  // =====================================================================

  return {
    get isDemo()      { return isDemo; },
    get school()      { return school; },

    // ---- Inicialización -------------------------------------------------

    async init() {
      const url = window.APP_CONFIG.SUPABASE_URL;
      const key = window.APP_CONFIG.SUPABASE_KEY;

      if (url && key && typeof window.supabase !== 'undefined') {
        try {
          sb = window.supabase.createClient(url, key);
          const { error } = await sb.from('schools').select('id').limit(1);
          if (error) throw error;
          isDemo = false;
          console.log('%c[DataService] Supabase conectado ✓', 'color:#22c55e;font-weight:bold');
        } catch (err) {
          console.warn('[DataService] Supabase no disponible, usando modo demo:', err.message);
          isDemo = true;
        }
      }

      if (isDemo) {
        _seedDemo();
        console.log('%c[DataService] Modo demo (localStorage) ✓', 'color:#f59e0b;font-weight:bold');
      }

      school = await this._getSchool();
    },

    // ---- Escuela --------------------------------------------------------

    async _getSchool() {
      if (isDemo) return _local('schools')[0] || null;
      const { data } = await sb.from('schools').select('*').limit(1).single();
      return data || null;
    },

    // ---- Ciclos lectivos ------------------------------------------------

    async getSchoolYears() {
      if (isDemo) return _local('school_years').sort((a, b) => b.year - a.year);
      const { data } = await sb.from('school_years')
        .select('*').eq('school_id', school.id).order('year', { ascending: false });
      return data || [];
    },

    async ensureSchoolYear(year) {
      if (isDemo) {
        let sy = _local('school_years').find(s => s.year === year);
        if (!sy) {
          sy = _localInsert('school_years', {
            school_id: school.id, year,
            start_date: `${year}-03-01`,
            end_date: `${year + 1}-12-15`
          });
        }
        return sy;
      }
      const { data: existing } = await sb.from('school_years')
        .select('*').eq('school_id', school.id).eq('year', year).limit(1);
      if (existing && existing.length > 0) return existing[0];
      const { data } = await sb.from('school_years')
        .insert({ school_id: school.id, year,
                  start_date: `${year}-03-01`,
                  end_date: `${year + 1}-12-15` })
        .select().single();
      return data;
    },

    // ---- Cursos ---------------------------------------------------------

    async getCourses(schoolYearId) {
      if (isDemo) {
        return _local('courses', { school_id: school.id, school_year_id: schoolYearId, active: true })
          .sort((a, b) => a.year_level - b.year_level || a.division.localeCompare(b.division));
      }
      const { data } = await sb.from('courses')
        .select('*')
        .eq('school_id', school.id)
        .eq('school_year_id', schoolYearId)
        .eq('active', true)
        .order('year_level').order('division');
      return data || [];
    },

    async getCourse(id) {
      if (isDemo) return _local('courses').find(c => c.id === id) || null;
      const { data } = await sb.from('courses').select('*').eq('id', id).single();
      return data;
    },

    async createCourse({ year_level, division, shift, school_year_id }) {
      if (isDemo) {
        return _localInsert('courses', {
          school_id: school.id, school_year_id,
          year_level, division, shift, active: true
        });
      }
      const { data } = await sb.from('courses')
        .insert({ school_id: school.id, school_year_id,
                  year_level, division, shift, active: true })
        .select().single();
      return data;
    },

    async deleteCourse(id) {
      if (isDemo) { _localDelete('courses', id); return; }
      await sb.from('courses').delete().eq('id', id);
    },

    // ---- Materias -------------------------------------------------------

    async getSubjects() {
      if (isDemo) return _local('subjects', { school_id: school.id });
      const { data } = await sb.from('subjects')
        .select('*').eq('school_id', school.id).order('name');
      return data || [];
    },

    async ensureSubject(name) {
      if (isDemo) {
        let sub = _local('subjects').find(s => s.name === name);
        if (!sub) sub = _localInsert('subjects', { school_id: school.id, name });
        return sub;
      }
      const { data: ex } = await sb.from('subjects')
        .select('*').eq('school_id', school.id).eq('name', name).limit(1);
      if (ex && ex.length > 0) return ex[0];
      const { data } = await sb.from('subjects')
        .insert({ school_id: school.id, name }).select().single();
      return data;
    },

    // ---- Docente --------------------------------------------------------

    async getTeacher() {
      if (isDemo) return _local('teachers', { school_id: school.id })[0] || null;
      const { data } = await sb.from('teachers')
        .select('*').eq('school_id', school.id).limit(1).maybeSingle();
      return data;
    },

    // ---- Alumnos + inscripciones ---------------------------------------

    async getStudents(courseId) {
      if (isDemo) {
        const enrollments = _local('enrollments', { course_id: courseId, active: true });
        const allStudents = _local('students', { active: true });
        return enrollments
          .map(e => {
            const st = allStudents.find(s => s.id === e.student_id);
            if (!st) return null;
            return { ...st, enrollment_id: e.id, enrolled_at: e.enrolled_at };
          })
          .filter(Boolean)
          .sort((a, b) => (a.list_number || 9999) - (b.list_number || 9999));
      }

      const { data } = await sb.from('enrollments')
        .select(`
          id as enrollment_id, enrolled_at,
          student:students(id, first_name, last_name, list_number, active, school_id, created_at, updated_at)
        `)
        .eq('course_id', courseId)
        .eq('active', true);

      return (data || [])
        .map(e => ({ ...e.student, enrollment_id: e.enrollment_id, enrolled_at: e.enrolled_at }))
        .filter(s => s && s.active)
        .sort((a, b) => (a.list_number || 9999) - (b.list_number || 9999));
    },

    async addStudent({ first_name, last_name, list_number, course_id }) {
      const scId = school.id;

      if (isDemo) {
        const st = _localInsert('students', {
          school_id: scId, first_name, last_name, list_number, active: true
        });
        _localInsert('enrollments', {
          student_id: st.id, course_id, enrolled_at: todayStr(), active: true
        });
        return st;
      }

      const { data: existing } = await sb.from('students')
        .select('*')
        .eq('school_id', scId)
        .eq('first_name', first_name)
        .eq('last_name', last_name)
        .limit(1);

      let student;
      if (existing && existing.length > 0) {
        student = existing[0];
      } else {
        const { data: inserted } = await sb.from('students')
          .insert({ school_id: scId, first_name, last_name, list_number, active: true })
          .select().single();
        student = inserted;
      }

      await sb.from('enrollments')
        .insert({ student_id: student.id, course_id, enrolled_at: todayStr(), active: true })
        .select().single();

      return student;
    },

    async updateStudent(id, fields) {
      if (isDemo) return _localUpdate('students', id, fields);
      const { data } = await sb.from('students')
        .update(fields).eq('id', id).select().single();
      return data;
    },

    async deleteStudentSoft(id) {
      if (isDemo) {
        _localUpdate('students', id, { active: false });
        _local('enrollments')
          .filter(e => e.student_id === id)
          .forEach(e => _localUpdate('enrollments', e.id, { active: false }));
        return;
      }
      await sb.from('students').update({ active: false }).eq('id', id);
      await sb.from('enrollments').update({ active: false }).eq('student_id', id);
    },

    async reorderStudents(orderedIds) {
      if (isDemo) {
        orderedIds.forEach((id, i) => _localUpdate('students', id, { list_number: i + 1 }));
        return;
      }
      await Promise.all(orderedIds.map((id, i) =>
        sb.from('students').update({ list_number: i + 1 }).eq('id', id)
      ));
    },

    // ---- Asistencia -----------------------------------------------------

    async getAttendance(courseId, from, to) {
      if (isDemo) {
        return _local('attendance', { course_id: courseId })
          .filter(r => r.attendance_date >= from && r.attendance_date <= to);
      }
      const { data } = await sb.from('attendance')
        .select('*')
        .eq('course_id', courseId)
        .gte('attendance_date', from)
        .lte('attendance_date', to);
      return data || [];
    },

    async upsertAttendance({ student_id, course_id, subject_id, teacher_id, attendance_date, status }) {
      if (isDemo) {
        return _localUpsert(
          'attendance',
          r => r.student_id === student_id
            && r.course_id === course_id
            && r.attendance_date === attendance_date
            && (r.subject_id || null) === (subject_id || null),
          { student_id, course_id, subject_id: subject_id || null,
            teacher_id: teacher_id || null, attendance_date, status }
        );
      }

      const { data: existing } = await sb.from('attendance')
        .select('id')
        .eq('student_id', student_id)
        .eq('course_id', course_id)
        .eq('attendance_date', attendance_date)
        .eq('subject_id', subject_id || null)
        .limit(1);

      if (existing && existing.length > 0) {
        const { data } = await sb.from('attendance')
          .update({ status })
          .eq('id', existing[0].id)
          .select().single();
        return data;
      }

      const { data } = await sb.from('attendance')
        .insert({
          student_id, course_id, subject_id: subject_id || null,
          teacher_id: teacher_id || null, attendance_date, status
        })
        .select().single();
      return data;
    },

    // ---- Días no lectivos ------------------------------------------------

    async getNonTeachingDays(schoolId, from, to) {
      const sid = schoolId || school.id;
      if (isDemo) {
        return _local('non_teaching_days', { school_id: sid })
          .filter(d => d.date >= from && d.date <= to);
      }
      const { data } = await sb.from('non_teaching_days')
        .select('*')
        .eq('school_id', sid)
        .gte('date', from)
        .lte('date', to);
      return data || [];
    },

    async addNonTeachingDay({ date, reason, description, course_id, subject_id }) {
      if (isDemo) {
        return _localInsert('non_teaching_days', {
          school_id: school.id,
          course_id: course_id || null,
          subject_id: subject_id || null,
          date, reason, description: description || null
        });
      }
      const { data } = await sb.from('non_teaching_days')
        .insert({
          school_id: school.id,
          course_id: course_id || null,
          subject_id: subject_id || null,
          date, reason, description: description || null
        })
        .select().single();
      return data;
    },

    async removeNonTeachingDay(id) {
      if (isDemo) { _localDelete('non_teaching_days', id); return; }
      await sb.from('non_teaching_days').delete().eq('id', id);
    },

    // ---- Resumen de asistencia (por curso) ------------------------------

    async getAttendanceSummary(courseId) {
      if (isDemo) {
        const records = _local('attendance', { course_id: courseId });
        const summary = {};
        for (const r of records) {
          summary[r.student_id] = summary[r.student_id] ||
            { present: 0, absent: 0, half_absent: 0, justified: 0, total: 0 };
          summary[r.student_id][r.status] = (summary[r.student_id][r.status] || 0) + 1;
          summary[r.student_id].total++;
        }
        return summary;
      }

      const { data } = await sb.from('attendance')
        .select('student_id, status')
        .eq('course_id', courseId);

      const summary = {};
      for (const r of (data || [])) {
        summary[r.student_id] = summary[r.student_id] ||
          { present: 0, absent: 0, half_absent: 0, justified: 0, total: 0 };
        summary[r.student_id][r.status] = (summary[r.student_id][r.status] || 0) + 1;
        summary[r.student_id].total++;
      }
      return summary;
    }
  };
})();