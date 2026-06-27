require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'TarziImu'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = { :type => 'MIT' }
  s.homepage       = 'https://github.com/verbosetech/tarzi'
  s.authors        = { 'Verbose Tech Labs' => 'dev@verbosetechlabs.com' }
  s.source         = { :git => '' }
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
  
  # Required iOS frameworks
  s.frameworks = 'CoreMotion', 'AVFoundation', 'CoreMedia'
end
