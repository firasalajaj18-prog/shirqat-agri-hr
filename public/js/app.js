/**
 * موقع الموارد البشرية لشعبة زراعة الشرقاط
 * Frontend Application Logic
 * Designer: FIRAS ALAJAJ
 */

// Application State
const state = {
  currentView: 'homeView',
  isManagerLoggedIn: false,
  currentEmployee: null,
  cameraStream: null,
  cameraTarget: null,
  cameraFacingMode: 'user', // 'user' or 'environment'
  employeesList: []
};

// Target Map for Camera & Previews
const ATTACHMENT_MAP = {
  personal: { input: 'inputPersonalCamera', file: 'inputPersonalFile', preview: 'previewPersonal', title: 'التقاط الصورة الشخصية الحديثة (خلفية بيضاء)' },
  medical: { input: 'inputMedicalCamera', file: 'inputMedicalFile', preview: 'previewMedical', title: 'التقاط صورة الفحص الطبي المعتمد' },
  empCardFront: { input: 'inputEmpCardFrontCamera', file: 'inputEmpCardFrontFile', preview: 'previewEmpCardFront', title: 'التقاط صورة هوية الموظف - الوجه الأمامي' },
  empCardBack: { input: 'inputEmpCardBackCamera', file: 'inputEmpCardBackFile', preview: 'previewEmpCardBack', title: 'التقاط صورة هوية الموظف - الوجه الخلفي' },
  idCardFront: { input: 'inputIdCardFrontCamera', file: 'inputIdCardFrontFile', preview: 'previewIdCardFront', title: 'التقاط صورة البطاقة الموحدة - الوجه الأمامي' },
  idCardBack: { input: 'inputIdCardBackCamera', file: 'inputIdCardBackFile', preview: 'previewIdCardBack', title: 'التقاط صورة البطاقة الموحدة - الوجه الخلفي' },
  residenceCardFront: { input: 'inputResidenceCardFrontCamera', file: 'inputResidenceCardFrontFile', preview: 'previewResidenceCardFront', title: 'التقاط صورة بطاقة السكن - الوجه الأمامي' },
  residenceCardBack: { input: 'inputResidenceCardBackCamera', file: 'inputResidenceCardBackFile', preview: 'previewResidenceCardBack', title: 'التقاط صورة بطاقة السكن - الوجه الخلفي' }
};

// DOM Content Loaded
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
});

function initEventListeners() {
  // Action Cards Click Events
  const btnManager = document.getElementById('btnOpenManagerModal');
  if (btnManager) {
    btnManager.addEventListener('click', () => {
      if (state.isManagerLoggedIn) {
        showView('managerDashboardView');
        loadManagerDashboard();
      } else {
        clearManagerLoginForm();
        openModal('managerLoginModal');
      }
    });
  }

  const btnEmployee = document.getElementById('btnOpenEmployeeModal');
  if (btnEmployee) {
    btnEmployee.addEventListener('click', () => {
      document.getElementById('employeeVerifyForm').reset();
      const err = document.getElementById('employeeVerifyError');
      if (err) err.style.display = 'none';
      openModal('employeeVerifyModal');
    });
  }

  // Employee Form Submit
  const empForm = document.getElementById('employeeDataForm');
  if (empForm) {
    empForm.addEventListener('submit', handleEmployeeFormSubmit);
  }
}

// ==================== VIEW SWITCHING ====================
function showView(viewId) {
  const views = ['homeView', 'employeeCompletedView', 'employeeFormView', 'managerDashboardView'];
  views.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (id === viewId) {
        el.style.display = 'block';
        el.classList.add('active');
      } else {
        el.style.display = 'none';
        el.classList.remove('active');
      }
    }
  });
  state.currentView = viewId;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ==================== MODAL HELPERS ====================
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('active');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');

  // If closing manager login, clean fields
  if (id === 'managerLoginModal') {
    clearManagerLoginForm();
  }
}

// Close modal when clicking outside of window
window.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('active');
    if (e.target.id === 'cameraModal') {
      stopCameraStream();
    }
    if (e.target.id === 'managerLoginModal') {
      clearManagerLoginForm();
    }
  }
});

