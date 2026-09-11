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
 * Normalizes Arabic string for matching
 */
function normalizeArabicText(text) {
  if (!text) return '';
  return String(text)
    .trim()
    .replace(/[أإآآ]/g, 'ا')
    .replace(/[ة]/g, 'ه')
    .replace(/[ى]/g, 'ي')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Loads system settings from Firestore or defaults
 */
async function getCloudSettings() {
  const defaults = {
    adminUsername: 'admin',
    adminPassword: 'admin2024',
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

/**
 * Fetches all employees from Firestore
 */
async function getAllCloudEmployees() {
  if (!isFirebaseReady || !db) return [];

  try {
    const snapshot = await db.collection(COLLECTIONS.EMPLOYEES).get();
    const employees = [];
    snapshot.forEach(doc => {
      employees.push({ id: doc.id, ...doc.data() });
    });
    return employees;
  } catch (err) {
    console.error('Error getting employees from Firestore:', err);
    return [];
  }
}

/**
 * Finds employee by strict Arabic full 3-part name (requires at least 3 words)
 */
async function findCloudEmployeeByName(fullName) {
  const employees = await getAllCloudEmployees();
  if (!fullName) return null;

  const searchWords = normalizeArabicText(fullName).split(/\s+/).filter(Boolean);
  // Must provide at least 3 names (First, Father, Grandfather)
  if (searchWords.length < 3) {
    return null;
  }

  const searchNorm = searchWords.join(' ');

  return employees.find(emp => {
    const dbWords = normalizeArabicText(emp.fullName).split(/\s+/).filter(Boolean);
    const dbPartsWords = normalizeArabicText(`${emp.firstName || ''} ${emp.secondName || ''} ${emp.thirdName || ''}`).split(/\s+/).filter(Boolean);

    // 1. Exact match with full name in DB
    const dbNormFull = dbWords.join(' ');
    if (dbNormFull === searchNorm) return true;

    // 2. Exact match with 3 parts (first, second, third)
    const dbNorm3Parts = dbPartsWords.slice(0, 3).join(' ');
    const search3Parts = searchWords.slice(0, 3).join(' ');
    if (dbNorm3Parts.length > 0 && dbNorm3Parts === search3Parts) return true;

    // 3. If DB has 4 or 5 names, and search has first 3 names matching the DB first 3 names
    if (dbWords.length >= 3 && searchWords.length === 3) {
      if (dbWords[0] === searchWords[0] && dbWords[1] === searchWords[1] && dbWords[2] === searchWords[2]) {
        return true;
      }
    }

    // 4. If search has 4 words and DB starts with them
    if (dbWords.length >= searchWords.length) {
      const matchAll = searchWords.every((w, idx) => w === dbWords[idx]);
      if (matchAll) return true;
    }

    return false;
  });
}

/**
 * Compresses any image (File, Blob, or base64) to high-quality lightweight JPEG data URL
 */
async function compressImageToDataUrl(fileOrDataUrl, maxWidth = 1024, quality = 0.82) {
  if (!fileOrDataUrl) return '';
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve('');

    if (typeof fileOrDataUrl === 'string') {
      img.src = fileOrDataUrl;
    } else if (fileOrDataUrl instanceof Blob || fileOrDataUrl instanceof File) {
      const reader = new FileReader();
      reader.onload = (e) => { img.src = e.target.result; };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(fileOrDataUrl);
    } else {
      resolve('');
    }
  });
}

/**
 * Uploads an image (File or base64 data URL) and returns the lightweight URL/data
 */
async function uploadImageToStorage(fileOrDataUrl, pathName) {
  if (!fileOrDataUrl) return '';
  return await compressImageToDataUrl(fileOrDataUrl, 1024, 0.82);
}

/**
 * Submits or updates completed employee profile in Firestore
 */
async function submitCloudEmployee(empId, formData, attachments) {
  if (!isFirebaseReady || !db) throw new Error('السحابة غير متصلة');

  const empRef = db.collection(COLLECTIONS.EMPLOYEES).doc(empId);
  const doc = await empRef.get();
  const existing = doc.exists ? doc.data() : {};

  // Upload images to Cloud Storage
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

  const uploadedUrls = {};
  for (const key of photoKeys) {
    const item = attachments[key];
    if (item && (item.file || item.cameraData)) {
      const source = item.file || item.cameraData;
      const cloudPath = `employees/${empId}/${key}_${Date.now()}.jpg`;
      const url = await uploadImageToStorage(source, cloudPath);
      if (url) uploadedUrls[key] = url;
    } else if (existing[key]) {
      uploadedUrls[key] = existing[key];
    } else {
      uploadedUrls[key] = '';
    }
  }

  const updatedData = {
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
    ...uploadedUrls,
    isCompleted: true,
    completedAt: new Date().toISOString()
  };

  await empRef.set(updatedData, { merge: true });
  return { id: empId, ...updatedData };
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
  return true;
}

/**
 * Resets personal PIN for an employee (Manager only)
 */
async function resetEmployeePersonalPin(empId) {
  if (!isFirebaseReady || !db) throw new Error('السحابة غير متصلة');
  const empRef = db.collection(COLLECTIONS.EMPLOYEES).doc(empId);
  await empRef.set({ personalPin: '' }, { merge: true });
  return true;
}

