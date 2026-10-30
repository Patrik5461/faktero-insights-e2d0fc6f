// Typ faktury podle IBANu a zvýraznění vytěžených údajů v náhledu (nezpracované doklady).
export default {
  "IBAN {iban} patrí vášmu účtu {nazov} a je na doklade ako účet odberateľa.":
    "IBAN {iban} patří vašemu účtu {nazov} a je na dokladu jako účet odběratele.",
  "IBAN {iban} patrí vašej firme a je na doklade ako účet odberateľa.":
    "IBAN {iban} patří vaší firmě a je na dokladu jako účet odběratele.",
  "IBAN {iban} nepatrí žiadnemu vášmu účtu, platba ide dodávateľovi.":
    "IBAN {iban} nepatří žádnému vašemu účtu, platba jde dodavateli.",
  "Typ podľa IBAN-u je <0>predvolene zapnutý</0> a porovnáva IBAN na doklade so všetkými vašimi účtami — zadanými v nastaveniach firmy aj napojenými bankami. Nad údajmi vždy uvidíte dôvod: „IBAN patrí vášmu účtu …“ pri vlastnej vystavenej faktúre, a pri prijatej faktúre, že IBAN nepatrí žiadnemu vášmu účtu alebo že váš účet je na doklade ako účet odberateľa.":
    "Typ podle IBANu je <0>ve výchozím stavu zapnutý</0> a porovnává IBAN na dokladu se všemi vašimi účty — zadanými v nastavení firmy i napojenými bankami. Nad údaji vždy uvidíte důvod: „IBAN patří vašemu účtu …“ u vlastní vystavené faktury, a u přijaté faktury, že IBAN nepatří žádnému vašemu účtu nebo že váš účet je na dokladu jako účet odběratele.",
  "V náhľade dokladu sú <0>modrým rámčekom</0> vyznačené miesta, odkiaľ sa vzali číslo faktúry, VS, IBAN, IČO, DIČ, IČ DPH, dátumy a suma. Keď kliknete do poľa alebo naň ukážete myšou, jeho miesto sa zvýrazní silnejšie a náhľad sa naň posunie. Pri PDF sa miesto hľadá v texte dokladu, pri fotkách a skenoch ho určí AI pri vyťažení (aj názov dodávateľa). Keď hodnotu v poli prepíšete, rámček zmizne. Zvýraznenie vypnete ikonou zvýrazňovača nad náhľadom. Doklady vyťažené pred touto zmenou majú rámčeky len v PDF s textom.":
    "V náhledu dokladu jsou <0>modrým rámečkem</0> vyznačena místa, odkud se vzalo číslo faktury, VS, IBAN, IČO, DIČ, DIČ DPH, data a částka. Když kliknete do pole nebo na něj ukážete myší, jeho místo se zvýrazní silněji a náhled se na něj posune. U PDF se místo hledá v textu dokladu, u fotek a skenů ho určí AI při vytěžení (i název dodavatele). Když hodnotu v poli přepíšete, rámeček zmizí. Zvýraznění vypnete ikonou zvýrazňovače nad náhledem. Doklady vytěžené před touto změnou mají rámečky jen v PDF s textem.",
};
