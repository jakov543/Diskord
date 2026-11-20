# Diskord changelog

## 6.5.0
- 💎 **Diskord Nitro** is here: **2,99 € / month** or **29,99 € / year**
  - 💎 badge next to your name
  - GIF avatar and banner
  - custom emoji from all your servers, in any server
  - 50 MB uploads
- 🚀 **Server Boost** is here: **1,99 € / month** or **19,99 € / year**
  - 🚀 next to the server name
  - 250 emoji slots
  - GIF server icon
- 💳 Pay with **PayPal**. Aircash is coming soon.
  - After you pay, press **I've paid**. The owner checks the payment and your perks turn on right away.
  - It does not renew by itself.
- 🎞️ GIF search now uses **KLIPY**, because Google shut down Tenor GIFs on 30 June 2026

## 6.4.0
- 📞 **New call screen like Discord**
  - everyone shows as a round avatar, with a green ring when they talk and red mute / deafen badges
  - camera and screen share switch to video tiles; click a tile to make it big, double-click for full screen
  - new control bar: mic ▾ and camera ▾ menus to pick your **microphone, speakers and camera** and turn noise suppression on or off
  - **😀 Reactions** that fly up on everyone's screen
  - **🔊 Soundboard** (Airhorn, Ba Dum Tss, Ding, Applause, Boom, Siren, Sad Trombone, Crickets) that everyone in the call hears
  - **⋯** menu: Deafen, Copy Invite Link, Full Screen, Stream Quality
  - opening a call from Diskord joins it straight away, with a call timer
- 🖥️ **New screen share window**
  - **Applications / Entire Screen / Devices** tabs, and **Devices** can share a camera or capture card
  - quality settings: **Gaming** (smoother), **Text** (sharper) or **Custom**, at 720p / 1080p / 1440p / Source and 15 / 30 / 60 FPS, free for everyone
- 👤 **Full profile window** (**View Full Profile**): Activity, Mutual Friends, Mutual Servers, Member Since, Friends Since, a private Note, plus a ⋯ menu with Share Profile, Invite to Server, **Block** and Copy User ID
- 💬 The DM header now shows the friend's avatar, an **Add Friend** button and a **Show User Profile** button, and search says "Search username"
- 🎮 Rich Presence fixes: the new Diskord logo shows instead of the old one, and your status shows instead of a ❓

## 6.3.0
- 🖼️ **Edit Image** — when you pick a profile picture, banner, server icon or emoji you can now **zoom** (slider or mouse wheel), **drag to move**, **rotate**, and press **Apply** (or **Reset** / **Cancel**)
- 🎮 **Better Discord Rich Presence**
  - shows the server you're in with its icon, the channel, and how many people are online
  - in calls it shows how many people are in the call
  - your Diskord avatar and status in the corner
  - new **Discord Rich Presence** settings (click your profile → 🎮) with a live preview: hide names, hide your avatar, or add a **Join server** button
  - hides itself when you're Invisible

## 6.2.0
- 📁 **Categories** — group channels into categories, collapse them, and add channels with the **+** next to a category
- ➕ **New Create Channel window** — pick Text / Voice / Forum (coming soon), name, category and a 🔒 **Private Channel** toggle with chosen members
- ⚙️ **Full-screen Server Settings** — Server Profile with banner colours, description and a live preview card, plus Emoji, Members, Co-owners, Invites, Bans and Delete Server
- 👤 **New Invite window** — search your friends and press **Invite** to send them an invite card in DMs; they press **Join** to join
- 🔨 **Ban members** — banned people can't see or post in the server until you revoke the ban
- 💎 **Nitro** and 🚀 **Server Boost** pages added — **coming soon**
- New servers come with TEXT CHANNELS and VOICE CHANNELS categories

## 6.1.1
### 🛠️ Fixes
- Tooltips on the server list no longer get stuck on screen. Only one shows at a time, and it disappears as soon as you move away or click

## 6.1.0
### ✨ New
- 🎧 **New Diskord logo**: a gamer headset around a chat-bubble "D" on a blue app tile. It's on the app icon, taskbar, installer, login screen, loading screens, server list and Discord Rich Presence

## 6.0.0
### ✨ New
- 💙 **New blue look**: blue logo, buttons, highlights and loading screens, plus a darker blue background
- 🖥️ **Choose what to share**: screen sharing now opens a picker with **Applications** (one app window, e.g. Minecraft or FiveM) or **Entire screen**, with previews and an **Also share sound** option
- ⬆️ **Updates install when you open Diskord**: no more "Restart now?" popups. New versions download in the background and install the next time you open (or close) Diskord. The tray menu has **Restart to update** if you want it right away
### 🛠️ Fixes
- 📞 Calls now work between different homes and mobile data too: added free relay servers for when routers block direct connections. Tested with 3 people: voice, camera, leave and rejoin
- The GIF picker opens on Diskord GIFs when Tenor search isn't set up, instead of showing an error

