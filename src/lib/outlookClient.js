// Microsoft Graph (Outlook) client.
// This file is the ONLY place that should ever hold Outlook/Graph
// credentials or call Microsoft Graph. Do not import this from
// financial.js or any non-work route - keeps the tabs isolated.
// Auth itself lives in lib/msGraphAuth.js - this file just calls
// getAccessToken() and hits the Graph API.
//
// Being wired up gradually, one piece at a time: real inbox reading is
// live now; meetings/calendar/tasks are still shadow-mode sample data
// until those are connected next.

import { getAccessToken, isConnected } from './msGraphAuth.js';

const SHADOW_MODE = process.env.SHADOW_MODE === 'true';

async function graphGet(path) {
  const token = await getAccessToken();
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Graph API request failed: ${res.status} ${await res.text()}`);
  return res.json();
}

const EMAILS = [
  {
    id: 'msg-1',
    from: 'Dana Reyes',
    subject: 'Q3 budget review — need your sign-off',
    tag: 'urgent',
    tagLabel: 'Time-sensitive',
    blurb: 'Asking you to confirm the revised Q3 numbers before she sends to finance — she needs an answer by end of day.',
    suggestedReply: 'Hi Dana,\n\nThanks for sending this over — the revised numbers look right to me. Go ahead and send to finance.\n\nBest,',
  },
  {
    id: 'msg-2',
    from: 'Marcus Webb',
    subject: 'Re: vendor contract redline',
    tag: 'waiting',
    tagLabel: 'Waiting on you',
    blurb: 'Sent back the contract with two clauses redlined last Thursday — hasn\'t heard from you since.',
    suggestedReply: 'Hi Marcus,\n\nApologies for the delay — reviewed your redlines and both look reasonable to me. Let\'s move forward with the updated version.\n\nThanks,',
  },
  {
    id: 'msg-3',
    from: 'Internal Newsletter',
    subject: 'This week at Acme',
    tag: 'low',
    tagLabel: 'Low priority',
    blurb: 'Company-wide digest, no action needed.',
    suggestedReply: null,
  },
];

const MEETINGS = [
  {
    id: 'evt-1',
    time: '10:00 AM',
    title: 'Budget sync w/ Dana Reyes',
    prep: [
      'Last thread: Dana sent revised Q3 numbers, awaiting your sign-off (see inbox above).',
      'Prior meeting notes flagged marketing spend as the open question — likely comes up again.',
    ],
  },
  {
    id: 'evt-2',
    time: '1:00 PM',
    title: 'Client call — Northbridge renewal',
    prep: [
      'Renewal contract currently with legal for redlines — not expected to close on this call.',
      'Client\'s last email asked about onboarding timeline for two new seats.',
    ],
  },
  {
    id: 'evt-3',
    time: '2:00 PM',
    title: 'Internal team sync',
    prep: [
      'Overlaps with the Northbridge call running long — see calendar suggestion below.',
    ],
  },
];

const CALENDAR_SUGGESTIONS = [
  {
    id: 'sugg-1',
    eventId: 'evt-3',
    detail: '2:00 PM team sync overlaps if the 1:00 PM client call runs long. Suggest moving the sync to 2:30 PM.',
    change: 'Move 2:00 PM team sync to 2:30 PM',
  },
];

const TASKS = [
  { id: 'task-1', label: 'Send Marcus the finalized contract by Friday', done: false },
  { id: 'task-2', label: 'Confirm final budget numbers with Dana', done: false },
  { id: 'task-3', label: 'Reply to Northbridge onboarding question', done: true },
];

export async function getInboxTriage() {
  if (SHADOW_MODE) {
    return {
      shadow: true,
      meetingsToday: MEETINGS.length,
      needReply: EMAILS.filter((e) => e.tag === 'urgent' || e.tag === 'waiting').length,
      overdueFollowUps: TASKS.filter((t) => !t.done).length > 0 ? 1 : 0,
      note: 'Shadow mode - replace with a real Graph /me/messages call',
    };
  }
  // TODO: real Graph API call
  throw new Error('Live Outlook connection not yet implemented.');
}

export async function getEmails() {
  if (await isConnected()) {
    const data = await graphGet(
      '/me/mailFolders/inbox/messages?$top=15&$select=id,subject,from,bodyPreview,isRead,receivedDateTime&$orderby=receivedDateTime desc'
    );
    const emails = data.value.map((m) => ({
      id: m.id,
      from: m.from?.emailAddress?.name || m.from?.emailAddress?.address || 'Unknown sender',
      subject: m.subject || '(no subject)',
      tag: m.isRead ? null : 'unread',
      tagLabel: m.isRead ? null : 'Unread',
      blurb: m.bodyPreview || '',
      suggestedReply: null,
      receivedAt: m.receivedDateTime,
    }));
    return { shadow: false, live: true, emails };
  }
  if (SHADOW_MODE) {
    return { shadow: true, emails: EMAILS };
  }
  throw new Error('Outlook isn\'t connected yet.');
}

export async function getMeetings() {
  if (SHADOW_MODE) {
    return { shadow: true, meetings: MEETINGS };
  }
  throw new Error('Live Outlook connection not yet implemented.');
}

export async function getCalendarSuggestions() {
  if (SHADOW_MODE) {
    return { shadow: true, suggestions: CALENDAR_SUGGESTIONS };
  }
  throw new Error('Live Outlook connection not yet implemented.');
}

export async function getTasks() {
  if (SHADOW_MODE) {
    return { shadow: true, tasks: TASKS };
  }
  throw new Error('Live Outlook connection not yet implemented.');
}

export async function draftReply(messageId, draftText) {
  // Drafting never sends. This just creates/returns a draft for the
  // user to review and send themselves from their own Outlook.
  return { messageId, draftText, sent: false, shadow: SHADOW_MODE };
}

export async function suggestCalendarChange(eventId, change) {
  return { eventId, change, applied: false, shadow: SHADOW_MODE };
}

export async function applyCalendarChange(eventId, change, userConfirmed) {
  if (process.env.REQUIRE_MANUAL_CONFIRMATION !== 'false' && !userConfirmed) {
    throw new Error('Refusing to apply: user confirmation flag missing.');
  }
  if (SHADOW_MODE) {
    return { applied: false, shadow: true, wouldHaveChanged: { eventId, change } };
  }
  // TODO: real Graph API call to PATCH the calendar event
  throw new Error('Live Outlook calendar write not yet implemented.');
}
