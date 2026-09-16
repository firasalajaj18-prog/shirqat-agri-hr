/**
 * Firebase Cloud Integration Service
 * مشروع الموارد البشرية - شعبة زراعة الشرقاط
 */

const firebaseConfig = {
  apiKey: "AIzaSyAAOfT4TSrutRmdpZ00Sutar3TtIIPqSgs",
  authDomain: "shirqat-agri-hr.firebaseapp.com",
  projectId: "shirqat-agri-hr",
  storageBucket: "shirqat-agri-hr.firebasestorage.app",
  messagingSenderId: "812539358034",
  appId: "1:812539358034:web:2cedc004e3e330f819e88b"
};

// Initialize Firebase
let db = null;
let storage = null;
let isFirebaseReady = false;

try {
  if (typeof firebase !== 'undefined') {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    db = firebase.firestore();
    storage = firebase.storage();
    isFirebaseReady = true;
    console.log('✅ تم تهيئة سحابة Firebase بنجاح!');
  }
} catch (error) {
  console.warn('Firebase initialization notice:', error.message);
}

// Collections
const COLLECTIONS = {
  SETTINGS: 'settings',
  EMPLOYEES: 'employees'
};

/**
 * Normalizes Arabic string for matching with smart compound name handling
 */
function normalizeArabicText(text) {
  if (!text) return '';
  let s = String(text)
    .trim()
    .replace(/[أإآآ]/g, 'ا')
    .replace(/[ة]/g, 'ه')
    .replace(/[ى]/g, 'ي')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();

  // Normalize compound prefixes: 'عبد العزيز' -> 'عبدالعزيز', 'ابو بكر' -> 'ابوبكر'
  s = s.replace(/عبد\s+/g, 'عبد')
       .replace(/ابو\s+/g, 'ابو')
       .replace(/(نور|سيف|شمس|علاء|بهاء|ضياء|جمال|كمال|صلاح|جلال|حسام|عماد|سعد|تقي)\s+الدين/g, (m, p1) => p1 + 'الدين');

  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Loads system settings from Firestore or defaults
 */
async function getCloudSettings() {
  const defaults = {
    adminUsername: 'admin',
    adminPassword: '9999',
    employeeGeneralCode: '1234',
    supportPhone: '07706656968',
    supportWhatsapp: '9647706656968'
  };

  if (!isFirebaseReady || !db) return defaults;

  try {
    const docRef = db.collection(COLLECTIONS.SETTINGS).doc('general');
    const doc = await docRef.get();
    if (doc.exists) {
      return { ...defaults, ...doc.data() };
    } else {
      await docRef.set(defaults);
      return defaults;
    }
  } catch (err) {
    console.warn('Could not read cloud settings, using defaults:', err.message);
    return defaults;
  }
}

/**
 * Saves system settings to Firestore
 */
async function saveCloudSettings(settings) {
  if (!isFirebaseReady || !db) throw new Error('سحابة Firebase غير مهيأة');
  const docRef = db.collection(COLLECTIONS.SETTINGS).doc('general');
  await docRef.set(settings, { merge: true });
  return true;
}

// In-memory cache for ultra-fast UI response
let _cachedEmployees = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 60000; // 1-minute TTL

/**
 * Invalidate employees cache whenever data changes
 */
function invalidateEmployeesCache() {
  _cachedEmployees = null;
  _cacheTime = 0;
}

/**
 * Fetches all employees from Firestore with fast in-memory caching
 */
async function getAllCloudEmployees(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && _cachedEmployees && (now - _cacheTime < CACHE_TTL_MS)) {
    return _cachedEmployees;
  }

  let employees = [];

  if (isFirebaseReady && db) {
    try {
      const snapshot = await db.collection(COLLECTIONS.EMPLOYEES).get();
      snapshot.forEach(doc => {
        employees.push({ id: doc.id, ...doc.data() });
      });
    } catch (err) {
      console.warn('Notice reading from Firestore:', err.message);
    }
  }

  // Merge with local server API or static database.json to ensure all employees and PINs are completely available
  try {
    let localList = null;
    try {
      const res = await fetch('/api/employees');
      if (res.ok) {
        localList = await res.json();
      }
    } catch (e) {
      // Local server /api/employees not accessible
    }

    if (!localList || !Array.isArray(localList) || localList.length === 0) {
      try {
        const jsonRes = await fetch('./data/database.json');
        if (jsonRes.ok) {
          const jsonData = await jsonRes.json();
          if (jsonData && Array.isArray(jsonData.employees)) {
            localList = jsonData.employees;
          }
        }
      } catch (e) {
        // static database.json not accessible
      }
    }

    if (Array.isArray(localList) && localList.length > 0) {
      if (employees.length === 0) {
        employees = localList;
      } else {
        const existingIds = new Set(employees.map(e => e.id));
        const existingNames = new Set(employees.map(e => normalizeArabicText(e.fullName || '')));

        localList.forEach(locEmp => {
          const locNorm = normalizeArabicText(locEmp.fullName || '');
          if (!existingIds.has(locEmp.id) && !existingNames.has(locNorm)) {
            employees.push(locEmp);
          } else {
            const matched = employees.find(e => e.id === locEmp.id || (e.fullName && normalizeArabicText(e.fullName) === locNorm));
            if (matched) {
              if (!matched.fullName && locEmp.fullName) matched.fullName = locEmp.fullName;
              if (!matched.firstName && locEmp.firstName) matched.firstName = locEmp.firstName;
              if (!matched.secondName && locEmp.secondName) matched.secondName = locEmp.secondName;
              if (!matched.thirdName && locEmp.thirdName) matched.thirdName = locEmp.thirdName;
              if (!matched.fourthName && locEmp.fourthName) matched.fourthName = locEmp.fourthName;
              if (!matched.surname && locEmp.surname) matched.surname = locEmp.surname;
              if (!matched.personalPin && locEmp.personalPin) matched.personalPin = locEmp.personalPin;
              if (!matched.jobTitle && locEmp.jobTitle) matched.jobTitle = locEmp.jobTitle;
              if (!matched.jobStatus && locEmp.jobStatus) matched.jobStatus = locEmp.jobStatus;
              if (!matched.phone && locEmp.phone) matched.phone = locEmp.phone;
              if (!matched.motherName && locEmp.motherName) matched.motherName = locEmp.motherName;
              if (!matched.unifiedId && locEmp.unifiedId) matched.unifiedId = locEmp.unifiedId;
              if (!matched.familyNumber && locEmp.familyNumber) matched.familyNumber = locEmp.familyNumber;
              if (locEmp.isCompleted && !matched.isCompleted) matched.isCompleted = true;
            }
          }
        });

        // Seed unseeded employees to Firestore in background
        if (isFirebaseReady && db && employees.length > 0) {
          seedEmployeesToFirestoreInBackground(employees);
        }
      }
    }
  } catch (e) {
    console.warn('Notice reading local fallback data:', e.message);
  }

  if (employees.length > 0) {
    _cachedEmployees = employees;
    _cacheTime = now;
  }

  return employees;
}

