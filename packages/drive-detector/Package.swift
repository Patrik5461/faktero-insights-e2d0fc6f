// swift-tools-version: 5.9
import PackageDescription

// Dva ciele zámerne: `DriveDetectorCore` je čistá logika bez CoreLocation
// a CoreMotion, takže sa dá otestovať bez auta aj bez zariadenia.
// `DriveDetectorPlugin` je všetko ostatné — hardvér, databáza, most do JS.
let package = Package(
    name: "FakteroDriveDetector",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "FakteroDriveDetector",
            targets: ["FakteroDriveDetector"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "DriveDetectorCore",
            path: "ios/Sources/DriveDetectorCore"),
        // Modul sa volá rovnako ako produkt, aby sa v `AppDelegate` dalo
        // napísať `import FakteroDriveDetector` — Swift importuje meno cieľa.
        .target(
            name: "FakteroDriveDetector",
            dependencies: [
                "DriveDetectorCore",
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/DriveDetectorPlugin"),
        .testTarget(
            name: "DriveDetectorCoreTests",
            dependencies: ["DriveDetectorCore"],
            path: "ios/Tests/DriveDetectorCoreTests")
    ]
)
