require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

# Faktero stavia iOS cez Swift Package Manager (`ios/App/CapApp-SPM/Package.swift`),
# CocoaPods sa nepoužíva. Tento súbor je tu len pre prípad, že by projekt
# niekedy prešiel späť — bez neho by plugin nebolo ako pridať.
Pod::Spec.new do |s|
  s.name = 'FakteroDriveDetector'
  s.version = package['version']
  s.summary = package['description']
  s.license = 'UNLICENSED'
  s.homepage = 'https://www.faktero.sk'
  s.author = 'Faktero'
  s.source = { :git => 'https://github.com/faktero/faktero.git', :tag => s.version.to_s }
  s.source_files = 'ios/Sources/**/*.{swift,h,m,c,cc,mm,cpp}'
  s.ios.deployment_target = '15.0'
  s.dependency 'Capacitor'
  s.swift_version = '5.9'
end
