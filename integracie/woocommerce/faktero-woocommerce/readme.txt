=== Faktero pre WooCommerce ===
Contributors: tobify
Tags: faktúra, fakturácia, invoice, woocommerce, slovensko
Requires at least: 6.0
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later

Z objednávok vystavuje faktúry vo Fakteri — sama, keď je objednávka zaplatená alebo vybavená.

== Description ==

* Faktúra vznikne vo Fakteri pri zvolenom stave objednávky (predvolene „Spracováva sa").
* Zaplatená objednávka má faktúru hneď uhradenú; prevodom platená dostane splatnosť.
* Položky, kupóny, doprava aj poplatky so správnymi sadzbami DPH — sumy presne podľa obchodu.
* Dobierka ostane neuhradená, kým objednávku nevybavíte.
* Odkaz na PDF faktúry v e-maile o objednávke, v účte zákazníka aj v administrácii objednávky.
* Polia IČO, DIČ a IČ DPH v pokladni pre nákup na firmu — klasickej aj z blokov.
* Pri výpadku sa vystavenie samo zopakuje; dvakrát sa faktúra nevystaví.
* Zrušená objednávka môže svoju nezaplatenú faktúru stornovať.

== Installation ==

1. Vo Fakteri: menu pod avatarom → API kľúče → vytvorte Live kľúč.
2. Vo WordPresse: Doplnky → Pridať nový → Nahrať doplnok → faktero-woocommerce.zip → Aktivovať.
3. WooCommerce → Nastavenia → Faktero: vložte kľúč a uložte. Faktero hneď overí pripojenie.

== Changelog ==

= 1.0.0 =
* Prvé vydanie.
