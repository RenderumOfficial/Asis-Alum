// ============================================================================
// Students — módulo de gestión de alumnos
// ============================================================================

const Students = (() => {

  let searchTerm = '';
  let sortMode = 'list';        // 'list' | 'alpha'
  let dragId = null;            // id del alumno arrastrado

  // ===== Renderizar lista =================================================

  function renderList() {
    const { students } = App.state;
    const tbody = document.getElementById('studentsTbody');
    if (!tbody) return;

    let filtered = students;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      filtered = students.filter(s =>
        `${s.last_name} ${s.first_name}`.toLowerCase().includes(q)
      );
    }

    if (sortMode === 'alpha') {
      filtered = [...filtered].sort((a, b) =>
        a.last_name.localeCompare(b.last_name, 'es') ||
        a.first_name.localeCompare(b.first_name, 'es')
      );
    }

    tbody.innerHTML = filtered.map(s => `
      <tr data-id="${s.id}" draggable="true"
          class="${sortMode === 'list' ? 'drag-enabled' : ''}">
        <td class="s-num">${s.list_number ?? '—'}</td>
        <td class="s-name">${UI.esc(s.last_name)}, ${UI.esc(s.first_name)}</td>
        <td class="s-actions">
          <button class="btn-icon" data-action="edit" title="Editar">✎</button>
          <button class="btn-icon btn-icon-danger" data-action="delete" title="Eliminar">✕</button>
        </td>
      </tr>
    `).join('');

    document.getElementById('studentCount').textContent = students.length;
    bindListDragEvents();
  }

  // ===== Drag & drop para reordenar (según nº de lista) ==================

  function bindListDragEvents() {
    const tbody = document.getElementById('studentsTbody');
    if (!tbody) return;

    if (sortMode !== 'list') return; // solo reordenar en modo lista

    tbody.querySelectorAll('tr[draggable="true"]').forEach(row => {
      row.addEventListener('dragstart', e => {
        dragId = row.dataset.id;
        row.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      row.addEventListener('dragend', () => {
        row.classList.remove('dragging');
        tbody.querySelectorAll('tr').forEach(r => r.classList.remove('drag-over'));
        dragId = null;
      });
      row.addEventListener('dragover', e => {
        e.preventDefault();
        if (!dragId) return;
        row.classList.add('drag-over');
      });
      row.addEventListener('dragleave', () => {
        row.classList.remove('drag-over');
      });
      row.addEventListener('drop', e => {
        e.preventDefault();
        row.classList.remove('drag-over');
        if (!dragId || dragId === row.dataset.id) return;

        const { students } = App.state;
        const fromI = students.findIndex(s => s.id === dragId);
        const toI   = students.findIndex(s => s.id === row.dataset.id);
        if (fromI === -1 || toI === -1) return;

        // Mover el alumno arrastrado a la posición del destino
        const [moved] = students.splice(fromI, 1);
        students.splice(toI, 0, moved);

        // Renumerar y guardar el nuevo orden
        students.forEach((s, i) => { s.list_number = i + 1; });
        DataService.reorderStudents(students.map(s => s.id))
          .catch(err => {
            console.error('Error reordenando alumnos:', err);
            UI.toast('No se pudieron guardar el nuevo orden', 'error');
          });

        renderList();
        Attendance.renderGrid();
        UI.toast('Alumnos reordenados', 'success');
      });
    });
  }

  // ===== Eventos generales =================================================

  function bindEvents() {
    const searchInput = document.getElementById('studentSearch');
    if (searchInput) {
      searchInput.addEventListener('input', UI.debounce((e) => {
        searchTerm = e.target.value.trim();
        renderList();
      }, 180));
    }

    document.querySelectorAll('[data-sort]').forEach(btn => {
      btn.addEventListener('click', () => {
        sortMode = btn.dataset.sort;
        document.querySelectorAll('[data-sort]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderList();
      });
    });

    document.getElementById('addStudentBtn')?.addEventListener('click', openAddStudent);

    const tbody = document.getElementById('studentsTbody');
    if (tbody) {
      tbody.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const row = btn.closest('tr');
        const id = row.dataset.id;
        if (btn.dataset.action === 'edit') openEditStudent(id);
        if (btn.dataset.action === 'delete') deleteStudent(id);
      });
    }

    document.getElementById('addStudentForm')?.addEventListener('submit', handleAddStudent);
    document.getElementById('editStudentForm')?.addEventListener('submit', handleEditStudent);
  }

  // ===== Modal Agregar ===================================================

  function openAddStudent() {
    const form = document.getElementById('addStudentForm');
    if (form) form.reset();

    const { students } = App.state;
    const nextNum = students.length
      ? Math.max(...students.map(s => s.list_number || 0)) + 1
      : 1;
    const listNumInput = document.getElementById('addListNumber');
    if (listNumInput) listNumInput.value = nextNum;

    UI.openModal('addStudentModal');
  }

  async function handleAddStudent(e) {
    e.preventDefault();

    const first_name = document.getElementById('addFirstName').value.trim();
    const last_name  = document.getElementById('addLastName').value.trim();
    const list_number = parseInt(document.getElementById('addListNumber').value) || null;

    if (!first_name || !last_name) {
      UI.toast('Completá nombre y apellido', 'error');
      return;
    }

    const { currentCourse } = App.state;
    if (!currentCourse) {
      UI.toast('Seleccioná un curso primero', 'error');
      return;
    }

    try {
      await DataService.addStudent({
        first_name, last_name, list_number, course_id: currentCourse.id
      });

      App.state.students = await DataService.getStudents(currentCourse.id);
      UI.closeModal('addStudentModal');
      Attendance.renderGrid();
      renderList();
      UI.toast('Alumno agregado', 'success');
    } catch (err) {
      console.error('Error al agregar alumno:', err);
      UI.toast('No se pudo agregar el alumno', 'error');
    }
  }

  // ===== Modal Editar ====================================================

  function openEditStudent(id) {
    const student = App.state.students.find(s => s.id === id);
    if (!student) return;

    document.getElementById('editStudentId').value = student.id;
    document.getElementById('editFirstName').value = student.first_name;
    document.getElementById('editLastName').value  = student.last_name;
    document.getElementById('editListNumber').value = student.list_number ?? '';

    UI.openModal('editStudentModal');
    setTimeout(() => document.getElementById('editFirstName').focus(), 80);
  }

  async function handleEditStudent(e) {
    e.preventDefault();

    const id          = document.getElementById('editStudentId').value;
    const first_name  = document.getElementById('editFirstName').value.trim();
    const last_name   = document.getElementById('editLastName').value.trim();
    const list_number = parseInt(document.getElementById('editListNumber').value) || null;

    if (!first_name || !last_name) {
      UI.toast('Completá nombre y apellido', 'error');
      return;
    }

    try {
      await DataService.updateStudent(id, { first_name, last_name, list_number });

      const st = App.state.students.find(s => s.id === id);
      if (st) Object.assign(st, { first_name, last_name, list_number });

      UI.closeModal('editStudentModal');
      Attendance.renderGrid();
      renderList();
      UI.toast('Alumno actualizado', 'success');
    } catch (err) {
      console.error('Error al editar alumno:', err);
      UI.toast('No se pudo guardar los cambios', 'error');
    }
  }

  // ===== Eliminar (soft delete) ==========================================

  async function deleteStudent(id) {
    const student = App.state.students.find(s => s.id === id);
    if (!student) return;

    const ok = await UI.confirmDialog({
      title: 'Eliminar alumno',
      message: `¿Seguro que querés eliminar a ${student.last_name}, ${student.first_name}?\n\nSe conservará todo el historial de asistencia (eliminación lógica).`,
      danger: true,
      okText: 'Eliminar'
    });

    if (!ok) return;

    try {
      await DataService.deleteStudentSoft(id);
      App.state.students = App.state.students.filter(s => s.id !== id);

      // Remover sus registros del cache para que no se cuenten en resúmenes
      const prefix = id + '|';
      App.state.attendanceCache.forEach((_, key) => {
        if (key.startsWith(prefix)) App.state.attendanceCache.delete(key);
      });

      Attendance.renderGrid();
      renderList();
      UI.toast('Alumno eliminado', 'success');
    } catch (err) {
      console.error('Error al eliminar alumno:', err);
      UI.toast('No se pudo eliminar el alumno', 'error');
    }
  }

  return {
    renderList,
    bindEvents,
    openAddStudent,
    openEditStudent
  };
})();