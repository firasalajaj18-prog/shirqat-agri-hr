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
    const validUser = settings.adminUsername || 'admin';
    const validPass = settings.adminPassword || 'admin2024';

    if (username === validUser && password === validPass) {
      state.isManagerLoggedIn = true;
      clearManagerLoginForm();
      closeModal('managerLoginModal');
      showToast('مرحباً بك، تم تسجيل دخول المدير السحابي بنجاح', 'success');
      showView('managerDashboardView');
      loadManagerDashboard();
    } else {
      errorEl.textContent = 'اسم المستخدم أو كلمة المرور غير صحيحة';
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
    state.employeesList = emps;
    renderStats(emps);
    renderEmployeesTable(emps);
  } catch (err) {
    showToast('خطأ في جلب بيانات الموظفين من السحابة', 'danger');
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
      <td style="font-weight: 800; color: var(--sage-700); text-align: center;">${index + 1}</td>
      <td style="font-weight: 800; color: var(--sage-900); white-space: nowrap;">
        <span style="cursor: pointer; color: var(--sage-800);" onclick="openReviewEmployeeModal('${emp.id}')" title="انقر لعرض إضبارة الموظف">${quadName}</span>
      </td>
      <td style="color: var(--sage-800);">${emp.motherName ? `<span style="font-weight: 700;">${emp.motherName}</span>` : '<span class="empty-val-badge">لم تُدخل</span>'}</td>
      <td>${jobBadge}</td>
      <td>${emp.jobTitle ? emp.jobTitle : '<span class="empty-val-badge">—</span>'}</td>
      <td style="direction: ltr; text-align: right; white-space: nowrap;">${emp.phone ? emp.phone : '<span class="empty-val-badge">—</span>'}</td>
      <td style="text-align: center;">${emp.bloodType ? `<span style="font-weight: 800; color: var(--danger);">${emp.bloodType}</span>` : '<span class="empty-val-badge">—</span>'}</td>
      <td style="font-family: monospace; font-weight: 700; white-space: nowrap;">${emp.unifiedId ? emp.unifiedId : '<span class="empty-val-badge">—</span>'}</td>
      <td style="font-family: monospace; font-weight: 700; white-space: nowrap;">${emp.familyNumber ? emp.familyNumber : '<span class="empty-val-badge">—</span>'}</td>
      <td style="text-align: center;">${photosBtnHtml}</td>
      <td style="text-align: center;">${statusBadge}</td>
      <td style="text-align: center;">
        <div style="display: inline-flex; gap: 0.35rem; align-items: center; justify-content: center;">
          <button class="table-action-btn view" title="مراجعة إضبارة الموظف والمستمسكات بوجهيها" onclick="openReviewEmployeeModal('${emp.id}')">
            <i class="fa-solid fa-eye"></i>
          </button>
          <button class="table-action-btn" title="تعديل الموظف" onclick="openEditEmployeeModal('${emp.id}')">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
          <button class="table-action-btn delete" title="حذف الموظف" onclick="deleteEmployee('${emp.id}', '${quadName.replace(/'/g, "\\'")}')">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ==================== EMPLOYEE DOSSIER & PHOTO REVIEW MODAL ====================
