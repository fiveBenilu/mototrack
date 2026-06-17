import express, { ErrorRequestHandler } from 'express';
import { MulterError } from 'multer';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { config } from './config';
import { authRouter } from './routes/auth';
import { ridesRouter, publicRidesRouter } from './routes/rides';
import { camerasRouter } from './routes/cameras';
import { friendsRouter } from './routes/friends';
import { usersRouter } from './routes/users';
import { statsRouter } from './routes/stats';
import { groupsRouter } from './routes/groups';
import { pushRouter } from './routes/push';
import { adminRouter } from './routes/admin';
import { setupWebSocket } from './ws';
import './db';

const app = express();
app.set('trust proxy', 1);

// Standardlimit von express.json() ist 100 KB – zu wenig für lange Fahrten:
// Der Recorder erfasst ~1 Trackpunkt/Sekunde, eine 30-Minuten-Fahrt sind also
// ~1800 Punkte (~150 KB). Limit großzügig anheben (Route deckelt bei 20000
// Punkten ≈ 1,7 MB), sonst schlägt das Speichern langer Fahrten fehl.
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

app.use('/api/auth', authRouter);
app.use('/api/public', publicRidesRouter);
app.use('/api/rides', ridesRouter);
app.use('/api/cameras', camerasRouter);
app.use('/api/friends', friendsRouter);
app.use('/api/users', usersRouter);
app.use('/api/stats', statsRouter);
app.use('/api/groups', groupsRouter);
app.use('/api/push', pushRouter);
app.use('/api/admin', adminRouter);

// Hochgeladene Dateien (Avatare) als statische Inhalte ausliefern. Zusätzlich
// härten: `nosniff` verhindert MIME-Sniffing und der Verzicht auf inline-HTML/SVG
// schützt davor, dass eine hochgeladene Datei als aktives Dokument im Origin
// der App ausgeführt wird (Stored XSS).
app.use(
  '/uploads',
  express.static(path.join(__dirname, '../uploads'), {
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    },
  }),
);

const clientDist = path.join(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Zentrales Error-Handling: liefert immer JSON statt einer HTML-Fehlerseite.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Datei ist zu groß (max. 4 MB)' : 'Upload fehlgeschlagen';
    return res.status(400).json({ error: msg });
  }
  if (err instanceof Error && err.message === 'Nur Bilddateien erlaubt') {
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'Interner Serverfehler' });
};
app.use(errorHandler);

const server = http.createServer(app);
setupWebSocket(server);

server.listen(config.port, () => {
  console.log(`MotoTrack server läuft auf Port ${config.port}`);
});
