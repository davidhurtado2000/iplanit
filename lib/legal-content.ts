// Starter Terms & Privacy content - reasonable coverage of the standard
// sections a SaaS needs, adapted for iPlanit's actual shape (multi-tenant
// booking platform, businesses in the US and Peru, manual Premium billing
// for now). Written to be honest about what the product actually does
// rather than generic boilerplate - but this is still a starting point:
// have a lawyer review it before treating it as bulletproof, especially the
// bracketed placeholders (legal entity name, state of incorporation,
// contact email) and the data-privacy section given clients across two
// different privacy-law jurisdictions (US state laws, Peru's Ley N° 29733).
//
// Flagged for the lawyer review David is getting (Aug 2026 pass): the
// arbitration/class-action-waiver paragraph in TERMS_*'s section 13 is the
// single highest-risk clause in this whole file - unlike liability caps/
// indemnification/venue (near-universal, low-variance contract mechanics),
// arbitration clause enforceability varies significantly by jurisdiction
// and has a real track record of being struck down when drafted generically
// for a cross-border audience. It already carries a "unless prohibited by
// applicable law" savings clause and carve-outs for small claims/injunctive
// relief to self-limit the risk, but this is exactly the paragraph most
// likely to need the lawyer's specific adjustment or removal.

export interface LegalSection {
  heading: string
  body: string[]
}

export interface LegalDocument {
  title: string
  lastUpdated: string
  sections: LegalSection[]
}

