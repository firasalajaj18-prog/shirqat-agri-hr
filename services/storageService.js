const fs = require('fs-extra');
const path = require('path');
const ExcelJS = require('exceljs');
const { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, AlignmentType, HeadingLevel, TextRun } = require('docx');
const sharp = require('sharp');

/**
 * Returns the storage root directory (defaults to local exports directory)
 */
async function getStorageRoot(configuredPath) {
  let rootPath = configuredPath;
  if (!rootPath || rootPath.startsWith('P:\\')) {
    rootPath = path.join(__dirname, '..', 'exports');
  }

  try {
    await fs.ensureDir(rootPath);
    return rootPath;
  } catch (err) {
    const localFallback = path.join(__dirname, '..', 'exports');
    await fs.ensureDir(localFallback);
    return localFallback;
  }
}

/**
 * Converts any image buffer or file path to standard JPG format and saves to destination
 */
async function saveAsJpg(sourceInput, destinationJpgPath) {
  try {
    await fs.ensureDir(path.dirname(destinationJpgPath));

    await sharp(sourceInput)
      .jpeg({ quality: 90, mozjpeg: true })
      .toFile(destinationJpgPath);

    return true;
  } catch (error) {
    console.error(`Error converting image to JPG for ${destinationJpgPath}:`, error.message);
    if (typeof sourceInput === 'string' && (await fs.pathExists(sourceInput))) {
      await fs.copy(sourceInput, destinationJpgPath);
      return true;
    }
    return false;
  }
}

/**
 * Builds and styles Excel workbook for employees
 */
function buildEmployeesWorkbook(employees) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'شعبة زراعة الشرقاط - نظام الموارد البشرية';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('بيانات الموظفين', {
    views: [{ rightToLeft: true }] // Arabic RTL support
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

  // Header styling
  const headerRow = worksheet.getRow(1);
  headerRow.height = 32;
  headerRow.eachCell(cell => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF41674E' } // Milky Sage Green
    };
    cell.font = {
      name: 'Calibri',
      size: 11,
      bold: true,
      color: { argb: 'FFFFFFFF' }
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF2D4736' } },
      left: { style: 'thin', color: { argb: 'FF2D4736' } },
      bottom: { style: 'medium', color: { argb: 'FF2D4736' } },
      right: { style: 'thin', color: { argb: 'FF2D4736' } }
    };
  });

  // Populate data rows
  employees.forEach((emp, index) => {
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
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isEven ? 'FFF9FBF9' : 'FFFFFFFF' }
      };
      cell.font = {
        name: 'Calibri',
        size: 10,
        color: { argb: 'FF222222' }
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: colNumber === 1 || colNumber === 6 || colNumber === 12 ? 'center' : 'right'
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
      };

      if (colNumber === 12) {
        if (emp.isCompleted) {
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF2D6A4F' } };
        } else {
          cell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FFD97706' } };
        }
      }
    });
  });

  return workbook;
}

/**
 * Generates official Excel workbook for employee records and saves to disk
 */
async function generateEmployeesExcel(employees, outputPath) {
  const workbook = buildEmployeesWorkbook(employees);
  await fs.ensureDir(path.dirname(outputPath));
  await workbook.xlsx.writeFile(outputPath);
  return outputPath;
}

/**
 * Generates Excel buffer for direct web download
 */
async function generateEmployeesExcelBuffer(employees) {
  const workbook = buildEmployeesWorkbook(employees);
  return await workbook.xlsx.writeBuffer();
}

/**
 * Builds Word Document for employees
 */
function buildEmployeesWordDocument(employees) {
  const tableRows = [];

  const headers = [
    'ت',
    'الاسم الرباعي واللقب',
    'اسم الأم',
    'البطاقة الموحدة',
    'فصيلة الدم',
    'الهاتف',
    'الصفة',
    'العنوان الوظيفي',
    'حالة البيانات'
  ];

  tableRows.push(
    new TableRow({
      tableHeader: true,
      children: headers.map(headerText =>
        new TableCell({
          shading: { fill: '41674E' }, // Milky Sage Green
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: headerText,
                  bold: true,
                  color: 'FFFFFF',
                  font: 'Arial',
                  size: 20
                })
              ]
            })
          ]
        })
      )
    })
  );

  employees.forEach((emp, index) => {
    const quadName = [
      emp.firstName || '',
      emp.secondName || '',
      emp.thirdName || '',
      emp.fourthName || '',
      emp.surname || ''
    ].filter(Boolean).join(' ') || emp.fullName;

    const rowData = [
      String(index + 1),
      quadName,
      emp.motherName || '—',
      emp.unifiedId || '—',
      emp.bloodType || '—',
      emp.phone || '—',
      emp.jobStatus || '—',
      emp.jobTitle || '—',
      emp.isCompleted ? 'مكتمل' : 'قيد الانتظار'
    ];

    const isEven = index % 2 === 0;

    tableRows.push(
      new TableRow({
        children: rowData.map((cellText, cellIndex) =>
          new TableCell({
            shading: { fill: isEven ? 'F4F7F4' : 'FFFFFF' },
            children: [
              new Paragraph({
                alignment: cellIndex === 0 || cellIndex === 4 || cellIndex === 8 ? AlignmentType.CENTER : AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: cellText,
                    font: 'Arial',
                    size: 18,
                    color: cellIndex === 8 && emp.isCompleted ? '2D6A4F' : '333333',
                    bold: cellIndex === 8
                  })
                ]
              })
            ]
          })
        )
      })
    );
  });

  return new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 }
          }
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'جمهورية العراق - وزارة الزراعة',
                bold: true,
                size: 26,
                font: 'Arial',
                color: '2D4736'
              })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'مديرية زراعة صلاح الدين / شعبة زراعة الشرقاط',
                bold: true,
                size: 22,
                font: 'Arial',
                color: '41674E'
              })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'جدول بيانات الموظفين - وحدة الموارد البشرية',
                bold: true,
                size: 20,
                font: 'Arial',
                color: '555555'
              })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [
              new TextRun({
                text: `تاريخ التصدير: ${new Date().toLocaleDateString('ar-IQ')}  |  إجمالي السجلات: ${employees.length}`,
                italics: true,
                size: 16,
                font: 'Arial',
                color: '777777'
              })
            ]
          }),
          new Paragraph({ text: '' }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: tableRows
          })
        ]
      }
    ]
  });
}

