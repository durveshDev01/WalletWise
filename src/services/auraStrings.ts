/**
 * UI text for the Aura screen and Settings in English and Hindi. Only these two
 * screens are translated for now; full-app translation comes later.
 * Hindi wording should be reviewed by a native speaker.
 */
import type { AuraErrorKind } from './auraApi';

export type AppLanguage = 'en' | 'hi';

type AuraStrings = {
  caption: string;
  welcome: string;
  placeholder: string;
  suggestions: string[];
  tryAgain: string;
  askOnline: string;
  offlineLabel: string;
  typing: string;
  send: string;
  messageLabel: string;
  askPrefix: string;
  languageToggle: string;
  simpleOn: string;
  errors: Record<AuraErrorKind, string>;
  /** Server status lines (server/src/agent/agent.ts TOOL_STATUS) shown while a tool runs. */
  statuses: Record<string, string>;
};

export const AURA_STRINGS: Record<AppLanguage, AuraStrings> = {
  en: {
    caption: 'Your credit card assistant',
    welcome:
      "Hi, I'm Aura. Ask me which of your cards to use, what your points are worth, about any Indian credit card, or how credit cards work.",
    placeholder: 'Ask Aura anything about cards…',
    suggestions: ['Which card for ₹1,500 at Swiggy?', 'Tell me about Diners Black International', 'Any changes to my cards?', 'How should I use my points?', 'What cards do I have?'],
    tryAgain: 'Try again ↻',
    askOnline: 'Ask Aura online ↻',
    offlineLabel: 'OFFLINE ANSWER',
    typing: 'Aura is typing',
    send: 'Send message',
    messageLabel: 'Message to Aura',
    askPrefix: 'Ask',
    languageToggle: 'Switch Aura to Hindi',
    simpleOn: 'Simple answers on',
    errors: {
      offline: "Can't reach Aura. Check your internet connection and try again.",
      timeout: 'Aura took too long to answer. Please try again.',
      busy: 'Aura is busy, please try again in a moment.',
      setup: 'Aura is not set up yet. Please try again later.',
      failed: 'Something went wrong. Please try again.',
    },
    statuses: {},
  },
  hi: {
    caption: 'आपका क्रेडिट कार्ड सहायक',
    welcome:
      'नमस्ते, मैं Aura हूँ। मुझसे पूछिए कि किस खर्च पर कौन सा कार्ड इस्तेमाल करें, आपके पॉइंट्स की कीमत क्या है, किसी भी भारतीय क्रेडिट कार्ड के बारे में, या क्रेडिट कार्ड कैसे काम करते हैं।',
    placeholder: 'कार्ड के बारे में Aura से कुछ भी पूछें…',
    suggestions: ['Swiggy पर ₹1,500 के लिए कौन सा कार्ड?', 'Diners Black International के बारे में बताइए', 'मेरे कार्ड्स में कोई बदलाव?', 'अपने पॉइंट्स कैसे इस्तेमाल करूँ?', 'मेरे पास कौन से कार्ड हैं?'],
    tryAgain: 'फिर कोशिश करें ↻',
    askOnline: 'Aura से ऑनलाइन पूछें ↻',
    offlineLabel: 'ऑफ़लाइन जवाब',
    typing: 'Aura लिख रहा है',
    send: 'संदेश भेजें',
    messageLabel: 'Aura के लिए संदेश',
    askPrefix: 'पूछें',
    languageToggle: 'Aura को अंग्रेज़ी में करें',
    simpleOn: 'आसान जवाब चालू',
    errors: {
      offline: 'Aura से नहीं जुड़ पा रहे। इंटरनेट जाँचें और फिर कोशिश करें।',
      timeout: 'Aura को जवाब देने में बहुत देर लगी। फिर कोशिश करें।',
      busy: 'Aura अभी व्यस्त है, थोड़ी देर में फिर कोशिश करें।',
      setup: 'Aura अभी तैयार नहीं है। बाद में कोशिश करें।',
      failed: 'कुछ गड़बड़ हो गई। फिर कोशिश करें।',
    },
    statuses: {
      'Checking your wallet…': 'आपका वॉलेट देख रहे हैं…',
      'Comparing your cards…': 'आपके कार्ड्स की तुलना कर रहे हैं…',
      'Valuing your points…': 'पॉइंट्स की कीमत निकाल रहे हैं…',
      'Checking card updates…': 'कार्ड के बदलाव देख रहे हैं…',
      'Planning your trip…': 'यात्रा की योजना बना रहे हैं…',
      'Looking up card details…': 'कार्ड की जानकारी देख रहे हैं…',
    },
  },
};

