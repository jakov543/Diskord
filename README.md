# Diskord

<img src="logo.svg" width="96" alt="Diskord logo">

Diskord (formerly **Flixcord**) is a Discord-style app for you and your friends: servers, channels, GIFs and emoji, plus **voice calls, video calls and screen sharing**.

**⬇ Windows app:** https://github.com/jakov543/Diskord/releases/latest (download `Diskord-Setup-….exe`)
**🌐 Web app:** https://jakov543.github.io/Diskord/ (open it in Chrome or Edge and click **Install app**)

## Install as an app
- **PC (Chrome / Edge):** open the app link, then click **⬇ Install app** (or the install icon in the address bar). Diskord gets its own window, a desktop icon and a Start menu entry.
- **Android:** open the link in Chrome, then tap **Install app** or **⋮ → Add to Home screen**.
- **iPhone:** open the link in Safari, then tap **Share → Add to Home Screen**.

## Features
- 📞 **Voice calls** and 🎥 **video calls**: call a whole channel, call one person, or join a 🔊 voice channel
- Mute, deafen, camera, **screen share**, a glow around whoever is talking, and invite links
- **No server needed**: runs on the open Nostr network (free public relays), with encrypted DMs. Just install and sign up
- Mic and headphone buttons next to your profile, so you can join calls already muted or deafened
- Servers with your own icon, text and voice channels, **co-owners**, and custom server emoji
- GIFs (a built-in pack plus a shared library where you upload your own), 1,300+ emoji
- Replies, edits, pins, reactions, polls, spoilers, images, search and themes

## Files
| File | What it is |
|---|---|
| `index.html` | The Diskord app (chat, servers, GIFs, calls) |
| `call.html` | The call room (WebRTC, peer-to-peer through PeerJS) |
| `adapter.js` | Login / sign-up and the connection to the Nostr network (signed events, rules, encrypted DMs) |
| `vendor/nostr.bundle.js` | nostr-tools library |
| `desktop/` | The Windows app (Electron) and its installer |
| `manifest.webmanifest`, `sw.js`, `icons/` | What makes Diskord installable |

Calls are peer-to-peer: audio and video go straight between the people in the call, and nothing is recorded.

## Credits
- Sounds in `sounds/`: Android sounds by Google from the Android Open Source Project, Apache License 2.0 (see `sounds/NOTICE.txt`).
- Icons: [Lucide](https://lucide.dev), ISC License.
- GIFs: [KLIPY](https://klipy.com).
