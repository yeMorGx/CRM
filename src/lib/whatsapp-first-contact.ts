import "server-only";

export function getFirstContactTemplate() {
  const name = process.env.WHATSAPP_FIRST_CONTACT_TEMPLATE_NAME?.trim() ?? "";
  const language = process.env.WHATSAPP_FIRST_CONTACT_TEMPLATE_LANGUAGE?.trim() ?? "";
  const preview = process.env.WHATSAPP_FIRST_CONTACT_TEMPLATE_PREVIEW?.trim() ?? "";

  if (!/^[a-z0-9_]{1,512}$/.test(name) || !/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(language) || !preview || preview.length > 4096) {
    return null;
  }

  return { name, language, preview };
}
