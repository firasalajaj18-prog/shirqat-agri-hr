const mammoth = require('mammoth');
const fs = require('fs-extra');

function groupCompoundNameParts(words) {
  const result = [];
  for (let i = 0; i < words.length; i++) {
    const current = words[i];
    const next = words[i + 1];
    if (current === 'عبد' && next) {
      result.push('عبد' + next);
      i++;
    } else if (current === 'ابو' && next) {
      result.push('ابو' + next);
      i++;
    } else if (/(نور|سيف|شمس|علاء|بهاء|ضياء|جمال|كمال|صلاح|جلال|حسام|عماد|سعد|تقي)/.test(current) && next === 'الدين') {
      result.push(current + 'الدين');
      i++;
    } else {
      result.push(current);
    }
  }
  return result;
}

/**
 * Service to parse employee names from uploaded Word (.docx) documents
 */
async function parseEmployeeNamesFromDocx(filePath) {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    const rawText = result.value || '';
    
    // Split text by newlines, carriage returns, or common separators (bullet points, numbers)
    const lines = rawText
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.length > 0);

    const names = [];
    const seenNames = new Set();

    for (let line of lines) {
      // Remove leading numbering like "1- ", "1. ", "1)", "-", "•", etc.
      let cleaned = line.replace(/^[\d٠-٩]+[\s\.\-\)\:]+/, '').trim();
      cleaned = cleaned.replace(/^[\-\•\*\–\—]+\s*/, '').trim();

      // Skip common table headers or titles like "الاسم", "ت", "اسم الموظف", "قائمة الموظفين", "ملاحظات"
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

      // Check if it looks like an Arabic name (at least 2 words)
      const words = cleaned.split(/\s+/).filter(w => w.length > 0);
      if (words.length >= 2) {
        const normalizedName = words.join(' ');
        if (!seenNames.has(normalizedName)) {
          seenNames.add(normalizedName);
          const groupedParts = groupCompoundNameParts(words);
          
          names.push({
            fullName: normalizedName,
            firstName: groupedParts[0] || '',
            secondName: groupedParts[1] || '',
            thirdName: groupedParts[2] || '',
            fourthName: groupedParts[3] || '',
            wordsCount: groupedParts.length
          });
        }
      }
    }

    return {
      success: true,
      count: names.length,
      names: names,
      warnings: result.messages || []
    };
  } catch (error) {
    console.error('Error parsing docx file:', error);
    return {
      success: false,
      error: error.message,
      names: []
    };
  }
}

module.exports = {
  parseEmployeeNamesFromDocx
};
