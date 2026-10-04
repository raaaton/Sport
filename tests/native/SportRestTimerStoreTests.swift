import Foundation
import SQLite3

private enum TestFailure: Error, CustomStringConvertible {
  case assertion(String)
  case sqlite(String)

  var description: String {
    switch self {
    case .assertion(let message): return message
    case .sqlite(let message): return message
    }
  }
}

private var temporaryDatabaseDirectories: [URL] = []

private func expect(_ condition: @autoclosure () -> Bool, _ message: String) throws {
  guard condition() else { throw TestFailure.assertion(message) }
}

private func iso(_ date: Date) -> String {
  let formatter = ISO8601DateFormatter()
  formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  return formatter.string(from: date)
}

private func escapedSQL(_ value: String) -> String {
  value.replacingOccurrences(of: "'", with: "''")
}

private func makeDatabase(rows: [(id: String, state: String, startedAt: String?, deadlineAt: String?, paused: Double?, endedAt: String?)] = []) throws -> URL {
  let directory = FileManager.default.temporaryDirectory.appendingPathComponent("sport-rest-store-\(UUID().uuidString)", isDirectory: true)
  try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
  temporaryDatabaseDirectories.append(directory)
  let url = directory.appendingPathComponent("sport.db")

  var database: OpaquePointer?
  guard sqlite3_open(url.path, &database) == SQLITE_OK, let database else {
    throw TestFailure.sqlite("Could not create test database")
  }
  defer { sqlite3_close(database) }

  var errorMessage: UnsafeMutablePointer<CChar>?
  let createSQL = """
    CREATE TABLE workout_rest_periods (
      id TEXT PRIMARY KEY NOT NULL,
      duration_seconds INTEGER NOT NULL,
      state TEXT NOT NULL,
      started_at TEXT,
      deadline_at TEXT,
      paused_remaining_seconds REAL,
      ended_at TEXT
    );
    """
  guard sqlite3_exec(database, createSQL, nil, nil, &errorMessage) == SQLITE_OK else {
    let message = errorMessage.map { String(cString: $0) } ?? "unknown SQLite error"
    sqlite3_free(errorMessage)
    throw TestFailure.sqlite("Could not create test schema: \(message)")
  }

  for row in rows {
    let startedAt = row.startedAt.map { "'\(escapedSQL($0))'" } ?? "NULL"
    let deadlineAt = row.deadlineAt.map { "'\(escapedSQL($0))'" } ?? "NULL"
    let paused = row.paused.map { String($0) } ?? "NULL"
    let endedAt = row.endedAt.map { "'\(escapedSQL($0))'" } ?? "NULL"
    let sql = "INSERT INTO workout_rest_periods(id,duration_seconds,state,started_at,deadline_at,paused_remaining_seconds,ended_at) VALUES ('\(escapedSQL(row.id))',180,'\(escapedSQL(row.state))',\(startedAt),\(deadlineAt),\(paused),\(endedAt));"
    guard sqlite3_exec(database, sql, nil, nil, &errorMessage) == SQLITE_OK else {
      let message = errorMessage.map { String(cString: $0) } ?? "unknown SQLite error"
      sqlite3_free(errorMessage)
      throw TestFailure.sqlite("Could not insert test timer: \(message)")
    }
  }

  return url
}

private func state(at databaseURL: URL, id: String) throws -> String? {
  var database: OpaquePointer?
  guard sqlite3_open_v2(databaseURL.path, &database, SQLITE_OPEN_READONLY, nil) == SQLITE_OK, let database else {
    throw TestFailure.sqlite("Could not open test database for reading")
  }
  defer { sqlite3_close(database) }

  var statement: OpaquePointer?
  let sql = "SELECT state FROM workout_rest_periods WHERE id='\(escapedSQL(id))' LIMIT 1"
  guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK, let statement else {
    throw TestFailure.sqlite("Could not prepare test state query")
  }
  defer { sqlite3_finalize(statement) }
  guard sqlite3_step(statement) == SQLITE_ROW, let value = sqlite3_column_text(statement, 0) else { return nil }
  return String(cString: value)
}

