#!/usr/bin/env ruby
# Xcode 27 refuses generated CocoaPods targets with iOS 9/10/etc.
# Normalize only the local generated Pods project after pod install.
# This deliberately does not modify third-party package source, app settings,
# or an existing production native project.
require 'rubygems'
require 'xcodeproj'

path = ARGV.fetch(0) { abort 'Pods project path missing' }
abort 'Only generated ios/Pods project may be changed' unless path.end_with?('/ios/Pods/Pods.xcodeproj')
abort "Pods project not found: #{path}" unless File.directory?(path)

project = Xcodeproj::Project.open(path)
minimum = Gem::Version.new('15.1')
updated = 0
project.targets.each do |target|
  target.build_configurations.each do |configuration|
    old = configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
    next if old.nil?
    begin
      below = Gem::Version.new(old.to_s) < minimum
    rescue ArgumentError
      abort "Unknown deployment target '#{old}' in #{target.name}"
    end
    next unless below
    configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.1'
    updated += 1
  end
end

project.save if updated > 0
puts "Xcode 27 CocoaPods simulator target check: #{updated} configurations updated to iOS 15.1"
