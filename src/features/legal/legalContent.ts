import { BRAND } from '../../config/brand';

export type LegalDocType = 'terms' | 'privacy' | 'cookies';
export type LegalLocale = 'en' | 'it';

export interface LegalSection {
  id: string;
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface LegalDocument {
  type: LegalDocType;
  title: string;
  subtitle: string;
  lastUpdated: string;
  effectiveLabel: string;
  sections: LegalSection[];
}

const LAST_UPDATED_EN = 'April 2026';
const LAST_UPDATED_IT = 'Aprile 2026';

export function getLegalDocument(type: LegalDocType, locale: LegalLocale): LegalDocument {
  const brand = BRAND.name;
  const email = BRAND.supportEmail;

  if (type === 'terms') {
    if (locale === 'it') {
      return {
        type: 'terms',
        title: 'Termini e Condizioni di Servizio',
        subtitle: `Condizioni generali di utilizzo della piattaforma SaaS e Desktop ${brand}`,
        lastUpdated: LAST_UPDATED_IT,
        effectiveLabel: 'Ultimo aggiornamento',
        sections: [
          {
            id: 'scope',
            heading: '1. Oggetto del Servizio',
            paragraphs: [
              `${brand} è una piattaforma software per la gestione di cataloghi moda e abbigliamento, varianti SKU, magazzini, vendite, produzione e contabilità operativa, distribuita come applicazione web (Cloud SaaS) e desktop.`,
              `Creando un account o utilizzando ${brand}, dichiari di agire in qualità di professionista, impresa o soggetto autorizzato e accetti integralmente i presenti Termini di Servizio.`,
            ],
          },
          {
            id: 'accounts',
            heading: '2. Account, Aziende e Responsabilità',
            paragraphs: [
              `Ogni azienda (Organization) registrata su ${brand} dispone di uno spazio di lavoro isolato (architettura multi-tenant). Il Titolare (Owner) è responsabile della gestione dei ruoli del proprio team, della riservatezza delle credenziali e dell'accuratezza dei dati inseriti.`,
            ],
            bullets: [
              'Devi fornire informazioni veritiere in fase di registrazione e mantenerle aggiornate.',
              'Sei responsabile di tutte le attività svolte tramite le credenziali del tuo account.',
              `In caso di sospetto accesso non autorizzato, informaci immediatamente a ${email}.`,
            ],
          },
          {
            id: 'billing',
            heading: '3. Piani, Abbonamenti Pro e Fatturazione (EUR)',
            paragraphs: [
              `Le funzionalità base locali sono disponibili nel piano gratuito. I piani Cloud Pro e i moduli aggiuntivi sono fatturati in Euro (EUR) tramite Stripe Payments Europe, Ltd., con supporto per carte, addebito diretto SEPA e raccolta di Partita IVA / EU VAT ID.`,
            ],
            bullets: [
              'Gli abbonamenti ricorrenti si rinnovano automaticamente alla scadenza del periodo selezionato, salvo disdetta tramite il Portale di Fatturazione Stripe prima della data di rinnovo.',
              'In caso di mancato pagamento del rinnovo, il servizio può concedere un breve periodo di grazia prima di riportare lo spazio di lavoro al piano gratuito senza eliminare i tuoi dati.',
              'Le fatture fiscali e le ricevute PDF sono sempre scaricabili dal Portale di Fatturazione nelle Impostazioni.',
            ],
          },
          {
            id: 'ownership',
            heading: '4. Proprietà dei Dati Aziendali',
            paragraphs: [
              `Tutti i dati caricati o generati nel tuo spazio di lavoro (prodotti, clienti, ordini, fornitori, movimenti di magazzino, documenti contabili) restano di tua esclusiva proprietà.`,
              `Puoi esportare in qualsiasi momento tutti i tuoi dati in formato JSON e CSV standard direttamente da Impostazioni > Privacy e GDPR.`,
            ],
          },
          {
            id: 'acceptable-use',
            heading: '5. Uso Consentito e Limitazioni',
            paragraphs: [
              `È vietato utilizzare ${brand} per attività illecite, violazioni fiscali, distribuzione di malware, scraping abusivo o tentativi di accesso non autorizzato agli spazi di lavoro di altri utenti.`,
            ],
          },
          {
            id: 'liability',
            heading: '6. Disponibilità e Limitazione di Responsabilità',
            paragraphs: [
              `${brand} viene fornito con la massima diligenza professionale e adotta misure tecniche per garantire continuità e sicurezza. Tuttavia, nei limiti consentiti dalla legge applicabile nell'Unione Europea, non rispondiamo di danni indiretti, perdita di profitti o interruzioni dovute a cause di forza maggiore o servizi terzi.`,
              `Gli utenti restano responsabili della verifica finale dei documenti fiscali, delle aliquote IVA applicate e della conformità contabile nazionale con il proprio consulente fiscale.`,
            ],
          },
          {
            id: 'termination',
            heading: '7. Recesso e Cancellazione Account',
            paragraphs: [
              `Puoi disdire il tuo abbonamento o richiedere l'eliminazione definitiva del tuo account e dei dati associati in qualsiasi momento dalla sezione Impostazioni > Privacy e GDPR.`,
            ],
          },
          {
            id: 'law',
            heading: '8. Legge Applicabile e Foro Competente',
            paragraphs: [
              `I presenti Termini sono regolati dalla normativa dell'Unione Europea e dalla legge italiana. Per qualsiasi controversia relativa all'interpretazione o esecuzione dei presenti Termini, salvo disposizioni inderogabili di legge, è competente il foro del luogo di residenza o sede legale del fornitore nell'UE.`,
            ],
          },
        ],
      };
    }

    return {
      type: 'terms',
      title: 'Terms of Service',
      subtitle: `General terms governing your use of the ${brand} SaaS and Desktop platform`,
      lastUpdated: LAST_UPDATED_EN,
      effectiveLabel: 'Last updated',
      sections: [
        {
          id: 'scope',
          heading: '1. Scope of Service',
          paragraphs: [
            `${brand} is an apparel, inventory, sales, production, and operational accounting software platform delivered as a Cloud SaaS web application and desktop companion.`,
            `By creating an account or accessing ${brand}, you confirm that you are acting on behalf of a business or authorized entity and agree to be bound by these Terms of Service.`,
          ],
        },
        {
          id: 'accounts',
          heading: '2. Accounts, Organizations & Security',
          paragraphs: [
            `Each registered organization operates inside an isolated multi-tenant workspace. The Organization Owner is responsible for managing team roles, keeping credentials confidential, and ensuring the accuracy of workspace data.`,
          ],
          bullets: [
            'You must provide accurate registration details and keep your account information up to date.',
            'You are responsible for all actions taken under your authenticated user credentials.',
            `Notify us promptly at ${email} if you suspect unauthorized access to your account.`,
          ],
        },
        {
          id: 'billing',
          heading: '3. Plans, Pro Subscriptions & Billing (EUR)',
          paragraphs: [
            `Core offline/local functionality is available on the Free tier. Cloud Pro subscriptions and add-on modules are billed in Euros (EUR) via Stripe Payments Europe, Ltd., supporting major cards, SEPA Direct Debit, and EU VAT / Partita IVA collection.`,
          ],
          bullets: [
            'Recurring Pro subscriptions automatically renew at the end of each billing cycle unless canceled via the Stripe Customer Portal prior to the renewal date.',
            'If a renewal payment fails, your workspace may enter a grace period before reverting to the Free tier without deleting your stored records.',
            'VAT-compliant PDF invoices and payment receipts are accessible anytime from Settings > Subscription & Billing.',
          ],
        },
        {
          id: 'ownership',
          heading: '4. Your Data Ownership',
          paragraphs: [
            `You retain 100% ownership of all business records uploaded or created in your workspace (products, variants, customers, orders, inventory logs, and financial records).`,
            `You may export a complete machine-readable copy of your data in JSON or CSV format at any time via Settings > Privacy & GDPR.`,
          ],
        },
        {
          id: 'acceptable-use',
          heading: '5. Acceptable Use',
          paragraphs: [
            `You agree not to misuse ${brand} for unlawful activity, tax evasion, malware distribution, unauthorized security probing, or attempting to access data belonging to other tenants.`,
          ],
        },
        {
          id: 'liability',
          heading: '6. Availability & Limitation of Liability',
          paragraphs: [
            `We maintain industry-standard security and uptime practices. To the fullest extent permitted by applicable EU law, ${brand} shall not be liable for indirect or consequential damages, lost profits, or outages caused by third-party networks or force majeure.`,
            `You remain solely responsible for verifying tax rates, EU VAT numbers, and statutory accounting compliance with your certified accountant.`,
          ],
        },
        {
          id: 'termination',
          heading: '7. Cancellation & Account Erasure',
          paragraphs: [
            `You may cancel your subscription or permanently erase your account and associated workspace data at any time through Settings > Privacy & GDPR.`,
          ],
        },
        {
          id: 'law',
          heading: '8. Governing Law & Jurisdiction',
          paragraphs: [
            `These Terms are governed by European Union regulations and applicable Italian/EU commercial law. Any disputes arising under these Terms shall be subject to the competent courts within the European Union, without prejudice to mandatory statutory rights.`,
          ],
        },
      ],
    };
  }

  if (type === 'privacy') {
    if (locale === 'it') {
      return {
        type: 'privacy',
        title: 'Informativa sulla Privacy (GDPR)',
        subtitle: `Informativa sul trattamento dei dati personali ai sensi degli artt. 13 e 14 del Regolamento (UE) 2016/679 (GDPR)`,
        lastUpdated: LAST_UPDATED_IT,
        effectiveLabel: 'Ultimo aggiornamento',
        sections: [
          {
            id: 'controller',
            heading: '1. Titolare del Trattamento e Contatti',
            paragraphs: [
              `Il Titolare del Trattamento per i dati di account e utilizzo della piattaforma ${brand} è il gestore del servizio ${brand}. Per qualsiasi richiesta relativa alla privacy o per esercitare i diritti GDPR puoi scrivere a: ${email}.`,
              `Per i dati dei clienti finali o fornitori inseriti dalla tua azienda nello spazio di lavoro, la tua azienda opera in qualità di Titolare del Trattamento e ${brand} agisce come Responsabile del Trattamento (Data Processor, Art. 28 GDPR).`,
            ],
          },
          {
            id: 'data-categories',
            heading: '2. Categorie di Dati Trattati',
            paragraphs: [
              `Raccogliamo e trattiamo esclusivamente i dati strettamente necessari per erogare il servizio:`,
            ],
            bullets: [
              'Dati identificativi e di contatto dell\'account: nome, cognome, email, numero di telefono, ruolo aziendale.',
              'Dati aziendali e fiscali: nome organizzazione, Partita IVA / VAT ID, Codice Fiscale, sede legale, valuta e aliquota IVA.',
              'Dati operativi caricati nello spazio di lavoro: catalogo prodotti, giacenze, ordini, clienti, fornitori, spese e movimenti.',
              'Dati di pagamento e fatturazione: elaborati in modo sicuro tramite Stripe (non memorizziamo mai numeri completi di carta o codici CVV sui nostri server).',
              'Dati tecnici di sicurezza: timestamp di accettazione dei termini, log tecnici di accesso e token di autenticazione.',
            ],
          },
          {
            id: 'legal-basis',
            heading: '3. Finalità e Base Giuridica del Trattamento (Art. 6 GDPR)',
            paragraphs: [
              `Trattiamo i tuoi dati personali sulla base dei seguenti presupposti giuridici:`,
            ],
            bullets: [
              'Esecuzione del contratto (Art. 6(1)(b)): creazione dell\'account, erogazione della piattaforma SaaS/Desktop, sincronizzazione cloud e supporto tecnico.',
              'Obblighi di legge (Art. 6(1)(c)): adempimenti fiscali, contabili e fatturazione elettronica/IVA.',
              'Legittimo interesse (Art. 6(1)(f)): prevenzione frodi, isolamento multi-tenant e sicurezza dell\'infrastruttura.',
              'Consenso (Art. 6(1)(a)): preferenze opzionali dei cookie e accettazione espressa delle condizioni in fase di registrazione.',
            ],
          },
          {
            id: 'hosting',
            heading: '4. Residenza Dati nell\'Unione Europea e Sub-responsabili',
            paragraphs: [
              `L'infrastruttura cloud, il database applicativo e i backup sono progettati per essere ospitati in data center situati nello Spazio Economico Europeo (UE), con crittografia in transito (TLS/HTTPS) e rigoroso isolamento multi-tenant a livello di organizzazione.`,
            ],
            bullets: [
              'Pagamenti e Fatturazione: Stripe Payments Europe, Ltd. (Irlanda / UE) conforme a PCI-DSS Level 1 e GDPR.',
              'Infrastruttura Cloud & Database: server gestiti in regione UE con accesso limitato e backup cifrati.',
              'Modalità Locale Desktop/Browser: i dati locali rimangono esclusivamente sul tuo dispositivo fino all\'attivazione esplicita della sincronizzazione Cloud.',
            ],
          },
          {
            id: 'retention',
            heading: '5. Conservazione dei Dati',
            paragraphs: [
              `Conserviamo i dati dell'account e dell'organizzazione per tutta la durata del rapporto contrattuale. In caso di cancellazione dell'account tramite la funzione "Elimina Account", i dati operativi e il profilo vengono rimossi o anonimizzati immediatamente, fatti salvi i documenti contabili/fiscali che devono essere conservati per legge (fino a 10 anni ai sensi della normativa fiscale UE/italiana).`,
            ],
          },
          {
            id: 'rights',
            heading: '6. I Tuoi Diritti ai sensi del GDPR (Artt. 15–22)',
            paragraphs: [
              `In qualità di interessato hai il diritto di esercitare in qualsiasi momento i seguenti diritti:`,
            ],
            bullets: [
              'Diritto di accesso e rettifica (Artt. 15–16): consulta e modifica i tuoi dati nel Profilo e nelle Impostazioni.',
              'Diritto alla portabilità dei dati (Art. 20): scarica immediatamente tutti i tuoi dati in formato JSON o CSV da Impostazioni > Privacy e GDPR.',
              'Diritto alla cancellazione / "Diritto all\'oblio" (Art. 17): elimina definitivamente il tuo account e i dati associati direttamente da Impostazioni > Privacy e GDPR.',
              'Diritto di limitazione, opposizione e revoca del consenso (Artt. 7, 18, 21).',
              'Diritto di reclamo (Art. 77): puoi proporre reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it) o all\'autorità di controllo del tuo Stato membro UE.',
            ],
          },
        ],
      };
    }

    return {
      type: 'privacy',
      title: 'Privacy Policy (GDPR)',
      subtitle: `Personal Data Protection Notice pursuant to Articles 13 & 14 of Regulation (EU) 2016/679 (GDPR)`,
      lastUpdated: LAST_UPDATED_EN,
      effectiveLabel: 'Last updated',
      sections: [
        {
          id: 'controller',
          heading: '1. Data Controller & Contact Information',
          paragraphs: [
            `The Data Controller for account, billing, and platform administration data on ${brand} is the ${brand} service operator. For privacy inquiries or to exercise your GDPR rights, contact us at: ${email}.`,
            `For end-customer, supplier, and employee data entered by your business into your workspace, your organization acts as the Data Controller and ${brand} acts as a Data Processor (Art. 28 GDPR).`,
          ],
        },
        {
          id: 'data-categories',
          heading: '2. Categories of Data We Process',
          paragraphs: [
            `We follow data minimization principles and collect only data necessary to deliver the platform:`,
          ],
          bullets: [
            'Account & Identity Data: first name, last name, email address, phone number, and workspace role.',
            'Organization & Fiscal Data: company name, EU VAT Number / Partita IVA, Tax Code, legal address, currency, and VAT rate.',
            'Workspace Business Data: product catalogs, variants, stock balances, orders, customers, suppliers, and accounting ledgers.',
            'Billing Data: processed securely by Stripe (full card numbers and CVV codes are never stored on our servers).',
            'Security & Compliance Records: registration consent timestamps, authentication tokens, and essential audit records.',
          ],
        },
        {
          id: 'legal-basis',
          heading: '3. Purposes & Legal Bases (Art. 6 GDPR)',
          paragraphs: [
            `Personal data is processed strictly under lawful GDPR bases:`,
          ],
          bullets: [
            'Performance of a Contract (Art. 6(1)(b)): account provisioning, software functionality, cloud sync, and customer support.',
            'Legal Obligation (Art. 6(1)(c)): statutory tax reporting, VAT compliance, and billing record retention.',
            'Legitimate Interests (Art. 6(1)(f)): platform security, tenant isolation, and fraud prevention.',
            'Consent (Art. 6(1)(a)): optional cookie preferences and explicit acceptance of legal terms at registration.',
          ],
        },
        {
          id: 'hosting',
          heading: '4. EU Data Residency & Sub-processors',
          paragraphs: [
            `Our cloud API, database infrastructure, and encrypted backups are designed to operate within European Union / EEA data centers, protected by TLS/HTTPS encryption in transit and strict tenant-scoped access controls.`,
          ],
          bullets: [
            'Payments & Billing: Stripe Payments Europe, Ltd. (Ireland / EU), PCI-DSS Level 1 and GDPR compliant.',
            'Cloud Hosting & Database: EU-region managed infrastructure with restricted administrative access.',
            'Offline Local Mode: local SQLite / browser data remains strictly on your own device unless Cloud Sync is enabled.',
          ],
        },
        {
          id: 'retention',
          heading: '5. Data Retention',
          paragraphs: [
            `We retain your account and organization records for as long as your account remains active. When you execute Account Erasure under Settings > Privacy & GDPR, your user profile and workspace operational records are deleted or anonymized immediately, subject only to mandatory statutory retention of billing/tax invoices under EU law (up to 10 years).`,
          ],
        },
        {
          id: 'rights',
          heading: '6. Your GDPR Rights (Articles 15–22)',
          paragraphs: [
            `Under the EU GDPR, you have the right to exercise the following controls at any time:`,
          ],
          bullets: [
            'Right of Access & Rectification (Arts. 15–16): inspect and update your personal and organization details directly in Settings.',
            'Right to Data Portability (Art. 20): export a complete copy of your account and organization records in JSON or CSV directly from Settings > Privacy & GDPR.',
            'Right to Erasure / "Right to be Forgotten" (Art. 17): permanently delete your account and sole-owned workspace data from Settings > Privacy & GDPR.',
            'Right to Restriction, Objection & Consent Withdrawal (Arts. 7, 18, 21).',
            'Right to Lodge a Complaint (Art. 77): you may file a complaint with your local EU Data Protection Authority (such as the Italian Garante per la protezione dei dati personali).',
          ],
        },
      ],
    };
  }

  // Cookie Policy
  if (locale === 'it') {
    return {
      type: 'cookies',
      title: 'Informativa sui Cookie e Archiviazione Locale',
      subtitle: `Come ${brand} utilizza cookie tecnici e memoria locale del browser in conformità alla Direttiva ePrivacy e al GDPR`,
      lastUpdated: LAST_UPDATED_IT,
      effectiveLabel: 'Ultimo aggiornamento',
      sections: [
        {
          id: 'what',
          heading: '1. Cosa sono i Cookie e la Memoria Locale',
          paragraphs: [
            `I cookie e il LocalStorage sono piccoli file o chiavi salvate dal browser sul tuo dispositivo per mantenere attiva la sessione, ricordare la lingua scelta e consentire il funzionamento dell'applicazione anche in modalità offline.`,
          ],
        },
        {
          id: 'essential',
          heading: '2. Archiviazione Strettamente Necessaria (Sempre Attiva)',
          paragraphs: [
            `Questi elementi tecnici sono indispensabili per il funzionamento sicuro di ${brand} e non richiedono consenso preventivo ai sensi dell'art. 122 del Codice Privacy e della Direttiva ePrivacy:`,
          ],
          bullets: [
            'Token di autenticazione e sessione utente sicura.',
            'Identificativo dell\'azienda attiva (multi-tenant workspace) e cache di sincronizzazione.',
            'Preferenza della lingua (EN / IT), tema grafico (Chiaro / Scuro) e stato della barra laterale.',
            'Database locale offline (quando l\'app è usata in modalità locale senza cloud).',
            'Registro della tua scelta di consenso ai cookie.',
          ],
        },
        {
          id: 'optional',
          heading: '3. Cookie Opzionali e Preferenze di Esperienza',
          paragraphs: [
            `${brand} NON utilizza cookie pubblicitari di terze parti, pixel di tracciamento invasivi né vende i tuoi dati di navigazione.`,
            `Se accetti le preferenze opzionali, l'app può memorizzare piccoli miglioramenti dell'interfaccia (come i suggerimenti del tour guidato o lo stato dei filtri recenti). Puoi rifiutare o revocare questa scelta in qualsiasi momento.`,
          ],
        },
        {
          id: 'third-party',
          heading: '4. Servizi di Pagamento Esterni (Stripe)',
          paragraphs: [
            `Quando accedi alla pagina di pagamento sicuro Stripe Checkout o al Portale di Fatturazione, Stripe può impostare cookie tecnici antifrode necessari per proteggere la transazione in conformità alla propria informativa privacy.`,
          ],
        },
        {
          id: 'manage',
          heading: '5. Gestione e Revoca del Consenso',
          paragraphs: [
            `Puoi modificare o revocare in qualsiasi momento le tue preferenze sui cookie andando su Impostazioni > Privacy e GDPR oppure cancellando i dati del sito dalle impostazioni del tuo browser.`,
          ],
        },
      ],
    };
  }

  return {
    type: 'cookies',
    title: 'Cookie & Local Storage Policy',
    subtitle: `How ${brand} uses strictly necessary browser storage and cookies under EU ePrivacy and GDPR rules`,
    lastUpdated: LAST_UPDATED_EN,
    effectiveLabel: 'Last updated',
    sections: [
      {
        id: 'what',
        heading: '1. What Are Cookies & Local Storage?',
        paragraphs: [
          `Cookies and browser LocalStorage are small data entries stored on your device to keep your authenticated session secure, remember your language and theme settings, and power offline-capable workflows.`,
        ],
      },
      {
        id: 'essential',
        heading: '2. Strictly Necessary Storage (Always Active)',
        paragraphs: [
          `The following technical entries are essential for ${brand} to operate securely and cannot be disabled while using the application:`,
        ],
        bullets: [
          'Authentication session tokens and secure refresh credentials.',
          'Active organization selector (multi-tenant context) and query cache.',
          'Interface language (EN / IT), light/dark theme mode, and sidebar layout state.',
          'Local offline workspace storage when operating in local mode.',
          'Your saved cookie consent preference record.',
        ],
      },
      {
        id: 'optional',
        heading: '3. Optional Preference & Experience Storage',
        paragraphs: [
          `${brand} does NOT use third-party advertising cookies, cross-site tracking pixels, or behavioral ad profiling.`,
          `If you opt in to optional preferences, the application may remember non-essential UI convenience states (such as onboarding tour progress and quick view preferences). You can opt out or withdraw consent at any time.`,
        ],
      },
      {
        id: 'third-party',
        heading: '4. Payment Processing Cookies (Stripe)',
        paragraphs: [
          `When redirected to Stripe Checkout or the Stripe Billing Portal for EUR subscription payments, Stripe sets strictly necessary fraud-prevention cookies governed by Stripe's own EU Privacy Policy.`,
        ],
      },
      {
        id: 'manage',
        heading: '5. Managing Your Preferences',
        paragraphs: [
          `You can review or change your cookie preferences at any time inside Settings > Privacy & GDPR, or clear site data via your browser settings.`,
        ],
      },
    ],
  };
}
