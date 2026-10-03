import ExpoModulesCore
import Foundation

public final class SportVaultFileProtectionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SportVaultFileProtection")

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
