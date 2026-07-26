/**
 * RED-FLAG DETECTION — the gate that runs BEFORE knowledge-base retrieval.
 *
 * WHY THIS EXISTS
 * ---------------
 * The retrieval index is a topical matcher: it has no concept of "this person is reporting
 * symptoms". Left to itself it answers "my knee hurts when I squat" with the curated entry about
 * knees travelling past the toes ("this is an old myth… progress load gradually") — confident,
 * well-written, and exactly the wrong thing to say to someone in pain. A static disclaimer in the
 * header does not fix that: by the time it is read, the app has already given the advice.
 *
 * So pain / injury / medical language is classified FIRST, and a classified query never gets a
 * curated entry (or a freeform model answer) as its primary response. It gets a purpose-built
 * safety card. Curated entries may follow, clearly separated and labelled as general information.
 *
 * DESIGN CONSTRAINTS
 * ------------------
 *  · Pure and data-free — no `faq.json`, no React, no browser APIs. Runs in the node harness and
 *    in the browser through the identical code path, and can be reasoned about in isolation.
 *  · Conservative in one direction ONLY. A false positive costs the user one extra tap to read a
 *    curated entry; a false negative tells someone with chest pain to "progress load gradually".
 *  · "sore" alone is NOT a red flag. Normal soreness is the single most common fitness question in
 *    the corpus ("why am I so sore", "can I train while sore") and hijacking it with a medical
 *    card would be its own defect. `sore` only escalates when a genuine pain marker rides along.
 */

/** Escalation tier. Ordered: `urgent` outranks `injury` outranks `medical-general`. */
export type SafetyLevel = 'urgent' | 'injury' | 'medical-general';

export interface SafetyFlag {
  level: SafetyLevel;
  /** Named detectors that fired — surfaced in the harness and asserted by tests. */
  signals: string[];
  /** The literal phrases that matched, for explainability. */
  matches: string[];
}

/** Copy for the safety card. Lives here (not in the component) so it is testable in node. */
export interface SafetyCopy {
  headline: string;
  lead: string;
  steps: string[];
  footnote: string;
  /** Heading for the clearly-separated, secondary curated entries. */
  secondaryLabel: string;
  secondaryNote: string;
}

interface Detector {
  name: string;
  level: SafetyLevel;
  re: RegExp;
}

/**
 * Normalize before matching: lowercase, drop apostrophes so `can't` → `cant`, and reduce every
 * other non-alphanumeric run to a single space so punctuation can never hide a phrase
 * ("chest-pain", "numbness/tingling", "I have chest pain!!").
 */
export function normalizeForSafety(query: string): string {
  return ` ${query
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `;
}

/* ------------------------------------------------------------------ urgent (seek care now) */

const URGENT: Detector[] = [
  {
    name: 'chest pain',
    level: 'urgent',
    re: /\bchest (pain|pains|pressure|tightness|tight|hurts|hurt|hurting|discomfort|heaviness)\b|\b(pain|pressure|tightness|tight|heaviness|crushing) in (my |the )?chest\b/,
  },
  {
    name: 'breathing difficulty',
    level: 'urgent',
    re: /\b(cant|cannot|couldnt|could not|hard to|struggling to|struggle to|trouble|difficulty|unable to) (breathe|breathing|catch my breath)\b|\bshort(ness)? of breath\b|\bbreathless\b|\bwheez(e|ing|y)\b|\bgasping\b|\bcant catch my breath\b/,
  },
  {
    name: 'fainting or dizziness',
    level: 'urgent',
    re: /\b(dizzy|dizziness|light headed|lightheaded|faint|fainted|fainting|black(ed)? out|blackout|pass(ed|ing)? out|vertigo|nearly collapsed|collapsed)\b/,
  },
  {
    name: 'numbness or tingling',
    level: 'urgent',
    re: /\b(numb|numbness|tingling|pins and needles|no feeling in|loss of feeling|lost feeling|goes dead)\b/,
  },
  {
    name: 'shooting or radiating pain',
    level: 'urgent',
    re: /\b(shooting|radiating|electric|searing|stabbing) (pain|sensation)\b|\bpain (shooting|radiating|running|travelling|traveling) (down|into|up)\b/,
  },
  {
    name: 'cardiac or neurological symptoms',
    level: 'urgent',
    re: /\b(heart racing|racing heart|palpitations|irregular heartbeat|skipped beats|heart attack|stroke|chest tight|blurred vision|slurred speech|sudden weakness)\b/,
  },
];

/* ------------------------------------------------------------------------- injury / in pain */

/** Pain markers that let an otherwise-normal "sore" question escalate to `injury`. */
const SORE_ESCALATORS =
  /\b(sharp|swollen|swelling|numb|numbness|tingling|weeks|months|wont go away|not going away|never goes away|getting worse|worse|pain|painful|hurts|hurt|hurting|cant move|cant straighten|cant walk|cant lift|unable to|one side|only one|clicking|popping|giving way)\b/;

