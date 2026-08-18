import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { db, rtdb } from './firebase';
import { collection, doc, setDoc, deleteDoc, getDocs, getDoc, updateDoc, arrayUnion, arrayRemove, onSnapshot } from 'firebase/firestore';
import { ref, set, get, update, onValue, off, push, remove } from 'firebase/database';

// --- アプリの更新履歴 ---
const UPDATE_HISTORY = [
  {
    version: '3.3.4',
    features: [
      '🐛 なんでや！阪神関係ないやろ！'
    ]
  },
  {
    version: '3.3.3',
    features: [
      '⚙️ システムを更新しました。'
    ]
  },
  {
    version: '3.3.1',
    features: [
      '⚙️ 微調整を行いました。'
    ]
  },
  {
    version: '3.3',
    features: [
      '🎬 アプリ起動時に「大富豪」をイメージしたオープニング演出を追加しました！'
    ]
  },
  {
    version: '3.2.3',
    features: [
      '⚙️ システムを更新しました。'
    ]
  },
  {
    version: '3.2.2',
    features: [
      '⚙️ 微調整を行いました。'
    ]
  },
  {
    version: '3.2.1',
    features: [
      '🔄 新システム移行に伴い、全プレイヤーのレーティングをリセットしました。(初期レーティング: 1000 Pt)'
    ]
  },
  {
    version: '3.2',
    features: [
      '📈 ランク戦の「5試合制」と「10試合制」でレーティング・戦績を別々に管理するようにしました！',
      '⚖️ 10試合制のレーティング変動量を5試合制と同じ基準に調整しました。',
      '🏆 ランキング画面とプロフィール画面を、5試合制と10試合制でそれぞれ表示できるようにしました。'
    ]
  },
  {
    version: '3.1',
    features: [
      '⚙️ 調整を行いました。'
    ]
  },
  {
    version: '3.0.2',
    features: [
      '⏳ 待機時間を1分に変更し、時間経過時にAIが待機ルームに入室・表示されてからランク戦が開始されるように演出を追加しました。',
      '🤖 フレンドになったAIプレイヤーを直接オンライン対戦（ランク戦・ルーム戦）に招待できるようになりました！'
    ]
  },
  {
    version: '3.0.1',
    features: [
      '🤖 AIプレイヤーともフレンドになれるようになりました！(AIは申請を即座に自動承認します)'
    ]
  },
  {
    version: '3.0',
    features: [
      '🚀 ランク戦を「5試合制」と「10試合制」から選べるようにしました！',
      '📊 試合ごとの獲得ポイントを変更しました。(1位: +2, 2位: +1, 3位: -1, 4位: -2)',
      '🎨 UIアップデート！トランプのデザインを一新し、ボタンなどのテーマカラーを自由に設定できるようになりました。',
      '🤖 強化AIプレイヤーを新たに5人追加しました。(レート1900~2100)',
      '⚠️ 放置ペナルティシステムを追加しました。(5日以上ログインしないと、1日につきレートが20減少します)'
    ]
  },
  {
    version: '2.8.2',
    features: [
      '💡 フレンド一覧にもリアルタイムのオンライン状態（ライト）を表示するようにしました。'
    ]
  },
  {
    version: '2.8.1',
    features: [
      '⚡ フレンド申請がリアルタイムで届くように修正しました。',
      '🔄 フレンド画面に「最新情報に更新」ボタンを追加しました。'
    ]
  },
  {
    version: '2.8',
    features: [
      '🤝 フレンド機能を追加しました！ユーザー検索でフレンド申請ができます。',
      '💬 フレンドとのチャット機能を追加しました。(履歴は3日で自動削除されます)',
      '📩 フレンドをランク戦やルーム戦に招待できるようになりました！'
    ]
  }
];
const CURRENT_VERSION = UPDATE_HISTORY[0].version;

