const TABLE_HEADERS = {
  employees: [
    'id', 'name', 'nickname', 'nickname_updated_at', 'role', 'hourly_rate', 'pin',
    'status', 'is_active', 'sort_order', 'phone', 'relative_phone', 'address',
    'cccd_url', 'bank_name', 'bank_account_number', 'bank_account_holder',
    'bank_qr_code_url', 'off_start_date', 'off_end_date', 'resigned_at', 'note',
    'created_at',
  ],
  branches: ['id', 'name', 'color', 'is_active', 'sort_order', 'created_at'],
  availability: [
    'id', 'employee_id', 'date', 'type', 'note', 'is_admin_assigned', 'created_at',
  ],
  schedule: [
    'id', 'employee_id', 'branch_id', 'date', 'start_time', 'end_time',
    'hours', 'note', 'created_at',
  ],
  penalties: [
    'id', 'employee_id', 'month', 'date', 'type', 'amount', 'reason', 'created_at',
  ],
  employee_rates: [
    'id', 'employee_id', 'hourly_rate', 'effective_date', 'created_at',
  ],
  shift_swaps: [
    'id', 'requester_id', 'requester_name', 'target_employee_id',
    'target_employee_name', 'shift_date', 'request_type', 'time_change_type',
    'original_time', 'adjusted_time', 'extra_hours', 'branch_name',
    'my_shift_info', 'target_shift_info', 'reason', 'status', 'rejection_reason',
    'created_at', 'updated_at',
  ],
  system_settings: ['key', 'value', 'updated_at'],
};

function doGet() {
  return jsonOutput({ ok: true, message: 'Google Sheets API is running.' });
}

function doPost(event) {
  try {
    const request = JSON.parse(event.postData.contents || '{}');
    const expectedToken = PropertiesService.getScriptProperties().getProperty('API_TOKEN');

    if (!expectedToken || request.token !== expectedToken) {
      return jsonOutput({ ok: false, code: 'UNAUTHORIZED', error: 'API token không hợp lệ.' });
    }

    if (!Object.prototype.hasOwnProperty.call(TABLE_HEADERS, request.table)) {
      return jsonOutput({ ok: false, code: 'INVALID_TABLE', error: 'Bảng không được hỗ trợ.' });
    }

    const data = executeRequest(request);
    return jsonOutput({ ok: true, data: data });
  } catch (error) {
    console.error(error);
    return jsonOutput({
      ok: false,
      code: error.code || 'SHEETS_ERROR',
      error: error.message || 'Không thể xử lý yêu cầu Google Sheets.',
    });
  }
}

function executeRequest(request) {
  const operation = request.operation;
  if (['insert', 'upsert', 'update', 'delete'].indexOf(operation) !== -1) {
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      return executeMutation(request);
    } finally {
      lock.releaseLock();
    }
  }
  if (operation === 'select') return executeSelect(request);
  throw makeError('INVALID_OPERATION', 'Thao tác không được hỗ trợ.');
}

function executeSelect(request) {
  const rows = readRows(request.table)
    .filter(function (row) {
      return matchesFilters(row, request.filters || []) && matchesAny(row, request.anyFilters || []);
    });
  sortRows(rows, request.orders || []);
  const projected = rows.map(function (row) {
    return projectRow(request.table, row, request.columns || '*');
  });
  const limit = Number(request.limit);
  const hasLimit = request.limit !== null && request.limit !== undefined && request.limit !== '';
  const limited = hasLimit && Number.isFinite(limit) && limit >= 0
    ? projected.slice(0, limit)
    : projected;
  return applyCardinality(limited, request.cardinality || 'many');
}

function executeMutation(request) {
  const table = request.table;
  const sheet = getTableSheet(table);
  let rows = readRows(table);
  const values = Array.isArray(request.values) ? request.values : [request.values];
  let changedRows = [];

  if (request.operation === 'insert') {
    changedRows = values.map(function (value) {
      return appendRow(table, value || {});
    });
  } else if (request.operation === 'upsert') {
    const conflictColumns = String(request.conflict || 'id').split(',').map(function (name) {
      return name.trim();
    });
    changedRows = values.map(function (value) {
      const existing = rows.find(function (row) {
        return conflictColumns.every(function (column) {
          return comparable(row[column]) === comparable(value[column]);
        });
      });
      if (!existing) return appendRow(table, value || {});
      const updated = Object.assign({}, existing, value);
      writeRow(sheet, existing._rowNumber, updated, table);
      return updated;
    });
  } else if (request.operation === 'update') {
    rows.forEach(function (row) {
      if (matchesFilters(row, request.filters || []) && matchesAny(row, request.anyFilters || [])) {
        const updated = Object.assign({}, row, request.values || {});
        writeRow(sheet, row._rowNumber, updated, table);
        changedRows.push(updated);
      }
    });
  } else if (request.operation === 'delete') {
    const deleteRows = rows.filter(function (row) {
      return matchesFilters(row, request.filters || []) && matchesAny(row, request.anyFilters || []);
    });
    deleteRows.map(function (row) {
      return row._rowNumber;
    }).sort(function (a, b) {
      return b - a;
    }).forEach(function (rowNumber) {
      sheet.deleteRow(rowNumber);
    });
    cascadeDelete(table, deleteRows);
    return null;
  }

  if (!request.returning) return null;
  return applyCardinality(changedRows.map(function (row) {
    return projectRow(table, row, request.columns || '*');
  }), request.cardinality || 'many');
}

