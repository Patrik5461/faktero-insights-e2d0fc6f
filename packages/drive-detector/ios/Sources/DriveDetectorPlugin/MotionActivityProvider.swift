import Foundation
import CoreMotion

/// Pohybové senzory sú len druhý názor. Keď hlásia jazdu autom, stačí kratšie
/// držanie prahu rýchlosti; keď nehlásia nič (alebo ich človek zakázal),
/// detekcia beží ďalej, len pomalšie.
final class MotionActivityProvider {
    private let manager = CMMotionActivityManager()
    private var running = false

    var onAutomotive: ((Bool) -> Void)?

    static var isAvailable: Bool { CMMotionActivityManager.isActivityAvailable() }

    static var authorization: CMAuthorizationStatus { CMMotionActivityManager.authorizationStatus() }

    func start() {
        guard Self.isAvailable, !running else { return }
        running = true
        manager.startActivityUpdates(to: .main) { [weak self] activity in
            guard let activity else { return }
            // „aspoň medium" — nízka istota je pri rozjazde bežná a sama osebe
            // nič nedokazuje.
            let jazdaAutom = activity.automotive
                && activity.confidence.rawValue >= CMMotionActivityConfidence.medium.rawValue
            self?.onAutomotive?(jazdaAutom)
        }
    }

    func stop() {
        guard running else { return }
        running = false
        manager.stopActivityUpdates()
    }
}
