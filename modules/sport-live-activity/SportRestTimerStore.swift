import Foundation
import SQLite3

enum SportRestAction: String {
  case pause
  case resume
  case skip
}

enum SportRestTimerState: String, Equatable {
  case ready
  case running
  case paused
  case finished
  case skipped
  case cancelled
}

struct SportRestTimerSnapshot: Equatable {
  let id: String
  let state: SportRestTimerState
  let startedAt: Date?
  let deadlineAt: Date?
  let durationSeconds: Int
  let pausedRemainingSeconds: Double?
  let endedAt: Date?
}

enum SportRestTimerStoreError: Error, LocalizedError {
  case sqlite(operation: String, code: Int32, message: String)
  case malformedRow(String)

  var errorDescription: String? {
    switch self {
    case .sqlite(let operation, let code, let message):
      return "SQLite \(operation) failed (\(code)): \(message)"
    case .malformedRow(let field):
      return "The persisted rest timer has an invalid \(field) value."
    }
  }
}

enum SportRestTimerStore {
  private static let transientDestructor = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

  static func apply(
    databaseURL: URL,
    restTimerID: String,
    action: SportRestAction,
    now: Date = Date()
  ) throws -> SportRestTimerSnapshot? {
    var database: OpaquePointer?
    let openResult = sqlite3_open_v2(
      databaseURL.path,
      &database,
      SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX,
      nil
    )
    guard openResult == SQLITE_OK, let database else {
      let message = database.map { String(cString: sqlite3_errmsg($0)) } ?? "could not open database"
      if let database { sqlite3_close_v2(database) }
      throw SportRestTimerStoreError.sqlite(operation: "open", code: openResult, message: message)
    }
    defer { sqlite3_close_v2(database) }

    let timeoutResult = sqlite3_busy_timeout(database, 5_000)
    guard timeoutResult == SQLITE_OK else {
      throw sqliteError(database, operation: "set busy timeout", code: timeoutResult)
    }

    try execute(database, sql: "BEGIN IMMEDIATE", operation: "begin transaction")
    var transactionIsOpen = true
    defer {
      if transactionIsOpen {
        _ = sqlite3_exec(database, "ROLLBACK", nil, nil, nil)
      }
    }

    guard let current = try readTimer(database, id: restTimerID) else {
      try execute(database, sql: "COMMIT", operation: "commit missing timer lookup")
      transactionIsOpen = false
      return nil
    }

    let next = try transition(current, action: action, now: now)
    if next != current {
      try writeTimer(database, snapshot: next)
    }

    try execute(database, sql: "COMMIT", operation: "commit timer transition")
    transactionIsOpen = false
    return next
  }

  private static func readTimer(_ database: OpaquePointer, id: String) throws -> SportRestTimerSnapshot? {
    let sql = """
      SELECT id,duration_seconds,state,started_at,deadline_at,paused_remaining_seconds,ended_at
      FROM workout_rest_periods WHERE id=? LIMIT 1
      """
    var statement: OpaquePointer?
    let prepareResult = sqlite3_prepare_v2(database, sql, -1, &statement, nil)
    guard prepareResult == SQLITE_OK, let statement else {
      throw sqliteError(database, operation: "prepare timer lookup", code: prepareResult)
    }
    defer { sqlite3_finalize(statement) }

    try bind(id, to: statement, at: 1, database: database)
    let stepResult = sqlite3_step(statement)
    if stepResult == SQLITE_DONE { return nil }
    guard stepResult == SQLITE_ROW else {
      throw sqliteError(database, operation: "read timer row", code: stepResult)
    }

    guard let timerID = columnString(statement, at: 0),
          timerID == id,
          let stateValue = columnString(statement, at: 2),
          let state = SportRestTimerState(rawValue: stateValue) else {
      throw SportRestTimerStoreError.malformedRow("identity or state")
    }

    let durationSeconds = Int(sqlite3_column_int64(statement, 1))
    guard durationSeconds > 0 else { throw SportRestTimerStoreError.malformedRow("duration") }
    let startedAt = try columnDate(statement, at: 3)
    let deadlineAt = try columnDate(statement, at: 4)
    let pausedRemainingSeconds = columnDouble(statement, at: 5)
    let endedAt = try columnDate(statement, at: 6)
    if let pausedRemainingSeconds,
       !pausedRemainingSeconds.isFinite || pausedRemainingSeconds < 0 || pausedRemainingSeconds > Double(durationSeconds) {
      throw SportRestTimerStoreError.malformedRow("paused remaining time")
    }
    if state == .running, deadlineAt == nil {
      throw SportRestTimerStoreError.malformedRow("running deadline")
    }

    return SportRestTimerSnapshot(
      id: timerID,
      state: state,
      startedAt: startedAt,
      deadlineAt: deadlineAt,
      durationSeconds: durationSeconds,
      pausedRemainingSeconds: pausedRemainingSeconds,
      endedAt: endedAt
    )
  }