function getTableSheet(table) {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!spreadsheetId) {
    throw makeError('NOT_CONFIGURED', 'Chạy setupSpreadsheet() và cấu hình SPREADSHEET_ID trước.');
  }

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  let sheet = spreadsheet.getSheetByName(table);
  if (!sheet) sheet = spreadsheet.insertSheet(table);

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, TABLE_HEADERS[table].length).setValues([TABLE_HEADERS[table]]);
    sheet.setFrozenRows(1);
  } else {
    const lastColumn = sheet.getLastColumn();
    const headers = lastColumn > 0
      ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(String)
      : [];
    const missing = TABLE_HEADERS[table].filter(function (header) {
      return headers.indexOf(header) === -1;
    });
    if (missing.length) {
      sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
    }
  }
  return sheet;
}

function readRows(table) {
  const sheet = getTableSheet(table);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1).map(function (cells, index) {
    const row = { _rowNumber: index + 2 };
    headers.forEach(function (header, column) {
      row[header] = normalizeCell(cells[column], header, table);
    });
    return row;
  }).filter(function (row) {
    return Object.keys(row).some(function (key) {
      return key !== '_rowNumber' && row[key] !== '';
    });
  });
}

function appendRow(table, value) {
  const sheet = getTableSheet(table);
  const row = Object.assign({}, value);
  if (table !== 'system_settings' && !row.id) row.id = Utilities.getUuid();
  if (!row.created_at && table !== 'system_settings') row.created_at = new Date().toISOString();
  if (table === 'shift_swaps' && !row.status) row.status = 'pending';
  if (table === 'employees') {
    if (row.hourly_rate === undefined) row.hourly_rate = 20000;
    if (row.pin === undefined) row.pin = '1234';
    if (row.status === undefined) row.status = 'active';
    if (row.is_active === undefined) row.is_active = true;
  }

  assertUnique(table, row, null);
  writeRow(sheet, sheet.getLastRow() + 1, row, table);
  return row;
}

function writeRow(sheet, rowNumber, row, table) {
  let headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const missing = Object.keys(row).filter(function (key) {
    return key !== '_rowNumber' && headers.indexOf(key) === -1;
  });
  if (missing.length) {
    sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
    headers = headers.concat(missing);
  }

  assertUnique(table, row, row._rowNumber || null);
  const cells = headers.map(function (header) {
    return encodeCell(row[header]);
  });
  sheet.getRange(rowNumber, 1, 1, headers.length).setNumberFormat('@').setValues([cells]);
}

function assertUnique(table, row, excludingRow) {
  const uniqueColumn = table === 'employees' || table === 'branches'
    ? 'name'
    : table === 'system_settings'
    ? 'key'
    : null;
  if (!uniqueColumn || row[uniqueColumn] === undefined) return;
  const duplicate = readRows(table).some(function (existing) {
    return existing._rowNumber !== excludingRow &&
      String(existing[uniqueColumn]).toLowerCase() === String(row[uniqueColumn]).toLowerCase();
  });
  if (duplicate) {
    throw makeError('23505', 'Giá trị "' + row[uniqueColumn] + '" đã tồn tại.');
  }
}

function cascadeDelete(table, rows) {
  if (table !== 'branches' && table !== 'employees') return;
  const idColumn = table === 'branches' ? 'branch_id' : 'employee_id';
  const ids = rows.map(function (row) {
    return String(row.id);
  });
  const relatedTables = table === 'branches'
    ? ['schedule']
    : ['availability', 'employee_rates', 'penalties', 'schedule', 'shift_swaps'];
  relatedTables.forEach(function (relatedTable) {
    const sheet = getTableSheet(relatedTable);
    readRows(relatedTable).filter(function (row) {
      return ids.indexOf(String(row[idColumn])) !== -1 ||
        (relatedTable === 'shift_swaps' && table === 'employees' &&
          (ids.indexOf(String(row.requester_id)) !== -1 ||
            ids.indexOf(String(row.target_employee_id)) !== -1));
    }).map(function (row) {
      return row._rowNumber;
    }).sort(function (a, b) {
      return b - a;
    }).forEach(function (rowNumber) {
      sheet.deleteRow(rowNumber);
    });
  });
}

function matchesFilters(row, filters) {
  return filters.every(function (filter) {
    return matchesFilter(row, filter);
  });
}

function matchesAny(row, filters) {
  return filters.length === 0 || filters.some(function (filter) {
    return matchesFilter(row, filter);
  });
}

