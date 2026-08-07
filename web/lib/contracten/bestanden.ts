// Welke bestanden kan de contract-AI lezen? Bewust een eigen klein module
// zonder verdere imports: het uploadvak (client) en de server action delen
// zo precies dezelfde acceptatieregels, zonder de AI-SDK het browser-
// bundle in te trekken.

// Welke route hoort bij een geüpload bestand? Browsers laten het mime-type
// nogal eens leeg (zeker bij heic en docx), dus de bestandsnaam is de
// terugvaloptie. null = niet leesbaar.
export function bepaalBestandsSoort(
  mediaType: string,
  naam: string,
): "pdf" | "afbeelding" | "docx" | "heic" | null {
  const n = naam.toLowerCase();
  if (mediaType === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (
    ["image/jpeg", "image/png", "image/webp"].includes(mediaType) ||
    /\.(jpe?g|png|webp)$/.test(n)
  )
    return "afbeelding";
  if (
    mediaType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    n.endsWith(".docx")
  )
    return "docx";
  if (["image/heic", "image/heif"].includes(mediaType) || /\.hei[cf]$/.test(n))
    return "heic";
  return null;
}
