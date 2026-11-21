// Optional: use your own list of Nostr relays instead of the default public ones, e.g.
// window.DISKORD_RELAYS = ['wss://relay.damus.io', 'wss://nos.lol'];
window.DISKORD_RELAYS = null;

// The Diskord owner is @frost (set in adapter.js). Extra owners by User ID can go here.
window.DISKORD_OWNERS = [];
// GIF search: free key from https://partner.klipy.com (Google shut down the Tenor API on 30 June 2026)
window.DISKORD_KLIPY = 'Zrw2PDze02VQvFPyR1u6Qqxi8tAz47dHVqYgiCcQX9ZczUtxa6U6l5Rllp0w1ze5';
// Aircash: the phone number or Aircash ID people send money to (leave empty to show "Coming soon")
window.DISKORD_AIRCASH = '';

// Call relay (TURN) server: needed when someone's router blocks direct calls (very common).
// Free account: https://www.expressturn.com (1 TB/month free) — paste the username + password here, e.g.
// window.DISKORD_TURN = [{ urls: ['turn:relay1.expressturn.com:3478?transport=udp', 'turn:relay1.expressturn.com:3478?transport=tcp', 'turns:relay1.expressturn.com:443?transport=tcp'], username: '…', credential: '…' }];
window.DISKORD_TURN = null;
