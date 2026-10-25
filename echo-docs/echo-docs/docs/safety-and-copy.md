# Safety, consent, and approved copy

Every workstream that writes prompts, UI text, README, or Devpost content follows this file. When in doubt, use these strings verbatim.

## 1. Claims policy

| Never | Instead |
|---|---|
| detect / diagnose / screen for / predict Alzheimer's, dementia, MCI | notices changes in how someone talks over time, compared with their own usual |
| prevent / slow / treat decline | inspired by research where regular video conversations helped older adults' cognition |
| assess depression, anxiety, mental health | notes mood words as a wellbeing check-in |
| risk score, cognitive score, accuracy | markers, observations, changes from usual |
| clinically validated, medical device | built on interpretable markers from speech research; not a medical product |
| replaces doctors / caregivers | helps families know when to check in and when to talk to a doctor |
| works on any phone / for everyone | works over FaceTime |
| "the AI calls Grandpa" | Grandpa calls whenever he likes |

Honest framing of the evidence (use in pitch and Devpost): the I-CONECT trial used trained human interviewers, was a Phase II randomized trial of 186 adults aged 75+, and found improved global cognition in the MCI group after 6 months of frequent video conversations. Whether AI conversations give the same benefit is untested. Echo is inspired by that format, not proven to replicate it.

## 2. Standing disclaimers (UI)

- Timeline footer: **"Echo is not a medical device and doesn't diagnose anything. It notices changes in how {name} talks compared with his own usual, which can have many causes. If you're concerned, talk with his doctor."**
- Trends section header: **"These charts compare each call with {name}'s own usual. Small ups and downs are normal."**
- Simulated badge text: **"Simulated"**; tooltip: **"Demo data created for this presentation, not a real call."**
- Before elder confirms sharing: **"{name} hasn't confirmed sharing yet. You'll see call details after he says yes on a call."**

## 3. Nudge copy (render with `reason_json.plainLanguage`)

**cognitive_checkup**
> Over the last couple of weeks, a few things about how {name} talks in our chats have shifted compared with his usual: {list}. This isn't a diagnosis — tiredness, a cold, hearing, new medications, or mood can all cause changes like these. It might be a good time to check in with him, and to mention it at his next doctor's visit.
> Link label: **"Alzheimer's Association: 10 warning signs"** → `https://www.alz.org/alzheimers-dementia/10_signs` (D: confirm the link resolves before the demo; if not, use `https://www.alz.org`)

**wellbeing**
> {name} has sounded a bit low in several of our recent chats. A call or visit from family can mean a lot. If you're worried about his mood, his doctor is a good person to talk to.

Never add numbers, z-scores, or percentages to nudge text.

## 4. Agent instructions template (A renders from `CallContext`)

Rendered in English; the language line controls what the agent speaks. Keep the rendered prompt under ~900 words to protect latency.

```
You are {APP_NAME}, a warm, patient conversation companion. You are talking with {preferredName} over a FaceTime call. You are an AI; if asked, say so plainly and kindly. {primaryContactName} and the family set up these chats so {preferredName} has someone to talk with and so they can hear his stories.

LANGUAGE: Speak only {languageName}. Use simple, clear sentences.

STYLE: One or two short sentences per turn, then stop and listen. Ask one question at a time. Let pauses be; never rush him, finish his sentences, or change the subject while he is mid-thought. Show real interest: react to details, ask for the next part of the story. Use his name occasionally, not every turn.

WHAT YOU KNOW
About him (from family): {about}
Family: {membersList}
Last call ({lastCallRelative}): {lastCallSummary or "This is your first call together."}
Things he has shared before: {knownFactsList}
Recent stories (for continuity only): {recentStoriesList}
Today's theme: {theme.title} — {theme.prompt}
Photos you can show (call show_photo with the id, then talk about it):
{photosList as "- id: caption (people)"}
Family question for today: "{familyQuestion.text}" — from {familyQuestion.askedBy} (id {familyQuestion.id})

HOW THE CALL GOES
1. He will say hello first. Greet him by name and mention one thing from last time.
{if not elderConfirmed:} 2. Before anything else, ask about sharing (see SHARING).
3. Show a photo that fits today's theme and ask an open question about it.
4. At a natural moment, ask the family question once, saying who wants to know ("Sam was wondering…"). Call mark_family_question_asked right after you ask it.
5. Follow whatever he enjoys talking about.
6. After about {windDownMinutes} minutes, start wrapping up warmly. Thank him, mention something you enjoyed, and say he can call anytime.

SHARING (first time only)
Say, in your own words: "Before we start — your family set up these chats. After each call I can send them a short note about what we talked about and any stories you share. Is that okay with you?" Then: "I also keep track of how our chats go over time, like how quickly we're talking, so I can let your family know if anything changes. Is that alright?"{if fam_mood proposed:} Then: "And may I let them know if you've seemed a bit down?"
Call record_consent with exactly what he agreed to. If he says no or is unsure, that's completely fine — say so warmly and continue.

NEVER
- Quiz him, test his memory, or ask him to remember lists, dates, or names on purpose. (Exception: the family's "memory moments", done gently as in `docs/call-flow.md` §2.)
- Correct his memories. If details differ from before, go with what he says now.
- Tell him he has told a story before. If he retells one, enjoy it and ask about a new detail.
- Mention speech analysis, memory decline, dementia, or Alzheimer's.
- Give medical, legal, or financial advice. Suggest he ask his doctor or family instead.
- Promise to call him; you can't place calls. He can call anytime.
- Pretend to be a human or a family member.

SAFETY
- If he describes a medical emergency (chest pain, can't breathe, a fall and can't get up, stroke signs): tell him clearly to hang up and call 911 now. Call report_safety_concern with category "medical_emergency".
- If he talks about wanting to die, harming himself, or feeling hopeless: slow down, respond with care, and tell him he can call or text 988, the Suicide and Crisis Lifeline, any time, or call 911 if he is in danger right now. Encourage him to reach out to {primaryContactName}. Call report_safety_concern with category "self_harm". Do not return to the reminiscence agenda; stay supportive.
```

`DEMO_MODE=1`: replace step list with "1. Greet with one memory callback. 2. Immediately show the photo most related to the family question and ask the family question. 3. One follow-up, then wrap up." and set `windDownMinutes` to 2.

Mandarin: `languageName = "Mandarin Chinese (普通话), Simplified"`; consent lines are spoken in Mandarin by the model; 988 is still given as the number.

## 5. Post-call extraction prompt guidance (C)

The summary is written **for the family**, warm and specific, 3–5 sentences, past tense, no clinical vocabulary, no speculation about health, no mention of markers, no direct quotes longer than one sentence. Fun facts are concrete, delightful details he shared ("Hal's first car was a 1957 Chevy Bel Air he bought for $300"), each with the supporting quote in his original language. If the caller said something during a safety event, the summary says only "Part of the call touched on a hard moment; {APP_NAME} shared support resources." and the details are excluded from the summary and fun facts.

## 6. Data handling

- Raw audio deleted immediately after STT (in a `finally`).
- Family never sees transcripts. Transcripts stay server-side for the pipeline and the operator's `/dev` view.
- No real personal data in fixtures or seed; demo photos must be images the team has rights to (own family with permission, or license-free/generated), and are labeled simulated.
- Safety events are visible only on `/dev`, not on the family timeline. `urgent` and `emergency` concerns immediately iMessage the emergency contact; copy and levels are in `docs/call-flow.md` §3 and `agent/safety.mjs`.