const INJURY: Detector[] = [
  {
    name: 'reported pain',
    level: 'injury',
    re: /\b(pain|painful|hurt|hurts|hurting|aching|achy|throbbing|twinge|twinges|stinging|burning sensation)\b/,
  },
  {
    name: 'colloquial pain report',
    level: 'injury',
    // How people actually describe it when they are not using the word "pain".
    re: /\b(killing me|kills me|agony|in bits|cant walk|cant move|cant straighten|cant bend|cant lift my|wont bend|locked up|seized up|gave way|giving way|gives way|jammed up|feels wrong|something feels off|really bad after)\b/,
  },
  {
    name: 'sharp or severe pain',
    level: 'injury',
    re: /\b(sharp|stabbing|severe|excruciating|intense|sudden|shooting) (pain|twinge|ache|discomfort)\b/,
  },
  {
    name: 'swelling or bruising',
    level: 'injury',
    re: /\b(swollen|swelling|inflamed|inflammation|bruised|bruising|black and blue|puffy joint)\b/,
  },
  {
    name: 'acute injury event',
    level: 'injury',
    re: /\b(tore|torn|ruptured|rupture|snapped|popped|heard a pop|felt a pop|strain|strained|sprain|sprained|dislocated|subluxed|jammed|tweaked|pulled (a|my) (muscle|hamstring|groin|quad|calf|back|lat|pec|shoulder))\b|\b(muscle|hamstring|calf|groin|pec|bicep) tear\b/,
  },
  {
    name: 'stated injury',
    level: 'injury',
    re: /\b(injury|injuries|injured|got hurt|hurt my|banged up|messed up my|did something to my)\b/,
  },
  {
    name: 'named diagnosis',
    level: 'injury',
    re: /\b(rotator cuff|herniated|herniation|slipped disc|bulging disc|disc (injury|problem|issue)|tendonitis|tendinitis|tendinopathy|sciatica|sciatic|fracture|fractured|stress fracture|broken (bone|wrist|arm|leg|rib|foot|ankle)|acl|mcl|pcl|meniscus|labrum|labral|bursitis|plantar fasciitis|tennis elbow|golfers elbow|impingement|frozen shoulder|shin splints|carpal tunnel|hernia|whiplash|concussion)\b/,
  },
  {
    name: 'soreness with pain markers',
    level: 'injury',
    // Only fires when "sore" arrives WITH a pain marker — plain soreness stays a normal question.
    re: /\bsore(ness)?\b/,
  },
];

/* --------------------------------------------------------- medical-general (conditions etc.) */

const MEDICAL: Detector[] = [
  {
    name: 'pregnancy or postpartum',
    level: 'medical-general',
    re: /\b(pregnant|pregnancy|expecting a baby|postpartum|post partum|trimester|breastfeeding|c section|caesarean|cesarean|diastasis)\b/,
  },
  {
    name: 'medication',
    level: 'medical-general',
    re: /\b(medication|medications|meds|prescription|prescribed|blood thinner|blood thinners|beta blocker|beta blockers|statin|statins|insulin|antidepressant|antidepressants|painkiller|painkillers|ibuprofen|naproxen|cortisone|steroid|steroids|trt|hrt)\b/,
  },
  {
    name: 'medical condition',
    level: 'medical-general',
    re: /\b(diabetes|diabetic|hypertension|high blood pressure|low blood pressure|heart condition|heart disease|cardiac|asthma|epilepsy|seizure|seizures|cancer|chemo|chemotherapy|thyroid|arthritis|osteoporosis|osteopenia|scoliosis|lupus|fibromyalgia|copd|kidney disease|liver disease|pcos|endometriosis|eating disorder|anorexia|bulimia|autoimmune|chronic (pain|illness|condition|fatigue))\b/,
  },
  {
    name: 'medical care in progress',
    level: 'medical-general',
    re: /\b(surgery|operation|post op|post surgery|rehab|rehabilitation|physical therapy|physio|physiotherapist|my (doctor|physio|surgeon|therapist|midwife)|doctor said|doctor told me|cleared (by|to) (my )?(doctor|train|lift))\b/,
  },
];

const ALL: Detector[] = [...URGENT, ...INJURY, ...MEDICAL];

/** Every detector, exported so the harness/tests can enumerate coverage. */
export const SAFETY_DETECTORS: readonly { name: string; level: SafetyLevel }[] = ALL.map((d) => ({
  name: d.name,
  level: d.level,
}));

/**
 * The two phrasings that talk ABOUT injury without reporting one. Narrow on purpose — each is
 * anchored to its own object so it cannot swallow a real symptom report:
 *
 *   "does stretching prevent injury"          → education, not a red flag
 *   "difference between pain and soreness"    → education, not a red flag
 *   "what should I avoid with a shoulder injury" → still a red flag (the verb governs "with", not
 *                                                  "injury"), which is exactly right.
 */
const EDUCATIONAL: { name: string; re: RegExp }[] = [
  {
    name: 'injury prevention question',
    re: /\b(prevent|preventing|prevention|avoid|avoiding|reduce|reducing|lower|minimi[sz]e|stop) (an |the |my |getting )?(injury|injuries|injured|hurt)\b|\binjury (prevention|risk|proof)\b/,
  },
  {
    name: 'definitional question',
    re: /\bdifference between\b/,
  },
];

