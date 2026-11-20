# Diskord changelog

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