  private static func transition(
    _ timer: SportRestTimerSnapshot,
    action: SportRestAction,
    now: Date
  ) throws -> SportRestTimerSnapshot {
    var next = timer

    // transitionRestTimer first ticks a running timer for every non-tick action.
    if timer.state == .running {
      guard let deadline = timer.deadlineAt else {
        throw SportRestTimerStoreError.malformedRow("running deadline")
      }
      if remainingSeconds(until: deadline, now: now) == 0 {
        next = SportRestTimerSnapshot(
          id: timer.id,
          state: .finished,
          startedAt: timer.startedAt,
          deadlineAt: nil,
          durationSeconds: timer.durationSeconds,
          pausedRemainingSeconds: nil,
          endedAt: deadline
        )
      }
    }

    switch action {
    case .pause where next.state == .running:
      guard let deadline = next.deadlineAt else {
        throw SportRestTimerStoreError.malformedRow("running deadline")
      }
      let remaining = remainingSeconds(until: deadline, now: now)
      if remaining == 0 {
        next = SportRestTimerSnapshot(
          id: next.id,
          state: .finished,
          startedAt: next.startedAt,
          deadlineAt: nil,
          durationSeconds: next.durationSeconds,
          pausedRemainingSeconds: nil,
          endedAt: deadline
        )
      } else {
        next = SportRestTimerSnapshot(
          id: next.id,
          state: .paused,
          startedAt: next.startedAt,
          deadlineAt: nil,
          durationSeconds: next.durationSeconds,
          pausedRemainingSeconds: Double(remaining),
          endedAt: next.endedAt
        )
      }
    case .resume where next.state == .paused:
      let remaining = next.pausedRemainingSeconds ?? 0
      if remaining == 0 {
        // Match transitionRestTimer: a zero-second resume finishes but leaves the
        // persisted pausedRemainingSeconds value in place.
        next = SportRestTimerSnapshot(
          id: next.id,
          state: .finished,
          startedAt: next.startedAt,
          deadlineAt: nil,
          durationSeconds: next.durationSeconds,
          pausedRemainingSeconds: next.pausedRemainingSeconds,
          endedAt: now
        )
      } else {
        next = SportRestTimerSnapshot(
          id: next.id,
          state: .running,
          startedAt: next.startedAt,
          deadlineAt: now.addingTimeInterval(remaining),
          durationSeconds: next.durationSeconds,
          pausedRemainingSeconds: nil,
          endedAt: next.endedAt
        )
      }
    case .skip where [.ready, .running, .paused].contains(next.state):
      next = SportRestTimerSnapshot(
        id: next.id,
        state: .skipped,
        startedAt: next.startedAt,
        deadlineAt: nil,
        durationSeconds: next.durationSeconds,
        pausedRemainingSeconds: nil,
        endedAt: now
      )
    default:
      break
    }

    return next
  }