export const TERMS_ES: LegalDocument = {
  title: 'Términos y Condiciones',
  lastUpdated: 'Última actualización: agosto de 2026',
  sections: [
    {
      heading: '1. Aceptación de los Términos',
      body: [
        'Al crear una cuenta o usar iPlanit, aceptas estos Términos y Condiciones y nuestra Política de Privacidad. Si no estás de acuerdo, no debes usar el servicio.',
        'iPlanit es operado por David Software Services LLC, una LLC constituida en Colorado.',
      ],
    },
    {
      heading: '2. Descripción del Servicio',
      body: [
        'iPlanit es una plataforma de gestión de reservas y clientes para negocios (clínicas, coworkings, profesionales independientes, entre otros). Permite administrar servicios, recursos, clientes, reservas y reportes, además de ofrecer una página pública de reservas para los clientes finales de cada negocio.',
        'El servicio se ofrece "tal cual" y puede cambiar con el tiempo a medida que agregamos o ajustamos funcionalidades.',
      ],
    },
    {
      heading: '3. Registro y Cuentas',
      body: [
        'Para usar iPlanit necesitas crear una cuenta con un correo electrónico válido. Eres responsable de mantener la confidencialidad de tu contraseña y de toda actividad que ocurra bajo tu cuenta.',
        'Debes darnos información veraz al registrarte. Si detectamos actividad fraudulenta o abuso, podemos suspender o cerrar tu cuenta.',
      ],
    },
    {
      heading: '4. Planes y Pagos',
      body: [
        'iPlanit ofrece un plan gratuito y un plan Premium con funcionalidades adicionales. El cobro del plan Premium actualmente se coordina de forma manual con el equipo de iPlanit; no se procesan pagos automáticos dentro de la plataforma en esta etapa.',
        'Nos reservamos el derecho de cambiar los precios o las funcionalidades incluidas en cada plan, notificando con anticipación razonable a los usuarios afectados.',
      ],
    },
    {
      heading: '5. Uso Aceptable',
      body: [
        'No puedes usar iPlanit para actividades ilegales, para enviar spam, ni para recopilar datos de terceros sin su consentimiento. No puedes intentar vulnerar la seguridad de la plataforma ni acceder a datos de otros negocios sin autorización.',
      ],
    },
    {
      heading: '6. Datos de tus Clientes',
      body: [
        'Si usas iPlanit para gestionar un negocio, eres responsable de la información de tus propios clientes que registras en la plataforma (nombres, contactos, datos de reserva) y de contar con una base legal adecuada para tratarla, incluyendo informarles cómo se usará su información cuando corresponda.',
        'iPlanit actúa como proveedor de la infraestructura técnica; cada negocio sigue siendo responsable frente a sus propios clientes por el uso que le da a esos datos.',
      ],
    },
    {
      heading: '7. Propiedad Intelectual',
      body: [
        'El software, diseño y marca de iPlanit son propiedad de David Software Services LLC. Tú conservas la propiedad de los datos que ingresas (tus servicios, clientes, reservas); nos das permiso para almacenarlos y procesarlos únicamente con el fin de operar el servicio.',
      ],
    },
    {
      heading: '8. Disponibilidad del Servicio',
      body: [
        'Hacemos un esfuerzo razonable para mantener iPlanit disponible, pero no garantizamos un funcionamiento ininterrumpido. Puede haber mantenimientos programados o interrupciones fuera de nuestro control.',
      ],
    },
    {
      heading: '9. Terminación',
      body: [
        'Puedes dejar de usar iPlanit y solicitar la eliminación de tu cuenta en cualquier momento. Podemos suspender o cerrar cuentas que incumplan estos Términos, con aviso previo cuando sea razonablemente posible.',
      ],
    },
    {
      heading: '10. Limitación de Responsabilidad',
      body: [
        'iPlanit se ofrece "tal cual" y "según disponibilidad", sin garantías de ningún tipo, expresas o implícitas, incluyendo garantías de comerciabilidad o idoneidad para un propósito particular. En la máxima medida permitida por la ley, no seremos responsables por daños indirectos, incidentales, especiales o consecuentes, incluyendo pérdida de ingresos, de clientes o de datos, derivados del uso o la imposibilidad de uso del servicio.',
        'Nuestra responsabilidad total frente a ti por cualquier reclamo relacionado con estos Términos no excederá el monto que hayas pagado a iPlanit en los 12 meses anteriores al reclamo, o USD 100 si no has realizado ningún pago.',
      ],
    },
    {
      heading: '11. Indemnización',
      body: [
        'Aceptas defender e indemnizar a iPlanit y a David Software Services LLC frente a cualquier reclamo, daño o gasto (incluyendo honorarios legales razonables) que surja de: (a) tu uso del servicio en violación de estos Términos, (b) el contenido o los datos que ingreses en la plataforma, incluyendo información de tus propios clientes, o (c) tu incumplimiento de cualquier ley aplicable a la operación de tu negocio.',
      ],
    },
    {
      heading: '12. Modificaciones a estos Términos',
      body: [
        'Podemos actualizar estos Términos ocasionalmente. Si el cambio es significativo, te avisaremos por correo o dentro de la plataforma antes de que entre en vigor.',
      ],
    },
    {
      heading: '13. Ley Aplicable y Resolución de Disputas',
      body: [
        'Estos Términos se rigen por las leyes del estado de Colorado, Estados Unidos, sin perjuicio de las disposiciones de protección al consumidor que puedan aplicar en tu país de residencia.',
        'Salvo que la ley aplicable en tu país de residencia lo prohíba, cualquier disputa que no podamos resolver directamente se someterá a arbitraje vinculante y confidencial ante un árbitro único, conforme a las reglas de arbitraje comercial de la American Arbitration Association (AAA), en lugar de a un tribunal. En la medida permitida por la ley aplicable, tú y iPlanit renuncian a su derecho a participar en una demanda colectiva o a que la disputa se resuelva mediante un proceso colectivo o representativo.',
        'Cualquiera de las partes puede acudir a un tribunal de reclamos menores, o solicitar medidas cautelares urgentes ante un tribunal competente, sin que esto se considere una renuncia al arbitraje para el resto de la disputa.',
      ],
    },
    {
      heading: '14. Contacto',
      body: [
        'Si tienes preguntas sobre estos Términos, escríbenos a davidsoftwareservicesllc@gmail.com.',
      ],
    },
  ],
}

