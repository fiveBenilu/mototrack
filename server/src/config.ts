const isProd = process.env.NODE_ENV === 'production';

const DEV_SECRET = 'dev-secret-change-me';
const jwtSecret = process.env.JWT_SECRET || DEV_SECRET;

if (isProd && jwtSecret === DEV_SECRET) {
  throw new Error(
    'JWT_SECRET muss in Produktion auf einen geheimen Wert gesetzt werden (z. B. `openssl rand -hex 32`).',
  );
}

export const config = {
  port: Number(process.env.PORT) || 8009,
  jwtSecret,
  isProd,
};
