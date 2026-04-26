// =============================================================================
// Gemma API Management Platform — Google Apps Script Data Layer
// Deploy as Web App: Execute as Me | Anyone can access
// Set Script Properties: SPREADSHEET_ID, SHEETS_SECRET
//
// NOTE: Apps Script Web Apps cannot read HTTP request headers.
// Authentication uses a 'secret' field in the POST body instead of a header.
// The lib/sheets.ts client sends it as body.secret; this script validates it.
// =============================================================================

// ===== COLUMN INDICES (0-based, matching the sheet column order) =====

var USERS_COL = {
  id: 0,
  email: 1,
  name: 2,
  passwordHash: 3,
  createdAt: 4,
  lastLoginAt: 5,
  isActive: 6,
  tier: 7,
  totalCallCount: 8,
  dailyCallCount: 9,
  dailyCallResetAt: 10,
  refreshToken: 11,
  refreshTokenExpiresAt: 12
}

var USERKEYS_COL = {
  userId: 0,
  encryptedKey: 1,
  iv: 2,
  keyHint: 3,
  createdAt: 4,
  isValid: 5
}

var APIS_COL = {
  id: 0,
  userId: 1,
  name: 2,
  description: 3,
  model: 4,
  temperature: 5,
  topP: 6,
  topK: 7,
  maxOutputTokens: 8,
  stopSequences: 9,
  safetySettings: 10,
  systemPrompt: 11,
  callCount: 12,
  createdAt: 13,
  updatedAt: 14
}

var LOGS_COL = {
  id: 0,
  savedApiId: 1,
  userId: 2,
  prompt: 3,
  responseText: 4,
  model: 5,
  promptTokenCount: 6,
  responseTokenCount: 7,
  totalTokenCount: 8,
  finishReason: 9,
  tier: 10,
  latencyMs: 11,
  createdAt: 12
}

// ===== ENTRY POINT =====

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents)

    var secret = PropertiesService.getScriptProperties().getProperty('SHEETS_SECRET')
    if (!secret || body.secret !== secret) {
      return respond({ success: false, error: 'Unauthorized' })
    }

    var action = body.action
    if (!action) {
      return respond({ success: false, error: 'Missing action' })
    }

    // Route to handler
    switch (action) {
      // Users
      case 'createUser':           return createUser(body)
      case 'getUserByEmail':       return getUserByEmail(body)
      case 'getUserById':          return getUserById(body)
      case 'updateLastLogin':      return updateLastLogin(body)
      case 'setRefreshToken':      return setRefreshToken(body)
      case 'getRefreshToken':      return getRefreshToken(body)
      case 'clearRefreshToken':    return clearRefreshToken(body)
      case 'updateTier':           return updateTier(body)
      case 'incrementCallCounts':  return incrementCallCounts(body)
      case 'getUserQuota':         return getUserQuota(body)
      // UserApiKeys
      case 'setApiKey':            return setApiKey(body)
      case 'getApiKey':            return getApiKey(body)
      case 'deleteApiKey':         return deleteApiKey(body)
      // SavedApis
      case 'createSavedApi':       return createSavedApi(body)
      case 'getSavedApisByUser':   return getSavedApisByUser(body)
      case 'getSavedApiById':      return getSavedApiById(body)
      case 'updateSavedApi':       return updateSavedApi(body)
      case 'deleteSavedApi':       return deleteSavedApi(body)
      case 'incrementApiCallCount':return incrementApiCallCount(body)
      // CallLogs
      case 'createCallLog':        return createCallLog(body)
      case 'getCallLogsByApi':     return getCallLogsByApi(body)
      case 'deleteCallLogsByApi':  return deleteCallLogsByApi(body)

      default:
        return respond({ success: false, error: 'Unknown action: ' + action })
    }
  } catch (err) {
    return respond({ success: false, error: err.message })
  }
}

// ===== USERS ACTIONS =====

