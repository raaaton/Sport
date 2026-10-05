import ActivityKit
import AppIntents
import Foundation

@available(iOS 26.0, *)
struct SportRestTimerActionIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Rest timer action"
  static var isDiscoverable = false
  static var openAppWhenRun = false

  @Parameter(title: "Activity ID")
  var activityID: String

  @Parameter(title: "Rest timer ID")
  var restTimerID: String

  @Parameter(title: "Action")
  var action: String

  init() {}

  init(activityID: String, restTimerID: String, action: String) {
    self.activityID = activityID
    self.restTimerID = restTimerID
    self.action = action
  }

  func perform() async throws -> some IntentResult {
    guard let requestedAction = SportRestAction(rawValue: action),
          let activity = Activity<LiveActivityAttributes>.activities.first(where: { $0.id == activityID }),
          activity.content.state.name == "SportRestActivity",
          let propsData = activity.content.state.props.data(using: .utf8),
          let decodedProps = try? JSONSerialization.jsonObject(with: propsData),
          var props = decodedProps as? [String: Any],
          props["restTimerId"] as? String == restTimerID else {
      return .result()
    }

    guard let databaseURL = Self.databaseURL() else {
      throw SportRestTimerActionError.applicationDatabaseUnavailable
    }

    // This transaction is the authority for the action. ActivityKit is changed
    // only after the SQLite commit succeeds.
    guard let snapshot = try SportRestTimerStore.apply(
      databaseURL: databaseURL,
      restTimerID: restTimerID,
      action: requestedAction
    ) else {
      await SportRestActivityScheduler.cancelCompletionActivities(restTimerID: restTimerID)
      await activity.end(activity.content, dismissalPolicy: .immediate)
      return .result()
    }

    guard snapshot.state == .running || snapshot.state == .paused else {
      if snapshot.state == .finished {
        await SportRestActivityScheduler.ensureCompletion(propsJSON: activity.content.state.props, url: activity.attributes.url)
      } else {
        await SportRestActivityScheduler.cancelCompletionActivities(restTimerID: restTimerID)
      }
      await activity.end(activity.content, dismissalPolicy: .immediate)
      return .result()
    }

    props["state"] = snapshot.state.rawValue
    if let deadlineAt = snapshot.deadlineAt {
      props["restEndsAt"] = Self.iso8601(deadlineAt)
    } else {
      props["restEndsAt"] = NSNull()
    }
    if let remaining = snapshot.pausedRemainingSeconds {
      props["pausedRemainingSeconds"] = remaining
    } else {
      props["pausedRemainingSeconds"] = NSNull()
    }

    guard JSONSerialization.isValidJSONObject(props) else {
      throw SportRestTimerActionError.invalidActivityState
    }
    let updatedPropsData = try JSONSerialization.data(withJSONObject: props)
    guard let updatedProps = String(data: updatedPropsData, encoding: .utf8) else {
      throw SportRestTimerActionError.invalidActivityState
    }

    await SportRestActivityScheduler.synchronize(
      activityName: activity.content.state.name,
      propsJSON: updatedProps,
      url: activity.attributes.url,
      staleDate: snapshot.deadlineAt
    )

    var updatedState = activity.content.state
    updatedState.props = updatedProps
    await activity.update(ActivityContent(state: updatedState, staleDate: snapshot.deadlineAt))
    return .result()
  }

  private static func databaseURL() -> URL? {
    guard let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
      return nil
    }
    return documentsURL
      .appendingPathComponent("SQLite", isDirectory: true)
      .appendingPathComponent("sport.db", isDirectory: false)
  }

  private static func iso8601(_ date: Date) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: date)
  }
}

private enum SportRestTimerActionError: Error {
  case applicationDatabaseUnavailable
  case invalidActivityState
}
