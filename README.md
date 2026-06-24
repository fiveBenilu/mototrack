# MotoTrack

Eine iOS-optimierte Web-App (PWA) zum Aufzeichnen von Motorrad-Touren: Schräglage (Gyroskop), Speed & Distanz (GPS), Statistik-Dashboard, "Blitzer"-Minigame auf der Karte und ein Freunde-System mit Live-Standorten.

## Projektstruktur

- `client/` – React + TypeScript + Vite, Tailwind CSS, react-leaflet, recharts, PWA (vite-plugin-pwa)
- `server/` – Node.js + Express + TypeScript, SQLite (better-sqlite3), WebSocket (`ws`) für Live-Standorte

## Entwicklung

```bash
npm install
npm install --prefix client
npm install --prefix server
npm run dev
```

Startet Client (Vite Dev-Server) und Server (Express auf Port 8009) parallel. Der Vite-Dev-Server proxyt `/api`, `/uploads` und `/ws` an `http://localhost:8009`.

**Hinweis:** iOS Safari verlangt für `DeviceOrientationEvent`/`DeviceMotionEvent` und Geolocation eine sichere Verbindung (HTTPS oder `localhost`). Zum Testen auf dem iPhone muss die App entweder über `localhost` (z. B. via USB-Tunnel) oder über HTTPS (siehe Cloudflare Tunnel unten) erreichbar sein.

## Production-Build & Start

```bash
npm run build   # baut client (dist) und server (dist)
npm run start   # startet den Express-Server auf Port 8009, liefert client/dist aus
```

Der Server läuft komplett auf **Port 8009** (per `PORT`-Umgebungsvariable überschreibbar) und liefert sowohl die API (`/api/*`), WebSocket (`/ws`) als auch das gebaute Frontend aus.

### Umgebungsvariablen

| Variable      | Standard              | Beschreibung |
|---------------|-----------------------|--------------|
| `PORT`        | `8009`                | HTTP-Port des Servers |
| `JWT_SECRET`  | `dev-secret-change-me`| **Unbedingt** in Produktion auf einen zufälligen, geheimen Wert setzen |
| `NODE_ENV`    | –                      | Auf `production` setzen für sichere Cookies (`secure`, `sameSite=none`) hinter HTTPS-Proxy |

Beispiel:

```bash
JWT_SECRET="$(openssl rand -hex 32)" NODE_ENV=production npm run start
```

### Persistente Daten

- SQLite-Datenbank: `server/data/mototrack.db`
- Hochgeladene Profilbilder: `server/uploads/avatars`

Beide Verzeichnisse sollten bei Updates/Deployments erhalten bleiben (z. B. als Volume, falls containerisiert).

### Admin-Dashboard

Unter `/admin` gibt es ein Dashboard (alle Konten, Speichernutzung, Konten löschen, Passwörter setzen). Es ist nur für Konten mit Admin-Flag sichtbar. Den Admin-Login legst du auf dem Server an bzw. änderst ihn jederzeit:

```bash
cd server
npm run admin -- set <username> <passwort>   # Admin anlegen oder Passwort setzen + zum Admin machen
npm run admin -- promote <username>           # vorhandenes Konto zum Admin machen (Passwort unverändert)
npm run admin -- list                         # Admins anzeigen
npm run admin -- demote <username>            # Admin-Rechte entziehen
```

Die Datenbank muss dafür existieren (Server mindestens einmal gestartet). Respektiert `DB_PATH`.

## Deployment mit Cloudflare Tunnel (HTTPS)

Damit iOS-Sensor-APIs und Service Worker funktionieren, braucht die App eine echte HTTPS-Domain. Der Server selbst läuft weiterhin nur über HTTP auf Port 8009 – Cloudflare terminiert TLS.

1. **Server starten** (siehe oben), z. B. als systemd-Service oder in einem Terminal-Multiplexer:
   ```bash
   JWT_SECRET="..." NODE_ENV=production npm run start
   ```

2. **cloudflared installieren** (falls noch nicht vorhanden):
   ```bash
   curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
   chmod +x cloudflared
   sudo mv cloudflared /usr/local/bin/
   ```

3. **Bei Cloudflare anmelden** (öffnet einen Browser-Login, Domain muss bei Cloudflare verwaltet werden):
   ```bash
   cloudflared tunnel login
   ```

4. **Tunnel erstellen und DNS-Eintrag setzen**:
   ```bash
   cloudflared tunnel create mototrack
   cloudflared tunnel route dns mototrack mototrack.deine-domain.de
   ```

5. **Tunnel-Konfiguration** (`~/.cloudflared/config.yml`):
   ```yaml
   tunnel: mototrack
   credentials-file: /home/<user>/.cloudflared/<tunnel-id>.json

   ingress:
     - hostname: mototrack.deine-domain.de
       service: http://localhost:8009
     - service: http_status:404
   ```

6. **Tunnel starten**:
   ```bash
   cloudflared tunnel run mototrack
   ```

   Optional als systemd-Service (`cloudflared service install`), damit der Tunnel automatisch beim Booten startet.

Danach ist die App unter `https://mototrack.deine-domain.de` erreichbar – inklusive funktionierender Sensor-Permissions (DeviceOrientation/Geolocation), Service Worker (PWA-Installation "Zum Home-Bildschirm") und sicherer Cookies/WebSocket (`wss://`).

## Features im Überblick

- **Home**: Schnellzugriff, letzte Fahrt, online Freunde
- **Fahren**: Sensor-Permissions, Kalibrierung der Schräglage-Nullposition, Live-Aufzeichnung (Speed, Schräglage, Distanz, Dauer)
- **Karte**: OSM-Karte mit deterministisch generierten "Blitzern" (Speed-Traps), Punkte & Sterne bei Durchfahrt, Live-Standorte von Freunden
- **Routen**: Touren mit Wegpunkten auf der Karte planen (OSRM-Routing), als Profilkarte mit Strecke & ca. Fahrzeit speichern und mit Freunden teilen. Freie Fahrt (nur Punkte sammeln) vs. geführte Fahrt mit Route auf der Karte und Turn-by-turn-Anweisungen. Gruppen können eine gemeinsame Route festlegen, der alle Mitglieder folgen.
- **Statistik**: Bestwerte, Verlaufs-Charts, Kurven-Bewertungen (Bronze/Silber/Gold/Platin nach Schräglage), Freundes-Vergleich
- **Einstellungen**: Profil (Name, Profilbild), Passwort ändern, Freunde verwalten (Freunde-Code, Anfragen), Theme (Auto/Hell/Dunkel)
