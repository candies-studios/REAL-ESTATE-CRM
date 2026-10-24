/**
 * WhatsApp integration boundary.
 *
 * Today: a manual click-to-chat workflow. The broker opens WhatsApp with a
 * pre-filled message, sends it themselves, then logs it on the lead. Nothing is
 * sent automatically, so there is no risk of unsolicited messages.
 *
 * Later: implement `WhatsAppProvider` with an approved WhatsApp Business
 * Platform provider (Meta Cloud API or a BSP). Template messages must be
 * pre-approved; only message people who opted in (see consent_records) and
 * honour leads.do_not_contact.
 */
export interface WhatsAppProvider {
  sendTemplate(input: { to: string; template: string; language: string; variables: string[] }): Promise<{ id: string }>;
}

export function whatsappLink(phoneE164: string, text: string) {
  const digits = phoneE164.replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** Returns a provider only when fully configured; otherwise the manual flow is used. */
export function getWhatsAppProvider(): WhatsAppProvider | null {
  return null;
}
