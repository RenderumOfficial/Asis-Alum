# Planilla Digital de Asistencia Escolar — PBA

Aplicación web para gestionar la asistencia diaria de alumnos de escuelas secundarias de la Provincia de Buenos Aires, Argentina.

- **Estilo:** tabla tipo Excel con celdas clickeables, colores por estado, columnas fijas y scroll
- **Backend:** Supabase (PostgreSQL) — o modo demo con localStorage para desarrollo
- **Stack:** HTML5, CSS3, JavaScript vanilla (sin frameworks)

---

## Características principales

- **Planilla estilo Excel:** filas = alumnos, columnas = días hábiles, celdas = estado de asistencia
- **Click único:** cada celda cambia de estado al hacer click (ciclo: P → A → M → J → P)
- **Guardado automático:** cada modificación se guarda en Supabase inmediatamente
- **Resumen por día:** panel superior con total de presentes, ausentes, medias faltas, justificados y porcentaje
- **Resumen por alumno:** columna fija a la derecha con conteos y % individual
- **Navegación flexible:** vista por día, semana, mes o ciclo lectivo completo
- **Gestión de alumnos:** agregar, editar, eliminar (soft delete), buscar y reordenar con drag & drop
- **Cursos y materias:** soporta múltiples cursos con diferentes alumnos y asignaturas
- **Días no lectivos:** marcar feriados, suspensiones, jornadas institucionales
- **Responsive:** funciona en desktop, notebook, tablet y celular
- **Sin instalación:** solo abrir index.html en un navegador

---

## Archivos del proyecto

```
.
├── index.html              ← Archivo principal
├── css/
│   └── styles.css          ← Estilos completos (grid, modals, responsive)
├── js/
│   ├── config.js           ← Configuración de Supabase (URL + Key)
│   ├── supabase.js         ← DataService: acceso a datos (Supabase + demo)
│   ├── calendar.js         ← Utilidades de fechas y calendario
│   ├── ui.js               ← Estados de asistencia, toasts, modales
│   ├── attendance.js       ← Planilla principal (grid, celdas, resúmenes)
│   ├── students.js         ← CRUD de alumnos, drag & drop, búsqueda
│   └── app.js              ← Controlador principal, navegación, inicialización
├── sql/
│   └── schema.sql          ← Esquema completo PostgreSQL (Supabase)
└── README.md               ← Este archivo
```

---

## Instrucciones de uso

### Modo demo (sin configuración)

1. Abrir `index.html` en un navegador (Chrome, Firefox o Edge)
2. La app crea automáticamente una escuela ficticia con un curso (3° B) y 10 alumnos
3. Podés usar todas las funciones: tomar asistencia, navegar fechas, agregar/editar alumnos

> Los datos se guardan en `localStorage` del navegador y se eliminan al limpiar caché.

### Conectar a Supabase

1. Crear un proyecto en [supabase.com](https://supabase.com) (gratuito)
2. En **SQL Editor**, ejecutar el contenido completo de `sql/schema.sql`
3. Ir a **Project > Settings > API** y copiar:
   - **Project URL** (algo como `https://abcdefgh.supabase.co`)
   - **anon public key** (empieza con `eyJ...`)
4. Abrir la app y hacer click en ⚙ **Configuración**
5. Pegar la URL y la Key, hacer click en "Guardar y recargar"
6. ¡Listo! Los datos ahora se sincronizan con PostgreSQL

> Podés configurar también directamente editando `js/config.js` con la URL y la Key.

---

## Tabla de asistencia — Colores y abreviaturas

| Color | Código | Abreviatura | Estado |
|-------|--------|-------------|--------|
| 🟢 Verde | `#16a34a` | **P** | Presente |
| 🔴 Rojo | `#dc2626` | **A** | Ausente |
| 🟠 Amarillo | `#d97706` | **M** | Media falta |
| 🔵 Azul | `#2563eb` | **J** | Justificado |

**Ciclo de estados:** vacío → Presente → Ausente → Media falta → Justificado → Presente

---

## Base de datos (Supabase/PostgreSQL)

Las tablas principales son:

| Tabla | Descripción |
|-------|-------------|
| `schools` | Escuelas |
| `teachers` | Docentes |
| `school_years` | Ciclos lectivos |
| `courses` | Cursos (año + división + turno) |
| `subjects` | Materias/asignaturas |
| `students` | Alumnos (con soft delete) |
| `enrollments` | Inscripción alumno ↔ curso |
| `attendance` | Registros de asistencia diaria |
| `non_teaching_days` | Días no lectivos (feriados, etc.) |

**Restricciones importantes:**
- Cada alumno solo puede tener **UN registro de asistencia por curso/materia/fecha**
- El campo `status` solo acepta: `present`, `absent`, `half_absent`, `justified`
- Se aplicó eliminación lógica (`active = false`) en alumnos para preservar el historial

### Políticas de seguridad (RLS)

El esquema viene con políticas públicas configuradas para funcionar inmediato. Para producción con autenticación, ver los comentarios al final de `sql/schema.sql`.

---

## Desarrollo y extensión

- **Agregar feriados:** usar la tabla `non_teaching_days` o implementar un UI (el esquema está preparado)
- **Autenticación:** las tablas tienen RLS habilitado; las políticas públicas se pueden reemplazar por Auth
- **Agregar campos:** el esquema permite agregar materias, docentes, notas por asistencia
- **Exportar a Excel:** la planilla está rendersizada como HTML tabular; se puede capturar con herramientas externas

---

## Compatibilidad

- Chrome 90+ / Firefox 90+ / Edge 90+ / Safari 15+
- Funciona en desktop, notebook, tablet y celular
- Responsive hasta 320px de ancho