export const TERMS_EN: LegalDocument = {
  title: 'Terms and Conditions',
  lastUpdated: 'Last updated: August 2026',
  sections: [
    {
      heading: '1. Acceptance of Terms',
      body: [
        'By creating an account or using iPlanit, you agree to these Terms and Conditions and our Privacy Policy. If you do not agree, you may not use the service.',
        'iPlanit is operated by David Software Services LLC, an LLC organized in Colorado.',
      ],
    },
    {
      heading: '2. Description of the Service',
      body: [
        'iPlanit is a booking and client-management platform for businesses (clinics, coworking spaces, independent professionals, and others). It lets you manage services, resources, clients, reservations, and reports, and provides a public booking page for each business\'s own end clients.',
        'The service is provided "as is" and may change over time as we add or adjust functionality.',
      ],
    },
    {
      heading: '3. Registration and Accounts',
      body: [
        'You need to create an account with a valid email address to use iPlanit. You are responsible for keeping your password confidential and for all activity under your account.',
        'You must provide accurate information when registering. We may suspend or close accounts we find engaging in fraud or abuse.',
      ],
    },
    {
      heading: '4. Plans and Payment',
      body: [
        'iPlanit offers a free plan and a Premium plan with additional features. Premium billing is currently coordinated manually with the iPlanit team; the platform does not process automatic payments at this stage.',
        'We reserve the right to change pricing or the features included in each plan, with reasonable advance notice to affected users.',
      ],
    },
    {
      heading: '5. Acceptable Use',
      body: [
        'You may not use iPlanit for illegal activity, to send spam, or to collect third-party data without consent. You may not attempt to compromise the platform\'s security or access another business\'s data without authorization.',
      ],
    },
    {
      heading: '6. Your Clients\' Data',
      body: [
        'If you use iPlanit to run a business, you are responsible for your own clients\' information that you enter into the platform (names, contact details, booking data) and for having an adequate legal basis to process it, including informing them how their information will be used where required.',
        'iPlanit acts as the technical infrastructure provider; each business remains responsible to its own clients for how it uses that data.',
      ],
    },
    {
      heading: '7. Intellectual Property',
      body: [
        'iPlanit\'s software, design, and brand belong to David Software Services LLC. You retain ownership of the data you enter (your services, clients, reservations); you grant us permission to store and process it solely to operate the service.',
      ],
    },
    {
      heading: '8. Service Availability',
      body: [
        'We make a reasonable effort to keep iPlanit available, but we do not guarantee uninterrupted operation. There may be scheduled maintenance or outages outside our control.',
      ],
    },
    {
      heading: '9. Termination',
      body: [
        'You may stop using iPlanit and request deletion of your account at any time. We may suspend or close accounts that violate these Terms, with prior notice when reasonably possible.',
      ],
    },
    {
      heading: '10. Limitation of Liability',
      body: [
        'iPlanit is provided "as is" and "as available," without warranties of any kind, express or implied, including warranties of merchantability or fitness for a particular purpose. To the maximum extent permitted by law, we are not liable for indirect, incidental, special, or consequential damages, including lost revenue, lost customers, or lost data, arising from use or inability to use the service.',
        'Our total liability to you for any claim related to these Terms will not exceed the amount you paid iPlanit in the 12 months preceding the claim, or USD 100 if you have not made any payment.',
      ],
    },
    {
      heading: '11. Indemnification',
      body: [
        "You agree to defend and indemnify iPlanit and David Software Services LLC against any claim, damages, or expense (including reasonable legal fees) arising from: (a) your use of the service in violation of these Terms, (b) the content or data you enter into the platform, including your own clients' information, or (c) your failure to comply with any law applicable to operating your business.",
      ],
    },
    {
      heading: '12. Changes to These Terms',
      body: [
        'We may update these Terms from time to time. If a change is significant, we will notify you by email or within the platform before it takes effect.',
      ],
    },
    {
      heading: '13. Governing Law and Dispute Resolution',
      body: [
        'These Terms are governed by the laws of the state of Colorado, United States, without prejudice to any consumer-protection provisions that may apply in your country of residence.',
        "Unless prohibited by applicable law in your country of residence, any dispute we cannot resolve directly will be submitted to binding, confidential arbitration before a single arbitrator, under the American Arbitration Association's (AAA) commercial arbitration rules, instead of a court. To the extent permitted by applicable law, you and iPlanit waive any right to participate in a class action or to have the dispute resolved through a class or representative proceeding.",
        'Either party may bring a claim in small claims court, or seek urgent injunctive relief from a court of competent jurisdiction, without this being considered a waiver of arbitration for the rest of the dispute.',
      ],
    },
    {
      heading: '14. Contact',
      body: [
        'If you have questions about these Terms, write to us at davidsoftwareservicesllc@gmail.com.',
      ],
    },
  ],
}

