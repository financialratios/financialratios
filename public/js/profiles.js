// Hand-written company profiles: business model, famous products (pictures come from Wikipedia),
// what sets the company apart, and the revenue mix from its latest annual report.
// Revenue figures are rounded, in billions, as reported in each company's annual report
// (fiscal year stated). Add more companies by copying an entry. Keys are ticker symbols;
// ALIASES maps other listings of the same company to its entry.

export const ALIASES = {
  GOOG: 'GOOGL', 'ASML.AS': 'ASML', 'SAP.DE': 'SAP', '7203.T': 'TM', 'NOVO-B.CO': 'NVO',
};

export const PROFILES = {
  AAPL: {
    model: 'Apple designs phones, computers, tablets and wearables and sells them at premium prices, then earns recurring money from services used on those devices: the App Store, iCloud, Apple Music, AppleCare, and payments from Google to be the default search engine.',
    famous: [['iPhone', 'IPhone'], ['Mac', 'Mac_(computer)'], ['iPad', 'IPad'], ['Apple Watch', 'Apple_Watch'], ['AirPods', 'AirPods']],
    edge: ['An ecosystem: devices and services work best together, which makes switching to another brand inconvenient.',
      'More than 2 billion active devices, which provide the customer base for the services business.',
      'Services have much higher profit margins than hardware, so their growing share lifts overall profitability.'],
    mix: { title: 'Revenue by product', year: 'FY2024 (to Sep 2024)', cur: 'USD', groupsTitle: 'Products vs services', items: [
      ['iPhone', 201.2, 'Products'], ['Services', 96.2, 'Services'], ['Wearables, Home & Accessories', 37.0, 'Products'], ['Mac', 30.0, 'Products'], ['iPad', 26.7, 'Products']] },
  },
  MSFT: {
    model: 'Microsoft sells software and cloud computing, mostly through subscriptions to businesses: Microsoft 365 (Office), the Azure cloud platform, Windows licences, LinkedIn, and gaming through Xbox.',
    famous: [['Windows', 'Microsoft_Windows'], ['Office / Microsoft 365', 'Microsoft_Office'], ['Azure', 'Microsoft_Azure'], ['Xbox', 'Xbox']],
    edge: ['Office and Windows are the standard tools in most workplaces, so businesses keep renewing.',
      'Azure is one of the three largest cloud platforms in the world.',
      'Most revenue is recurring (subscriptions and multi-year contracts), which makes it predictable.'],
    mix: { title: 'Revenue by segment', year: 'FY2024 (to Jun 2024)', cur: 'USD', items: [
      ['Intelligent Cloud (Azure, servers)', 105.4, 'Cloud'], ['Productivity & Business (Office, LinkedIn, Dynamics)', 77.7, 'Business software'], ['Personal Computing (Windows, Xbox, Surface, search)', 62.0, 'Consumer']] },
  },
  NFLX: {
    model: 'Netflix sells monthly streaming subscriptions in more than 190 countries. It spends heavily on making and licensing films and series; since late 2022 it also offers a cheaper plan with advertising.',
    famous: [['Stranger Things', 'Stranger_Things'], ['Squid Game', 'Squid_Game'], ['The Crown', 'The_Crown_(TV_series)'], ['Wednesday', 'Wednesday_(TV_series)']],
    edge: ['The largest paid streaming service, with over 300 million paid memberships at the end of 2024.',
      'Its scale lets it spend more on content than most rivals while spreading the cost over more subscribers.',
      'Global hits produced locally (e.g. Squid Game from South Korea) travel to every market.'],
    mix: { title: 'Revenue by region (streaming)', year: 'FY2024', cur: 'USD', items: [
      ['US & Canada', 17.4, 'Subscriptions'], ['Europe, Middle East & Africa', 12.4, 'Subscriptions'], ['Latin America', 4.8, 'Subscriptions'], ['Asia-Pacific', 4.4, 'Subscriptions']],
      note: 'Advertising vs subscriptions: Netflix does not report advertising revenue separately. Almost all of its revenue comes from membership fees (the ad-supported plan is also a paid membership), which is why the breakdown is by region.' },
  },
  GOOGL: {
    model: 'Alphabet (Google) earns most of its money from advertising shown next to search results, on YouTube and on partner websites. It also sells cloud computing (Google Cloud) and subscriptions such as YouTube Premium, Google One and Android apps.',
    famous: [['Google Search', 'Google_Search'], ['YouTube', 'YouTube'], ['Android', 'Android_(operating_system)'], ['Chrome', 'Google_Chrome'], ['Google Cloud', 'Google_Cloud_Platform']],
    edge: ['About 90% of the world\'s web searches, which makes it the first stop for advertisers.',
      'Several products with more than 2 billion users each (Search, YouTube, Android, Chrome, Gmail, Maps).',
      'Heavy investment in AI and its own chips, used across all its products.'],
    mix: { title: 'Revenue by business', year: 'FY2024', cur: 'USD', groupsTitle: 'Advertising vs subscriptions vs cloud', items: [
      ['Google Search & other', 198.1, 'Advertising'], ['Google Cloud', 43.2, 'Cloud'], ['Subscriptions, platforms & devices', 40.3, 'Subscriptions & devices'],
      ['YouTube ads', 36.1, 'Advertising'], ['Google Network (ads on partner sites)', 30.4, 'Advertising'], ['Other Bets (Waymo...)', 1.6, 'Other']] },
  },
  AMZN: {
    model: 'Amazon runs the world\'s largest online store, both selling its own stock and charging other merchants for using its marketplace and delivery network. Its cloud division, AWS, rents computing power to businesses and earns most of the group\'s operating profit.',
    famous: [['Amazon Prime', 'Amazon_Prime'], ['AWS', 'Amazon_Web_Services'], ['Echo / Alexa', 'Amazon_Echo'], ['Kindle', 'Amazon_Kindle']],
    edge: ['A logistics network that delivers many products the same or next day.',
      'AWS is the largest cloud platform by revenue.',
      'Prime membership ties shopping, delivery and video together and keeps customers coming back.'],
    mix: { title: 'Revenue by type', year: 'FY2024', cur: 'USD', groupsTitle: 'Retail vs marketplace vs cloud vs ads', items: [
      ['Online stores', 247.0, 'Retail'], ['Third-party seller services', 156.1, 'Marketplace'], ['AWS (cloud)', 107.6, 'Cloud'], ['Advertising', 56.2, 'Advertising'],
      ['Subscriptions (Prime...)', 44.4, 'Subscriptions'], ['Physical stores (Whole Foods...)', 21.2, 'Retail'], ['Other', 5.4, 'Other']] },
  },
  META: {
    model: 'Meta owns Facebook, Instagram, WhatsApp and Messenger. The apps are free; Meta earns money by showing targeted advertising. Its Reality Labs division builds virtual-reality headsets and smart glasses and currently loses money.',
    famous: [['Facebook', 'Facebook'], ['Instagram', 'Instagram'], ['WhatsApp', 'WhatsApp'], ['Meta Quest', 'Meta_Quest']],
    edge: ['More than 3 billion people use at least one of its apps every day.',
      'Detailed knowledge of user interests lets advertisers target precisely.',
      'Almost all revenue is advertising, so it depends on advertisers\' budgets and the economy.'],
    mix: { title: 'Revenue by type', year: 'FY2024', cur: 'USD', groupsTitle: 'Advertising vs everything else', items: [
      ['Advertising', 160.6, 'Advertising'], ['Reality Labs (VR, glasses)', 2.1, 'Other'], ['Other (apps)', 1.7, 'Other']] },
  },
  TSLA: {
    model: 'Tesla designs and sells electric cars directly to customers (no dealers), plus home and grid batteries and solar products. It also sells "regulatory credits" to other carmakers that need them to meet emission rules.',
    famous: [['Model 3', 'Tesla_Model_3'], ['Model Y', 'Tesla_Model_Y'], ['Powerwall', 'Tesla_Powerwall'], ['Supercharger', 'Tesla_Supercharger']],
    edge: ['Pioneer of mass-market electric cars, with its own charging network.',
      'Software updated over the air, including driver-assistance features.',
      'A growing energy-storage business alongside cars.'],
    mix: { title: 'Revenue by business', year: 'FY2024', cur: 'USD', items: [
      ['Car sales', 72.5, 'Automotive'], ['Services & other', 10.5, 'Services'], ['Energy (batteries, solar)', 10.1, 'Energy'], ['Regulatory credits', 2.8, 'Automotive'], ['Car leasing', 1.8, 'Automotive']] },
  },
  NVDA: {
    model: 'Nvidia designs chips (it does not manufacture them; partners like TSMC do). Its graphics processors started in video games and are now the main hardware used to train and run artificial-intelligence models in data centres.',
    famous: [['GeForce graphics cards', 'GeForce'], ['CUDA software', 'CUDA'], ['Data-centre GPUs', 'Hopper_(microarchitecture)']],
    edge: ['CUDA, its programming platform, has been used by developers for over 15 years, so AI software is built around Nvidia chips.',
      'It sells complete systems (chips, networking, software), not just chips.',
      'Revenue is concentrated in a few very large customers (cloud companies).'],
    mix: { title: 'Revenue by market', year: 'FY2025 (to Jan 2025)', cur: 'USD', items: [
      ['Data Center (AI)', 115.2, 'Data Center'], ['Gaming', 11.4, 'Gaming'], ['Professional Visualization', 1.9, 'Other'], ['Automotive', 1.7, 'Other'], ['OEM & other', 0.4, 'Other']] },
  },
  KO: {
    model: 'Coca-Cola mostly sells concentrate (the syrup) to independent bottling companies, which add water, bottle the drinks and deliver them. This keeps Coca-Cola\'s own factories and trucks to a minimum and its profit margins high.',
    famous: [['Coca-Cola', 'Coca-Cola'], ['Sprite', 'Sprite_(drink)'], ['Fanta', 'Fanta'], ['Costa Coffee', 'Costa_Coffee']],
    edge: ['One of the best-known brands in the world, sold in more than 200 countries.',
      'The bottler model needs little capital, so much of the profit becomes free cash.',
      'Has raised its dividend every year for more than 60 years.'],
  },
  PG: {
    model: 'Procter & Gamble makes everyday household and personal-care products sold in supermarkets worldwide. People buy them every week, in good economies and bad.',
    famous: [['Tide', 'Tide_(brand)'], ['Pampers', 'Pampers'], ['Gillette', 'Gillette'], ['Oral-B', 'Oral-B']],
    edge: ['A portfolio of leading brands lets it raise prices when its costs rise.',
      'Very large marketing and research budgets that small rivals cannot match.',
      'Has raised its dividend every year for more than 60 years.'],
    mix: { title: 'Share of net sales by segment', year: 'FY2024 (to Jun 2024)', unit: '%', items: [
      ['Fabric & Home Care', 36, 'Household'], ['Baby, Feminine & Family Care', 24, 'Household'], ['Beauty', 18, 'Personal care'], ['Health Care', 14, 'Personal care'], ['Grooming', 8, 'Personal care']] },
  },
  MCD: {
    model: 'Most McDonald\'s restaurants are owned and run by independent franchisees. McDonald\'s collects rent and royalties (a percentage of their sales) and often owns the land and buildings, so it is in large part a real-estate and brand business.',
    famous: [['Big Mac', 'Big_Mac'], ['Happy Meal', 'Happy_Meal'], ['McFlurry', 'McFlurry']],
    edge: ['About 95% of its 40,000+ restaurants are franchised, which makes its income steady and high-margin.',
      'Owning the property under many restaurants gives it rent income for decades.',
      'Scale in purchasing and advertising that few restaurant chains can match.'],
    mix: { title: 'Revenue by source', year: 'FY2023', cur: 'USD', groupsTitle: 'Franchise fees vs own restaurants', items: [
      ['Franchised restaurants (rent & royalties)', 15.4, 'Franchise'], ['Company-operated restaurants', 9.7, 'Own restaurants'], ['Other', 0.3, 'Other']] },
  },
  DIS: {
    model: 'Disney creates stories and characters, then earns money from them many times: in cinemas, on TV and Disney+, in theme parks, cruises and merchandise.',
    famous: [['Mickey Mouse', 'Mickey_Mouse'], ['Walt Disney World', 'Walt_Disney_World'], ['Disney+', 'Disney%2B'], ['ESPN', 'ESPN']],
    edge: ['Owns Marvel, Pixar, Star Wars and its classic animation library.',
      'Theme parks turn films into experiences that are very hard to copy.',
      'ESPN gives it a leading position in US sports broadcasting.'],
    mix: { title: 'Revenue by segment', year: 'FY2024 (to Sep 2024)', cur: 'USD', items: [
      ['Entertainment (film, TV, Disney+)', 41.2, 'Media'], ['Experiences (parks, cruises, merchandise)', 34.2, 'Parks'], ['Sports (ESPN)', 17.6, 'Media']],
      note: 'Segment figures are before eliminations between segments, so they add up to slightly more than total revenue.' },
  },
  WMT: {
    model: 'Walmart runs discount supermarkets and hypermarkets. It earns a small profit on each sale but sells enormous volumes, and uses its size to negotiate low prices from suppliers.',
    famous: [['Walmart Supercenter', 'Walmart'], ["Sam's Club", "Sam's_Club"]],
    edge: ['The world\'s largest company by revenue.',
      'Stores within about 10 miles of most Americans, now also used as delivery hubs.',
      'Thin margins (around 2–3% net) are typical for grocery retail: efficiency is the business.'],
    mix: { title: 'Net sales by segment', year: 'FY2025 (to Jan 2025)', cur: 'USD', items: [
      ['Walmart U.S.', 462.4, 'US'], ['Walmart International', 123.0, 'International'], ["Sam's Club U.S.", 90.2, 'US']] },
  },
  JPM: {
    model: 'JPMorgan Chase is the largest US bank. It earns interest by lending money for more than it pays depositors (net interest income) and fees from investment banking, trading, asset management and cards.',
    famous: [['Chase Bank', 'Chase_Bank'], ['J.P. Morgan', 'J.P._Morgan_%26_Co.']],
    edge: ['The largest US bank by assets, with a nationwide network of branches.',
      'Diversified: retail banking, corporate lending, investment banking and wealth management.',
      'Banks are analysed differently: revenue, debt and margins mean different things (see the industries lesson).'],
    mix: { title: 'Revenue by type', year: 'FY2024', cur: 'USD', groupsTitle: 'Interest vs fees', items: [
      ['Net interest income', 92.6, 'Interest'], ['Non-interest revenue (fees, trading)', 85.0, 'Fees']] },
  },
  CAT: {
    model: 'Caterpillar builds construction and mining machines, engines and turbines, sold through independent dealers that also sell parts and service. Its finance arm lends customers money to buy the machines.',
    famous: [['D9 bulldozer', 'Caterpillar_D9'], ['797 mining truck', 'Caterpillar_797']],
    edge: ['The world\'s largest construction-equipment maker.',
      'A global dealer network for parts and repairs provides steady income between machine sales.',
      'Sales follow the construction, mining and energy cycle (see lesson: the economic cycle).'],
  },
  XOM: {
    model: 'ExxonMobil finds and produces oil and natural gas (upstream), refines it into fuels (downstream), and makes chemicals. Its profits move strongly with oil and gas prices.',
    famous: [['Exxon', 'Exxon'], ['Mobil', 'Mobil'], ['Esso', 'Esso']],
    edge: ['One of the largest energy companies in the world.',
      'Integrated: when crude prices fall, refining and chemicals can cushion part of the blow.',
      'Very large capital spending: projects take years and billions before producing.'],
  },
  V: {
    model: 'Visa runs a payment network. It does not lend money or issue cards itself; banks do. Visa earns a small fee each time a card is used and processes the transaction.',
    famous: [['Visa cards', 'Visa_Inc.'], ['Contactless payment', 'Contactless_payment']],
    edge: ['A network effect: shops accept Visa because people carry it, and people carry it because shops accept it.',
      'Very high profit margins, because each extra transaction costs almost nothing to process.',
      'No credit risk: unpaid card debt is the issuing bank\'s problem.'],
  },
  JNJ: {
    model: 'Johnson & Johnson develops prescription medicines and medical devices (surgery, orthopaedics, vision). It spun off its consumer brands (Tylenol, Neutrogena) as Kenvue in 2023.',
    famous: [['Stelara', 'Ustekinumab'], ['Darzalex', 'Daratumumab']],
    edge: ['Very large research budget and a broad portfolio of medicines.',
      'Patents protect key drugs for limited periods; revenue drops when they expire.',
      'One of very few companies with the highest (AAA) credit rating.'],
    mix: { title: 'Revenue by segment', year: 'FY2024', cur: 'USD', items: [['Innovative Medicine', 57.0, 'Pharma'], ['MedTech', 31.9, 'Devices']] },
  },
  ASML: {
    model: 'ASML (Netherlands) builds the lithography machines that print circuits onto silicon chips. Every advanced chipmaker (TSMC, Samsung, Intel) buys them; it also earns service and upgrade revenue from the machines already installed.',
    famous: [['EUV lithography machines', 'Extreme_ultraviolet_lithography']],
    edge: ['The only company in the world that makes extreme-ultraviolet (EUV) lithography machines.',
      'Each machine costs well over €100 million and takes years to build.',
      'Exports are subject to government controls, especially to China.'],
    mix: { title: 'Net sales by type', year: 'FY2024', cur: 'EUR', groupsTitle: 'New machines vs service', items: [
      ['System sales (new machines)', 21.8, 'Machines'], ['Installed base management (service, upgrades)', 6.5, 'Service']] },
  },
  TM: {
    model: 'Toyota (Japan) is one of the world\'s largest carmakers. It sells under the Toyota and Lexus brands and leads in hybrid cars; a large financing arm lends to its buyers.',
    famous: [['Corolla', 'Toyota_Corolla'], ['Prius', 'Toyota_Prius'], ['RAV4', 'Toyota_RAV4'], ['Lexus', 'Lexus']],
    edge: ['The "Toyota Production System" (lean manufacturing) is studied by factories worldwide.',
      'Reputation for reliability and strong resale values.',
      'Reports in Japanese yen; its shares also trade in New York as ADRs (TM).'],
  },
  SAP: {
    model: 'SAP (Germany) makes the software large companies use to run finance, purchasing, manufacturing and HR (so-called ERP software), increasingly sold as cloud subscriptions.',
    famous: [['SAP S/4HANA', 'SAP_S/4HANA'], ['SAP ERP', 'SAP_ERP']],
    edge: ['Used by most of the world\'s largest companies.',
      'Very costly and risky for customers to replace once installed, so they stay for decades.',
      'Moving customers from licences to cloud subscriptions makes revenue more recurring.'],
  },
  NVO: {
    model: 'Novo Nordisk (Denmark) is a pharmaceutical company specialising in diabetes and obesity. Its semaglutide medicines (Ozempic, Wegovy) made it one of Europe\'s most valuable companies.',
    famous: [['Ozempic / Wegovy (semaglutide)', 'Semaglutide'], ['Insulin', 'Insulin_(medication)']],
    edge: ['A century of experience in insulin and diabetes care.',
      'Large-scale production of injectable medicines, which is hard to copy quickly.',
      'Reports in Danish kroner; faces growing competition in obesity drugs.'],
  },
  'H2O.RO': {
    model: 'Hidroelectrica is Romania\'s largest electricity producer, generating power mainly from hydroelectric dams on the Danube and Romanian rivers. It sells electricity to suppliers, large consumers and households.',
    famous: [['Iron Gates I dam', 'Iron_Gate_I_Hydroelectric_Power_Station'], ['Vidraru Dam', 'Vidraru_Dam']],
    edge: ['Its 2023 listing on the Bucharest Stock Exchange was the largest IPO in Romania\'s history.',
      'Hydropower has low running costs, but output depends on rainfall and river levels.',
      'The Romanian state remains the majority shareholder.'],
  },
};

