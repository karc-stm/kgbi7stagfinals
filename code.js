const FIGHT_SHEETS = {
  'September 1': 'September 1',
  'September 3': 'September 3'
};

const RESULT_SHEETS = {
  'September 1': 'Result September 1',
  'September 3': 'Result September 3'
};

const RESULT_HEADERS = [
  'Fight #',
  'Left Entry',
  'Left WB',
  'Left WT',
  'Right Entry',
  'Right WB',
  'Right WT',
  'Result',
  'Winner',
  'Loser',
  'Updated At',
  'Left Score Slot',
  'Right Score Slot'
];

const DECLARATION_PASSWORD = 'Slasher15';
const OVERALL_SHEETS = {
  'September 1': 'Overall September 1',
  'September 3': 'Overall September 3'
};

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const callback = /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(params.callback || '') ? params.callback : '';

  try {
    const action = params.action || 'getDate';
    const date = params.date || 'September 1';

    if (action === 'saveResult') {
      if (params.password !== DECLARATION_PASSWORD) throw new Error('Invalid password.');
      saveFightResult(date, params.fightNumber, params.result);
    }

    if (action === 'getOverall') {
      return outputResponse({
        ok: true,
        date: date,
        overall: getOverallResults(date)
      }, callback);
    }

    return outputResponse({
      ok: true,
      date: date,
      fights: getFights(date),
      results: getResults(date)
    }, callback);
  } catch (error) {
    return outputResponse({
      ok: false,
      message: error.message
    }, callback);
  }
}

function getOverallResults(date) {
  if (date === 'Combined') {
    return combineOverallResults([
      getOverallResults('September 1'),
      getOverallResults('September 3')
    ]);
  }

  const sheet = getSheet(OVERALL_SHEETS[date], true);
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];

  const headerIndex = findOverallHeader(values);
  const headers = values[headerIndex].map(function(value) {
    return String(value || '').trim().toLowerCase();
  });
  const entryIndex = findHeaderIndex(headers, ['entry name', 'entry']);
  const ownerIndex = findHeaderIndex(headers, ['owner/address', 'owner']);
  const scoreStart = findHeaderIndex(headers, ['score 1']);
  const finalSlots = getFinalScoreSlots(date);

  if (entryIndex === -1 || scoreStart === -1) {
    throw new Error('Overall sheet must have ENTRY NAME and SCORE 1 headers.');
  }

  return values.slice(headerIndex + 1)
    .filter(function(row) {
      return row[entryIndex];
    })
    .map(function(row) {
      const rawScores = getSevenScores(row, scoreStart);
      const entryFinalSlots = finalSlots[normalizeName(row[entryIndex])] || {};
      const scores = rawScores.map(function(score) {
        return {
          value: score.value,
          isInitial: score.index < 2 && score.value !== '' && !entryFinalSlots[score.index + 1]
        };
      });

      return {
        entryName: row[entryIndex],
        owner: ownerIndex === -1 ? '' : row[ownerIndex],
        points: formatPoints(totalScores(rawScores)),
        pointsValue: totalScores(rawScores),
        scores: scores
      };
    })
    .sort(sortOverallRows);
}

function combineOverallResults(groups) {
  const combined = {};

  groups.forEach(function(rows) {
    rows.forEach(function(row) {
      const key = String(row.entryName || '').trim().toUpperCase();
      if (!key) return;
      if (!combined[key]) {
        combined[key] = {
          entryName: row.entryName,
          owner: row.owner,
          pointsValue: 0,
          scores: []
        };
      }

      combined[key].pointsValue += row.pointsValue || 0;
      combined[key].scores = combined[key].scores.concat(row.scores || []);
    });
  });

  return Object.keys(combined).map(function(key) {
    const row = combined[key];
    row.points = formatPoints(row.pointsValue);
    return row;
  }).sort(sortOverallRows);
}

function findOverallHeader(values) {
  for (let i = 0; i < Math.min(values.length, 10); i++) {
    const row = values[i].join(' ').toLowerCase();
    if (row.indexOf('entry name') !== -1 && row.indexOf('score') !== -1) return i;
  }

  return 0;
}

function findHeaderIndex(headers, names) {
  for (let i = 0; i < headers.length; i++) {
    for (let j = 0; j < names.length; j++) {
      if (headers[i] === names[j]) return i;
    }
  }

  return -1;
}

function getSevenScores(row, scoreStart) {
  const scores = [];

  for (let i = 0; i < 7; i++) {
    scores.push({
      value: cleanScore(row[scoreStart + i]),
      index: i
    });
  }

  return scores;
}

function getFinalScoreSlots(date) {
  const sheet = getSheet(RESULT_SHEETS[date], false);
  const slots = {};
  if (!sheet || sheet.getLastRow() < 2) return slots;

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, RESULT_HEADERS.length).getDisplayValues();
  values.forEach(function(row) {
    markFinalScoreSlot(slots, row[1], row[11]);
    markFinalScoreSlot(slots, row[4], row[12]);
  });

  return slots;
}

