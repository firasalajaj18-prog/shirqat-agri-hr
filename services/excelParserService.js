const ExcelJS = require('exceljs');
const fs = require('fs-extra');
const path = require('path');

// Normalizer for Arabic text matching and cleaning
function normalizeArabicText(text) {
  if (!text) return '';
  return String(text)
    .trim()
    .replace(/[أإآآ]/g, 'ا')
    .replace(/[ة]/g, 'ه')
    .replace(/[ى]/g, 'ي')
    .replace(/[\u064B-\u065F\u0670]/g, '') // remove tashkeel/diacritics
    .replace(/\s+/g, ' ');
}

/**
 * Service to parse employee records from uploaded Excel (.xlsx, .xls) files
 */
async function parseEmployeesFromExcel(filePath) {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      return { success: false, error: 'الملف لا يحتوي على أي صفحات عمل (Worksheets).' };
    }

    let headerRowIndex = -1;
    let colMap = {
      fullName: -1,
      firstName: -1,
      secondName: -1,
      thirdName: -1,
      fourthName: -1,
      surname: -1,
      jobStatus: -1,
      jobTitle: -1,
      department: -1,
      phone: -1
    };

    // Scan first 10 rows to detect headers
    for (let r = 1; r <= Math.min(10, worksheet.rowCount); r++) {
      const row = worksheet.getRow(r);
      let foundHeader = false;

      row.eachCell((cell, colNumber) => {
        const val = normalizeArabicText(cell.text || cell.value);

        if (val.includes('الاسم الرباعي') || val.includes('الاسم الكامل') || val.includes('اسم الموظف') || val === 'الاسم') {
          colMap.fullName = colNumber;
          foundHeader = true;
        } else if (val === 'الاسم الاول' || val === 'الاسم 1') {
          colMap.firstName = colNumber;
          foundHeader = true;
        } else if (val === 'الاسم الثاني' || val === 'اسم الاب') {
          colMap.secondName = colNumber;
          foundHeader = true;
        } else if (val === 'الاسم الثالث' || val === 'اسم الجد') {
          colMap.thirdName = colNumber;
          foundHeader = true;
        } else if (val === 'الاسم الرابع') {
          colMap.fourthName = colNumber;
          foundHeader = true;
        } else if (val.includes('اللقب') || val.includes('العشيره')) {
          colMap.surname = colNumber;
          foundHeader = true;
        } else if (val.includes('الصفه') || val.includes('نوع التعيين') || val.includes('الملاك')) {
          colMap.jobStatus = colNumber;
        } else if (val.includes('العنوان الوظيفي') || val.includes('الوظيفه') || val.includes('المهنه')) {
          colMap.jobTitle = colNumber;
        } else if (val.includes('الدائره') || val.includes('الشعبه') || val.includes('القسم')) {
          colMap.department = colNumber;
        } else if (val.includes('الهاتف') || val.includes('الموبايل') || val.includes('رقم الهاتف')) {
          colMap.phone = colNumber;
        }
      });

      if (foundHeader) {
        headerRowIndex = r;
        break;
      }
    }

    // If no explicit header row found, assume column 1 or column 2 has the names
    if (headerRowIndex === -1) {
      headerRowIndex = 0; // Start from row 1
      colMap.fullName = 1; // Default to first column
    }

    const employees = [];
    const seen = new Set();

    for (let r = headerRowIndex + 1; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r);
      let fullNameVal = '';
      let firstNameVal = '';
      let secondNameVal = '';
      let thirdNameVal = '';
      let fourthNameVal = '';
      let surnameVal = '';

      if (colMap.fullName > 0) {
        fullNameVal = (row.getCell(colMap.fullName).text || '').trim();
      }

      if (colMap.firstName > 0) firstNameVal = (row.getCell(colMap.firstName).text || '').trim();
      if (colMap.secondName > 0) secondNameVal = (row.getCell(colMap.secondName).text || '').trim();
      if (colMap.thirdName > 0) thirdNameVal = (row.getCell(colMap.thirdName).text || '').trim();
      if (colMap.fourthName > 0) fourthNameVal = (row.getCell(colMap.fourthName).text || '').trim();
      if (colMap.surname > 0) surnameVal = (row.getCell(colMap.surname).text || '').trim();

      // If separate columns exist, construct full name
      if (!fullNameVal && firstNameVal) {
        fullNameVal = [firstNameVal, secondNameVal, thirdNameVal, fourthNameVal, surnameVal].filter(Boolean).join(' ');
      }

      // Clean leading digits/bullets if present
      fullNameVal = fullNameVal.replace(/^[\d٠-٩]+[\s\.\-\)\:]+/, '').trim();
      fullNameVal = fullNameVal.replace(/^[\-\•\*\–\—]+\s*/, '').trim();

      if (!fullNameVal || fullNameVal.length < 4) continue;

      const norm = normalizeArabicText(fullNameVal);
      if (
        norm.includes('الاسم') ||
        norm.includes('الموظف') ||
        norm.includes('شعبة زراعة') ||
        norm.includes('قائمة') ||
        norm === 'ت'
      ) {
        continue;
      }

      const words = fullNameVal.split(/\s+/).filter(w => w.length > 0);
      if (words.length < 2) continue; // Need at least two name parts

      if (seen.has(norm)) continue;
      seen.add(norm);

      const jobStatus = colMap.jobStatus > 0 ? (row.getCell(colMap.jobStatus).text || '').trim() : 'ملاك';
      const jobTitle = colMap.jobTitle > 0 ? (row.getCell(colMap.jobTitle).text || '').trim() : '';
      const department = colMap.department > 0 ? (row.getCell(colMap.department).text || '').trim() : 'شعبة زراعة الشرقاط';
      const phone = colMap.phone > 0 ? (row.getCell(colMap.phone).text || '').trim() : '';

      employees.push({
        fullName: fullNameVal,
        firstName: firstNameVal || words[0] || '',
        secondName: secondNameVal || words[1] || '',
        thirdName: thirdNameVal || words[2] || '',
        fourthName: fourthNameVal || words[3] || '',
        surname: surnameVal || (words.length > 4 ? words.slice(4).join(' ') : ''),
        jobStatus: jobStatus.includes('عقد') ? 'عقد' : 'ملاك',
        jobTitle: jobTitle,
        department: department || 'شعبة زراعة الشرقاط',
        phone: phone
      });
    }

    return {
      success: true,
      count: employees.length,
      employees: employees
    };
  } catch (error) {
    console.error('Error parsing Excel file:', error);
    return {
      success: false,
      error: error.message,
      employees: []
    };
  }
}

