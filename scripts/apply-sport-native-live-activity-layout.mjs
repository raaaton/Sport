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
if (!source.includes('import UIKit')) {
  if (!source.includes('import SwiftUI')) throw new Error('Could not locate SwiftUI import in expo-widgets activity renderer.');
  source = source.replace('import SwiftUI', 'import SwiftUI\nimport UIKit');
}
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
const bannerContentBefore = `      if let url = context.attributes.url.flatMap(URL.init(string:)) {
        banner.widgetURL(url)
      } else {
        banner
      }`;
const bannerContentAfter = `      if let url = context.attributes.url.flatMap(URL.init(string:)) {
        banner.widgetURL(url)
          .activityBackgroundTint(SportActivityStyle.lockScreenBackground)
          .activitySystemActionForegroundColor(Color.primary)
      } else {
        banner
          .activityBackgroundTint(SportActivityStyle.lockScreenBackground)
          .activitySystemActionForegroundColor(Color.primary)
      }`;

if (!source.includes('SportRestIslandSection(propsJSON: context.state.props')) {
  if (!source.includes(sectionBefore) || !source.includes(bannerBefore)) {
    throw new Error('Could not locate the expected expo-widgets live activity rendering branches.');
  }
  source = source.replace(sectionBefore, sectionAfter).replace(bannerBefore, bannerAfter);
}

if (!source.includes('.activityBackgroundTint(SportActivityStyle.lockScreenBackground)')) {
  if (!source.includes(bannerContentBefore)) {
    throw new Error('Could not locate the expected Lock Screen banner modifiers in expo-widgets.');
  }
  source = source.replace(bannerContentBefore, bannerContentAfter);
}

if (!source.includes('.keylineTint(SportActivityStyle.islandKeyline)')) {
  source = source
    .replace('return island.widgetURL(url)', 'return island.widgetURL(url).keylineTint(SportActivityStyle.islandKeyline)')
    .replace('return island\n', 'return island.keylineTint(SportActivityStyle.islandKeyline)\n');
}

const marker = 'extension WidgetConfiguration {';
const nativeViews = `
// SPORT_REST_LIVE_ACTIVITY_NATIVE_VIEWS_BEGIN
@available(iOS 16.1, *)
private enum SportActivityStyle {
  static let lockScreenBackground = Color(uiColor: UIColor { traits in
    if traits.userInterfaceStyle == .dark {
      return UIColor(red: 0.055, green: 0.10, blue: 0.17, alpha: 1)
    }
    return UIColor(red: 0.91, green: 0.94, blue: 0.985, alpha: 1)
  })

  static let islandKeyline = Color(uiColor: UIColor { traits in
    if traits.userInterfaceStyle == .dark {
      return UIColor(red: 0.04, green: 0.52, blue: 1, alpha: 1)
    }
    return UIColor(red: 0, green: 0.48, blue: 1, alpha: 1)
  })
}

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
        EmptyView()
      case "compactTrailing":
        HStack(spacing: 6) {
          Text(props.state == "paused" ? "PAUSE" : "REST")
            .font(.system(size: 11, weight: .bold))
            .lineLimit(1)
          SportRestClock(props: props, size: 14)
        }
        .foregroundStyle(.white)
        .fixedSize(horizontal: true, vertical: false)
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
        .fixedSize(horizontal: true, vertical: false)
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
          Text(props.exerciseName).font(.headline.weight(.semibold)).lineLimit(1).truncationMode(.tail)
          Text("Prochaine série · \\(props.nextSetNumber)/\\(props.targetSets)")
            .font(.subheadline).foregroundStyle(.secondary).lineLimit(1).truncationMode(.tail)
        }
        .layoutPriority(1)
        Spacer(minLength: 8)
        VStack(alignment: .trailing, spacing: 3) {
          Text(props.state == "paused" ? "PAUSE" : "REST").font(.caption2.weight(.bold)).foregroundStyle(.secondary)
          SportRestClock(props: props, size: 30)
        }
        .fixedSize(horizontal: true, vertical: false)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.vertical, 2)
    } else {
      Text("Repos en cours").font(.headline).frame(maxWidth: .infinity, alignment: .leading)
    }
  }
}
// SPORT_REST_LIVE_ACTIVITY_NATIVE_VIEWS_END

`;

const nativeViewsStart = '// SPORT_REST_LIVE_ACTIVITY_NATIVE_VIEWS_BEGIN';
const nativeViewsEnd = '// SPORT_REST_LIVE_ACTIVITY_NATIVE_VIEWS_END';
const existingNativeViewsStart = source.indexOf(nativeViewsStart);
const existingNativeViewsEnd = source.indexOf(nativeViewsEnd);
if (existingNativeViewsStart !== -1 && existingNativeViewsEnd !== -1) {
  source = source.slice(0, existingNativeViewsStart) + nativeViews.trimStart().trimEnd() + source.slice(existingNativeViewsEnd + nativeViewsEnd.length);
} else if (source.includes('private struct SportRestProps: Decodable')) {
  const existingViewsStart = source.lastIndexOf('@available(iOS 16.1, *)\nprivate enum SportActivityStyle {', source.indexOf('private struct SportRestProps: Decodable'));
  const existingViewsEnd = source.indexOf(marker, source.indexOf('private struct SportRestProps: Decodable'));
  if (existingViewsStart === -1 || existingViewsEnd === -1) {
    throw new Error('Could not locate the previously injected Sport native Live Activity views.');
  }
  source = source.slice(0, existingViewsStart) + nativeViews.trimStart().trimEnd() + '\n\n' + source.slice(existingViewsEnd);
} else {
  if (!source.includes(marker)) throw new Error('Could not locate the expo-widgets configuration insertion point.');
  source = source.replace(marker, `${nativeViews}${marker}`);
}

if (!source.includes('SportRestLockScreen(propsJSON: context.state.props)') ||
    !source.includes('Text(timerInterval: Date.now...deadline') ||
    !source.includes('case "compactLeading":\n        EmptyView()') ||
    !source.includes('HStack(spacing: 6)') ||
    !source.includes('.activityBackgroundTint(SportActivityStyle.lockScreenBackground)') ||
    !source.includes('.keylineTint(SportActivityStyle.islandKeyline)')) {
  throw new Error('The Sport native Live Activity presentation patch was not applied completely.');
}

writeFileSync(sourcePath, source);
