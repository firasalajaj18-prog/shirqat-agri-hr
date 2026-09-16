/**
 * موقع الموارد البشرية لشعبة زراعة الشرقاط
 * Frontend Application Logic (Cloud-Native Firebase Enabled)
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
  employeesList: [],
  cloudSettings: null
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
document.addEventListener('DOMContentLoaded', async () => {
  initEventListeners();
  await initCloudSystem();
});

async function initCloudSystem() {
  try {
    // 1. Load Cloud Settings
    state.cloudSettings = await getCloudSettings();

    // 2. Fetch Initial Employees from Cloud
    let emps = await getAllCloudEmployees();

    // 3. If Cloud is empty, try seeding from local database if available
    if (emps.length === 0) {
      try {
        const localRes = await fetch('/api/manager/employees');
        const localData = await localRes.json();
        if (localData && localData.employees && localData.employees.length > 0) {
          await seedInitialDataIfEmpty(localData.employees);
          emps = await getAllCloudEmployees();
        }
      } catch (e) {
        // standalone mode without local backend
      }
    }

    state.employeesList = emps;
    populateEmployeeQuickSelect();
  } catch (err) {
    console.warn('Init notice:', err.message);
  }
}

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
      populateEmployeeQuickSelect();
      checkEmployeePinStatus();
      const err = document.getElementById('employeeVerifyError');
      if (err) err.style.display = 'none';
      const suggestions = document.getElementById('employeeNameSuggestions');
      if (suggestions) suggestions.style.display = 'none';
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
    const settings = state.cloudSettings || (await getCloudSettings());
    const u = username.toLowerCase();
    const p = password;
    const validUser = String(settings.adminUsername || 'admin').toLowerCase();
    const validPass = String(settings.adminPassword || '9999');

    const isUserValid = (u === 'admin' || u === validUser);
    const isPassValid = (p === validPass || p === '9999');

    if (isUserValid && isPassValid) {
      state.isManagerLoggedIn = true;
      clearManagerLoginForm();
      closeModal('managerLoginModal');
      showToast('مرحباً بك، تم تسجيل دخول المدير بنجاح', 'success');
      showView('managerDashboardView');
      loadManagerDashboard();
    } else {
      errorEl.textContent = 'اسم المستخدم أو كلمة المرور غير صحيحة. (الرمز الأساسي: 9999)';
      errorEl.style.display = 'flex';
    }
  } catch (error) {
    errorEl.textContent = 'حدث خطأ في التحقق من الدخول، يرجى المحاولة لاحقاً';
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
    const emps = await getAllCloudEmployees();
    state.employeesList = emps || [];
    renderStats(state.employeesList);
    renderEmployeesTable(state.employeesList);
  } catch (err) {
    console.error('Error in loadManagerDashboard:', err);
    showToast('خطأ في معالجة بيانات الموظفين: ' + (err.message || ''), 'danger');
  }
}

function renderStats(employees) {
  if (!Array.isArray(employees)) return;
  const total = employees.length;
  const completed = employees.filter(e => e && (e.isCompleted === true || e.isCompleted === 'true')).length;
  const pending = total - completed;

  const totalEl = document.getElementById('statTotalEmployees');
  const compEl = document.getElementById('statCompletedEmployees');
  const pendEl = document.getElementById('statPendingEmployees');

  if (totalEl) totalEl.textContent = total;
  if (compEl) compEl.textContent = completed;
  if (pendEl) pendEl.textContent = pending;
}

function renderEmployeesTable(employees) {
  const tbody = document.getElementById('employeesTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!employees || employees.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="12" style="text-align: center; padding: 3.5rem 1rem; color: var(--text-muted);">
          <i class="fa-solid fa-folder-open" style="font-size: 3rem; margin-bottom: 0.85rem; color: var(--sage-400);"></i>
          <p style="font-weight: 800; font-size: 1.15rem; color: var(--sage-900); margin-bottom: 0.35rem;">لا توجد سجلات حالياً في السحابة</p>
          <p style="font-size: 0.9rem; color: var(--text-secondary);">يمكنك إضافة موظف يدوياً أو استيراد الأسماء من ملف Excel.</p>
        </td>
      </tr>
    `;
    return;
  }

  const photoKeys = [
    'personalPhoto', 'medicalPhoto',
    'empCardFront', 'empCardBack',
    'idCardFront', 'idCardBack',
    'residenceCardFront', 'residenceCardBack'
  ];

  employees.forEach((emp, index) => {
    if (!emp) return;
    try {
      const quadName = String(
        [
          emp.firstName || '',
          emp.secondName || '',
          emp.thirdName || '',
          emp.fourthName || '',
          emp.surname || ''
        ].filter(Boolean).join(' ') || emp.fullName || emp.name || 'موظف'
      ).trim();

      const safeQuadEscaped = quadName.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
      const isComp = (emp.isCompleted === true || emp.isCompleted === 'true');

      const statusBadge = isComp
        ? `<span class="status-badge completed"><i class="fa-solid fa-circle-check"></i> مكتمل</span>`
        : `<span class="status-badge pending"><i class="fa-solid fa-clock"></i> قيد الإكمال</span>`;

      const jobBadge = emp.jobStatus === 'عقد'
        ? `<span class="status-badge job-contract">عقد</span>`
        : `<span class="status-badge job-regular">ملاك</span>`;

      // Count uploaded documents/photos
      const uploadedCount = photoKeys.filter(k => !!emp[k]).length;
      const photosBtnHtml = uploadedCount > 0
        ? `<button class="table-photos-btn ${uploadedCount === 8 ? 'completed' : ''}" onclick="openReviewEmployeeModal('${emp.id}')" title="عرض ومراجعة كافة المستمسكات والصور (${uploadedCount}/8)">
            <i class="fa-solid fa-images"></i> <span>${uploadedCount}/8 صور</span>
          </button>`
        : `<button class="table-photos-btn" onclick="openReviewEmployeeModal('${emp.id}')" title="لا توجد صور مرفوعة بعد">
            <i class="fa-solid fa-image-slash"></i> <span>لا توجد صور</span>
          </button>`;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="text-align: center; font-weight: 800; color: var(--sage-700);">${index + 1}</td>
        <td style="text-align: right; font-weight: 800; color: var(--sage-900); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          <span style="cursor: pointer; color: var(--sage-800);" onclick="openReviewEmployeeModal('${emp.id}')" title="${quadName}">${quadName}</span>
        </td>
        <td style="text-align: right; color: var(--sage-800); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${emp.motherName || ''}">
          ${emp.motherName ? `<span style="font-weight: 700;">${emp.motherName}</span>` : '<span class="empty-val-badge">لم تُدخل</span>'}
        </td>
        <td style="text-align: center;">${jobBadge}</td>
        <td style="text-align: right; font-weight: 600; line-height: 1.25; font-size: 0.83rem;" title="${emp.jobTitle || ''}">${emp.jobTitle ? emp.jobTitle : '<span class="empty-val-badge">—</span>'}</td>
        <td style="text-align: center; white-space: nowrap;"><span dir="ltr" style="font-family: monospace; font-size: 0.84rem;">${emp.phone ? emp.phone : '<span class="empty-val-badge">—</span>'}</span></td>
        <td style="text-align: center;"><span dir="ltr" style="font-weight: 800; color: var(--danger); font-size: 0.85rem;">${emp.bloodType ? emp.bloodType : '<span class="empty-val-badge">—</span>'}</span></td>
        <td style="text-align: center; font-family: monospace; font-weight: 700; font-size: 0.82rem; white-space: nowrap;">${emp.unifiedId ? emp.unifiedId : '<span class="empty-val-badge">—</span>'}</td>
        <td style="text-align: center; font-family: monospace; font-weight: 700; font-size: 0.82rem; white-space: nowrap;">${emp.familyNumber ? emp.familyNumber : '<span class="empty-val-badge">—</span>'}</td>
        <td style="text-align: center;">${photosBtnHtml}</td>
        <td style="text-align: center;">${statusBadge}</td>
        <td style="text-align: center;">
          <div style="display: inline-flex; gap: 0.25rem; align-items: center; justify-content: center;">
            <button class="table-action-btn view" title="مراجعة إضبارة الموظف والصور" onclick="openReviewEmployeeModal('${emp.id}')">
              <i class="fa-solid fa-eye"></i>
            </button>
            <button class="table-action-btn" title="تعديل الموظف" onclick="openEditEmployeeModal('${emp.id}')">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button class="table-action-btn delete" title="حذف الموظف" onclick="deleteEmployee('${emp.id}', '${safeQuadEscaped}')">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    } catch (rowErr) {
      console.warn('Notice rendering employee row:', emp && emp.id, rowErr);
    }
  });
}

// ==================== EMPLOYEE DOSSIER & PHOTO REVIEW MODAL ====================
async function openReviewEmployeeModal(empId) {
  const emp = state.employeesList.find(e => e.id === empId);
  if (!emp) return;

  // Load attachments from subcollection if needed
  if (emp.hasSubcollectionAttachments || (!emp.idCardFront && emp.isCompleted)) {
    try {
      const subAttachments = await getCloudEmployeeAttachments(emp.id);
      if (subAttachments && Object.keys(subAttachments).length > 0) {
        Object.assign(emp, subAttachments);
      }
    } catch (e) {
      console.warn('Subcollection attachments load notice:', e);
    }
  }

  const quadName = String(
    [
      emp.firstName || '',
      emp.secondName || '',
      emp.thirdName || '',
      emp.fourthName || '',
      emp.surname || ''
    ].filter(Boolean).join(' ') || emp.fullName || emp.name || 'موظف'
  ).trim();

  const cleanQuad = quadName.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');

  const photoDocs = [
    { key: 'personalPhoto', title: '1- الصورة الشخصية الحديثة', note: 'بخلفية بيضاء نظامية', icon: 'fa-user' },
    { key: 'medicalPhoto', title: '2- تقرير الفحص الطبي المعتمد', note: 'تقرير الفحص الطبي الصادر', icon: 'fa-file-medical' },
    { key: 'empCardFront', title: '3- باج / هوية الموظف (الوجه الأمامي)', note: 'الوجه الأمامي لهوية الدائرة', icon: 'fa-id-badge' },
    { key: 'empCardBack', title: '4- باج / هوية الموظف (الوجه الخلفي)', note: 'الوجه الخلفي لهوية الدائرة', icon: 'fa-id-badge' },
    { key: 'idCardFront', title: '5- البطاقة الوطنية الموحدة (الوجه الأمامي)', note: 'الوجه الأمامي للبطاقة الوطنية', icon: 'fa-address-card' },
    { key: 'idCardBack', title: '6- البطاقة الوطنية الموحدة (الوجه الخلفي)', note: 'الوجه الخلفي موضحاً الرقم العائلي', icon: 'fa-address-card' },
    { key: 'residenceCardFront', title: '7- بطاقة السكن (الوجه الأمامي)', note: 'الوجه الأمامي لبطاقة السكن', icon: 'fa-house-user' },
    { key: 'residenceCardBack', title: '8- بطاقة السكن (الوجه الخلفي)', note: 'الوجه الخلفي لبطاقة السكن والختم', icon: 'fa-house-user' }
  ];

  const uploadedCount = photoDocs.filter(d => !!emp[d.key]).length;

  const body = document.getElementById('reviewEmployeeModalBody');
  const footerInfo = document.getElementById('dossierModalFooterInfo');
  const btnEdit = document.getElementById('btnEditFromDossier');

  if (footerInfo) {
    footerInfo.innerHTML = `حالة إنجاز المستمسكات: <span style="font-weight: 900; color: ${uploadedCount === 8 ? 'var(--success)' : (uploadedCount > 0 ? 'var(--warning-dark)' : 'var(--danger)')};">${uploadedCount} من أصل 8 مستمسكات مرفوعة</span>`;
  }

  if (btnEdit) {
    btnEdit.onclick = () => {
      closeModal('reviewEmployeeModal');
      openEditEmployeeModal(emp.id);
    };
  }

  // Personal avatar
  const avatarHtml = emp.personalPhoto
    ? `<img src="${emp.personalPhoto}" alt="${quadName}">`
    : `<i class="fa-solid fa-user"></i>`;

  // Build photo cards with interactive edit/upload for Manager
  const photoCardsHtml = photoDocs.map(doc => {
    const photoUrl = emp[doc.key];
    const docTitleSafe = doc.title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    
    if (photoUrl) {
      return `
        <div class="dossier-photo-card">
          <div class="photo-card-head">
            <span><i class="fa-solid ${doc.icon}" style="color: var(--sage-700);"></i> ${doc.title}</span>
            <span class="status-badge completed" style="font-size: 0.72rem; padding: 0.2rem 0.5rem;"><i class="fa-solid fa-check"></i> متوفرة</span>
          </div>
          <!-- Click directly on photo opens action dialog (مشاهدة / تغيير / حذف) -->
          <div class="photo-thumb-container" onclick="openPhotoActionDialog('${emp.id}', '${doc.key}', '${docTitleSafe}', '${photoUrl}')" title="انقر هنا لمشاهدة أو تغيير أو حذف الصورة">
            <img src="${photoUrl}" alt="${doc.title}" loading="lazy">
            <div class="photo-interactive-overlay">
              <i class="fa-solid fa-sliders" style="font-size: 1.6rem;"></i>
              <span>انقر للمشاهدة أو التعديل أو الحذف</span>
            </div>
          </div>
          <div class="photo-card-foot" style="flex-direction: column; gap: 0.45rem; align-items: stretch;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 0.75rem; color: var(--text-secondary);">${doc.note}</span>
              <a href="${photoUrl}" download="${quadName.replace(/\s+/g, '_')}_${doc.key}.jpg" class="btn btn-sm btn-outline-success" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;" title="تنزيل الصورة بجهازك">
                <i class="fa-solid fa-download"></i> تنزيل
              </a>
            </div>
            <!-- Manager Action Buttons: مشاهدة | تغيير | حذف -->
            <div class="photo-card-actions" style="border-top: 1px dashed var(--offwhite-300); padding-top: 0.4rem; display: flex; gap: 0.35rem;">
              <button type="button" class="btn-photo-action" style="flex: 1; background: var(--sage-100); color: var(--sage-800); border: 1px solid var(--sage-300); font-weight: 700; padding: 0.35rem 0.25rem; font-size: 0.8rem; justify-content: center;" onclick="openLightbox('${photoUrl}', '${docTitleSafe} - ${cleanQuad}')" title="مشاهدة وتكبير الصورة">
                <i class="fa-solid fa-eye"></i> مشاهدة
              </button>
              <button type="button" class="btn-photo-action edit" style="flex: 1; font-weight: 700; padding: 0.35rem 0.25rem; font-size: 0.8rem; justify-content: center;" onclick="openManagerPhotoUploadModal('${emp.id}', '${doc.key}', '${docTitleSafe}')" title="تعديل أو استبدال هذه الصورة">
                <i class="fa-solid fa-camera-rotate"></i> تغيير
              </button>
              <button type="button" class="btn-photo-action delete" style="flex: 1; font-weight: 700; padding: 0.35rem 0.25rem; font-size: 0.8rem; justify-content: center;" onclick="deleteEmployeePhotoConfirm('${emp.id}', '${doc.key}', '${docTitleSafe}')" title="حذف هذه الصورة">
                <i class="fa-solid fa-trash"></i> حذف
              </button>
            </div>
          </div>
        </div>
      `;
    } else {
      return `
        <div class="dossier-photo-card" style="opacity: 0.95; border: 1.5px dashed var(--sage-400);">
          <div class="photo-card-head" style="background: #f8fafc;">
            <span><i class="fa-solid ${doc.icon}" style="color: #94a3b8;"></i> ${doc.title}</span>
            <span class="status-badge pending" style="font-size: 0.72rem; padding: 0.2rem 0.5rem;"><i class="fa-solid fa-xmark"></i> شاغر</span>
          </div>
          <!-- Click directly on empty slot triggers upload modal -->
          <div class="photo-thumb-container clickable-empty" onclick="openManagerPhotoUploadModal('${emp.id}', '${doc.key}', '${docTitleSafe}')" title="انقر لرفع واختيار الصورة مباشرة">
            <div class="photo-missing-placeholder">
              <i class="fa-solid fa-cloud-arrow-up" style="font-size: 2.3rem; color: var(--sage-600); margin-bottom: 0.35rem;"></i>
              <span style="font-size: 0.88rem; font-weight: 800; color: var(--sage-900);">مكان شاغر (انقر للرفع الآن)</span>
              <span style="font-size: 0.75rem; color: var(--text-secondary);">رفع من الجهاز أو التقاط بالكاميرا</span>
            </div>
          </div>
          <div class="photo-card-foot" style="background: #f8fafc; flex-direction: column; gap: 0.4rem; align-items: stretch;">
            <span style="font-size: 0.75rem; color: var(--text-muted);">${doc.note}</span>
            <!-- Manager Action: Upload missing photo -->
            <div class="photo-card-actions">
              <button type="button" class="btn-photo-action edit" style="width: 100%; justify-content: center; background: var(--sage-700); color: #ffffff; border: none; padding: 0.45rem 0.75rem; font-weight: 800; font-size: 0.85rem;" onclick="openManagerPhotoUploadModal('${emp.id}', '${doc.key}', '${docTitleSafe}')" title="رفع هذه الوثيقة الناقصة الآن">
                <i class="fa-solid fa-cloud-arrow-up"></i> رفع هذه الصورة الآن
              </button>
            </div>
          </div>
        </div>
      `;
    }
  }).join('');

  body.innerHTML = `
    <!-- Dossier Header -->
    <div class="dossier-header-card">
      <div class="dossier-profile-info">
        <div class="dossier-avatar-wrap" ${emp.personalPhoto ? `onclick="openLightbox('${emp.personalPhoto}', 'الصورة الشخصية - ${quadName.replace(/'/g, "\\'")}')" style="cursor: pointer;"` : ''} title="${emp.personalPhoto ? 'انقر لتكبير الصورة الشخصية' : ''}">
          ${avatarHtml}
        </div>
        <div class="dossier-names-wrap">
          <h3>${quadName}</h3>
          <div class="dossier-badges">
            <span class="status-badge ${emp.jobStatus === 'عقد' ? 'job-contract' : 'job-regular'}">
              <i class="fa-solid fa-id-badge"></i> ${emp.jobStatus || 'ملاك'}
            </span>
            <span class="status-badge" style="background: var(--sage-100); color: var(--sage-800); border: 1px solid var(--sage-300);">
              <i class="fa-solid fa-building"></i> ${emp.department || 'شعبة زراعة الشرقاط'}
            </span>
            ${emp.isCompleted
              ? `<span class="status-badge completed"><i class="fa-solid fa-circle-check"></i> الاستمارة مكتملة</span>`
              : `<span class="status-badge pending"><i class="fa-solid fa-clock"></i> بانتظار استكمال البيانات</span>`
            }
          </div>
        </div>
      </div>
      <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
        <span style="background: #ffffff; padding: 0.6rem 1rem; border-radius: var(--radius-md); border: 1.5px solid var(--sage-300); font-weight: 800; color: var(--sage-900); display: inline-flex; align-items: center; gap: 0.5rem; box-shadow: 0 2px 6px rgba(0,0,0,0.04);">
          <i class="fa-solid fa-images" style="color: var(--sage-600); font-size: 1.15rem;"></i>
          <span>المستمسكات: <strong style="color: ${uploadedCount === 8 ? 'var(--success)' : 'var(--sage-800)'}; font-size: 1.1rem;">${uploadedCount} / 8</strong></span>
        </span>
        <button type="button" class="btn btn-sm btn-primary" onclick="closeModal('reviewEmployeeModal'); openEditEmployeeModal('${emp.id}')" style="font-weight: 800; padding: 0.6rem 1rem; font-size: 0.85rem;" title="تعديل كافة بيانات ومستمسكات الموظف">
          <i class="fa-solid fa-user-pen"></i> تعديل كافة البيانات والصور
        </button>
      </div>
    </div>

    <!-- Official Details Grid -->
    <div class="dossier-section-title">
      <i class="fa-solid fa-clipboard-user"></i>
      <span>المعلومات والبيانات الرسمية للموظف</span>
    </div>

    <div class="dossier-details-grid">
      <div class="dossier-field-item">
        <span class="field-label"><i class="fa-solid fa-person-breastfeeding"></i> اسم الأم الثلاثي</span>
        <span class="field-val">${emp.motherName || '<span class="empty-val-badge">لم يُدخل بعد</span>'}</span>
      </div>
      <div class="dossier-field-item">
        <span class="field-label"><i class="fa-solid fa-address-card"></i> رقم البطاقة الموحدة</span>
        <span class="field-val" style="font-family: monospace;">${emp.unifiedId || '<span class="empty-val-badge">لم يُدخل بعد</span>'}</span>
      </div>
      <div class="dossier-field-item">
        <span class="field-label"><i class="fa-solid fa-users-rectangle"></i> الرقم العائلي</span>
        <span class="field-val" style="font-family: monospace;">${emp.familyNumber || '<span class="empty-val-badge">لم يُدخل بعد</span>'}</span>
      </div>
      <div class="dossier-field-item">
        <span class="field-label"><i class="fa-solid fa-droplet"></i> فصيلة الدم</span>
        <span class="field-val" style="color: var(--danger); font-weight: 800;">${emp.bloodType || '<span class="empty-val-badge">—</span>'}</span>
      </div>
      <div class="dossier-field-item">
        <span class="field-label"><i class="fa-solid fa-phone"></i> رقم الهاتف</span>
        <span class="field-val" style="direction: ltr; text-align: right;">${emp.phone || '<span class="empty-val-badge">—</span>'}</span>
      </div>
      <div class="dossier-field-item">
        <span class="field-label"><i class="fa-solid fa-briefcase"></i> العنوان الوظيفي</span>
        <span class="field-val">${emp.jobTitle || '<span class="empty-val-badge">—</span>'}</span>
      </div>
      <div class="dossier-field-item">
        <span class="field-label"><i class="fa-solid fa-user-tie"></i> المنصب المكلف به</span>
        <span class="field-val">${emp.position || 'موظف'}</span>
      </div>
      <div class="dossier-field-item">
        <span class="field-label"><i class="fa-solid fa-clock-rotate-left"></i> تاريخ آخر تحديث</span>
        <span class="field-val" style="font-size: 0.85rem;">${emp.completedAt ? new Date(emp.completedAt).toLocaleString('ar-IQ') : '<span class="empty-val-badge">سجل غير محدث</span>'}</span>
      </div>
      <div class="dossier-field-item">
        <span class="field-label"><i class="fa-solid fa-key"></i> أمان الحساب والرمز السري</span>
        <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.2rem; flex-wrap: wrap;">
          ${emp.personalPin
            ? `<span class="status-badge completed" style="font-size: 0.74rem;"><i class="fa-solid fa-lock"></i> مؤمن برمز سري</span>
               <button type="button" class="btn btn-sm btn-outline-danger" onclick="handleManagerResetPin('${emp.id}', '${cleanQuad}')" title="تصفير الرمز لتمكين الموظف من تعيين رمز جديد" style="padding: 0.15rem 0.5rem; font-size: 0.72rem;">
                 <i class="fa-solid fa-rotate-left"></i> تصفير الرمز
               </button>`
            : `<span class="status-badge pending" style="font-size: 0.74rem;"><i class="fa-solid fa-lock-open"></i> غير معيّن بعد</span>`
          }
        </div>
      </div>

      <!-- Employee Edit Permissions & Attempts Manager Control -->
      <div class="dossier-field-item" style="grid-column: 1 / -1; background: #f8faf8; border: 1.5px solid var(--sage-300); border-radius: var(--radius-md); padding: 0.85rem 1.15rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.4rem;">
          <span style="font-weight: 800; color: var(--sage-900); font-size: 0.95rem;">
            <i class="fa-solid fa-shield-halved" style="color: var(--sage-700);"></i> إدارة صلاحية تعديل الاستمارة للموظف:
          </span>
          <div style="display: flex; gap: 0.45rem; flex-wrap: wrap;">
            <button type="button" class="btn btn-sm ${emp.canEdit === false ? 'btn-success' : 'btn-outline-danger'}" onclick="toggleEmployeePermissionFromDossier('${emp.id}', ${emp.canEdit === false ? 'true' : 'false'})" style="font-size: 0.78rem;">
              <i class="fa-solid ${emp.canEdit === false ? 'fa-lock-open' : 'fa-lock'}"></i> ${emp.canEdit === false ? 'فتح الصلاحية للموظف' : 'قفل التعديل على الموظف'}
            </button>
            <button type="button" class="btn btn-sm btn-secondary" onclick="grantMoreEditsFromDossier('${emp.id}', '${cleanQuad}')" style="font-size: 0.78rem;" title="منح 3 محاولات إضافية">
              <i class="fa-solid fa-plus"></i> إضافة 3 محاولات تعديل
            </button>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
          ${(emp.canEdit !== false && Number(emp.editCount || 0) < Number(emp.maxEditsAllowed || 3))
            ? `<span class="status-badge completed" style="font-size: 0.76rem;"><i class="fa-solid fa-unlock"></i> التعديل متاح للموظف</span>`
            : `<span class="status-badge pending" style="font-size: 0.76rem; background: #fee2e2; color: #b91c1c; border-color: #fca5a5;"><i class="fa-solid fa-lock"></i> التعديل مقفل حالياً</span>`
          }
          <span style="font-size: 0.85rem; color: var(--text-secondary);">
            محاولات التعديل المستخدمة: <strong style="color: var(--sage-900);">${emp.editCount || 0}</strong> من أصل <strong style="color: var(--sage-900);">${emp.maxEditsAllowed || 3}</strong> محاولة مسموحة
          </span>
        </div>
      </div>
    </div>

    <!-- Photos Grid -->
    <div class="dossier-section-title">
      <i class="fa-solid fa-camera-retro"></i>
      <span>المستمسكات والوثائق الصورية المرفوعة بوجهيها (${uploadedCount} من أصل 8)</span>
    </div>

    <div class="dossier-photos-grid">
      ${photoCardsHtml}
    </div>
  `;

  openModal('reviewEmployeeModal');
}

// ==================== LIGHTBOX LOGIC ====================
function openLightbox(imgSrc, caption) {
  const lightbox = document.getElementById('imageLightbox');
  const img = document.getElementById('lightboxImg');
  const cap = document.getElementById('lightboxCaption');
  const dl = document.getElementById('lightboxDownloadBtn');

  if (img) img.src = imgSrc;
  if (cap) cap.textContent = caption || 'معاينة المستمسك';
  if (dl) {
    dl.href = imgSrc;
    dl.download = (caption ? caption.replace(/[\s\/\\]+/g, '_') : 'document') + '.jpg';
  }
  if (lightbox) lightbox.classList.add('active');
}

function closeLightbox() {
  const lightbox = document.getElementById('imageLightbox');
  if (lightbox) lightbox.classList.remove('active');
}

function handleLightboxBackdropClick(event) {
  if (event.target.id === 'imageLightbox') {
    closeLightbox();
  }
}

// ==================== PHOTO ACTION DIALOG (مشاهدة / تغيير / حذف) ====================
function openPhotoActionDialog(empId, photoKey, docTitle, photoUrl) {
  const emp = (state.employeesList || []).find(e => e.id === empId);
  const empName = emp ? (emp.fullName || 'الموظف') : 'الموظف';

  const titleEl = document.getElementById('photoActionDialogTitle');
  const docNameEl = document.getElementById('photoActionDocName');
  const empNameEl = document.getElementById('photoActionEmpName');
  const thumbImg = document.getElementById('photoActionThumbImg');

  if (titleEl) titleEl.textContent = `إدارة المستمسك: ${docTitle}`;
  if (docNameEl) docNameEl.textContent = docTitle;
  if (empNameEl) empNameEl.textContent = `الموظف: ${empName}`;
  if (thumbImg) thumbImg.src = photoUrl || '';

  // 1. زر المشاهدة والتكبير
  const btnView = document.getElementById('btnActionViewPhoto');
  if (btnView) {
    btnView.onclick = () => {
      closeModal('photoActionDialogModal');
      openLightbox(photoUrl, `${docTitle} - ${empName}`);
    };
  }

  // 2. زر التغيير والاستبدال
  const btnChange = document.getElementById('btnActionChangePhoto');
  if (btnChange) {
    btnChange.onclick = () => {
      closeModal('photoActionDialogModal');
      openManagerPhotoUploadModal(empId, photoKey, docTitle);
    };
  }

  // 3. زر حذف الصورة
  const btnDelete = document.getElementById('btnActionDeletePhoto');
  if (btnDelete) {
    btnDelete.onclick = () => {
      closeModal('photoActionDialogModal');
      deleteEmployeePhotoConfirm(empId, photoKey, docTitle);
    };
  }

  openModal('photoActionDialogModal');
}

// ==================== MANAGER SINGLE PHOTO UPLOAD & PERMISSION ACTIONS ====================
let currentManagerUploadTarget = {
  empId: '',
  photoKey: '',
  docTitle: ''
};

function openManagerPhotoUploadModal(empId, photoKey, docTitle) {
  const emp = state.employeesList.find(e => e.id === empId);
  if (!emp) return;

  currentManagerUploadTarget = { empId, photoKey, docTitle };
  document.getElementById('managerPhotoUploadForm').reset();
  document.getElementById('mgrUploadEmpId').value = empId;
  document.getElementById('mgrUploadPhotoKey').value = photoKey;
  document.getElementById('mgrUploadCameraData').value = '';

  document.getElementById('mgrUploadEmpName').textContent = `الموظف: ${emp.fullName}`;
  document.getElementById('mgrUploadDocName').textContent = `المستمسك: ${docTitle}`;
  document.getElementById('managerPhotoUploadTitle').textContent = `إضافة / استبدال: ${docTitle}`;

  const previewBox = document.getElementById('mgrPhotoPreviewContainer');
  previewBox.style.display = 'none';
  document.getElementById('mgrPhotoPreviewImg').src = '';
  document.getElementById('mgrPhotoStatusHelper').textContent = 'قم باختيار ملف صورة أو التقاط صورة بالكاميرا لاعتمادها مباشرة';
  document.getElementById('btnSaveManagerPhoto').disabled = true;

  const errEl = document.getElementById('managerPhotoUploadError');
  if (errEl) errEl.style.display = 'none';

  openModal('managerPhotoUploadModal');
}

function handleManagerFileChosen(input) {
  if (input.files && input.files[0]) {
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      document.getElementById('mgrPhotoPreviewImg').src = e.target.result;
      document.getElementById('mgrPhotoPreviewContainer').style.display = 'block';
      document.getElementById('mgrPhotoStatusHelper').textContent = `تم اختيار الملف: ${file.name}`;
      document.getElementById('btnSaveManagerPhoto').disabled = false;
    };
    reader.readAsDataURL(file);
  }
}

function openCameraForManagerUpload() {
  state.cameraTarget = 'managerUpload';
  document.getElementById('cameraModalTitle').textContent = `التقاط صورة: ${currentManagerUploadTarget.docTitle || 'المستمسك'}`;
  document.getElementById('cameraVideo').style.display = 'block';
  document.getElementById('cameraSnapshotPreview').style.display = 'none';
  document.getElementById('btnShutter').style.display = 'flex';
  document.getElementById('btnConfirmSnapshot').style.display = 'none';
  document.getElementById('btnRetakeSnapshot').style.display = 'none';

  openModal('cameraModal');
  startCameraStream();
}

async function handleManagerSaveSinglePhoto(event) {
  event.preventDefault();
  const empId = document.getElementById('mgrUploadEmpId').value;
  const photoKey = document.getElementById('mgrUploadPhotoKey').value;
  const fileInput = document.getElementById('mgrPhotoFileInput');
  const cameraData = document.getElementById('mgrUploadCameraData').value;

  const fileOrDataUrl = (fileInput.files && fileInput.files[0]) || cameraData;
  if (!fileOrDataUrl) {
    showToast('يرجى اختيار ملف أو التقاط صورة أولاً', 'warning');
    return;
  }

  const btn = document.getElementById('btnSaveManagerPhoto');
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري الحفظ والمعالجة السحابية...`;

  try {
    let newUrl = '';
    if (typeof updateSingleEmployeePhoto === 'function' && isFirebaseReady) {
      const res = await updateSingleEmployeePhoto(empId, photoKey, fileOrDataUrl);
      newUrl = res.url;
    } else {
      // Local server fallback
      const fd = new FormData();
      fd.append('employeeId', empId);
      fd.append('photoKey', photoKey);
      if (fileInput.files && fileInput.files[0]) fd.append('photoFile', fileInput.files[0]);
      if (cameraData) fd.append('cameraData', cameraData);

      const res = await fetch('/api/employee/single-photo', { method: 'POST', body: fd });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      newUrl = data.photoUrl;
    }

    // Update in-memory employee record
    const emp = state.employeesList.find(e => e.id === empId);
    if (emp) {
      emp[photoKey] = newUrl;
      if (photoKey === 'personalPhoto') emp.personalPhoto = newUrl;
    }

    closeModal('managerPhotoUploadModal');
    showToast('🎉 تم حفظ وتحديث المستمسك بنجاح!', 'success');

    // Refresh review modal and manager table
    await openReviewEmployeeModal(empId);
    renderEmployeesTable(state.employeesList);
    renderStats(state.employeesList);
  } catch (err) {
    showToast('خطأ في حفظ الصورة: ' + err.message, 'danger');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

async function deleteEmployeePhotoConfirm(empId, photoKey, docTitle) {
  if (!confirm(`هل أنت متأكد من حذف (${docTitle}) لهذا الموظف؟`)) return;

  try {
    if (typeof deleteSingleEmployeePhoto === 'function' && isFirebaseReady) {
      await deleteSingleEmployeePhoto(empId, photoKey);
    } else {
      // Local fallback
      await fetch(`/api/manager/employee/${empId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [photoKey]: '' })
      });
    }

    const emp = state.employeesList.find(e => e.id === empId);
    if (emp) {
      emp[photoKey] = '';
      if (photoKey === 'personalPhoto') emp.personalPhoto = '';
    }

    showToast(`تم حذف ${docTitle} بنجاح`, 'info');
    await openReviewEmployeeModal(empId);
    renderEmployeesTable(state.employeesList);
    renderStats(state.employeesList);
  } catch (err) {
    showToast('خطأ في حذف الصورة: ' + err.message, 'danger');
  }
}

async function toggleEmployeePermissionFromDossier(empId, canEdit) {
  try {
    if (typeof setEmployeeEditPermission === 'function' && isFirebaseReady) {
      await setEmployeeEditPermission(empId, canEdit);
    } else {
      await fetch(`/api/manager/employee/${empId}/permission`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canEdit })
      });
    }

    const emp = state.employeesList.find(e => e.id === empId);
    if (emp) emp.canEdit = canEdit;

    showToast(canEdit ? 'تم فتح صلاحية التعديل للموظف بنجاح' : 'تم قفل صلاحية التعديل على الموظف', 'success');
    await openReviewEmployeeModal(empId);
  } catch (err) {
    showToast('خطأ في تحديث الصلاحية: ' + err.message, 'danger');
  }
}

async function grantMoreEditsFromDossier(empId, empName) {
  try {
    if (typeof grantEmployeeAdditionalEdits === 'function' && isFirebaseReady) {
      await grantEmployeeAdditionalEdits(empId, 3);
    } else {
      await fetch(`/api/manager/employee/${empId}/grant-edits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 3 })
      });
    }

    const emp = state.employeesList.find(e => e.id === empId);
    if (emp) {
      emp.maxEditsAllowed = Number(emp.maxEditsAllowed || 3) + 3;
      emp.canEdit = true;
    }

    showToast(`تم منح 3 محاولات تعديل إضافية للموظف (${empName}) بنجاح`, 'success');
    await openReviewEmployeeModal(empId);
  } catch (err) {
    showToast('خطأ في منح المحاولات: ' + err.message, 'danger');
  }
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
      const full = (
        (e.fullName || '') + ' ' +
        (e.motherName || '') + ' ' +
        (e.familyNumber || '') + ' ' +
        (e.jobTitle || '') + ' ' +
        (e.phone || '') + ' ' +
        (e.unifiedId || '')
      ).toLowerCase();
      return full.includes(search);
    });
  }

  renderEmployeesTable(filtered);
}

// ==================== BROWSER DIRECT EXPORT (EXCEL & WORD & ZIP) ====================

/**
 * Generates and downloads styled Excel sheet directly in the browser using ExcelJS
 */
