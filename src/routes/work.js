import { Router } from 'express';
import {
  getInboxTriage,
  getEmails,
  getMeetings,
  getCalendarSuggestions,
  getTasks,
  draftReply,
  suggestCalendarChange,
  applyCalendarChange,
} from '../lib/outlookClient.js';
import { getGmailEmails, getGoogleCalendarEvents } from '../lib/googleWorkClient.js';
import { isConnected as isGoogleConnected } from '../lib/googleAuth.js';

const router = Router();

// Both providers feed one combined view - each is independently
// optional (either, both, or neither may be connected), so callers
// never need to know which accounts are actually wired up.
async function combinedEmails() {
  const [outlook, gmail] = await Promise.all([getEmails(), getGmailEmails().catch(() => null)]);
  const outlookEmails = outlook.emails.map((e) => ({ ...e, source: e.source || (outlook.live ? 'outlook' : 'sample') }));
  const all = [...outlookEmails, ...(gmail || [])];
  all.sort((a, b) => new Date(b.receivedAt || 0) - new Date(a.receivedAt || 0));
  return { shadow: outlook.shadow && !gmail, live: outlook.live || Boolean(gmail), emails: all };
}

async function combinedMeetings() {
  const [outlook, google] = await Promise.all([getMeetings(), getGoogleCalendarEvents().catch(() => null)]);
  const outlookMeetings = outlook.meetings.map((m) => ({ ...m, source: m.source || (outlook.live ? 'outlook' : 'sample') }));
  const all = [...outlookMeetings, ...(google || [])];
  all.sort((a, b) => (a.time > b.time ? 1 : -1));
  return { shadow: outlook.shadow && !google, live: outlook.live || Boolean(google), meetings: all };
}

// GET /api/work/briefing - today's meetings, replies needed, follow-ups
router.get('/briefing', async (req, res) => {
  try {
    const [outlookTriage, { emails }, { meetings }] = await Promise.all([getInboxTriage(), combinedEmails(), combinedMeetings()]);
    const googleConnected = await isGoogleConnected();
    const anyLive = outlookTriage.live || googleConnected;
    if (!anyLive) return res.json(outlookTriage);
    res.json({
      shadow: false,
      live: true,
      meetingsToday: meetings.length,
      needReply: emails.filter((e) => e.tag === 'unread').length,
      overdueFollowUps: 0,
      note: 'Follow-ups/tasks aren\'t connected yet, so this is always 0 for now.',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/work/emails - inbox triage list, merged across connected providers
router.get('/emails', async (req, res) => {
  try {
    res.json(await combinedEmails());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/work/meetings - today's meetings + prep notes, merged across connected providers
router.get('/meetings', async (req, res) => {
  try {
    res.json(await combinedMeetings());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/work/calendar/suggestions - proactive calendar conflict suggestions
router.get('/calendar/suggestions', async (req, res) => {
  try {
    const data = await getCalendarSuggestions();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/work/tasks - follow-ups & tasks
router.get('/tasks', async (req, res) => {
  try {
    const data = await getTasks();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/work/draft  { messageId, draftText }
// Creates a draft only - never sends.
router.post('/draft', async (req, res) => {
  try {
    const { messageId, draftText } = req.body;
    const draft = await draftReply(messageId, draftText);
    res.json(draft);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/work/calendar/suggest  { eventId, change }
router.post('/calendar/suggest', async (req, res) => {
  try {
    const { eventId, change } = req.body;
    const suggestion = await suggestCalendarChange(eventId, change);
    res.json(suggestion);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/work/calendar/confirm  { eventId, change, userConfirmed: true }
router.post('/calendar/confirm', async (req, res) => {
  try {
    const { eventId, change, userConfirmed } = req.body;
    const result = await applyCalendarChange(eventId, change, userConfirmed);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
