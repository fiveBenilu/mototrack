import express, { ErrorRequestHandler } from 'express';
import { MulterError } from 'multer';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { config } from './config';
import { authRouter } from './routes/auth';
import { ridesRouter } from './routes/rides';
import { camerasRouter } from './routes/cameras';
import { friendsRouter } from './routes/friends';
import { usersRouter } from './routes/users';
import { statsRouter } from './routes/stats';
import { setupWebSocket } from './ws';
import './db';

const app = express();
app.set('trust proxy', 1);

app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRouter);
app.use('/api/rides', ridesRouter);
app.use('/api/cameras', camerasRouter);
app.use('/api/friends', friendsRouter);
app.use('/api/users', usersRouter);
app.use('/api/stats', statsRouter);

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

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