/**
 * Generates an official Excel template for seeding names
 */
async function generateSampleExcelTemplate(outputPath) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'شعبة زراعة الشرقاط';
  const worksheet = workbook.addWorksheet('نموذج أسماء الموظفين', {
    views: [{ rightToLeft: true }]
  });

  worksheet.columns = [
    { header: 'ت', key: 'seq', width: 6 },
    { header: 'الاسم الرباعي واللقب', key: 'fullName', width: 32 },
    { header: 'الصفة الوظيفية (ملاك / عقد)', key: 'jobStatus', width: 22 },
    { header: 'العنوان الوظيفي', key: 'jobTitle', width: 24 },
    { header: 'الدائرة / الشعبة', key: 'department', width: 26 },
    { header: 'رقم الهاتف (اختياري)', key: 'phone', width: 20 }
  ];

  const headerRow = worksheet.getRow(1);
  headerRow.height = 30;
  headerRow.eachCell(cell => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF41674E' }
    };
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  // Add sample rows
  worksheet.addRow({
    seq: 1,
    fullName: 'أحمد علي حسن كاظم الجبوري',
    jobStatus: 'ملاك',
    jobTitle: 'مهندس زراعي',
    department: 'شعبة زراعة الشرقاط',
    phone: '07700000001'
  });

  worksheet.addRow({
    seq: 2,
    fullName: 'محمد عبد الله سالم حسين العبيدي',
    jobStatus: 'عقد',
    jobTitle: 'محاسب',
    department: 'شعبة زراعة الشرقاط',
    phone: '07700000002'
  });

  await fs.ensureDir(path.dirname(outputPath));
  await workbook.xlsx.writeFile(outputPath);
  return outputPath;
}

module.exports = {
  parseEmployeesFromExcel,
  generateSampleExcelTemplate
};
