/**
 * Company readiness validation for eFaktúra 2027.
 * Produces a 0–100 score + list of missing requirements grouped by area.
 */
import type { ReadinessCheck, ReadinessReport } from "./types";

type CompanyRow = {
  id: string;
  name?: string | null;
  ico?: string | null;
  dic?: string | null;
  ic_dph?: string | null;
  street?: string | null;
  city?: string | null;
  zip?: string | null;
  country?: string | null;
  email?: string | null;
  iban?: string | null;
};

type ProfileRow = {
  enabled?: boolean | null;
  peppol_participant_id?: string | null;
  peppol_scheme?: string | null;
  peppol_provider?: string | null;
  default_document_format?: string | null;
} | null;

type Stats = {
  invoiceCount: number;
  validatedDocumentCount: number;
  invalidDocumentCount: number;
};

export function computeReadiness(args: {
  company: CompanyRow;
  profile: ProfileRow;
  stats?: Stats;
}): ReadinessReport {
  const { company, profile } = args;
  const stats = args.stats ?? {
    invoiceCount: 0,
    validatedDocumentCount: 0,
    invalidDocumentCount: 0,
  };
  const checks: ReadinessCheck[] = [
    {
      key: "company.name",
      group: "company",
      label: "Názov firmy",
      ok: !!company.name,
      severity: "blocker",
      weight: 5,
      fixUrl: "/firma",
    },
    {
      key: "company.ico",
      group: "company",
      label: "IČO",
      ok: !!company.ico,
      severity: "blocker",
      weight: 5,
      fixUrl: "/firma",
    },
    {
      key: "company.address",
      group: "company",
      label: "Adresa (ulica, mesto, PSČ, krajina)",
      ok: !!(company.street && company.city && company.zip && company.country),
      severity: "blocker",
      weight: 8,
      fixUrl: "/firma",
    },
    {
      key: "company.email",
      group: "company",
      label: "Kontaktný e-mail",
      ok: !!company.email,
      severity: "warning",
      weight: 4,
      fixUrl: "/firma",
    },
    {
      key: "company.iban",
      group: "company",
      label: "IBAN pre platby",
      ok: !!company.iban,
      severity: "warning",
      weight: 5,
      fixUrl: "/firma",
    },
    {
      key: "vat.dic",
      group: "vat",
      label: "DIČ",
      ok: !!company.dic,
      severity: "blocker",
      weight: 8,
      fixUrl: "/firma",
    },
    {
      key: "vat.ic_dph",
      group: "vat",
      label: "IČ DPH (ak ste platca DPH)",
      ok: !!company.ic_dph,
      severity: "warning",
      weight: 8,
      hint: "Povinné len pre platcov DPH.",
      fixUrl: "/firma",
    },
    {
      key: "peppol.profile",
      group: "peppol",
      label: "eFaktúra profil vytvorený",
      ok: !!profile,
      severity: "blocker",
      weight: 6,
      fixUrl: "/efaktura",
    },
    {
      key: "peppol.enabled",
      group: "peppol",
      label: "eFaktúra zapnutá",
      ok: !!profile?.enabled,
      severity: "warning",
      weight: 5,
      fixUrl: "/efaktura",
    },
    {
      key: "peppol.participant",
      group: "peppol",
      label: "Peppol Participant ID",
      ok: !!profile?.peppol_participant_id,
      severity: "blocker",
      weight: 10,
      hint: "Napr. 9944:SK1234567890 pre platcov DPH.",
      fixUrl: "/efaktura",
    },
    {
      key: "peppol.scheme",
      group: "peppol",
      label: "Peppol scheme (ISO 6523)",
      ok: !!profile?.peppol_scheme,
      severity: "blocker",
      weight: 6,
      fixUrl: "/efaktura",
    },
    {
      key: "peppol.provider",
      group: "peppol",
      label: "Access Point provider",
      ok: !!profile?.peppol_provider,
      severity: "warning",
      weight: 6,
      hint: "Bude doplnené pri spustení reálneho odosielania.",
      fixUrl: "/efaktura",
    },
    {
      key: "peppol.format",
      group: "peppol",
      label: "Predvolený formát (Peppol BIS 3.0 / UBL)",
      ok: !!profile?.default_document_format,
      severity: "info",
      weight: 4,
      fixUrl: "/efaktura",
    },
    {
      key: "xml.test_generated",
      group: "xml",
      label: "Testovacia faktúra vygenerovaná v XML",
      ok: stats.validatedDocumentCount > 0,
      severity: "warning",
      weight: 8,
      hint: "Vygenerujte XML z faktúry a overte validitu.",
    },
    {
      key: "xml.no_invalid",
      group: "xml",
      label: "Žiadne neúspešné validácie",
      ok: stats.invalidDocumentCount === 0,
      severity: "warning",
      weight: 6,
    },
    {
      key: "process.has_invoices",
      group: "process",
      label: "Aspoň jedna faktúra vystavená",
      ok: stats.invoiceCount > 0,
      severity: "info",
      weight: 6,
      fixUrl: "/faktury/nova",
    },
  ];

  const groups: ReadinessReport["groups"] = {
    company: { score: 0, max: 0 },
    vat: { score: 0, max: 0 },
    peppol: { score: 0, max: 0 },
    xml: { score: 0, max: 0 },
    process: { score: 0, max: 0 },
  };
  let totalScore = 0;
  let totalMax = 0;
  for (const c of checks) {
    groups[c.group].max += c.weight;
    totalMax += c.weight;
    if (c.ok) {
      groups[c.group].score += c.weight;
      totalScore += c.weight;
    }
  }

  const score = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
  return {
    companyId: company.id,
    score,
    checkedAt: new Date().toISOString(),
    groups,
    checks,
    missing: checks.filter((c) => !c.ok),
    blockers: checks.filter((c) => !c.ok && c.severity === "blocker"),
  };
}
