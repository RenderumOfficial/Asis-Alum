-- ============================================================================
-- ESQUEMA DE BASE DE DATOS — Planilla Digital de Asistencia Escolar
-- Escuela Secundaria · Provincia de Buenos Aires · Argentina
--
-- Compatible con Supabase (PostgreSQL 15+).
-- Ejecutar en el editor SQL del dashboard de Supabase.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- EXTENSIONES
-- ----------------------------------------------------------------------------
create extension if not exists "uuid-ossp";

-- ----------------------------------------------------------------------------
-- ENUM: Estados de asistencia
-- ----------------------------------------------------------------------------
create type attendance_status as enum (
  'present',      -- presente
  'absent',       -- ausente
  'half_absent',  -- media falta
  'justified'     -- justificado
);

-- ----------------------------------------------------------------------------
-- TABLA: schools
-- ----------------------------------------------------------------------------
create table schools (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  address     text,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- TABLA: teachers
-- ----------------------------------------------------------------------------
create table teachers (
  id          uuid primary key default uuid_generate_v4(),
  school_id   uuid not null references schools(id) on delete cascade,
  first_name  text not null,
  last_name   text not null,
  email       text,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- TABLA: school_years (ciclos lectivos)
-- ----------------------------------------------------------------------------
create table school_years (
  id          uuid primary key default uuid_generate_v4(),
  school_id   uuid not null references schools(id) on delete cascade,
  year        integer not null,
  start_date  date,
  end_date    date,
  created_at  timestamptz not null default now(),
  unique (school_id, year)
);

-- ----------------------------------------------------------------------------
-- TABLA: courses (curso + división + turno)
-- ----------------------------------------------------------------------------
create table courses (
  id              uuid primary key default uuid_generate_v4(),
  school_id       uuid not null references schools(id) on delete cascade,
  school_year_id  uuid not null references school_years(id) on delete cascade,
  year_level      integer not null check (year_level between 1 and 7), -- 1° a 7° año
  division        text not null,             -- A, B, C, ...
  shift           text not null check (shift in ('mañana', 'tarde', 'noche')),
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (school_id, school_year_id, year_level, division, shift)
);

-- ----------------------------------------------------------------------------
-- TABLA: subjects (materias/asignaturas)
-- ----------------------------------------------------------------------------
create table subjects (
  id          uuid primary key default uuid_generate_v4(),
  school_id   uuid not null references schools(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  unique (school_id, name)
);

-- ----------------------------------------------------------------------------
-- TABLA: students (alumnos)
-- Eliminación lógica mediante la columna 'active'.
-- El historial de asistencia se preserva aunque el alumno se "elimine".
-- ----------------------------------------------------------------------------
create table students (
  id           uuid primary key default uuid_generate_v4(),
  school_id    uuid not null references schools(id) on delete cascade,
  first_name   text not null,
  last_name    text not null,
  list_number  integer check (list_number > 0),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Indices para búsquedas por nombre/apellido
create index idx_students_name   on students (last_name, first_name);
create index idx_students_active on students (active);

-- ----------------------------------------------------------------------------
-- TABLA: enrollments (inscripción de alumnos en cursos)
-- ----------------------------------------------------------------------------
create table enrollments (
  id           uuid primary key default uuid_generate_v4(),
  student_id   uuid not null references students(id) on delete cascade,
  course_id    uuid not null references courses(id) on delete cascade,
  enrolled_at  date not null default current_date,
  withdrawn_at date,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (student_id, course_id)
);

create index idx_enrollments_course on enrollments (course_id, active);

-- ----------------------------------------------------------------------------
-- TABLA: attendance (asistencia diaria por alumno + fecha + materia)
-- ----------------------------------------------------------------------------
create table attendance (
  id                uuid primary key default uuid_generate_v4(),
  student_id        uuid not null references students(id) on delete cascade,
  course_id         uuid not null references courses(id) on delete cascade,
  subject_id        uuid references subjects(id) on delete set null,
  teacher_id        uuid references teachers(id) on delete set null,
  attendance_date   date not null,
  status            attendance_status not null,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- Un alumno solo puede tener UN registro de asistencia por curso/materia/fecha
  constraint uq_attendance_per_day unique
    (student_id, course_id, subject_id, attendance_date)
);

create index idx_attendance_course_date on attendance (course_id, attendance_date);
create index idx_attendance_student    on attendance (student_id);

-- ----------------------------------------------------------------------------
-- TABLA: non_teaching_days (días no lectivos)
--   - feriados
--   - suspensiones
--   - jornadas institucionales
--   - días sin actividad escolar
-- ----------------------------------------------------------------------------
create table non_teaching_days (
  id          uuid primary key default uuid_generate_v4(),
  school_id   uuid not null references schools(id) on delete cascade,
  course_id   uuid references courses(id) on delete cascade,  -- NULL = toda la escuela
  subject_id  uuid references subjects(id) on delete cascade, -- NULL = todas las materias
  date        date not null,
  reason      text not null,     -- motivo: feriado, suspensión, jornada, etc.
  description text,
  created_at  timestamptz not null default now(),
  unique (school_id, course_id, subject_id, date)
);

create index idx_non_teaching_days_date on non_teaching_days (date);

-- ----------------------------------------------------------------------------
-- TRIGGER: actualizar updated_at automáticamente
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_students_updated
  before update on students
  for each row execute procedure set_updated_at();

create trigger trg_attendance_updated
  before update on attendance
  for each row execute procedure set_updated_at();

-- ----------------------------------------------------------------------------
-- VISTA: resumen de asistencia por alumno y curso
-- ----------------------------------------------------------------------------
create or replace view student_attendance_summary as
select
  e.course_id,
  s.id as student_id,
  s.first_name,
  s.last_name,
  s.list_number,
  count(a.id) as total_classes,
  count(*) filter (where a.status = 'present')   as present_count,
  count(*) filter (where a.status = 'absent')    as absent_count,
  count(*) filter (where a.status = 'half_absent') as half_absent_count,
  count(*) filter (where a.status = 'justified') as justified_count,
  round(
    (count(*) filter (where a.status = 'present')
     + 0.5 * count(*) filter (where a.status = 'half_absent')) * 100.0
    / nullif(count(a.id), 0),
    1
  ) as attendance_percent,
  round(
    100.0 - (count(*) filter (where a.status = 'present')
         + 0.5 * count(*) filter (where a.status = 'half_absent')) * 100.0
    / nullif(count(a.id), 0),
    1
  ) as absence_percent
from enrollments e
join students s on s.id = e.student_id and s.active = true
left join attendance a
       on a.student_id = e.student_id
      and a.course_id = e.course_id
where e.active = true
group by e.course_id, s.id, s.first_name, s.last_name, s.list_number;

-- ----------------------------------------------------------------------------
-- SEGURIDAD Y ACCESO
--
-- Fase 1 (inicio rápido): acceso público de solo lectura/escritura para que
-- la planilla funcione de inmediato con la anon key. SUPABASE SUELE EXIGIR RLS.
--
-- Fase 2 (producción): reemplazar estas políticas por autenticación con
-- Supabase Auth (ver comentarios al final del archivo).
-- ----------------------------------------------------------------------------

alter table schools           enable row level security;
alter table teachers          enable row level security;
alter table school_years      enable row level security;
alter table courses           enable row level security;
alter table subjects          enable row level security;
alter table students          enable row level security;
alter table enrollments       enable row level security;
alter table attendance        enable row level security;
alter table non_teaching_days enable row level security;

-- Permitir lectura a cualquier cliente
do $$
declare t text;
begin
  foreach t in array array['schools','teachers','school_years','courses','subjects',
                          'students','enrollments','attendance','non_teaching_days']
  loop
    execute format('create policy "%s_public_read" on %I for select using (true);', t, t);
    execute format('create policy "%s_public_insert" on %I for insert with check (true);', t, t);
    execute format('create policy "%s_public_update" on %I for update using (true) with check (true);', t, t);
    execute format('create policy "%s_public_delete" on %I for delete using (true);', t, t);
  end loop;
end $$;

-- Otorgar privilegios a los roles de Supabase
grant usage on schema public to anon, authenticated;
grant all on all tables  in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
grant all on all functions in schema public to anon, authenticated;

-- ----------------------------------------------------------------------------
-- OPCIONAL — Autenticación con Supabase Auth (Fase 2)
--
-- Cuando quieras que solo usuarios logueados accedan a los datos:
--   1. Habilita Auth en el dashboard de Supabase.
--   2. Ejecutá el siguiente bloque en lugar de las políticas públicas:
--
--   drop policy if exists "schools_public_read" on schools;
--   -- (repetir para cada tabla)
--
--   create policy "auth_all"      on schools           for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
--   create policy "students_all"  on students          for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
--   create policy "attendance_all" on attendance       for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
--   -- ... etc para cada tabla
--
-- Y en el frontend reemplazar la "anon key" por la "service_role key"
-- SOLO desde server, o loguear con supabase.auth.signInWithPassword().
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- DATOS INICIALES DE EJEMPLO (opcional, descomentá y adaptá)
-- ----------------------------------------------------------------------------
-- insert into schools (name, address) values ('EES N°1', 'Calle 40 N°1500');
-- insert into school_years (school_id, year, start_date, end_date)
--   select id, 2026, '2026-03-02', '2026-12-18' from schools limit 1;
-- insert into courses (school_id, school_year_id, year_level, division, shift)
--   select s.id, sy.id, 3, 'B', 'mañana' from schools s
--   cross join school_years sy where sy.year = 2026 limit 1;