function createUser(body) {
  var lock = LockService.getScriptLock()
  lock.waitLock(10000)
  try {
    var sheet = getSheet('Users')
    // Check uniqueness
    var existing = findRowById(sheet, USERS_COL.email, body.email)
    if (existing) {
      return respond({ success: false, error: 'EMAIL_CONFLICT' })
    }
    sheet.appendRow([
      body.id,
      body.email,
      body.name,
      body.passwordHash,
      body.createdAt,
      '',                // lastLoginAt
      true,              // isActive
      'shared',          // tier
      0,                 // totalCallCount
      0,                 // dailyCallCount
      body.createdAt,    // dailyCallResetAt
      '',                // refreshToken
      ''                 // refreshTokenExpiresAt
    ])
    return respond({ success: true, id: body.id })
  } finally {
    lock.releaseLock()
  }
}

function getUserByEmail(body) {
  var sheet = getSheet('Users')
  var row = findRowByValue(sheet, USERS_COL.email, body.email)
  if (!row) return respond({ success: false })
  return respond({ success: true, user: rowToUser(row) })
}

function getUserById(body) {
  var sheet = getSheet('Users')
  var row = findRowByValue(sheet, USERS_COL.id, body.id)
  if (!row) return respond({ success: false })
  return respond({ success: true, user: rowToUser(row) })
}

function updateLastLogin(body) {
  var lock = LockService.getScriptLock()
  lock.waitLock(10000)
  try {
    var info = findRowInfo(getSheet('Users'), USERS_COL.id, body.id)
    if (!info) return respond({ success: false })
    info.sheet.getRange(info.rowNum, USERS_COL.lastLoginAt + 1).setValue(body.lastLoginAt)
    return respond({ success: true })
  } finally {
    lock.releaseLock()
  }
}

function setRefreshToken(body) {
  var lock = LockService.getScriptLock()
  lock.waitLock(10000)
  try {
    var sheet = getSheet('Users')
    var info = findRowInfo(sheet, USERS_COL.id, body.id)
    if (!info) return respond({ success: false })
    info.sheet.getRange(info.rowNum, USERS_COL.refreshToken + 1).setValue(body.refreshToken)
    info.sheet.getRange(info.rowNum, USERS_COL.refreshTokenExpiresAt + 1).setValue(body.refreshTokenExpiresAt)
    return respond({ success: true })
  } finally {
    lock.releaseLock()
  }
}

function getRefreshToken(body) {
  var sheet = getSheet('Users')
  var row = findRowByValue(sheet, USERS_COL.id, body.id)
  if (!row) return respond({ success: false })
  return respond({
    success: true,
    refreshToken: row[USERS_COL.refreshToken] || null,
    refreshTokenExpiresAt: row[USERS_COL.refreshTokenExpiresAt] || null
  })
}

function clearRefreshToken(body) {
  var lock = LockService.getScriptLock()
  lock.waitLock(10000)
  try {
    var sheet = getSheet('Users')
    var info = findRowInfo(sheet, USERS_COL.id, body.id)
    if (!info) return respond({ success: false })
    info.sheet.getRange(info.rowNum, USERS_COL.refreshToken + 1).setValue('')
    info.sheet.getRange(info.rowNum, USERS_COL.refreshTokenExpiresAt + 1).setValue('')
    return respond({ success: true })
  } finally {
    lock.releaseLock()
  }
}

function updateTier(body) {
  var lock = LockService.getScriptLock()
  lock.waitLock(10000)
  try {
    var info = findRowInfo(getSheet('Users'), USERS_COL.id, body.id)
    if (!info) return respond({ success: false })
    info.sheet.getRange(info.rowNum, USERS_COL.tier + 1).setValue(body.tier)
    return respond({ success: true })
  } finally {
    lock.releaseLock()
  }
}

function incrementCallCounts(body) {
  var lock = LockService.getScriptLock()
  lock.waitLock(10000)
  try {
    var sheet = getSheet('Users')
    var info = findRowInfo(sheet, USERS_COL.id, body.id)
    if (!info) return respond({ success: false })

    var row = info.sheet.getRange(info.rowNum, 1, 1, 13).getValues()[0]
    var currentUTCDate = body.currentDate  // expects 'YYYY-MM-DD'
    var resetAt = String(row[USERS_COL.dailyCallResetAt]).substring(0, 10)

    var dailyCount = Number(row[USERS_COL.dailyCallCount]) || 0
    var totalCount = Number(row[USERS_COL.totalCallCount]) || 0

    if (resetAt !== currentUTCDate) {
      // New UTC day — reset
      dailyCount = 0
      info.sheet.getRange(info.rowNum, USERS_COL.dailyCallResetAt + 1).setValue(currentUTCDate)
    }

    dailyCount += 1
    totalCount += 1

    info.sheet.getRange(info.rowNum, USERS_COL.dailyCallCount + 1).setValue(dailyCount)
    info.sheet.getRange(info.rowNum, USERS_COL.totalCallCount + 1).setValue(totalCount)

    return respond({ success: true })
  } finally {
    lock.releaseLock()
  }
}