function matchesFilter(row, filter) {
  const actual = row[filter.column];
  const expected = filter.value;
  if (filter.operator === 'eq') return comparable(actual) === comparable(expected);
  if (filter.operator === 'neq') return comparable(actual) !== comparable(expected);
  if (filter.operator === 'is') {
    if (String(expected).toLowerCase() === 'null') {
      return actual === null || actual === undefined || actual === '';
    }
    return comparable(actual) === comparable(expected);
  }
  if (filter.operator === 'ilike') {
    return String(actual || '').toLowerCase() === String(expected || '').replace(/^%|%$/g, '').toLowerCase();
  }
  if (filter.operator === 'gte') return comparable(actual) >= comparable(expected);
  if (filter.operator === 'lte') return comparable(actual) <= comparable(expected);
  return false;
}

function comparable(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value).trim().toLowerCase();
}

function sortRows(rows, orders) {
  rows.sort(function (left, right) {
    for (let index = 0; index < orders.length; index += 1) {
      const order = orders[index];
      const a = left[order.column];
      const b = right[order.column];
      if (a === b) continue;
      if (a === '' || a === null || a === undefined) {
        return order.nullsFirst === true ? -1 : 1;
      }
      if (b === '' || b === null || b === undefined) {
        return order.nullsFirst === true ? 1 : -1;
      }
      const result = typeof a === 'number' && typeof b === 'number'
        ? a - b
        : comparable(a) < comparable(b)
        ? -1
        : 1;
      return order.ascending ? result : -result;
    }
    return 0;
  });
}

function projectRow(table, row, columns) {
  const requested = splitColumns(columns);
  const result = {};
  if (requested.indexOf('*') !== -1 || requested.indexOf('') !== -1) {
    Object.keys(row).forEach(function (key) {
      if (key !== '_rowNumber') result[key] = row[key];
    });
  } else {
    requested.forEach(function (column) {
      if (column.indexOf('(') === -1 && Object.prototype.hasOwnProperty.call(row, column)) {
        result[column] = row[column];
      }
    });
  }

  requested.forEach(function (column) {
    const join = column.match(/^(employees|branches)\(([^)]+)\)$/);
    if (!join) return;
    const relatedTable = join[1];
    const foreignKey = relatedTable === 'employees' ? 'employee_id' : 'branch_id';
    const related = readRows(relatedTable).find(function (item) {
      return comparable(item.id) === comparable(row[foreignKey]);
    });
    if (!related) {
      result[relatedTable] = null;
      return;
    }
    result[relatedTable] = {};
    join[2].split(',').map(function (field) {
      return field.trim();
    }).forEach(function (field) {
      if (Object.prototype.hasOwnProperty.call(related, field)) {
        result[relatedTable][field] = related[field];
      }
    });
  });
  return result;
}

function splitColumns(columns) {
  const result = [];
  let depth = 0;
  let start = 0;
  const value = String(columns);
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '(') depth += 1;
    if (value[index] === ')') depth -= 1;
    if (value[index] === ',' && depth === 0) {
      result.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  result.push(value.slice(start).trim());
  return result;
}

function applyCardinality(rows, cardinality) {
  if (cardinality === 'many') return rows;
  if (rows.length === 1) return rows[0];
  if (cardinality === 'maybe-one' && rows.length === 0) return null;
  throw makeError('PGRST116', 'Kết quả không có đúng một bản ghi.');
}

function normalizeCell(value, header, table) {
  if (value instanceof Date) {
    const format = header === 'date' || header === 'effective_date' || header === 'shift_date'
      ? 'yyyy-MM-dd'
      : header === 'month'
      ? 'yyyy-MM'
      : header === 'start_time' || header === 'end_time'
      ? 'HH:mm:ss'
      : "yyyy-MM-dd'T'HH:mm:ss.SSSXXX";
    return Utilities.formatDate(value, Session.getScriptTimeZone(), format);
  }
  if (table === 'system_settings' && header === 'value' && typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (error) {
      return value;
    }
  }
  return value;
}

function encodeCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'string' && /^[=+@-]/.test(value)) return "'" + value;
  return value;
}

function makeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function jsonOutput(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function setupSpreadsheet() {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheetId = properties.getProperty('SPREADSHEET_ID');
  if (!spreadsheetId) {
    throw makeError(
      'NOT_CONFIGURED',
      'Thêm SPREADSHEET_ID trong Script Properties trước khi chạy setupSpreadsheet().'
    );
  }

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);

  Object.keys(TABLE_HEADERS).forEach(function (table) {
    const sheet = spreadsheet.getSheetByName(table) || spreadsheet.insertSheet(table);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, TABLE_HEADERS[table].length).setValues([TABLE_HEADERS[table]]);
      sheet.setFrozenRows(1);
    }
  });

  seedBranches();
  Logger.log('Spreadsheet ready: ' + spreadsheet.getUrl());
}

function seedBranches() {
  const sheet = getTableSheet('branches');
  if (readRows('branches').length) return;
  [
    { name: 'HBD', color: '#f59e0b', sort_order: 1 },
    { name: 'A4', color: '#10b981', sort_order: 2 },
    { name: 'TL', color: '#8b5cf6', sort_order: 3 },
    { name: '38', color: '#ef4444', sort_order: 4 },
    { name: '30', color: '#3b82f6', sort_order: 5 },
  ].forEach(function (branch) {
    appendRow('branches', branch);
  });
}
