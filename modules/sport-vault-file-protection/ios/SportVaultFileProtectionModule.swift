import ExpoModulesCore
import Foundation
import UIKit

public final class SportVaultFileProtectionModule: Module {
  private var lifecycleObservers: [NSObjectProtocol] = []

  public func definition() -> ModuleDefinition {
    Name("SportVaultFileProtection")

    OnCreate {
      self.lifecycleObservers.append(NotificationCenter.default.addObserver(
        forName: UIApplication.willResignActiveNotification,
        object: nil,
        queue: .main
      ) { _ in SportVaultPrivacyShield.show() })
    }

    OnAppEntersBackground {
      SportVaultPrivacyShield.show()
    }

    OnDestroy {
      self.lifecycleObservers.forEach { NotificationCenter.default.removeObserver($0) }
      self.lifecycleObservers.removeAll()
      SportVaultPrivacyShield.hide()
    }

    Function("setPrivacyShieldVisible") { (visible: Bool) in
      if visible { SportVaultPrivacyShield.show() } else { SportVaultPrivacyShield.hide() }
    }

    Function("protectPath") { (fileUri: String) throws in
      guard let url = URL(string: fileUri), url.isFileURL else {
        throw NSError(domain: "SportVaultFileProtection", code: 1, userInfo: [NSLocalizedDescriptionKey: "Expected a local file URL."])
      }

      let path = url.standardizedFileURL.path
      let fileManager = FileManager.default
      let allowedRoots = [
        fileManager.urls(for: .documentDirectory, in: .userDomainMask).first,
        fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first,
      ].compactMap { $0?.standardizedFileURL.path }
      guard allowedRoots.contains(where: { path == $0 || path.hasPrefix($0 + "/") }) else {
        throw NSError(domain: "SportVaultFileProtection", code: 2, userInfo: [NSLocalizedDescriptionKey: "The path is outside the app's private storage."])
      }

      try fileManager.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: path)
    }
  }
}

private enum SportVaultPrivacyShield {
  private static let viewTag = 0x535056

  static func show() {
    updateWindows { window in
      guard window.viewWithTag(viewTag) == nil else { return }
      let cover = UIView(frame: window.bounds)
      cover.tag = viewTag
      cover.backgroundColor = .systemBackground
      cover.isAccessibilityElement = false
      cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      window.addSubview(cover)
      window.bringSubviewToFront(cover)
    }
  }

  static func hide() {
    updateWindows { window in
      window.viewWithTag(viewTag)?.removeFromSuperview()
    }
  }

  private static func updateWindows(_ action: @escaping (UIWindow) -> Void) {
    let update = {
      let windows = UIApplication.shared.connectedScenes
        .compactMap { $0 as? UIWindowScene }
        .flatMap(\.windows)
        .filter(\.isKeyWindow)
      windows.forEach(action)
    }
    if Thread.isMainThread { update() } else { DispatchQueue.main.async(execute: update) }
  }
}
