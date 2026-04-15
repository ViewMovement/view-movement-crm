// Existing-client roster transcribed from the Monthly_Client_Churn_Data - MRR PDF (Apr 2026).
// Status mapping: A.Healthy->green, B.Watch->yellow, C.AtRisk->red, D.Lost->churned, F.Onboarding->green (with flag).
// All imported clients start with a pending "New Loom Video" action (loom timer overdue).

export const STATUS_MAP = {
  'A': 'green',
  'B': 'yellow',
  'C': 'red',
  'D': 'churned',
  'F': 'green' // onboarding_flag=true
};

export const EXISTING_CLIENTS = [
  { name: 'America First Legal',    stripe: 'Active',       mrr: 3300, billing_date: 14, tier: 'A', reason: null, notes: 'Everything seems to be moving smoothly ever since we changed the Posting Manager to Johnny', action: null },
  { name: 'Andrew Fox',             stripe: 'Cancelled',    mrr: 3300, billing_date: 1,  tier: 'D', reason: 'Unknown', notes: 'Filled out the cancellation form - I promised to get him some strategy for our last month together', action: 'Film strategy loom for him', save_plan: 'In Progress' },
  { name: 'Ariana Hakman',          stripe: 'Active',       mrr: 3300, billing_date: 14, tier: 'A', reason: 'Unknown', notes: "Just realized they were asking for some content ideas - I totally misread their message from a week ago. Also they said they just filmed another podcast that they're gonna send to us", action: 'Get some content scripts for them' },
  { name: 'Aumatma Simmons',        stripe: 'Active',       mrr: 3300, billing_date: 1,  tier: 'F', notes: 'Just onboarded her - team is getting started on her content', action: 'Make sure the team is clear on which content to start. Also make sure Jessica is fully onboarded onto the accounts' },
  { name: 'Bob Bordon',             stripe: 'Active',       mrr: 3000, billing_date: 1,  tier: 'F', reason: 'Unknown', notes: 'Just onboarded - everything seems smooth right now' },
  { name: 'Breathe MD',             stripe: 'Active',       mrr: 3800, billing_date: 1,  tier: 'A', reason: 'Unknown', notes: 'Client is engaged and active. Pipeline is running.' },
  { name: 'Craig Buck',             stripe: 'Not Setup Yet', mrr: 4833, billing_date: 14, tier: 'F' },
  { name: 'Craig Buhler',           stripe: '???',          mrr: 2400, billing_date: 14, tier: 'A', reason: 'Unknown', notes: "Haven't seen any batches come into the client chat lately", action: 'Check in with the team make sure everything is running smoothly' },
  { name: 'David Bloxham',          stripe: 'PIF',          mrr: 3300, billing_date: 1,  tier: 'D', horizon: '0-30 days', notes: "He filled out the cancellation form and I took him off subscription but he seems to be engaged still - I never put him back on subscription - he's on vacation and I need him to confirm that we can bill him again", action: 'Confirm that we can continue to bill him once he gets back from vacation', save_plan: 'Saved' },
  { name: 'David Rosenblum',        stripe: 'Cancelled',    mrr: 3300, billing_date: 14, tier: 'D', horizon: '0-30 days', reason: 'Content supply issue (they don\u2019t record, inconsistent input)', notes: 'Not worth saving. His content is TERRIBLE.' },
  { name: 'David Starkey',          stripe: 'Active',       mrr: 3300, billing_date: 14, tier: 'A', reason: 'Unknown', notes: "We just switched to Jessica as the posting manager - she hasn't fully logged into all of his accounts yet, and we're behind posting because of this", action: 'Make sure that Jessica is fully logged into all of his accounts' },
  { name: 'Elliot Overton',         stripe: 'Active',       mrr: 6000, billing_date: 1,  tier: 'F', notes: 'Just onboarded, sent our first few batches', action: 'Get some feedback on the latest batches' },
  { name: 'Emily Splichal',         stripe: 'Active',       mrr: 2300, billing_date: 14, tier: 'F', reason: 'Unknown', notes: 'Just onboarded, sent our first few batches', action: 'Get some feedback on the latest batches' },
  { name: 'Gary Taubes',            stripe: 'Active',       mrr: 3300, billing_date: 14, tier: 'C', horizon: '0-30 days', reason: 'Content supply issue (they don\u2019t record, inconsistent input)', notes: "Gary went unresponsive for 2 weeks then came back and asked us why haven't we posted - asked Johnny he said he was waiting for his feedback. Gary wants to schedule a call", action: 'Make sure Gary schedules in a call and try to save the account' },
  { name: 'ICAN',                   stripe: 'Active',       mrr: 2999, billing_date: 14, tier: 'A', reason: 'Unknown', notes: 'Slack chat is quiet - just sent in a check in message to see if they need anything' },
  { name: 'InPower',                stripe: 'Not Setup Yet', mrr: 4500, billing_date: 1,  tier: 'F' },
  { name: 'Jonathan Welton',        stripe: 'Active',       mrr: 6000, billing_date: 1,  tier: 'A', reason: 'Unknown', notes: 'Seems to be approving all - no friction' },
  { name: 'Kevin Surace',           stripe: 'Active',       mrr: 3600, billing_date: 14, tier: 'F', reason: 'Unknown', notes: 'Seems to be approving all - no friction' },
  { name: 'Kris Sargent',           stripe: 'Active',       mrr: 3300, billing_date: 1,  tier: 'C', horizon: '0-30 days', reason: 'Strategy / Positioning', notes: 'Has gone ghost again - I sent her a check-in message' },
  { name: 'Kyle Kingsbury',         stripe: 'Not Setup Yet', mrr: 3300, billing_date: 1,  tier: 'F' },
  { name: 'Legal Insurrection',     stripe: 'Active',       mrr: 3300, billing_date: 14, tier: 'B', reason: 'Unknown', notes: 'We had a call last week - they wanted me to do a deeper dive into their account', action: 'Review the latest Fathom recording for them and take action' },
  { name: 'Lucas McLawhorn',        stripe: 'Active',       mrr: 2300, billing_date: 14, tier: 'F', reason: 'Unknown', notes: 'Everything seems to be flowing smoothly here.' },
  { name: 'Madhava Setty',          stripe: 'Cancelled',    mrr: 3300, billing_date: 1,  tier: 'D', horizon: '0-30 days', reason: 'Strategy / Positioning', notes: 'We still owe him 8 reels, seeing if he has anymore content we can pull from', action: 'Follow up to see if he has anymore content', save_plan: 'Proposed' },
  { name: 'Martin Pytela',          stripe: 'Active',       mrr: 3300, billing_date: 14, tier: 'B', horizon: '31-60 days', reason: 'Results / Views', notes: 'Just had a call with him last week', action: "Review the Fathom call and take action on whatever I've promised" },
  { name: 'Maxx Nies',              stripe: 'Active',       mrr: 2300, billing_date: 1,  tier: 'F', reason: 'Unknown', notes: "Onboarded the client - they said that they're waiting on podcast clips to come in. Miscommunication with the content team and they went ahead and created reels already (without podcast clips). Client not happy - wants to get on a check in call", action: 'Make sure they book a check in call and handle it' },
  { name: 'Maya Kosoff',            stripe: 'PIF',          mrr: 2300, billing_date: null, tier: 'F' },
  { name: 'Medical Medium',         stripe: 'Active',       mrr: 7800, billing_date: 1,  tier: 'B', horizon: '61-90 days', reason: 'Strategy / Positioning', notes: 'Had a check-in call with them last week. Waiting on their approval for the checklist SOP', action: 'Review the Fathom call and take appropriate action' },
  { name: 'Prime Hall',             stripe: 'Cancelled',    mrr: 2400, billing_date: 14, tier: 'D', horizon: '0-30 days', reason: 'Content supply issue (they don\u2019t record, inconsistent input)', notes: 'Client filled out cancellation form and has not gotten us any new content for their final month. Gone complete ghost', action: "Check-in again and see if they've got any new content" },
  { name: 'Robert English',         stripe: 'Active',       mrr: 3300, billing_date: 1,  tier: 'A', reason: 'Unknown', notes: 'Everything seems to be going smooth with this client' },
  { name: 'Samantha Casselman',     stripe: 'Active',       mrr: 3600, billing_date: 14, tier: 'F', reason: 'Unknown', notes: 'Everything seems to be going smooth with this client' },
  { name: 'Sanjeev Goel',           stripe: 'Active',       mrr: 3300, billing_date: 14, tier: 'C', horizon: '0-30 days', reason: 'Results / Views', notes: 'Been going back and forth the last week trying to setup a check-in call', action: 'Follow through and make sure he books to see where we can go from here', save_plan: 'In Progress' },
  { name: 'Skeptic Society',        stripe: 'Active',       mrr: 3600, billing_date: 14, tier: 'A', reason: 'Unknown', notes: 'Seems to be going smoothly' },
  { name: 'Sridhar Krishnamurti',   stripe: 'Not Setup Yet', mrr: 3300, billing_date: 1,  tier: 'F', notes: "He's asking about when he can connect with the posting manager, we have to swap out Jessica and get the new one onboarded", action: 'Make sure we get a new posting manager on this account ASAP' },
  { name: 'Thomas Seager',          stripe: 'Active',       mrr: 3600, billing_date: 14, tier: 'F', reason: 'Unknown', notes: "Dude's being kind of a pain in the ass", action: "Make sure the backend team is encouraged and told that they're appreciated" },
  { name: 'Vatsal Thakkar',         stripe: 'Active',       mrr: 2300, billing_date: 14, tier: 'B', horizon: '31-60 days', reason: 'Results / Views', notes: "Content team was delayed because Creative Director was late. Client asking us what's going on - I asked the backend team and we're going have content coming in shortly", action: "Make sure he's happy, if not we can offer him more reels" },
  { name: 'William Parker',         stripe: 'Active',       mrr: 6000, billing_date: 1,  tier: 'F', notes: 'He needs some guidance on what to film next', action: 'Create some topics/scripts for him' },
  { name: 'William Trattler',       stripe: 'Active',       mrr: 3300, billing_date: 1,  tier: 'F', notes: "Client has gone ghost and hasn't provided any content. I've texted him and he responds but still doesn't record content. Following up via text with him again", action: 'Keep an eye out for his response via text' },
  { name: 'Suzanne Ferree',         stripe: null,           mrr: null, billing_date: null, tier: 'F', reason: 'Unknown' }
];
