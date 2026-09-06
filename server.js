const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const multer = require('multer');
const sharp = require('sharp');

const { parseEmployeesFromExcel, generateSampleExcelTemplate } = require('./services/excelParserService');
const {
  executeMasterSave,
  getStorageRoot,
  saveAsJpg,
  generateEmployeesExcelBuffer,
  generateEmployeesWordBuffer
} = require('./services/storageService');

const app = express();
const PORT = process.env.PORT || 3000;

// Directories
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const EXPORTS_DIR = path.join(__dirname, 'exports');

fs.ensureDirSync(DATA_DIR);
fs.ensureDirSync(UPLOADS_DIR);
fs.ensureDirSync(EXPORTS_DIR);

// Middleware
app.use(cors());
app.use(express.json({ limit: '60mb' }));
app.use(express.urlencoded({ extended: true, limit: '60mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  }
});
const upload = multer({ storage });

// Database helper functions
async function loadDb() {
  if (!(await fs.pathExists(DB_FILE))) {
    const initialDb = {
      settings: {
        adminUsername: 'admin',
        adminPassword: 'admin2024',
        employeeGeneralCode: '1234',
        supportPhone: '07706656968',
        supportWhatsapp: '9647706656968',
        storagePath: EXPORTS_DIR
      },
      employees: []
    };
    await fs.writeJson(DB_FILE, initialDb, { spaces: 2 });
    return initialDb;
  }
  const db = await fs.readJson(DB_FILE);
  // Ensure default storagePath does not require physical P:\
  if (!db.settings.storagePath || db.settings.storagePath.startsWith('P:\\')) {
    db.settings.storagePath = EXPORTS_DIR;
    await fs.writeJson(DB_FILE, db, { spaces: 2 });
  }
  return db;
}

async function saveDb(data) {
  await fs.writeJson(DB_FILE, data, { spaces: 2 });
}

// Arabic String Normalizer for resilient name matching
function normalizeArabic(text) {
  if (!text) return '';
  return String(text)
    .trim()
    .replace(/[أإآآ]/g, 'ا')
    .replace(/[ة]/g, 'ه')
    .replace(/[ى]/g, 'ي')
    .replace(/[\u064B-\u065F\u0670]/g, '') // remove tashkeel/diacritics
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

// Helper to save base64 or multer file as JPG
async function processImage(file, base64Data, prefix) {
  const filename = `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e6)}.jpg`;
  const targetPath = path.join(UPLOADS_DIR, filename);

  if (file) {
    await saveAsJpg(file.path, targetPath);
    if (file.path !== targetPath && (await fs.pathExists(file.path))) {
      await fs.remove(file.path).catch(() => {});
    }
    return `uploads/${filename}`;
  } else if (base64Data && base64Data.startsWith('data:image')) {
    const base64Image = base64Data.split(';base64,').pop();
    const buffer = Buffer.from(base64Image, 'base64');
    await saveAsJpg(buffer, targetPath);
    return `uploads/${filename}`;
  }
  return null;
}

// ======================== API ROUTES ========================

// 1. System Status
app.get('/api/status', async (req, res) => {
  try {
    const db = await loadDb();
    res.json({
      success: true,
      appName: 'موقع الموارد البشرية لشعبة زراعة الشرقاط',
      supportPhone: db.settings.supportPhone || '07706656968',
      supportWhatsapp: db.settings.supportWhatsapp || '9647706656968',
      storagePath: db.settings.storagePath,
      totalEmployees: db.employees.length,
      completedCount: db.employees.filter(e => e.isCompleted).length,
      pendingCount: db.employees.filter(e => !e.isCompleted).length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Manager Login
app.post('/api/auth/manager', async (req, res) => {
  try {
    const { username, password } = req.body;
    const db = await loadDb();

    if (
      username === db.settings.adminUsername &&
      password === db.settings.adminPassword
    ) {
      return res.json({
        success: true,
        message: 'تم تسجيل الدخول بنجاح كمدير للنظام',
        role: 'manager'
      });
    }

    return res.status(401).json({
      success: false,
      message: 'اسم المستخدم أو كلمة المرور غير صحيحة'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. Employee Lookup & Verification
app.post('/api/auth/employee-check', async (req, res) => {
  try {
    const { fullName, accessCode } = req.body;
    const db = await loadDb();

    if (!fullName || !fullName.trim()) {
      return res.status(400).json({
        success: false,
        error: 'EMPTY_NAME',
        message: 'يرجى كتابة الاسم الثلاثي'
      });
    }

    // Verify Access Code
    if (!accessCode || accessCode.trim() !== db.settings.employeeGeneralCode) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_CODE',
        message: 'رمز الدخول العام الخاص بالموظفين غير صحيح، يرجى التأكد من الرمز'
      });
    }

    const searchNormalized = normalizeArabic(fullName);

    // Search for employee in database
    const employee = db.employees.find(emp => {
      const dbNormFull = normalizeArabic(emp.fullName);
      const dbNormParts = normalizeArabic(`${emp.firstName} ${emp.secondName} ${emp.thirdName}`);
      return dbNormFull === searchNormalized || dbNormParts === searchNormalized || dbNormFull.includes(searchNormalized);
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'عذراً، هذا الاسم غير مدرج ضمن قائمة الموظفين المعتمدة في النظام. يرجى مراجعة إدارة شعبة زراعة الشرقاط أو التواصل مع رقم الدعم المعتمد.'
      });
    }

    if (employee.isCompleted) {
      return res.json({
        success: true,
        isCompleted: true,
        employee,
        supportPhone: db.settings.supportPhone,
        supportWhatsapp: db.settings.supportWhatsapp,
        message: 'تم إكمال البيانات الخاصة بك مسبقاً'
      });
    }

    return res.json({
      success: true,
      isCompleted: false,
      employee,
      message: 'يرجى إكمال البيانات والمرفقات المطلوبة'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. Employee Submit Profile Data (includes 2-sided attachments)
app.post(
  '/api/employee/submit',
  upload.fields([
    { name: 'personalPhotoFile', maxCount: 1 },
    { name: 'medicalPhotoFile', maxCount: 1 },
    { name: 'empCardFrontFile', maxCount: 1 },
    { name: 'empCardBackFile', maxCount: 1 },
    { name: 'idCardFrontFile', maxCount: 1 },
    { name: 'idCardBackFile', maxCount: 1 },
    { name: 'residenceCardFrontFile', maxCount: 1 },
    { name: 'residenceCardBackFile', maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const {
        employeeId,
        firstName,
        secondName,
        thirdName,
        fourthName,
        surname,
        motherName,
        familyNumber,
        unifiedId,
        bloodType,
        phone,
        jobStatus,
        department,
        position,
        jobTitle,
        personalPhotoCamera,
        medicalPhotoCamera,
        empCardFrontCamera,
        empCardBackCamera,
        idCardFrontCamera,
        idCardBackCamera,
        residenceCardFrontCamera,
        residenceCardBackCamera
      } = req.body;

      const db = await loadDb();
      const empIndex = db.employees.findIndex(e => e.id === employeeId);

      if (empIndex === -1) {
        return res.status(404).json({
          success: false,
          message: 'لم يتم العثور على سجل الموظف'
        });
      }

      const existingEmp = db.employees[empIndex];
      const files = req.files || {};

      // Process Personal Photo
      let personalPhotoPath = existingEmp.personalPhoto || '';
      const newPersonal = await processImage(files.personalPhotoFile ? files.personalPhotoFile[0] : null, personalPhotoCamera, `emp-${employeeId}-personal`);
      if (newPersonal) personalPhotoPath = newPersonal;

      // Process Medical Photo
      let medicalPhotoPath = existingEmp.medicalPhoto || '';
      const newMedical = await processImage(files.medicalPhotoFile ? files.medicalPhotoFile[0] : null, medicalPhotoCamera, `emp-${employeeId}-medical`);
      if (newMedical) medicalPhotoPath = newMedical;

      // Process Employee Card Front & Back
      let empCardFrontPath = existingEmp.empCardFront || '';
      const newEmpCardFront = await processImage(files.empCardFrontFile ? files.empCardFrontFile[0] : null, empCardFrontCamera, `emp-${employeeId}-empCardFront`);
      if (newEmpCardFront) empCardFrontPath = newEmpCardFront;

      let empCardBackPath = existingEmp.empCardBack || '';
      const newEmpCardBack = await processImage(files.empCardBackFile ? files.empCardBackFile[0] : null, empCardBackCamera, `emp-${employeeId}-empCardBack`);
      if (newEmpCardBack) empCardBackPath = newEmpCardBack;

      // Process Unified ID Card Front & Back
      let idCardFrontPath = existingEmp.idCardFront || '';
      const newIdCardFront = await processImage(files.idCardFrontFile ? files.idCardFrontFile[0] : null, idCardFrontCamera, `emp-${employeeId}-idCardFront`);
      if (newIdCardFront) idCardFrontPath = newIdCardFront;

      let idCardBackPath = existingEmp.idCardBack || '';
      const newIdCardBack = await processImage(files.idCardBackFile ? files.idCardBackFile[0] : null, idCardBackCamera, `emp-${employeeId}-idCardBack`);
      if (newIdCardBack) idCardBackPath = newIdCardBack;

      // Process Residence Card Front & Back
      let residenceCardFrontPath = existingEmp.residenceCardFront || '';
      const newResidenceCardFront = await processImage(files.residenceCardFrontFile ? files.residenceCardFrontFile[0] : null, residenceCardFrontCamera, `emp-${employeeId}-residenceCardFront`);
      if (newResidenceCardFront) residenceCardFrontPath = newResidenceCardFront;

      let residenceCardBackPath = existingEmp.residenceCardBack || '';
      const newResidenceCardBack = await processImage(files.residenceCardBackFile ? files.residenceCardBackFile[0] : null, residenceCardBackCamera, `emp-${employeeId}-residenceCardBack`);
      if (newResidenceCardBack) residenceCardBackPath = newResidenceCardBack;

      // Update Employee Object
      const updatedEmp = {
        ...existingEmp,
        firstName: firstName || existingEmp.firstName,
        secondName: secondName || existingEmp.secondName,
        thirdName: thirdName || existingEmp.thirdName,
        fourthName: fourthName ? fourthName.trim() : existingEmp.fourthName,
        surname: surname ? surname.trim() : existingEmp.surname,
        fullName: [
          firstName || existingEmp.firstName,
          secondName || existingEmp.secondName,
          thirdName || existingEmp.thirdName,
          fourthName ? fourthName.trim() : '',
          surname ? surname.trim() : ''
        ]
          .filter(Boolean)
          .join(' '),
        motherName: motherName ? motherName.trim() : existingEmp.motherName,
        familyNumber: familyNumber ? familyNumber.trim() : existingEmp.familyNumber,
        unifiedId: unifiedId ? unifiedId.trim() : existingEmp.unifiedId,
        bloodType: bloodType || existingEmp.bloodType,
        phone: phone ? phone.trim() : existingEmp.phone,
        jobStatus: jobStatus || existingEmp.jobStatus || 'ملاك',
        department: department || existingEmp.department || 'شعبة زراعة الشرقاط',
        position: position ? position.trim() : existingEmp.position,
        jobTitle: jobTitle ? jobTitle.trim() : existingEmp.jobTitle,
        personalPhoto: personalPhotoPath,
        medicalPhoto: medicalPhotoPath,
        empCardFront: empCardFrontPath,
        empCardBack: empCardBackPath,
        idCardFront: idCardFrontPath,
        idCardBack: idCardBackPath,
        residenceCardFront: residenceCardFrontPath,
        residenceCardBack: residenceCardBackPath,
        isCompleted: true,
        completedAt: new Date().toISOString()
      };

      db.employees[empIndex] = updatedEmp;
      await saveDb(db);

      res.json({
        success: true,
        message: 'تم حفظ وإكمال البيانات والمرفقات بنجاح في المنظومة',
        employee: updatedEmp
      });
    } catch (error) {
      console.error('Submit error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// 5. Manager: Upload Excel File to Seed Names (.xlsx, .xls)
app.post('/api/manager/upload-excel', upload.single('excelFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'يرجى اختيار ملف Excel (.xlsx أو .xls)' });
    }

    const parseResult = await parseEmployeesFromExcel(req.file.path);
    if (!parseResult.success) {
      return res.status(500).json({ success: false, error: parseResult.error });
    }

    const db = await loadDb();
    let addedCount = 0;

    for (const parsed of parseResult.employees) {
      const normName = normalizeArabic(parsed.fullName);
      const exists = db.employees.some(e => normalizeArabic(e.fullName) === normName);

      if (!exists) {
        db.employees.push({
          id: `emp-${Date.now()}-${Math.round(Math.random() * 10000)}`,
          fullName: parsed.fullName,
          firstName: parsed.firstName,
          secondName: parsed.secondName,
          thirdName: parsed.thirdName,
          fourthName: parsed.fourthName || '',
          surname: parsed.surname || '',
          motherName: '',
          familyNumber: '',
          unifiedId: '',
          bloodType: '',
          phone: parsed.phone || '',
          jobStatus: parsed.jobStatus || 'ملاك',
          department: parsed.department || 'شعبة زراعة الشرقاط',
          position: '',
          jobTitle: parsed.jobTitle || '',
          isCompleted: false,
          personalPhoto: '',
          medicalPhoto: '',
          empCardFront: '',
          empCardBack: '',
          idCardFront: '',
          idCardBack: '',
          residenceCardFront: '',
          residenceCardBack: '',
          completedAt: null
        });
        addedCount++;
      }
    }

    await saveDb(db);
    await fs.remove(req.file.path).catch(() => {});

    res.json({
      success: true,
      addedCount,
      totalExtracted: parseResult.count,
      totalEmployees: db.employees.length,
      message: `تم استخراج ${parseResult.count} اسماً من ملف الإكسل، وإضافة ${addedCount} اسماً جديداً إلى قاعدة البيانات بنجاح.`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 6. Download Sample Excel Template
app.get('/api/manager/template-excel', async (req, res) => {
  try {
    const templatePath = path.join(__dirname, 'uploads', 'نموذج_اسماء_الموظفين.xlsx');
    await generateSampleExcelTemplate(templatePath);
    res.download(templatePath, 'نموذج_اسماء_الموظفين_شعبة_زراعة_الشرقاط.xlsx');
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 7. Manager: Direct Download Excel File
app.get('/api/manager/export/excel', async (req, res) => {
  try {
    const db = await loadDb();
    const buffer = await generateEmployeesExcelBuffer(db.employees);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="بيانات_الموظفين_شعبة_زراعة_الشرقاط.xlsx"');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 8. Manager: Direct Download Word File
app.get('/api/manager/export/word', async (req, res) => {
  try {
    const db = await loadDb();
    const buffer = await generateEmployeesWordBuffer(db.employees);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="جدول_الموظفين_شعبة_زراعة_الشرقاط.docx"');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 9. Manager: Get All Employees (with Search & Filter)
app.get('/api/manager/employees', async (req, res) => {
  try {
    const { search, status, jobStatus } = req.query;
    const db = await loadDb();

    let filtered = db.employees;

    if (status === 'completed') {
      filtered = filtered.filter(e => e.isCompleted);
    } else if (status === 'pending') {
      filtered = filtered.filter(e => !e.isCompleted);
    }

    if (jobStatus) {
      filtered = filtered.filter(e => e.jobStatus === jobStatus);
    }

    if (search && search.trim()) {
      const q = normalizeArabic(search);
      filtered = filtered.filter(e => {
        return (
          normalizeArabic(e.fullName).includes(q) ||
          normalizeArabic(e.jobTitle || '').includes(q) ||
          (e.phone && e.phone.includes(q)) ||
          (e.unifiedId && e.unifiedId.includes(q))
        );
      });
    }

    res.json({
      success: true,
      total: db.employees.length,
      count: filtered.length,
      employees: filtered
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 10. Manager: Add Employee Manually
app.post('/api/manager/employee', async (req, res) => {
  try {
    const { fullName, jobStatus, department, jobTitle } = req.body;
    if (!fullName || !fullName.trim()) {
      return res.status(400).json({ success: false, message: 'الاسم مطلوب' });
    }

    const words = fullName.trim().split(/\s+/);
    const db = await loadDb();

    const newEmp = {
      id: `emp-${Date.now()}-${Math.round(Math.random() * 1000)}`,
      fullName: fullName.trim(),
      firstName: words[0] || '',
      secondName: words[1] || '',
      thirdName: words[2] || '',
      fourthName: words[3] || '',
      surname: words[4] || '',
      motherName: '',
      familyNumber: '',
      unifiedId: '',
      bloodType: '',
      phone: '',
      jobStatus: jobStatus || 'ملاك',
      department: department || 'شعبة زراعة الشرقاط',
      position: '',
      jobTitle: jobTitle || '',
      isCompleted: false,
      personalPhoto: '',
      medicalPhoto: '',
      empCardFront: '',
      empCardBack: '',
      idCardFront: '',
      idCardBack: '',
      residenceCardFront: '',
      residenceCardBack: '',
      completedAt: null
    };

    db.employees.unshift(newEmp);
    await saveDb(db);

    res.json({ success: true, employee: newEmp, message: 'تمت إضافة الموظف بنجاح' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 11. Manager: Update Employee Details
app.put('/api/manager/employee/:id', async (req, res) => {
  try {
    const db = await loadDb();
    const index = db.employees.findIndex(e => e.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
    }

    const current = db.employees[index];
    db.employees[index] = { ...current, ...req.body };
    await saveDb(db);

    res.json({ success: true, employee: db.employees[index], message: 'تم تعديل البيانات بنجاح' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 12. Manager: Delete Employee
app.delete('/api/manager/employee/:id', async (req, res) => {
  try {
    const db = await loadDb();
    const prevCount = db.employees.length;
    db.employees = db.employees.filter(e => e.id !== req.params.id);

    if (db.employees.length === prevCount) {
      return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
    }

    await saveDb(db);
    res.json({ success: true, message: 'تم حذف الموظف بنجاح' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 13. Manager: Wipe / Clear All Records ("حذف وإفراغ الموقع من البيانات")
app.post('/api/manager/clear-all', async (req, res) => {
  try {
    const db = await loadDb();
    const count = db.employees.length;

    db.employees = [];
    await saveDb(db);

    // Empty uploads directory files to save storage space
    try {
      const files = await fs.readdir(UPLOADS_DIR);
      for (const file of files) {
        await fs.remove(path.join(UPLOADS_DIR, file)).catch(() => {});
      }
    } catch (e) {
      console.warn('Notice emptying uploads:', e.message);
    }

    res.json({
      success: true,
      message: `تم إفراغ وحذف كافة السجلات (${count} سجل) والملفات المرفوعة بنجاح.`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 14. Master Save/Export Command ("إيعاز الحفظ والتصدير بمجلد مؤرخ")
app.post('/api/manager/save-all', async (req, res) => {
  try {
    const db = await loadDb();
    const result = await executeMasterSave(db, UPLOADS_DIR, db.settings.storagePath);

    res.json({
      success: true,
      message: `تم تنفيذ إيعاز الحفظ والتصدير بنجاح وحفظ السجلات في المجلد المؤرخ: ${result.folderName}`,
      details: result
    });
  } catch (error) {
    console.error('Master Save Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 15. Manager: Settings Read & Update
app.get('/api/settings', async (req, res) => {
  try {
    const db = await loadDb();
    res.json({ success: true, settings: db.settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/settings', async (req, res) => {
  try {
    const db = await loadDb();
    const { adminUsername, adminPassword, employeeGeneralCode, supportPhone, supportWhatsapp, storagePath } = req.body;

    if (adminUsername) db.settings.adminUsername = adminUsername.trim();
    if (adminPassword) db.settings.adminPassword = adminPassword.trim();
    if (employeeGeneralCode) db.settings.employeeGeneralCode = employeeGeneralCode.trim();
    if (supportPhone) db.settings.supportPhone = supportPhone.trim();
    if (supportWhatsapp) db.settings.supportWhatsapp = supportWhatsapp.trim();
    if (storagePath) db.settings.storagePath = storagePath.trim();

    await saveDb(db);
    res.json({ success: true, message: 'تم تحديث الإعدادات بنجاح', settings: db.settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Fallback route for SPA
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`🌾 منظومة الموارد البشرية لشعبة زراعة الشرقاط تعمل الآن!`);
  console.log(`🔗 الرابط المحلي: http://localhost:${PORT}`);
  console.log(`📁 مسار التصدير: ${EXPORTS_DIR}`);
  console.log(`====================================================`);
});
