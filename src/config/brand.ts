/**
 * Brand and business details. Everything public-facing about the brokerage is
 * configured here or through environment variables, so nothing is hard-coded
 * into components. Leave a value empty and the UI hides it — never invent one.
 */
export const brand = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME || 'Navi Estates',
  tagline: 'Property advisory for Navi Mumbai',
  description:
    'Buy, sell, rent or lease property across Navi Mumbai with a broker who qualifies your requirement, shortlists verified options and manages every site visit.',
  contact: {
    phone: process.env.NEXT_PUBLIC_CONTACT_PHONE || '',
    email: process.env.NEXT_PUBLIC_CONTACT_EMAIL || '',
    // Only set this to a verified WhatsApp Business number (digits, with country code).
    whatsapp: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '',
    officeAddress: process.env.NEXT_PUBLIC_OFFICE_ADDRESS || '',
    reraAgentNumber: process.env.NEXT_PUBLIC_RERA_AGENT_NUMBER || '',
  },
  primaryCity: 'Navi Mumbai',
} as const;

/** Navi Mumbai localities offered in search and qualification forms. */
export const NAVI_MUMBAI_LOCALITIES = [
  'Vashi', 'Sanpada', 'Nerul', 'Seawoods', 'CBD Belapur', 'Kharghar', 'Kamothe',
  'Kalamboli', 'Panvel', 'New Panvel', 'Ulwe', 'Dronagiri', 'Taloja', 'Airoli',
  'Ghansoli', 'Koparkhairane', 'Turbhe', 'Juinagar',
] as const;

export const PROPERTY_TYPES = {
  residential: ['Apartment', 'Villa', 'Row house', 'Penthouse', 'Studio', 'Plot'],
  commercial: ['Office', 'Shop', 'Showroom', 'Warehouse', 'Co-working', 'Commercial plot'],
} as const;