## 5.0.0
### ✨ New
- 🌍 **No server needed — just install and use, like Discord.** Diskord now runs on the open **Nostr** network: your messages are saved on several free public relays at once, so there's no VPS, no Firebase and nothing to set up
- 🔐 **Sign up with display name, username and password**, no email needed. Log in from any PC with the same username + password
- 🔒 **Encrypted DMs**: only you and your friend can read them
- 🔗 **Invite codes**: servers are private to the people you invite. Server menu → **Invite people**, friends click **+** → **Join with an invite code**
- 🚪 **Leave server** for members; the members list now shows who's actually in each server
- 🖼️ Pictures and GIFs up to 15 MB in the desktop app (free anonymous upload)
- ✅ Every app checks every change, so nobody can fake owners, edit other people's messages or read your DMs
### ⚠️ Good to know
- Your password can't be reset (it *is* your key), so write it down
- Messages in servers can be read by anyone who has the invite code. Use DMs for private stuff

## 4.0.0
### ✨ New
- 🗄️ **Diskord's own server and database**: no more Firebase and no Google. Run **diskord-server** on your VPS or hosting panel, and everything (accounts, servers, messages, DMs, friends, pictures, GIFs) is saved on your own machine
- 🔐 Own accounts: sign up with display name, @username, email and password, then log in with email **or** username
- 🌐 First start asks for your server address (for example `123.45.67.89:3000`); change it any time from your profile menu
- 🔑 Change password from your profile menu. The owner can reset forgotten passwords with `resetpw` in the server console
- 👑 Owner console commands: users, resetpw, ban/unban, sign-ups on/off
- 💾 The server backs itself up every 6 hours
### 🛠️ Fixes
- After creating a server, Diskord now jumps straight into it
- "Friend request sent" message no longer disappears

## 3.0.1
### 🛠️ Fixes
- "You don't have permission" when using Friends, DMs or usernames: if your Firebase rules are older than the app, Diskord now shows a yellow bar with **Copy new rules** and **Open Firebase rules** buttons, so the fix takes 30 seconds
- Saving your username again no longer fails
- Clear help when the microphone or camera is blocked by Windows privacy settings

## 3.0.0
### ✨ New
- 💬 **Direct Messages**: the Diskord button at the top of the server list opens your DMs
- 👋 **Friends**: Online / All / Pending / Add Friend tabs. Add friends by **@username**, then accept or ignore requests
- ✉️ **Message Requests**: messages from people who aren't your friends wait here until you accept them
- 🪪 **Usernames**: everyone picks a unique @username (asked when you sign up, or once after you update)
- 🎙️ **Voice Connected panel**: camera, screen share, invite link, mute and disconnect, right above your profile
- 🧑‍🎨 **New profile card**: banner, status bubble, @username • pronouns, About me, what you're doing, plus Message / Call / Video / Add Friend
- 🎨 **Profile editor with live preview**: display name colour or **gradient name**, pronouns, avatar, banner, **profile theme**, custom status and About me
- 🔄 **Loading screen like Discord**: big bouncing logo with "Did you know" tips. The update window shows "Checking for updates…" and "Downloading update… 45%", then installs by itself
- 📡 **Offline screen**: if your internet drops, Diskord shows a "You're offline" screen and reconnects automatically
- 📞 Calling from a DM rings that friend; the DM side panel shows their profile
### 🛠️ Fixes
- No Shop or Nitro here, just your friends and chats

## 2.2.0
### ✨ New
- 🎮 **Discord Rich Presence**: your Discord profile shows that you're using Diskord, which server and #channel you're in, and "📞 In a voice call" or "🎥 In a video call" with a call timer, plus a **Get Diskord** button
- Turn it on or off any time: right-click the Diskord icon by the clock → **Show on Discord (Rich Presence)**

## 2.1.1
### 🛠️ Fixes
- Sign up / Log in now say exactly what went wrong instead of just "Error" (for example when Email/Password login isn't switched on in Firebase, or the database rules are missing)
- Every error now shows its error code, so it's easy to fix

## 2.1.0
### ✨ New
- 🔥 **Real GIFs**: search millions of GIFs from Tenor, with Trending and quick picks (lol, gg, hype, dance, sad, cat…)
- ⭐ Favorite any GIF, including Tenor ones
- ⬆️ **Automatic updates**: Diskord checks for new versions, downloads them in the background and asks to restart
- 📝 "What's new" window after each update, and **Check for updates** in the tray menu
### 🛠️ Fixes
- The GIF picker no longer jumps while results are loading
- Searching GIFs waits until you stop typing

## 2.0.0
### ✨ New
- 🔐 **Diskord accounts**: Sign up and Log in with email + password (no Claude login), password reset, change your display name, Log out
- 👑 The first account becomes the Diskord owner
- 📡 Works offline with your recent messages, plus an "offline" bar and screen that reconnect by themselves
- 🎨 Branded installer with a Diskord sidebar, desktop + Start menu shortcuts, and Diskord opens when the install finishes
### 🛠️ Fixes
- Pictures shrink automatically so uploads don't fail

## 1.1.0
- Start-up splash, offline screen, tray icon, remembers window size, F5 to reload

## 1.0.0
- First Windows app: chat, servers, GIFs, emoji, voice + video calls with screen share
