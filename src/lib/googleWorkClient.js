// Gmail + Google Calendar reads. This file is the ONLY place that
// should call the Gmail/Calendar APIs - auth itself lives in
// lib/googleAuth.js. Mirrors lib/outlookClient.js's shape so work.js
// can merge results from both providers.

import { google } from 'googleapis';
import { getAuthedClient, isConnected } from './googleAuth.js';

const TZ = 'America/New_York';

function decodeHeader(headers, name) {
  return headers?.find((h) => h.name === name)?.value || null;
}

// "Dana Reyes <dana@acme.com>" -> "Dana Reyes"
function fromDisplayName(raw) {
  if (!raw) return 'Unknown sender';
  const match = raw.match(/^"?([^"<]+)"?\s*</);
  return match ? match[1].trim() : raw;
}

export async function getGmailEmails() {
  if (!(await isConnected())) return null;
  const auth = await getAuthedClient();
  const gmail = google.gmail({ version: 'v1', auth });

  const list = await gmail.users.messages.list({ userId: 'me', labelIds: ['INBOX'], maxResults: 15 });
  const ids = list.data.messages || [];

  const messages = await Promise.all(
    ids.map((m) =>
      gmail.users.messages.get({
        userId: 'me',
        id: m.id,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject'],
      })
    )
  );

  return messages.map((res) => {
    const headers = res.data.payload?.headers;
    const isUnread = res.data.labelIds?.includes('UNREAD');
    return {
      id: res.data.id,
      source: 'gmail',
      from: fromDisplayName(decodeHeader(headers, 'From')),
      subject: decodeHeader(headers, 'Subject') || '(no subject)',
      tag: isUnread ? 'unread' : null,
      tagLabel: isUnread ? 'Unread' : null,
      blurb: res.data.snippet || '',
      suggestedReply: null,
      receivedAt: new Date(Number(res.data.internalDate)).toISOString(),
    };
  });
}

function todayRangeISO() {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  // Calendar API wants an actual UTC offset, not just a bare local time -
  // express both bounds relative to the named timeZone param instead.
  return { timeMin: `${day}T00:00:00`, timeMax: `${day}T23:59:59` };
}

function formatEventTime(dateTimeString) {
  if (!dateTimeString) return 'All day';
  const d = new Date(dateTimeString);
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(d);
}

export async function getGoogleCalendarEvents() {
  if (!(await isConnected())) return null;
  const auth = await getAuthedClient();
  const calendar = google.calendar({ version: 'v3', auth });
  const { timeMin, timeMax } = todayRangeISO();

  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin,
    timeMax,
    timeZone: TZ,
    singleEvents: true,
    orderBy: 'startTime',
  });

  return (res.data.items || []).map((e) => ({
    id: e.id,
    source: 'google',
    time: formatEventTime(e.start?.dateTime),
    title: e.summary || '(no title)',
    prep: e.description ? [e.description] : [],
    location: e.location || null,
  }));
}