export const PRIVACY_ES: LegalDocument = {
  title: 'Política de Privacidad',
  lastUpdated: 'Última actualización: agosto de 2026',
  sections: [
    {
      heading: '1. Qué Datos Recopilamos',
      body: [
        'Datos de tu cuenta: nombre, correo electrónico, foto de perfil, idioma y zona horaria.',
        'Datos de tu negocio: nombre, país, moneda, horarios, servicios, recursos y el ID tributario que ingreses (RUC/EIN).',
        'Datos de tus clientes que tú registras: nombre, correo, teléfono, documento de identidad y el historial de reservas asociado.',
      ],
    },
    {
      heading: '2. Cómo Usamos tus Datos',
      body: [
        'Usamos estos datos únicamente para operar la plataforma: mostrar tu calendario, procesar reservas, calcular reportes, enviar comunicaciones relacionadas con el servicio y dar soporte cuando lo solicitas.',
        'No vendemos tus datos ni los de tus clientes a terceros, ni los usamos con fines de publicidad ajenos a iPlanit.',
      ],
    },
    {
      heading: '3. Con Quién Compartimos Datos',
      body: [
        'Usamos Supabase como proveedor de base de datos e infraestructura; tus datos se almacenan en su infraestructura bajo las mismas protecciones de seguridad (control de acceso por fila, encriptación en tránsito). No compartimos tus datos con terceros para fines de marketing.',
        'Esto puede implicar que tus datos se almacenen y procesen en servidores ubicados en Estados Unidos, independientemente del país donde tú o tus clientes se encuentren.',
      ],
    },
    {
      heading: '4. Seguridad',
      body: [
        'Cada negocio en iPlanit solo puede acceder a sus propios datos — esto se aplica a nivel de base de datos, no solo en la interfaz visual. El acceso de tu equipo (si invitas administradores o vendedores) está limitado según el rol que les asignes.',
      ],
    },
    {
      heading: '5. Tus Derechos',
      body: [
        'Puedes solicitar en cualquier momento acceder, corregir o eliminar tus datos, o los de tu negocio, escribiéndonos a davidsoftwareservicesllc@gmail.com. Si estás en Perú, esto aplica conforme a la Ley N.º 29733 de Protección de Datos Personales; si estás en Estados Unidos, conforme a las leyes de privacidad de tu estado.',
        'Puedes exportar tus datos de clientes y reservas en cualquier momento desde la sección de Reportes (plan Premium).',
      ],
    },
    {
      heading: '6. Retención de Datos',
      body: [
        'Conservamos tus datos mientras tu cuenta esté activa. Si solicitas la eliminación de tu cuenta, eliminamos tus datos dentro de un plazo razonable, salvo que debamos conservar cierta información por obligaciones legales o contables.',
      ],
    },
    {
      heading: '7. Cookies y Almacenamiento Local',
      body: [
        'Usamos almacenamiento local del navegador para mantener tu sesión iniciada y recordar preferencias como el idioma y el negocio activo.',
        'En las páginas públicas del sitio (la página principal, inicio de sesión, registro y estas páginas legales — no tu panel de negocio ni las páginas de reserva de tus clientes) usamos Google Analytics para entender cómo la gente encuentra y usa iPlanit. Esto implica cookies de analítica que Google gestiona bajo su propia política de privacidad. No usamos estas cookies con fines de publicidad ni las compartimos con terceros más allá de Google.',
      ],
    },
    {
      heading: '8. Menores de Edad',
      body: [
        'iPlanit no está dirigido a menores de 16 años y no recopilamos intencionalmente datos personales de menores de esa edad. Si tienes motivos para creer que un menor nos proporcionó datos personales, escríbenos a davidsoftwareservicesllc@gmail.com para eliminarlos.',
      ],
    },
    {
      heading: '9. Cambios a esta Política',
      body: [
        'Si hacemos cambios significativos a esta política, te avisaremos por correo o dentro de la plataforma antes de que entren en vigor.',
      ],
    },
    {
      heading: '10. Contacto',
      body: [
        'Para cualquier consulta sobre privacidad, escríbenos a davidsoftwareservicesllc@gmail.com.',
      ],
    },
  ],
}

