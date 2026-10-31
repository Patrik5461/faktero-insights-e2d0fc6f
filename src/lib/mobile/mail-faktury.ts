/*
  Údaje na odoslanie faktúry e-mailom z appky (`faktura-email` → `sendInvoiceEmailFn`).

  `cislo_v_okne` je číslo faktúry, ktoré appka ukazovala pri odoslaní. Faktúra
  vystavená bez signálu dostane po synchronizácii iné číslo, ak jej rezervácia
  prepadla — server potom v predmete a texte nahradí staré číslo aktuálnym
  (`cislo-v-maile.ts`), aby mail nesľuboval iné číslo, než nesie PDF.
*/
export type MailFakturyZAppky = {
  invoiceId: string;
  recipient_email: string;
  s_prilohami?: boolean;
  potvrdeny_stary_datum?: boolean;
  subject?: string;
  message?: string;
  cislo_v_okne?: string;
};

export function udajeMailuFaktury(args: {
  faktura: { id: string; invoice_number?: string | null; customer_email: string };
  potvrdenyStaryDatum?: boolean;
  sPrilohami?: boolean;
  sablona?: { subject: string; message: string } | null;
}): MailFakturyZAppky {
  const cislo = String(args.faktura.invoice_number ?? "").trim();
  return {
    invoiceId: args.faktura.id,
    recipient_email: args.faktura.customer_email,
    ...(args.sPrilohami ? { s_prilohami: true } : {}),
    ...(args.potvrdenyStaryDatum ? { potvrdeny_stary_datum: true } : {}),
    ...(args.sablona ?? {}),
    ...(cislo ? { cislo_v_okne: cislo.slice(0, 100) } : {}),
  };
}