function openReviewEmployeeModal(empId) {
  const emp = state.employeesList.find(e => e.id === empId);
  if (!emp) return;

  const quadName = [
    emp.firstName || '',
    emp.secondName || '',
    emp.thirdName || '',
    emp.fourthName || '',
    emp.surname || ''
  ].filter(Boolean).join(' ') || emp.fullName;

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

  // Build photo cards
  const photoCardsHtml = photoDocs.map(doc => {
    const photoUrl = emp[doc.key];
    const cleanQuad = quadName.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const docTitleSafe = doc.title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    
    if (photoUrl) {
      return `
        <div class="dossier-photo-card">
          <div class="photo-card-head">
            <span><i class="fa-solid ${doc.icon}" style="color: var(--sage-700);"></i> ${doc.title}</span>
            <span class="status-badge completed" style="font-size: 0.72rem; padding: 0.2rem 0.5rem;"><i class="fa-solid fa-check"></i> متوفرة</span>
          </div>
          <div class="photo-thumb-container" onclick="openLightbox('${photoUrl}', '${docTitleSafe} - ${cleanQuad}')" title="انقر لتكبير وفحص الصورة">
            <img src="${photoUrl}" alt="${doc.title}" loading="lazy">
            <div class="photo-zoom-hint">
              <i class="fa-solid fa-magnifying-glass-plus"></i> تكبير وفحص
            </div>
          </div>
          <div class="photo-card-foot">
            <span style="font-size: 0.75rem; color: var(--text-secondary);">${doc.note}</span>
            <div style="display: flex; gap: 0.35rem;">
              <button type="button" class="btn btn-sm btn-secondary" onclick="openLightbox('${photoUrl}', '${docTitleSafe} - ${cleanQuad}')" title="تكبير الصورة">
                <i class="fa-solid fa-expand"></i>
              </button>
              <a href="${photoUrl}" download="${quadName.replace(/\s+/g, '_')}_${doc.key}.jpg" class="btn btn-sm btn-outline-success" title="تنزيل الصورة بجهازك">
                <i class="fa-solid fa-download"></i>
              </a>
            </div>
          </div>
        </div>
      `;
    } else {
      return `
        <div class="dossier-photo-card" style="opacity: 0.85;">
          <div class="photo-card-head" style="background: #f8fafc;">
            <span><i class="fa-solid ${doc.icon}" style="color: #94a3b8;"></i> ${doc.title}</span>
            <span class="status-badge pending" style="font-size: 0.72rem; padding: 0.2rem 0.5rem;"><i class="fa-solid fa-xmark"></i> لم تُرفع</span>
          </div>
          <div class="photo-thumb-container" style="background: #f8fafc; cursor: default;">
            <div class="photo-missing-placeholder">
              <i class="fa-solid fa-file-circle-xmark" style="font-size: 2.2rem; color: #cbd5e1;"></i>
              <span style="font-size: 0.85rem; font-weight: 700; color: #94a3b8;">لم يقم الموظف برفع هذه الوثيقة بعد</span>
            </div>
          </div>
          <div class="photo-card-foot" style="background: #f8fafc;">
            <span style="font-size: 0.75rem; color: var(--text-muted);">${doc.note}</span>
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
      <div>
        <span style="background: #ffffff; padding: 0.6rem 1.25rem; border-radius: var(--radius-md); border: 1.5px solid var(--sage-300); font-weight: 800; color: var(--sage-900); display: inline-flex; align-items: center; gap: 0.5rem; box-shadow: 0 2px 6px rgba(0,0,0,0.04);">
          <i class="fa-solid fa-images" style="color: var(--sage-600); font-size: 1.15rem;"></i>
          <span>المستمسكات: <strong style="color: ${uploadedCount === 8 ? 'var(--success)' : 'var(--sage-800)'}; font-size: 1.1rem;">${uploadedCount} / 8</strong></span>
        </span>
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

// Close lightbox & review modal with keyboard Escape
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeLightbox();
    closeModal('reviewEmployeeModal');
  }
});

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

    // 2. Add employee folders with their attachments
    const empRootFolder = mainFolder.folder('ملفات_الموظفين');

    const photoFields = [
      { key: 'personalPhoto', name: 'الصورة_الشخصية.jpg' },
      { key: 'medicalPhoto', name: 'الفحص_الطبي.jpg' },
      { key: 'empCardFront', name: 'هوية_الموظف_الوجه_الامامي.jpg' },
      { key: 'empCardBack', name: 'هوية_الموظف_الوجه_الخلفي.jpg' },
      { key: 'idCardFront', name: 'البطاقة_الموحدة_الوجه_الامامي.jpg' },
      { key: 'idCardBack', name: 'البطاقة_الموحدة_الوجه_الخلفي.jpg' },
      { key: 'residenceCardFront', name: 'بطاقة_السكن_الوجه_الامامي.jpg' },
      { key: 'residenceCardBack', name: 'بطاقة_السكن_الوجه_الخلفي.jpg' }
    ];

    let downloadedCount = 0;
    for (const emp of state.employeesList) {
      const folderNameClean = (emp.fullName || `موظف_${emp.id}`).replace(/[\\/:*?"<>|]/g, '_').trim();
      const singleEmpFolder = empRootFolder.folder(folderNameClean);

      for (const p of photoFields) {
        const url = emp[p.key];
        if (url) {
          try {
            if (url.startsWith('data:image')) {
              const base64Data = url.split(',')[1];
              singleEmpFolder.file(p.name, base64Data, { base64: true });
            } else {
              const fetchRes = await fetch(url);
              if (fetchRes.ok) {
                const blob = await fetchRes.blob();
                singleEmpFolder.file(p.name, blob);
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

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);
    const worksheet = workbook.worksheets[0];

    if (!worksheet) {
      throw new Error('الملف لا يحتوي على صفحات عمل');
    }

    const parsedEmployees = [];
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

    const added = await batchAddCloudEmployees(parsedEmployees);
    resultDiv.className = 'custom-alert alert-success';
    resultDiv.innerHTML = `<i class="fa-solid fa-circle-check"></i> تم استيراد ${parsedEmployees.length} اسماً وإضافة ${added} اسماً جديداً إلى سحابة النظام بنجاح.`;
    showToast(`تمت إضافة ${added} أسماء جديدة للسحابة`, 'success');
    await loadManagerDashboard();
  } catch (err) {
    resultDiv.className = 'custom-alert alert-danger';
    resultDiv.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> ${err.message || 'خطأ في معالجة ملف الإكسل'}`;
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
    const words = fullName.split(/\s+/);
    const empData = {
      fullName,
      firstName: words[0] || '',
      secondName: words[1] || '',
      thirdName: words[2] || '',
      fourthName: words[3] || '',
      surname: words.length > 4 ? words.slice(4).join(' ') : '',
      jobStatus,
      jobTitle,
      department
    };

    if (id && db) {
      await db.collection(COLLECTIONS.EMPLOYEES).doc(id).set(empData, { merge: true });
      showToast('تم تعديل بيانات الموظف بنجاح في السحابة', 'success');
    } else if (db) {
      await db.collection(COLLECTIONS.EMPLOYEES).add({
        ...empData,
        motherName: '',
        familyNumber: '',
        unifiedId: '',
        bloodType: '',
        phone: '',
        isCompleted: false,
        completedAt: null
      });
      showToast('تمت إضافة الموظف الجديد إلى السحابة بنجاح', 'success');
    }

    closeModal('employeeEditModal');
    await loadManagerDashboard();
  } catch (err) {
    showToast('فشل في حفظ البيانات: ' + err.message, 'danger');
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
async function handleEmployeeVerify(event) {
  event.preventDefault();
  const fullName = document.getElementById('employeeCheckName').value.trim();
  const accessCode = document.getElementById('employeeCheckCode').value.trim();
  const errorEl = document.getElementById('employeeVerifyError');

  errorEl.style.display = 'none';

  try {
    const settings = state.cloudSettings || (await getCloudSettings());
    const validCode = settings.employeeGeneralCode || '1234';

    if (accessCode !== validCode) {
      errorEl.textContent = 'رمز الدخول العام للموظفين غير صحيح، يرجى مراجعة إدارة الشعبة';
      errorEl.style.display = 'flex';
      return;
    }

    const employee = await findCloudEmployeeByName(fullName);

    if (!employee) {
      errorEl.textContent = 'عذراً، هذا الاسم غير مدرج ضمن قائمة موظفي شعبة زراعة الشرقاط. يرجى التواصل مع الدعم الفني أو مراجعة الإدارة.';
      errorEl.style.display = 'flex';
      return;
    }

    closeModal('employeeVerifyModal');
    state.currentEmployee = employee;

    if (employee.isCompleted) {
      document.getElementById('completedEmpName').textContent = `أهلاً بك، الموظف: ${employee.fullName}`;
      showView('employeeCompletedView');
    } else {
      populateEmployeeForm(employee);
      showView('employeeFormView');
    }
  } catch (err) {
    errorEl.textContent = 'تعذر التحقق السحابي، يرجى المحاولة ثانيةً';
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
  submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري رفع الصور والمستمسكات إلى السحابة...`;

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
      jobTitle: formData.get('jobTitle')
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

    const saved = await submitCloudEmployee(empId, formValues, attachments);

    showToast('تم حفظ وإكمال البيانات ورفع المستمسكات إلى السحابة بنجاح!', 'success');
    document.getElementById('completedEmpName').textContent = `أهلاً بك، الموظف: ${saved.fullName}`;
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
