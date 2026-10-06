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
const availabilityDeclarations = [
  'public struct WidgetLiveActivity: Widget',
  'private struct LiveActivitySectionView: View',
  'private struct LiveActivityBannerView: View',
];
for (const declaration of availabilityDeclarations) {
  const previous = `@available(iOS 16.1, *)\n${declaration}`;
  const current = `@available(iOS 26.0, *)\n${declaration}`;
  if (source.includes(previous)) source = source.replace(previous, current);
  if (!source.includes(current)) {
    throw new Error(`Could not set the ${declaration} availability to iOS 26.`);
  }
}
const sectionBefore = `    if let node = nodes[sectionName] as? [String: Any] {
      WidgetsDynamicView(name: context.activityID, kind: .liveActivity, node: node)
    } else {
      EmptyView()
    }`;
const sectionAfter = `    if context.state.name == "SportRestActivity" {
      SportRestIslandSection(propsJSON: context.state.props, sectionName: sectionName, activityID: context.activityID)
    } else if context.state.name == "SportRestCompletionActivity" {
      SportRestIslandSection(propsJSON: context.state.props, sectionName: sectionName, activityID: context.activityID)
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
      SportRestLockScreen(propsJSON: context.state.props, activityID: context.activityID)
    } else if context.state.name == "SportRestCompletionActivity" {
      SportRestLockScreen(propsJSON: context.state.props, activityID: context.activityID)
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
      } else {
        banner
      }`;

if (!source.includes('SportRestIslandSection(propsJSON: context.state.props')) {
  if (!source.includes(sectionBefore) || !source.includes(bannerBefore)) {
    throw new Error('Could not locate the expected expo-widgets live activity rendering branches.');
  }
  source = source.replace(sectionBefore, sectionAfter).replace(bannerBefore, bannerAfter);
}
const mainIslandBranch = `if context.state.name == "SportRestActivity" {
      SportRestIslandSection(propsJSON: context.state.props, sectionName: sectionName, activityID: context.activityID)
    }`;
const completionIslandBranch = `else if context.state.name == "SportRestCompletionActivity" {
      SportRestIslandSection(propsJSON: context.state.props, sectionName: sectionName, activityID: context.activityID)
    }`;
if (!source.includes('context.state.name == "SportRestCompletionActivity"') && source.includes(mainIslandBranch)) {
  source = source.replace(mainIslandBranch, `${mainIslandBranch} ${completionIslandBranch}`);
}
const mainBannerBranch = `if context.state.name == "SportRestActivity" {
      SportRestLockScreen(propsJSON: context.state.props, activityID: context.activityID)
    }`;
const completionBannerBranch = `else if context.state.name == "SportRestCompletionActivity" {
      SportRestLockScreen(propsJSON: context.state.props, activityID: context.activityID)
    }`;
if (!source.includes('SportRestLockScreen(propsJSON: context.state.props, activityID: context.activityID)\n    } else if context.state.name == "SportRestCompletionActivity"')) {
  if (source.includes(mainBannerBranch)) {
    source = source.replace(mainBannerBranch, `${mainBannerBranch} ${completionBannerBranch}`);
  }
}
if (!source.includes(completionIslandBranch) || !source.includes(completionBannerBranch)) {
  throw new Error('Could not add the scheduled rest-completion presentation to both Live Activity surfaces.');
}
source = source
  .replace(
    'SportRestIslandSection(propsJSON: context.state.props, sectionName: sectionName)',
    'SportRestIslandSection(propsJSON: context.state.props, sectionName: sectionName, activityID: context.activityID)',
  )
  .replace(
    'SportRestLockScreen(propsJSON: context.state.props)',
    'SportRestLockScreen(propsJSON: context.state.props, activityID: context.activityID)',
  );

const bannerContentWithSportTint = `      if let url = context.attributes.url.flatMap(URL.init(string:)) {
        banner.widgetURL(url)
          .activityBackgroundTint(SportActivityStyle.lockScreenBackground)
          .activitySystemActionForegroundColor(Color.primary)
      } else {
        banner
          .activityBackgroundTint(SportActivityStyle.lockScreenBackground)
          .activitySystemActionForegroundColor(Color.primary)
      }`;
if (source.includes(bannerContentWithSportTint)) {
  source = source.replace(bannerContentWithSportTint, bannerContentAfter);
} else if (!source.includes(bannerContentBefore)) {
  throw new Error('Could not locate the expected Lock Screen banner modifiers in expo-widgets.');
}