// Background seeder to keep Firestore synced
let _isSeedingFirestore = false;
async function seedEmployeesToFirestoreInBackground(emps) {
  if (_isSeedingFirestore || !isFirebaseReady || !db) return;
  _isSeedingFirestore = true;
  try {
    const batchSize = 25;
    for (let i = 0; i < Math.min(emps.length, 100); i += batchSize) {
      const chunk = emps.slice(i, i + batchSize);
      const batch = db.batch();
      chunk.forEach(emp => {
        const ref = db.collection(COLLECTIONS.EMPLOYEES).doc(emp.id);
        batch.set(ref, emp, { merge: true });
      });
      await batch.commit();
    }
    console.log(`✅ تم مزامنة ${emps.length} موظفاً إلى السحابة بنجاح!`);
  } catch (e) {
    console.warn('Background seed notice:', e.message);
  } finally {
    _isSeedingFirestore = false;
  }
}

/**
 * Finds employee by Arabic name with resilient matching for compound names and 3+ parts
 */
async function findCloudEmployeeByName(fullName) {
  const employees = await getAllCloudEmployees();
  if (!fullName) return null;

  const rawNorm = String(fullName).trim()
    .replace(/[أإآآ]/g, 'ا')
    .replace(/[ة]/g, 'ه')
    .replace(/[ى]/g, 'ي')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();

  const searchNorm = normalizeArabicText(fullName);
  const searchWords = searchNorm.split(/\s+/).filter(Boolean);
  const rawSearchWords = rawNorm.split(/\s+/).filter(Boolean);

  if (searchWords.length < 2) {
    return null;
  }

  return employees.find(emp => {
    const dbRaw = String(emp.fullName || '').trim()
      .replace(/[أإآآ]/g, 'ا')
      .replace(/[ة]/g, 'ه')
      .replace(/[ى]/g, 'ي')
      .replace(/[\u064B-\u065F\u0670]/g, '')
      .replace(/\s+/g, ' ')
      .toLowerCase();

    const dbNorm = normalizeArabicText(emp.fullName);
    const dbWords = dbNorm.split(/\s+/).filter(Boolean);
    const dbRawWords = dbRaw.split(/\s+/).filter(Boolean);

    // 1. Exact full name match (raw or normalized)
    if (dbNorm === searchNorm || dbRaw === rawNorm || dbRaw === searchNorm || dbNorm === rawNorm) return true;

    // 2. Exact match on first 3 parts
    const db3 = dbWords.slice(0, 3).join(' ');
    const s3 = searchWords.slice(0, 3).join(' ');
    if (db3.length > 0 && s3.length > 0 && db3 === s3) return true;

    // 3. Exact match with raw words (compound preservation)
    const dbRaw3 = dbRawWords.slice(0, 3).join(' ');
    const sRaw3 = rawSearchWords.slice(0, 3).join(' ');
    if (dbRaw3.length > 0 && sRaw3.length > 0 && dbRaw3 === sRaw3) return true;

    // 4. First 3 words exact matching
    if (dbWords.length >= 3 && searchWords.length >= 3) {
      if (dbWords[0] === searchWords[0] && dbWords[1] === searchWords[1] && dbWords[2] === searchWords[2]) {
        return true;
      }
    }

    // 5. If search has 3 or 4 words and DB starts with them
    if (dbWords.length >= searchWords.length && searchWords.length >= 3) {
      const matchAll = searchWords.every((w, idx) => w === dbWords[idx]);
      if (matchAll) return true;
    }

    return false;
  });
}