private func runningRow(id: String = "timer-1", deadlineAt: Date, startedAt: Date) -> (id: String, state: String, startedAt: String?, deadlineAt: String?, paused: Double?, endedAt: String?) {
  (id, "running", iso(startedAt), iso(deadlineAt), nil, nil)
}

private func pausedRow(id: String = "timer-1", remaining: Double, startedAt: Date) -> (id: String, state: String, startedAt: String?, deadlineAt: String?, paused: Double?, endedAt: String?) {
  (id, "paused", iso(startedAt), nil, remaining, nil)
}

@main
private struct SportRestTimerStoreTests {
  static func main() throws {
    defer {
      for directory in temporaryDatabaseDirectories {
        try? FileManager.default.removeItem(at: directory)
      }
    }

    try pausesRunningTimerAndRoundsRemainingSecondsUp()
    try duplicatePauseIsIdempotent()
    try resumesPausedTimerFromPersistedRemainingTime()
    try zeroSecondResumeFinishesWithoutRestarting()
    try skipEndsRunningAndPausedTimers()
    try missingTimerDoesNotChangeAnotherRow()
    try terminalTimerIsUnchanged()
    try pauseAtTheDeadlineFinishesTheTimer()
    try databaseOpenDoesNotCreateAMissingFile()
    print("SportRestTimerStore: 9 cases passed")
  }

  private static func pausesRunningTimerAndRoundsRemainingSecondsUp() throws {
    let now = Date(timeIntervalSince1970: 1_800_000_000)
    let url = try makeDatabase(rows: [runningRow(deadlineAt: now.addingTimeInterval(1.2), startedAt: now.addingTimeInterval(-30))])
    let snapshot = try SportRestTimerStore.apply(databaseURL: url, restTimerID: "timer-1", action: .pause, now: now)
    try expect(snapshot?.state == .paused, "Pause should persist paused state")
    try expect(snapshot?.pausedRemainingSeconds == 2, "Pause should ceil the remaining seconds")
    try expect(snapshot?.deadlineAt == nil, "Paused timers should clear the running deadline")
    try expect(snapshot?.startedAt == now.addingTimeInterval(-30), "Pause should preserve the original start time")
  }

  private static func duplicatePauseIsIdempotent() throws {
    let now = Date(timeIntervalSince1970: 1_800_000_000)
    let url = try makeDatabase(rows: [pausedRow(remaining: 47.25, startedAt: now.addingTimeInterval(-20))])
    let snapshot = try SportRestTimerStore.apply(databaseURL: url, restTimerID: "timer-1", action: .pause, now: now)
    try expect(snapshot?.state == .paused, "Repeated Pause must remain paused")
    try expect(snapshot?.pausedRemainingSeconds == 47.25, "Repeated Pause must preserve the saved remaining time")
  }

  private static func resumesPausedTimerFromPersistedRemainingTime() throws {
    let now = Date(timeIntervalSince1970: 1_800_000_000)
    let url = try makeDatabase(rows: [pausedRow(remaining: 42.5, startedAt: now.addingTimeInterval(-20))])
    let snapshot = try SportRestTimerStore.apply(databaseURL: url, restTimerID: "timer-1", action: .resume, now: now)
    try expect(snapshot?.state == .running, "Resume should persist running state")
    try expect(snapshot?.deadlineAt?.timeIntervalSince(now) == 42.5, "Resume should derive the deadline from remaining time")
    try expect(snapshot?.pausedRemainingSeconds == nil, "Resume should clear paused remaining time")
  }

