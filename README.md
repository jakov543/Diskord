# Diskord

<img src="logo.svg" width="96" alt="Diskord logo">

Diskord (formerly **Flixcord**) is a Discord-style app for you and your friends: servers, channels, GIFs and emoji, plus **voice calls, video calls and screen sharing**.

**⬇ Windows app:** https://github.com/jakov543/Diskord/releases/latest (download `Diskord-Setup-….exe`)
**🌐 Web app:** https://jakov543.github.io/Diskord/ (open it in Chrome or Edge and click **Install app**)
**💬 Chat:** https://claude.ai/artifact/JmfsXjNXdnXfMiNrJP5a3t (the owner invites friends by email as *Editor*)

## Install as an app
- **PC (Chrome / Edge):** open the app link, then click **⬇ Install app** (or the install icon in the address bar). Diskord gets its own window, a desktop icon and a Start menu entry.
- **Android:** open the link in Chrome, then tap **Install app** or **⋮ → Add to Home screen**.
- **iPhone:** open the link in Safari, then tap **Share → Add to Home Screen**.

## Features
- 📞 **Voice calls** and 🎥 **video calls**: call a whole channel, call one person, or join a 🔊 voice channel
- Mute, deafen, camera, **screen share**, a glow around whoever is talking, and invite links
- Mic and headphone buttons next to your profile, so you can join calls already muted or deafened
- Servers with your own icon, text and voice channels, **co-owners**, and custom server emoji
- GIFs (a built-in pack plus a shared library where you upload your own), 1,300+ emoji
- Replies, edits, pins, reactions, polls, spoilers, images, search and themes

## Files
| File | What it is |
|---|---|
| `index.html` | App home: start or join a voice or video call, open the chat, install the app |
| `call.html` | The call room (WebRTC, peer-to-peer through PeerJS) |
| `app.html` | Source of the chat app, which runs on claude.ai where the messages are stored |
| `manifest.webmanifest`, `sw.js`, `icons/` | What makes Diskord installable |

Calls are peer-to-peer: audio and video go straight between the people in the call, and nothing is recorded.
