// Local Node service (see whatsapp-bridge/package.json) — run alongside the
// Next.js app's `npm run dev`. Talks to Firestore directly via firebase-admin
// and is reached by the app's src/lib/whatsapp-bridge-client.ts over HTTP,
// authenticated with a shared secret rather than Firebase Auth (this process
// never sees a user's ID token).

import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import { clientManager } from './client-manager';

const PORT = Number(process.env.PORT || 8090);
const BRIDGE_SECRET = process.env.BRIDGE_SECRET;

if (!BRIDGE_SECRET) {
  throw new Error('BRIDGE_SECRET is not configured (whatsapp-bridge/.env).');
}

const app = express();
// Default 100kb limit is too small for a base64-encoded voucher document —
// bump it well past any realistic .docx size.
app.use(express.json({ limit: '25mb' }));

app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.headers['x-bridge-secret'] !== BRIDGE_SECRET) {
    res.status(401).json({ error: 'Invalid bridge secret.' });
    return;
  }
  next();
});

app.post('/accounts/:id/connect', async (req, res) => {
  try {
    await clientManager.connect(req.params.id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(502).json({ error: err?.message || 'Failed to start pairing.' });
  }
});

app.post('/accounts/:id/disconnect', async (req, res) => {
  try {
    await clientManager.disconnect(req.params.id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(502).json({ error: err?.message || 'Failed to disconnect.' });
  }
});

app.post('/send', async (req, res) => {
  const { accountId, to, body, campaignId, campaignRecipientId } = req.body ?? {};
  if (!accountId || !to || !body) {
    res.status(400).json({ error: 'accountId, to, and body are required.' });
    return;
  }
  try {
    const campaignMeta = campaignId && campaignRecipientId ? { campaignId, campaignRecipientId } : undefined;
    const { chatId } = await clientManager.sendMessage(accountId, to, body, campaignMeta);
    res.json({ ok: true, chatId });
  } catch (err: any) {
    console.error('send failed:', err);
    res.status(502).json({ error: err?.message || 'Failed to send message.' });
  }
});

app.post('/send-media', async (req, res) => {
  const { accountId, to, base64, mimetype, filename, caption, mediaUrl, campaignId, campaignRecipientId } = req.body ?? {};
  if (!accountId || !to || !base64 || !mimetype || !filename) {
    res.status(400).json({ error: 'accountId, to, base64, mimetype, and filename are required.' });
    return;
  }
  try {
    const campaignMeta = campaignId && campaignRecipientId ? { campaignId, campaignRecipientId } : undefined;
    const { chatId } = await clientManager.sendMediaMessage(
      accountId,
      to,
      { base64, mimetype, filename, caption, mediaUrl },
      campaignMeta
    );
    res.json({ ok: true, chatId });
  } catch (err: any) {
    console.error('send-media failed:', err);
    res.status(502).json({ error: err?.message || 'Failed to send media.' });
  }
});

app.listen(PORT, () => {
  console.log(`whatsapp-bridge listening on :${PORT}`);
});