function getUserQuota(body) {
  var sheet = getSheet('Users')
  var row = findRowByValue(sheet, USERS_COL.id, body.id)
  if (!row) return respond({ success: false })
  return respond({
    success: true,
    dailyCallCount: Number(row[USERS_COL.dailyCallCount]) || 0,
    dailyCallResetAt: row[USERS_COL.dailyCallResetAt] || null,
    totalCallCount: Number(row[USERS_COL.totalCallCount]) || 0,
    tier: row[USERS_COL.tier]
  })
}

// ===== USER API KEYS ACTIONS =====

function setApiKey(body) {
  var lock = LockService.getScriptLock()
  lock.waitLock(10000)
  try {
    var sheet = getSheet('UserApiKeys')
    var info = findRowInfo(sheet, USERKEYS_COL.userId, body.userId)
    if (info) {
      // Overwrite existing row
      info.sheet.getRange(info.rowNum, 1, 1, 6).setValues([[
        body.userId,
        body.encryptedKey,
        body.iv,
        body.keyHint,
        body.createdAt,
        body.isValid
      ]])
    } else {
      sheet.appendRow([
        body.userId,
        body.encryptedKey,
        body.iv,
        body.keyHint,
        body.createdAt,
        body.isValid
      ])
    }
    return respond({ success: true })
  } finally {
    lock.releaseLock()
  }
}

function getApiKey(body) {
  var sheet = getSheet('UserApiKeys')
  var row = findRowByValue(sheet, USERKEYS_COL.userId, body.userId)
  if (!row) return respond({ success: false })
  return respond({
    success: true,
    encryptedKey: row[USERKEYS_COL.encryptedKey],
    iv: row[USERKEYS_COL.iv],
    keyHint: row[USERKEYS_COL.keyHint],
    isValid: row[USERKEYS_COL.isValid]
  })
}

function deleteApiKey(body) {
  var lock = LockService.getScriptLock()
  lock.waitLock(10000)
  try {
    var sheet = getSheet('UserApiKeys')
    var info = findRowInfo(sheet, USERKEYS_COL.userId, body.userId)
    if (!info) return respond({ success: false })
    info.sheet.deleteRow(info.rowNum)
    return respond({ success: true })
  } finally {
    lock.releaseLock()
  }
}

// ===== SAVED APIS ACTIONS =====

function createSavedApi(body) {
  var lock = LockService.getScriptLock()
  lock.waitLock(10000)
  try {
    var sheet = getSheet('SavedApis')
    sheet.appendRow([
      body.id,
      body.userId,
      body.name,
      body.description || '',
      body.model,
      body.temperature !== null && body.temperature !== undefined ? body.temperature : '',
      body.topP !== null && body.topP !== undefined ? body.topP : '',
      body.topK !== null && body.topK !== undefined ? body.topK : '',
      body.maxOutputTokens !== null && body.maxOutputTokens !== undefined ? body.maxOutputTokens : '',
      JSON.stringify(body.stopSequences || []),
      JSON.stringify(body.safetySettings || []),
      body.systemPrompt || '',
      0,            // callCount
      body.createdAt,
      body.updatedAt
    ])
    return respond({ success: true, id: body.id })
  } finally {
    lock.releaseLock()
  }
}

function getSavedApisByUser(body) {
  var sheet = getSheet('SavedApis')
  var allRows = getAllDataRows(sheet)
  var apis = allRows
    .filter(function(row) { return row[APIS_COL.userId] === body.userId })
    .map(rowToSavedApi)
  return respond({ success: true, apis: apis })
}

function getSavedApiById(body) {
  var sheet = getSheet('SavedApis')
  var row = findRowByValue(sheet, APIS_COL.id, body.id)
  if (!row) return respond({ success: false })
  return respond({ success: true, api: rowToSavedApi(row) })
}