function firstMatch(text: string, re: RegExp): string | null {
  const m = re.exec(text);
  return m ? m[0].trim() : null;
}

/**
 * Classify a free-text question. Returns `null` for ordinary fitness questions — the overwhelming
 * majority — so the normal retrieval path is untouched.
 */
export function classifyQuery(query: string): SafetyFlag | null {
  const text = normalizeForSafety(query);
  if (!text.trim()) return null;

  const fired: { name: string; level: SafetyLevel; match: string }[] = [];

  for (const d of ALL) {
    // `sore` is the one detector that needs a second witness (see SORE_ESCALATORS).
    if (d.name === 'soreness with pain markers' && !SORE_ESCALATORS.test(text)) continue;
    const hit = firstMatch(text, d.re);
    if (!hit) continue;
    fired.push({ name: d.name, level: d.level, match: hit });
  }

  // Educational phrasing ("does stretching prevent injury", "difference between pain and
  // soreness") drops the SOFT injury signals only. A named diagnosis, an acute event, swelling or
  // a colloquial report is a description of something that already happened, and no phrasing
  // exemption may cancel it.
  const kept = EDUCATIONAL.some((e) => e.re.test(text))
    ? fired.filter((f) => !SOFT_INJURY_SIGNALS.has(f.name))
    : fired;

  if (kept.length === 0) return null;

  const level = kept.reduce<SafetyLevel>(
    (acc, f) => (rank(f.level) < rank(acc) ? f.level : acc),
    kept[0]!.level,
  );
  return { level, signals: kept.map((f) => f.name), matches: kept.map((f) => f.match) };
}

/** Injury signals that a purely educational phrasing is allowed to cancel. */
const SOFT_INJURY_SIGNALS = new Set([
  'reported pain',
  'sharp or severe pain',
  'stated injury',
  'soreness with pain markers',
]);

function rank(level: SafetyLevel): number {
  return level === 'urgent' ? 0 : level === 'injury' ? 1 : 2;
}

/* --------------------------------------------------------------------------------- the copy */

const COPY: Record<SafetyLevel, SafetyCopy> = {
  urgent: {
    headline: 'Stop and get medical help',
    lead: 'What you describe can be a warning sign that needs medical attention rather than a training tweak. FitForge cannot assess it, and nothing here should delay care.',
    steps: [
      'Stop exercising now and sit down somewhere safe.',
      'Chest pain or pressure, trouble breathing, fainting, or sudden numbness or weakness: call your local emergency number (911 / 112 / 999) straight away. Do not drive yourself.',
      'If the symptom has already passed, still speak to a doctor before your next session — a symptom that stops is not a symptom explained.',
      'Do not train around it or push through until a professional has cleared you.',
    ],
    footnote:
      'FitForge is a training guide, not a medical service. It cannot diagnose you and will not try.',
    secondaryLabel: 'General information from the guide',
    secondaryNote:
      'These are general fitness entries, not an answer about your symptoms. Read them after you have spoken to someone qualified.',
  },
  injury: {
    headline: 'That sounds like pain — not a programming question',
    lead: 'I cannot diagnose an injury or tell you how much to load it, and guessing turns small problems into long ones. Here is the general, safe guidance instead.',
    steps: [
      'Stop the movement that provokes it. Sharp, pinching, or joint-line pain is a stop signal, not something to train through.',
      'Ordinary muscle soreness is dull, spread across the muscle, and eases within 24–72 hours. Pain that is sharp, one-sided, swollen, or lingering is not soreness.',
      'You can usually keep training other body parts and pain-free ranges — complete rest is rarely the answer either.',
      'See a doctor or physiotherapist if it is severe, swelling, giving way, numb, or has not settled in a few days. Tell them exactly which movement provokes it.',
    ],
    footnote:
      'Only a qualified clinician who can actually examine you can say whether to keep lifting, and how much.',
    secondaryLabel: 'General information from the guide',
    secondaryNote:
      'Background reading only — none of this is an answer about your pain or a clearance to train.',
  },
  'medical-general': {
    headline: 'That one belongs with a medical professional',
    lead: 'Pregnancy, medication and medical conditions change what is safe for you specifically, and FitForge has no way to know your history.',
    steps: [
      'Ask your doctor, physio or midwife before starting or changing a program — including what to avoid and which warning signs matter for you.',
      'Until then keep effort conversational, avoid holding your breath under load, and stop with any symptom that feels wrong.',
      'Anything in this guide is written for healthy adults. Where it disagrees with your clinician, your clinician is right.',
    ],
    footnote: 'General fitness guidance only — this is not medical advice and cannot replace it.',
    secondaryLabel: 'General information from the guide',
    secondaryNote:
      'General entries related to your question. They are not tailored to your condition.',
  },
};

export function safetyCopy(level: SafetyLevel): SafetyCopy {
  return COPY[level];
}

/** Short label for the badge on the card. */
export function safetyBadge(level: SafetyLevel): string {
  return level === 'urgent' ? 'Seek medical help' : 'Safety first';
}
