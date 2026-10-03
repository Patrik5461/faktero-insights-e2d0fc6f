import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = CAPBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)

        RychlaAkcia.nastavPolozky()
        // Appka spustená podržaním ikony. Pluginy sa načítajú až s prvým
        // zobrazením WebView — oznámenie poslané hneď by nikto nepočul.
        if let polozka = connectionOptions.shortcutItem {
            var token: NSObjectProtocol?
            token = NotificationCenter.default.addObserver(forName: .capacitorViewDidAppear, object: nil, queue: .main) { _ in
                if let token { NotificationCenter.default.removeObserver(token) }
                RychlaAkcia.posli(polozka)
            }
        }
    }

    /// Podržanie ikony, keď appka už beží na pozadí.
    func windowScene(_ windowScene: UIWindowScene,
                     performActionFor shortcutItem: UIApplicationShortcutItem,
                     completionHandler: @escaping (Bool) -> Void) {
        completionHandler(RychlaAkcia.posli(shortcutItem))
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

/*
  Rýchla akcia na ikone („Naskenovať bloček").

  Do webovej vrstvy ide ako adresa `faktero://akcia/skener` tou istou cestou
  ako odkaz do appky — plugin App z nej spraví udalosť `appUrlOpen` a podrží
  ju, kým si ju JavaScript nevyzdvihne (`src/lib/mobile/rychla-akcia.ts`).
  Vlastný plugin by na jednu položku bol zbytočný.

  Položka sa nastavuje z kódu, nie v Info.plist, aby mala názov v jazyku
  telefónu — appka má päť jazykov a lokalizované `InfoPlist.strings` nemá.
  Objaví sa preto až po prvom spustení, čo nevadí: bez prihlásenia by skener
  aj tak nemal kam doklad uložiť.
*/
enum RychlaAkcia {
    static let typSkener = "sk.tobify.faktero.skener"

    private static let nazvy: [String: String] = [
        "sk": "Naskenovať bloček",
        "cs": "Naskenovat účtenku",
        "en": "Scan a receipt",
        "de": "Beleg scannen",
        "hu": "Nyugta beolvasása",
    ]

    static func nastavPolozky() {
        let jazyk = Locale.preferredLanguages.lazy
            .map { String($0.prefix(2)) }
            .first { nazvy[$0] != nil } ?? "sk"
        UIApplication.shared.shortcutItems = [
            UIApplicationShortcutItem(
                type: typSkener,
                localizedTitle: nazvy[jazyk] ?? nazvy["sk"]!,
                localizedSubtitle: nil,
                icon: UIApplicationShortcutIcon(systemImageName: "doc.text.viewfinder"),
                userInfo: nil
            ),
        ]
    }

    @discardableResult
    static func posli(_ polozka: UIApplicationShortcutItem) -> Bool {
        guard polozka.type == typSkener, let url = URL(string: "faktero://akcia/skener") else { return false }
        NotificationCenter.default.post(name: .capacitorOpenURL, object: [
            "url": url,
            "options": [:] as [String: Any],
        ])
        return true
    }
}