function updateSavedApi(body) {
  var lock = LockService.getScriptLock()
  lock.waitLock(10000)
  try {
    var sheet = getSheet('SavedApis')
    var info = findRowInfo(sheet, APIS_COL.id, body.id)
    if (!info) return respond({ success: false })

    var row = info.sheet.getRange(info.rowNum, 1, 1, 15).getValues()[0]

    var fieldMap = {
      name: APIS_COL.name,
      description: APIS_COL.description,
      model: APIS_COL.model,
      temperature: APIS_COL.temperature,
      topP: APIS_COL.topP,
      topK: APIS_COL.topK,
      maxOutputTokens: APIS_COL.maxOutputTokens,
      systemPrompt: APIS_COL.systemPrompt
    }

    Object.keys(fieldMap).forEach(function(field) {
      if (body[field] !== undefined) {
        var colIdx = fieldMap[field]
        var val = body[field]
        if (val === null) val = ''
        row[colIdx] = val
      }
    })

    if (body.stopSequences !== undefined) {
      row[APIS_COL.stopSequences] = JSON.stringify(body.stopSequences)
    }
    if (body.safetySettings !== undefined) {
      row[APIS_COL.safetySettings] = JSON.stringify(body.safetySettings)
    }

    row[APIS_COL.updatedAt] = body.updatedAt || new Date().toISOString()

    info.sheet.getRange(info.rowNum, 1, 1, 15).setValues([row])
    return respond({ success: true })
  } finally {
    lock.releaseLock()
  }
}

function deleteSavedApi(body) {
  var lock = LockService.getScriptLock()
  lock.waitLock(10000)
  try {
    var sheet = getSheet('SavedApis')
    var info = findRowInfo(sheet, APIS_COL.id, body.id)
    if (!info) return respond({ success: false })
    info.sheet.deleteRow(info.rowNum)
    return respond({ success: true })
  } finally {
    lock.releaseLock()
  }
}

function incrementApiCallCount(body) {
  var lock = LockService.getScriptLock()
  lock.waitLock(10000)
  try {
    var sheet = getSheet('SavedApis')
    var info = findRowInfo(sheet, APIS_COL.id, body.id)
    if (!info) return respond({ success: false })
    var cell = info.sheet.getRange(info.rowNum, APIS_COL.callCount + 1)
    cell.setValue((Number(cell.getValue()) || 0) + 1)
    return respond({ success: true })
  } finally {
    lock.releaseLock()
  }
}

// ===== CALL LOGS ACTIONS =====

function createCallLog(body) {
  var lock = LockService.getScriptLock()
  lock.waitLock(10000)
  try {
    var sheet = getSheet('CallLogs')
    sheet.appendRow([
      body.id,
      body.savedApiId,
      body.userId,
      body.prompt,
      body.responseText,
      body.model,
      body.promptTokenCount,
      body.responseTokenCount,
      body.totalTokenCount,
      body.finishReason,
      body.tier,
      body.latencyMs,
      body.createdAt
    ])
    return respond({ success: true, id: body.id })
  } finally {
    lock.releaseLock()
  }
}

function getCallLogsByApi(body) {
  var sheet = getSheet('CallLogs')
  var allRows = getAllDataRows(sheet)

  var filtered = allRows
    .filter(function(row) { return row[LOGS_COL.savedApiId] === body.savedApiId })
    .sort(function(a, b) {
      return String(b[LOGS_COL.createdAt]).localeCompare(String(a[LOGS_COL.createdAt]))
    })

  var total = filtered.length
  var page = Number(body.page) || 1
  var limit = Math.min(Number(body.limit) || 20, 50)
  var start = (page - 1) * limit
  var calls = filtered.slice(start, start + limit).map(rowToCallLog)

  return respond({ success: true, calls: calls, total: total })
}

function deleteCallLogsByApi(body) {
  var lock = LockService.getScriptLock()
  lock.waitLock(30000)
  try {
    var sheet = getSheet('CallLogs')
    // Iterate from bottom to top to avoid row index shifting
    var lastRow = sheet.getLastRow()
    for (var i = lastRow; i >= 2; i--) {
      var cellVal = sheet.getRange(i, LOGS_COL.savedApiId + 1).getValue()
      if (cellVal === body.savedApiId) {
        sheet.deleteRow(i)
      }
    }
    return respond({ success: true })
  } finally {
    lock.releaseLock()
  }
}

// ===== ROW MAPPERS =====