source = source.replace(/\.contentMargins\(\.all,\s*\d+,\s*for:\s*\.expanded\)/g, '.contentMargins(.all, 12, for: .expanded)');
if (!source.includes('.keylineTint(SportActivityStyle.islandKeyline)')) {
  source = source
    .replace('return island.widgetURL(url)', 'return island.widgetURL(url).keylineTint(SportActivityStyle.islandKeyline).contentMargins(.all, 12, for: .expanded)')
    .replace('return island\n', 'return island.keylineTint(SportActivityStyle.islandKeyline).contentMargins(.all, 12, for: .expanded)\n');
}
if (!source.includes('return island.widgetURL(url).keylineTint(SportActivityStyle.islandKeyline).contentMargins(.all, 12, for: .expanded)')) {
  source = source.replace(
    'return island.widgetURL(url).keylineTint(SportActivityStyle.islandKeyline)',
    'return island.widgetURL(url).keylineTint(SportActivityStyle.islandKeyline).contentMargins(.all, 12, for: .expanded)',
  );
}
if (!source.includes('return island.keylineTint(SportActivityStyle.islandKeyline).contentMargins(.all, 12, for: .expanded)')) {
  source = source.replace(
    'return island.keylineTint(SportActivityStyle.islandKeyline)',
    'return island.keylineTint(SportActivityStyle.islandKeyline).contentMargins(.all, 12, for: .expanded)',
  );
}

if (!source.includes('var island = DynamicIsland {')) {
  if (!source.includes('let island = DynamicIsland {')) {
    throw new Error('Could not locate the Dynamic Island builder in expo-widgets.');
  }
  source = source.replace('let island = DynamicIsland {', 'var island = DynamicIsland {');
}

const legacyCompactIslandMargins = `      if #available(iOS 17.0, *) {
        if context.state.name == "SportRestActivity" {
          island = island
            .contentMargins(.horizontal, 2, for: .compactLeading)
            .contentMargins(.horizontal, 2, for: .compactTrailing)
        }
      }
`;
const islandReturns = `      if let url = context.attributes.url.flatMap(URL.init(string:)) {
        return island.widgetURL(url).keylineTint(SportActivityStyle.islandKeyline).contentMargins(.all, 12, for: .expanded)
      }
      return island.keylineTint(SportActivityStyle.islandKeyline).contentMargins(.all, 12, for: .expanded)`;
source = source.replace(legacyCompactIslandMargins, '');
if (!source.includes(islandReturns)) {
  throw new Error('Could not locate the Dynamic Island return branches to set the Sport keyline.');
}