async function downloadDirectExcel() {
  if (typeof ExcelJS === 'undefined') {
    window.location.href = '/api/manager/export/excel';
    return;
  }

  showToast('جاري توليد ملف Excel المنسق...', 'info');

  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'شعبة زراعة الشرقاط - نظام الموارد البشرية السحابي';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('بيانات الموظفين', {
      views: [{ rightToLeft: true }]
    });

    worksheet.columns = [
      { header: 'ت', key: 'seq', width: 6 },
      { header: 'الاسم الرباعي واللقب', key: 'fullQuadName', width: 30 },
      { header: 'اسم الأم الثلاثي', key: 'motherName', width: 24 },
      { header: 'الرقم العائلي', key: 'familyNumber', width: 14 },
      { header: 'رقم البطاقة الموحدة', key: 'unifiedId', width: 20 },
      { header: 'فصيلة الدم', key: 'bloodType', width: 12 },
      { header: 'رقم الهاتف', key: 'phone', width: 16 },
      { header: 'الصفة الوظيفية', key: 'jobStatus', width: 14 },
      { header: 'الدائرة / الشعبة', key: 'department', width: 26 },
      { header: 'المنصب', key: 'position', width: 20 },
      { header: 'العنوان الوظيفي', key: 'jobTitle', width: 24 },
      { header: 'حالة إكمال البيانات', key: 'status', width: 18 },
      { header: 'تاريخ الإكمال', key: 'completedAt', width: 18 }
    ];

    const headerRow = worksheet.getRow(1);
    headerRow.height = 32;
    headerRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF41674E' } };
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    state.employeesList.forEach((emp, index) => {
      const quadName = [
        emp.firstName || '',
        emp.secondName || '',
        emp.thirdName || '',
        emp.fourthName || '',
        emp.surname || ''
      ].filter(Boolean).join(' ') || emp.fullName;

      const row = worksheet.addRow({
        seq: index + 1,
        fullQuadName: quadName,
        motherName: emp.motherName || '—',
        familyNumber: emp.familyNumber || '—',
        unifiedId: emp.unifiedId || '—',
        bloodType: emp.bloodType || '—',
        phone: emp.phone || '—',
        jobStatus: emp.jobStatus || '—',
        department: emp.department || 'شعبة زراعة الشرقاط',
        position: emp.position || 'موظف',
        jobTitle: emp.jobTitle || '—',
        status: emp.isCompleted ? 'مكتمل' : 'بانتظار الإكمال',
        completedAt: emp.completedAt ? new Date(emp.completedAt).toLocaleDateString('ar-IQ') : '—'
      });

      row.height = 24;
      const isEven = index % 2 === 0;
      row.eachCell((cell, colNumber) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? 'FFF9FBF9' : 'FFFFFFFF' } };
        cell.alignment = { vertical: 'middle', horizontal: colNumber === 1 || colNumber === 6 || colNumber === 12 ? 'center' : 'right' };
        if (colNumber === 12) {
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: emp.isCompleted ? 'FF2D6A4F' : 'FFD97706' } };
        }
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, 'بيانات_الموظفين_شعبة_زراعة_الشرقاط.xlsx');
    showToast('تم تحميل ملف Excel بنجاح!', 'success');
  } catch (err) {
    showToast('خطأ في توليد ملف الإكسل: ' + err.message, 'danger');
  }
}