type SettingsStrings = {
  title: string;
  back: string;
  auraSection: string;
  language: string;
  languageHint: string;
  simple: string;
  simpleHint: string;
  phoneSection: string;
  lite: string;
  liteHint: string;
  liteRecommended: (gb: string) => string;
  profileSection: string;
  profile: string;
  profileHint: string;
  privacySection: string;
  privacy: string;
};

export const SETTINGS_STRINGS: Record<AppLanguage, SettingsStrings> = {
  en: {
    title: 'Settings',
    back: '← Back',
    auraSection: 'AURA',
    language: 'Aura language',
    languageHint: 'Aura replies in this language. Card and bank names stay in English.',
    simple: 'Simple answers',
    simpleHint: 'One number and one thing to do, in short sentences.',
    phoneSection: 'THIS PHONE',
    lite: 'Lite mode',
    liteHint: 'For slower phones and patchy data: no intro video, no blur, fewer animations, video thumbnails not loaded, and Best Card opens as a list.',
    liteRecommended: (gb) => `Recommended: this phone has about ${gb} GB of memory.`,
    profileSection: 'SPENDING',
    profile: 'Spending profile',
    profileHint: 'Your monthly spends, used by Find My Card and Aura.',
    privacySection: 'YOUR DATA',
    privacy:
      'Your cards, points, spends and goals stay on this phone unless you choose to create an encrypted cloud backup. When you ask Aura, your question goes to the WalletWise server with your card list, points and spending profile (never card numbers or your name), and the answer is written by the Groq AI service. Map search sends the place you type to Mapbox.',
  },
  hi: {
    title: 'सेटिंग्स',
    back: '← वापस',
    auraSection: 'AURA',
    language: 'Aura की भाषा',
    languageHint: 'Aura इसी भाषा में जवाब देगा। कार्ड और बैंक के नाम अंग्रेज़ी में रहेंगे।',
    simple: 'आसान जवाब',
    simpleHint: 'एक रकम और करने वाला एक काम, छोटे वाक्यों में।',
    phoneSection: 'यह फ़ोन',
    lite: 'लाइट मोड',
    liteHint: 'धीमे फ़ोन और कमज़ोर इंटरनेट के लिए: इंट्रो वीडियो नहीं, ब्लर नहीं, कम एनिमेशन, वीडियो की तस्वीरें लोड नहीं होंगी, और Best Card सूची के रूप में खुलेगा।',
    liteRecommended: (gb) => `सुझाव: इस फ़ोन में लगभग ${gb} GB मेमोरी है।`,
    profileSection: 'खर्च',
    profile: 'खर्च की जानकारी',
    profileHint: 'आपके महीने के खर्च, जो Find My Card और Aura इस्तेमाल करते हैं।',
    privacySection: 'आपका डेटा',
    privacy:
      'आपके कार्ड, पॉइंट्स, खर्च और लक्ष्य इसी फ़ोन पर रहते हैं। कोई अकाउंट नहीं है। Aura से पूछने पर आपका सवाल, आपके कार्ड की सूची, पॉइंट्स और खर्च की जानकारी के साथ WalletWise सर्वर पर जाता है (कार्ड नंबर या आपका नाम कभी नहीं), और जवाब Groq AI सेवा लिखती है। मैप पर खोजी गई जगह Mapbox को भेजी जाती है।',
  },
};
