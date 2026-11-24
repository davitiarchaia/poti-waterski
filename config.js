/* =================== SETTINGS — edit these =================== */
window.CONFIG = {
  phone: '',          // e.g. '+995 555 12 34 56'  (empty = hidden)
  whatsapp: '',       // digits only, e.g. '995555123456' (empty = WhatsApp buttons hidden)
  instagram: '',      // e.g. 'potiwaterski'
  openHour: 9,        // first bookable hour
  closeHour: 19,      // last bookable hour (a 19:00 slot ends at 20:00)
  seasonMonths: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], // all year — the owner closes and reopens the club on the owner page (Days off)
  monthsAhead: 12,    // how far ahead people can book
  lat: 42.10874, lon: 41.68986,     // Golden Lake, Maltakva, Poti
  timezone: 'Asia/Tbilisi',
  // legal details shown on the Terms page (terms.html) — fill in before going live
  legalName: '',      // e.g. 'შპს ფოთის წყლის თხილამურების კლუბი'
  legalId: '',        // company ID (საიდენტიფიკაციო კოდი)
  email: '',          // contact email for customers
  cancelHours: 1,     // free cancellation up to this many hours before the ride
  lateCancelFeePct: 10, // cancelling later (until the start) costs this % of the price
  demo: false,          // shows the "demo version" notice bar; set to false when the club goes live
  onlinePayment: false, // set to true after the BOG keys are added in Supabase (Edge Functions → Secrets)
  onlinePassPayment: false, // passes are paid online (BOG) right when bought — set to true once the BOG keys are in Supabase
};
// activities — prices are set by the owner on the owner page (Tariffs)
window.RIDES = [
  { id: 'first', tag: true },
  { id: 'set' },
  { id: 'wake' },
  { id: 'group' },
];
window.SUPABASE = {
  url: 'https://boijrdntbfxvopcamdsd.supabase.co',
  key: 'sb_publishable_n5U7gtibxsdDpAa9za8rmw_0wDPRLvy', // public key, safe in the browser
};
/* ============================================================== */