  private static func writeTimer(_ database: OpaquePointer, snapshot: SportRestTimerSnapshot) throws {
    let sql = """
      UPDATE workout_rest_periods
      SET state=?,deadline_at=?,paused_remaining_seconds=?,ended_at=?
      WHERE id=?
      """
    var statement: OpaquePointer?
    let prepareResult = sqlite3_prepare_v2(database, sql, -1, &statement, nil)
    guard prepareResult == SQLITE_OK, let statement else {
      throw sqliteError(database, operation: "prepare timer update", code: prepareResult)
    }
    defer { sqlite3_finalize(statement) }

    try bind(snapshot.state.rawValue, to: statement, at: 1, database: database)
    try bind(snapshot.deadlineAt.map(iso8601), to: statement, at: 2, database: database)
    if let remaining = snapshot.pausedRemainingSeconds {
      let result = sqlite3_bind_double(statement, 3, remaining)
      guard result == SQLITE_OK else { throw sqliteError(database, operation: "bind paused time", code: result) }
    } else {
      let result = sqlite3_bind_null(statement, 3)
      guard result == SQLITE_OK else { throw sqliteError(database, operation: "bind paused time", code: result) }
    }
    try bind(snapshot.endedAt.map(iso8601), to: statement, at: 4, database: database)
    try bind(snapshot.id, to: statement, at: 5, database: database)

    let stepResult = sqlite3_step(statement)
    guard stepResult == SQLITE_DONE else {
      throw sqliteError(database, operation: "update timer row", code: stepResult)
    }
    guard sqlite3_changes(database) == 1 else {
      throw SportRestTimerStoreError.malformedRow("timer identity during update")
    }
  }

  private static func remainingSeconds(until deadline: Date, now: Date) -> Int {
    let remaining = ceil(deadline.timeIntervalSince(now))
    guard remaining > 0 else { return 0 }
    return remaining >= Double(Int.max) ? Int.max : Int(remaining)
  }

  private static func columnString(_ statement: OpaquePointer, at index: Int32) -> String? {
    guard sqlite3_column_type(statement, index) != SQLITE_NULL,
          let value = sqlite3_column_text(statement, index) else { return nil }
    let length = Int(sqlite3_column_bytes(statement, index))
    return String(decoding: UnsafeBufferPointer(start: value, count: length), as: UTF8.self)
  }

  private static func columnDouble(_ statement: OpaquePointer, at index: Int32) -> Double? {
    guard sqlite3_column_type(statement, index) != SQLITE_NULL else { return nil }
    return sqlite3_column_double(statement, index)
  }

  private static func columnDate(_ statement: OpaquePointer, at index: Int32) throws -> Date? {
    guard let value = columnString(statement, at: index) else { return nil }
    let formatter = ISO8601DateFormatter()
    if let date = formatter.date(from: value) { return date }
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    guard let date = formatter.date(from: value) else {
      throw SportRestTimerStoreError.malformedRow("timestamp")
    }
    return date
  }

  private static func iso8601(_ date: Date) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: date)
  }

  private static func bind(_ value: String?, to statement: OpaquePointer, at index: Int32, database: OpaquePointer) throws {
    let result: Int32
    if let value {
      result = value.withCString { sqlite3_bind_text(statement, index, $0, -1, transientDestructor) }
    } else {
      result = sqlite3_bind_null(statement, index)
    }
    guard result == SQLITE_OK else { throw sqliteError(database, operation: "bind timer value", code: result) }
  }

  private static func execute(_ database: OpaquePointer, sql: String, operation: String) throws {
    var errorMessage: UnsafeMutablePointer<CChar>?
    let result = sqlite3_exec(database, sql, nil, nil, &errorMessage)
    guard result == SQLITE_OK else {
      let message = errorMessage.map { String(cString: $0) } ?? String(cString: sqlite3_errmsg(database))
      sqlite3_free(errorMessage)
      throw SportRestTimerStoreError.sqlite(operation: operation, code: result, message: message)
    }
  }

  private static func sqliteError(_ database: OpaquePointer, operation: String, code: Int32) -> SportRestTimerStoreError {
    SportRestTimerStoreError.sqlite(operation: operation, code: code, message: String(cString: sqlite3_errmsg(database)))
  }
}