export function profileFor(symbol) {
  const s = String(symbol || '').toUpperCase();
  return PROFILES[ALIASES[s] || s] || null;
}

// Suggestions shown under the search box.
export const SUGGESTIONS = [
  ['🇺🇸 US giants', [['AAPL', 'Apple'], ['MSFT', 'Microsoft'], ['NVDA', 'Nvidia'], ['AMZN', 'Amazon'], ['GOOGL', 'Alphabet (Google)'], ['META', 'Meta'], ['NFLX', 'Netflix'], ['TSLA', 'Tesla']]],
  ['🛒 Everyday brands', [['KO', 'Coca-Cola'], ['PG', 'Procter & Gamble'], ['MCD', "McDonald's"], ['WMT', 'Walmart'], ['DIS', 'Disney'], ['NKE', 'Nike']]],
  ['🏭 Industry, energy, health & finance', [['CAT', 'Caterpillar'], ['XOM', 'ExxonMobil'], ['JNJ', 'Johnson & Johnson'], ['JPM', 'JPMorgan Chase'], ['V', 'Visa'], ['BRK-B', 'Berkshire Hathaway']]],
  ['🌍 Outside the US', [['ASML.AS', 'ASML · Netherlands'], ['SAP.DE', 'SAP · Germany'], ['MC.PA', 'LVMH · France'], ['NESN.SW', 'Nestlé · Switzerland'], ['NOVO-B.CO', 'Novo Nordisk · Denmark'],
    ['7203.T', 'Toyota · Japan'], ['0700.HK', 'Tencent · Hong Kong'], ['H2O.RO', 'Hidroelectrica · Romania'], ['TLV.RO', 'Banca Transilvania · Romania']]],
];