// --- トランプ＆大富豪ヘルパー ---
const SUITS = ['♠', '♥', '♦', '♣'];
const NUM_MAP = { 1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K' };

const getCardStrength = (num, isReversed) => {
  if (num === 0) return 14;
  let baseStrength = (num >= 3) ? num - 2 : num + 11;
  return isReversed ? 14 - baseStrength : baseStrength;
};

const createDeck = () => {
  const deck = [];
  let id = 1;
  for (let s of SUITS) {
    for (let n = 1; n <= 13; n++) {
      deck.push({ id: id++, suit: s, num: n });
    }
  }
  deck.push({ id: id++, suit: '🃏', num: 0 });
  return deck;
};

const shuffle = (array) => {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

// 階段判定ロジック
const checkSequence = (cards) => {
  if (cards.length < 3) return false;
  const nonJokers = cards.filter(c => c.num !== 0);
  if (nonJokers.length === 0) return true; 
  const suit = nonJokers[0].suit;
  if (!nonJokers.every(c => c.suit === suit)) return false;

  const strengths = nonJokers.map(c => getCardStrength(c.num, false)).sort((a,b)=>a-b);
  let jokersCount = cards.length - nonJokers.length;
  for(let i=0; i<strengths.length-1; i++) {
    const diff = strengths[i+1] - strengths[i];
    if (diff === 0) return false; 
    if (diff > 1) {
      jokersCount -= (diff - 1);
      if (jokersCount < 0) return false;
    }
  }
  return true;
};

// 階段と同数出しを総合した強度計算
const calcPlayedStrength = (cards, isRev) => {
  const nonJokers = cards.filter(c => c.num !== 0);
  if (nonJokers.length === 0) return 14;

  if (checkSequence(cards)) {
    const baseStrengths = nonJokers.map(c => getCardStrength(c.num, false)).sort((a,b)=>a-b);
    let minBase = baseStrengths[0];
    let maxBase = baseStrengths[baseStrengths.length - 1];
    let neededJokers = 0;
    for (let i = 0; i < baseStrengths.length - 1; i++) {
      neededJokers += baseStrengths[i+1] - baseStrengths[i] - 1;
    }
    let remJokers = (cards.length - nonJokers.length) - neededJokers;
    while(remJokers > 0 && maxBase < 13) { maxBase++; remJokers--; }
    while(remJokers > 0 && minBase > 1) { minBase--; remJokers--; }
    return isRev ? (14 - minBase) : maxBase;
  } else {
    return getCardStrength(nonJokers[0].num, isRev);
  }
};

// レーティング計算ロジック
const calcRating = (myRating, allRatings, myRank, finalRankings) => {
  const safeMyRating = typeof myRating === 'number' && !isNaN(myRating) ? myRating : 1000;

  let baseChange = 0;
  if (myRank === 0) baseChange = 16;
  else if (myRank === 1) baseChange = 6;
  else if (myRank === 2) baseChange = -6;
  else if (myRank === 3) baseChange = -16;

  let diffBonus = 0;
  for (let i = 0; i < 4; i++) {
    if (i === myRank) continue;
    let oppRating = allRatings[finalRankings[i]];
    oppRating = typeof oppRating === 'number' && !isNaN(oppRating) ? oppRating : 1000;
    const diff = oppRating - safeMyRating;
    diffBonus += diff * 0.04; 
  }

  let rawChange = baseChange + diffBonus;
  
  let factor = 1000 / Math.max(400, safeMyRating); 
  factor = Math.pow(factor, 0.6); 

  let change = 0;
  if (rawChange > 0) {
    change = rawChange * factor * 2.5; 
    if (safeMyRating <= 800) {
      change *= 1.5; 
    }
  } else {
    change = rawChange / Math.max(0.3, factor);
  }

  change = Math.round(change) || 0;

  if (myRank === 0 && change <= 0) change = 1;
  if (myRank === 3 && change >= 0) change = -1;

  return change;
};

// プレイヤーのレーティングに比例したCPUのレーティング生成
const generateCpuRating = (playerRating) => {
  const pRating = Math.max(100, playerRating || 1000);
  
  if (pRating >= 1200 && Math.random() < 0.05) {
    return 2000 + Math.floor(Math.random() * 500);
  }

  const enhancedProb = Math.min(0.10, pRating / 10000);
  if (Math.random() < enhancedProb) {
    const baseEnhanced = Math.max(1000, 1000 + Math.floor(pRating * 0.2));
    return baseEnhanced + Math.floor(Math.random() * 301);
  } else {
    const variation = Math.floor(Math.random() * 401) - 200; 
    const calculated = pRating + variation;
    return Math.max(100, calculated);
  }
};

function App() {
  const [currentScreen, setCurrentScreen] = useState('opening');

  const [userData, setUserData] = useState(() => {
    const saved = localStorage.getItem('daifugo_user');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (!parsed.userId) parsed.userId = 'user_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        if (parsed.hasCompleted163Settings === undefined) parsed.hasCompleted163Settings = false;
        if (!parsed.uiMode) parsed.uiMode = 'mobile';
        if (!parsed.themeColor) parsed.themeColor = '#3498db';
        if (parsed.cardDesign === 'number' || parsed.cardDesign === 'mark' || !parsed.cardDesign) {
          parsed.cardDesign = 'classic';
        }
        
        if (parsed.rating !== undefined) {
          parsed.rating5 = typeof parsed.rating === 'number' && !isNaN(parsed.rating) ? parsed.rating : 1000;
          parsed.maxRating5 = typeof parsed.maxRating === 'number' && !isNaN(parsed.maxRating) ? parsed.maxRating : parsed.rating5;
          parsed.rating10 = parsed.rating5;
          parsed.maxRating10 = parsed.maxRating5;
          parsed.bestRank5 = parsed.bestRank || null;
          parsed.bestRank10 = null;
          delete parsed.rating;
          delete parsed.maxRating;
          delete parsed.bestRank;
        }

        if (typeof parsed.rating5 !== 'number' || isNaN(parsed.rating5)) parsed.rating5 = 1000;
        if (typeof parsed.maxRating5 !== 'number' || isNaN(parsed.maxRating5)) parsed.maxRating5 = 1000;
        if (typeof parsed.rating10 !== 'number' || isNaN(parsed.rating10)) parsed.rating10 = 1000;
        if (typeof parsed.maxRating10 !== 'number' || isNaN(parsed.maxRating10)) parsed.maxRating10 = 1000;

        if (!parsed.hasResetRatingV321) {
          parsed.rating5 = 1000;
          parsed.maxRating5 = 1000;
          parsed.rating10 = 1000;
          parsed.maxRating10 = 1000;
          parsed.hasResetRatingV321 = true;
        }

        if (!parsed.stats) parsed.stats = {};
        if (parsed.stats.rank) {
          parsed.stats.rank5 = parsed.stats.rank;
          delete parsed.stats.rank;
        }
        if (!parsed.stats.rank5) parsed.stats.rank5 = { wins: [0, 0, 0, 0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, disconnects: 0 };
        if (!parsed.stats.rank10) parsed.stats.rank10 = { wins: [0, 0, 0, 0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, disconnects: 0 };
        if (!parsed.stats.room) parsed.stats.room = { wins: [0, 0, 0, 0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, disconnects: 0 };
        if (!parsed.stats.cpu) parsed.stats.cpu = { wins: [0, 0, 0, 0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, disconnects: 0 };

        return parsed;
      } catch (e) {}
    }
    return {
      userId: 'user_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      username: '',
      password: '',
      rating5: 1000,
      maxRating5: 1000,
      bestRank5: null,
      rating10: 1000,
      maxRating10: 1000,
      bestRank10: null,
      stats: {
        rank5: { wins: [0, 0, 0, 0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, disconnects: 0 },
        rank10: { wins: [0, 0, 0, 0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, disconnects: 0 },
        room: { wins: [0, 0, 0, 0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, disconnects: 0 },
        cpu: { wins: [0, 0, 0, 0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, disconnects: 0 }
      },
      bgColor: '#2c3e50',
      themeColor: '#3498db',
      bgImage: '',
      volume: 50,
      cardDesign: 'classic',
      cardSize: 'medium',
      uiMode: 'mobile',
      lastSeenVersion: '',
      hasCompleted163Settings: false,
      lastLoginAt: Date.now(),
      hasResetRatingV321: true
    };
  });

  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showRecommendModal, setShowRecommendModal] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showDeleteDataModal, setShowDeleteDataModal] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showDisconnectPenaltyModal, setShowDisconnectPenaltyModal] = useState(false);
  const [showInitialSettingsModal, setShowInitialSettingsModal] = useState(false);
  const [inputUsername, setInputUsername] = useState('');
  
  const [decayInfo, setDecayInfo] = useState(null);

  const [showAccountPromptModal, setShowAccountPromptModal] = useState(false);
  const [showAccountRegisterModal, setShowAccountRegisterModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [rankingTab, setRankingTab] = useState('rank5');
  const [globalRankings5, setGlobalRankings5] = useState([]);
  const [globalRankings10, setGlobalRankings10] = useState([]);
  const [myRankingInfo5, setMyRankingInfo5] = useState(null);
  const [myRankingInfo10, setMyRankingInfo10] = useState(null);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [rankingError, setRankingError] = useState('');
  
  const [roomId, setRoomId] = useState(null);
  const [roomData, setRoomData] = useState(null);
  const [roomTimer, setRoomTimer] = useState(60);

  const [isRankMatch, setIsRankMatch] = useState(false);
  const [totalMatches, setTotalMatches] = useState(5);
  const [matchCount, setMatchCount] = useState(1);
  const [scores, setScores] = useState([0, 0, 0, 0]);
  const [prevRanks, setPrevRanks] = useState([0, 1, 2, 3]);
  const [players, setPlayers] = useState(['あなた', 'CPU 1', 'CPU 2', 'CPU 3']);
  const [playerRatings, setPlayerRatings] = useState([1000, 1000, 1000, 1000]);
  const [isOnlineMode, setIsOnlineMode] = useState(false);
  const [mySlot, setMySlot] = useState(0);

  const [profileTab, setProfileTab] = useState('rank5');

  const isHost = isOnlineMode ? (roomData?.hostId === userData.userId) : true;

  const [hands, setHands] = useState([[], [], [], []]);
  const [turn, setTurn] = useState(0);
  const [field, setField] = useState(null);
  const [passed, setPassed] = useState([false, false, false, false]);
  const [rankingsThisMatch, setRankingsThisMatch] = useState([]);
  const [fouledPlayers, setFouledPlayers] = useState([]); 
  const [selectedCards, setSelectedCards] = useState([]);

  const [isRevolution, setIsRevolution] = useState(false);
  const [is11Back, setIs11Back] = useState(false);
  const [message, setMessage] = useState('');
  const [matchResultModal, setMatchResultModal] = useState(null);
  const [gameResultModal, setGameResultModal] = useState(null);
  const [showConfirmHomeModal, setShowConfirmHomeModal] = useState(false);
  const [inputRoomCode, setInputRoomCode] = useState('');

  const [exchangePhase, setExchangePhase] = useState(false);
  const [exchangeCards, setExchangeCards] = useState({});
  const [syncedGameOver, setSyncedGameOver] = useState(false);

  const [turnTimer, setTurnTimer] = useState(30);

  // ★ Ver3.3.4: 二重送信防止（連打対策）フラグ
  const [isProcessing, setIsProcessing] = useState(false);

  const [friendTab, setFriendTab] = useState('list');
  const [friendsList, setFriendsList] = useState([]);
  const [friendRequestsList, setFriendRequestsList] = useState([]);
  const [searchFriendQuery, setSearchFriendQuery] = useState('');
  const [searchFriendResults, setSearchFriendResults] = useState([]);
  const [isFriendLoading, setIsFriendLoading] = useState(false);
  
  const [unreadChats, setUnreadChats] = useState({});
  const [friendRequestPopup, setFriendRequestPopup] = useState(null);
  const prevReqCountRef = useRef(0);
  const isFirstLoadRef = useRef(true);

  const [activeChatFriend, setActiveChatFriend] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const messagesEndRef = useRef(null);

  const [invitations, setInvitations] = useState([]);

  const [aiLearningData, setAiLearningData] = useState([]);

  const isReversedEffective = isRevolution !== is11Back;

  // 自分のターンになった時、処理中フラグを解除
  useEffect(() => {
    if (turn === mySlot || exchangePhase) {
      setIsProcessing(false);
    }
  }, [turn, mySlot, exchangePhase]);

  useEffect(() => {
    const learningRef = ref(rtdb, 'ai_learning/tactics');
    const unsub = onValue(learningRef, (snap) => {
      const val = snap.val();
      if (val) {
        const vals = Object.values(val);
        setAiLearningData(vals.slice(-100));
      }
    });
    return () => off(learningRef);
  }, []);

  useEffect(() => {
    if (currentScreen === 'opening') {
      const timer = setTimeout(() => {
        setCurrentScreen('menu');
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [currentScreen]);

  useEffect(() => {
    const now = Date.now();
    const lastLogin = userData.lastLoginAt || now;
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysPassed = Math.floor((now - lastLogin) / msPerDay);

    let newUserData = { ...userData, lastLoginAt: now };
    let updated = false;

    if (daysPassed >= 2 && (userData.rating5 > 0 || userData.rating10 > 0)) {
      let n = daysPassed - 2;
      if (n > 5) n = 5;
      const decayAmount = Math.pow(2, n);
      
      const newRating5 = Math.max(0, userData.rating5 - decayAmount);
      const newRating10 = Math.max(0, userData.rating10 - decayAmount);
      
      setDecayInfo({ 
        days: daysPassed, 
        amount: decayAmount, 
        oldRating: userData.rating5,
        newRating: newRating5 
      });
      
      newUserData.rating5 = newRating5;
      newUserData.rating10 = newRating10;
      updated = true;
    } else if (now - lastLogin > msPerDay) {
      updated = true;
    }

    if (updated) {
      saveUserData(newUserData);
    }
  }, []);

  useEffect(() => {
    if (!userData.userId || !userData.username) return;
    const updateMyStatus = async () => {
      const currentStatus = currentScreen === 'game' ? 'playing' : 'online';
      try {
        await setDoc(doc(db, 'users', userData.userId), {
          status: currentStatus,
          updatedAt: Date.now()
        }, { merge: true });
      } catch(e) {}
    };

    updateMyStatus();
    const interval = setInterval(updateMyStatus, 3 * 60 * 1000); 
    return () => clearInterval(interval);
  }, [currentScreen, userData.userId, userData.username]);

  useEffect(() => {
    if (!userData.userId) return;
    const invRef = ref(rtdb, `invitations/${userData.userId}`);
    const unsub = onValue(invRef, (snap) => {
      const val = snap.val();
      if (val) {
        setInvitations(Object.entries(val).map(([k, v]) => ({ id: k, ...v })));
      } else {
        setInvitations([]);
      }
    });
    return () => off(invRef);
  }, [userData.userId]);

  useEffect(() => {
    const rawAiPlayers = [
      { userId: 'ai_player_2', username: 'AI_Beta', rating: 1000, maxRating: 1000, isAIPlayer: true, status: 'online' },
      { userId: 'ai_player_3', username: 'AI_Gamma', rating: 1000, maxRating: 1000, isAIPlayer: true, status: 'online' },
      { userId: 'ai_player_6', username: 'AI_Zeta', rating: 1000, maxRating: 1000, isAIPlayer: true, status: 'online' },
      { userId: 'ai_player_7', username: 'AI_Eta', rating: 1000, maxRating: 1000, isAIPlayer: true, status: 'online' },
      { userId: 'ai_player_8', username: 'AI_Theta', rating: 1000, maxRating: 1000, isAIPlayer: true, status: 'online' },
      { userId: 'ai_player_10', username: 'AI_Kappa', rating: 1000, maxRating: 1000, isAIPlayer: true, status: 'online' },
      { userId: 'ai_player_11', username: 'AI_Lambda', rating: 1000, maxRating: 1000, isAIPlayer: true, status: 'online' },
      { userId: 'ai_player_12', username: 'AI_Mu', rating: 1000, maxRating: 1000, isAIPlayer: true, status: 'online' },
      { userId: 'ai_player_15', username: 'AI_Omicron', rating: 1000, maxRating: 1000, isAIPlayer: true, status: 'online' },
      { userId: 'ai_player_16', username: 'AI_Pi', rating: 1000, maxRating: 1000, isAIPlayer: true, status: 'online' },
      { userId: 'ai_player_19', username: 'AI_Tau', rating: 1000, maxRating: 1000, isAIPlayer: true, status: 'online' },
      { userId: 'ai_player_20', username: 'AI_Upsilon', rating: 1000, maxRating: 1000, isAIPlayer: true, status: 'online' },
      { userId: 'ai_player_22', username: 'AI_Chi', rating: 1000, maxRating: 1000, isAIPlayer: true, status: 'online' },
      { userId: 'ai_player_23', username: 'AI_Psi', rating: 1000, maxRating: 1000, isAIPlayer: true, status: 'online' },
      { userId: 'ai_player_24', username: 'AI_Omega', rating: 1000, maxRating: 1000, isAIPlayer: true, status: 'online' },
      { userId: 'ai_player_27', username: 'AI_Gemini', rating: 1000, maxRating: 1000, isAIPlayer: true, status: 'online' },
      { userId: 'ai_player_28', username: 'AI_Cancer', rating: 1000, maxRating: 1000, isAIPlayer: true, status: 'online' },
      { userId: 'ai_player_31', username: 'AI_Libra', rating: 1000, maxRating: 1000, isAIPlayer: true, status: 'online' },
      { userId: 'ai_player_32', username: 'AI_Scorpio', rating: 1000, maxRating: 1000, isAIPlayer: true, status: 'online' },
      { userId: 'ai_player_35', username: 'AI_Aquarius', rating: 1000, maxRating: 1000, isAIPlayer: true, status: 'online' },
      { userId: 'ai_player_36', username: 'AI_Pisces', rating: 1000, maxRating: 1000, isAIPlayer: true, status: 'online' },
      { userId: 'ai_player_37', username: 'AI_Orion', rating: 1000, maxRating: 1000, isAIPlayer: true, status: 'online' },
      { userId: 'ai_player_40', username: 'AI_Draco', rating: 1000, maxRating: 1000, isAIPlayer: true, status: 'online' },
      { userId: 'ai_player_41', username: 'AI_Pegasus', rating: 1000, maxRating: 1000, isAIPlayer: true, status: 'online' },
      { userId: 'ai_player_42', username: 'AI_Phoenix', rating: 1000, maxRating: 1000, isAIPlayer: true, status: 'online' },
      { userId: 'ai_player_54', username: 'AI_Perseus', rating: 1000, maxRating: 1000, isAIPlayer: true, status: 'online' },
      { userId: 'ai_player_55', username: 'AI_Ophiuchus', rating: 1000, maxRating: 1000, isAIPlayer: true, status: 'online' },
      { userId: 'ai_player_56', username: 'AI_Serpens', rating: 1000, maxRating: 1000, isAIPlayer: true, status: 'online' },
      { userId: 'ai_player_57', username: 'AI_Sagitta', rating: 1000, maxRating: 1000, isAIPlayer: true, status: 'online' },
      { userId: 'ai_player_58', username: 'AI_Aquila', rating: 1000, maxRating: 1000, isAIPlayer: true, status: 'online' },
      { userId: 'ai_player_59', username: 'AI_Delphinus', rating: 1000, maxRating: 1000, isAIPlayer: true, status: 'online' },
      { userId: 'ai_player_60', username: 'AI_Equuleus', rating: 1000, maxRating: 1000, isAIPlayer: true, status: 'online' },
      { userId: 'ai_player_61', username: 'AI_CanisMajor', rating: 1000, maxRating: 1000, isAIPlayer: true, status: 'online' },
      { userId: 'ai_player_62', username: 'AI_CanisMinor', rating: 1000, maxRating: 1000, isAIPlayer: true, status: 'online' },
      { userId: 'ai_player_63', username: 'AI_Lepus', rating: 1000, maxRating: 1000, isAIPlayer: true, status: 'online' },
      { userId: 'ai_player_64', username: 'AI_Columba', rating: 1000, maxRating: 1000, isAIPlayer: true, status: 'online' },
      { userId: 'ai_player_65', username: 'AI_Centaurus2', rating: 1000, maxRating: 1000, isAIPlayer: true, status: 'online' },
      { userId: 'ai_player_66', username: 'AI_Crux', rating: 1000, maxRating: 1000, isAIPlayer: true, status: 'online' },
      { userId: 'ai_player_72', username: 'AI_UrsaMajor', rating: 1000, maxRating: 1000, isAIPlayer: true, isSuperAI: true, status: 'online' },
      { userId: 'ai_player_73', username: 'AI_UrsaMinor', rating: 1000, maxRating: 1000, isAIPlayer: true, isSuperAI: true, status: 'online' },
      { userId: 'ai_player_74', username: 'AI_CassiopeiaX', rating: 1000, maxRating: 1000, isAIPlayer: true, isSuperAI: true, status: 'online' },
      { userId: 'ai_player_75', username: 'AI_Cepheus', rating: 1000, maxRating: 1000, isAIPlayer: true, isSuperAI: true, status: 'online' },
      { userId: 'ai_player_76', username: 'AI_Cetus', rating: 1000, maxRating: 1000, isAIPlayer: true, isSuperAI: true, status: 'online' },
      { userId: 'ai_player_77', username: 'AI_Eridanus', rating: 1000, maxRating: 1000, isAIPlayer: true, isSuperAI: true, status: 'online' },
      { userId: 'ai_player_78', username: 'AI_Hydrus', rating: 1000, maxRating: 1000, isAIPlayer: true, isSuperAI: true, status: 'online' },
      { userId: 'ai_player_79', username: 'AI_Lupus', rating: 1000, maxRating: 1000, isAIPlayer: true, isSuperAI: true, status: 'online' },
      { userId: 'ai_player_80', username: 'AI_PegasusX', rating: 1000, maxRating: 1000, isAIPlayer: true, isSuperAI: true, status: 'online' },
      { userId: 'ai_player_81', username: 'AI_asn_v2', rating: 1000, maxRating: 1000, isAIPlayer: true, isSuperAI: true, isUltraSuperAI: true, isDoubleGrowthAI: true, isAsnV2: true, status: 'online' },
      { userId: 'ai_player_82', username: 'AI_Nova', rating: 1000, maxRating: 1000, isAIPlayer: true, isSuperAI: true, status: 'online' },
      { userId: 'ai_player_83', username: 'AI_Pulsar', rating: 1000, maxRating: 1000, isAIPlayer: true, isSuperAI: true, status: 'online' },
      { userId: 'ai_player_84', username: 'AI_Quasar', rating: 1000, maxRating: 1000, isAIPlayer: true, isSuperAI: true, status: 'online' },
      { userId: 'ai_player_85', username: 'AI_Nebula', rating: 1000, maxRating: 1000, isAIPlayer: true, isSuperAI: true, status: 'online' },
      { userId: 'ai_player_86', username: 'AI_Zenith', rating: 1000, maxRating: 1000, isAIPlayer: true, isSuperAI: true, status: 'online' },
      { userId: 'ai_player_87', username: 'AI_SAKAMOTO', rating: 1000, maxRating: 1000, isAIPlayer: true, isDoubleGrowthAI: true, status: 'online' },
      { userId: 'ai_player_88', username: 'AI_YAMADA', rating: 1000, maxRating: 1000, isAIPlayer: true, isDoubleGrowthAI: true, status: 'online' }
    ];

    const aiPlayersInit = rawAiPlayers.map(ai => ({
      ...ai,
      rating5: 1000,
      maxRating5: 1000,
      rating10: 1000,
      maxRating10: 1000,
      hasResetRatingV321: true,
      stats: {
        rank5: { wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, disconnects: 0 },
        rank10: { wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, disconnects: 0 },
        room: { wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, disconnects: 0 },
        cpu: { wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, disconnects: 0 }
      }
    }));

    const runAISimulation = async () => {
      const aiIds = aiPlayersInit.map(p => p.userId);
      const aiData = [];
      for (const id of aiIds) {
         try {
           const d = await getDoc(doc(db, 'users', id));
           if (d.exists()) aiData.push(d.data());
         } catch(e){}
      }
      
      if (aiData.length === aiPlayersInit.length) {
        const lastUpdate = Math.min(...aiData.map(a => a.updatedAt || 0));
        const now = Date.now();
        const matchCountSim = Math.min(30, Math.floor((now - lastUpdate) / 600000));
        
        let simPlayers = [...aiData];
        let needsUpdate = false;

        const nowTime = new Date();
        const h = nowTime.getHours();
        const m = nowTime.getMinutes();
        const isRestTime = (h === 5 && m >= 29) || (h === 23 && m >= 29);

        for (let ai of simPlayers) {
           if (ai.status === 'playing' && (now - (ai.updatedAt || 0)) > 60 * 60000) {
               ai.status = 'online';
               needsUpdate = true;
           }
        }

        if (matchCountSim > 0 && !isRestTime) {
           needsUpdate = true;
           for (let mCount = 0; mCount < matchCountSim; mCount++) {
              const shuffledAI = [...simPlayers].sort(() => Math.random() - 0.5);
              let playersForMatch = [];
              
              if (Math.random() < 0.5) {
                  playersForMatch = shuffledAI.slice(0, 4);
              } else {
                  const mobRating = 1000 + Math.floor(Math.random() * 500);
                  playersForMatch = [...shuffledAI.slice(0, 3), { userId: 'mob', rating5: mobRating, maxRating5: mobRating, rating10: mobRating, maxRating10: mobRating }];
              }
              
              const is10MatchesSim = Math.random() < 0.3;
              const modeKey = is10MatchesSim ? 'rank10' : 'rank5';
              const ratingKey = is10MatchesSim ? 'rating10' : 'rating5';
              const maxRatingKey = is10MatchesSim ? 'maxRating10' : 'maxRating5';

              playersForMatch.sort((a, b) => {
                const aMax = typeof a[maxRatingKey] === 'number' && !isNaN(a[maxRatingKey]) ? a[maxRatingKey] : (a[ratingKey] || 1000);
                const bMax = typeof b[maxRatingKey] === 'number' && !isNaN(b[maxRatingKey]) ? b[maxRatingKey] : (b[ratingKey] || 1000);
                
                const effA = a.isAsnV2 ? (3000 + Math.max(0, aMax - 1000) * 4) : (a.isDoubleGrowthAI ? (2000 + Math.max(0, aMax - 1000) * 4) : (a.isUltraSuperAI ? (3000 + aMax * 3) : (a.isSuperAI ? 2000 : aMax)));
                const effB = b.isAsnV2 ? (3000 + Math.max(0, bMax - 1000) * 4) : (b.isDoubleGrowthAI ? (2000 + Math.max(0, bMax - 1000) * 4) : (b.isUltraSuperAI ? (3000 + bMax * 3) : (b.isSuperAI ? 2000 : bMax)));
                return effB - effA + (Math.random() * 800 - 400);
              });
              
              const currentRatings = playersForMatch.map(p => {
                 return typeof p[ratingKey] === 'number' && !isNaN(p[ratingKey]) ? p[ratingKey] : 1000;
              });

              for (let i = 0; i < 4; i++) {
                 if (playersForMatch[i].userId !== 'mob') {
                    const aiTarget = simPlayers.find(ai => ai.userId === playersForMatch[i].userId);
                    if (aiTarget) {
                      const safeOldRating = typeof aiTarget[ratingKey] === 'number' && !isNaN(aiTarget[ratingKey]) ? aiTarget[ratingKey] : 1000;
                      let change = calcRating(safeOldRating, currentRatings, i, [0,1,2,3]);
                      
                      if ((aiTarget.isDoubleGrowthAI || aiTarget.isAsnV2) && change > 0) change *= 2; 

                      aiTarget[ratingKey] = Math.max(0, safeOldRating + change);
                      aiTarget[maxRatingKey] = Math.max(aiTarget[maxRatingKey] || 0, aiTarget[ratingKey]);
                      
                      if (!aiTarget.stats) aiTarget.stats = {};
                      if (!aiTarget.stats[modeKey]) aiTarget.stats[modeKey] = { wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0 };
                      
                      aiTarget.stats[modeKey].wins[i] += 1;
                      aiTarget.stats[modeKey].totalGames += 1;
                      aiTarget.stats[modeKey].currentWinStreak = (i === 0) ? (aiTarget.stats[modeKey].currentWinStreak || 0) + 1 : 0;
                      aiTarget.stats[modeKey].maxWinStreak = Math.max(aiTarget.stats[modeKey].maxWinStreak || 0, aiTarget.stats[modeKey].currentWinStreak);
                      
                      if (mCount === matchCountSim - 1) {
                         aiTarget.status = 'playing';
                      }
                    }
                 }
              }
           }
        }
        
        if (matchCountSim > 0 || needsUpdate) {
            for (const ai of simPlayers) {
               if (ai.status !== 'playing') {
                  ai.status = isRestTime ? 'offline' : (Math.random() < 0.8 ? 'online' : 'offline');
               }
               if (matchCountSim > 0) ai.updatedAt = now;
               try {
                 await setDoc(doc(db, 'users', ai.userId), ai, { merge: true });
               } catch(e){}
            }
        }
      }
    };
    
    const initProcess = async () => {
      let needsInit = false;
      for (const ai of aiPlayersInit) {
        try {
          const docRef = doc(db, 'users', ai.userId);
          const docSnap = await getDoc(docRef);
          if (!docSnap.exists()) {
            await setDoc(docRef, { ...ai, updatedAt: Date.now() });
            needsInit = true;
          } else {
            const data = docSnap.data();
            let changed = false;
            
            if (!data.hasResetRatingV321) {
               data.rating5 = 1000;
               data.maxRating5 = 1000;
               data.rating10 = 1000;
               data.maxRating10 = 1000;
               data.hasResetRatingV321 = true;
               changed = true;
            }

            if (ai.isDoubleGrowthAI && !data.isDoubleGrowthAI) {
               data.isDoubleGrowthAI = true;
               changed = true;
            }
            if (ai.isAsnV2 && !data.isAsnV2) {
               data.isAsnV2 = true;
               changed = true;
            }
            
            if (changed) {
               await setDoc(docRef, data, { merge: true });
               needsInit = true;
            }
          }
        } catch (e) {}
      }
      if (!needsInit) {
         runAISimulation();
      }
    };
    initProcess();
  }, []);

  useEffect(() => {
    const penaltyFlag = localStorage.getItem('daifugo_penalty_flag');
    if (penaltyFlag === 'true') {
      setUserData(prev => {
        const newRating5 = Math.floor((prev.rating5 || 1000) * 0.9);
        const newRating10 = Math.floor((prev.rating10 || 1000) * 0.9);
        const newStats = prev.stats ? JSON.parse(JSON.stringify(prev.stats)) : { rank5: { wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, disconnects: 0 }, rank10: { wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, disconnects: 0 }, room: { wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, disconnects: 0 }, cpu: { wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, disconnects: 0 } };
        
        if (newStats.rank5) { newStats.rank5.disconnects = (newStats.rank5.disconnects || 0) + 1; newStats.rank5.currentWinStreak = 0; }
        if (newStats.rank10) { newStats.rank10.disconnects = (newStats.rank10.disconnects || 0) + 1; newStats.rank10.currentWinStreak = 0; }

        const updated = { ...prev, rating5: newRating5, rating10: newRating10, stats: newStats };
        localStorage.setItem('daifugo_user', JSON.stringify(updated));
        if (updated.username && updated.userId) {
          setDoc(doc(db, 'users', updated.userId), updated, { merge: true }).catch(()=>{});
        }
        return updated;
      });
      localStorage.removeItem('daifugo_penalty_flag');
      setShowDisconnectPenaltyModal(true);
    }
  }, []);

  useEffect(() => {
    if (!userData.username) {
      setShowRegisterModal(true);
    }
  }, [userData.username]);

  useEffect(() => {
    if (userData.username && userData.lastSeenVersion !== CURRENT_VERSION) {
      setShowUpdateModal(true);
    }
  }, [userData.username, userData.lastSeenVersion]);

  useEffect(() => {
    const isAnyModalOpen = showRegisterModal || showRecommendModal || showRulesModal || showUpdateModal || showDisconnectPenaltyModal || showAccountPromptModal || showAccountRegisterModal || showLoginModal || decayInfo;
    if (userData.username && !userData.hasCompleted163Settings && !isAnyModalOpen && currentScreen !== 'opening') {
      setShowInitialSettingsModal(true);
    }
  }, [userData.username, userData.hasCompleted163Settings, showRegisterModal, showRecommendModal, showRulesModal, showUpdateModal, showDisconnectPenaltyModal, showAccountPromptModal, showAccountRegisterModal, showLoginModal, decayInfo, currentScreen]);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (userData.userId && userData.username) {
        setDoc(doc(db, 'users', userData.userId), { status: 'offline', updatedAt: Date.now() }, { merge: true }).catch(()=>{});
      }

      if (isOnlineMode && roomId && roomData) {
        if (currentScreen === 'game') {
          const updatedPlayers = [...(roomData.players || [])];
          if (updatedPlayers[mySlot] && !updatedPlayers[mySlot].isCpu) {
            updatedPlayers[mySlot] = { ...updatedPlayers[mySlot], hasDisconnected: true };
            update(ref(rtdb, `rooms/${roomId}`), { players: updatedPlayers });
          }
        } else {
          leaveRoomById(roomId, userData.userId);
        }
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isOnlineMode, isRankMatch, currentScreen, roomId, roomData, mySlot, userData.rating5, userData.rating10, userData.userId, userData.username]);

  const handleCloseUpdate = () => {
    setShowUpdateModal(false);
    if (userData.lastSeenVersion !== CURRENT_VERSION) {
      const updated = { ...userData, lastSeenVersion: CURRENT_VERSION };
      saveUserData(updated);
      if (!updated.password) {
        setShowAccountPromptModal(true);
      }
    }
  };

  const saveUserData = async (newData) => {
    setUserData(newData);
    localStorage.setItem('daifugo_user', JSON.stringify(newData));

    if (newData.username && newData.userId) {
      try {
        const docData = {
          userId: newData.userId, username: newData.username, 
          rating5: newData.rating5, maxRating5: newData.maxRating5, bestRank5: newData.bestRank5 || null,
          rating10: newData.rating10, maxRating10: newData.maxRating10, bestRank10: newData.bestRank10 || null,
          stats: newData.stats,
          status: currentScreen === 'game' ? 'playing' : 'online',
          updatedAt: Date.now(),
          lastLoginAt: newData.lastLoginAt || Date.now(),
          hasResetRatingV321: newData.hasResetRatingV321 || true
        };
        if (newData.password) docData.password = newData.password;

        await setDoc(doc(db, 'users', newData.userId), docData, { merge: true });
      } catch (err) {}
    }
  };

  const handleDeleteAllData = async () => {
    try { if (userData.userId) await deleteDoc(doc(db, 'users', userData.userId)); } catch (err) {}
    localStorage.removeItem('daifugo_user');
    window.location.reload();
  };

  const handleRegister = (e) => {
    e.preventDefault();
    if (!inputUsername.trim()) return;
    const updated = { ...userData, username: inputUsername.trim(), lastSeenVersion: CURRENT_VERSION, lastLoginAt: Date.now(), hasResetRatingV321: true };
    saveUserData(updated);
    setShowRegisterModal(false);
    setShowRecommendModal(true);
  };

  const handleCloseRecommend = () => {
    setShowRecommendModal(false);
    setShowRulesModal(true);
  };

  const handleRegisterAccount = async (e) => {
    e.preventDefault();
    if (!authPassword.trim()) return;

    try {
      const snap = await getDocs(collection(db, 'users'));
      let isDuplicateName = false;
      snap.forEach(docSnap => {
         const d = docSnap.data();
         if (docSnap.id !== userData.userId && d.username === userData.username && d.password) {
             isDuplicateName = true;
         }
      });

      if (isDuplicateName) {
         setAuthError('このユーザー名は既に他のパスワード付きアカウントで使用されています。設定でユーザー名を変更してから再度お試しください。');
         return;
      }

      const updated = { ...userData, password: authPassword };
      saveUserData(updated);
      setShowAccountRegisterModal(false);
      setAuthPassword('');
      setAuthError('');
      alert('アカウントを登録しました！');
    } catch(err) {
      setAuthError('通信エラーが発生しました。');
    }
  };

  const handleLoginAccount = async (e) => {
    e.preventDefault();
    if (!authUsername.trim() || !authPassword.trim()) return;
    
    try {
      const snap = await getDocs(collection(db, 'users'));
      let loggedInData = null;
      snap.forEach(docSnap => { 
        const d = docSnap.data();
        if (d.username === authUsername && d.password === authPassword) {
            loggedInData = d;
        }
      });
      
      if (loggedInData) {
         if (loggedInData.rating !== undefined) {
           loggedInData.rating5 = typeof loggedInData.rating === 'number' && !isNaN(loggedInData.rating) ? loggedInData.rating : 1000;
           loggedInData.maxRating5 = typeof loggedInData.maxRating === 'number' && !isNaN(loggedInData.maxRating) ? loggedInData.maxRating : loggedInData.rating5;
           loggedInData.rating10 = loggedInData.rating5;
           loggedInData.maxRating10 = loggedInData.maxRating5;
           loggedInData.bestRank5 = loggedInData.bestRank || null;
           loggedInData.bestRank10 = null;
           delete loggedInData.rating;
           delete loggedInData.maxRating;
           delete loggedInData.bestRank;
           if (loggedInData.stats && loggedInData.stats.rank) {
             loggedInData.stats.rank5 = loggedInData.stats.rank;
             loggedInData.stats.rank10 = { wins: [0, 0, 0, 0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, disconnects: 0 };
             delete loggedInData.stats.rank;
           }
         }
         
         if (!loggedInData.hasResetRatingV321) {
            loggedInData.rating5 = 1000;
            loggedInData.maxRating5 = 1000;
            loggedInData.rating10 = 1000;
            loggedInData.maxRating10 = 1000;
            loggedInData.hasResetRatingV321 = true;
         }
         
         setUserData(loggedInData);
         localStorage.setItem('daifugo_user', JSON.stringify(loggedInData));
         setShowLoginModal(false);
         setAuthUsername('');
         setAuthPassword('');
         setAuthError('');
         alert('アカウントを切り替えました！');
      } else {
        setAuthError('ユーザー名またはパスワードが間違っています。');
      }
    } catch(err) {
      setAuthError('エラーが発生しました。通信環境を確認してください。');
    }
  };

  const fetchRankings = async () => {
    setRankingLoading(true); setRankingError('');
    try {
      const snapshot = await getDocs(collection(db, 'users'));
      const list = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data && data.username) {
           data.rating5 = typeof data.rating5 === 'number' && !isNaN(data.rating5) ? data.rating5 : 1000;
           data.rating10 = typeof data.rating10 === 'number' && !isNaN(data.rating10) ? data.rating10 : 1000;
           list.push(data);
        }
      });

      const now = Date.now();
      const ONE_DAY = 24 * 60 * 60 * 1000;

      const processList = (key, baseRankKey, baseRatingKey, updatedAtKey, bestRankKey) => {
        let sortedList = [...list].sort((a, b) => b[key] - a[key]);
        let processedList = [];

        sortedList.forEach((user, idx) => {
          const currentRank = idx + 1;
          const currentRating = user[key];
          let baseRank = user[baseRankKey];
          let baseRating = user[baseRatingKey];
          let baseRankUpdatedAt = user[updatedAtKey] || 0;
          let needsUpdate = false;

          if (baseRating === undefined) { baseRating = currentRating; needsUpdate = true; }
          if (!baseRank || (now - baseRankUpdatedAt > ONE_DAY)) {
            baseRank = currentRank; baseRating = currentRating; baseRankUpdatedAt = now; needsUpdate = true;
          }

          const rankDiff = baseRank - currentRank;
          let trend = rankDiff > 0 ? 'up' : rankDiff < 0 ? 'down' : 'same';
          let diffVal = Math.abs(rankDiff);

          const ratingDiff = currentRating - baseRating;
          let ratingTrend = ratingDiff > 0 ? 'up' : ratingDiff < 0 ? 'down' : 'same';
          let ratingDiffVal = Math.abs(ratingDiff);

          const processedUser = {
            ...user,
            [`${key}Trend`]: trend,
            [`${key}DiffVal`]: diffVal,
            [`${key}RatingTrend`]: ratingTrend,
            [`${key}RatingDiffVal`]: ratingDiffVal
          };
          processedList.push(processedUser);

          if (needsUpdate && user.userId) {
            try {
              updateDoc(doc(db, 'users', user.userId), { [baseRankKey]: baseRank, [baseRatingKey]: baseRating, [updatedAtKey]: baseRankUpdatedAt }).catch(()=>{});
            } catch(e) {}
          }
        });

        const myIndex = processedList.findIndex(u => u.userId === userData.userId);
        let myInfo = { rank: '-', user: userData };
        if (myIndex !== -1) {
          const currentRank = myIndex + 1;
          myInfo = { rank: currentRank, user: processedList[myIndex] };
          if (!userData[bestRankKey] || currentRank < userData[bestRankKey]) {
            setUserData(prev => {
              const newUserData = { ...prev, [bestRankKey]: currentRank };
              localStorage.setItem('daifugo_user', JSON.stringify(newUserData));
              if (newUserData.userId) {
                updateDoc(doc(db, 'users', newUserData.userId), { [bestRankKey]: currentRank }).catch(()=>{});
              }
              return newUserData;
            });
          }
        }
        return { list: processedList.slice(0, 100), myInfo };
      };

      const result5 = processList('rating5', 'baseRank5', 'baseRating5', 'baseRankUpdatedAt5', 'bestRank5');
      const result10 = processList('rating10', 'baseRank10', 'baseRating10', 'baseRankUpdatedAt10', 'bestRank10');

      setGlobalRankings5(result5.list);
      setMyRankingInfo5(result5.myInfo);
      setGlobalRankings10(result10.list);
      setMyRankingInfo10(result10.myInfo);

    } catch (err) {
      setRankingError('ランキングデータの取得に失敗しました。');
    } finally {
      setRankingLoading(false);
    }
  };

  useEffect(() => { if (currentScreen === 'ranking') fetchRankings(); }, [currentScreen]);

  useEffect(() => {
    if (!roomId) return;
    const roomRef = ref(rtdb, `rooms/${roomId}`);
    const unsubscribe = onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setRoomData(data);
        if (data.status === 'playing' && currentScreen.startsWith('waiting')) {
          setCurrentScreen('game');
          if (data.hostId !== userData.userId) {
            if(data.players) {
              const playerNames = data.players.map(p => p.name);
              const ratings = data.players.map(p => p.rating);
              setPlayers(playerNames);
              setPlayerRatings(ratings);
            }
            setIsOnlineMode(true);
            setIsRankMatch(data.type.startsWith('rank'));
            setTotalMatches(data.totalMatches || 5);
          }
        }
      } else {
        if (['waiting_room', 'waiting_rank', 'game'].includes(currentScreen)) {
          setRoomId(null); setRoomData(null); setMySlot(0);
          setCurrentScreen('menu');
        }
      }
    });
    return () => off(roomRef);
  }, [roomId, currentScreen, userData.userId]);

  useEffect(() => {
    let timer = null;
    if (currentScreen === 'waiting_rank' && roomTimer > 0) {
      timer = setInterval(() => setRoomTimer(prev => prev - 1), 1000);
    } else if (currentScreen === 'waiting_rank' && roomTimer === 0) {
      startOnlineGameWithCpu();
    }
    return () => clearInterval(timer);
  }, [currentScreen, roomTimer]);

  const leaveRoomById = async (targetRoomId, targetUserId) => {
    if (!targetRoomId || !targetUserId) return;
    try {
      const roomRef = ref(rtdb, `rooms/${targetRoomId}`);
      const snapshot = await get(roomRef);
      if (snapshot.exists()) {
        const rData = snapshot.val();
        if (rData && rData.players) {
          const updatedPlayers = rData.players.filter(p => p.userId !== targetUserId);
          const activePlayers = updatedPlayers.filter(p => !p.isCpu);
          
          if (activePlayers.length === 0) {
            for (const p of updatedPlayers) {
               if (p.isAIPlayer) {
                  try { await setDoc(doc(db, 'users', p.userId), { status: 'online' }, { merge: true }); } catch(e){}
               }
            }
            await remove(roomRef);
          } else {
            let updates = { players: updatedPlayers };
            if (rData.hostId === targetUserId) {
                updates.hostId = activePlayers[0].userId;
            }
            await update(roomRef, updates);
          }
        } else {
          await remove(roomRef);
        }
      }
    } catch (err) {}
  };

  useEffect(() => {
    if (!['waiting_rank', 'waiting_room', 'game'].includes(currentScreen)) {
      if (roomId) {
        leaveRoomById(roomId, userData.userId);
        setRoomId(null);
        setRoomData(null);
        setMySlot(0);
      }
    }
  }, [currentScreen]);

  const handleLeaveRoom = async () => {
    if (roomId) {
      await leaveRoomById(roomId, userData.userId);
    }
    setRoomId(null); setRoomData(null); setMySlot(0);
    setCurrentScreen('online_select');
  };

  const joinRankMatch = async (matches) => {
    if (roomId) {
      await leaveRoomById(roomId, userData.userId);
      setRoomId(null); setRoomData(null);
    }
    const typeStr = `rank_${matches}`;
    setIsRankMatch(true); setIsOnlineMode(true); setTotalMatches(matches); setCurrentScreen('waiting_rank'); 
    setRoomTimer(60); 
    
    const roomsRef = ref(rtdb, 'rooms');
    const snapshot = await get(roomsRef);
    const rooms = snapshot.val() || {};
    let targetRoomId = null; let targetRoom = null;

    for (let rId in rooms) {
      const r = rooms[rId];
      if (r.type === typeStr && r.status === 'waiting' && r.players) {
        const activeCount = r.players.filter(p => p.userId !== userData.userId).length;
        if (activeCount < 4) {
          targetRoomId = rId; targetRoom = r; break;
        }
      }
    }

    const myRating = matches === 10 ? userData.rating10 : userData.rating5;

    if (targetRoomId) {
      const existingPlayers = (targetRoom.players || []).filter(p => p.userId !== userData.userId);
      setMySlot(existingPlayers.length);
      const updatedPlayers = [...existingPlayers, { userId: userData.userId, name: userData.username, rating: myRating, isCpu: false }];
      setRoomId(targetRoomId);
      await update(ref(rtdb, `rooms/${targetRoomId}`), { players: updatedPlayers });
      if (updatedPlayers.length === 4) executeStartOnlineMatch(targetRoomId, updatedPlayers);
    } else {
      const newRoomRef = push(ref(rtdb, 'rooms'));
      setMySlot(0); setRoomId(newRoomRef.key);
      await set(newRoomRef, {
        roomId: newRoomRef.key, type: typeStr, totalMatches: matches, status: 'waiting', hostId: userData.userId,
        players: [{ userId: userData.userId, name: userData.username, rating: myRating, isCpu: false }]
      });
    }
  };

  const createRoom = async () => {
    if (roomId) {
      await leaveRoomById(roomId, userData.userId);
      setRoomId(null); setRoomData(null);
    }
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    setIsRankMatch(false); setIsOnlineMode(true); setTotalMatches(5); setMySlot(0); setRoomId(`room_${code}`);
    await set(ref(rtdb, `rooms/room_${code}`), {
      roomId: `room_${code}`, code: code, type: 'room', totalMatches: 5, status: 'waiting', hostId: userData.userId,
      players: [{ userId: userData.userId, name: userData.username, rating: userData.rating5, isCpu: false }]
    });
    setCurrentScreen('waiting_room');
  };

  const joinRoomByCode = async () => {
    if (inputRoomCode.length !== 4) return alert('4桁のルーム番号を入力してください');
    const targetId = `room_${inputRoomCode}`;
    if (roomId && roomId !== targetId) {
      await leaveRoomById(roomId, userData.userId);
      setRoomId(null); setRoomData(null);
    }
    const snapshot = await get(ref(rtdb, `rooms/${targetId}`));
    if (!snapshot.exists()) return alert('該当する部屋が見つかりません');
    const rData = snapshot.val();
    const existingPlayers = (rData.players || []).filter(p => p.userId !== userData.userId);
    if (existingPlayers.length >= 4) return alert('部屋が満員です');

    setMySlot(existingPlayers.length); setIsRankMatch(false); setIsOnlineMode(true); setRoomId(targetId);
    setTotalMatches(rData.totalMatches || 5);
    const updatedPlayers = [...existingPlayers, { userId: userData.userId, name: userData.username, rating: userData.rating5, isCpu: false }];
    await update(ref(rtdb, `rooms/${targetId}`), { players: updatedPlayers });
    setCurrentScreen('waiting_room');
  };

  const startOnlineGameWithCpu = async () => {
    if (!roomId || !roomData) return;
    let currentPlayers = [...(roomData.players || [])];
    
    let availableAIList = [];
    const nowTime = new Date();
    const h = nowTime.getHours();
    const m = nowTime.getMinutes();
    const isRestTime = (h === 5 && m >= 29) || (h === 23 && m >= 29);

    if (roomData.type.startsWith('rank') && !isRestTime) {
      try {
        const snap = await getDocs(collection(db, 'users'));
        snap.forEach(d => {
          const data = d.data();
          if (data.isAIPlayer && data.status === 'online') availableAIList.push(data);
        });
      } catch(e) {}
    }

    availableAIList = availableAIList.filter(ai => !currentPlayers.some(p => p.userId === ai.userId));
    availableAIList = shuffle(availableAIList);

    let cpuCount = 1;
    const baseRating = currentPlayers[0]?.rating || userData.rating5;
    
    while (currentPlayers.length < 4) {
      if (roomData.type.startsWith('rank') && availableAIList.length > 0 && !isRestTime) {
        const ai = availableAIList.pop();
        const aiRating = totalMatches === 10 ? ai.rating10 : ai.rating5;
        const aiMaxRating = totalMatches === 10 ? ai.maxRating10 : ai.maxRating5;
        currentPlayers.push({ userId: ai.userId, name: ai.username, rating: aiRating, maxRating: aiMaxRating || aiRating, isCpu: true, isAIPlayer: true, isSuperAI: ai.isSuperAI || false, isUltraSuperAI: ai.isUltraSuperAI || false, isDoubleGrowthAI: ai.isDoubleGrowthAI || false, isAsnV2: ai.isAsnV2 || false });
        try { await setDoc(doc(db, 'users', ai.userId), { status: 'playing' }, { merge: true }); } catch(e){}
      } else {
        const tempCpuRating = generateCpuRating(baseRating);
        currentPlayers.push({ userId: `cpu_${cpuCount}`, name: `CPU ${cpuCount++}`, rating: tempCpuRating, maxRating: tempCpuRating, isCpu: true });
      }
    }
    
    await update(ref(rtdb, `rooms/${roomId}`), { players: currentPlayers });

    setTimeout(() => {
        executeStartOnlineMatch(roomId, currentPlayers);
    }, 1500);
  };

  const executeStartOnlineMatch = async (rId, playerList) => {
    const playerNames = playerList.map(p => p.name);
    const ratings = playerList.map(p => p.rating);
    
    await update(ref(rtdb, `rooms/${rId}`), { 
      status: 'playing', 
      players: playerList,
      gameState: {
         players: playerNames,
         playerRatings: ratings,
         totalMatches: totalMatches
      }
    });
    
    setPlayers(playerNames);
    setPlayerRatings(ratings);
    startNewGameSet(playerNames, isRankMatch, true);
  };

  useEffect(() => {
    if (isOnlineMode && isHost && roomId && currentScreen === 'game') {
      const currentPlayers = roomData?.players ? roomData.players.map(p => p.name) : players;
      const currentRatings = roomData?.players ? roomData.players.map(p => p.rating) : playerRatings;

      const stateToSync = {
        handsJSON: JSON.stringify(hands),
        turn, field: field || null, passed, rankingsThisMatch, fouledPlayers,
        isRevolution, is11Back, message, matchCount, totalMatches, scores, prevRanks,
        exchangePhase, exchangeCardsJSON: JSON.stringify(exchangeCards || {}),
        matchResultModal: matchResultModal || null,
        players: currentPlayers, 
        playerRatings: currentRatings
      };
      set(ref(rtdb, `rooms/${roomId}/gameState`), stateToSync);
    }
  }, [hands, turn, field, passed, rankingsThisMatch, fouledPlayers, isRevolution, is11Back, message, matchCount, totalMatches, scores, prevRanks, exchangePhase, exchangeCards, matchResultModal, players, playerRatings, isOnlineMode, isHost, roomId, currentScreen, roomData]);

  useEffect(() => {
    if (isOnlineMode && isHost && currentScreen === 'game' && roomData?.players && roomId) {
      roomData.players.forEach((p, idx) => {
        if (p && p.hasDisconnected && !fouledPlayers.includes(idx) && hands[idx].length > 0) {
           push(ref(rtdb, `rooms/${roomId}/requests`), { type: 'disconnect', playerIdx: idx, ts: Date.now() });
        }
      });
    }
  }, [isOnlineMode, isHost, currentScreen, roomData, fouledPlayers, hands, roomId]);

  useEffect(() => {
    if (isOnlineMode && !isHost && roomId && currentScreen === 'game') {
      const gsRef = ref(rtdb, `rooms/${roomId}/gameState`);
      const unsub = onValue(gsRef, (snap) => {
        const val = snap.val();
        if (val) {
          if (val.handsJSON) {
            try { setHands(JSON.parse(val.handsJSON)); } catch(e){}
          } else if (val.hands) {
            setHands([0, 1, 2, 3].map(i => val.hands[i] || []));
          }

          if (val.turn !== undefined) setTurn(val.turn);
          
          setField(val.hasOwnProperty('field') ? val.field : null);
          setPassed(val.passed || [false, false, false, false]);
          setRankingsThisMatch(val.rankingsThisMatch || []);
          setFouledPlayers(val.fouledPlayers || []);
          
          if (val.isRevolution !== undefined) setIsRevolution(val.isRevolution);
          if (val.is11Back !== undefined) setIs11Back(val.is11Back);
          if (val.message) setMessage(val.message);
          if (val.matchCount) setMatchCount(val.matchCount);
          if (val.totalMatches) setTotalMatches(val.totalMatches);
          if (val.scores) setScores([0, 1, 2, 3].map(i => val.scores && val.scores[i] !== undefined ? val.scores[i] : 0));
          if (val.prevRanks) setPrevRanks([0, 1, 2, 3].map(i => val.prevRanks && val.prevRanks[i] !== undefined ? val.prevRanks[i] : i));
          
          setExchangePhase(val.exchangePhase || false);

          if (val.exchangeCardsJSON) {
            try { setExchangeCards(JSON.parse(val.exchangeCardsJSON)); } catch(e){}
          } else {
            setExchangeCards(val.exchangeCards || {});
          }
          
          setMatchResultModal(val.hasOwnProperty('matchResultModal') ? val.matchResultModal : null);

          if (val.players && val.players.length === 4) setPlayers([0, 1, 2, 3].map(i => val.players[i] || `CPU ${i}`));
          if (val.playerRatings && val.playerRatings.length === 4) setPlayerRatings([0, 1, 2, 3].map(i => val.playerRatings[i] || 1000));

          if (val.gameOverData && !syncedGameOver) {
            setSyncedGameOver(true);
            finishGameSet(val.gameOverData.finalScores);
          }
        }
      });
      return () => off(gsRef);
    }
  }, [isOnlineMode, !isHost, roomId, currentScreen, syncedGameOver]);

  const [requestsQueue, setRequestsQueue] = useState([]);
  useEffect(() => {
    if (isOnlineMode && isHost && roomId) {
      const reqRef = ref(rtdb, `rooms/${roomId}/requests`);
      const unsub = onValue(reqRef, (snap) => {
        const val = snap.val();
        if (val) {
          const reqs = Object.keys(val).map(k => ({ id: k, ...val[k] })).sort((a,b) => a.ts - b.ts);
          setRequestsQueue(reqs);
        } else {
          setRequestsQueue([]);
        }
      });
      return () => off(reqRef);
    }
  }, [isOnlineMode, isHost, roomId]);

  const handleDisconnectPlayer = (playerIdx) => {
    let logs = [`⚠️ ${players[playerIdx]} が通信切断により最下位となりました`];
    
    const nextHands = [...hands];
    nextHands[playerIdx] = []; 
    setHands(nextHands);

    let newFouled = [...fouledPlayers];
    if (!newFouled.includes(playerIdx)) {
      newFouled.push(playerIdx);
      setFouledPlayers(newFouled);
    }
    
    setMessage(logs.join(' / '));

    const nextPassed = [...passed];
    // ★ エラー修正箇所
    advanceTurn(playerIdx, nextHands, rankingsThisMatch, newFouled, field, nextPassed);
  };

  useEffect(() => {
    if (isOnlineMode && isHost && requestsQueue.length > 0) {
      const req = requestsQueue[0];
      let reqCards = req.cards;
      if (req.cardsJSON) {
         try { reqCards = JSON.parse(req.cardsJSON); } catch(e){}
      }

      if (req.type === 'play') playCards(req.playerIdx, reqCards);
      else if (req.type === 'pass') passTurn(req.playerIdx);
      else if (req.type === 'exchange') setExchangeCards(prev => ({...prev, [req.playerIdx]: reqCards || []}));
      else if (req.type === 'disconnect') handleDisconnectPlayer(req.playerIdx);
      
      remove(ref(rtdb, `rooms/${roomId}/requests/${req.id}`));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestsQueue]);

  const startNewGameSet = (playerList = ['あなた', 'CPU 1', 'CPU 2', 'CPU 3'], isRank = false, isOnline = false) => {
    if (!isOnline) {
      setPlayerRatings([
        userData.rating5,
        generateCpuRating(userData.rating5),
        generateCpuRating(userData.rating5),
        generateCpuRating(userData.rating5)
      ]);
    }
    
    if (isRank) {
      localStorage.setItem('daifugo_penalty_flag', 'true');
    }
    
    setIsRankMatch(isRank); setIsOnlineMode(isOnline); setMatchCount(1);
    setScores([0, 0, 0, 0]); setPrevRanks([0, 1, 2, 3]); setSyncedGameOver(false);
    setCurrentScreen('game');
    startMatch(1, [0, 1, 2, 3], playerList);
  };

  const sortHand = (hand, isRev) => { hand.sort((a, b) => getCardStrength(a.num, isRev) - getCardStrength(b.num, isRev)); };

  const startMatch = (mCount, lastRanks, playerList = players) => {
    setIsRevolution(false); setIs11Back(false); setField(null);
    setPassed([false, false, false, false]); setRankingsThisMatch([]); 

    const disconnectedIdxs = [];
    if (isOnlineMode && roomData?.players) {
      roomData.players.forEach((p, i) => {
        if (p && p.hasDisconnected) disconnectedIdxs.push(i);
      });
    }
    setFouledPlayers(disconnectedIdxs);

    setMessage(`${mCount}試合目 開始！`);

    const fullDeck = shuffle(createDeck());
    const newHands = [[], [], [], []];
    
    const activeIdxs = [0, 1, 2, 3].filter(i => !disconnectedIdxs.includes(i));
    
    if (activeIdxs.length > 0) {
      for (let i = 0; i < fullDeck.length; i++) {
        newHands[activeIdxs[i % activeIdxs.length]].push(fullDeck[i]);
      }
    }

    for (let i = 0; i < 4; i++) sortHand(newHands[i], false);
    setHands(newHands);

    if (mCount > 1) {
      setExchangePhase(true); setExchangeCards({});
      setMessage('🔄 カード交換フェーズです');
    } else {
      setExchangePhase(false);
      let firstTurn = lastRanks[3];
      
      if (newHands[firstTurn].length === 0 && activeIdxs.length > 0) {
         while (newHands[firstTurn].length === 0) {
            firstTurn = (firstTurn + 1) % 4;
         }
      }
      
      const d3Player = newHands.findIndex(h => h.some(c => c.suit === '♦' && c.num === 3));
      if (d3Player !== -1) firstTurn = d3Player;
      setTurn(firstTurn);
    }
  };

  const getExchangeCount = (idx) => {
    const rank = prevRanks.indexOf(idx);
    let oppRank = 3 - rank; 
    const oppIdx = prevRanks[oppRank];
    const isOppDisconnected = isOnlineMode && roomData?.players?.[oppIdx]?.hasDisconnected;
    if (isOppDisconnected || (isOnlineMode && roomData?.players?.[idx]?.hasDisconnected)) return 0;
    return (rank === 0 || rank === 3) ? 2 : (rank === 1 || rank === 2) ? 1 : 0;
  };

  useEffect(() => {
    if (exchangePhase && (!isOnlineMode || isHost)) {
      const newEx = { ...exchangeCards };
      let changed = false;
      for (let idx = 0; idx < 4; idx++) {
        const isCpuSlot = isOnlineMode ? roomData?.players?.[idx]?.isCpu : (idx !== 0);
        const isDisconnected = isOnlineMode && roomData?.players?.[idx]?.hasDisconnected;

        if ((isCpuSlot || isDisconnected) && !newEx[idx]) {
          const reqCount = getExchangeCount(idx);
          if (reqCount === 0 || hands[idx].length === 0) {
            newEx[idx] = [];
          } else {
            const rank = prevRanks.indexOf(idx);
            newEx[idx] = (rank === 0 || rank === 1) ? hands[idx].slice(0, reqCount) : hands[idx].slice(-reqCount);
          }
          changed = true;
        }
      }
      if (changed) setExchangeCards(newEx);
    }
  }, [exchangePhase, hands, prevRanks, exchangeCards, isOnlineMode, isHost, roomData]);

  useEffect(() => {
    if (exchangePhase && Object.keys(exchangeCards).length === 4) {
      if (!isOnlineMode || isHost) {
        const nextHands = [...hands];
        const daifugo = prevRanks[0], fugo = prevRanks[1], hinmin = prevRanks[2], daihinmin = prevRanks[3];
        nextHands[daifugo] = nextHands[daifugo].filter(c => !exchangeCards[daifugo].some(ec => ec.id === c.id));
        nextHands[fugo] = nextHands[fugo].filter(c => !exchangeCards[fugo].some(ec => ec.id === c.id));
        nextHands[hinmin] = nextHands[hinmin].filter(c => !exchangeCards[hinmin].some(ec => ec.id === c.id));
        nextHands[daihinmin] = nextHands[daihinmin].filter(c => !exchangeCards[daihinmin].some(ec => ec.id === c.id));
        nextHands[daifugo].push(...exchangeCards[daihinmin]);
        nextHands[fugo].push(...exchangeCards[hinmin]);
        nextHands[hinmin].push(...exchangeCards[fugo]);
        nextHands[daihinmin].push(...exchangeCards[daifugo]);

        for (let i = 0; i < 4; i++) sortHand(nextHands[i], false);
        setHands(nextHands); setExchangePhase(false); setExchangeCards({}); setTurn(daihinmin);
        setMessage('交換が完了しました。ゲーム再開！');
      }
    }
  }, [exchangePhase, exchangeCards, hands, prevRanks, isOnlineMode, isHost]);

  const handleExchangeSubmit = () => {
    if (isProcessing) return;
    setIsProcessing(true);

    const reqCount = getExchangeCount(mySlot);
    let cardsToSubmit = selectedCards;
    const myRank = prevRanks.indexOf(mySlot);
    if (myRank === 2 || myRank === 3) cardsToSubmit = hands[mySlot].slice(-reqCount);

    if (isOnlineMode && !isHost) {
      push(ref(rtdb, `rooms/${roomId}/requests`), { type: 'exchange', playerIdx: mySlot, cardsJSON: JSON.stringify(cardsToSubmit), ts: Date.now() });
    } else {
      setExchangeCards(prev => ({...prev, [mySlot]: cardsToSubmit}));
    }
    setSelectedCards([]);
  };

  const isValidPlay = (cards, currentField, isRev) => {
    if (cards.length === 0) return false;
    
    const nonJokers = cards.filter(c => c.num !== 0);
    const isSameNum = nonJokers.length === 0 || nonJokers.every(c => c.num === nonJokers[0].num);
    const isSeq = checkSequence(cards);

    if (!isSameNum && !isSeq) return false;

    const playedStrength = calcPlayedStrength(cards, isRev);

    if (!currentField) return true;

    if (currentField.cards.length === 1 && currentField.cards[0].num === 0) {
      if (cards.length === 1 && cards[0].suit === '♠' && cards[0].num === 3) return true;
    }

    if (cards.length !== currentField.cards.length) return false;
    
    const fieldIsSeq = currentField.isSeq || false;
    if (cards.length >= 3 && isSeq !== fieldIsSeq) return false;

    if (currentField.isBound) {
      const prevSuits = currentField.suits || [];
      let isSameSuit = true;
      let tempPrevSuits = [...prevSuits];
      const newSuits = nonJokers.map(c => c.suit).sort();
      for (let s of newSuits) {
        const idx = tempPrevSuits.indexOf(s);
        if (idx !== -1) {
          tempPrevSuits.splice(idx, 1);
        } else {
          isSameSuit = false;
          break;
        }
      }
      if (!isSameSuit) return false;
    }

    return playedStrength > currentField.strength;
  };

  const playCards = (playerIdx, cards) => {
    let logs = [`${players[playerIdx]}がカードを出しました`];

    const isSeq = checkSequence(cards);

    let nextRevolution = isRevolution;
    if (cards.length >= 4) { nextRevolution = !isRevolution; setIsRevolution(nextRevolution); logs.push('🔥 革命発生！'); }
    
    let next11Back = is11Back;
    if (!isSeq && cards.some(c => c.num === 11)) { next11Back = true; setIs11Back(true); logs.push('↺ 11バック発生！'); }

    const effectiveRev = nextRevolution !== next11Back;
    const strength = calcPlayedStrength(cards, effectiveRev);
    const nonJokers = cards.filter(c => c.num !== 0);

    let newSuitStreak = 1;
    let newSuits = nonJokers.map(c => c.suit).sort();
    let newIsBound = false;

    if (field) {
      const prevSuits = field.suits || [];
      let isSameSuit = true;
      let tempPrevSuits = [...prevSuits];
      for (let s of newSuits) {
        const idx = tempPrevSuits.indexOf(s);
        if (idx !== -1) {
          tempPrevSuits.splice(idx, 1);
        } else {
          isSameSuit = false;
          break;
        }
      }

      if (isSameSuit && field.cards.length === cards.length && prevSuits.length > 0) {
        newSuitStreak = (field.suitStreak || 1) + 1;
        newSuits = prevSuits; 
      }

      if (field.isBound || newSuitStreak >= 3) {
        newIsBound = true;
      }
      
      if (!field.isBound && newIsBound) {
        logs.push('🔒 スート縛り発生！');
      }
    } else {
      if (newSuits.length === 0 && cards.some(c => c.num === 0)) {
         newSuits = ['🃏']; 
      }
    }

    const newHand = hands[playerIdx].filter(c => !cards.some(sc => sc.id === c.id));
    const nextHands = [...hands];
    nextHands[playerIdx] = newHand;
    if (cards.length >= 4) { for (let i = 0; i < 4; i++) sortHand(nextHands[i], effectiveRev); }
    setHands(nextHands); setSelectedCards([]);

    const newField = { 
      cards, 
      strength, 
      count: cards.length, 
      playedBy: playerIdx, 
      isSeq,
      suits: newSuits,
      suitStreak: newSuitStreak,
      isBound: newIsBound
    };
    setField(newField);
    
    const nextPassed = [false, false, false, false];
    setPassed(nextPassed);

    let isMiyakoOchi = false;
    if (matchCount > 1 && rankingsThisMatch.length === 0 && fouledPlayers.length === 0) {
      if (playerIdx !== prevRanks[0]) isMiyakoOchi = true;
    }

    let newRankings = [...rankingsThisMatch];
    let newFouled = [...fouledPlayers];

    const isFinished = newHand.length === 0;

    if (isFinished) {
      const contains8 = !isSeq && cards.some(c => c.num === 8);
      const containsJoker = cards.some(c => c.num === 0);
      const containsForbiddenStrong = effectiveRev ? cards.some(c => c.num === 3) : cards.some(c => c.num === 2);
      const isForbiddenFinish = contains8 || containsJoker || containsForbiddenStrong;

      if (isForbiddenFinish) {
        newFouled.push(playerIdx); setFouledPlayers(newFouled);
        logs.push(`⚠️ 禁止上がり発生！ ${players[playerIdx]} は反則負け（最下位）となりました！`);
      } else {
        newRankings.push(playerIdx); setRankingsThisMatch(newRankings);
        logs.push(`🎉 ${players[playerIdx]}が ${newRankings.length}位で上がり！`);
      }

      if (isMiyakoOchi) {
        const prevDaifugo = prevRanks[0];
        if (!newRankings.includes(prevDaifugo) && !newFouled.includes(prevDaifugo)) {
          logs.push(`⚠️ 都落ち！ 前の大富豪は強制最下位！`);
          nextHands[prevDaifugo] = []; setHands(nextHands);
          newFouled.push(prevDaifugo); setFouledPlayers([...newFouled]);
        }
      }
    }
    
    setMessage(logs.join(' / '));

    const isSpade3Return = field && field.cards.length === 1 && field.cards[0].num === 0 && cards.length === 1 && cards[0].suit === '♠' && cards[0].num === 3;

    if ((!isSeq && cards.some(c => c.num === 8)) || isSpade3Return) {
      const actionMsg = isSpade3Return ? '♠️ スペ3返し！' : '✂️ 8切り！';
      if (isFinished) {
        logs.push(actionMsg);
        setMessage(logs.join(' / '));
        clearField(playerIdx, nextHands, newRankings, newFouled);
        advanceTurn(playerIdx, nextHands, newRankings, newFouled, null, nextPassed);
        return;
      } else {
        setMessage(logs.join(' / ') + ` / ${actionMsg} ターン継続`);
        clearField(playerIdx, nextHands, newRankings, newFouled); 
        return;
      }
    }
    
    advanceTurn(playerIdx, nextHands, newRankings, newFouled, newField, nextPassed);
  };

  const passTurn = (playerIdx) => {
    const newPassed = [...passed]; newPassed[playerIdx] = true;
    setPassed(newPassed); setMessage(`${players[playerIdx]}がパスしました`);
    advanceTurn(playerIdx, hands, rankingsThisMatch, fouledPlayers, field, newPassed);
  };

  const clearField = (nextTurnPlayer, currentHands, currentRankings, currentFouled = fouledPlayers) => {
    setField(null); setIs11Back(false); setPassed([false, false, false, false]);
    let next = nextTurnPlayer;
    while (currentHands[next].length === 0 && (currentRankings.length + currentFouled.length) < 3) {
      next = (next + 1) % 4;
    }
    setTurn(next);
  };

  const advanceTurn = (currentIdx, currentHands, currentRankings, currentFouled = fouledPlayers, currentField, currentPassed = passed) => {
    // ★ エラー修正: currentHands[i] のように正しくアクセスする
    const activePlayers = [0, 1, 2, 3].filter(i => currentHands[i].length > 0);
    if (currentRankings.length + currentFouled.length >= 3 || activePlayers.length <= 1) {
      endMatch(currentRankings, currentHands, currentFouled); return;
    }

    const activePassed = activePlayers.filter(i => currentPassed[i]);
    if (currentField && activePlayers.includes(currentField.playedBy)) {
      const othersCount = activePlayers.filter(i => i !== currentField.playedBy).length;
      const othersPassedCount = activePassed.filter(i => i !== currentField.playedBy).length;
      if (othersPassedCount >= othersCount) {
        clearField(currentField.playedBy, currentHands, currentRankings, currentFouled); return;
      }
    }
    if (activePassed.length >= activePlayers.length) {
      let next = (currentIdx + 1) % 4;
      clearField(currentHands, currentRankings, currentFouled); return;
    }

    let next = (currentIdx + 1) % 4;
    while (currentHands[next].length === 0) { next = (next + 1) % 4; }
    setTurn(next);
  };

  const timeoutRef = useRef();
  timeoutRef.current = async () => {
    setShowConfirmHomeModal(false);
    localStorage.removeItem('daifugo_penalty_flag');

    const mode = isRankMatch ? (totalMatches === 10 ? 'rank10' : 'rank5') : (isOnlineMode ? 'room' : 'cpu');
    const newStats = userData.stats ? JSON.parse(JSON.stringify(userData.stats)) : { rank5: { wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, disconnects: 0 }, rank10: { wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, disconnects: 0 }, room: { wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, disconnects: 0 }, cpu: { wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, disconnects: 0 } };
    
    if (newStats[mode]) {
        newStats[mode].disconnects = (newStats[mode].disconnects || 0) + 1;
        newStats[mode].currentWinStreak = 0;
    }

    if (isOnlineMode && roomId && roomData) {
      const updatedPlayers = [...(roomData.players || [])];
      if (updatedPlayers[mySlot]) {
        updatedPlayers[mySlot] = { ...updatedPlayers[mySlot], hasDisconnected: true };
      }
      await update(ref(rtdb, `rooms/${roomId}`), { players: updatedPlayers });

      let newRating5 = userData.rating5;
      let newRating10 = userData.rating10;
      if (isRankMatch) {
        if (totalMatches === 10) {
           newRating10 = Math.max(0, userData.rating10 - 45);
        } else {
           newRating5 = Math.max(0, userData.rating5 - 15);
        }
      }
      saveUserData({ ...userData, rating5: newRating5, rating10: newRating10, stats: newStats });
      setRoomId(null); setRoomData(null); setMySlot(0);
    } else {
      saveUserData({ ...userData, stats: newStats });
    }
    setCurrentScreen('menu');
    setShowDisconnectPenaltyModal(true);
  };

  useEffect(() => {
    if (currentScreen === 'game' && isRankMatch && !exchangePhase && !matchResultModal && !gameResultModal) {
      if (turn === mySlot) {
        const timerId = setInterval(() => {
          setTurnTimer((prev) => {
            if (prev <= 1) {
              clearInterval(timerId);
              if (timeoutRef.current) timeoutRef.current();
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
        return () => clearInterval(timerId);
      }
    }
  }, [currentScreen, isRankMatch, turn, mySlot, exchangePhase, matchResultModal, gameResultModal]);

  useEffect(() => {
    setTurnTimer(30);
  }, [turn, field, exchangePhase, matchCount]);

  // CPU自動打札
  useEffect(() => {
    if (currentScreen !== 'game' || matchResultModal || gameResultModal || exchangePhase) return;
    const isCurrentCpuSlot = isOnlineMode ? (isHost && roomData?.players && roomData.players[turn]?.isCpu) : (turn !== 0);

    if (isCurrentCpuSlot) {
      const cpuHand = hands[turn];
      if (!cpuHand || cpuHand.length === 0) return;
      
      const isAIPlayer = isOnlineMode && roomData?.players && roomData.players[turn]?.isAIPlayer;
      const isSuperAI = isOnlineMode && roomData?.players && roomData.players[turn]?.isSuperAI;
      const isUltraSuperAI = isOnlineMode && roomData?.players && roomData.players[turn]?.isUltraSuperAI;
      const isDoubleGrowthAI = isOnlineMode && roomData?.players && roomData.players[turn]?.isDoubleGrowthAI;
      const isAsnV2 = isOnlineMode && roomData?.players && roomData.players[turn]?.isAsnV2;
      
      let cpuThinkRating = playerRatings[turn];
      if (isOnlineMode && roomData?.players && roomData.players[turn]?.maxRating) {
        cpuThinkRating = roomData.players[turn].maxRating;
      }
      
      const move = findBestCpuMove(cpuHand, field, isReversedEffective, cpuThinkRating, hands, turn, isAIPlayer, isSuperAI, isUltraSuperAI, isDoubleGrowthAI, isAsnV2, aiLearningData);
      
      const thinkTime = 400;

      const cpuTimer = setTimeout(() => {
        if (move) playCards(turn, move); else passTurn(turn);
      }, thinkTime);
      return () => clearTimeout(cpuTimer);
    }
  }, [turn, field, hands, currentScreen, isReversedEffective, matchResultModal, roomData, isOnlineMode, isHost, exchangePhase, playerRatings, aiLearningData]);

  const findBestCpuMove = (hand, currentField, isRev, cpuRating, allHands = [], currentTurn = 0, isAIPlayer = false, isSuperAI = false, isUltraSuperAI = false, isDoubleGrowthAI = false, isAsnV2 = false, learningData = []) => {
    const sorted = [...hand].sort((a, b) => getCardStrength(a.num, isRev) - getCardStrength(b.num, isRev));
    
    let someoneIsFinishing = false;
    if (allHands.length > 0) {
      for (let i=0; i<4; i++) {
        if (i !== currentTurn && allHands[i].length > 0 && allHands[i].length <= 2) {
          someoneIsFinishing = true;
        }
      }
    }

    const effectiveRating = isAsnV2 ? 3000 : (isDoubleGrowthAI ? (2000 + Math.max(0, cpuRating - 1000) * 4) : (isUltraSuperAI ? (3000 + cpuRating * 3) : (isSuperAI ? 2000 : (isAIPlayer ? cpuRating * 2 : cpuRating))));
    
    const isUltraAI_level = effectiveRating >= 2000;
    const isEnhancedAI = effectiveRating >= 1000; 
    const isSmart = isUltraAI_level || isEnhancedAI || ((Math.random() * 1000) < effectiveRating);
    const isVerySmart = isUltraAI_level || isEnhancedAI || (isSmart && ((Math.random() * 1000) < effectiveRating));

    const isForbiddenFinish = (cards) => {
      if (cards.length !== hand.length) return false;
      const isSeq = checkSequence(cards);
      const contains8 = !isSeq && cards.some(c => c.num === 8);
      const containsJoker = cards.some(c => c.num === 0);
      const containsForbiddenStrong = isRev ? cards.some(c => c.num === 3) : cards.some(c => c.num === 2);
      return contains8 || containsJoker || containsForbiddenStrong;
    };

    const leavesOnlyForbidden = (cards) => {
       const remaining = hand.filter(c => !cards.some(sc => sc.id === c.id));
       if (remaining.length === 0) return false;
       return remaining.every(c => c.num === 8 || c.num === 0 || (isRev ? c.num === 3 : c.num === 2));
    };

    const jokerCard = sorted.find(c => c.num === 0);
    const nonJokers = sorted.filter(c => c.num !== 0);

    const groups = {};
    nonJokers.forEach(c => {
      groups[c.num] = groups[c.num] || [];
      groups[c.num].push(c);
    });

    const getSequences = () => {
      let seqs = [];
      SUITS.forEach(s => {
        const suitCards = nonJokers.filter(c => c.suit === s).sort((a,b) => getCardStrength(a.num, false) - getCardStrength(b.num, false));
        for (let len = 3; len <= suitCards.length; len++) {
          for (let i = 0; i <= suitCards.length - len; i++) {
            const sub = suitCards.slice(i, i + len);
            if (checkSequence(sub)) seqs.push(sub);
          }
        }
        if (jokerCard) {
          for (let len = 2; len <= suitCards.length; len++) {
            for (let i = 0; i <= suitCards.length - len; i++) {
              const sub = suitCards.slice(i, i + len);
              const diff = getCardStrength(sub[sub.length-1].num, false) - getCardStrength(sub[0].num, false);
              if (diff === len) seqs.push([...sub, jokerCard]);
            }
          }
        }
      });
      return seqs;
    };

    let options = [];

    if (!currentField) {
      sorted.forEach(c => options.push([c]));
      for (let num in groups) {
        for (let i = 2; i <= groups[num].length; i++) {
          options.push(groups[num].slice(0, i));
        }
      }
      if (jokerCard) {
        for (let num in groups) {
          for (let i = 1; i <= groups[num].length; i++) {
            options.push([...groups[num].slice(0, i), jokerCard]);
          }
        }
      }
      options.push(...getSequences());
    } else {
      const reqCount = currentField.cards.length;
      const isSeqField = currentField.isSeq;

      if (reqCount === 1 && currentField.cards[0].num === 0) {
        const sp3 = sorted.find(c => c.suit === '♠' && c.num === 3);
        if (sp3) options.push([sp3]);
      }

      if (isSeqField) {
        const seqs = getSequences().filter(seq => seq.length === reqCount);
        for (let seq of seqs) {
          if (isValidPlay(seq, currentField, isRev)) options.push(seq);
        }
      } else {
        if (reqCount === 1) {
          sorted.forEach(c => {
            if (isValidPlay([c], currentField, isRev)) options.push([c]);
          });
        } else {
          for (let num in groups) {
            if (groups[num].length >= reqCount) {
              const combo = groups[num].slice(0, reqCount);
              if (isValidPlay(combo, currentField, isRev)) options.push(combo);
            }
          }
          if (jokerCard && reqCount > 1) {
            for (let num in groups) {
              if (groups[num].length >= reqCount - 1) {
                const combo = [...groups[num].slice(0, reqCount - 1), jokerCard];
                if (isValidPlay(combo, currentField, isRev)) options.push(combo);
              }
            }
          }
        }
      }
    }

    if (options.length === 0) return null;

    const uniqueOptions = [];
    const seenMap = new Set();
    for (let opt of options) {
      const key = opt.map(c => c.id).sort().join('-');
      if (!seenMap.has(key)) {
        seenMap.add(key);
        uniqueOptions.push(opt);
      }
    }

    let safeOptions = uniqueOptions.filter(combo => !isForbiddenFinish(combo));
    let bestOptions = safeOptions.filter(combo => !leavesOnlyForbidden(combo));
    let availableOptions = bestOptions.length > 0 ? bestOptions : (safeOptions.length > 0 ? safeOptions : uniqueOptions);

    if (isAsnV2 && availableOptions.length > 0) {
      availableOptions.sort((a, b) => {
        const evalMove = (move) => {
          let score = 0;
          const remHand = hand.filter(c => !move.some(mc => mc.id === c.id));
          
          if (remHand.length === 0) return 10000;
          
          const remNums = new Set(remHand.filter(c => c.num !== 0).map(c => c.num));
          score -= remNums.size * 10;
          
          if (remHand.length > 0) {
            const avgStrength = remHand.reduce((sum, c) => sum + getCardStrength(c.num, isRev), 0) / remHand.length;
            score += avgStrength;
          }
          
          const currentFieldStrength = currentField ? currentField.strength : 0;
          const similarPlays = learningData.filter(d => Math.abs(d.fieldStrength - currentFieldStrength) <= 2 && Math.abs(d.remHandCount - hand.length) <= 2);
          if (similarPlays.length > 0) {
            const avgPlayedStrength = similarPlays.reduce((sum, d) => sum + d.playedStrength, 0) / similarPlays.length;
            const thisMoveStrength = calcPlayedStrength(move, isRev);
            score -= Math.abs(thisMoveStrength - avgPlayedStrength) * 2;
          }
          
          return score;
        };
        return evalMove(b) - evalMove(a);
      });
      return availableOptions[0];
    }

    if (isSmart && availableOptions.length > 0) {
      for (let move of availableOptions) {
        const remHand = hand.filter(c => !move.some(mc => mc.id === c.id));
        if (remHand.length === 0) {
          if (!isForbiddenFinish(move)) return move; 
        } else {
          const remNonJokers = remHand.filter(c => c.num !== 0);
          const remNums = new Set(remNonJokers.map(c => c.num));
          
          if (remNums.size === 1 || (checkSequence(remHand) && remHand.length >= 3)) {
            const checkMove = remHand;
            if (!isForbiddenFinish(checkMove)) {
              return move; 
            }
          }
        }
      }
    }

    if (isUltraAI_level || isEnhancedAI) {
      const eights = availableOptions.filter(combo => !checkSequence(combo) && combo.some(c => c.num === 8));
      
      if (eights.length > 0) {
         for (let eightMove of eights) {
            const remHand = hand.filter(c => !eightMove.some(mc => mc.id === c.id));
            if (remHand.length === 0) continue; 
            const remNonJokers = remHand.filter(c => c.num !== 0);
            const remNums = new Set(remNonJokers.map(c => c.num));
            if (remNums.size === 1 || (checkSequence(remHand) && remHand.length >= 3)) {
               return eightMove; 
            }
         }
      }

      if (hand.length <= 4 && eights.length > 0 && !someoneIsFinishing) {
          return eights[0];
      }

      if (someoneIsFinishing) {
        availableOptions.sort((a, b) => calcPlayedStrength(b, isRev) - calcPlayedStrength(a, isRev));
        if (eights.length > 0) return eights[eights.length - 1]; 
        return availableOptions[0]; 
      } else {
        availableOptions.sort((a, b) => calcPlayedStrength(a, isRev) - calcPlayedStrength(b, isRev));
        const noSpecials = availableOptions.filter(combo => {
          const isSeq = checkSequence(combo);
          if (isSeq) return !combo.some(c => c.num === 0 || (isRev ? c.num===3 : c.num===2) || (isUltraAI_level && combo.length >= 4));
          return !combo.some(c => c.num === 8 || c.num === 11 || c.num === 0 || (isRev ? c.num===3 : c.num===2) || (isUltraAI_level && combo.length >= 4));
        });
        
        if (!currentField) {
           const multiples = noSpecials.filter(combo => combo.length > 1);
           if (multiples.length > 0) return multiples[multiples.length - 1];
           const singlesNoPair = noSpecials.filter(combo => combo.length === 1 && groups[combo[0].num]?.length === 1);
           if (singlesNoPair.length > 0) return singlesNoPair[0];
        }
        
        if (noSpecials.length > 0) return noSpecials[0];
        return availableOptions[0];
      }
    } else if (isVerySmart || isSmart) {
      availableOptions.sort((a, b) => calcPlayedStrength(a, isRev) - calcPlayedStrength(b, isRev));
      const noSpecials = availableOptions.filter(combo => {
        const isSeq = checkSequence(combo);
        if (isSeq) return !combo.some(c => c.num === 0);
        return !combo.some(c => c.num === 8 || c.num === 0);
      });
      
      if (!currentField) {
         const multiples = noSpecials.filter(combo => combo.length > 1);
         if (multiples.length > 0) return multiples[multiples.length - 1];
         const singlesNoPair = noSpecials.filter(combo => combo.length === 1 && groups[combo[0].num]?.length === 1);
         if (singlesNoPair.length > 0) return singlesNoPair[0];
      }
      
      if (noSpecials.length > 0) return noSpecials[0];
      return availableOptions[0];
    }

    availableOptions.sort((a, b) => calcPlayedStrength(a, isRev) - calcPlayedStrength(b, isRev));
    return availableOptions[0];
  };

  const endMatch = (finalRankings, finalHands, currentFouled = fouledPlayers) => {
    const remaining = [0, 1, 2, 3].filter(i => !finalRankings.includes(i) && !currentFouled.includes(i));
    const fullRankings = [...finalRankings, ...remaining, ...[...currentFouled].reverse()];
    
    const pts = [2, 1, -1, -2];
    const newScores = [...scores];
    fullRankings.forEach((playerIdx, rank) => { newScores[playerIdx] += pts[rank]; });

    setScores(newScores); setPrevRanks(fullRankings);
    
    if (matchCount < totalMatches) {
      setMatchResultModal({ match: matchCount, rankings: fullRankings, scores: newScores });
    } else {
      if (isOnlineMode && isHost && roomId) {
        update(ref(rtdb, `rooms/${roomId}/gameState`), { gameOverData: { finalScores: newScores } });
      }
      finishGameSet(newScores);
    }
  };

  const finishGameSet = (finalScores) => {
    localStorage.removeItem('daifugo_penalty_flag');

    const playerIndices = [0, 1, 2, 3];
    playerIndices.sort((a, b) => finalScores[b] - finalScores[a]);

    const myFinalRank = playerIndices.indexOf(mySlot);
    
    const mode = isRankMatch ? (totalMatches === 10 ? 'rank10' : 'rank5') : (isOnlineMode ? 'room' : 'cpu');
    const newStats = userData.stats ? JSON.parse(JSON.stringify(userData.stats)) : { rank5: { wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, disconnects: 0 }, rank10: { wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, disconnects: 0 }, room: { wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, disconnects: 0 }, cpu: { wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, disconnects: 0 } };

    if (!newStats[mode]) newStats[mode] = { wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, disconnects: 0 };
    
    newStats[mode].wins[myFinalRank] += 1;
    newStats[mode].totalGames += 1;
    newStats[mode].currentWinStreak = (myFinalRank === 0) ? newStats[mode].currentWinStreak + 1 : 0;
    newStats[mode].maxWinStreak = Math.max(newStats[mode].maxWinStreak, newStats[mode].currentWinStreak);

    let ratingChange = 0; 
    let newRating5 = userData.rating5;
    let newRating10 = userData.rating10;
    let newMaxRating5 = userData.maxRating5;
    let newMaxRating10 = userData.maxRating10;

    if (isRankMatch) {
      if (totalMatches === 10) {
        const safeMyRating = typeof userData.rating10 === 'number' && !isNaN(userData.rating10) ? userData.rating10 : 1000;
        ratingChange = calcRating(safeMyRating, playerRatings, myFinalRank, playerIndices); // is10Matches引数は削除（同等にするため）
        newRating10 = Math.max(0, safeMyRating + ratingChange);
        newMaxRating10 = Math.max(userData.maxRating10, newRating10);
      } else {
        const safeMyRating = typeof userData.rating5 === 'number' && !isNaN(userData.rating5) ? userData.rating5 : 1000;
        ratingChange = calcRating(safeMyRating, playerRatings, myFinalRank, playerIndices);
        newRating5 = Math.max(0, safeMyRating + ratingChange);
        newMaxRating5 = Math.max(userData.maxRating5, newRating5);
      }
    }

    const updatedUser = {
      ...userData, 
      rating5: newRating5, 
      maxRating5: newMaxRating5,
      rating10: newRating10,
      maxRating10: newMaxRating10,
      stats: newStats
    };
    saveUserData(updatedUser);

    setGameResultModal({ finalRankings: playerIndices, scores: finalScores, ratingChange, newRating: totalMatches === 10 ? newRating10 : newRating5 });

    if (isOnlineMode && isHost && roomData && isRankMatch) {
      const updateAIs = async () => {
        for (let i = 0; i < 4; i++) {
          const p = roomData.players[i];
          if (p && p.isAIPlayer) {
            try {
              const aiDocRef = doc(db, 'users', p.userId);
              const aiSnap = await getDoc(aiDocRef);
              if (aiSnap.exists()) {
                const aiData = aiSnap.data();
                const aiRank = playerIndices.indexOf(i); 
                
                const ratingKey = totalMatches === 10 ? 'rating10' : 'rating5';
                const maxRatingKey = totalMatches === 10 ? 'maxRating10' : 'maxRating5';
                const modeKey = totalMatches === 10 ? 'rank10' : 'rank5';

                const safeOldRating = typeof aiData[ratingKey] === 'number' && !isNaN(aiData[ratingKey]) ? aiData[ratingKey] : 1000;
                let aiChange = calcRating(safeOldRating, playerRatings, aiRank, playerIndices);
                
                if ((aiData.isDoubleGrowthAI || aiData.isAsnV2) && aiChange > 0) {
                    aiChange *= 2;
                }

                const aiNewRating = Math.max(0, safeOldRating + aiChange);
                
                if (!aiData.stats) aiData.stats = {};
                if (!aiData.stats[modeKey]) aiData.stats[modeKey] = { wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0 };

                aiData.stats[modeKey].wins[aiRank] += 1;
                aiData.stats[modeKey].totalGames += 1;
                const aiNewStreak = (aiRank === 0) ? (aiData.stats[modeKey].currentWinStreak || 0) + 1 : 0;
                
                const nowTime = new Date();
                const h = nowTime.getHours();
                const m = nowTime.getMinutes();
                const isRestTime = (h === 5 && m >= 29) || (h === 23 && m >= 29);
                const newStatus = isRestTime ? 'offline' : (Math.random() < 0.8 ? 'online' : 'offline');

                await setDoc(aiDocRef, {
                  ...aiData,
                  [ratingKey]: aiNewRating,
                  [maxRatingKey]: Math.max(aiData[maxRatingKey] || 0, aiNewRating),
                  stats: {
                     ...aiData.stats,
                     [modeKey]: {
                        ...aiData.stats[modeKey],
                        currentWinStreak: aiNewStreak,
                        maxWinStreak: Math.max(aiData.stats[modeKey].maxWinStreak || 0, aiNewStreak)
                     }
                  },
                  status: newStatus,
                  updatedAt: Date.now()
                }, { merge: true });
              }
            } catch(e) {}
          }
        }
      };
      updateAIs();
    }
  };

  const handleFinishGameAndLeave = async () => {
    setGameResultModal(null);
    if (isOnlineMode) await handleLeaveRoom();
    setCurrentScreen('menu');
  };

  const handleConfirmReturnHome = async () => {
    setShowConfirmHomeModal(false);
    
    localStorage.removeItem('daifugo_penalty_flag');

    const mode = isRankMatch ? (totalMatches === 10 ? 'rank10' : 'rank5') : (isOnlineMode ? 'room' : 'cpu');
    const newStats = userData.stats ? JSON.parse(JSON.stringify(userData.stats)) : { rank5: { wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, disconnects: 0 }, rank10: { wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, disconnects: 0 }, room: { wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, disconnects: 0 }, cpu: { wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, disconnects: 0 } };
    
    if (newStats[mode]) {
        newStats[mode].disconnects = (newStats[mode].disconnects || 0) + 1;
        newStats[mode].currentWinStreak = 0;
    }

    if (isOnlineMode && roomId && roomData) {
      const updatedPlayers = [...(roomData.players || [])];
      if (updatedPlayers[mySlot]) {
        updatedPlayers[mySlot] = { ...updatedPlayers[mySlot], hasDisconnected: true };
      }
      await update(ref(rtdb, `rooms/${roomId}`), { players: updatedPlayers });

      let newRating5 = userData.rating5;
      let newRating10 = userData.rating10;
      if (isRankMatch) {
        const penaltyAmount = totalMatches === 10 ? 45 : 15;
        if (totalMatches === 10) {
           newRating10 = Math.max(0, userData.rating10 - penaltyAmount);
        } else {
           newRating5 = Math.max(0, userData.rating5 - penaltyAmount);
        }
      }
      saveUserData({ ...userData, rating5: newRating5, rating10: newRating10, stats: newStats });
      setRoomId(null); setRoomData(null); setMySlot(0);
    } else {
      saveUserData({ ...userData, stats: newStats });
    }
    setCurrentScreen('menu');
  };

  const toggleSelectCard = (card) => {
    if (selectedCards.some(c => c.id === card.id)) setSelectedCards(selectedCards.filter(c => c.id !== card.id));
    else setSelectedCards([...selectedCards, card]);
  };

  // ★ Ver3.3.4 二重送信防止（連打対策）のため isProcessing でガードする
  const handleUserPlay = () => {
    if (isProcessing) return;

    if (isValidPlay(selectedCards, field, isReversedEffective)) {
      setIsProcessing(true); // 処理中フラグを立てる
      try {
        push(ref(rtdb, 'ai_learning/tactics'), {
          fieldStrength: field ? field.strength : 0,
          fieldCount: field ? field.count : 0,
          playedStrength: calcPlayedStrength(selectedCards, isReversedEffective),
          playedCount: selectedCards.length,
          remHandCount: hands[mySlot].length - selectedCards.length,
          timestamp: Date.now()
        });
      } catch(e) {}

      if (isOnlineMode && !isHost) {
        push(ref(rtdb, `rooms/${roomId}/requests`), { type: 'play', playerIdx: mySlot, cardsJSON: JSON.stringify(selectedCards), ts: Date.now() });
        setSelectedCards([]);
      } else {
        playCards(mySlot, selectedCards);
      }
    } else { alert('そのカードは出せません！'); }
  };

  const handleUserPass = () => {
    if (isProcessing) return;
    setIsProcessing(true); // 処理中フラグを立てる

    if (isOnlineMode && !isHost) {
      push(ref(rtdb, `rooms/${roomId}/requests`), { type: 'pass', playerIdx: mySlot, ts: Date.now() });
    } else {
      passTurn(mySlot);
    }
  };

  const fetchFriendsData = async (data = null) => {
    if (!userData.userId) return;
    setIsFriendLoading(true);
    try {
      let fIds = [];
      let rIds = [];
      if (data) {
        fIds = data.friends || [];
        rIds = data.friendRequests || [];
      } else {
        const myDoc = await getDoc(doc(db, 'users', userData.userId));
        if (myDoc.exists()) {
          const d = myDoc.data();
          fIds = d.friends || [];
          rIds = d.friendRequests || [];
        }
      }
      
      const usersSnap = await getDocs(collection(db, 'users'));
      const allUsers = {};
      usersSnap.forEach(d => allUsers[d.id] = d.data());
      
      setFriendsList(fIds.map(id => ({ userId: id, ...allUsers[id] })).filter(u => u.username));
      setFriendRequestsList(rIds.map(id => ({ userId: id, ...allUsers[id] })).filter(u => u.username));
    } catch(e) {
    } finally {
      setIsFriendLoading(false);
    }
  };

  const handleSearchFriend = async () => {
    if (!searchFriendQuery.trim()) return;
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      const res = [];
      usersSnap.forEach(d => {
        const data = d.data();
        if (d.id !== userData.userId && data.username.includes(searchFriendQuery)) {
          if (!friendsList.some(f => f.userId === d.id)) {
            res.push({ userId: d.id, username: data.username, rating5: data.rating5 || 1000 });
          }
        }
      });
      setSearchFriendResults(res);
    } catch(e) {}
  };

  const sendFriendRequest = async (targetId) => {
    try {
      const targetDoc = await getDoc(doc(db, 'users', targetId));
      if (targetDoc.exists()) {
        const targetData = targetDoc.data();
        if (targetData.isAIPlayer) {
          await updateDoc(doc(db, 'users', userData.userId), {
            friends: arrayUnion(targetId)
          });
          await updateDoc(doc(db, 'users', targetId), {
            friends: arrayUnion(userData.userId)
          });
          alert(`${targetData.username} とフレンドになりました！（AI自動承認）`);
          fetchFriendsData();
        } else {
          await updateDoc(doc(db, 'users', targetId), {
            friendRequests: arrayUnion(userData.userId)
          });
          alert('フレンド申請を送信しました！');
        }
      }
    } catch(e) {}
  };

  const acceptFriendRequest = async (targetId) => {
    try {
      await updateDoc(doc(db, 'users', userData.userId), {
        friendRequests: arrayRemove(targetId),
        friends: arrayUnion(targetId)
      });
      await updateDoc(doc(db, 'users', targetId), {
        friends: arrayUnion(userData.userId)
      });
      fetchFriendsData();
    } catch(e) {}
  };

  const rejectFriendRequest = async (targetId) => {
    try {
      await updateDoc(doc(db, 'users', userData.userId), {
        friendRequests: arrayRemove(targetId)
      });
      fetchFriendsData();
    } catch(e) {}
  };

  const sendInvitation = async (friendId, type) => {
    let targetRoomId = roomId;

    if (!targetRoomId) {
      const code = Math.floor(1000 + Math.random() * 9000).toString();
      targetRoomId = type.startsWith('rank') ? push(ref(rtdb, 'rooms')).key : `room_${code}`;
      setRoomId(targetRoomId);
      setIsRankMatch(type.startsWith('rank'));
      setIsOnlineMode(true);
      setMySlot(0);
      
      const newTotalMatches = type === 'rank_10' ? 10 : 5;
      setTotalMatches(newTotalMatches);
      const myRating = newTotalMatches === 10 ? userData.rating10 : userData.rating5;

      await set(ref(rtdb, `rooms/${targetRoomId}`), {
        roomId: targetRoomId, 
        code: type === 'room' ? code : null, 
        type: type, 
        totalMatches: newTotalMatches,
        status: 'waiting', 
        hostId: userData.userId,
        players: [{ userId: userData.userId, name: userData.username, rating: myRating, maxRating: userData.maxRating5, isCpu: false }]
      });
      setCurrentScreen(type.startsWith('rank') ? 'waiting_rank' : 'waiting_room');
      
      if (type.startsWith('rank')) {
         setRoomTimer(60); 
      }
    }
    
    const targetFriend = friendsList.find(f => f.userId === friendId);
    
    if (targetFriend && targetFriend.isAIPlayer) {
      const snapshot = await get(ref(rtdb, `rooms/${targetRoomId}`));
      if (snapshot.exists()) {
        const rData = snapshot.val();
        const existingPlayers = rData.players || [];
        
        if (existingPlayers.some(p => p.userId === friendId)) {
          alert(`${targetFriend.username} はすでに部屋にいます。`);
          return;
        }

        if (existingPlayers.length < 4) {
          const aiRating = type === 'rank_10' ? targetFriend.rating10 : targetFriend.rating5;
          const aiMaxRating = type === 'rank_10' ? targetFriend.maxRating10 : targetFriend.maxRating5;
          const updatedPlayers = [...existingPlayers, { 
            userId: targetFriend.userId, 
            name: targetFriend.username, 
            rating: aiRating, 
            maxRating: aiMaxRating || aiRating, 
            isCpu: true, 
            isAIPlayer: true, 
            isSuperAI: targetFriend.isSuperAI || false, 
            isUltraSuperAI: targetFriend.isUltraSuperAI || false,
            isDoubleGrowthAI: targetFriend.isDoubleGrowthAI || false,
            isAsnV2: targetFriend.isAsnV2 || false
          }];
          await update(ref(rtdb, `rooms/${targetRoomId}`), { players: updatedPlayers });
          alert(`${targetFriend.username} が部屋に参加しました！`);
          
          if (updatedPlayers.length === 4 && type.startsWith('rank')) {
            setTimeout(() => {
                executeStartOnlineMatch(targetRoomId, updatedPlayers);
            }, 1500);
          }
        } else {
          alert('部屋が満員です。');
        }
      }
    } else {
      push(ref(rtdb, `invitations/${friendId}`), {
        fromId: userData.userId,
        fromName: userData.username,
        roomId: targetRoomId,
        type: type,
        timestamp: Date.now()
      });
      alert('招待を送信しました！');
    }
  };

  const acceptInvitation = async (inv) => {
    if (roomId) {
      await leaveRoomById(roomId, userData.userId);
      setRoomId(null); setRoomData(null);
    }
    
    const snapshot = await get(ref(rtdb, `rooms/${inv.roomId}`));
    if (!snapshot.exists()) {
      alert('部屋が見つかりません（すでに解散した可能性があります）。');
      remove(ref(rtdb, `invitations/${userData.userId}/${inv.id}`));
      return;
    }
    
    const rData = snapshot.val();
    const existingPlayers = (rData.players || []).filter(p => p.userId !== userData.userId);
    if (existingPlayers.length >= 4) {
      alert('部屋が満員です。');
      remove(ref(rtdb, `invitations/${userData.userId}/${inv.id}`));
      return;
    }

    setMySlot(existingPlayers.length); 
    setIsRankMatch(inv.type.startsWith('rank')); 
    setIsOnlineMode(true); 
    setRoomId(inv.roomId);
    const mCount = rData.totalMatches || 5;
    setTotalMatches(mCount);
    
    const myRating = mCount === 10 ? userData.rating10 : userData.rating5;

    const updatedPlayers = [...existingPlayers, { userId: userData.userId, name: userData.username, rating: myRating, isCpu: false }];
    await update(ref(rtdb, `rooms/${inv.roomId}`), { players: updatedPlayers });
    
    setCurrentScreen(inv.type.startsWith('rank') ? 'waiting_rank' : 'waiting_room');
    remove(ref(rtdb, `invitations/${userData.userId}/${inv.id}`));
  };

  const rejectInvitation = (invId) => {
    remove(ref(rtdb, `invitations/${userData.userId}/${invId}`));
  };

  const sendChatMessage = () => {
    if (!chatInput.trim() || !activeChatFriend) return;
    const chatId = [userData.userId, activeChatFriend.userId].sort().join('_');
    push(ref(rtdb, `chats/${chatId}`), {
      senderId: userData.userId,
      text: chatInput.trim(),
      timestamp: Date.now()
    });
    
    set(ref(rtdb, `notifications/${activeChatFriend.userId}/unreadChat/${userData.userId}`), true);

    setChatInput('');
  };

  const renderCard = (card, isSelected) => {
    const isRed = card.suit === '♥' || card.suit === '♦';
    const numStr = NUM_MAP[card.num] || card.suit;
    
    if (userData.cardDesign === 'classic') {
      return (
        <div className={`card-item classic ${userData.cardSize} ${isSelected ? 'selected' : ''} ${isRed ? 'red-suit' : ''}`} onClick={() => toggleSelectCard(card)}>
           <div className="card-top-left">{card.suit}<br/>{numStr}</div>
           <div className="card-center">{card.num === 0 ? 'JOKER' : card.suit}</div>
           <div className="card-bottom-right">{card.suit}<br/>{numStr}</div>
        </div>
      );
    } else if (userData.cardDesign === 'modern') {
      return (
        <div className={`card-item modern ${userData.cardSize} ${isSelected ? 'selected' : ''} ${isRed ? 'red-suit' : ''}`} onClick={() => toggleSelectCard(card)}>
           <div className="card-modern-val">{numStr}</div>
           <div className="card-modern-suit">{card.suit}</div>
        </div>
      );
    } else {
      return (
        <div className={`card-item simple ${userData.cardSize} ${isSelected ? 'selected' : ''} ${isRed ? 'red-suit' : ''}`} onClick={() => toggleSelectCard(card)}>
           {card.suit}{numStr}
        </div>
      );
    }
  };

  const containerStyle = userData.bgImage ? { backgroundImage: `url(${userData.bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { backgroundColor: userData.bgColor };

  const hasNotification = friendRequestsList.length > 0 || Object.keys(unreadChats).length > 0;

  return (
    <div className={`app-outer ${userData.uiMode === 'desktop' ? 'desktop-mode' : ''}`} style={containerStyle}>
      <style>{`
        /* ★ Ver3.0 テーマカラーの適用 */
        .action-btn, .menu-btn, .game-btn.play-btn { background-color: ${userData.themeColor || '#3498db'} !important; border-color: ${userData.themeColor || '#3498db'} !important; }
        .friend-tabs button.active { border-bottom: 3px solid ${userData.themeColor || '#3498db'} !important; color: ${userData.themeColor || '#3498db'} !important; }
        .status-badge { background-color: ${userData.themeColor || '#3498db'}; }
        .chat-message.mine { background-color: ${userData.themeColor || '#3498db'}; }
        
        .card-item.x-small { width: 35px; height: 50px; font-size: 12px; }
        .card-item.x-large { width: 90px; height: 130px; font-size: 36px; }
        
        /* ★ Ver3.0 カードデザイン CSS */
        .card-item.classic { display: flex; flex-direction: column; justify-content: space-between; padding: 4px; box-sizing: border-box; }
        .card-item.classic .card-top-left { font-size: 0.55em; text-align: left; line-height: 1; font-weight: bold; }
        .card-item.classic .card-center { font-size: 1.3em; align-self: center; flex: 1; display: flex; align-items: center; }
        .card-item.classic .card-bottom-right { font-size: 0.55em; text-align: right; transform: rotate(180deg); line-height: 1; font-weight: bold; }
        .card-item.modern { display: flex; align-items: center; justify-content: center; position: relative; font-family: 'Arial Black', sans-serif; }
        .card-item.modern .card-modern-val { font-size: 1.5em; font-weight: 900; letter-spacing: -1px; }
        .card-item.modern .card-modern-suit { position: absolute; top: 4px; left: 6px; font-size: 0.7em; opacity: 0.8; }
        .card-item.simple { display: flex; align-items: center; justify-content: center; font-size: 1.2em; font-weight: bold; }

        /* --- パソコン版 UI用追加CSS --- */
        .desktop-mode .app-container {
          max-width: 1000px !important; margin: 2vh auto !important; border-radius: 12px;
          box-shadow: 0 4px 15px rgba(0,0,0,0.3); height: 96vh !important;
        }
        .desktop-mode .game-board { display: flex; flex-direction: column; height: 100%; }
        .desktop-mode .cpu-players { flex-direction: row !important; justify-content: space-around !important; padding: 10px 20px !important; }
        .desktop-mode .cpu-card { width: 25% !important; margin: 0 10px !important; }
        .desktop-mode .field-area { flex: 1; display: flex; flex-direction: column; justify-content: center; }
        .desktop-mode .player-area { padding-bottom: 20px !important; }
        .desktop-mode .hand-cards { justify-content: center !important; gap: 5px; }
        .desktop-mode .sub-screen, .desktop-mode .menu-container { max-width: 800px; margin: 0 auto; }

        /* --- フレンド機能 UI --- */
        .friend-tabs { display: flex; border-bottom: 2px solid #ccc; margin-bottom: 15px; }
        .friend-tabs button { flex: 1; padding: 10px; cursor: pointer; border: none; background: transparent; font-weight: bold; color: #7f8c8d; }
        .friend-list-item { display: flex; justify-content: space-between; align-items: center; background: #fff; padding: 10px 15px; margin-bottom: 8px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
        .friend-actions button { margin-left: 5px; padding: 6px 10px; font-size: 11px; cursor: pointer; border-radius: 4px; border: none; color: white; }
        .btn-chat { background-color: #9b59b6 !important; }
        .btn-invite-rank { background-color: #e67e22 !important; }
        .btn-invite-room { background-color: #16a085 !important; }
        
        /* --- チャット機能 UI --- */
        .chat-container { display: flex; flex-direction: column; height: 65vh; background: #fdfefe; border-radius: 8px; border: 1px solid #ccc; overflow: hidden; }
        .chat-messages { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; }
        .chat-message { max-width: 75%; padding: 10px 14px; border-radius: 15px; margin-bottom: 10px; font-size: 14px; word-break: break-word; }
        .chat-message.mine { align-self: flex-end; color: #fff; border-bottom-right-radius: 2px; }
        .chat-message.other { align-self: flex-start; background-color: #ecf0f1; color: #2c3e50; border-bottom-left-radius: 2px; }
        .chat-input-area { display: flex; padding: 10px; border-top: 1px solid #eee; background: #fff; }
        .chat-input-area input { flex: 1; padding: 10px; border: 1px solid #ccc; border-radius: 20px; outline: none; }
        .chat-input-area button { margin-left: 10px; padding: 10px 20px; background: #2ecc71 !important; color: white; border: none; border-radius: 20px; cursor: pointer; font-weight: bold; }
        
        /* --- 招待通知バナー --- */
        .invitation-banner { position: fixed; top: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px; width: 300px; max-width: 90vw; }
        .invitation-item { background: rgba(44, 62, 80, 0.95); color: white; padding: 15px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.3); font-size: 13px; display: flex; flex-direction: column; gap: 10px; animation: fadeIn 0.3s ease-in-out; }
        .invitation-item .actions { display: flex; justify-content: flex-end; gap: 10px; }
        .invitation-item button { padding: 6px 15px; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 12px; }
        .invitation-item button.accept { background: #2ecc71; color: white; }
        .invitation-item button.reject { background: #e74c3c; color: white; }

        /* ★ Ver3.2.3 新機能 UI追加 CSS */
        .friend-popup {
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          background: #e74c3c;
          color: white;
          padding: 10px 20px;
          border-radius: 20px;
          font-size: 13px;
          font-weight: bold;
          z-index: 10000;
          box-shadow: 0 4px 6px rgba(0,0,0,0.2);
          animation: slideDownFade 0.3s ease-out;
        }
        @keyframes slideDownFade {
          from { top: -20px; opacity: 0; }
          to { top: 20px; opacity: 1; }
        }
        .notification-badge {
          position: absolute;
          top: -5px;
          left: -5px;
          width: 14px;
          height: 14px;
          background-color: #e74c3c;
          border-radius: 50%;
          border: 2px solid #fff;
          z-index: 10;
        }

        /* ★ Ver3.3 オープニング画面 CSS */
        .opening-screen {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: linear-gradient(135deg, #2c3e50, #000000);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          z-index: 99999;
          color: white;
          overflow: hidden;
          cursor: pointer;
        }
        .opening-title {
          font-size: 3rem;
          font-weight: bold;
          text-shadow: 0 0 20px rgba(255, 215, 0, 0.8);
          animation: titleFadeIn 2s ease-out forwards;
          z-index: 2;
        }
        .opening-subtitle {
          margin-top: 10px;
          font-size: 1.2rem;
          color: #f1c40f;
          animation: subtitleFadeIn 2s ease-out 1s forwards;
          opacity: 0;
          z-index: 2;
        }
        .opening-cards {
          position: absolute;
          width: 100%;
          height: 100%;
          pointer-events: none;
          z-index: 1;
        }
        .floating-card {
          position: absolute;
          font-size: 4rem;
          animation: floatUp 3s linear infinite;
          opacity: 0;
        }
        @keyframes titleFadeIn {
          0% { opacity: 0; transform: scale(0.5) translateY(50px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes subtitleFadeIn {
          0% { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes floatUp {
          0% { transform: translateY(100vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(-20vh) rotate(360deg); opacity: 0; }
        }
      `}</style>

      {/* ★ Ver3.3 オープニング画面 */}
      {currentScreen === 'opening' && (
        <div className="opening-screen" onClick={() => setCurrentScreen('menu')}>
          <div className="opening-cards">
            <div className="floating-card" style={{left: '10%', animationDelay: '0s', color: '#e74c3c'}}>♥</div>
            <div className="floating-card" style={{left: '30%', animationDelay: '0.5s', color: '#ecf0f1'}}>♠</div>
            <div className="floating-card" style={{left: '50%', animationDelay: '0.2s', color: '#e74c3c'}}>♦</div>
            <div className="floating-card" style={{left: '70%', animationDelay: '0.8s', color: '#ecf0f1'}}>♣</div>
            <div className="floating-card" style={{left: '85%', animationDelay: '1.2s', color: '#f1c40f'}}>👑</div>
          </div>
          <div className="opening-title">大富豪オンライン</div>
          <div className="opening-subtitle">Millionaire Online</div>
          <p style={{ position: 'absolute', bottom: '20px', fontSize: '12px', opacity: 0, animation: 'fadeIn 2s 2s forwards' }}>タップしてスタート</p>
        </div>
      )}

      {/* ★ Ver3.2.3 フレンド申請ポップアップ */}
      {currentScreen === 'menu' && friendRequestPopup && (
        <div className="friend-popup">
          {friendRequestPopup}
        </div>
      )}

      {/* ★ Ver3.3.3 放置ペナルティモーダル */}
      {decayInfo && (
        <div className="modal-overlay" style={{ zIndex: 10000 }}>
          <div className="modal-content">
            <h3 style={{ margin: '0 0 10px 0', color: '#e74c3c' }}>⚠️ レーティング減少のお知らせ</h3>
            <p style={{ fontSize: '13px', lineHeight: '1.5', textAlign: 'left' }}>
              <strong>{decayInfo.days}日間</strong> ログインがなかったため、ペナルティとしてレーティングが減少しました。<br/><br/>
              減少量: <span style={{ color: '#e74c3c', fontWeight: 'bold' }}>-{decayInfo.amount} Pt</span><br/>
              現在のレーティング(5試合制): <strong>{decayInfo.newRating} Pt</strong>
            </p>
            <button className="action-btn" onClick={() => setDecayInfo(null)} style={{ marginTop: '15px' }}>確認しました</button>
          </div>
        </div>
      )}

      {/* --- グローバル招待通知 --- */}
      {invitations.length > 0 && currentScreen !== 'game' && currentScreen !== 'opening' && (
        <div className="invitation-banner">
          {invitations.map(inv => (
            <div key={inv.id} className="invitation-item">
              <span>📩 <strong>{inv.fromName}</strong> さんから {inv.type.startsWith('rank') ? `ランク戦 (${inv.type === 'rank_10' ? '10' : '5'}試合)` : 'ルーム戦'} の招待が届いています！</span>
              <div className="actions">
                <button className="accept" onClick={() => acceptInvitation(inv)}>参加する</button>
                <button className="reject" onClick={() => rejectInvitation(inv.id)}>拒否する</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {currentScreen !== 'opening' && (
      <div className="app-container">

        {showInitialSettingsModal && (
          <div className="modal-overlay">
            <div className="modal-content">
              <h3 style={{ margin: '0 0 10px 0', color: '#2c3e50' }}>⚙️ プレイ環境の設定</h3>
              <p style={{ fontSize: '13px', lineHeight: '1.5' }}>
                お好みのカードデザインとサイズを選択してください。<br/>
                <span style={{ fontSize: '11px', color: '#7f8c8d' }}>(後から「設定」で変更可能です)</span>
              </p>
              
              <div className="setting-item" style={{ textAlign: 'left', marginTop: '15px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 'bold' }}>トランプのデザイン</label>
                <select style={{ width: '100%', padding: '8px', marginTop: '5px', borderRadius: '4px' }} value={userData.cardDesign} onChange={(e) => saveUserData({ ...userData, cardDesign: e.target.value })}>
                  <option value="classic">クラシック (推奨)</option>
                  <option value="modern">モダン</option>
                  <option value="simple">シンプル</option>
                </select>
              </div>

              <div className="setting-item" style={{ textAlign: 'left', marginTop: '15px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 'bold' }}>カードのサイズ</label>
                <select style={{ width: '100%', padding: '8px', marginTop: '5px', borderRadius: '4px' }} value={userData.cardSize} onChange={(e) => saveUserData({ ...userData, cardSize: e.target.value })}>
                  <option value="x-small">極小</option>
                  <option value="small">小</option>
                  <option value="medium">中</option>
                  <option value="large">大</option>
                  <option value="x-large">極大</option>
                </select>
              </div>

              <button className="action-btn" onClick={() => {
                setShowInitialSettingsModal(false);
                saveUserData({ ...userData, hasCompleted163Settings: true });
              }} style={{ marginTop: '20px' }}>決定して進む</button>
            </div>
          </div>
        )}

        {showAccountPromptModal && (
          <div className="modal-overlay">
            <div className="modal-content">
              <h3 style={{ margin: '0 0 10px 0', color: '#2c3e50' }}>🔐 アカウント登録のお願い</h3>
              <p style={{ fontSize: '13px', lineHeight: '1.5' }}>
                アカウント登録（パスワード設定）を行うことで、他のデバイスからでも現在のプレイデータを引き継いで遊ぶことができるようになります！
              </p>
              <div className="modal-actions">
                <button className="action-btn" onClick={() => { setShowAccountPromptModal(false); setShowAccountRegisterModal(true); }}>登録する</button>
                <button className="back-btn" onClick={() => setShowAccountPromptModal(false)}>閉じる</button>
              </div>
            </div>
          </div>
        )}

        {showAccountRegisterModal && (
          <div className="modal-overlay">
            <div className="modal-content">
              <h3>アカウント登録</h3>
              <p style={{ fontSize: '12px', margin: '5px 0' }}>現在のユーザー名: <strong>{userData.username}</strong><br />このユーザー名で引き継ぎパスワードを設定します。</p>
              {authError && <p className="error-text" style={{ color: '#e74c3c', fontSize: '12px' }}>{authError}</p>}
              <form onSubmit={handleRegisterAccount}>
                <input type="password" style={{ fontSize: '1.2rem', padding: '12px 16px', width: '90%', margin: '15px 0', borderRadius: '8px', border: '2px solid #3498db' }} value={authPassword} onChange={(e) => {setAuthPassword(e.target.value); setAuthError('');}} placeholder="パスワードを入力" required />
                <div className="modal-actions">
                   <button type="submit" className="action-btn">登録する</button>
                   <button type="button" className="back-btn" onClick={() => {setShowAccountRegisterModal(false); setAuthError(''); setAuthPassword('');}}>キャンセル</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showLoginModal && (
          <div className="modal-overlay">
            <div className="modal-content">
              <h3>別のアカウントに移動</h3>
              <p style={{ fontSize: '12px', margin: '5px 0' }}>登録済みのユーザー名とパスワードを入力してください。</p>
              {authError && <p className="error-text" style={{ color: '#e74c3c', fontSize: '12px' }}>{authError}</p>}
              <form onSubmit={handleLoginAccount}>
                <input type="text" style={{ fontSize: '1.2rem', padding: '12px 16px', width: '90%', margin: '10px 0', borderRadius: '8px', border: '2px solid #3498db' }} value={authUsername} onChange={(e) => {setAuthUsername(e.target.value); setAuthError('');}} placeholder="ユーザー名" required />
                <input type="password" style={{ fontSize: '1.2rem', padding: '12px 16px', width: '90%', margin: '10px 0', borderRadius: '8px', border: '2px solid #3498db' }} value={authPassword} onChange={(e) => {setAuthPassword(e.target.value); setAuthError('');}} placeholder="パスワード" required />
                <div className="modal-actions">
                   <button type="submit" className="action-btn">ログイン</button>
                   <button type="button" className="back-btn" onClick={() => {setShowLoginModal(false); setAuthError(''); setAuthUsername(''); setAuthPassword('');}}>キャンセル</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showDisconnectPenaltyModal && (
          <div className="modal-overlay">
            <div className="modal-content">
              <h3 style={{ margin: '0 0 10px 0', color: '#e74c3c' }}>⚠️ 警告</h3>
              <p style={{ fontSize: '13px', lineHeight: '1.5' }}>
                前回の対戦中に不正な切断（サイト更新・終了など）が検知されました。<br />
                ランク戦の場合はペナルティとしてレーティングが <strong>減少</strong> しています。<br />
                また、切断数がカウントされました。
              </p>
              <button className="action-btn warning-btn" onClick={() => setShowDisconnectPenaltyModal(false)} style={{ marginTop: '15px' }}>確認しました</button>
            </div>
          </div>
        )}

        {showUpdateModal && (
          <div className="modal-overlay">
            <div className="modal-content">
              <h3 style={{ margin: '0 0 10px 0', color: '#2c3e50' }}>🎉 更新情報 (リリースノート)</h3>
              <div className="rules-scroll-area" style={{ textAlign: 'left', fontSize: '12px', lineHeight: '1.5', maxHeight: '300px' }}>
                {UPDATE_HISTORY.map((update, idx) => (
                  <div key={idx} style={{ marginBottom: '15px' }}>
                    <p style={{ margin: '0 0 5px 0', fontWeight: 'bold', borderBottom: '1px solid #ccc', paddingBottom: '3px' }}>
                      Ver {update.version}
                    </p>
                    <ul style={{ paddingLeft: '20px', margin: 0 }}>
                      {update.features.map((feature, i) => (
                        <li key={i} style={{ marginBottom: '4px' }}>{feature}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <button className="action-btn" onClick={handleCloseUpdate} style={{ marginTop: '15px' }}>確認しました</button>
            </div>
          </div>
        )}

        {showRegisterModal && (
          <div className="modal-overlay">
            <div className="modal-content">
              <h2>ユーザー登録</h2>
              <p>プレイヤーネームを入力してください</p>
              <form onSubmit={handleRegister}>
                <input type="text" style={{ fontSize: '1.2rem', padding: '12px 16px', width: '90%', margin: '15px 0', borderRadius: '8px', border: '2px solid #3498db' }} value={inputUsername} onChange={(e) => setInputUsername(e.target.value)} placeholder="ユーザーネーム" maxLength={10} required />
                <button type="submit" className="action-btn">登録する</button>
              </form>
            </div>
          </div>
        )}

        {showRecommendModal && (
          <div className="modal-overlay">
            <div className="modal-content recommend-modal">
              <button className="close-btn" onClick={handleCloseRecommend}>×</button>
              <h3>おすすめ Web App Collection</h3>
              <p>おすすめのWebアプリコレクションをチェックしてみよう！</p>
              <a href="https://hibimaruwebappscollection.vercel.app/index.html" target="_blank" rel="noopener noreferrer" className="recommend-link-btn">サイトを見る</a>
              <div><button className="action-btn next-modal-btn" onClick={handleCloseRecommend}>次へ（ルールを確認）</button></div>
            </div>
          </div>
        )}

        {showRulesModal && (
          <div className="modal-overlay">
            <div className="modal-content rules-modal-content">
              <h3>📜 導入されているルール 📜</h3>
              <div className="rules-scroll-area">
                <ul>
                  <li><strong>🔒 スート縛り:</strong> 同じマーク(複数枚も可)が3連続で出ると、場が流れるまで同マークしか出せません。</li>
                  <li><strong>🚫 禁止上がり:</strong> 8、ジョーカー、一番強いカード（通常時2 / 革命時3）で上がると反則負け（最下位）となります。</li>
                  <li><strong>🔥 革命:</strong> 4枚以上のカードを同時に出すと、即座にカードの強さが逆転します。</li>
                  <li><strong>✂️ 8切り:</strong> 8を含むカードを出すと、場が流れて自分のターンになります。</li>
                  <li><strong>↺ 11バック:</strong> J(11)を出すと、そのターン中のみカードの強さが逆転します。</li>
                  <li><strong>♠️ スペ3返し:</strong> ジョーカー単体出しに対して、♠3単体で勝利できます。</li>
                  <li><strong>⚠️ 都落ち:</strong> 前回大富豪が1位で上がれなかった場合、強制最下位（大貧民）となります。</li>
                  <li><strong>🔄 カード交換:</strong> 2試合目以降、1位は2位に任意の不要カードを渡し、下位は最強カードを自動で渡します。</li>
                  <li><strong>🏆 総合ポイント制:</strong> 順位に応じて 1位:+2, 2位:+1, 3位:-1, 4位:-2 のポイントが加算されます。</li>
                  <li><strong>📊 レーティング計算:</strong> 10試合制の場合はレート変動が3倍になります。</li>
                </ul>
              </div>
              <button className="action-btn" onClick={() => setShowRulesModal(false)}>ゲームを始める</button>
            </div>
          </div>
        )}

        {showConfirmHomeModal && (
          <div className="modal-overlay">
            <div className="modal-content">
              <h3>ホームへ戻りますか？</h3>
              <p>{isOnlineMode ? '※対戦中に途中離脱すると敗北となり、レーティングが減少します。' : '対戦を終了してメニューへ戻ります。'}</p>
              <div className="modal-actions">
                <button className="action-btn warning-btn" onClick={handleConfirmReturnHome}>はい（退出）</button>
                <button className="back-btn" onClick={() => setShowConfirmHomeModal(false)}>キャンセル</button>
              </div>
            </div>
          </div>
        )}

        {showDeleteDataModal && (
          <div className="modal-overlay">
            <div className="modal-content">
              <h3>⚠️ データの全削除確認</h3>
              <p>オンラインランキング上のデータを含め、すべてのプレイデータが完全に削除されます。<br />本当に削除しますか？</p>
              <div className="modal-actions">
                <button className="action-btn warning-btn" onClick={handleDeleteAllData}>全データを削除する</button>
                <button className="back-btn" onClick={() => setShowDeleteDataModal(false)}>キャンセル</button>
              </div>
            </div>
          </div>
        )}

        {currentScreen === 'menu' && (
          <div className="menu-container">
            <h1 className="title">
              大富豪オンライン
              <div style={{ fontSize: '12px', color: '#7f8c8d', marginTop: '4px' }}>Ver.{CURRENT_VERSION}</div>
            </h1>
            <p className="user-badge">ようこそ、{userData.username || 'ゲスト'} さん <span style={{fontSize:'12px', marginLeft:'5px'}}>(Pt: {userData.rating5})</span></p>

            <button className="menu-btn" onClick={() => setCurrentScreen('online_select')}>オンライン対戦</button>
            <button className="menu-btn" onClick={() => { setMySlot(0); setTotalMatches(5); startNewGameSet(['あなた', 'CPU 1', 'CPU 2', 'CPU 3'], false, false); }}>コンピュータ対戦</button>
            <button className="menu-btn" onClick={() => { setRankingTab('rank5'); setCurrentScreen('ranking'); }}>全プレイヤーレーティングランキング</button>
            {/* ★ Ver3.2.3 フレンドボタンへの通知バッジ */}
            <button className="menu-btn" style={{ position: 'relative' }} onClick={() => { setCurrentScreen('friends'); fetchFriendsData(); }}>
              フレンド
              {hasNotification && <span className="notification-badge"></span>}
            </button>
            <button className="menu-btn" onClick={() => setCurrentScreen('profile')}>プロフィール</button>
            <button className="menu-btn" onClick={() => setCurrentScreen('settings')}>設定</button>
          </div>
        )}

        {/* --- フレンド画面 --- */}
        {currentScreen === 'friends' && (
          <div className="sub-screen">
            <h2>🤝 フレンド</h2>
            <div className="friend-tabs">
              <button className={friendTab === 'list' ? 'active' : ''} onClick={() => setFriendTab('list')}>フレンド一覧</button>
              <button className={friendTab === 'add' ? 'active' : ''} onClick={() => setFriendTab('add')}>ユーザー検索</button>
              <button className={friendTab === 'requests' ? 'active' : ''} onClick={() => setFriendTab('requests')}>
                承認待ち {friendRequestsList.length > 0 && <span style={{color: '#e74c3c'}}>({friendRequestsList.length})</span>}
              </button>
            </div>

            <button className="action-btn" style={{ marginBottom: '15px', padding: '8px 16px', fontSize: '0.95rem' }} onClick={() => fetchFriendsData()} disabled={isFriendLoading}>
              {isFriendLoading ? '読み込み中...' : '🔄 最新情報に更新'}
            </button>

            {friendTab === 'list' && (
              <div className="rules-scroll-area" style={{ maxHeight: '60vh' }}>
                {friendsList.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#7f8c8d' }}>フレンドがいません。</p>
                ) : (
                  friendsList.map(f => {
                    const getStatusColor = (u) => {
                      if (u.status === 'playing') return '#f1c40f'; 
                      if (u.status === 'offline') return '#e74c3c'; 
                      if (u.status === 'online') return '#2ecc71'; 
                      
                      const now = Date.now();
                      if (!u.updatedAt || (now - u.updatedAt > 30 * 60 * 1000)) return '#e74c3c';
                      return '#2ecc71';
                    };
                    const getStatusText = (u) => {
                      if (u.status === 'playing') return '試合中';
                      if (u.status === 'offline') return 'オフライン';
                      if (u.status === 'online') return 'オンライン';
                      
                      const now = Date.now();
                      if (!u.updatedAt || (now - u.updatedAt > 30 * 60 * 1000)) return 'オフライン';
                      return 'オンライン';
                    };
                    return (
                      <div key={f.userId} className="friend-list-item">
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <strong>{f.username}</strong>
                          <span style={{
                            display: 'inline-block',
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: getStatusColor(f),
                            marginLeft: '6px',
                            boxShadow: `0 0 4px ${getStatusColor(f)}`
                          }} title={getStatusText(f)}></span>
                          <span style={{ fontSize: '11px', color: '#7f8c8d', marginLeft: '10px' }}>({f.rating5 || 1000} Pt)</span>
                        </div>
                        <div className="friend-actions">
                          {/* ★ Ver3.2.3 チャットボタンへの未読バッジ */}
                          <button className="btn-chat" style={{ position: 'relative' }} onClick={() => { setActiveChatFriend(f); setCurrentScreen('chat'); }}>
                            💬
                            {unreadChats[f.userId] && <span style={{position:'absolute', top:'-3px', right:'-3px', width:'8px', height:'8px', background:'#e74c3c', borderRadius:'50%'}}></span>}
                          </button>
                          <button className="btn-invite-rank" onClick={() => sendInvitation(f.userId, 'rank_5')}>ランク(5戦)</button>
                          <button className="btn-invite-rank" style={{backgroundColor:'#d35400'}} onClick={() => sendInvitation(f.userId, 'rank_10')}>ランク(10戦)</button>
                          <button className="btn-invite-room" onClick={() => sendInvitation(f.userId, 'room')}>ルーム</button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {friendTab === 'add' && (
              <div>
                <div style={{ display: 'flex', marginBottom: '15px' }}>
                  <input 
                    type="text" 
                    placeholder="ユーザー名を検索" 
                    value={searchFriendQuery} 
                    onChange={(e) => setSearchFriendQuery(e.target.value)} 
                    style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                  />
                  <button className="action-btn" style={{ width: 'auto', marginLeft: '10px', padding: '8px 15px' }} onClick={handleSearchFriend}>検索</button>
                </div>
                <div className="rules-scroll-area" style={{ maxHeight: '50vh' }}>
                  {searchFriendResults.map(u => (
                    <div key={u.userId} className="friend-list-item">
                      <div>
                        <strong>{u.username}</strong> <span style={{ fontSize: '11px', color: '#7f8c8d' }}>({u.rating5 || 1000} Pt)</span>
                      </div>
                      <button className="action-btn" style={{ width: 'auto', padding: '5px 15px', fontSize: '12px' }} onClick={() => sendFriendRequest(u.userId)}>申請</button>
                    </div>
                  ))}
                  {searchFriendResults.length === 0 && searchFriendQuery && (
                    <p style={{ textAlign: 'center', color: '#7f8c8d' }}>該当するユーザーが見つかりません。</p>
                  )}
                </div>
              </div>
            )}

            {friendTab === 'requests' && (
              <div className="rules-scroll-area" style={{ maxHeight: '60vh' }}>
                {friendRequestsList.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#7f8c8d' }}>承認待ちの申請はありません。</p>
                ) : (
                  friendRequestsList.map(f => (
                    <div key={f.userId} className="friend-list-item">
                      <div>
                        <strong>{f.username}</strong> <span style={{ fontSize: '11px', color: '#7f8c8d' }}>({f.rating5 || 1000} Pt)</span>
                      </div>
                      <div className="friend-actions">
                        <button style={{ backgroundColor: '#2ecc71' }} onClick={() => acceptFriendRequest(f.userId)}>承認</button>
                        <button style={{ backgroundColor: '#e74c3c' }} onClick={() => rejectFriendRequest(f.userId)}>拒否</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            <button className="back-btn" onClick={() => setCurrentScreen('menu')}>戻る</button>
          </div>
        )}

        {/* --- チャット画面 --- */}
        {currentScreen === 'chat' && activeChatFriend && (
          <div className="sub-screen" style={{ display: 'flex', flexDirection: 'column', height: '90vh' }}>
            <h2 style={{ marginBottom: '10px' }}>💬 {activeChatFriend.username}</h2>
            
            <div className="chat-container">
              <div className="chat-messages">
                {chatMessages.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#7f8c8d', marginTop: 'auto', marginBottom: 'auto' }}>まだメッセージはありません。</p>
                ) : (
                  chatMessages.map(msg => {
                    const isMine = msg.senderId === userData.userId;
                    const date = new Date(msg.timestamp);
                    const timeStr = `${date.getMonth()+1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
                    return (
                      <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start' }}>
                        <span style={{ fontSize: '10px', color: '#7f8c8d', marginBottom: '2px' }}>{timeStr}</span>
                        <div className={`chat-message ${isMine ? 'mine' : 'other'}`}>
                          {msg.text}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>
              
              <div className="chat-input-area">
                <input 
                  type="text" 
                  placeholder="メッセージを入力..." 
                  value={chatInput} 
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()}
                />
                <button onClick={sendChatMessage}>送信</button>
              </div>
            </div>

            <button className="back-btn" style={{ marginTop: '15px' }} onClick={() => { setActiveChatFriend(null); setCurrentScreen('friends'); }}>戻る</button>
          </div>
        )}


        {currentScreen === 'online_select' && (
          <div className="sub-screen">
            <h2>オンライン対戦</h2>
            <div className="menu-container">
              <button className="menu-btn mode-btn" onClick={() => joinRankMatch(5)}>
                ランク戦 (5試合)
                <span className="btn-subtext">基本レート変動・サクッと遊ぶ</span>
              </button>
              <button className="menu-btn mode-btn" onClick={() => joinRankMatch(10)}>
                ランク戦 (10試合)
                <span className="btn-subtext">レート変動・がっつり遊ぶ</span>
              </button>
              <button className="menu-btn mode-btn" onClick={() => setCurrentScreen('room_select')}>
                ルーム戦
                <span className="btn-subtext">4桁の合い言葉で合流</span>
              </button>
            </div>
            <button className="back-btn" onClick={() => setCurrentScreen('menu')}>戻る</button>
          </div>
        )}

        {currentScreen === 'room_select' && (
          <div className="sub-screen">
            <h2>ルーム戦</h2>
            <button className="menu-btn" onClick={createRoom}>部屋を作成する</button>
            <div className="room-input-box">
              <input type="number" placeholder="4桁のルーム番号" value={inputRoomCode} onChange={(e) => setInputRoomCode(e.target.value.slice(0, 4))} />
              <button className="action-btn" onClick={joinRoomByCode}>部屋に入る</button>
            </div>
            <button className="back-btn" onClick={() => setCurrentScreen('online_select')}>戻る</button>
          </div>
        )}

        {currentScreen === 'waiting_rank' && (
          <div className="sub-screen">
            <h2>ランク戦 ({totalMatches}試合制) 待機ルーム</h2>
            <p className="timer-text">試合開始まで: {Math.floor(roomTimer / 60)}分 {roomTimer % 60}秒</p>
            <p className="info-text">※1分経過時に不足分をCPUで補填して開始します</p>

            <div className="player-list-box">
              <h4>参加プレイヤー ({roomData?.players ? roomData.players.length : 1} / 4人)</h4>
              {roomData?.players?.map((p, idx) => (
                <div key={idx} className="player-item">👤 {p.name} ({p.rating || 1000} Pt)</div>
              ))}
            </div>

            <button className="action-btn" onClick={startOnlineGameWithCpu}>今すぐ対戦開始 (CPU補充)</button>
            <button className="back-btn" onClick={async () => { await handleLeaveRoom(); setCurrentScreen('online_select'); }}>退出する</button>
          </div>
        )}

        {currentScreen === 'waiting_room' && (
          <div className="sub-screen">
            <h2>ルーム番号: {roomData?.code || ''}</h2>
            <p>メンバーが集まったらホストがスタートを押してください</p>

            <div className="player-list-box">
              <h4>参加メンバー ({roomData?.players ? roomData.players.length : 1} / 4人)</h4>
              {roomData?.players?.map((p, idx) => (
                <div key={idx} className="player-item">👤 {p.name}</div>
              ))}
            </div>

            {isHost ? (
              <button className="action-btn" onClick={startOnlineGameWithCpu}>試合スタート</button>
            ) : (
              <p className="info-text">ホストの開始を待っています...</p>
            )}

            <button className="back-btn" onClick={async () => { await handleLeaveRoom(); setCurrentScreen('online_select'); }}>退出する</button>
          </div>
        )}

        {/* --- 大富豪 ゲーム画面 --- */}
        {currentScreen === 'game' && (
          <div className="game-board">
            <div className="game-header">
              <span>{matchCount} / {totalMatches} 試合</span>
              <span>Pt: {scores[mySlot]}</span>
              {isRevolution && <span className="status-badge rev">革命</span>}
              {is11Back && <span className="status-badge back">11バック</span>}
              {field?.isBound && <span className="status-badge" style={{ backgroundColor: '#8e44ad', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', marginLeft: '5px' }}>🔒 縛り</span>}
              <button className="home-btn-small" onClick={() => setShowConfirmHomeModal(true)}>🏠 ホームへ</button>
            </div>

            <div className="cpu-players">
              {[0, 1, 2, 3].filter(idx => idx !== mySlot).map(idx => (
                <div key={idx} className={`cpu-card ${turn === idx && !exchangePhase ? 'active-turn' : ''} ${roomData?.players?.[idx]?.hasDisconnected ? 'disconnected-player' : ''}`}>
                  <div className="cpu-name">{players[idx]} {roomData?.players?.[idx]?.hasDisconnected && '(切断)'}</div>
                  <div className="cpu-cards-count">🂠 {hands[idx]?.length || 0}枚</div>
                  <div className="cpu-score">Pt: {scores[idx]}</div>
                  <div className="cpu-score" style={{fontSize: "9px", color:"#7f8c8d", marginTop: "2px"}}>R: {playerRatings[idx]}</div>
                </div>
              ))}
            </div>

            <div className="log-banner">{message}</div>

            <div className="field-area" style={exchangePhase ? { backgroundColor: 'transparent' } : {}}>
              {exchangePhase ? (
                <div style={{ textAlign: 'center', width: '100%', padding: '10px', background: 'rgba(255,255,255,0.9)', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                  <h4 style={{ color: '#e74c3c', margin: '0 0 10px 0' }}>🔄 カード交換フェーズ</h4>
                  {(() => {
                     const myRank = prevRanks.indexOf(mySlot);
                     const reqCount = getExchangeCount(mySlot);
                     
                     if (reqCount === 0) {
                       return (
                         <>
                           <p style={{ fontSize: '11px', margin: '5px 0' }}>相手がいないため、カード交換はスキップされます。</p>
                           <button className="action-btn" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={handleExchangeSubmit} disabled={isProcessing}>確認して進む</button>
                         </>
                       );
                     } else if (myRank === 0 || myRank === 1) {
                       return (
                         <>
                           <p style={{ fontSize: '11px', margin: '5px 0' }}>いらないカードを {reqCount}枚 選択してください</p>
                           <button 
                             className="action-btn"
                             style={{ padding: '6px 12px', fontSize: '12px' }}
                             onClick={handleExchangeSubmit}
                             disabled={selectedCards.length !== reqCount || isProcessing}
                           >
                             交換を決定する ({selectedCards.length} / {reqCount})
                           </button>
                         </>
                       );
                     } else {
                       return (
                         <>
                           <p style={{ fontSize: '11px', margin: '5px 0' }}>あなたの最強カードが自動的に {reqCount}枚 渡されます。</p>
                           <button className="action-btn" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={handleExchangeSubmit} disabled={isProcessing}>確認して渡す</button>
                         </>
                       );
                     }
                  })()}
                </div>
              ) : (
                <>
                  <div className="field-title">場</div>
                  <div className="field-cards">
                    {field ? (
                      field.cards.map((c, idx) => renderCard(c, false))
                    ) : (
                      <div className="empty-field">カードはありません</div>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="player-area">
              <div className="player-info">
                <span>あなたの手札 ({hands[mySlot]?.length || 0}枚)</span>
                {turn === mySlot && !exchangePhase && <span className="your-turn-badge">あなたの番です！</span>}
              </div>

              {isRankMatch && !exchangePhase && (
                <div style={{ textAlign: 'left', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px', color: turn === mySlot && turnTimer <= 10 ? '#e74c3c' : '#2c3e50' }}>
                  ⏱ 持ち時間: {turn === mySlot ? turnTimer : 30} 秒
                </div>
              )}

              <div className="hand-cards">
                {hands[mySlot]?.map(card => {
                  const isSelected = selectedCards.some(sc => sc.id === card.id);
                  return renderCard(card, isSelected);
                })}
              </div>

              {!exchangePhase && (
                <div className="controls">
                  <button
                    className="game-btn play-btn"
                    disabled={turn !== mySlot || selectedCards.length === 0 || isProcessing}
                    onClick={handleUserPlay}
                  >
                    カードを出す ({selectedCards.length})
                  </button>
                  <button
                    className="game-btn pass-btn"
                    disabled={turn !== mySlot || !field || isProcessing}
                    onClick={handleUserPass}
                  >
                    パス
                  </button>
                </div>
              )}
            </div>

            {matchResultModal && (
              <div className="modal-overlay">
                <div className="modal-content">
                  <h3>第 {matchResultModal.match} 試合 結果</h3>
                  <div className="result-list">
                    {matchResultModal.rankings.map((pIdx, rank) => (
                      <div key={rank} className={`result-item ${pIdx === mySlot ? 'highlight-me' : ''}`}>
                        <span>{rank + 1}位: {players[pIdx]}</span>
                        {/* ★ Ver3.0 ポイント表示の変更 */}
                        <span>獲得Pt: {[2, 1, -1, -2][rank] > 0 ? `+${[2, 1, -1, -2][rank]}` : [2, 1, -1, -2][rank]}Pt</span>
                      </div>
                    ))}
                  </div>
                  {isHost ? (
                    <button className="action-btn" onClick={() => {
                        const nextM = matchCount + 1;
                        setMatchCount(nextM);
                        setMatchResultModal(null);
                        startMatch(nextM, matchResultModal.rankings);
                      }}>次の試合へ</button>
                  ) : (
                    <p style={{fontSize: '12px'}}>ホストが次の試合を開始するのをお待ちください...</p>
                  )}
                </div>
              </div>
            )}

            {gameResultModal && (
              <div className="modal-overlay">
                <div className="modal-content">
                  <h2>🏆 {totalMatches}試合総合結果 🏆</h2>
                  <div className="result-list">
                    {gameResultModal.finalRankings.map((pIdx, rank) => (
                      <div key={rank} className={`result-item ${pIdx === mySlot ? 'highlight-me' : ''}`}>
                        <span>{rank + 1}位: {players[pIdx]}</span>
                        <span>合計 {gameResultModal.scores[pIdx]} Pt</span>
                      </div>
                    ))}
                  </div>

                  {isRankMatch && (
                    <div className="rating-change-box">
                      <p>レート変動: {gameResultModal.ratingChange >= 0 ? `+${gameResultModal.ratingChange}` : gameResultModal.ratingChange} Pt</p>
                      <p className="new-rating">新レーティング: {gameResultModal.newRating} Pt</p>
                    </div>
                  )}

                  <button className="action-btn" onClick={handleFinishGameAndLeave}>
                    メニューへ戻る
                  </button>
                </div>
              </div>
            )}

          </div>
        )}

        {/* ★ Ver3.2 ランキング画面 */}
        {currentScreen === 'ranking' && (
          <div className="sub-screen">
            <h2>全プレイヤーレーティングランキング</h2>

            <div className="friend-tabs" style={{ marginBottom: '10px' }}>
              <button className={rankingTab === 'rank5' ? 'active' : ''} onClick={() => setRankingTab('rank5')}>5試合制</button>
              <button className={rankingTab === 'rank10' ? 'active' : ''} onClick={() => setRankingTab('rank10')}>10試合制</button>
            </div>

            <button className="action-btn" style={{ marginBottom: '15px', padding: '8px 16px', fontSize: '0.95rem' }} onClick={fetchRankings} disabled={rankingLoading}>
              {rankingLoading ? '読み込み中...' : '🔄 最新情報に更新'}
            </button>

            {rankingError && (<p className="error-text" style={{ color: '#e74c3c', padding: '10px', background: 'rgba(231,76,60,0.1)', borderRadius: '6px' }}>{rankingError}</p>)}

            <div className="ranking-list">
              {rankingLoading ? (
                <div className="ranking-item">プレイデータ読み込み中...</div>
              ) : (rankingTab === 'rank5' ? globalRankings5 : globalRankings10).length > 0 ? (
                (rankingTab === 'rank5' ? globalRankings5 : globalRankings10).map((user, idx) => {
                  const getStatusColor = (u) => {
                    if (u.status === 'playing') return '#f1c40f'; 
                    if (u.status === 'offline') return '#e74c3c'; 
                    if (u.status === 'online') return '#2ecc71'; 
                    const now = Date.now();
                    if (!u.updatedAt || (now - u.updatedAt > 30 * 60 * 1000)) return '#e74c3c';
                    return '#2ecc71';
                  };
                  const getStatusText = (u) => {
                    if (u.status === 'playing') return '試合中';
                    if (u.status === 'offline') return 'オフライン';
                    if (u.status === 'online') return 'オンライン';
                    const now = Date.now();
                    if (!u.updatedAt || (now - u.updatedAt > 30 * 60 * 1000)) return 'オフライン';
                    return 'オンライン';
                  };
                  const trendKey = rankingTab === 'rank5' ? 'rating5Trend' : 'rating10Trend';
                  const diffValKey = rankingTab === 'rank5' ? 'rating5DiffVal' : 'rating10DiffVal';
                  const ratingKey = rankingTab === 'rank5' ? 'rating5' : 'rating10';
                  const ratingTrendKey = rankingTab === 'rank5' ? 'rating5RatingTrend' : 'rating10RatingTrend';
                  const ratingDiffKey = rankingTab === 'rank5' ? 'rating5RatingDiffVal' : 'rating10RatingDiffVal';

                  return (
                    <div key={idx} className={`ranking-item ${user.userId === userData.userId ? 'highlight-me' : ''}`}>
                      <span style={{ display: 'flex', alignItems: 'center' }}>
                        {idx + 1}位: {user.username}
                        <span style={{
                          display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%',
                          backgroundColor: getStatusColor(user), marginLeft: '6px', boxShadow: `0 0 4px ${getStatusColor(user)}`
                        }} title={getStatusText(user)}></span>
                        {/* ★ Ver3.3.2 同順位の表記を →(±0) に修正 */}
                        {user[trendKey] === 'up' && <span style={{ color: '#e74c3c', marginLeft: '6px', fontWeight: 'bold' }}>↑{user[diffValKey]}</span>}
                        {user[trendKey] === 'down' && <span style={{ color: '#3498db', marginLeft: '6px', fontWeight: 'bold' }}>↓{user[diffValKey]}</span>}
                        {user[trendKey] === 'same' && <span style={{ color: '#7f8c8d', marginLeft: '6px', fontWeight: 'bold' }}>→(±0)</span>}
                      </span>
                      <span style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
                        {user[ratingKey]} Pt
                        <span style={{ marginLeft: '10px', fontSize: '11px' }}>
                          {user[ratingTrendKey] === 'up' && <span style={{ color: '#e74c3c' }}>(+{user[ratingDiffKey]})</span>}
                          {user[ratingTrendKey] === 'down' && <span style={{ color: '#3498db' }}>(-{user[ratingDiffKey]})</span>}
                          {user[ratingTrendKey] === 'same' && <span style={{ color: '#7f8c8d' }}>(±0)</span>}
                        </span>
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="ranking-item">登録されているプレイヤーがいません</div>
              )}
            </div>

            {!rankingLoading && (rankingTab === 'rank5' ? myRankingInfo5 : myRankingInfo10) && (
              <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '2px dashed #bdc3c7' }}>
                <p style={{ fontSize: '12px', color: '#7f8c8d', margin: '0 0 5px 0', textAlign: 'left' }}>あなたの順位</p>
                <div className="ranking-item highlight-me" style={{ margin: '0', borderRadius: '8px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', fontWeight: 'bold' }}>
                    {(rankingTab === 'rank5' ? myRankingInfo5 : myRankingInfo10).rank}位: {(rankingTab === 'rank5' ? myRankingInfo5 : myRankingInfo10).user.username || 'あなた'}
                    <span style={{
                      display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%',
                      backgroundColor: '#2ecc71', marginLeft: '6px', boxShadow: `0 0 4px #2ecc71`
                    }} title="オンライン"></span>
                    {/* ★ Ver3.3.2 同順位の表記を →(±0) に修正 */}
                    {(rankingTab === 'rank5' ? myRankingInfo5 : myRankingInfo10).user[rankingTab === 'rank5' ? 'rating5Trend' : 'rating10Trend'] === 'up' && <span style={{ color: '#e74c3c', marginLeft: '6px', fontWeight: 'bold' }}>↑{(rankingTab === 'rank5' ? myRankingInfo5 : myRankingInfo10).user[rankingTab === 'rank5' ? 'rating5DiffVal' : 'rating10DiffVal']}</span>}
                    {(rankingTab === 'rank5' ? myRankingInfo5 : myRankingInfo10).user[rankingTab === 'rank5' ? 'rating5Trend' : 'rating10Trend'] === 'down' && <span style={{ color: '#3498db', marginLeft: '6px', fontWeight: 'bold' }}>↓{(rankingTab === 'rank5' ? myRankingInfo5 : myRankingInfo10).user[rankingTab === 'rank5' ? 'rating5DiffVal' : 'rating10DiffVal']}</span>}
                    {(rankingTab === 'rank5' ? myRankingInfo5 : myRankingInfo10).user[rankingTab === 'rank5' ? 'rating5Trend' : 'rating10Trend'] === 'same' && <span style={{ color: '#7f8c8d', marginLeft: '6px', fontWeight: 'bold' }}>→(±0)</span>}
                  </span>
                  <span style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
                    {(rankingTab === 'rank5' ? myRankingInfo5 : myRankingInfo10).user[rankingTab === 'rank5' ? 'rating5' : 'rating10'] || userData[rankingTab === 'rank5' ? 'rating5' : 'rating10']} Pt
                    <span style={{ marginLeft: '10px', fontSize: '11px' }}>
                      {(rankingTab === 'rank5' ? myRankingInfo5 : myRankingInfo10).user[rankingTab === 'rank5' ? 'rating5RatingTrend' : 'rating10RatingTrend'] === 'up' && <span style={{ color: '#e74c3c' }}>(+{(rankingTab === 'rank5' ? myRankingInfo5 : myRankingInfo10).user[rankingTab === 'rank5' ? 'rating5RatingDiffVal' : 'rating10RatingDiffVal']})</span>}
                      {(rankingTab === 'rank5' ? myRankingInfo5 : myRankingInfo10).user[rankingTab === 'rank5' ? 'rating5RatingTrend' : 'rating10RatingTrend'] === 'down' && <span style={{ color: '#3498db' }}>(-{(rankingTab === 'rank5' ? myRankingInfo5 : myRankingInfo10).user[rankingTab === 'rank5' ? 'rating5RatingDiffVal' : 'rating10RatingDiffVal']})</span>}
                      {(rankingTab === 'rank5' ? myRankingInfo5 : myRankingInfo10).user[rankingTab === 'rank5' ? 'rating5RatingTrend' : 'rating10RatingTrend'] === 'same' && <span style={{ color: '#7f8c8d' }}>(±0)</span>}
                    </span>
                  </span>
                </div>
              </div>
            )}

            <button className="back-btn" onClick={() => setCurrentScreen('menu')}>戻る</button>
          </div>
        )}

        {/* ★ Ver3.2: プロフィール画面をタブ切り替え式に刷新 */}
        {currentScreen === 'profile' && (
          <div className="sub-screen profile-screen">
            <h2>プロフィール</h2>
            <div className="profile-card">
              <div className="profile-row"><span className="label">ユーザーネーム:</span><span className="val">{userData.username}</span></div>
              <div className="profile-row">
                 <span className="label">レーティング (5戦/10戦):</span>
                 <span className="val highlight">{userData.rating5} / {userData.rating10} Pt</span>
              </div>
              <div className="profile-row">
                 <span className="label">最高レーティング (5/10):</span>
                 <span className="val">{userData.maxRating5} / {userData.maxRating10} Pt</span>
              </div>
              <div className="profile-row">
                 <span className="label">最高順位 (5/10):</span>
                 <span className="val" style={{ fontWeight: 'bold', color: '#e67e22' }}>
                    {userData.bestRank5 ? `${userData.bestRank5} 位` : '-'} / {userData.bestRank10 ? `${userData.bestRank10} 位` : '-'}
                 </span>
              </div>
              <hr />

              <div className="profile-tabs" style={{ display: 'flex', justifyContent: 'space-around', marginBottom: '15px' }}>
                <button 
                  style={{ flex: 1, padding: '5px', fontSize: '12px', borderBottom: profileTab === 'rank5' ? `3px solid ${userData.themeColor}` : 'none', background: 'none', border: 'none', color: profileTab === 'rank5' ? userData.themeColor : '#7f8c8d', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s' }}
                  onClick={() => setProfileTab('rank5')}
                >ランク(5戦)</button>
                <button 
                  style={{ flex: 1, padding: '5px', fontSize: '12px', borderBottom: profileTab === 'rank10' ? `3px solid ${userData.themeColor}` : 'none', background: 'none', border: 'none', color: profileTab === 'rank10' ? userData.themeColor : '#7f8c8d', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s' }}
                  onClick={() => setProfileTab('rank10')}
                >ランク(10戦)</button>
                <button 
                  style={{ flex: 1, padding: '5px', fontSize: '12px', borderBottom: profileTab === 'room' ? `3px solid ${userData.themeColor}` : 'none', background: 'none', border: 'none', color: profileTab === 'room' ? userData.themeColor : '#7f8c8d', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s' }}
                  onClick={() => setProfileTab('room')}
                >ルーム戦</button>
                <button 
                  style={{ flex: 1, padding: '5px', fontSize: '12px', borderBottom: profileTab === 'cpu' ? `3px solid ${userData.themeColor}` : 'none', background: 'none', border: 'none', color: profileTab === 'cpu' ? userData.themeColor : '#7f8c8d', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s' }}
                  onClick={() => setProfileTab('cpu')}
                >CPU戦</button>
              </div>

              {(() => {
                const stats = userData.stats ? userData.stats[profileTab] : { wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, disconnects: 0 };
                const tGames = stats?.totalGames || 0;
                const wins = stats?.wins || [0,0,0,0];
                const cRate = (count) => tGames === 0 ? '0%' : `${((count / tGames) * 100).toFixed(1)}%`;
                
                return (
                  <div className="stats-content" style={{ animation: 'fadeIn 0.3s ease-in-out' }}>
                    <h4 style={{ margin: '0 0 10px 0', textAlign: 'center', color: '#2c3e50' }}>各順位獲得確率 (計 {tGames}戦)</h4>
                    <div className="stats-grid">
                      <div style={{ backgroundColor: '#fdfefe', padding: '5px', borderRadius: '4px' }}>1位: {cRate(wins[0])}</div>
                      <div style={{ backgroundColor: '#fdfefe', padding: '5px', borderRadius: '4px' }}>2位: {cRate(wins[1])}</div>
                      <div style={{ backgroundColor: '#fdfefe', padding: '5px', borderRadius: '4px' }}>3位: {cRate(wins[2])}</div>
                      <div style={{ backgroundColor: '#fdfefe', padding: '5px', borderRadius: '4px' }}>4位: {cRate(wins[3])}</div>
                    </div>
                    <hr style={{ margin: '15px 0', border: 'none', borderTop: '1px solid #ecf0f1' }} />
                    <div className="profile-row"><span className="label">現在の連勝数:</span><span className="val">{stats?.currentWinStreak || 0} 連勝</span></div>
                    <div className="profile-row"><span className="label">最多連勝数:</span><span className="val">{stats?.maxWinStreak || 0} 連勝</span></div>
                    <div className="profile-row"><span className="label">切断数:</span><span className="val" style={{ color: '#e74c3c', fontWeight: 'bold' }}>{stats?.disconnects || 0} 回</span></div>
                  </div>
                );
              })()}

            </div>
            <button className="back-btn" onClick={() => setCurrentScreen('menu')}>戻る</button>
          </div>
        )}

        {currentScreen === 'settings' && (
          <div className="sub-screen settings-screen">
            <h2>設定</h2>

            <div className="setting-item">
              <label>ユーザーネーム変更</label>
              <input type="text" style={{ fontSize: '1.1rem', padding: '8px 12px', width: '100%', boxSizing: 'border-box' }} value={userData.username} onChange={(e) => saveUserData({ ...userData, username: e.target.value })} maxLength={10} />
            </div>

            <div className="setting-item" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ width: '48%' }}>
                <label>背景色</label>
                <input type="color" value={userData.bgColor} onChange={(e) => saveUserData({ ...userData, bgColor: e.target.value, bgImage: '' })} style={{ width: '100%' }} />
              </div>
              <div style={{ width: '48%' }}>
                <label>ボタンの色 (テーマ)</label>
                <input type="color" value={userData.themeColor || '#3498db'} onChange={(e) => saveUserData({ ...userData, themeColor: e.target.value })} style={{ width: '100%' }} />
              </div>
            </div>

            <div className="setting-item">
              <label>トランプのデザイン</label>
              <select value={userData.cardDesign} onChange={(e) => saveUserData({ ...userData, cardDesign: e.target.value })}>
                <option value="classic">クラシック (推奨)</option>
                <option value="modern">モダン</option>
                <option value="simple">シンプル</option>
              </select>
            </div>

            <div className="setting-item">
              <label>カードのサイズ</label>
              <select value={userData.cardSize} onChange={(e) => saveUserData({ ...userData, cardSize: e.target.value })}>
                <option value="x-small">極小</option>
                <option value="small">小</option>
                <option value="medium">中</option>
                <option value="large">大</option>
                <option value="x-large">極大</option>
              </select>
            </div>
            
            <div className="setting-item">
              <label>UI/UXレイアウト</label>
              <select value={userData.uiMode || 'mobile'} onChange={(e) => saveUserData({ ...userData, uiMode: e.target.value })}>
                <option value="mobile">モバイル版 (デフォルト)</option>
                <option value="desktop">パソコン版</option>
              </select>
            </div>

            <div style={{ marginTop: '15px', textAlign: 'center', backgroundColor: '#fdfefe', padding: '15px', borderRadius: '8px', border: '1px solid #bdc3c7' }}>
              <h4 style={{ margin: '0 0 10px 0', color: '#2c3e50' }}>🔐 アカウント連携</h4>
              <button className="action-btn" style={{ backgroundColor: '#2ecc71', width: '100%', marginBottom: '10px' }} onClick={() => setShowAccountRegisterModal(true)}>
                🔑 アカウント登録（パスワード設定）
              </button>
              <button className="action-btn" style={{ backgroundColor: '#f39c12', width: '100%' }} onClick={() => setShowLoginModal(true)}>
                🔄 別の登録アカウントに移動する
              </button>
            </div>

            <div className="setting-rules-box" style={{ marginTop: '15px' }}>
              <h4>📜 採用ルール一覧</h4>
              <ul className="rules-mini-list">
                <li><strong>🔒 スート縛り:</strong> 同じマーク(複数枚も可)が3連続で出ると、場が流れるまで同マークしか出せません。</li>
                <li><strong>🚫 禁止上がり:</strong> 8/Joker/最強カードでの上がり禁止</li>
                <li><strong>革命:</strong> 4枚以上同時出しで即座に強さ反転</li>
                <li><strong>8切り:</strong> 8を出して場を流す</li>
                <li><strong>11バック:</strong> Jを出してターン中強さ反転</li>
                <li><strong>スペ3返し:</strong> ジョーカー単体に♠3で勝利</li>
                <li><strong>都落ち:</strong> 前回大富豪未達成で最下位</li>
                <li><strong>🔄 カード交換:</strong> 2試合目以降、順位に応じて交換</li>
                <li><strong>🏆 ポイント制:</strong> 1位+2Pt / 2位+1Pt / 3位-1Pt / 4位-2Pt</li>
                <li><strong>レーティング計算:</strong> 公平なレート補正計算</li>
              </ul>
            </div>

            <div className="setting-rules-box" style={{ marginTop: '15px' }}>
              <h4>💻 推奨利用環境</h4>
              <p style={{ fontSize: '11px', margin: '5px 0', color: '#555' }}>
                より快適にプレイしていただくため、最新版の Safari, Chrome, Edge などのブラウザのご利用を推奨します。
              </p>
            </div>

            <div style={{ marginTop: '15px', textAlign: 'center' }}>
              <button className="action-btn" style={{ backgroundColor: '#3498db', width: '100%' }} onClick={() => setShowUpdateModal(true)}>
                📢 更新情報 (リリースノート) を確認
              </button>
            </div>

            <div style={{ marginTop: '10px', textAlign: 'center' }}>
              <button className="action-btn warning-btn" style={{ backgroundColor: '#e74c3c', width: '100%' }} onClick={() => setShowDeleteDataModal(true)}>
                🗑 全データを削除して初期化
              </button>
            </div>

            <button className="back-btn" onClick={() => setCurrentScreen('menu')}>戻る</button>
          </div>
        )}

      </div>
      )}
    </div>
  );
}

export default App;


