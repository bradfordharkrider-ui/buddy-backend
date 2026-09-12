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

const router = Router();

// GET /api/work/briefing - today's meetings, replies needed, follow-ups
router.get('/briefing', async (req, res) => {
  try {
    const data = await getInboxTriage();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/work/emails - inbox triage list
router.get('/emails', async (req, res) => {
  try {
    const data = await getEmails();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/work/meetings - today's meetings + prep notes
router.get('/meetings', async (req, res) => {
  try {
    const data = await getMeetings();
    res.json(data);
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