// ==================== MANAGER FLOW & LOGIN CLEAR ====================
function clearManagerLoginForm() {
  const userEl = document.getElementById('managerUsername');
  const passEl = document.getElementById('managerPassword');
  const errEl = document.getElementById('managerLoginError');
  const formEl = document.getElementById('managerLoginForm');

  if (userEl) userEl.value = '';
  if (passEl) passEl.value = '';
  if (errEl) {
    errEl.style.display = 'none';
    errEl.textContent = '';
  }
  if (formEl) formEl.reset();
}

async function handleManagerLogin(event) {
  event.preventDefault();
  const username = document.getElementById('managerUsername').value.trim();
  const password = document.getElementById('managerPassword').value.trim();
  const errorEl = document.getElementById('managerLoginError');

  errorEl.style.display = 'none';

  try {
    const res = await fetch('/api/auth/manager', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (data.success) {
      state.isManagerLoggedIn = true;
      clearManagerLoginForm();
      closeModal('managerLoginModal');
      showToast('مرحباً بك، تم تسجيل دخول المدير بنجاح', 'success');
      showView('managerDashboardView');
      loadManagerDashboard();
    } else {
      errorEl.textContent = data.message || 'بيانات الدخول غير صحيحة';
      errorEl.style.display = 'flex';
    }
  } catch (error) {
    errorEl.textContent = 'حدث خطأ في الاتصال بالخادم، يرجى المحاولة لاحقاً';
    errorEl.style.display = 'flex';
  }
}

function logoutManager() {
  state.isManagerLoggedIn = false;
  clearManagerLoginForm();
  showToast('تم تسجيل الخروج بنجاح', 'info');
  showView('homeView');
}

async function loadManagerDashboard() {
  try {
    const res = await fetch('/api/manager/employees');
    const data = await res.json();

    if (data.success) {
      state.employeesList = data.employees;
      renderStats(data.employees);
      renderEmployeesTable(data.employees);
    }
  } catch (err) {
    showToast('خطأ في جلب بيانات الموظفين', 'danger');
  }
}

function renderStats(employees) {
  const total = employees.length;
  const completed = employees.filter(e => e.isCompleted).length;
  const pending = total - completed;

  document.getElementById('statTotalEmployees').textContent = total;
  document.getElementById('statCompletedEmployees').textContent = completed;
  document.getElementById('statPendingEmployees').textContent = pending;
}

function renderEmployeesTable(employees) {
  const tbody = document.getElementById('employeesTableBody');
  tbody.innerHTML = '';

  if (employees.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 3rem; color: var(--text-muted);">
          <i class="fa-solid fa-folder-open" style="font-size: 2.8rem; margin-bottom: 0.85rem; color: var(--sage-400);"></i>
          <p style="font-weight: 800; font-size: 1.1rem; color: var(--sage-900);">لا توجد سجلات حالياً في المنظومة</p>
          <p style="font-size: 0.9rem; margin-top: 0.25rem;">يمكنك إضافة موظف يدوياً أو استيراد الأسماء من ملف Excel.</p>
        </td>
      </tr>
    `;
    return;
  }

  employees.forEach((emp, index) => {
    const quadName = [
      emp.firstName || '',
      emp.secondName || '',
      emp.thirdName || '',
      emp.fourthName || '',
      emp.surname || ''
    ].filter(Boolean).join(' ') || emp.fullName;

    const statusBadge = emp.isCompleted
      ? `<span class="status-badge completed"><i class="fa-solid fa-circle-check"></i> مكتمل</span>`
      : `<span class="status-badge pending"><i class="fa-solid fa-clock"></i> قيد الإكمال</span>`;

    const jobBadge = emp.jobStatus === 'عقد'
      ? `<span class="status-badge job-contract">عقد</span>`
      : `<span class="status-badge job-regular">ملاك</span>`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight: 800; color: var(--sage-700);">${index + 1}</td>
      <td style="font-weight: 700; color: var(--sage-900);">${quadName}</td>
      <td>${jobBadge}</td>
      <td>${emp.jobTitle || '—'}</td>
      <td style="direction: ltr; text-align: right;">${emp.phone || '—'}</td>
      <td style="text-align: center;"><span style="font-weight: 700; color: var(--danger);">${emp.bloodType || '—'}</span></td>
      <td>${emp.unifiedId || '—'}</td>
      <td>${statusBadge}</td>
      <td style="text-align: center;">
        <div style="display: inline-flex; gap: 0.35rem;">
          <button class="table-action-btn" title="تعديل الموظف" onclick="openEditEmployeeModal('${emp.id}')">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
          <button class="table-action-btn delete" title="حذف الموظف" onclick="deleteEmployee('${emp.id}', '${quadName}')">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function filterEmployeesTable() {
  const search = document.getElementById('tableSearchInput').value.toLowerCase().trim();
  const statusFilter = document.getElementById('filterStatus').value;
  const jobFilter = document.getElementById('filterJobStatus').value;

  let filtered = state.employeesList;

  if (statusFilter === 'completed') {
    filtered = filtered.filter(e => e.isCompleted);
  } else if (statusFilter === 'pending') {
    filtered = filtered.filter(e => !e.isCompleted);
  }

  if (jobFilter) {
    filtered = filtered.filter(e => e.jobStatus === jobFilter);
  }

  if (search) {
    filtered = filtered.filter(e => {
      const full = (e.fullName + ' ' + (e.jobTitle || '') + ' ' + (e.phone || '') + ' ' + (e.unifiedId || '')).toLowerCase();
      return full.includes(search);
    });
  }

  renderEmployeesTable(filtered);
}

// Master Save Command with Timestamped Folder
async function triggerMasterSave() {
  const btn = document.getElementById('btnMasterSave');
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري توليد المجلد المؤرخ والجداول...`;

  try {
    const res = await fetch('/api/manager/save-all', { method: 'POST' });
    const data = await res.json();

    if (data.success) {
      showToast(`✅ تم حفظ وتصدير السجلات بنجاح في مجلد: ${data.details.folderName}`, 'success');
      alert(
        `🎉 تم تنفيذ إيعاز الحفظ والتصدير بنجاح!\n\n` +
        `📁 اسم المجلد المؤرخ: ${data.details.folderName}\n` +
        `📍 المسار: ${data.details.exportFolder}\n` +
        `📊 ملف الإكسل المنسق: بيانات الموظفين\\بيانات_الموظفين_شعبة_زراعة_الشرقاط.xlsx\n` +
        `📝 ملف الوورد المنسق: بيانات الموظفين\\جدول_الموظفين_شعبة_زراعة_الشرقاط.docx\n` +
        `👥 إجمالي مجلدات وصور الموظفين المعالجة: ${data.details.processedEmployees}`
      );
    } else {
      showToast('حدث خطأ أثناء الحفظ: ' + data.error, 'danger');
    }
  } catch (error) {
    showToast('فشل في الاتصال لتنفيذ إيعاز الحفظ', 'danger');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

// Direct Downloads
function downloadDirectExcel() {
  showToast('جاري بدء تحميل ملف Excel المنسق...', 'success');
  window.location.href = '/api/manager/export/excel';
}

function downloadDirectWord() {
  showToast('جاري بدء تحميل ملف Word المنسق...', 'success');
  window.location.href = '/api/manager/export/word';
}

// ==================== EXCEL IMPORT FLOW ====================
function openUploadExcelModal() {
  document.getElementById('uploadExcelForm').reset();
  const res = document.getElementById('uploadExcelResult');
  if (res) res.style.display = 'none';
  openModal('uploadExcelModal');
}

async function handleUploadExcel(event) {
  event.preventDefault();
  const fileInput = document.getElementById('excelFileInput');
  if (!fileInput.files[0]) return;

  const formData = new FormData();
  formData.append('excelFile', fileInput.files[0]);

  const resultDiv = document.getElementById('uploadExcelResult');
  const btnSubmit = document.getElementById('btnSubmitExcel');
  const originalBtn = btnSubmit.innerHTML;

  btnSubmit.disabled = true;
  btnSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري الاستيراد والمعالجة...`;

  resultDiv.className = 'custom-alert alert-info';
  resultDiv.style.display = 'flex';
  resultDiv.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري قراءة أسماء الموظفين من ملف الإكسل...';

  try {
    const res = await fetch('/api/manager/upload-excel', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    if (data.success) {
      resultDiv.className = 'custom-alert alert-success';
      resultDiv.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${data.message}`;
      showToast(`تمت إضافة ${data.addedCount} أسماء جديدة بنجاح`, 'success');
      loadManagerDashboard();
    } else {
      resultDiv.className = 'custom-alert alert-danger';
      resultDiv.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> ${data.error || 'فشل استيراد الأسماء'}`;
    }
  } catch (err) {
    resultDiv.className = 'custom-alert alert-danger';
    resultDiv.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> خطأ في رفع ومعالجة ملف الإكسل';
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = originalBtn;
  }
}

// ==================== WIPE / CLEAR ALL DATA FLOW ====================
function openWipeModal() {
  openModal('wipeDataModal');
}

async function executeWipeAllData() {
  const btn = document.getElementById('btnConfirmWipe');
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري الحذف والإفراغ...`;

  try {
    const res = await fetch('/api/manager/clear-all', { method: 'POST' });
    const data = await res.json();

    if (data.success) {
      closeModal('wipeDataModal');
      showToast(data.message, 'success');
      loadManagerDashboard();
    } else {
      showToast(data.message || 'حدث خطأ أثناء المسح', 'danger');
    }
  } catch (err) {
    showToast('فشل في الاتصال بالخادم لمسح البيانات', 'danger');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

// Add/Edit Employee Manually
function openAddEmployeeModal() {
  document.getElementById('employeeEditForm').reset();
  document.getElementById('editEmpId').value = '';
  document.getElementById('employeeEditModalTitle').textContent = 'إضافة موظف جديد';
  openModal('employeeEditModal');
}

function openEditEmployeeModal(empId) {
  const emp = state.employeesList.find(e => e.id === empId);
  if (!emp) return;

  document.getElementById('editEmpId').value = emp.id;
  document.getElementById('editFullName').value = emp.fullName || '';
  document.getElementById('editJobStatus').value = emp.jobStatus || 'ملاك';
  document.getElementById('editJobTitle').value = emp.jobTitle || '';
  document.getElementById('editDepartment').value = emp.department || 'شعبة زراعة الشرقاط';

  document.getElementById('employeeEditModalTitle').textContent = 'تعديل بيانات الموظف';
  openModal('employeeEditModal');
}

async function handleSaveEmployeeManual(event) {
  event.preventDefault();
  const id = document.getElementById('editEmpId').value;
  const fullName = document.getElementById('editFullName').value.trim();
  const jobStatus = document.getElementById('editJobStatus').value;
  const jobTitle = document.getElementById('editJobTitle').value.trim();
  const department = document.getElementById('editDepartment').value.trim();

  try {
    let res;
    if (id) {
      res = await fetch(`/api/manager/employee/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, jobStatus, jobTitle, department })
      });
    } else {
      res = await fetch('/api/manager/employee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, jobStatus, jobTitle, department })
      });
    }

    const data = await res.json();
    if (data.success) {
      closeModal('employeeEditModal');
      showToast(data.message, 'success');
      loadManagerDashboard();
    } else {
      showToast(data.message || 'حدث خطأ', 'danger');
    }
  } catch (err) {
    showToast('فشل في حفظ البيانات', 'danger');
  }
}

async function deleteEmployee(empId, name) {
  if (!confirm(`هل أنت متأكد من حذف الموظف: "${name}" من المنظومة؟`)) return;

  try {
    const res = await fetch(`/api/manager/employee/${empId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('تم حذف الموظف بنجاح', 'success');
      loadManagerDashboard();
    } else {
      showToast(data.message, 'danger');
    }
  } catch (err) {
    showToast('فشل في عملية الحذف', 'danger');
  }
}

// Settings Modal
async function openSettingsModal() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (data.success) {
      document.getElementById('settingAdminUsername').value = data.settings.adminUsername || '';
      document.getElementById('settingAdminPassword').value = '';
      document.getElementById('settingEmployeeCode').value = data.settings.employeeGeneralCode || '';
      document.getElementById('settingSupportPhone').value = data.settings.supportPhone || '';
      document.getElementById('settingStoragePath').value = data.settings.storagePath || '';
      openModal('settingsModal');
    }
  } catch (err) {
    showToast('خطأ في تحميل الإعدادات', 'danger');
  }
}

async function handleSaveSettings(event) {
  event.preventDefault();
  const adminUsername = document.getElementById('settingAdminUsername').value.trim();
  const adminPassword = document.getElementById('settingAdminPassword').value.trim();
  const employeeGeneralCode = document.getElementById('settingEmployeeCode').value.trim();
  const supportPhone = document.getElementById('settingSupportPhone').value.trim();
  const storagePath = document.getElementById('settingStoragePath').value.trim();

  const payload = { adminUsername, employeeGeneralCode, supportPhone, storagePath };
  if (adminPassword) payload.adminPassword = adminPassword;

  try {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      closeModal('settingsModal');
      showToast('تم حفظ وتحديث الإعدادات بنجاح', 'success');
    }
  } catch (err) {
    showToast('فشل في حفظ الإعدادات', 'danger');
  }
}

// ==================== EMPLOYEE FLOW ====================
async function handleEmployeeVerify(event) {
  event.preventDefault();
  const fullName = document.getElementById('employeeCheckName').value.trim();
  const accessCode = document.getElementById('employeeCheckCode').value.trim();
  const errorEl = document.getElementById('employeeVerifyError');

  errorEl.style.display = 'none';

  try {
    const res = await fetch('/api/auth/employee-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName, accessCode })
    });

    const data = await res.json();

    if (data.success) {
      closeModal('employeeVerifyModal');
      state.currentEmployee = data.employee;

      if (data.isCompleted) {
        document.getElementById('completedEmpName').textContent = `أهلاً بك، الموظف: ${data.employee.fullName}`;
        showView('employeeCompletedView');
      } else {
        populateEmployeeForm(data.employee);
        showView('employeeFormView');
      }
    } else {
      errorEl.textContent = data.message || 'حدث خطأ أثناء التحقق';
      errorEl.style.display = 'flex';
    }
  } catch (err) {
    errorEl.textContent = 'تعذر الاتصال بالخادم، يرجى المحاولة ثانيةً';
    errorEl.style.display = 'flex';
  }
}

function populateEmployeeForm(emp) {
  document.getElementById('formEmpId').value = emp.id;
  document.getElementById('formFirstName').value = emp.firstName || '';
  document.getElementById('formSecondName').value = emp.secondName || '';
  document.getElementById('formThirdName').value = emp.thirdName || '';
  document.getElementById('formFourthName').value = emp.fourthName || '';
  document.getElementById('formSurname').value = emp.surname || '';

  document.getElementById('formMotherName').value = emp.motherName || '';
  document.getElementById('formFamilyNumber').value = emp.familyNumber || '';
  document.getElementById('formUnifiedId').value = emp.unifiedId || '';
  document.getElementById('formBloodType').value = emp.bloodType || '';
  document.getElementById('formPhone').value = emp.phone || '';
  document.getElementById('formJobStatus').value = emp.jobStatus || 'ملاك';
  document.getElementById('formDepartment').value = emp.department || 'شعبة زراعة الشرقاط';
  document.getElementById('formPosition').value = emp.position || '';
  document.getElementById('formJobTitle').value = emp.jobTitle || '';

  // Reset previews & files for all attachments
  Object.keys(ATTACHMENT_MAP).forEach(key => {
    const config = ATTACHMENT_MAP[key];
    const previewBox = document.getElementById(config.preview);
    const cameraInput = document.getElementById(config.input);
    const fileInput = document.getElementById(config.file);

    if (previewBox) {
      previewBox.classList.remove('active');
      const img = previewBox.querySelector('img');
      if (img) img.src = '';
    }
    if (cameraInput) cameraInput.value = '';
    if (fileInput) fileInput.value = '';
  });
}

function handleFileSelected(input, previewId) {
  if (input.files && input.files[0]) {
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      const box = document.getElementById(previewId);
      if (box) {
        const img = box.querySelector('img');
        if (img) img.src = e.target.result;
        box.classList.add('active');
      }
    };
    reader.readAsDataURL(file);
  }
}

async function handleEmployeeFormSubmit(event) {
  event.preventDefault();

  const form = document.getElementById('employeeDataForm');
  const formData = new FormData(form);

  const fourthName = formData.get('fourthName');
  const surname = formData.get('surname');
  if (!fourthName || !surname) {
    showToast('يرجى كتابة الاسم الرابع واللقب لإكمال الاستمارة', 'warning');
    return;
  }

  const submitBtn = form.querySelector('button[type="submit"]');
  const originalHtml = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري معالجة الصور وحفظ الاستمارة...`;

  try {
    const res = await fetch('/api/employee/submit', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    if (data.success) {
      showToast('تم حفظ وإكمال البيانات والمرفقات بنجاح في المنظومة!', 'success');
      document.getElementById('completedEmpName').textContent = `أهلاً بك، الموظف: ${data.employee.fullName}`;
      showView('employeeCompletedView');
    } else {
      showToast(data.message || 'حدث خطأ أثناء الحفظ', 'danger');
    }
  } catch (err) {
    showToast('فشل في إرسال البيانات إلى الخادم', 'danger');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalHtml;
  }
}

// ==================== CAMERA LIVE CAPTURE ====================
async function openCameraModal(targetType) {
  state.cameraTarget = targetType;
  const config = ATTACHMENT_MAP[targetType];
  const title = config ? config.title : 'التقاط صورة مباشرة بالكاميرا';
  document.getElementById('cameraModalTitle').textContent = title;

  document.getElementById('cameraVideo').style.display = 'block';
  document.getElementById('cameraSnapshotPreview').style.display = 'none';
  document.getElementById('btnShutter').style.display = 'flex';
  document.getElementById('btnConfirmSnapshot').style.display = 'none';
  document.getElementById('btnRetakeSnapshot').style.display = 'none';

  openModal('cameraModal');
  await startCameraStream();
}

async function startCameraStream() {
  stopCameraStream();
  try {
    const constraints = {
      video: {
        facingMode: state.cameraFacingMode,
        width: { ideal: 1280 },
        height: { ideal: 960 }
      },
      audio: false
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    state.cameraStream = stream;
    const video = document.getElementById('cameraVideo');
    video.srcObject = stream;
    await video.play();
  } catch (err) {
    console.error('Camera error:', err);
    alert('تعذر الوصول إلى الكاميرا. يرجى التأكد من توصيل الكاميرا ومنح إذن الاستخدام للمتصفح.');
    closeCameraModal();
  }
}

function stopCameraStream() {
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach(track => track.stop());
    state.cameraStream = null;
  }
}

function closeCameraModal() {
  stopCameraStream();
  closeModal('cameraModal');
}

function switchCameraFacing() {
  state.cameraFacingMode = state.cameraFacingMode === 'user' ? 'environment' : 'user';
  startCameraStream();
}

function captureSnapshot() {
  const video = document.getElementById('cameraVideo');
  const canvas = document.getElementById('cameraCanvas');
  const previewImg = document.getElementById('cameraCapturedImg');

  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;

  const ctx = canvas.getContext('2d');
  if (state.cameraFacingMode === 'user') {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  previewImg.src = dataUrl;

  video.style.display = 'none';
  document.getElementById('cameraSnapshotPreview').style.display = 'block';
  document.getElementById('btnShutter').style.display = 'none';
  document.getElementById('btnConfirmSnapshot').style.display = 'inline-flex';
  document.getElementById('btnRetakeSnapshot').style.display = 'inline-flex';
}

function retakeSnapshot() {
  document.getElementById('cameraVideo').style.display = 'block';
  document.getElementById('cameraSnapshotPreview').style.display = 'none';
  document.getElementById('btnShutter').style.display = 'flex';
  document.getElementById('btnConfirmSnapshot').style.display = 'none';
  document.getElementById('btnRetakeSnapshot').style.display = 'none';
}

function confirmSnapshot() {
  const previewImg = document.getElementById('cameraCapturedImg');
  const dataUrl = previewImg.src;

  const config = ATTACHMENT_MAP[state.cameraTarget];
  if (config) {
    const inputCamera = document.getElementById(config.input);
    const inputFile = document.getElementById(config.file);
    const previewBox = document.getElementById(config.preview);

    if (inputCamera) inputCamera.value = dataUrl;
    if (inputFile) inputFile.value = '';
    if (previewBox) {
      const img = previewBox.querySelector('img');
      if (img) img.src = dataUrl;
      previewBox.classList.add('active');
    }
  }

  showToast('تم التقاط الصورة واعتمادها بنجاح!', 'success');
  closeCameraModal();
}

// ==================== TOAST NOTIFICATIONS ====================
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `custom-toast`;

  let icon = 'fa-info-circle';
  let borderColor = 'var(--sage-600)';

  if (type === 'success') {
    icon = 'fa-circle-check';
    borderColor = 'var(--success)';
  } else if (type === 'danger') {
    icon = 'fa-triangle-exclamation';
    borderColor = 'var(--danger)';
  } else if (type === 'warning') {
    icon = 'fa-circle-exclamation';
    borderColor = 'var(--warning)';
  }

  toast.style.borderRightColor = borderColor;
  toast.innerHTML = `<i class="fa-solid ${icon}" style="color: ${borderColor}; font-size: 1.15rem;"></i><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'all 0.4s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 400);
  }, 4500);
}