  private static func zeroSecondResumeFinishesWithoutRestarting() throws {
    let now = Date(timeIntervalSince1970: 1_800_000_000)
    let url = try makeDatabase(rows: [pausedRow(remaining: 0, startedAt: now.addingTimeInterval(-20))])
    let snapshot = try SportRestTimerStore.apply(databaseURL: url, restTimerID: "timer-1", action: .resume, now: now)
    try expect(snapshot?.state == .finished, "Resuming a zero-second pause should finish the timer")
    try expect(snapshot?.endedAt == now, "A zero-second resume should use its action time")
    try expect(snapshot?.pausedRemainingSeconds == 0, "The native transition should match the existing machine for a zero-second resume")
  }

  private static func skipEndsRunningAndPausedTimers() throws {
    let now = Date(timeIntervalSince1970: 1_800_000_000)
    for row in [runningRow(deadlineAt: now.addingTimeInterval(60), startedAt: now), pausedRow(remaining: 60, startedAt: now)] {
      let url = try makeDatabase(rows: [row])
      let snapshot = try SportRestTimerStore.apply(databaseURL: url, restTimerID: row.id, action: .skip, now: now)
      try expect(snapshot?.state == .skipped, "Stop should reuse the persisted skip transition")
      try expect(snapshot?.deadlineAt == nil && snapshot?.pausedRemainingSeconds == nil, "Skipped timers should clear active countdown fields")
      try expect(snapshot?.endedAt == now, "Skip should persist its action time")
    }
  }

  private static func missingTimerDoesNotChangeAnotherRow() throws {
    let now = Date(timeIntervalSince1970: 1_800_000_000)
    let url = try makeDatabase(rows: [runningRow(id: "other-timer", deadlineAt: now.addingTimeInterval(60), startedAt: now)])
    let snapshot = try SportRestTimerStore.apply(databaseURL: url, restTimerID: "missing-timer", action: .skip, now: now)
    try expect(snapshot == nil, "A missing activity timer should be reported without selecting another row")
    let otherState = try state(at: url, id: "other-timer")
    try expect(otherState == "running", "A missing ID must not mutate another row")
  }

  private static func terminalTimerIsUnchanged() throws {
    let now = Date(timeIntervalSince1970: 1_800_000_000)
    let endedAt = iso(now.addingTimeInterval(-5))
    let url = try makeDatabase(rows: [("timer-1", "finished", iso(now.addingTimeInterval(-180)), nil, nil, endedAt)])
    let snapshot = try SportRestTimerStore.apply(databaseURL: url, restTimerID: "timer-1", action: .skip, now: now)
    try expect(snapshot?.state == .finished, "Terminal timers should remain terminal")
    try expect(abs((snapshot?.endedAt ?? .distantFuture).timeIntervalSince(now.addingTimeInterval(-5))) < 0.001, "Terminal timestamps should be preserved")
  }

  private static func pauseAtTheDeadlineFinishesTheTimer() throws {
    let now = Date(timeIntervalSince1970: 1_800_000_000)
    let deadline = now.addingTimeInterval(-0.1)
    let url = try makeDatabase(rows: [runningRow(deadlineAt: deadline, startedAt: now.addingTimeInterval(-180))])
    let snapshot = try SportRestTimerStore.apply(databaseURL: url, restTimerID: "timer-1", action: .pause, now: now)
    try expect(snapshot?.state == .finished, "Pause racing expiry should finish the timer")
    try expect(snapshot?.endedAt == deadline, "A deadline finish should preserve the deadline as endedAt")
    try expect(snapshot?.deadlineAt == nil && snapshot?.pausedRemainingSeconds == nil, "Finished timers should clear active countdown fields")
  }

  private static func databaseOpenDoesNotCreateAMissingFile() throws {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent("missing-sport-rest-\(UUID().uuidString).db")
    do {
      _ = try SportRestTimerStore.apply(databaseURL: url, restTimerID: "timer-1", action: .pause, now: Date())
      throw TestFailure.assertion("Opening a missing database must fail")
    } catch is TestFailure {
      throw TestFailure.assertion("Opening a missing database must fail without creating the file")
    } catch {
      try expect(!FileManager.default.fileExists(atPath: url.path), "Read/write open must not create a new database")
    }
  }
}
