import type { AppLanguage } from './auraStrings';

export type UiStrings = {
  tabs: {
    home: string;
    map: string;
    aura: string;
    learn: string;
    wallet: string;
  };
  home: {
    morning: string;
    afternoon: string;
    evening: string;
    welcome: string;
    quickActions: string;
    whichCard: string;
    bestCardNearby: string;
    findNextCard: string;
    tripPlanner: string;
    addCard: string;
    billCheck: string;
    browseCards: string;
    estimatedValue: string;
    sampleCards: string;
    seeHow: string;
  };
  wallet: {
    title: string;
    pointsWorth: string;
    emptyTitle: string;
    emptySubtitle: string;
    addFirstCard: string;
    findCardLink: string;
    rewardBalances: string;
    redeem: string;
    swipeHint: string;
    valueExplain: string;
  };
  common: {
    back: string;
    save: string;
    edit: string;
    settings: string;
  };
};

export const UI_STRINGS: Record<AppLanguage, UiStrings> = {
  en: {
    tabs: {
      home: 'Home',
      map: 'Best Card',
      aura: 'Aura',
      learn: 'Learn',
      wallet: 'Wallet',
    },
    home: {
      morning: 'Good morning',
      afternoon: 'Good afternoon',
      evening: 'Good evening',
      welcome: 'Welcome to WalletWise',
      quickActions: 'Quick actions',
      whichCard: 'Which card should I use?',
      bestCardNearby: 'Best Card Nearby',
      findNextCard: 'Find Next Card',
      tripPlanner: 'Trip Planner',
      addCard: 'Add a Card',
      billCheck: 'Bill Check',
      browseCards: 'Browse Cards',
      estimatedValue: 'ESTIMATED REWARD VALUE',
      sampleCards: 'Sample cards',
      seeHow: 'See how →',
    },
    wallet: {
      title: 'My Cards',
      pointsWorth: 'Points worth:',
      emptyTitle: 'Your Wallet is Empty',
      emptySubtitle: 'Add the credit cards you currently hold to unlock personalized rewards calculations, statement due alerts, and swipe recommendations.',
      addFirstCard: '+ Add Your First Card',
      findCardLink: "Don't have a card yet? Find your best card →",
      rewardBalances: 'Your reward balances',
      redeem: 'Redeem →',
      swipeHint: 'Swipe down to browse all cards. Swipe up to stack cards. Tap a card to open details.',
      valueExplain: 'Estimated INR equivalent per card account. Reward points are card-specific and cannot be pooled or transferred across cards.',
    },
    common: {
      back: '← Back',
      save: 'Save',
      edit: 'Edit',
      settings: 'Settings',
    },
  },
  hi: {
    tabs: {
      home: 'होम',
      map: 'बेस्ट कार्ड',
      aura: 'ऑरा',
      learn: 'सीखें',
      wallet: 'वॉलेट',
    },
    home: {
      morning: 'शुभ प्रभात',
      afternoon: 'शुभ दोपहर',
      evening: 'शुभ संध्या',
      welcome: 'WalletWise में आपका स्वागत है',
      quickActions: 'त्वरित कार्य',
      whichCard: 'मुझे कौन सा कार्ड इस्तेमाल करना चाहिए?',
      bestCardNearby: 'आस-पास सबसे अच्छा कार्ड',
      findNextCard: 'अगला कार्ड खोजें',
      tripPlanner: 'यात्रा योजनाकार',
      addCard: 'कार्ड जोड़ें',
      billCheck: 'बिल चेक',
      browseCards: 'कार्ड देखें',
      estimatedValue: 'अनुमानित रिवॉर्ड मूल्य',
      sampleCards: 'नमूना कार्ड्स',
      seeHow: 'देखें कैसे →',
    },
    wallet: {
      title: 'मेरे कार्ड्स',
      pointsWorth: 'पॉइंट्स की कीमत:',
      emptyTitle: 'आपका वॉलेट खाली है',
      emptySubtitle: 'व्यक्तिगत रिवॉर्ड गणना, स्टेटमेंट देय अलर्ट और स्वाइप सुझाव अनलॉक करने के लिए अपने क्रेडिट कार्ड जोड़ें।',
      addFirstCard: '+ अपना पहला कार्ड जोड़ें',
      findCardLink: 'अभी कार्ड नहीं है? अपने लिए सर्वश्रेष्ठ कार्ड खोजें →',
      rewardBalances: 'आपके रिवॉर्ड बैलेंस',
      redeem: 'रिडीम करें →',
      swipeHint: 'सभी कार्ड देखने के लिए नीचे स्वाइप करें। कार्ड समेटने के लिए ऊपर स्वाइप करें। विवरण देखने के लिए कार्ड पर टैप करें।',
      valueExplain: 'प्रत्येक कार्ड खाते का अनुमानित रुपये में मूल्य। रिवॉर्ड पॉइंट्स कार्ड-विशिष्ट होते हैं और इन्हें कार्डों के बीच जोड़ा या ट्रांसफर नहीं किया जा सकता है।',
    },
    common: {
      back: '← वापस',
      save: 'सहेजें',
      edit: 'संपादित करें',
      settings: 'सेटिंग्स',
    },
  },
};