const marker = 'extension WidgetConfiguration {';
const nativeViews = `
// SPORT_REST_LIVE_ACTIVITY_NATIVE_VIEWS_BEGIN
@available(iOS 16.1, *)
private enum SportActivityStyle {
  static let islandKeyline = Color(uiColor: UIColor { traits in
    if traits.userInterfaceStyle == .dark {
      return UIColor(red: 0.04, green: 0.52, blue: 1, alpha: 1)
    }
    return UIColor(red: 0, green: 0.48, blue: 1, alpha: 1)
  })

  static let lockScreenForeground = Color(uiColor: UIColor { traits in
    traits.userInterfaceStyle == .dark ? .white : .black
  })

  static let lockScreenSecondaryForeground = Color(uiColor: UIColor { traits in
    if traits.userInterfaceStyle == .dark {
      return UIColor(white: 0.78, alpha: 1)
    }
    return UIColor(white: 0.28, alpha: 1)
  })
}

@available(iOS 16.1, *)
private struct SportRestProps: Decodable {
  let workoutId: String
  let restTimerId: String
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

  var isRenderable: Bool {
    guard !workoutId.isEmpty,
          !restTimerId.isEmpty,
          !exerciseName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
          nextSetNumber > 0,
          targetSets >= nextSetNumber else { return false }

    switch state {
    case "running":
      return deadline != nil
    case "paused":
      guard let pausedRemainingSeconds else { return false }
      return pausedRemainingSeconds.isFinite && pausedRemainingSeconds >= 0
    case "finished":
      return true
    default:
      return false
    }
  }

  var statusLabel: String {
    switch state {
    case "running": "REST"
    case "paused": "PAUSE"
    default: "Repos terminé"
    }
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
    let now = Date.now
    let endDate = props.state == "paused"
      ? now.addingTimeInterval(max(0, props.pausedRemainingSeconds ?? 0))
      : (props.deadline ?? now)
    let pauseTime = props.state == "paused" ? now : nil

    Text(timerInterval: now...max(now, endDate), pauseTime: pauseTime, countsDown: true, showsHours: false)
      .font(.system(size: size, weight: .bold, design: .rounded))
      .monospacedDigit()
      .lineLimit(1)
      .minimumScaleFactor(0.75)
  }
}

@available(iOS 26.0, *)
private struct SportRestIslandSection: View {
  let propsJSON: String
  let sectionName: String
  let activityID: String

  var body: some View {
    if let props = SportRestProps.decode(propsJSON), props.isRenderable {
      switch sectionName {
      case "compactLeading":
        Image(systemName: props.state == "finished" ? "checkmark" : "timer")
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(SportActivityStyle.islandKeyline)
      case "compactTrailing":
        if props.state == "finished" { EmptyView() }
        else {
          SportRestClock(props: props, size: 14)
            .foregroundStyle(.white)
            // Text(timerInterval:) reserves space for its widest value; keep it from stretching the compact Island.
            .frame(width: 44, alignment: .trailing)
        }
      case "minimal":
        if props.state == "finished" { Image(systemName: "checkmark").foregroundStyle(SportActivityStyle.islandKeyline) }
        else { SportRestClock(props: props, size: 12).foregroundStyle(.white) }
      case "expandedLeading":
        VStack(alignment: .leading, spacing: 4) {
          Text(props.statusLabel).font(.subheadline.weight(.semibold)).foregroundStyle(.white)
          Text(props.exerciseName).font(.caption).lineLimit(1).foregroundStyle(.white.opacity(0.84))
          if props.state != "finished" {
            Text("Prochaine · \\(props.nextSetNumber)/\\(props.targetSets)")
              .font(.caption).lineLimit(1).foregroundStyle(.white.opacity(0.72))
          }
        }
      case "expandedTrailing":
        if props.state == "finished" { EmptyView() }
        else { SportRestClock(props: props, size: 22).foregroundStyle(.white) }
      case "expandedBottom":
        if props.state == "finished" { EmptyView() }
        else { SportRestControls(props: props, activityID: activityID) }
      default:
        EmptyView()
      }
    } else {
      EmptyView()
    }
  }
}

@available(iOS 26.0, *)
private struct SportRestLockScreen: View {
  let propsJSON: String
  let activityID: String

  var body: some View {
    if let props = SportRestProps.decode(propsJSON), props.isRenderable {
      VStack(alignment: .leading, spacing: 14) {
        HStack(alignment: .center, spacing: 16) {
          VStack(alignment: .leading, spacing: 4) {
            Text(props.statusLabel)
              .font(.headline.weight(.semibold))
            Text(props.exerciseName).font(.subheadline.weight(.medium)).lineLimit(1)
            if props.state != "finished" {
              Text("Prochaine série · \\(props.nextSetNumber)/\\(props.targetSets)")
                .font(.subheadline).foregroundStyle(SportActivityStyle.lockScreenSecondaryForeground).lineLimit(1)
            }
          }
          if props.state != "finished" {
            Spacer(minLength: 8)
            SportRestClock(props: props, size: 30)
          }
        }
        if props.state != "finished" {
          SportRestControls(props: props, activityID: activityID)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, 16)
      .padding(.vertical, 12)
      .foregroundStyle(SportActivityStyle.lockScreenForeground)
    } else {
      EmptyView()
    }
  }
}

@available(iOS 26.0, *)
private struct SportRestControls: View {
  let props: SportRestProps
  let activityID: String

  var body: some View {
    Button(intent: SportRestTimerActionIntent(
      activityID: activityID,
      restTimerID: props.restTimerId,
      action: props.state == "paused" ? "resume" : "pause"
    )) {
      Label(props.state == "paused" ? "Reprendre" : "Pause", systemImage: props.state == "paused" ? "play.fill" : "pause.fill")
        .frame(maxWidth: .infinity, minHeight: 44)
        .contentShape(Rectangle())
    }
    .buttonStyle(.borderedProminent)
    .tint(SportActivityStyle.islandKeyline)
    .controlSize(.regular)
    .frame(maxWidth: .infinity, minHeight: 44)
    .accessibilityLabel(props.state == "paused" ? "Reprendre le repos" : "Pause du repos")
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

if (!source.includes('SportRestLockScreen(propsJSON: context.state.props, activityID: context.activityID)') ||
    !source.includes('SportRestIslandSection(propsJSON: context.state.props, sectionName: sectionName, activityID: context.activityID)') ||
    !source.includes('context.state.name == "SportRestCompletionActivity"') ||
    !source.includes('@available(iOS 26.0, *)\npublic struct WidgetLiveActivity: Widget') ||
    !source.includes('@available(iOS 26.0, *)\nprivate struct LiveActivitySectionView: View') ||
    !source.includes('@available(iOS 26.0, *)\nprivate struct LiveActivityBannerView: View') ||
    !source.includes('@available(iOS 26.0, *)\nprivate struct SportRestControls: View') ||
    !source.includes('SportRestControls(props: props, activityID: activityID)') ||
    !source.includes('SportRestTimerActionIntent(') ||
    !source.includes('props.state == "paused" ? "resume" : "pause"') ||
    !source.includes('Text(timerInterval: now...max(now, endDate), pauseTime: pauseTime') ||
    !source.includes('Image(systemName: props.state == "finished" ? "checkmark" : "timer")') ||
    source.includes('.contentMargins(.horizontal, 2, for: .compactLeading)') ||
    !source.includes('Text(props.statusLabel)') ||
    !source.includes('case "finished":') ||
    !source.includes('default: "Repos terminé"') ||
    !source.includes('.padding(.horizontal, 16)') ||
    !source.includes('.padding(.vertical, 12)') ||
    !source.includes('minHeight: 44') ||
    source.includes('action: "skip"') ||
    source.includes('Text("R")') ||
    !source.includes('lockScreenForeground') ||
    !source.includes('props.isRenderable') ||
    source.includes('.activityBackgroundTint(SportActivityStyle.lockScreenBackground)') ||
    !source.includes('.keylineTint(SportActivityStyle.islandKeyline)')) {
  throw new Error('The Sport native Live Activity presentation patch was not applied completely.');
}

writeFileSync(sourcePath, source);