function markFinalScoreSlot(slots, entryName, slot) {
  const scoreSlot = Number(slot);
  if (!entryName || scoreSlot < 1 || scoreSlot > 7) return;

  const key = normalizeName(entryName);
  if (!slots[key]) slots[key] = {};
  slots[key][scoreSlot] = true;
}

function cleanScore(value) {
  const score = String(value || '').trim();
  if (!score) return '';
  const upper = score.toUpperCase();
  if (upper === 'W') return '1';
  if (upper === 'L') return '0';
  if (upper === 'D') return '0.5';
  if (upper === 'CANCEL') return 'C';
  if (score === '.5') return '0.5';
  return upper;
}

function normalizeName(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

function scoreValue(score) {
  const value = String(score.value || '').trim().toUpperCase();
  if (!value || value === 'C') return 0;
  if (value === '1/2') return 0.5;
  const number = Number(value);
  return isNaN(number) ? 0 : number;
}

function totalScores(scores) {
  return scores.reduce(function(total, score) {
    return total + scoreValue(score);
  }, 0);
}

function formatPoints(points) {
  return Number.isInteger(points) ? String(points) : points.toFixed(1);
}

function sortOverallRows(a, b) {
  if (b.pointsValue !== a.pointsValue) return b.pointsValue - a.pointsValue;
  return String(a.entryName || '').localeCompare(String(b.entryName || ''));
}

function getFights(date) {
  const sheet = getSheet(FIGHT_SHEETS[date], true);
  const values = sheet.getDataRange().getDisplayValues();

  return values.slice(1)
    .filter(function(row) {
      return row[5] || row[7] || row[0] || row[12];
    })
    .map(function(row) {
      return {
        fightNumber: row[5] || row[7] || '',
        left: {
          entryName: row[0] || '',
          lb: row[2] || '',
          wb: row[3] || '',
          weight: row[4] || ''
        },
        right: {
          weight: row[8] || '',
          wb: row[9] || '',
          lb: row[10] || '',
          entryName: row[12] || ''
        }
      };
    })
    .filter(function(fight) {
      return fight.fightNumber && (fight.left.entryName || fight.right.entryName);
    });
}

function saveFightResult(date, fightNumber, result) {
  if (!fightNumber) throw new Error('Fight number is required.');
  if (['LEFT_WIN', 'RIGHT_WIN', 'DRAW', 'CANCEL'].indexOf(result) === -1) throw new Error('Invalid result.');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const fight = getFights(date).filter(function(item) {
      return String(item.fightNumber) === String(fightNumber);
    })[0];

    if (!fight) throw new Error('Fight not found: ' + fightNumber);

    const sheet = getResultSheet(date);
    const rowNumber = findResultRow(sheet, fightNumber);
    const existingRow = rowNumber
      ? sheet.getRange(rowNumber, 1, 1, RESULT_HEADERS.length).getDisplayValues()[0]
      : [];
    const slots = updateOverallScores(date, fight, result, existingRow);
    const winner = result === 'LEFT_WIN' ? fight.left.entryName : result === 'RIGHT_WIN' ? fight.right.entryName : '';
    const loser = result === 'LEFT_WIN' ? fight.right.entryName : result === 'RIGHT_WIN' ? fight.left.entryName : '';
    const row = [
      fight.fightNumber,
      fight.left.entryName,
      fight.left.wb,
      fight.left.weight,
      fight.right.entryName,
      fight.right.wb,
      fight.right.weight,
      result,
      winner,
      loser,
      new Date(),
      slots.leftSlot,
      slots.rightSlot
    ];

    if (rowNumber) {
      sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
    } else {
      sheet.appendRow(row);
    }
  } finally {
    lock.releaseLock();
  }
}

function getResults(date) {
  const sheet = getResultSheet(date);
  const values = sheet.getDataRange().getDisplayValues().slice(1);

  return values
    .filter(function(row) {
      return row[0];
    })
    .map(function(row) {
      return {
        fightNumber: row[0],
        leftEntry: row[1],
        leftWb: row[2],
        leftWeight: row[3],
        rightEntry: row[4],
        rightWb: row[5],
        rightWeight: row[6],
        result: row[7],
        winner: row[8],
        loser: row[9],
        updatedAt: row[10]
      };
    });
}

function getResultSheet(date) {
  const name = RESULT_SHEETS[date];
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName(name);

  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(RESULT_HEADERS);
  }

  const firstRow = sheet.getRange(1, 1, 1, RESULT_HEADERS.length).getValues()[0];
  if (firstRow[0] !== RESULT_HEADERS[0]) {
    sheet.insertRowBefore(1);
    sheet.getRange(1, 1, 1, RESULT_HEADERS.length).setValues([RESULT_HEADERS]);
  } else {
    sheet.getRange(1, 1, 1, RESULT_HEADERS.length).setValues([RESULT_HEADERS]);
  }

  return sheet;
}

