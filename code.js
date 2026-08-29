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
  'Updated At'
];

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const callback = /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(params.callback || '') ? params.callback : '';

  try {
    const action = params.action || 'getDate';
    const date = params.date || 'September 1';

    if (action === 'saveResult') {
      saveFightResult(date, params.fightNumber, params.result);
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

  const fight = getFights(date).filter(function(item) {
    return String(item.fightNumber) === String(fightNumber);
  })[0];

  if (!fight) throw new Error('Fight not found: ' + fightNumber);

  const sheet = getResultSheet(date);
  const rowNumber = findResultRow(sheet, fightNumber);
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
    new Date()
  ];

  if (rowNumber) {
    sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
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
  }

  return sheet;
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