/**
 * Generates official Word (.docx) table for employee records and saves to disk
 */
async function generateEmployeesWord(employees, outputPath) {
  const doc = buildEmployeesWordDocument(employees);
  await fs.ensureDir(path.dirname(outputPath));
  const buffer = await Packer.toBuffer(doc);
  await fs.writeFile(outputPath, buffer);
  return outputPath;
}

/**
 * Generates Word (.docx) buffer for direct web download
 */
async function generateEmployeesWordBuffer(employees) {
  const doc = buildEmployeesWordDocument(employees);
  return await Packer.toBuffer(doc);
}

/**
 * Master Save Routine:
 * Creates a new folder named with the modification/export timestamp:
 * تصدير_YYYY-MM-DD_HH-mm
 * Inside it:
 * - بيانات_الموظفين_شعبة_زراعة_الشرقاط.xlsx
 * - جدول_الموظفين_شعبة_زراعة_الشرقاط.docx
 * - ملفات الموظفين/ (folder per employee containing 2-sided and all photos in JPG)
 */
async function executeMasterSave(data, uploadsDir, configuredPath) {
  const root = await getStorageRoot(configuredPath);

  // Format timestamp: تصدير_YYYY-MM-DD_HH-mm
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const folderName = `تصدير_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
  const exportFolder = path.join(root, folderName);

  const dataFolder = path.join(exportFolder, 'بيانات الموظفين');
  const employeesFolder = path.join(exportFolder, 'ملفات الموظفين');

  await fs.ensureDir(dataFolder);
  await fs.ensureDir(employeesFolder);

  // 1. Generate Excel & Word in "بيانات الموظفين"
  const excelFile = path.join(dataFolder, 'بيانات_الموظفين_شعبة_زراعة_الشرقاط.xlsx');
  const wordFile = path.join(dataFolder, 'جدول_الموظفين_شعبة_زراعة_الشرقاط.docx');

  await generateEmployeesExcel(data.employees, excelFile);
  await generateEmployeesWord(data.employees, wordFile);

  // 2. Process Employee folders & copy/convert JPG images
  const syncResults = [];

  for (const emp of data.employees) {
    const folderName = [
      emp.firstName || '',
      emp.secondName || '',
      emp.thirdName || '',
      emp.fourthName || '',
      emp.surname || ''
    ].filter(Boolean).join(' ') || emp.fullName || `موظف_${emp.id}`;

    const safeFolderName = folderName.replace(/[\\/:*?"<>|]/g, '_').trim();
    const empDir = path.join(employeesFolder, safeFolderName);
    await fs.ensureDir(empDir);

    // List of all possible photo attachments including 2-sided
    const attachments = [
      { key: 'personalPhoto', filename: 'الصورة_الشخصية.jpg' },
      { key: 'medicalPhoto', filename: 'الفحص_الطبي.jpg' },
      { key: 'empCardFront', filename: 'هوية_الموظف_الوجه_الامامي.jpg' },
      { key: 'empCardBack', filename: 'هوية_الموظف_الوجه_الخلفي.jpg' },
      { key: 'idCardFront', filename: 'البطاقة_الموحدة_الوجه_الامامي.jpg' },
      { key: 'idCardBack', filename: 'البطاقة_الموحدة_الوجه_الخلفي.jpg' },
      { key: 'residenceCardFront', filename: 'بطاقة_السكن_الوجه_الامامي.jpg' },
      { key: 'residenceCardBack', filename: 'بطاقة_السكن_الوجه_الخلفي.jpg' }
    ];

    let savedPhotosCount = 0;

    for (const item of attachments) {
      const photoVal = emp[item.key];
      if (photoVal) {
        const sourcePhoto = path.isAbsolute(photoVal)
          ? photoVal
          : path.join(uploadsDir, path.basename(photoVal));

        if (await fs.pathExists(sourcePhoto)) {
          const destPhoto = path.join(empDir, item.filename);
          await saveAsJpg(sourcePhoto, destPhoto);
          savedPhotosCount++;
        }
      }
    }

    syncResults.push({
      id: emp.id,
      name: safeFolderName,
      folderPath: empDir,
      savedPhotosCount
    });
  }

  return {
    success: true,
    storageRoot: root,
    exportFolder,
    folderName,
    dataFolder,
    employeesFolder,
    excelFile,
    wordFile,
    processedEmployees: syncResults.length,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  getStorageRoot,
  saveAsJpg,
  generateEmployeesExcel,
  generateEmployeesExcelBuffer,
  generateEmployeesWord,
  generateEmployeesWordBuffer,
  executeMasterSave
};