function updateOverallScores(date, fight, result, existingRow) {
  const leftScore = result === 'LEFT_WIN' ? '1' : result === 'RIGHT_WIN' ? '0' : result === 'DRAW' ? '0.5' : 'C';
  const rightScore = result === 'RIGHT_WIN' ? '1' : result === 'LEFT_WIN' ? '0' : result === 'DRAW' ? '0.5' : 'C';
  const previousResult = existingRow ? existingRow[7] : '';
  const previousLeftScore = previousResult === 'LEFT_WIN' ? '1' : previousResult === 'RIGHT_WIN' ? '0' : previousResult === 'DRAW' ? '0.5' : previousResult === 'CANCEL' ? 'C' : '';
  const previousRightScore = previousResult === 'RIGHT_WIN' ? '1' : previousResult === 'LEFT_WIN' ? '0' : previousResult === 'DRAW' ? '0.5' : previousResult === 'CANCEL' ? 'C' : '';

  return {
    leftSlot: updateOverallEntryScore(date, fight.left.entryName, leftScore, existingRow && existingRow[11], previousLeftScore),
    rightSlot: updateOverallEntryScore(date, fight.right.entryName, rightScore, existingRow && existingRow[12], previousRightScore)
  };
}

function updateOverallEntryScore(date, entryName, score, preferredSlot, previousScore) {
  if (!entryName) return '';

  const sheet = getSheet(OVERALL_SHEETS[date], true);
  const values = sheet.getDataRange().getDisplayValues();
  const headerIndex = findOverallHeader(values);
  const headers = values[headerIndex].map(function(value) {
    return String(value || '').trim().toLowerCase();
  });
  const entryIndex = findHeaderIndex(headers, ['entry name', 'entry']);
  const scoreStart = findHeaderIndex(headers, ['score 1']);
  const totalIndex = findHeaderIndex(headers, ['total']);

  if (entryIndex === -1 || scoreStart === -1) {
    throw new Error('Overall sheet must have ENTRY NAME and SCORE 1 headers.');
  }

  const rowNumber = findOverallEntryRow(sheet, headerIndex, entryIndex, entryName);
  const targetRow = rowNumber || sheet.getLastRow() + 1;
  if (!rowNumber) sheet.getRange(targetRow, entryIndex + 1).setValue(entryName);

  const slot = pickOverallSlot(sheet, targetRow, scoreStart, preferredSlot, previousScore);
  sheet.getRange(targetRow, scoreStart + slot).setValue(score);

  if (totalIndex !== -1) {
    const scores = sheet.getRange(targetRow, scoreStart + 1, 1, 7).getDisplayValues()[0]
      .map(function(value, index) {
        return { value: cleanScore(value), index: index };
      });
    sheet.getRange(targetRow, totalIndex + 1).setValue(formatPoints(totalScores(scores)));
  }

  return slot;
}

function findOverallEntryRow(sheet, headerIndex, entryIndex, entryName) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= headerIndex + 1) return 0;

  const values = sheet.getRange(headerIndex + 2, entryIndex + 1, lastRow - headerIndex - 1, 1).getDisplayValues();
  const target = normalizeName(entryName);
  for (let i = 0; i < values.length; i++) {
    if (normalizeName(values[i][0]) === target) return headerIndex + 2 + i;
  }

  return 0;
}

function pickOverallSlot(sheet, rowNumber, scoreStart, preferredSlot, previousScore) {
  const savedSlot = Number(preferredSlot);
  if (savedSlot >= 1 && savedSlot <= 7) return savedSlot;

  const scores = sheet.getRange(rowNumber, scoreStart + 1, 1, 7).getDisplayValues()[0];
  const oldScore = cleanScore(previousScore);
  if (oldScore) {
    for (let slot = 1; slot <= 7; slot++) {
      if (cleanScore(scores[slot - 1]) === oldScore) return slot;
    }
  }

  for (let slot = 1; slot <= 7; slot++) {
    if (!String(scores[slot - 1] || '').trim()) return slot;
  }

  return 7;
}

function findResultRow(sheet, fightNumber) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  const values = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(fightNumber)) {
      return i + 2;
    }
  }

  return 0;
}

function getSheet(name, required) {
  if (!name) throw new Error('Invalid fight date.');
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName(name);

  if (!sheet) {
    sheet = ss.getSheets().filter(function(item) {
      return item.getName().trim().toLowerCase() === name.trim().toLowerCase();
    })[0];
  }

  if (!sheet && required) throw new Error('Sheet not found: ' + name);
  return sheet;
}

function outputResponse(data, callback) {
  const body = JSON.stringify(data);
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + body + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(body)
    .setMimeType(ContentService.MimeType.JSON);
}
