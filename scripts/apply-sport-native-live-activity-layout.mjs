import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagePath = resolve(projectRoot, 'node_modules/expo-widgets/package.json');
const sourcePath = resolve(projectRoot, 'node_modules/expo-widgets/ios/Widgets/WidgetLiveActivity.swift');
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));

if (packageJson.version !== '57.0.22') {
  throw new Error(`Expected expo-widgets 57.0.22, found ${packageJson.version}. Recheck the Sport native layout patch.`);
}

let source = readFileSync(sourcePath, 'utf8');
const sectionBefore = `    if let node = nodes[sectionName] as? [String: Any] {
      WidgetsDynamicView(name: context.activityID, kind: .liveActivity, node: node)
    } else {
      EmptyView()
    }`;
const sectionAfter = `    if context.state.name == "SportRestActivity" {
      SportRestIslandSection(propsJSON: context.state.props, sectionName: sectionName)
    } else if let node = nodes[sectionName] as? [String: Any] {
      WidgetsDynamicView(name: context.activityID, kind: .liveActivity, node: node)
    } else {
      EmptyView()
    }`;
const bannerBefore = `    if #available(iOS 18.0, *) {
      LiveActivityBanner(context: context, nodes: nodes)
    } else if let node = nodes["banner"] as? [String: Any] {
      WidgetsDynamicView(name: context.activityID, kind: .liveActivity, node: node)
    } else {
      EmptyView()
    }`;
const bannerAfter = `    if context.state.name == "SportRestActivity" {
      SportRestLockScreen(propsJSON: context.state.props)
    } else if #available(iOS 18.0, *) {
      LiveActivityBanner(context: context, nodes: nodes)
    } else if let node = nodes["banner"] as? [String: Any] {
      WidgetsDynamicView(name: context.activityID, kind: .liveActivity, node: node)
    } else {
      EmptyView()
    }`;

if (!source.includes('SportRestIslandSection(propsJSON: context.state.props')) {
  if (!source.includes(sectionBefore) || !source.includes(bannerBefore)) {
    throw new Error('Could not locate the expected expo-widgets live activity rendering branches.');
  }
  source = source.replace(sectionBefore, sectionAfter).replace(bannerBefore, bannerAfter);
}

const marker = 'extension WidgetConfiguration {';
const nativeViews = `
@available(iOS 16.1, *)
private struct SportRestProps: Decodable {
  let exerciseName: String
  let nextSetNumber: Int
  let targetSets: Int
  let state: String
  let restEndsAt: String?
  let pausedRemainingSeconds: Double?

  var deadline: Date? {
    guard let restEndsAt else { return nil }
    let formatter = ISO8601DateFormatter()
    if let date = formatter.date(from: restEndsAt) { return date }
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.date(from: restEndsAt)
  }

  static func decode(_ json: String) -> SportRestProps? {
    guard let data = json.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(SportRestProps.self, from: data)
  }

  var pausedTime: String {
    let seconds = max(0, Int(ceil(pausedRemainingSeconds ?? 0)))
    return "\\(seconds / 60):\\(String(format: \"%02d\", seconds % 60))"
  }
}

@available(iOS 16.1, *)
private struct SportRestClock: View {
  let props: SportRestProps
  let size: CGFloat

  var body: some View {
    Group {
      if props.state == "paused" {
        Text(props.pausedTime)
      } else if let deadline = props.deadline, deadline > .now {
        Text(timerInterval: Date.now...deadline, countsDown: true, showsHours: false)
      } else {
        Text("0:00")
      }
    }
    .font(.system(size: size, weight: .bold, design: .rounded))
    .monospacedDigit()
    .lineLimit(1)
    .minimumScaleFactor(0.75)
  }
}

@available(iOS 16.1, *)
private struct SportRestIslandSection: View {
  let propsJSON: String
  let sectionName: String

  var body: some View {
    if let props = SportRestProps.decode(propsJSON) {
      switch sectionName {
      case "compactLeading":
        Text("REST").font(.system(size: 11, weight: .bold)).foregroundStyle(.white)
      case "compactTrailing":
        if props.state == "paused" {
          Text("Pause").font(.system(size: 13, weight: .semibold)).foregroundStyle(.white)
        } else {
          SportRestClock(props: props, size: 14).foregroundStyle(.white)
        }
      case "minimal":
        Text("R").font(.system(size: 11, weight: .bold)).foregroundStyle(.white)
      case "expandedLeading":
        VStack(alignment: .leading, spacing: 4) {
          Text(props.exerciseName).font(.subheadline.weight(.semibold)).lineLimit(1).foregroundStyle(.white)
          Text("Prochaine · \\(props.nextSetNumber)/\\(props.targetSets)")
            .font(.caption).lineLimit(1).foregroundStyle(.white.opacity(0.72))
        }
      case "expandedTrailing":
        VStack(alignment: .trailing, spacing: 3) {
          Text(props.state == "paused" ? "PAUSE" : "REST")
            .font(.caption2.weight(.bold)).foregroundStyle(.white.opacity(0.72))
          SportRestClock(props: props, size: 22).foregroundStyle(.white)
        }
      case "expandedBottom":
        EmptyView()
      default:
        EmptyView()
      }
    } else {
      Text("REST").font(.caption.weight(.bold)).foregroundStyle(.white)
    }
  }
}

@available(iOS 16.1, *)
private struct SportRestLockScreen: View {
  let propsJSON: String

  var body: some View {
    if let props = SportRestProps.decode(propsJSON) {
      HStack(alignment: .center, spacing: 16) {
        VStack(alignment: .leading, spacing: 4) {
          Text(props.exerciseName).font(.headline.weight(.semibold)).lineLimit(1)
          Text("Prochaine série · \\(props.nextSetNumber)/\\(props.targetSets)")
            .font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
        }
        Spacer(minLength: 8)
        VStack(alignment: .trailing, spacing: 3) {
          Text(props.state == "paused" ? "PAUSE" : "REST").font(.caption2.weight(.bold)).foregroundStyle(.secondary)
          SportRestClock(props: props, size: 30)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.vertical, 2)
    } else {
      Text("Repos en cours").font(.headline).frame(maxWidth: .infinity, alignment: .leading)
    }
  }
}

`;

if (!source.includes('private struct SportRestProps: Decodable')) {
  if (!source.includes(marker)) throw new Error('Could not locate the expo-widgets configuration insertion point.');
  source = source.replace(marker, `${nativeViews}${marker}`);
}

if (!source.includes('SportRestLockScreen(propsJSON: context.state.props)') ||
    !source.includes('Text(timerInterval: Date.now...deadline')) {
  throw new Error('The Sport native Live Activity layout patch was not applied completely.');
}

writeFileSync(sourcePath, source);