/**
 * Compresses any image (File, Blob, or base64) to high-quality lightweight JPEG data URL
 * Guaranteed to stay within maxCharLength (~60KB Base64) to never exceed Firestore limits
 */
async function compressImageToDataUrl(fileOrDataUrl, maxDim = 900, quality = 0.65, maxCharLength = 80000) {
  if (!fileOrDataUrl) return '';
  return new Promise((resolve) => {
    let timer = setTimeout(() => {
      resolve('');
    }, 12000); // 12-second safety timeout

    const img = new Image();
    img.onload = () => {
      try {
        let width = img.width;
        let height = img.height;

        // Constrain both dimensions proportionally
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(width, 1);
        canvas.height = Math.max(height, 1);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        let dataUrl = canvas.toDataURL('image/jpeg', quality);

        // Adaptive re-compression loop: ensure size never exceeds maxCharLength
        let currentQuality = quality;
        let passes = 0;
        while (dataUrl.length > maxCharLength && passes < 3) {
          currentQuality = Math.max(0.40, currentQuality - 0.12);
          dataUrl = canvas.toDataURL('image/jpeg', currentQuality);
          passes++;
        }

        clearTimeout(timer);
        resolve(dataUrl);
      } catch (err) {
        clearTimeout(timer);
        console.warn('Canvas compression error:', err);
        resolve('');
      }
    };

    img.onerror = () => {
      clearTimeout(timer);
      resolve('');
    };

    if (typeof fileOrDataUrl === 'string') {
      img.src = fileOrDataUrl;
    } else if (fileOrDataUrl instanceof Blob || fileOrDataUrl instanceof File) {
      const reader = new FileReader();
      reader.onload = (e) => { img.src = e.target.result; };
      reader.onerror = () => {
        clearTimeout(timer);
        resolve('');
      };
      reader.readAsDataURL(fileOrDataUrl);
    } else {
      clearTimeout(timer);
      resolve('');
    }
  });
}