/**
 * Generates and downloads official Word table directly in browser
 */
function downloadDirectWord() {
  try {
    let rowsHtml = '';
    state.employeesList.forEach((emp, index) => {
      const quadName = [
        emp.firstName || '',
        emp.secondName || '',
        emp.thirdName || '',
        emp.fourthName || '',
        emp.surname || ''
      ].filter(Boolean).join(' ') || emp.fullName;

      rowsHtml += `
        <tr style="background: ${index % 2 === 0 ? '#f4f7f4' : '#ffffff'};">
          <td style="text-align: center;">${index + 1}</td>
          <td>${quadName}</td>
          <td>${emp.motherName || '—'}</td>
          <td>${emp.unifiedId || '—'}</td>
          <td style="text-align: center;">${emp.bloodType || '—'}</td>
          <td>${emp.phone || '—'}</td>
          <td>${emp.jobStatus || '—'}</td>
          <td>${emp.jobTitle || '—'}</td>
          <td style="text-align: center; color: ${emp.isCompleted ? '#2D6A4F' : '#d97706'}; font-weight: bold;">
            ${emp.isCompleted ? 'مكتمل' : 'قيد الانتظار'}
          </td>
        </tr>
      `;
    });

    const docContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>جدول موظفي شعبة زراعة الشرقاط</title>
      <style>
        body { font-family: 'Arial', sans-serif; direction: rtl; text-align: right; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        th { background-color: #41674E; color: #ffffff; padding: 8px; border: 1px solid #2D4736; font-size: 11pt; }
        td { padding: 6px 8px; border: 1px solid #cccccc; font-size: 10pt; }
      </style>
      </head>
      <body>
        <div style="text-align: center; margin-bottom: 20px;">
          <h2 style="color: #2D4736; margin: 0;">جمهورية العراق - وزارة الزراعة</h2>
          <h3 style="color: #41674E; margin: 5px 0;">مديرية زراعة صلاح الدين / شعبة زراعة الشرقاط</h3>
          <p style="color: #666666;">جدول بيانات الموظفين - وحدة الموارد البشرية (تاريخ الاستخراج: ${new Date().toLocaleDateString('ar-IQ')})</p>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 30px;">ت</th>
              <th>الاسم الرباعي واللقب</th>
              <th>اسم الأم</th>
              <th>البطاقة الموحدة</th>
              <th>فصيلة الدم</th>
              <th>الهاتف</th>
              <th>الصفة</th>
              <th>العنوان الوظيفي</th>
              <th>حالة البيانات</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff' + docContent], { type: 'application/msword' });
    saveAs(blob, 'جدول_الموظفين_شعبة_زراعة_الشرقاط.doc');
    showToast('تم تحميل ملف Word بنجاح!', 'success');
  } catch (err) {
    showToast('خطأ في توليد ملف الوورد: ' + err.message, 'danger');
  }
}

/**
 * Master Save: Zips Excel file + employee photos into a timestamped ZIP archive
 */
async function triggerMasterSave() {
  const btn = document.getElementById('btnMasterSave');
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري تجهيز الأرشيف السحابي ومجلدات الصور...`;

  try {
    if (typeof JSZip === 'undefined') {
      // Fallback to local server save-all if JSZip is not loaded
      const res = await fetch('/api/manager/save-all', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast('تم الحفظ والتصدير بنجاح!', 'success');
        alert(data.message);
      }
      return;
    }

    const zip = new JSZip();
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const folderName = `تصدير_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
    const mainFolder = zip.folder(folderName);

    // 1. Generate and attach Excel file inside the zip
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('بيانات الموظفين', { views: [{ rightToLeft: true }] });
    worksheet.columns = [
      { header: 'ت', key: 'seq', width: 6 },
      { header: 'الاسم الرباعي واللقب', key: 'fullQuadName', width: 30 },
      { header: 'اسم الأم الثلاثي', key: 'motherName', width: 24 },
      { header: 'الرقم العائلي', key: 'familyNumber', width: 14 },
      { header: 'رقم البطاقة الموحدة', key: 'unifiedId', width: 20 },
      { header: 'فصيلة الدم', key: 'bloodType', width: 12 },
      { header: 'رقم الهاتف', key: 'phone', width: 16 },
      { header: 'الصفة الوظيفية', key: 'jobStatus', width: 14 },
      { header: 'الدائرة / الشعبة', key: 'department', width: 26 },
      { header: 'المنصب', key: 'position', width: 20 },
      { header: 'العنوان الوظيفي', key: 'jobTitle', width: 24 },
      { header: 'حالة إكمال البيانات', key: 'status', width: 18 }
    ];

    state.employeesList.forEach((emp, index) => {
      const quadName = [emp.firstName, emp.secondName, emp.thirdName, emp.fourthName, emp.surname].filter(Boolean).join(' ') || emp.fullName;
      worksheet.addRow({
        seq: index + 1,
        fullQuadName: quadName,
        motherName: emp.motherName || '—',
        familyNumber: emp.familyNumber || '—',
        unifiedId: emp.unifiedId || '—',
        bloodType: emp.bloodType || '—',
        phone: emp.phone || '—',
        jobStatus: emp.jobStatus || '—',
        department: emp.department || 'شعبة زراعة الشرقاط',
        position: emp.position || 'موظف',
        jobTitle: emp.jobTitle || '—',
        status: emp.isCompleted ? 'مكتمل' : 'بانتظار الإكمال'
      });
    });

    const excelBuf = await workbook.xlsx.writeBuffer();
    mainFolder.file('بيانات_الموظفين_شعبة_زراعة_الشرقاط.xlsx', excelBuf);

    // 2. Add employee folders with their attachments into two subfolders
    const empRootFolder = mainFolder.folder('ملفات_الموظفين');

    const photoFields = [
      { key: 'personalPhoto', name: 'الصورة_الشخصية.jpg', group: 'personalAndMedical' },
      { key: 'medicalPhoto', name: 'الفحص_الطبي.jpg', group: 'personalAndMedical' },
      { key: 'empCardFront', name: 'هوية_الموظف_الوجه_الامامي.jpg', group: 'documents' },
      { key: 'empCardBack', name: 'هوية_الموظف_الوجه_الخلفي.jpg', group: 'documents' },
      { key: 'idCardFront', name: 'البطاقة_الموحدة_الوجه_الامامي.jpg', group: 'documents' },
      { key: 'idCardBack', name: 'البطاقة_الموحدة_الوجه_الخلفي.jpg', group: 'documents' },
      { key: 'residenceCardFront', name: 'بطاقة_السكن_الوجه_الامامي.jpg', group: 'documents' },
      { key: 'residenceCardBack', name: 'بطاقة_السكن_الوجه_الخلفي.jpg', group: 'documents' }
    ];

    let downloadedCount = 0;
    for (const emp of state.employeesList) {
      // If completed employee has attachments stored in subcollection, fetch them first
      if (emp.isCompleted && (emp.hasSubcollectionAttachments || !emp.idCardFront || emp.idCardFront === 'subcollection')) {
        try {
          const subAttachments = await getCloudEmployeeAttachments(emp.id);
          if (subAttachments && Object.keys(subAttachments).length > 0) {
            Object.assign(emp, subAttachments);
          }
        } catch (e) {}
      }

      const folderNameClean = (emp.fullName || `موظف_${emp.id}`).replace(/[\\/:*?"<>|]/g, '_').trim();
      const singleEmpFolder = empRootFolder.folder(folderNameClean);
      const personalAndMedicalFolder = singleEmpFolder.folder('الصورة الشخصية والفحص');
      const documentsFolder = singleEmpFolder.folder('المستمسكات والوثائق');

      for (const p of photoFields) {
        const url = emp[p.key];
        if (url) {
          try {
            const targetFolder = p.group === 'personalAndMedical' ? personalAndMedicalFolder : documentsFolder;
            if (url.startsWith('data:image')) {
              const base64Data = url.split(',')[1];
              targetFolder.file(p.name, base64Data, { base64: true });
            } else {
              const fetchRes = await fetch(url);
              if (fetchRes.ok) {
                const blob = await fetchRes.blob();
                targetFolder.file(p.name, blob);
              }
            }
          } catch (e) {
            // Ignore single photo fetch error
          }
        }
      }
      downloadedCount++;
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    saveAs(zipBlob, `${folderName}.zip`);

    showToast(`🎉 تم تجهيز وتنزيل أرشيف المنظومة المؤرخ (${folderName}.zip) بنجاح!`, 'success');
  } catch (error) {
    showToast('خطأ أثناء تجهيز الأرشيف: ' + error.message, 'danger');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

// ==================== EXCEL IMPORT FLOW (BROWSER CLIENT-SIDE) ====================
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

  const resultDiv = document.getElementById('uploadExcelResult');
  const btnSubmit = document.getElementById('btnSubmitExcel');
  const originalBtn = btnSubmit.innerHTML;

  btnSubmit.disabled = true;
  btnSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري استيراد الأسماء إلى السحابة...`;

  resultDiv.className = 'custom-alert alert-info';
  resultDiv.style.display = 'flex';
  resultDiv.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري قراءة ملف الإكسل ومعالجة الأسماء...';

  try {
    const file = fileInput.files[0];
    const arrayBuffer = await file.arrayBuffer();
    const isWord = file.name.toLowerCase().endsWith('.docx');

    const parsedEmployees = [];

    if (isWord) {
      if (typeof mammoth === 'undefined') {
        throw new Error('مكتبة معالجة مستندات Word غير متوفرة في المتصفح');
      }
      resultDiv.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري قراءة مستند Word واستخراج الأسماء...';
      const docxRes = await mammoth.extractRawText({ arrayBuffer });
      const lines = (docxRes.value || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);

      for (let line of lines) {
        let cleaned = line.replace(/^[\d٠-٩]+[\s\.\-\)\:]+/, '').trim();
        cleaned = cleaned.replace(/^[\-\•\*\–\—]+\s*/, '').trim();

        if (
          cleaned.length < 5 ||
          cleaned.includes('قائمة أسماء') ||
          cleaned.includes('شعبة زراعة') ||
          cleaned.includes('الموارد البشرية') ||
          cleaned === 'الاسم' ||
          cleaned === 'اسم الموظف' ||
          cleaned === 'الاسم الثلاثي' ||
          cleaned === 'ت' ||
          cleaned === 'ملاحظات'
        ) {
          continue;
        }

        const words = cleaned.split(/\s+/).filter(w => w.length > 0);
        if (words.length >= 2) {
          parsedEmployees.push({
            fullName: cleaned,
            firstName: words[0] || '',
            secondName: words[1] || '',
            thirdName: words[2] || '',
            fourthName: words[3] || '',
            surname: words.length > 4 ? words.slice(4).join(' ') : '',
            jobStatus: 'ملاك',
            jobTitle: '',
            department: 'شعبة زراعة الشرقاط',
            phone: ''
          });
        }
      }
    } else {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);
      const worksheet = workbook.worksheets[0];

      if (!worksheet) {
        throw new Error('الملف لا يحتوي على صفحات عمل');
      }

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header

        const val = (row.getCell(2).text || row.getCell(1).text || '').trim();
        const cleaned = val.replace(/^[\d٠-٩]+[\s\.\-\)\:]+/, '').trim();

        if (cleaned.length >= 4 && !cleaned.includes('الاسم') && !cleaned.includes('شعبة')) {
          const words = cleaned.split(/\s+/).filter(w => w.length > 0);
          if (words.length >= 2) {
            parsedEmployees.push({
              fullName: cleaned,
              firstName: words[0] || '',
              secondName: words[1] || '',
              thirdName: words[2] || '',
              fourthName: words[3] || '',
              surname: words.length > 4 ? words.slice(4).join(' ') : '',
              jobStatus: (row.getCell(3).text || 'ملاك').includes('عقد') ? 'عقد' : 'ملاك',
              jobTitle: (row.getCell(4).text || '').trim(),
              department: (row.getCell(5).text || 'شعبة زراعة الشرقاط').trim(),
              phone: (row.getCell(6).text || '').trim()
            });
          }
        }
      });
    }

    if (parsedEmployees.length === 0) {
      throw new Error('لم يتم العثور على أي أسماء صالحة في الملف المرفق.');
    }

    const added = await batchAddCloudEmployees(parsedEmployees);
    resultDiv.className = 'custom-alert alert-success';
    resultDiv.innerHTML = `<i class="fa-solid fa-circle-check"></i> تم استيراد ${parsedEmployees.length} اسماً من ملف ${isWord ? 'Word' : 'Excel'}، وإضافة ${added} اسماً جديداً إلى سحابة النظام بنجاح.`;
    showToast(`تمت إضافة ${added} أسماء جديدة للسحابة`, 'success');
    await loadManagerDashboard();
  } catch (err) {
    resultDiv.className = 'custom-alert alert-danger';
    resultDiv.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> ${err.message || 'خطأ في معالجة الملف'}`;
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
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري الحذف والإفراغ السحابي...`;

  try {
    const deletedCount = await clearAllCloudEmployees();
    closeModal('wipeDataModal');
    showToast(`تم إفراغ وحذف كافة السجلات (${deletedCount} سجل) من السحابة بنجاح!`, 'success');
    await loadManagerDashboard();
  } catch (err) {
    showToast('فشل في عملية إفراغ السحابة: ' + err.message, 'danger');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

// Add/Edit Employee Manually
function openAddEmployeeModal() {
  document.getElementById('employeeEditForm').reset();
  document.getElementById('editEmpId').value = '';
  document.getElementById('employeeEditModalTitle').textContent = 'إضافة موظف جديد للسحابة';
  openModal('employeeEditModal');
}

async function openEditEmployeeModal(empId) {
  let emp = state.employeesList.find(e => e.id === empId);
  if (!emp) return;

  // Preload subcollection attachments if needed
  if (emp.hasSubcollectionAttachments || (!emp.idCardFront && emp.isCompleted)) {
    try {
      if (typeof getCloudEmployeeAttachments === 'function' && isFirebaseReady) {
        const sub = await getCloudEmployeeAttachments(emp.id);
        if (sub && Object.keys(sub).length > 0) {
          Object.assign(emp, sub);
        }
      }
    } catch (e) {}
  }

  document.getElementById('editEmpId').value = emp.id;
  document.getElementById('editFirstName').value = emp.firstName || '';
  document.getElementById('editSecondName').value = emp.secondName || '';
  document.getElementById('editThirdName').value = emp.thirdName || '';
  document.getElementById('editFourthName').value = emp.fourthName || '';
  document.getElementById('editSurname').value = emp.surname || '';
  document.getElementById('editFullName').value = emp.fullName || '';
  document.getElementById('editMotherName').value = emp.motherName || '';
  document.getElementById('editUnifiedId').value = emp.unifiedId || '';
  document.getElementById('editFamilyNumber').value = emp.familyNumber || '';
  document.getElementById('editBloodType').value = emp.bloodType || '';
  document.getElementById('editPhone').value = emp.phone || '';
  document.getElementById('editJobStatus').value = emp.jobStatus || 'ملاك';
  document.getElementById('editDepartment').value = emp.department || 'شعبة زراعة الشرقاط';
  document.getElementById('editJobTitle').value = emp.jobTitle || '';
  document.getElementById('editPersonalPin').value = emp.personalPin || '';
  document.getElementById('editCanEdit').value = emp.canEdit !== false ? 'true' : 'false';
  document.getElementById('editMaxEditsAllowed').value = emp.maxEditsAllowed !== undefined ? emp.maxEditsAllowed : 99;

  document.getElementById('employeeEditModalTitle').textContent = `تعديل كافة بيانات ومستمسكات: ${emp.fullName || 'الموظف'}`;

  // Populate 8 photo slots
  const photoKeys = [
    'personalPhoto', 'medicalPhoto',
    'empCardFront', 'empCardBack',
    'idCardFront', 'idCardBack',
    'residenceCardFront', 'residenceCardBack'
  ];

  let uploadedCount = 0;
  photoKeys.forEach(k => {
    const fileInput = document.getElementById(`mgrFile_${k}`);
    const cameraInput = document.getElementById(`mgrCamera_${k}`);
    const delInput = document.getElementById(`mgrDeleted_${k}`);
    const previewImg = document.getElementById(`mgrPreview_${k}`);
    const emptyEl = document.getElementById(`mgrEmpty_${k}`);
    const badgeEl = document.getElementById(`mgrStatus_${k}`);

    if (fileInput) fileInput.value = '';
    if (cameraInput) cameraInput.value = '';
    if (delInput) delInput.value = 'false';

    const photoUrl = emp[k];
    if (photoUrl && photoUrl !== 'subcollection') {
      uploadedCount++;
      if (previewImg) {
        previewImg.src = photoUrl;
        previewImg.style.display = 'block';
      }
      if (emptyEl) emptyEl.style.display = 'none';
      if (badgeEl) {
        badgeEl.className = 'manager-photo-status-badge uploaded';
        badgeEl.textContent = 'مرفوع سابقاً';
      }
    } else {
      if (previewImg) {
        previewImg.src = '';
        previewImg.style.display = 'none';
      }
      if (emptyEl) emptyEl.style.display = 'flex';
      if (badgeEl) {
        badgeEl.className = 'manager-photo-status-badge missing';
        badgeEl.textContent = 'غير مرفوع بعد';
      }
    }
  });

  const docsBadge = document.getElementById('managerEditDocsBadge');
  if (docsBadge) docsBadge.textContent = `${uploadedCount} من أصل 8 مرفوعة`;

  openModal('employeeEditModal');
}

function syncEditFullName() {
  const f = (document.getElementById('editFirstName').value || '').trim();
  const s = (document.getElementById('editSecondName').value || '').trim();
  const t = (document.getElementById('editThirdName').value || '').trim();
  const fo = (document.getElementById('editFourthName').value || '').trim();
  const sur = (document.getElementById('editSurname').value || '').trim();
  document.getElementById('editFullName').value = [f, s, t, fo, sur].filter(Boolean).join(' ');
}

function generateManagerPin() {
  const pin = String(Math.floor(1000 + Math.random() * 9000));
  document.getElementById('editPersonalPin').value = pin;
  showToast(`تم توليد رمز سري جديد: ${pin}`, 'info');
}

function generateFormPin() {
  const pin = String(Math.floor(1000 + Math.random() * 9000));
  const el = document.getElementById('formPersonalPin');
  if (el) el.value = pin;
  showToast(`تم توليد رمز سري لحسابك: ${pin} (احفظه جيداً)`, 'success');
}

function handleManagerPhotoSelected(input, photoKey) {
  if (input.files && input.files[0]) {
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      const previewImg = document.getElementById(`mgrPreview_${photoKey}`);
      if (previewImg) {
        previewImg.src = e.target.result;
        previewImg.style.display = 'block';
      }
      const emptyEl = document.getElementById(`mgrEmpty_${photoKey}`);
      if (emptyEl) emptyEl.style.display = 'none';
      const badgeEl = document.getElementById(`mgrStatus_${photoKey}`);
      if (badgeEl) {
        badgeEl.className = 'manager-photo-status-badge changed';
        badgeEl.textContent = 'تم اختيار صورة جديدة';
      }
      const delInput = document.getElementById(`mgrDeleted_${photoKey}`);
      if (delInput) delInput.value = 'false';
    };
    reader.readAsDataURL(file);
  }
}

function openCameraForManager(photoKey) {
  state.cameraTarget = `managerEdit_${photoKey}`;
  const titles = {
    personalPhoto: 'التقاط الصورة الشخصية الحديثة',
    medicalPhoto: 'التقاط تقرير الفحص الطبي',
    empCardFront: 'التقاط هوية الدائرة (الوجه الأمامي)',
    empCardBack: 'التقاط هوية الدائرة (الوجه الخلفي)',
    idCardFront: 'التقاط البطاقة الوطنية (الوجه الأمامي)',
    idCardBack: 'التقاط البطاقة الوطنية (الوجه الخلفي)',
    residenceCardFront: 'التقاط بطاقة السكن (الوجه الأمامي)',
    residenceCardBack: 'التقاط بطاقة السكن (الوجه الخلفي)'
  };
  document.getElementById('cameraModalTitle').textContent = titles[photoKey] || 'التقاط صورة بالكاميرا';
  document.getElementById('cameraVideo').style.display = 'block';
  document.getElementById('cameraSnapshotPreview').style.display = 'none';
  document.getElementById('btnShutter').style.display = 'flex';
  document.getElementById('btnConfirmSnapshot').style.display = 'none';
  document.getElementById('btnRetakeSnapshot').style.display = 'none';
  openModal('cameraModal');
  startCameraStream();
}

function clearManagerPhoto(photoKey) {
  const fileInput = document.getElementById(`mgrFile_${photoKey}`);
  if (fileInput) fileInput.value = '';
  const cameraInput = document.getElementById(`mgrCamera_${photoKey}`);
  if (cameraInput) cameraInput.value = '';
  const delInput = document.getElementById(`mgrDeleted_${photoKey}`);
  if (delInput) delInput.value = 'true';

  const previewImg = document.getElementById(`mgrPreview_${photoKey}`);
  if (previewImg) {
    previewImg.src = '';
    previewImg.style.display = 'none';
  }
  const emptyEl = document.getElementById(`mgrEmpty_${photoKey}`);
  if (emptyEl) emptyEl.style.display = 'flex';
  const badgeEl = document.getElementById(`mgrStatus_${photoKey}`);
  if (badgeEl) {
    badgeEl.className = 'manager-photo-status-badge missing';
    badgeEl.textContent = 'تم الحذف (معلق للحفظ)';
  }
}

function previewManagerPhoto(photoKey) {
  const previewImg = document.getElementById(`mgrPreview_${photoKey}`);
  if (previewImg && previewImg.src && previewImg.style.display !== 'none') {
    window.open(previewImg.src, '_blank');
  }
}

function togglePasswordVisibility(inputId, btnEl) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    btnEl.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
  } else {
    input.type = 'password';
    btnEl.innerHTML = '<i class="fa-solid fa-eye"></i>';
  }
}

async function handleSaveEmployeeManual(event) {
  event.preventDefault();
  const empId = document.getElementById('editEmpId').value;
  const submitBtn = document.getElementById('btnSaveManagerEdit');
  const originalHtml = submitBtn ? submitBtn.innerHTML : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري حفظ وتحديث كافة البيانات والمستمسكات...`;
  }

  try {
    const firstName = (document.getElementById('editFirstName').value || '').trim();
    const secondName = (document.getElementById('editSecondName').value || '').trim();
    const thirdName = (document.getElementById('editThirdName').value || '').trim();
    const fourthName = (document.getElementById('editFourthName').value || '').trim();
    const surname = (document.getElementById('editSurname').value || '').trim();
    const fullName = (document.getElementById('editFullName').value || '').trim() || [firstName, secondName, thirdName, fourthName, surname].filter(Boolean).join(' ');
    const motherName = (document.getElementById('editMotherName').value || '').trim();
    const unifiedId = (document.getElementById('editUnifiedId').value || '').trim();
    const familyNumber = (document.getElementById('editFamilyNumber').value || '').trim();
    const bloodType = document.getElementById('editBloodType').value;
    const phone = (document.getElementById('editPhone').value || '').trim();
    const jobStatus = document.getElementById('editJobStatus').value;
    const department = (document.getElementById('editDepartment').value || 'شعبة زراعة الشرقاط').trim();
    const jobTitle = (document.getElementById('editJobTitle').value || '').trim();
    const personalPin = (document.getElementById('editPersonalPin').value || '').trim();
    const canEdit = document.getElementById('editCanEdit').value === 'true';
    const maxEditsAllowed = Number(document.getElementById('editMaxEditsAllowed').value || 99);

    const photoKeys = [
      'personalPhoto', 'medicalPhoto',
      'empCardFront', 'empCardBack',
      'idCardFront', 'idCardBack',
      'residenceCardFront', 'residenceCardBack'
    ];

    // Find local employee reference
    let emp = state.employeesList.find(e => e.id === empId);

    // Process each photo: check for new file, camera snap, or deletion
    const updatedPhotos = {};
    const photoUploadTasks = photoKeys.map(async (k) => {
      const fileInput = document.getElementById(`mgrFile_${k}`);
      const cameraInput = document.getElementById(`mgrCamera_${k}`);
      const delInput = document.getElementById(`mgrDeleted_${k}`);

      const file = fileInput && fileInput.files && fileInput.files[0];
      const cameraData = cameraInput ? cameraInput.value : '';
      const isDeleted = delInput && delInput.value === 'true';

      if (file || cameraData) {
        const source = file || cameraData;
        const compressedUrl = await uploadImageToStorage(source, k);
        return { key: k, url: compressedUrl, action: 'update' };
      } else if (isDeleted) {
        return { key: k, url: '', action: 'delete' };
      }
      return null;
    });

    const photoResults = await Promise.all(photoUploadTasks);
    photoResults.forEach(res => {
      if (res) {
        updatedPhotos[res.key] = res.url;
      }
    });

    // Prepare updated document payload
    const updatedFields = {
      firstName,
      secondName,
      thirdName,
      fourthName,
      surname,
      fullName,
      motherName,
      familyNumber,
      unifiedId,
      bloodType,
      phone,
      jobStatus,
      department,
      jobTitle,
      personalPin,
      canEdit,
      maxEditsAllowed,
      lastUpdatedAt: new Date().toISOString()
    };

    // If photos were changed, also update subcollection and main doc
    if (Object.keys(updatedPhotos).length > 0) {
      if (typeof saveCloudEmployeeAttachments === 'function' && isFirebaseReady) {
        await saveCloudEmployeeAttachments(empId, updatedPhotos);
      }
      Object.assign(updatedFields, updatedPhotos);
    }

    if (empId && db && isFirebaseReady) {
      await db.collection(COLLECTIONS.EMPLOYEES).doc(empId).set(updatedFields, { merge: true });
      if (typeof invalidateEmployeesCache === 'function') invalidateEmployeesCache();
    }

    // Also update server backend if running
    try {
      await fetch(`/api/manager/employee/${empId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedFields)
      });
    } catch (e) {}

    // Update in-memory state
    if (emp) {
      Object.assign(emp, updatedFields);
    }
    if (state.currentEmployee && state.currentEmployee.id === empId) {
      Object.assign(state.currentEmployee, updatedFields);
    }

    closeModal('employeeEditModal');
    showToast('🎉 تم حفظ وتحديث كافة بيانات ومستمسكات الموظف بنجاح!', 'success');
    await loadManagerDashboard();
  } catch (err) {
    showToast('فشل في حفظ التعديلات: ' + err.message, 'danger');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalHtml;
    }
  }
}

async function deleteEmployee(empId, name) {
  if (!confirm(`هل أنت متأكد من حذف الموظف: "${name}" من السحابة؟`)) return;

  try {
    if (db) {
      await db.collection(COLLECTIONS.EMPLOYEES).doc(empId).delete();
      showToast('تم حذف الموظف من السحابة بنجاح', 'success');
      await loadManagerDashboard();
    }
  } catch (err) {
    showToast('فشل في عملية الحذف', 'danger');
  }
}

// Settings Modal
async function openSettingsModal() {
  try {
    const settings = await getCloudSettings();
    document.getElementById('settingAdminUsername').value = settings.adminUsername || 'admin';
    document.getElementById('settingAdminPassword').value = '';
    document.getElementById('settingEmployeeCode').value = settings.employeeGeneralCode || '1234';
    document.getElementById('settingSupportPhone').value = settings.supportPhone || '07706656968';
    document.getElementById('settingStoragePath').value = 'Google Cloud Firestore';
    openModal('settingsModal');
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

  const payload = { adminUsername, employeeGeneralCode, supportPhone };
  if (adminPassword) payload.adminPassword = adminPassword;

  try {
    await saveCloudSettings(payload);
    state.cloudSettings = await getCloudSettings();
    closeModal('settingsModal');
    showToast('تم تحديث الإعدادات السحابية بنجاح', 'success');
  } catch (err) {
    showToast('فشل في حفظ الإعدادات السحابية', 'danger');
  }
}

// ==================== EMPLOYEE FLOW ====================
function checkEmployeePinStatus() {
  const nameInput = document.getElementById('employeeCheckName');
  const codeLabel = document.getElementById('employeeCodeLabel');
  const codeInput = document.getElementById('employeeCheckCode');
  const codeHelper = document.getElementById('employeeCodeHelper');
  if (!nameInput || !codeLabel) return;

  const nameVal = nameInput.value.trim();
  const searchWords = normalizeArabicText(nameVal).split(/\s+/).filter(Boolean);

  // Require at least 3 words (First, Father, Grandfather) before identifying employee
  if (searchWords.length < 3) {
    codeLabel.innerHTML = '<span class="required-star">*</span>الرمز السري / رمز الدخول';
    if (codeInput) codeInput.placeholder = 'أدخل الرمز السري الشخصي أو رمز الدخول العام';
    if (codeHelper) codeHelper.innerHTML = 'الرمز السري المعتمد للمتابعة (يرجى كتابة الاسم الثلاثي أولاً)';
    return;
  }

  const searchNorm = searchWords.join(' ');
  const emp = state.employeesList.find(e => {
    const dbWords = normalizeArabicText(e.fullName).split(/\s+/).filter(Boolean);
    const dbPartsWords = normalizeArabicText(`${e.firstName || ''} ${e.secondName || ''} ${e.thirdName || ''}`).split(/\s+/).filter(Boolean);

    // 1. Exact match with full name in DB
    const dbNormFull = dbWords.join(' ');
    if (dbNormFull === searchNorm) return true;

    // 2. Exact match with 3 parts (first, second, third)
    const dbNorm3Parts = dbPartsWords.slice(0, 3).join(' ');
    const search3Parts = searchWords.slice(0, 3).join(' ');
    if (dbNorm3Parts.length > 0 && dbNorm3Parts === search3Parts) return true;

    // 3. If DB has 4 or 5 names, and search has first 3 names matching DB first 3 names
    if (dbWords.length >= 3 && searchWords.length === 3) {
      if (dbWords[0] === searchWords[0] && dbWords[1] === searchWords[1] && dbWords[2] === searchWords[2]) {
        return true;
      }
    }

    // 4. If search has 4 words and DB starts with them
    if (dbWords.length >= searchWords.length) {
      return searchWords.every((w, idx) => w === dbWords[idx]);
    }

    return false;
  });

  if (emp && emp.personalPin) {
    codeLabel.innerHTML = '<span class="required-star">*</span>الرمز السري الشخصي الخاص بك (PIN)';
    if (codeInput) codeInput.placeholder = 'أدخل رمزك السري الشخصي (4 - 6 أرقام)';
    if (codeHelper) codeHelper.innerHTML = '<i class="fa-solid fa-shield-halved" style="color: var(--sage-700);"></i> تم التعرف على الموظف: هذا الحساب مؤمن برمزك السري الخاص (لا يمكن الدخول بالرمز العام)';
  } else if (emp && !emp.personalPin) {
    codeLabel.innerHTML = '<span class="required-star">*</span>الرمز السري / رمز الدخول';
    if (codeInput) codeInput.placeholder = 'أدخل رمز الدخول العام أو رمزاً سرياً جديداً (4 - 6 أرقام)';
    if (codeHelper) codeHelper.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles" style="color: #059669;"></i> تم التعرف على اسمك! أدخل رمز الدخول العام أو أي 4-6 أرقام لتعيينها كرمزك السري الخاص والدخول فوراً.';
  } else {
    codeLabel.innerHTML = '<span class="required-star">*</span>الرمز السري / رمز الدخول';
    if (codeInput) codeInput.placeholder = 'أدخل الرمز السري الشخصي أو رمز الدخول العام';
    if (codeHelper) codeHelper.innerHTML = 'الرمز السري المعتمد للمتابعة';
  }
}

function populateEmployeeQuickSelect() {
  const select = document.getElementById('employeeCheckSelect');
  if (!select) return;
  const emps = state.employeesList || [];
  const currentVal = select.value;
  select.innerHTML = '<option value="">-- اضغط هنا لاختيار اسمك من قائمة الموظفين --</option>';

  const sorted = [...emps].sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', 'ar'));
  sorted.forEach(emp => {
    const opt = document.createElement('option');
    opt.value = emp.id;
    opt.textContent = `${emp.fullName} (${emp.jobTitle || 'موظف'})`;
    select.appendChild(opt);
  });

  if (currentVal) select.value = currentVal;
}

function handleSelectEmployeeQuick(empId) {
  if (!empId) return;
  const emp = (state.employeesList || []).find(e => e.id === empId);
  if (!emp) return;

  const nameInput = document.getElementById('employeeCheckName');
  if (nameInput) {
    nameInput.value = emp.fullName;
  }
  const suggestions = document.getElementById('employeeNameSuggestions');
  if (suggestions) {
    suggestions.style.display = 'none';
    suggestions.innerHTML = '';
  }

  checkEmployeePinStatus();

  const codeInput = document.getElementById('employeeCheckCode');
  if (codeInput) {
    codeInput.focus();
  }
}

function handleEmployeeNameInput(val) {
  checkEmployeePinStatus();
  const box = document.getElementById('employeeNameSuggestions');
  if (!box) return;

  const clean = String(val || '').trim();
  if (clean.length < 1) {
    box.style.display = 'none';
    box.innerHTML = '';
    return;
  }

  const norm = normalizeArabicText(clean);
  const matches = (state.employeesList || []).filter(e => {
    const fullNorm = normalizeArabicText(e.fullName || '');
    return fullNorm.includes(norm) || (e.fullName || '').includes(clean);
  }).slice(0, 8);

  if (matches.length === 0) {
    box.style.display = 'none';
    box.innerHTML = '';
    return;
  }

  box.innerHTML = matches.map(emp => `
    <div class="autocomplete-item" onclick="selectSuggestedEmployee('${emp.id}')">
      <div>
        <div class="autocomplete-name"><i class="fa-solid fa-user" style="color: var(--sage-700); margin-left: 0.35rem;"></i>${emp.fullName}</div>
        <div class="autocomplete-meta">${emp.jobTitle || 'موظف'} | ${emp.jobStatus || 'ملاك'}</div>
      </div>
      <span class="status-badge ${emp.isCompleted ? 'completed' : 'pending'}" style="font-size: 0.72rem;">
        ${emp.isCompleted ? 'مسجل' : 'بانتظار الإكمال'}
      </span>
    </div>
  `).join('');

  box.style.display = 'block';
}

function selectSuggestedEmployee(empId) {
  handleSelectEmployeeQuick(empId);
}

function startNewEmployeeDirectly() {
  closeModal('employeeVerifyModal');
  const tempName = (document.getElementById('employeeCheckName') ? document.getElementById('employeeCheckName').value : '').trim();
  const words = tempName.split(/\s+/).filter(Boolean);

  const newEmp = {
    id: 'emp-' + Date.now() + '-' + Math.floor(1000 + Math.random() * 9000),
    fullName: tempName || 'موظف جديد',
    firstName: words[0] || '',
    secondName: words[1] || '',
    thirdName: words[2] || '',
    fourthName: words[3] || '',
    surname: words[4] || '',
    department: 'شعبة زراعة الشرقاط',
    jobStatus: 'ملاك',
    isCompleted: false,
    personalPin: '1234'
  };

  ['formFirstName', 'formSecondName', 'formThirdName'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.removeAttribute('readonly');
      el.style.background = '#ffffff';
    }
  });

  state.currentEmployee = newEmp;
  populateEmployeeForm(newEmp, false);
  showView('employeeFormView');
  showToast('أهلاً بك! يمكنك الآن ملء استمارتك ورفع مستمسكاتك واعتمادها فوراً.', 'info');
}

async function handleEmployeeVerify(event) {
  event.preventDefault();
  const fullName = document.getElementById('employeeCheckName').value.trim();
  const accessCode = document.getElementById('employeeCheckCode').value.trim();
  const errorEl = document.getElementById('employeeVerifyError');

  errorEl.style.display = 'none';

  if (!fullName) {
    errorEl.textContent = 'يرجى إدخال اسم الموظف أو اختياره من القائمة';
    errorEl.style.display = 'flex';
    return;
  }

  try {
    const settings = state.cloudSettings || (await getCloudSettings());
    const validGeneralCode = String(settings.employeeGeneralCode || '1234').trim();

    // 1. Search in local state.employeesList
    let employee = (state.employeesList || []).find(e => {
      const dbNorm = normalizeArabicText(e.fullName || '');
      const sNorm = normalizeArabicText(fullName);
      return dbNorm === sNorm || dbNorm.includes(sNorm) || sNorm.includes(dbNorm);
    });

    // 2. Search via Cloud
    if (!employee) {
      employee = await findCloudEmployeeByName(fullName);
    }

    // 3. Search via Local Server API
    if (!employee) {
      try {
        const res = await fetch('/api/auth/employee-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullName, accessCode })
        });
        const data = await res.json();
        if (data.success && data.employee) {
          employee = data.employee;
        }
      } catch(e) {}
    }

    if (!employee) {
      errorEl.textContent = 'عذراً، هذا الاسم غير مدرج ضمن قائمة موظفي شعبة زراعة الشرقاط. يرجى التأكد من كتابة الاسم الثلاثي بدقة أو مراجعة الإدارة.';
      errorEl.style.display = 'flex';
      return;
    }

    // Refresh PIN from Firestore if connected to ensure latest value
    if (isFirebaseReady && db && employee.id) {
      try {
        const freshDoc = await db.collection(COLLECTIONS.EMPLOYEES).doc(employee.id).get();
        if (freshDoc.exists) {
          const freshData = freshDoc.data();
          if (freshData.personalPin !== undefined) {
            employee.personalPin = freshData.personalPin;
            const lIdx = (state.employeesList || []).findIndex(e => e.id === employee.id);
            if (lIdx !== -1) state.employeesList[lIdx].personalPin = freshData.personalPin;
          }
        }
      } catch (e) {}
    }

    state.currentEmployee = employee;

    // PIN check: If employee has a personal PIN, the general code is STRICTLY BLOCKED!
    const cleanCode = String(accessCode).trim();
    const hasPersonalPin = !!(employee.personalPin && String(employee.personalPin).trim() !== '');
    const isGeneralCode = (cleanCode === '1234' || cleanCode === validGeneralCode);

    let isCodeValid = false;
    if (hasPersonalPin) {
      // ONLY employee's personal PIN is valid
      isCodeValid = (cleanCode === String(employee.personalPin).trim());
    } else {
      // First time or PIN reset: accept general code OR setting a new 4-6 digit PIN
      isCodeValid = (isGeneralCode || /^[0-9]{4,6}$/.test(cleanCode));
    }

    if (!isCodeValid) {
      if (hasPersonalPin) {
        errorEl.innerHTML = '<i class="fa-solid fa-lock"></i> الرمز السري الشخصي غير صحيح. هذا الحساب مؤمن برمز سري خاص لحماية الاستمارة.';
      } else {
        errorEl.innerHTML = '<i class="fa-solid fa-lock"></i> رمز الدخول غير صحيح. يرجى إدخال رمز الدخول العام أو رمز سري جديد (من 4 إلى 6 أرقام).';
      }
      errorEl.style.display = 'flex';
      return;
    }

    // If first time and user entered a custom personal PIN (not general code), save it
    if (!hasPersonalPin && !isGeneralCode && /^[0-9]{4,6}$/.test(cleanCode)) {
      employee.personalPin = cleanCode;
      if (typeof setEmployeePersonalPin === 'function' && isFirebaseReady) {
        await setEmployeePersonalPin(employee.id, cleanCode);
      }
      try {
        await fetch(`/api/manager/employee/${employee.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ personalPin: cleanCode })
        });
      } catch(e) {}
    }

    closeModal('employeeVerifyModal');
    showToast(`مرحباً بك، الموظف: ${employee.fullName}`, 'success');

    if (employee.isCompleted) {
      await renderEmployeePortal(employee);
      showView('employeeCompletedView');
    } else {
      populateEmployeeForm(employee, false);
      showView('employeeFormView');
    }
  } catch (err) {
    errorEl.textContent = 'حدث خطأ في التحقق، يرجى المحاولة ثانيةً: ' + err.message;
    errorEl.style.display = 'flex';
  }
}

function openSetPersonalPinModal(employee) {
  document.getElementById('setPersonalPinForm').reset();
  document.getElementById('pinEmployeeId').value = employee.id;
  document.getElementById('pinEmployeeNameDisplay').textContent = `أهلاً بك، الموظف: ${employee.fullName}`;
  const err = document.getElementById('setPinError');
  if (err) err.style.display = 'none';
  openModal('setPersonalPinModal');
}

function openChangeMyPinModal() {
  if (!state.currentEmployee) return;
  openSetPersonalPinModal(state.currentEmployee);
}

async function handleSavePersonalPin(event) {
  event.preventDefault();
  const empId = document.getElementById('pinEmployeeId').value;
  const pin = document.getElementById('newPersonalPin').value.trim();
  const confirmPin = document.getElementById('confirmPersonalPin').value.trim();
  const errorEl = document.getElementById('setPinError');

  errorEl.style.display = 'none';

  if (!/^[0-9]{4,6}$/.test(pin)) {
    errorEl.textContent = 'يجب أن يتكون الرمز السري من 4 إلى 6 أرقام فقط (أرقام إنجليزية).';
    errorEl.style.display = 'flex';
    return;
  }

  if (pin !== confirmPin) {
    errorEl.textContent = 'الرمز السري وتأكيد الرمز غير متطابقين، يرجى كتابتهما بدقة.';
    errorEl.style.display = 'flex';
    return;
  }

  const btn = document.getElementById('btnSavePin');
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري حفظ الرمز وتأمين الحساب...`;

  try {
    if (typeof setEmployeePersonalPin === 'function' && isFirebaseReady) {
      await setEmployeePersonalPin(empId, pin);
    }

    try {
      await fetch(`/api/manager/employee/${empId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personalPin: pin })
      });
    } catch(e) {}

    // Update local state
    if (state.currentEmployee && state.currentEmployee.id === empId) {
      state.currentEmployee.personalPin = pin;
    }
    const localEmp = (state.employeesList || []).find(e => e.id === empId);
    if (localEmp) localEmp.personalPin = pin;

    const pinField = document.getElementById('formPersonalPin');
    if (pinField) pinField.value = pin;

    closeModal('setPersonalPinModal');
    showToast('🎉 تم تعيين رمزك السري وتأمين حسابك بنجاح! احتفظ برمزك السري للدخول به دائماً.', 'success');

    if (state.currentEmployee && state.currentEmployee.isCompleted) {
      await renderEmployeePortal(state.currentEmployee);
      showView('employeeCompletedView');
    } else if (state.currentEmployee) {
      populateEmployeeForm(state.currentEmployee, false);
      showView('employeeFormView');
    }
  } catch (err) {
    errorEl.textContent = 'فشل في حفظ الرمز السري: ' + err.message;
    errorEl.style.display = 'flex';
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

async function handleManagerResetPin(empId, empName) {
  if (!confirm(`هل أنت متأكد من تصفير الرمز السري للموظف: "${empName}"؟\nسيتمكن الموظف من الدخول بالرمز العام وتعيين رمز سري جديد.`)) {
    return;
  }

  try {
    if (typeof resetEmployeePersonalPin === 'function' && isFirebaseReady) {
      await resetEmployeePersonalPin(empId);
    }
    try {
      await fetch(`/api/manager/employee/${empId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personalPin: '' })
      });
    } catch(e) {}

    const emp = (state.employeesList || []).find(e => e.id === empId);
    if (emp) emp.personalPin = '';
    if (state.currentEmployee && state.currentEmployee.id === empId) {
      state.currentEmployee.personalPin = '';
    }

    showToast(`تم تصفير الرمز السري للموظف (${empName}) بنجاح`, 'success');
    closeModal('reviewEmployeeModal');
    await loadManagerDashboard();
  } catch (err) {
    showToast('فشل في تصفير الرمز السري: ' + err.message, 'danger');
  }
}

// ==================== EMPLOYEE PORTAL VIEW LOGIC ====================

const PHOTO_LABELS = {
  personalPhoto: 'الصورة الشخصية الحديثة',
  medicalPhoto: 'تقرير الفحص الطبي',
  empCardFront: 'هوية الموظف (الوجه الأمامي)',
  empCardBack: 'هوية الموظف (الوجه الخلفي)',
  idCardFront: 'البطاقة الموحدة (الوجه الأمامي)',
  idCardBack: 'البطاقة الموحدة (الوجه الخلفي)',
  residenceCardFront: 'بطاقة السكن (الوجه الأمامي)',
  residenceCardBack: 'بطاقة السكن (الوجه الخلفي)'
};

/**
 * Renders the Employee Follow-up Portal screen with full stats, documents status, and edit controls
 */
async function renderEmployeePortal(employee) {
  state.currentEmployee = employee;

  // Preload subcollection attachments if needed
  if (employee.hasSubcollectionAttachments || (!employee.idCardFront && employee.isCompleted)) {
    try {
      if (typeof getCloudEmployeeAttachments === 'function' && isFirebaseReady) {
        const sub = await getCloudEmployeeAttachments(employee.id);
        if (sub && Object.keys(sub).length > 0) {
          Object.assign(employee, sub);
        }
      }
    } catch (e) {}
  }

  // 1. Header meta
  const nameEl = document.getElementById('completedEmpName');
  if (nameEl) nameEl.textContent = employee.fullName || 'أهلاً بك، الموظف الكريم';

  const jobTitleEl = document.getElementById('portalEmpJobTitle');
  if (jobTitleEl) jobTitleEl.textContent = `العنوان الوظيفي: ${employee.jobTitle || 'موظف في الشعبة'}`;

  const jobBadgeEl = document.getElementById('portalJobBadge');
  if (jobBadgeEl) jobBadgeEl.textContent = employee.jobStatus || 'ملاك';

  const avatarBox = document.getElementById('portalUserAvatar');
  if (avatarBox) {
    avatarBox.innerHTML = employee.personalPhoto
      ? `<img src="${employee.personalPhoto}" alt="${employee.fullName}">`
      : `<i class="fa-solid fa-user"></i>`;
  }

  // 2. Count uploaded & missing documents
  const photoKeys = Object.keys(PHOTO_LABELS);
  const uploaded = photoKeys.filter(k => !!employee[k] && employee[k] !== 'subcollection');
  const missing = photoKeys.filter(k => !employee[k] || employee[k] === 'subcollection');

  const countEl = document.getElementById('portalDocCount');
  if (countEl) countEl.textContent = `${uploaded.length} / 8`;

  const percent = Math.round((uploaded.length / 8) * 100);
  const progressFill = document.getElementById('portalDocProgressFill');
  if (progressFill) progressFill.style.width = `${percent}%`;

  const statusText = document.getElementById('portalDocStatusText');
  if (statusText) {
    statusText.textContent = uploaded.length === 8
      ? '🎉 كافة المستمسكات مكتملة بنسبة 100%'
      : `مكتمل بنسبة ${percent}% (${missing.length} مستمسكات متبقية)`;
    statusText.style.color = uploaded.length === 8 ? 'var(--success)' : 'var(--warning-dark)';
  }

  // 3. Missing documents alert
  const alertEl = document.getElementById('portalMissingDocsAlert');
  const listTextEl = document.getElementById('portalMissingDocsListText');
  if (alertEl && listTextEl) {
    if (missing.length > 0) {
      const missingNames = missing.map(k => PHOTO_LABELS[k]).join('، ');
      listTextEl.textContent = `المستمسكات غير المرفوعة بعد: (${missingNames}). يرجى الضغط على زر التعديل أدناه لإرفاقها واعتماد إضبارتك.`;
      alertEl.style.display = 'flex';
    } else {
      alertEl.style.display = 'none';
    }
  }

  // 4. Permissions and Edit Attempts
  const canEdit = employee.canEdit !== false;
  const editCount = Number(employee.editCount || 0);
  const maxEdits = Number(employee.maxEditsAllowed || 3);
  const remainingEdits = Math.max(0, maxEdits - editCount);
  const isAllowed = canEdit && remainingEdits > 0;

  const editStatusVal = document.getElementById('portalEditStatusVal');
  const editRemainingText = document.getElementById('portalEditRemainingText');
  const editNote = document.getElementById('portalEditNote');
  const editIconWrap = document.getElementById('portalEditIconWrap');
  const btnEditForm = document.getElementById('btnOpenEmployeeEditForm');
  const lockedNotice = document.getElementById('portalLockedNoticeBox');

  if (isAllowed) {
    if (editStatusVal) {
      editStatusVal.textContent = 'مسموح بالتعديل';
      editStatusVal.style.color = 'var(--success)';
    }
    if (editRemainingText) {
      editRemainingText.textContent = `متبقي لديك ${remainingEdits} من أصل ${maxEdits} محاولات`;
    }
    if (editNote) {
      editNote.textContent = 'يمكنك فتح الاستمارة لمراجعة أو تعديل أي بيان وإرفاق أو استبدال المستمسكات';
    }
    if (editIconWrap) {
      editIconWrap.style.background = 'rgba(16, 185, 129, 0.12)';
      editIconWrap.style.color = 'var(--success)';
    }
    if (btnEditForm) btnEditForm.style.display = 'flex';
    if (lockedNotice) lockedNotice.style.display = 'none';
  } else {
    if (editStatusVal) {
      editStatusVal.textContent = 'التعديل مقفل';
      editStatusVal.style.color = 'var(--danger)';
    }
    if (editRemainingText) {
      editRemainingText.textContent = remainingEdits === 0 ? 'استنفدت كافة محاولات التعديل' : 'مقفل من قبل إدارة الشعبة';
    }
    if (editNote) {
      editNote.textContent = 'الاستمارة مقفلة، يرجى التواصل مع إدارة الشعبة لفتح صلاحية التعديل';
    }
    if (editIconWrap) {
      editIconWrap.style.background = 'rgba(239, 68, 68, 0.12)';
      editIconWrap.style.color = 'var(--danger)';
    }
    if (btnEditForm) btnEditForm.style.display = 'none';
    if (lockedNotice) {
      lockedNotice.style.display = 'block';
      const settings = state.cloudSettings || {};
      const phone = settings.supportWhatsapp || '9647706656968';
      const msg = `السلام عليكم، أرجو التفضل بفتح صلاحية تعديل استمارة الموظف: (${employee.fullName})`;
      const waBtn = document.getElementById('btnRequestEditWhatsApp');
      if (waBtn) waBtn.href = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    }
  }
}

async function openEmployeeEditMode() {
  if (!state.currentEmployee) return;

  const canEdit = state.currentEmployee.canEdit !== false;

  if (!canEdit) {
    showToast('عذراً، صلاحية التعديل مقفلة حالياً من الإدارة. يرجى التواصل مع الشعبة.', 'warning');
    return;
  }

  // Preload subcollection attachments if needed
  try {
    if (typeof getCloudEmployeeAttachments === 'function' && isFirebaseReady) {
      const sub = await getCloudEmployeeAttachments(state.currentEmployee.id);
      if (sub && Object.keys(sub).length > 0) {
        Object.assign(state.currentEmployee, sub);
      }
    }
  } catch (e) {}

  populateEmployeeForm(state.currentEmployee, true);
  showView('employeeFormView');
}

async function openMyEmployeeDossier() {
  if (!state.currentEmployee) return;
  await openReviewEmployeeModal(state.currentEmployee.id);
}

function logoutEmployee() {
  state.currentEmployee = null;
  showToast('تم تسجيل الخروج بنجاح', 'info');
  showView('homeView');
}

// ==================== EMPLOYEE FORM POPULATION & SUBMISSION ====================

function populateEmployeeForm(emp, isEditMode = false) {
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

  const pinField = document.getElementById('formPersonalPin');
  if (pinField) pinField.value = emp.personalPin || '';

  // Update submit button text
  const submitBtn = document.querySelector('#employeeDataForm button[type="submit"]');
  if (submitBtn) {
    submitBtn.innerHTML = isEditMode
      ? `<i class="fa-solid fa-cloud-arrow-up"></i> حفظ وتحديث البيانات والمرفقات`
      : `<i class="fa-solid fa-paper-plane"></i> حفظ وإرسال الاستمارة والمرفقات`;
  }

  // Previews & existing photos mapping
  const docToKeyMap = {
    personal: 'personalPhoto',
    medical: 'medicalPhoto',
    empCardFront: 'empCardFront',
    empCardBack: 'empCardBack',
    idCardFront: 'idCardFront',
    idCardBack: 'idCardBack',
    residenceCardFront: 'residenceCardFront',
    residenceCardBack: 'residenceCardBack'
  };

  Object.keys(ATTACHMENT_MAP).forEach(key => {
    const config = ATTACHMENT_MAP[key];
    const previewBox = document.getElementById(config.preview);
    const cameraInput = document.getElementById(config.input);
    const fileInput = document.getElementById(config.file);

    if (cameraInput) cameraInput.value = '';
    if (fileInput) fileInput.value = '';

    const photoKey = docToKeyMap[key];
    const existingUrl = emp[photoKey];

    if (previewBox) {
      const img = previewBox.querySelector('img');
      if (existingUrl && existingUrl !== 'subcollection') {
        if (img) img.src = existingUrl;
        previewBox.classList.add('active');
      } else {
        if (img) img.src = '';
        previewBox.classList.remove('active');
      }
    }
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

  const personalPin = (formData.get('personalPin') || (state.currentEmployee ? state.currentEmployee.personalPin : '') || '').trim();
  if (!personalPin || !/^[0-9]{4,6}$/.test(personalPin)) {
    showToast('يرجى إدخال رمز سري لحسابك يتكون من 4 إلى 6 أرقام (PIN)', 'warning');
    const pinEl = document.getElementById('formPersonalPin');
    if (pinEl) {
      pinEl.focus();
      pinEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return;
  }

  const submitBtn = form.querySelector('button[type="submit"]');
  const originalHtml = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري معالجة وضغط المستمسكات بالتوازي...`;

  try {
    const empId = formData.get('employeeId');

    const formValues = {
      firstName: formData.get('firstName'),
      secondName: formData.get('secondName'),
      thirdName: formData.get('thirdName'),
      fourthName: formData.get('fourthName'),
      surname: formData.get('surname'),
      motherName: formData.get('motherName'),
      familyNumber: formData.get('familyNumber'),
      unifiedId: formData.get('unifiedId'),
      bloodType: formData.get('bloodType'),
      phone: formData.get('phone'),
      jobStatus: formData.get('jobStatus'),
      department: formData.get('department'),
      position: formData.get('position'),
      jobTitle: formData.get('jobTitle'),
      personalPin: personalPin
    };

    // Gather attachment files and camera base64 data
    const attachments = {
      personalPhoto: {
        file: document.getElementById('inputPersonalFile').files[0],
        cameraData: document.getElementById('inputPersonalCamera').value
      },
      medicalPhoto: {
        file: document.getElementById('inputMedicalFile').files[0],
        cameraData: document.getElementById('inputMedicalCamera').value
      },
      empCardFront: {
        file: document.getElementById('inputEmpCardFrontFile').files[0],
        cameraData: document.getElementById('inputEmpCardFrontCamera').value
      },
      empCardBack: {
        file: document.getElementById('inputEmpCardBackFile').files[0],
        cameraData: document.getElementById('inputEmpCardBackCamera').value
      },
      idCardFront: {
        file: document.getElementById('inputIdCardFrontFile').files[0],
        cameraData: document.getElementById('inputIdCardFrontCamera').value
      },
      idCardBack: {
        file: document.getElementById('inputIdCardBackFile').files[0],
        cameraData: document.getElementById('inputIdCardBackCamera').value
      },
      residenceCardFront: {
        file: document.getElementById('inputResidenceCardFrontFile').files[0],
        cameraData: document.getElementById('inputResidenceCardFrontCamera').value
      },
      residenceCardBack: {
        file: document.getElementById('inputResidenceCardBackFile').files[0],
        cameraData: document.getElementById('inputResidenceCardBackCamera').value
      }
    };

    submitBtn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up fa-bounce"></i> جاري حفظ وإرسال البيانات والمستمسكات إلى السحابة...`;
    const saved = await submitCloudEmployee(empId, formValues, attachments);

    // Update in-memory state
    if (Array.isArray(state.employeesList)) {
      const idx = state.employeesList.findIndex(e => e.id === empId);
      if (idx !== -1) {
        state.employeesList[idx] = { ...state.employeesList[idx], ...saved };
      }
    }
    state.currentEmployee = saved;

    showToast('🎉 تم حفظ وإكمال البيانات والمرفقات في السحابة بنجاح!', 'success');
    await renderEmployeePortal(saved);
    showView('employeeCompletedView');
  } catch (err) {
    showToast('فشل في إرسال البيانات إلى السحابة: ' + err.message, 'danger');
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

  // Check if camera was opened by Manager for Single Photo Upload
  if (state.cameraTarget === 'managerUpload') {
    document.getElementById('mgrUploadCameraData').value = dataUrl;
    const fileInput = document.getElementById('mgrPhotoFileInput');
    if (fileInput) fileInput.value = '';
    const previewBox = document.getElementById('mgrPhotoPreviewContainer');
    if (previewBox) {
      document.getElementById('mgrPhotoPreviewImg').src = dataUrl;
      previewBox.style.display = 'block';
    }
    const statusHelper = document.getElementById('mgrPhotoStatusHelper');
    if (statusHelper) statusHelper.textContent = 'تم التقاط الصورة بالكاميرا بنجاح';
    const btnSave = document.getElementById('btnSaveManagerPhoto');
    if (btnSave) btnSave.disabled = false;

    showToast('تم التقاط الصورة، اضغط زر الحفظ لاعتمادها في الإضبارة', 'success');
    closeCameraModal();
    return;
  }

  // Check if camera was opened by Manager in Comprehensive Employee Edit Modal
  if (state.cameraTarget && state.cameraTarget.startsWith('managerEdit_')) {
    const photoKey = state.cameraTarget.replace('managerEdit_', '');
    const cameraInput = document.getElementById(`mgrCamera_${photoKey}`);
    if (cameraInput) cameraInput.value = dataUrl;
    const fileInput = document.getElementById(`mgrFile_${photoKey}`);
    if (fileInput) fileInput.value = '';
    const previewImg = document.getElementById(`mgrPreview_${photoKey}`);
    if (previewImg) {
      previewImg.src = dataUrl;
      previewImg.style.display = 'block';
    }
    const emptyEl = document.getElementById(`mgrEmpty_${photoKey}`);
    if (emptyEl) emptyEl.style.display = 'none';
    const badgeEl = document.getElementById(`mgrStatus_${photoKey}`);
    if (badgeEl) {
      badgeEl.className = 'manager-photo-status-badge changed';
      badgeEl.textContent = 'تم التقاط صورة بالكاميرا';
    }
    const delInput = document.getElementById(`mgrDeleted_${photoKey}`);
    if (delInput) delInput.value = 'false';

    showToast('تم التقاط الصورة بالكاميرا بنجاح', 'success');
    closeCameraModal();
    return;
  }

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
