# Diskord server

Your own Diskord backend: accounts, servers, channels, DMs, friends, GIFs, pictures and live updates.
Everything is saved in the `data/` folder on **your** machine. Nothing goes to Google or Firebase.

## Start it

### Pterodactyl / game hosting panel (Hostolino and similar)
1. Create a server with a **Node.js** egg (Node 18 or newer).
2. Upload everything in this folder (or upload `diskord-server.zip` and unarchive it).
3. Set the startup file to `server.js`. The port the panel gives you is used automatically.
4. Press **Start**. The console says `✅ Diskord server is running on port …`.

### Linux VPS
```sh
unzip diskord-server.zip && cd diskord-server
./start.sh            # or: npm install && node server.js
```
Open the port in the firewall (`ufw allow 3000`). To keep it running: `npm i -g pm2 && pm2 start server.js --name diskord && pm2 save`.

### Windows PC or VPS
Install Node.js LTS from nodejs.org, then double-click **start.bat**. Open the port in Windows Firewall
(and on your router, if it's a home PC).

## Connect
- **Diskord app:** on first start it asks for the server address, for example `123.45.67.89:3000`.
- **Browser:** open `http://123.45.67.89:3000`.
- **Voice and video calls in a browser** need HTTPS. Use the Diskord app, or put the server behind a domain with HTTPS (for example a Cloudflare Tunnel or nginx + Let's Encrypt).

The **first account that signs up is the owner**.

## Settings (`config.json`)
| Setting | What it does |
|---|---|
| `port` | Port to listen on (a hosting panel's port overrides it) |
| `name` | Name shown on the login screen |
| `allowSignup` | `false` = nobody new can sign up |
| `maxUploadMB` | Largest picture or GIF people can upload |
| `tenorKey` | Optional Tenor API key for GIF search. Without it, the built-in and uploaded GIFs are used |

## Owner commands (type them in the server console)
`users` · `resetpw <username> <newpassword>` · `owner <username>` · `ban <username>` · `unban <username>` · `signups on|off` · `save` · `stop`

## Backups
Copy the `data/` folder. The server also makes a backup copy every 6 hours (`data/backup-YYYY-MM-DD.json`).