/**
 * Uploads an image (File or base64 data URL) and returns the lightweight URL/data
 */
async function uploadImageToStorage(fileOrDataUrl, key = '') {
  if (!fileOrDataUrl) return '';
  // Personal photo: max 450px, quality 0.70, max size ~30KB
  if (key === 'personalPhoto') {
    return await compressImageToDataUrl(fileOrDataUrl, 450, 0.70, 45000);
  }
  // Document cards: max 900px, quality 0.65, max size ~60KB
  return await compressImageToDataUrl(fileOrDataUrl, 900, 0.65, 80000);
}

/**
 * Saves employee full attachment photos in subcollection: employees/{empId}/attachments/photos
 */
async function saveCloudEmployeeAttachments(empId, attachmentsMap) {
  if (!isFirebaseReady || !db || !empId) return false;
  try {
    const docRef = db.collection(COLLECTIONS.EMPLOYEES).doc(empId).collection('attachments').doc('photos');
    await docRef.set({
      ...attachmentsMap,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    return true;
  } catch (err) {
    console.warn('Could not save attachments to subcollection:', err.message);
    return false;
  }
}

/**
 * Loads employee full attachment photos from subcollection: employees/{empId}/attachments/photos
 */
async function getCloudEmployeeAttachments(empId) {
  if (!isFirebaseReady || !db || !empId) return {};
  try {
    const docRef = db.collection(COLLECTIONS.EMPLOYEES).doc(empId).collection('attachments').doc('photos');
    const doc = await docRef.get();
    if (doc.exists) {
      return doc.data() || {};
    }
    return {};
  } catch (err) {
    console.warn('Could not read attachments subcollection:', err.message);
    return {};
  }
}

/**
 * Submits or updates completed employee profile in Firestore
 * Guarantees document size stays well under Firestore 1,048,576 byte limit
 */
async function submitCloudEmployee(empId, formData, attachments) {
  if (!isFirebaseReady || !db) throw new Error('السحابة غير متصلة');

  const empRef = db.collection(COLLECTIONS.EMPLOYEES).doc(empId);
  const doc = await empRef.get();
  const existing = doc.exists ? doc.data() : {};

  // Check subcollection for any existing attachments
  let existingSubAttachments = {};
  try {
    existingSubAttachments = await getCloudEmployeeAttachments(empId);
  } catch (e) {}

  // Upload and compress images in PARALLEL for ultra-fast processing
  const photoKeys = [
    'personalPhoto',
    'medicalPhoto',
    'empCardFront',
    'empCardBack',
    'idCardFront',
    'idCardBack',
    'residenceCardFront',
    'residenceCardBack'
  ];

  const compressTasks = photoKeys.map(async (key) => {
    const item = attachments[key];
    if (item && (item.file || item.cameraData)) {
      const source = item.file || item.cameraData;
      const url = await uploadImageToStorage(source, key);
      if (url) return { key, url };
    }
    // Retain existing if present
    if (existing[key] && existing[key] !== 'subcollection') {
      return { key, url: existing[key] };
    }
    if (existingSubAttachments[key]) {
      return { key, url: existingSubAttachments[key] };
    }
    return { key, url: '' };
  });

  const compressedResults = await Promise.all(compressTasks);
  const uploadedUrls = {};
  compressedResults.forEach(r => {
    uploadedUrls[r.key] = r.url;
  });

  // 1. Always save full photos into subcollection (independent 1MB storage)
  await saveCloudEmployeeAttachments(empId, uploadedUrls);

  // 2. Prepare main employee document payload with edit count & permissions
  const isPreviouslyCompleted = !!existing.isCompleted;
  const currentEditCount = Number(existing.editCount || 0);
  const newEditCount = isPreviouslyCompleted ? (currentEditCount + 1) : 0;
  const maxEdits = existing.maxEditsAllowed !== undefined ? Number(existing.maxEditsAllowed) : 3;
  const canEdit = existing.canEdit !== undefined ? existing.canEdit : true;

  const uploadedCount = photoKeys.filter(k => !!uploadedUrls[k]).length;

  const formPayload = {
    ...existing,
    firstName: formData.firstName || existing.firstName || '',
    secondName: formData.secondName || existing.secondName || '',
    thirdName: formData.thirdName || existing.thirdName || '',
    fourthName: (formData.fourthName || existing.fourthName || '').trim(),
    surname: (formData.surname || existing.surname || '').trim(),
    fullName: [
      formData.firstName || existing.firstName,
      formData.secondName || existing.secondName,
      formData.thirdName || existing.thirdName,
      formData.fourthName || existing.fourthName,
      formData.surname || existing.surname
    ].filter(Boolean).join(' '),
    motherName: (formData.motherName || existing.motherName || '').trim(),
    familyNumber: (formData.familyNumber || existing.familyNumber || '').trim(),
    unifiedId: (formData.unifiedId || existing.unifiedId || '').trim(),
    bloodType: formData.bloodType || existing.bloodType || '',
    phone: (formData.phone || existing.phone || '').trim(),
    jobStatus: formData.jobStatus || existing.jobStatus || 'ملاك',
    department: formData.department || existing.department || 'شعبة زراعة الشرقاط',
    position: (formData.position || existing.position || '').trim(),
    jobTitle: (formData.jobTitle || existing.jobTitle || '').trim(),
    personalPin: formData.personalPin ? String(formData.personalPin).trim() : (existing.personalPin || ''),
    isCompleted: true,
    completedAt: existing.completedAt || new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    editCount: newEditCount,
    maxEditsAllowed: maxEdits,
    canEdit: canEdit,
    photosUploadedCount: uploadedCount,
    // Store personal photo directly for instant avatar display
    personalPhoto: uploadedUrls.personalPhoto || existing.personalPhoto || '',
    // Document card flags (boolean) so table/dossier knows which exist without loading heavy images
    hasPhotos: {
      personalPhoto: !!uploadedUrls.personalPhoto,
      medicalPhoto: !!uploadedUrls.medicalPhoto,
      empCardFront: !!uploadedUrls.empCardFront,
      empCardBack: !!uploadedUrls.empCardBack,
      idCardFront: !!uploadedUrls.idCardFront,
      idCardBack: !!uploadedUrls.idCardBack,
      residenceCardFront: !!uploadedUrls.residenceCardFront,
      residenceCardBack: !!uploadedUrls.residenceCardBack
    },
    hasSubcollectionAttachments: true
  };

  // Calculate size to guarantee staying under 768KB
  let totalDocSize = JSON.stringify(formPayload).length;
  for (const k of photoKeys) {
    if (uploadedUrls[k]) totalDocSize += (k.length + uploadedUrls[k].length + 10);
  }

  const mainDocData = { ...formPayload };
  if (totalDocSize < 768000) {
    Object.assign(mainDocData, uploadedUrls);
  } else {
    mainDocData.personalPhoto = uploadedUrls.personalPhoto || '';
    for (const k of photoKeys) {
      if (k !== 'personalPhoto') {
        mainDocData[k] = uploadedUrls[k] ? 'subcollection' : '';
      }
    }
  }

  await empRef.set(mainDocData, { merge: true });
  invalidateEmployeesCache();
  return { id: empId, ...mainDocData, ...uploadedUrls };
}

/**
 * Batch adds employee names from parsed Excel file to Firestore
 */
async function batchAddCloudEmployees(employees) {
  if (!isFirebaseReady || !db) throw new Error('السحابة غير متصلة');

  const existing = await getAllCloudEmployees();
  const existingSet = new Set(existing.map(e => normalizeArabicText(e.fullName)));

  const batch = db.batch();
  let addedCount = 0;

  for (const emp of employees) {
    const norm = normalizeArabicText(emp.fullName);
    if (!existingSet.has(norm)) {
      existingSet.add(norm);
      const newDocRef = db.collection(COLLECTIONS.EMPLOYEES).doc();

      const newEmpData = {
        fullName: emp.fullName,
        firstName: emp.firstName || '',
        secondName: emp.secondName || '',
        thirdName: emp.thirdName || '',
        fourthName: emp.fourthName || '',
        surname: emp.surname || '',
        motherName: '',
        familyNumber: '',
        unifiedId: '',
        bloodType: '',
        phone: emp.phone || '',
        jobStatus: emp.jobStatus || 'ملاك',
        department: emp.department || 'شعبة زراعة الشرقاط',
        position: '',
        jobTitle: emp.jobTitle || '',
        isCompleted: false,
        personalPhoto: '',
        medicalPhoto: '',
        empCardFront: '',
        empCardBack: '',
        idCardFront: '',
        idCardBack: '',
        residenceCardFront: '',
        residenceCardBack: '',
        completedAt: null,
        createdAt: new Date().toISOString()
      };

      batch.set(newDocRef, newEmpData);
      addedCount++;
    }
  }

  if (addedCount > 0) {
    await batch.commit();
  }

  return addedCount;
}

/**
 * Seeds initial database.json data to Firestore if Firestore is currently empty
 */
async function seedInitialDataIfEmpty(initialEmployeesList) {
  if (!isFirebaseReady || !db || !Array.isArray(initialEmployeesList) || !initialEmployeesList.length) return 0;

  try {
    const snapshot = await db.collection(COLLECTIONS.EMPLOYEES).limit(1).get();
    if (!snapshot.empty) return 0; // Already has data

    console.log(`جاري مزامنة ${initialEmployeesList.length} سجلاً أولياً إلى سحابة Firestore...`);
    // Batch in chunks of 450 (Firestore limit is 500 per batch)
    const chunkSize = 400;
    let seeded = 0;

    for (let i = 0; i < initialEmployeesList.length; i += chunkSize) {
      const chunk = initialEmployeesList.slice(i, i + chunkSize);
      const batch = db.batch();

      for (const emp of chunk) {
        const id = emp.id || `emp-${Date.now()}-${Math.round(Math.random() * 10000)}`;
        const docRef = db.collection(COLLECTIONS.EMPLOYEES).doc(id);
        batch.set(docRef, emp);
        seeded++;
      }

      await batch.commit();
    }

    console.log(`✅ تمت مزامنة ${seeded} سجلاً إلى السحابة بنجاح!`);
    return seeded;
  } catch (err) {
    console.warn('Initial data seed notice:', err.message);
    return 0;
  }
}

/**
 * Wipes / resets all employees from Firestore
 */
async function clearAllCloudEmployees() {
  if (!isFirebaseReady || !db) throw new Error('السحابة غير متصلة');

  const snapshot = await db.collection(COLLECTIONS.EMPLOYEES).get();
  const batch = db.batch();
  let count = 0;

  snapshot.forEach(doc => {
    batch.delete(doc.ref);
    count++;
  });

  if (count > 0) {
    await batch.commit();
  }

  return count;
}

/**
 * Sets personal PIN for an employee
 */
async function setEmployeePersonalPin(empId, pin) {
  if (!isFirebaseReady || !db) throw new Error('السحابة غير متصلة');
  const empRef = db.collection(COLLECTIONS.EMPLOYEES).doc(empId);
  await empRef.set({ personalPin: String(pin).trim() }, { merge: true });
  invalidateEmployeesCache();
  return true;
}

/**
 * Resets personal PIN for an employee (Manager only)
 */
async function resetEmployeePersonalPin(empId) {
  if (!isFirebaseReady || !db) throw new Error('السحابة غير متصلة');
  const empRef = db.collection(COLLECTIONS.EMPLOYEES).doc(empId);
  await empRef.set({ personalPin: '' }, { merge: true });
  invalidateEmployeesCache();
  return true;
}

/**
 * Updates a single document photo for an employee (Manager or Employee)
 */
async function updateSingleEmployeePhoto(empId, photoKey, fileOrDataUrl) {
  if (!empId) throw new Error('معرف الموظف غير محدد');

  let localUrl = '';
  // 1. Dual-Save: Save to Local Server API first
  try {
    const fd = new FormData();
    fd.append('employeeId', empId);
    fd.append('photoKey', photoKey);
    if (fileOrDataUrl instanceof File) {
      fd.append('photoFile', fileOrDataUrl);
    } else if (typeof fileOrDataUrl === 'string' && fileOrDataUrl.startsWith('data:')) {
      fd.append('cameraData', fileOrDataUrl);
    }
    const res = await fetch('/api/employee/single-photo', { method: 'POST', body: fd });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.photoUrl) localUrl = data.photoUrl;
    }
  } catch (err) {
    console.warn('Notice saving photo to local server:', err.message);
  }

  // 2. Compress and Save to Firestore
  let compressedUrl = '';
  try {
    compressedUrl = await uploadImageToStorage(fileOrDataUrl, photoKey);
  } catch (e) {}

  const finalUrl = compressedUrl || localUrl;

  if (isFirebaseReady && db) {
    try {
      const empRef = db.collection(COLLECTIONS.EMPLOYEES).doc(empId);
      const doc = await empRef.get();
      const existing = doc.exists ? (doc.data() || {}) : {};

      if (compressedUrl) {
        await saveCloudEmployeeAttachments(empId, { [photoKey]: compressedUrl });
      }

      const updatePayload = {
        [photoKey]: finalUrl,
        lastUpdatedAt: new Date().toISOString()
      };

      if (photoKey === 'personalPhoto') {
        updatePayload.personalPhoto = finalUrl;
      }

      const existingHasPhotos = existing.hasPhotos || {};
      existingHasPhotos[photoKey] = !!finalUrl;
      updatePayload.hasPhotos = existingHasPhotos;

      await empRef.set(updatePayload, { merge: true });
    } catch (err) {
      console.warn('Notice saving photo to Firestore:', err.message);
    }
  }

  if (typeof invalidateEmployeesCache === 'function') invalidateEmployeesCache();

  return { success: true, url: finalUrl };
}

