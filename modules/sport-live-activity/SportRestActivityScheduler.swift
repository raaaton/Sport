import ActivityKit
import Foundation

enum SportRestActivityScheduler {
  private static let countdownActivityName = "SportRestActivity"
  private static let completionActivityName = "SportRestCompletionActivity"

  static func reportScheduleFailure(_ error: Error) {
    NSLog("[Sport] Could not schedule the rest completion Live Activity: %@", error.localizedDescription)
  }

  static func schedule(activityName: String, propsJSON: String, url: String?, staleDate: Date?) throws {
    guard activityName == countdownActivityName,
          let fields = fields(from: propsJSON),
          fields["state"] as? String == "running",
          let restTimerID = fields["restTimerId"] as? String,
          !restTimerID.isEmpty,
          let deadline = staleDate,
          deadline > Date() else { return }

    if matchingCompletionActivities(restTimerID: restTimerID).contains(where: {
      isLive($0.activityState) && parseDeadline(in: $0.content.state.props) == deadline
    }) {
      return
    }

    var completionFields = fields
    completionFields["state"] = "finished"
    completionFields["pausedRemainingSeconds"] = NSNull()
    let completionData = try JSONSerialization.data(withJSONObject: completionFields, options: [.sortedKeys])
    guard let completionProps = String(data: completionData, encoding: .utf8) else { return }

    let attributes = LiveActivityAttributes(url: url)
    let state = LiveActivityAttributes.ContentState(name: completionActivityName, props: completionProps)
    let content = ActivityContent(state: state, staleDate: deadline.addingTimeInterval(30), relevanceScore: 100)
    let alert = AlertConfiguration(
      title: "Repos terminé",
      body: "La prochaine série peut commencer.",
      sound: .default
    )

    _ = try Activity<LiveActivityAttributes>.request(
      attributes: attributes,
      content: content,
      pushType: nil,
      style: .standard,
      alertConfiguration: alert,
      start: deadline
    )

    Task {
      await cancelCompletionActivities(exceptRestTimerID: restTimerID)
    }
  }

  static func synchronize(activityName: String, propsJSON: String, url: String?, staleDate: Date?) async {
    guard activityName == countdownActivityName,
          let fields = fields(from: propsJSON),
          let restTimerID = fields["restTimerId"] as? String,
          !restTimerID.isEmpty else { return }

    guard fields["state"] as? String == "running" else {
      await cancelCompletionActivities(restTimerID: restTimerID)
      return
    }

    guard let deadline = staleDate else {
      await cancelCompletionActivities(restTimerID: restTimerID)
      return
    }

    let activities = matchingCompletionActivities(restTimerID: restTimerID)
    if activities.contains(where: {
      ($0.activityState == .pending || $0.activityState == .active || $0.activityState == .stale) &&
        parseDeadline(in: $0.content.state.props) == deadline
    }) {
      return
    }

    if deadline <= Date() {
      if !activities.contains(where: { isLive($0.activityState) }) {
        do {
          try scheduleNow(propsJSON: propsJSON, url: url)
        } catch {
          reportScheduleFailure(error)
        }
      }
      return
    }

    await cancelCompletionActivities(restTimerID: restTimerID)
    do {
      try schedule(activityName: activityName, propsJSON: propsJSON, url: url, staleDate: deadline)
    } catch {
      reportScheduleFailure(error)
    }
  }

  static func cancelIfEarlyEnd(propsJSON: String, activityName: String) async {
    guard activityName == countdownActivityName,
          let fields = fields(from: propsJSON),
          let restTimerID = fields["restTimerId"] as? String else { return }

    if fields["state"] as? String == "running",
       let deadline = parseDeadline(in: fields),
       deadline <= Date() {
      return
    }

    await cancelCompletionActivities(restTimerID: restTimerID)
  }

  static func cancelCompletionActivities(restTimerID: String) async {
    for activity in matchingCompletionActivities(restTimerID: restTimerID) {
      await activity.end(activity.content, dismissalPolicy: .immediate)
    }
  }

  static func ensureCompletion(propsJSON: String, url: String?) async {
    guard let fields = fields(from: propsJSON),
          fields["state"] as? String == "running",
          let restTimerID = fields["restTimerId"] as? String,
          let deadline = parseDeadline(in: fields),
          deadline <= Date(),
          !matchingCompletionActivities(restTimerID: restTimerID).contains(where: { isLive($0.activityState) }) else { return }
    do {
      try scheduleNow(propsJSON: propsJSON, url: url)
    } catch {
      reportScheduleFailure(error)
    }
  }

  private static func scheduleNow(propsJSON: String, url: String?) throws {
    guard let fields = fields(from: propsJSON),
          let restTimerID = fields["restTimerId"] as? String,
          !matchingCompletionActivities(restTimerID: restTimerID).contains(where: {
            $0.activityState == .active || $0.activityState == .stale
          }) else { return }

    try schedule(activityName: countdownActivityName, propsJSON: propsJSON, url: url, staleDate: Date().addingTimeInterval(1))
  }

  private static func matchingCompletionActivities(restTimerID: String) -> [Activity<LiveActivityAttributes>] {
    Activity<LiveActivityAttributes>.activities.filter { activity in
      activity.content.state.name == completionActivityName &&
        Self.restTimerID(in: activity.content.state.props) == restTimerID
    }
  }

  private static func fields(from propsJSON: String) -> [String: Any]? {
    guard let data = propsJSON.data(using: .utf8),
          let value = try? JSONSerialization.jsonObject(with: data) else { return nil }
    return value as? [String: Any]
  }

  private static func restTimerID(in propsJSON: String) -> String? {
    fields(from: propsJSON)?["restTimerId"] as? String
  }

  private static func parseDeadline(in propsJSON: String) -> Date? {
    guard let props = fields(from: propsJSON) else { return nil }
    return parseDeadline(in: props)
  }

  private static func parseDeadline(in props: [String: Any]) -> Date? {
    guard let rawValue = props["restEndsAt"] as? String else { return nil }
    let formatter = ISO8601DateFormatter()
    if let date = formatter.date(from: rawValue) { return date }
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.date(from: rawValue)
  }

  private static func isLive(_ state: ActivityState) -> Bool {
    state == .pending || state == .active || state == .stale
  }

  private static func cancelCompletionActivities(exceptRestTimerID restTimerID: String) async {
    for activity in Activity<LiveActivityAttributes>.activities where
      activity.content.state.name == completionActivityName &&
        self.restTimerID(in: activity.content.state.props) != restTimerID {
      await activity.end(activity.content, dismissalPolicy: .immediate)
    }
  }
}
