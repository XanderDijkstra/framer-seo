// Curated list of Norwegian agency service types used by the onboarding chip picker.
export const SERVICE_OPTIONS = [
  "Webutvikling",
  "Apputvikling",
  "UX-design",
  "Grafisk design",
  "Merkevare og identitet",
  "Innholdsproduksjon",
  "Tekstforfatting",
  "Oversettelse",
  "Foto og film",
  "Sosiale medier",
  "Digital markedsføring",
  "SEO",
  "Annonsering (Google/Meta)",
  "E-postmarkedsføring",
  "Kommunikasjon og PR",
  "Strategi og rådgivning",
  "Tjenestedesign",
  "IT-drift",
  "Skytjenester",
  "Datavarehus og analyse",
  "AI/ML-rådgivning",
  "Cybersikkerhet",
  "Personvernrådgivning",
  "Prosjektledelse",
] as const;

export type ServiceOption = (typeof SERVICE_OPTIONS)[number];