export const PRIVACY_EN: LegalDocument = {
  title: 'Privacy Policy',
  lastUpdated: 'Last updated: August 2026',
  sections: [
    {
      heading: '1. What Data We Collect',
      body: [
        'Account data: name, email address, profile photo, language, and timezone.',
        'Business data: name, country, currency, hours, services, resources, and the tax ID you enter (RUC/EIN).',
        'Your clients\' data that you enter: name, email, phone, ID document, and their associated booking history.',
      ],
    },
    {
      heading: '2. How We Use Your Data',
      body: [
        'We use this data solely to operate the platform: showing your calendar, processing bookings, calculating reports, sending service-related communications, and providing support when requested.',
        'We do not sell your data or your clients\' data to third parties, and we do not use it for advertising unrelated to iPlanit.',
      ],
    },
    {
      heading: '3. Who We Share Data With',
      body: [
        'We use Supabase as our database and infrastructure provider; your data is stored on their infrastructure under the same security protections (row-level access control, encryption in transit). We do not share your data with third parties for marketing purposes.',
        'This may mean your data is stored and processed on servers located in the United States, regardless of the country where you or your clients are located.',
      ],
    },
    {
      heading: '4. Security',
      body: [
        'Every business on iPlanit can only access its own data - this is enforced at the database level, not just in the visual interface. Your team\'s access (if you invite admins or sales staff) is limited according to the role you assign them.',
      ],
    },
    {
      heading: '5. Your Rights',
      body: [
        'You can request to access, correct, or delete your data, or your business\'s data, at any time by writing to davidsoftwareservicesllc@gmail.com. If you are in Peru, this applies under Law No. 29733 on Personal Data Protection; if you are in the United States, under your state\'s privacy laws.',
        'You can export your client and reservation data at any time from the Reports section (Premium plan).',
      ],
    },
    {
      heading: '6. Data Retention',
      body: [
        'We keep your data while your account is active. If you request account deletion, we delete your data within a reasonable period, unless we must retain certain information for legal or accounting obligations.',
      ],
    },
    {
      heading: '7. Cookies and Local Storage',
      body: [
        'We use browser local storage to keep you signed in and remember preferences like language and your active business.',
        "On the site's public pages (the homepage, login, registration, and these legal pages - not your business dashboard or your clients' booking pages) we use Google Analytics to understand how people find and use iPlanit. This involves analytics cookies that Google manages under its own privacy policy. We do not use these cookies for advertising purposes or share them with third parties beyond Google.",
      ],
    },
    {
      heading: '8. Children\'s Privacy',
      body: [
        "iPlanit is not directed at children under 16, and we do not knowingly collect personal data from children under that age. If you believe a child provided us with personal data, write to us at davidsoftwareservicesllc@gmail.com so we can remove it.",
      ],
    },
    {
      heading: '9. Changes to This Policy',
      body: [
        'If we make significant changes to this policy, we will notify you by email or within the platform before they take effect.',
      ],
    },
    {
      heading: '10. Contact',
      body: [
        'For any privacy questions, write to us at davidsoftwareservicesllc@gmail.com.',
      ],
    },
  ],
}
