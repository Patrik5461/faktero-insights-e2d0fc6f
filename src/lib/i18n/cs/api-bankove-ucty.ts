// Dokumentácia API — bankové účty, stránkovanie pohybov, kedy príde invoice.paid.
export default {
  "(alebo": "(nebo",
  "najviac 500 na stranu. Odpoveď má": "nejvýše 500 na stránku. Odpověď obsahuje",
  "— čítajte, kým je has_more true, inak vám riadky z rušného dňa chýbajú.":
    "— čtěte, dokud je has_more true, jinak vám řádky z rušného dne chybí.",
  "účtu je presne to": "účtu je přesně to",
  ", ktoré nesú pohyby. Vracajú sa aj odpojené účty (active: false), aby sa dalo priradiť každé id zo starších pohybov. Zostatok a jeho čas sú null, kým sa účet s bankou nesynchronizoval. Každý pohyb nesie aj iban a bank_name svojho účtu.":
    ", které nesou pohyby. Vracejí se i odpojené účty (active: false), aby šlo přiřadit každé id ze starších pohybů. Zůstatek a jeho čas jsou null, dokud se účet s bankou nesynchronizoval. Každý pohyb nese i iban a bank_name svého účtu.",
  "Neznáma cesta pod /api/v1/ vráti 404 s telom": "Neznámá cesta pod /api/v1/ vrátí 404 s tělem",
  "Kedy príde invoice.paid": "Kdy přijde invoice.paid",
  "Len keď faktúru niekto výslovne označí ako uhradenú: volaním POST /api/v1/invoices/…/mark-paid alebo zmenou stavu na „Uhradená“ v detaile faktúry vo Fakteri. Pri spárovaní bankového pohybu s faktúrou (automaticky ani ručne), pri hromadnom označení v zozname ani pri platbe cez platobnú bránu sa invoice.paid neposiela — úhradu z banky zistíte z /api/v1/bank-transactions (matched_invoice_id).":
    "Jen když fakturu někdo výslovně označí jako uhrazenou: voláním POST /api/v1/invoices/…/mark-paid nebo změnou stavu na „Uhrazená“ v detailu faktury ve Fakteru. Při spárování bankovního pohybu s fakturou (automaticky ani ručně), při hromadném označení v seznamu ani při platbě přes platební bránu se invoice.paid neposílá — úhradu z banky zjistíte z /api/v1/bank-transactions (matched_invoice_id).",
  "Bankové účty firmy (IBAN, banka, zostatok)": "Bankovní účty firmy (IBAN, banka, zůstatek)",
  "<0>invoice.paid</0> príde len pri výslovnom označení faktúry ako uhradenej — cez API <1>mark-paid</1> alebo zmenou stavu v detaile faktúry. Spárovanie s bankovým pohybom ho nespúšťa; úhradu z banky nájdete v <2>/api/v1/bank-transactions</2> (pole <3>matched_invoice_id</3>).":
    "<0>invoice.paid</0> přijde jen při výslovném označení faktury jako uhrazené — přes API <1>mark-paid</1> nebo změnou stavu v detailu faktury. Spárování s bankovním pohybem ho nespouští; úhradu z banky najdete v <2>/api/v1/bank-transactions</2> (pole <3>matched_invoice_id</3>).",
  "Pri každej zmene faktúry na uhradenú — po spárovaní s bankovým pohybom (automaticky aj ručne), po hromadnom označení v zozname, cez POST /api/v1/invoices/…/mark-paid aj zmenou stavu v detaile faktúry. Pri mark-paid príde hneď, inak do minúty. Ak úhradu priniesla banka, payload má bank_transaction_id spárovaného pohybu.":
    "Při každé změně faktury na uhrazenou — po spárování s bankovním pohybem (automaticky i ručně), po hromadném označení v seznamu, přes POST /api/v1/invoices/…/mark-paid i změnou stavu v detailu faktury. U mark-paid přijde hned, jinak do minuty. Pokud úhradu přinesla banka, payload obsahuje bank_transaction_id spárovaného pohybu.",
  "Príde do minúty po tom, čo sa pohyb objaví vo Fakteri (synchronizácia s bankou, import výpisu, bankové notifikácie). Data majú rovnaký tvar ako položka z GET /api/v1/bank-transactions vrátane iban a bank_name, takže pohyby netreba dopytovať. Pri prvom pripojení banky príde udalosť za každý natiahnutý pohyb.":
    "Přijde do minuty poté, co se pohyb objeví ve Fakteru (synchronizace s bankou, import výpisu, bankovní notifikace). Data mají stejný tvar jako položka z GET /api/v1/bank-transactions včetně iban a bank_name, takže pohyby není třeba dotazovat. Při prvním připojení banky přijde událost za každý načtený pohyb.",
  "<0>invoice.paid</0> príde pri každej zmene faktúry na uhradenú — aj po spárovaní s bankovým pohybom. Udalosť <1>bank_transaction.created</1> oznámi každý nový pohyb na účte, takže pohyby netreba dopytovať.":
    "<0>invoice.paid</0> přijde při každé změně faktury na uhrazenou — i po spárování s bankovním pohybem. Událost <1>bank_transaction.created</1> oznámí každý nový pohyb na účtu, takže pohyby není třeba dotazovat.",
};
