/**
 * Worker-facing text. Add a language by copying the `en` block.
 * Telugu / Assamese / Bengali are welcome as pull requests — please have a native speaker check them.
 */
export const LANGS = { en: "English", hi: "हिंदी" } as const;
export type Lang = keyof typeof LANGS;

const en = {
  hello: "Hello",
  todayTasks: "Today's work",
  noTasks: "No work assigned yet. Pull down to refresh later.",
  target: "Target",
  worked: "Worked",
  start: "START",
  startHint: "Take a photo of the work before starting",
  end: "FINISH",
  endHint: "Take a photo of the finished work",
  pause: "Pause",
  resume: "RESUME",
  whyPause: "Why are you pausing?",
  cancel: "Cancel",
  done: "Done",
  pending: "Not started",
  running: "Working",
  paused: "Paused",
  offline: "No internet — saved on phone, will send automatically",
  syncing: "Sending…",
  otherRunning: "Pause or finish your other task first",
  photoRequired: "Photo is required",
  failed: "Could not save. Try again.",
  points: "Points this month",
  qualityOk: "Approved",
  qualityRework: "Rework",
  reasons: {
    machine: "Machine problem",
    material: "Material not available",
    power: "Power cut",
    break: "Lunch / break",
    instructed: "Owner/supervisor asked",
    other: "Other",
  },
};

const hi: typeof en = {
  hello: "नमस्ते",
  todayTasks: "आज का काम",
  noTasks: "अभी कोई काम नहीं दिया गया है। थोड़ी देर बाद देखें।",
  target: "लक्ष्य",
  worked: "काम किया",
  start: "शुरू करें",
  startHint: "शुरू करने से पहले काम की फोटो लें",
  end: "काम पूरा",
  endHint: "पूरे हुए काम की फोटो लें",
  pause: "रोकें",
  resume: "फिर शुरू करें",
  whyPause: "काम क्यों रोक रहे हैं?",
  cancel: "रद्द करें",
  done: "पूरा",
  pending: "शुरू नहीं हुआ",
  running: "काम चालू है",
  paused: "रुका हुआ",
  offline: "इंटरनेट नहीं है — फोन में सेव है, नेट आते ही भेज देंगे",
  syncing: "भेज रहे हैं…",
  otherRunning: "पहले दूसरा काम रोकें या पूरा करें",
  photoRequired: "फोटो ज़रूरी है",
  failed: "सेव नहीं हुआ। फिर से कोशिश करें।",
  points: "इस महीने के पॉइंट",
  qualityOk: "पास",
  qualityRework: "दोबारा करना है",
  reasons: {
    machine: "मशीन खराब",
    material: "माल नहीं आया",
    power: "बिजली गई",
    break: "खाना / आराम",
    instructed: "मालिक/सुपरवाइज़र ने रोका",
    other: "कुछ और",
  },
};

export const STRINGS: Record<Lang, typeof en> = { en, hi };
export type Strings = typeof en;