/**
 * Deletes / removes a single document photo for an employee (Manager only)
 */
async function deleteSingleEmployeePhoto(empId, photoKey) {
  if (!empId) throw new Error('معرف الموظف غير محدد');

  // 1. Clear in local server
  try {
    await fetch(`/api/manager/employee/${empId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [photoKey]: '' })
    });
  } catch (err) {
    console.warn('Notice deleting photo on local server:', err.message);
  }

  // 2. Clear in Firestore
  if (isFirebaseReady && db) {
    try {
      const empRef = db.collection(COLLECTIONS.EMPLOYEES).doc(empId);
      const doc = await empRef.get();
      const existing = doc.exists ? (doc.data() || {}) : {};

      await saveCloudEmployeeAttachments(empId, { [photoKey]: '' });

      const updatePayload = {
        [photoKey]: '',
        lastUpdatedAt: new Date().toISOString()
      };

      if (photoKey === 'personalPhoto') {
        updatePayload.personalPhoto = '';
      }

      const existingHasPhotos = existing.hasPhotos || {};
      existingHasPhotos[photoKey] = false;
      updatePayload.hasPhotos = existingHasPhotos;

      await empRef.set(updatePayload, { merge: true });
    } catch (err) {
      console.warn('Notice deleting photo on Firestore:', err.message);
    }
  }

  if (typeof invalidateEmployeesCache === 'function') invalidateEmployeesCache();
  return true;
}

/**
 * Toggles edit permission for an employee (Manager control)
 */
async function setEmployeeEditPermission(empId, canEdit) {
  if (!isFirebaseReady || !db || !empId) throw new Error('السحابة غير متصلة');
  const empRef = db.collection(COLLECTIONS.EMPLOYEES).doc(empId);
  await empRef.set({ canEdit: !!canEdit, lastUpdatedAt: new Date().toISOString() }, { merge: true });
  invalidateEmployeesCache();
  return true;
}

/**
 * Grants additional edit attempts to an employee (Manager control)
 */
async function grantEmployeeAdditionalEdits(empId, additionalCount = 3) {
  if (!isFirebaseReady || !db || !empId) throw new Error('السحابة غير متصلة');
  const empRef = db.collection(COLLECTIONS.EMPLOYEES).doc(empId);
  const doc = await empRef.get();
  const data = doc.data() || {};
  const currentMax = Number(data.maxEditsAllowed || 3);

  await empRef.set({
    maxEditsAllowed: currentMax + additionalCount,
    canEdit: true,
    lastUpdatedAt: new Date().toISOString()
  }, { merge: true });
  invalidateEmployeesCache();
  return true;
}


