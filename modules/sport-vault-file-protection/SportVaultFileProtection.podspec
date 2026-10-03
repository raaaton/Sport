Pod::Spec.new do |s|
  s.name           = 'SportVaultFileProtection'
  s.version        = '1.0.0'
  s.summary        = 'Applies iOS Data Protection to Sport vault files.'
  s.description    = 'Small local Expo module for protecting encrypted vault files while the device is locked.'
  s.license        = { :type => 'MIT' }
  s.author         = 'Sport'
  s.homepage       = 'https://example.invalid/sport-vault-file-protection'
  s.platforms      = { :ios => '16.4' }
  s.source         = { :git => 'https://example.invalid/sport-vault-file-protection.git', :tag => s.version.to_s }
  s.source_files   = 'ios/**/*.{h,m,mm,swift}'
  s.swift_version  = '5.9'
  s.dependency 'ExpoModulesCore'
end