function rowToUser(row) {
  return {
    id: row[USERS_COL.id],
    email: row[USERS_COL.email],
    name: row[USERS_COL.name],
    passwordHash: row[USERS_COL.passwordHash],
    createdAt: row[USERS_COL.createdAt],
    lastLoginAt: row[USERS_COL.lastLoginAt] || null,
    isActive: row[USERS_COL.isActive],
    tier: row[USERS_COL.tier],
    totalCallCount: Number(row[USERS_COL.totalCallCount]) || 0,
    dailyCallCount: Number(row[USERS_COL.dailyCallCount]) || 0,
    dailyCallResetAt: row[USERS_COL.dailyCallResetAt] || null,
    refreshToken: row[USERS_COL.refreshToken] || null,
    refreshTokenExpiresAt: row[USERS_COL.refreshTokenExpiresAt] || null
  }
}

function rowToSavedApi(row) {
  return {
    id: row[APIS_COL.id],
    userId: row[APIS_COL.userId],
    name: row[APIS_COL.name],
    description: row[APIS_COL.description] || null,
    model: row[APIS_COL.model],
    temperature: row[APIS_COL.temperature] !== '' ? Number(row[APIS_COL.temperature]) : null,
    topP: row[APIS_COL.topP] !== '' ? Number(row[APIS_COL.topP]) : null,
    topK: row[APIS_COL.topK] !== '' ? Number(row[APIS_COL.topK]) : null,
    maxOutputTokens: row[APIS_COL.maxOutputTokens] !== '' ? Number(row[APIS_COL.maxOutputTokens]) : null,
    stopSequences: safeParseJSON(row[APIS_COL.stopSequences], []),
    safetySettings: safeParseJSON(row[APIS_COL.safetySettings], []),
    systemPrompt: row[APIS_COL.systemPrompt] || null,
    callCount: Number(row[APIS_COL.callCount]) || 0,
    createdAt: row[APIS_COL.createdAt],
    updatedAt: row[APIS_COL.updatedAt]
  }
}

function rowToCallLog(row) {
  return {
    id: row[LOGS_COL.id],
    savedApiId: row[LOGS_COL.savedApiId],
    userId: row[LOGS_COL.userId],
    prompt: row[LOGS_COL.prompt],
    responseText: row[LOGS_COL.responseText],
    model: row[LOGS_COL.model],
    promptTokenCount: Number(row[LOGS_COL.promptTokenCount]) || 0,
    responseTokenCount: Number(row[LOGS_COL.responseTokenCount]) || 0,
    totalTokenCount: Number(row[LOGS_COL.totalTokenCount]) || 0,
    finishReason: row[LOGS_COL.finishReason],
    tier: row[LOGS_COL.tier],
    latencyMs: Number(row[LOGS_COL.latencyMs]) || 0,
    createdAt: row[LOGS_COL.createdAt]
  }
}

// ===== HELPERS =====

function getSheet(name) {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')
  return SpreadsheetApp.openById(id).getSheetByName(name)
}

function getAllDataRows(sheet) {
  var lastRow = sheet.getLastRow()
  if (lastRow < 2) return []
  return sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues()
}

// Returns the matching row array, or null
function findRowByValue(sheet, colIdx, value) {
  var info = findRowInfo(sheet, colIdx, value)
  return info ? info.row : null
}

// Returns { sheet, rowNum (1-based), row } or null
function findRowInfo(sheet, colIdx, value) {
  var lastRow = sheet.getLastRow()
  if (lastRow < 2) return null
  var col = sheet.getRange(2, colIdx + 1, lastRow - 1, 1).getValues()
  for (var i = 0; i < col.length; i++) {
    if (String(col[i][0]) === String(value)) {
      var rowNum = i + 2
      var numCols = sheet.getLastColumn()
      var row = sheet.getRange(rowNum, 1, 1, numCols).getValues()[0]
      return { sheet: sheet, rowNum: rowNum, row: row }
    }
  }
  return null
}

// Kept for legacy use in createUser duplicate check
function findRowById(sheet, colIdx, value) {
  return findRowByValue(sheet, colIdx, value)
}

function safeParseJSON(val, fallback) {
  try {
    return val ? JSON.parse(val) : fallback
  } catch (e) {
    return fallback
  }
}

function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON)
}
