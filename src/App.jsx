import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { db, rtdb } from './firebase';
import { collection, doc, setDoc, deleteDoc, getDocs, getDoc } from 'firebase/firestore';
import { ref, set, get, update, onValue, off, push, remove } from 'firebase/database';

// --- アプリの更新履歴 ---
const UPDATE_HISTORY = [
  {
    version: '2.1.1',
    features: [
      '⚙️ 微調整を行いました。'
    ]
  },
  {
    version: '2.1',
    features: [
      '🤖 AIプレイヤーを一気に20人追加し、合計40人のAIがランク戦に参戦するようになりました！'
    ]
  },
  {
    version: '2.0.2',
    features: [
      '🤖 AIプレイヤーを新たに8人追加し、合計20人のAIが参戦するようになりました。'
    ]
  },
  {
    version: '2.0.1',
    features: [
      '📊 ランキングの空白部分に現在の自分を表示するようにしました。'
    ]
  },
  {
    version: '1.9.5',
    features: [
      '🤖 AIプレイヤーをさらに4人追加し、合計12人のAIが参戦するようになりました。',
      '⚡ ランク戦に複数人が参加した際に動作が重くなる問題を修正し、通信パフォーマンスを大幅に改善しました。'
    ]
  },
  {
    version: '1.9.4',
    features: [
      '🤖 AIプレイヤーのステータス表示を修正し、試合中の場合は黄色ライトが点灯するようにしました。'
    ]
  },
  {
    version: '1.9.3',
    features: [
      '🤖 AIプレイヤーを新たに5人追加し、合計8人のAIがランク戦に参戦するようになりました。'
    ]
  },
  {
    version: '1.9.2',
    features: [
      '🐛 バグ修正と微調整を行いました。'
    ]
  },
  {
    version: '1.9.1',
    features: [
      '🤖 AIプレイヤーの思考を改善し、8の使い方をより戦略的に考えるようにしました。',
      '⚔️ AIプレイヤーがAI同士（コンピュータを含む）でバックグラウンドでランク戦を行い、レーティングを競い合うようになりました。'
    ]
  },
  {
    version: '1.9',
    features: [
      '🤖 新機能「AIプレイヤー」を追加しました！自ら思考しランク戦を行い、レーティングランキングにも参加する3人のAI（AI_Alpha, AI_Beta, AI_Gamma）が登場します。'
    ]
  },
  {
    version: '1.8',
    features: [
      '🔒 新ルール「スート縛り」を追加しました。同じマーク（複数枚も可能）が3連続で出されると、場が流れるまで同じマークしか出せなくなります！'
    ]
  },
  {
    version: '1.7.3',
    features: [
      '🐛 バグを修正しました。'
    ]
  },
  {
    version: '1.7.2',
    features: [
      '🐛 バグを修正しました。'
    ]
  },
  {
    version: '1.7.1',
    features: [
      '🐛 バグを修正しました。'
    ]
  },
  {
    version: '1.7',
    features: [
      '🚀 ランク戦の大幅改善を行いました。'
    ]
  },
  {
    version: '1.6.4',
    features: [
      '🐛 バグを修正しました。'
    ]
  },
  {
    version: '1.6.3',
    features: [
      '⚙️ 微調整を行いました。'
    ]
  },
  {
    version: '1.6.2',
    features: [
      '🐛 バグ修正を行いました。'
    ]
  },
  {
    version: '1.6.1',
    features: [
      '⚙️ 微調整を行いました。'
    ]
  },
  {
    version: '1.6',
    features: [
      '📊 レーティング計算システムの変更: 低レーティング（800以下）のプレイヤーのレーティング上昇率を増加させました。',
      '⚖️ レーティング増減バランスの調整: レートが高いほど上昇しづらく減少しやすく、低いほど上昇しやすく減少しづらくなる補正を追加しました。'
    ]
  },
  {
    version: '1.5.1',
    features: [
      '🐛 バグ修正: 他のプレイヤーがカードを出した際にパス状態がリセットされ、再び手番が回ってきた際にカードを出せるように修正しました。',
      '♠️ システム変更: ジョーカーに対してスペードの3（スペ3返し）を出した際、8切りと同様に場が流れて自分のターンが継続するようになりました。'
    ]
  },
  {
    version: '1.5',
    features: [
      '⏱ ランク戦に持ち時間を追加: 1手あたり30秒の制限時間を設定しました。（秒数は画面左下に表示されます）',
      '⚠️ 時間切れや切断時の対応: プレイヤーが放置・切断した場合は、自動的にコンピュータが代行してカードを出すようになりました。'
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
  let baseChange = 0;
  if (myRank === 0) baseChange = 16;
  else if (myRank === 1) baseChange = 6;
  else if (myRank === 2) baseChange = -6;
  else if (myRank === 3) baseChange = -16;

  let diffBonus = 0;
  for (let i = 0; i < 4; i++) {
    if (i === myRank) continue;
    const oppRating = allRatings[finalRankings[i]];
    const diff = oppRating - myRating;
    diffBonus += diff * 0.04; 
  }

  let rawChange = baseChange + diffBonus;
  
  let factor = 1000 / Math.max(400, myRating); 
  factor = Math.pow(factor, 0.6); 

  let change = 0;
  if (rawChange > 0) {
    change = rawChange * factor;
    if (myRating <= 800) {
      change *= 1.5; 
    }
  } else {
    change = rawChange / Math.max(0.3, factor);
  }

  change = Math.round(change);

  if (myRank === 0 && change <= 0) change = 1;
  if (myRank === 3 && change >= 0) change = -1;

  return change;
};

// プレイヤーのレーティングに比例したCPUのレーティング生成
const generateCpuRating = (playerRating) => {
  const pRating = Math.max(100, playerRating || 500);
  
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
  const [currentScreen, setCurrentScreen] = useState('menu');

  const [userData, setUserData] = useState(() => {
    const saved = localStorage.getItem('daifugo_user');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (!parsed.userId) parsed.userId = 'user_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        if (parsed.hasCompleted163Settings === undefined) parsed.hasCompleted163Settings = false;
        return parsed;
      } catch (e) {}
    }
    return {
      userId: 'user_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      username: '',
      rating: 500,
      maxRating: 500,
      wins: [0, 0, 0, 0],
      totalGames: 0,
      currentWinStreak: 0,
      maxWinStreak: 0,
      bgColor: '#2c3e50',
      bgImage: '',
      volume: 50,
      cardDesign: 'mark',
      cardSize: 'medium',
      lastSeenVersion: '',
      hasCompleted163Settings: false
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

  const [globalRankings, setGlobalRankings] = useState([]);
  const [myRankingInfo, setMyRankingInfo] = useState(null);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [rankingError, setRankingError] = useState('');
  
  const [roomId, setRoomId] = useState(null);
  const [roomData, setRoomData] = useState(null);
  const [roomTimer, setRoomTimer] = useState(30); // ★ 初期値を30に変更

  const [isRankMatch, setIsRankMatch] = useState(false);
  const [matchCount, setMatchCount] = useState(1);
  const [scores, setScores] = useState([0, 0, 0, 0]);
  const [prevRanks, setPrevRanks] = useState([0, 1, 2, 3]);
  const [players, setPlayers] = useState(['あなた', 'CPU 1', 'CPU 2', 'CPU 3']);
  const [playerRatings, setPlayerRatings] = useState([500, 500, 500, 500]);
  const [isOnlineMode, setIsOnlineMode] = useState(false);
  const [mySlot, setMySlot] = useState(0);

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

  const isReversedEffective = isRevolution !== is11Back;

  // ★ AIプレイヤーの初期セットアップとランク戦シミュレーション
  useEffect(() => {
    const runAISimulation = async () => {
      // 40人のAIを登録
      const aiIds = Array.from({ length: 40 }, (_, i) => `ai_player_${i + 1}`);
      const aiData = [];
      for (const id of aiIds) {
         try {
           const d = await getDoc(doc(db, 'users', id));
           if (d.exists()) aiData.push(d.data());
         } catch(e){}
      }
      
      if (aiData.length === 40) {
        const lastUpdate = Math.min(...aiData.map(a => a.updatedAt || 0));
        const now = Date.now();
        // 10分経過するごとに1試合シミュレート (最大30試合分)
        const matchCount = Math.min(30, Math.floor((now - lastUpdate) / 600000));
        
        let simPlayers = [...aiData];
        let needsUpdate = false;

        // Playingのスタック解消（1時間以上スタックしていたら解除）
        for (let ai of simPlayers) {
           if (ai.status === 'playing' && (now - (ai.updatedAt || 0)) > 60 * 60000) {
               ai.status = 'online';
               needsUpdate = true;
           }
        }

        if (matchCount > 0) {
           needsUpdate = true;
           for (let m = 0; m < matchCount; m++) {
              const mobRating = 1000 + Math.floor(Math.random() * 500);
              const shuffledAI = [...simPlayers].sort(() => Math.random() - 0.5);
              const selectedAI = shuffledAI.slice(0, 3);
              const playersForMatch = [...selectedAI, { userId: 'mob', rating: mobRating }];
              playersForMatch.sort(() => Math.random() - 0.5);
              // レート補正で少し順位をいじる
              playersForMatch.sort((a, b) => b.rating - a.rating + (Math.random() * 800 - 400));
              
              const currentRatings = playersForMatch.map(p => p.rating);
              for (let i = 0; i < 4; i++) {
                 if (playersForMatch[i].userId !== 'mob') {
                    const aiTarget = simPlayers.find(ai => ai.userId === playersForMatch[i].userId);
                    const change = calcRating(aiTarget.rating, currentRatings, i, [0,1,2,3]);
                    aiTarget.rating = Math.max(0, aiTarget.rating + change);
                    aiTarget.maxRating = Math.max(aiTarget.maxRating || 0, aiTarget.rating);
                    aiTarget.wins[i] += 1;
                    aiTarget.totalGames += 1;
                    aiTarget.currentWinStreak = (i === 0) ? (aiTarget.currentWinStreak || 0) + 1 : 0;
                    aiTarget.maxWinStreak = Math.max(aiTarget.maxWinStreak || 0, aiTarget.currentWinStreak);
                 }
              }
           }
        }
        
        // ステータスのランダム変更と保存
        if (matchCount > 0 || needsUpdate) {
            for (const ai of simPlayers) {
               if (ai.status !== 'playing') {
                  ai.status = Math.random() < 0.8 ? 'online' : 'offline';
               }
               if (matchCount > 0) ai.updatedAt = now;
               try {
                 await setDoc(doc(db, 'users', ai.userId), ai, { merge: true });
               } catch(e){}
            }
        }
      }
    };
    
    const initAIPlayers = async () => {
      const aiPlayers = [
        { userId: 'ai_player_1', username: 'AI_Alpha', rating: 1000, maxRating: 1000, wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, isAIPlayer: true, status: 'online' },
        { userId: 'ai_player_2', username: 'AI_Beta', rating: 1200, maxRating: 1200, wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, isAIPlayer: true, status: 'online' },
        { userId: 'ai_player_3', username: 'AI_Gamma', rating: 1500, maxRating: 1500, wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, isAIPlayer: true, status: 'online' },
        { userId: 'ai_player_4', username: 'AI_Delta', rating: 900, maxRating: 900, wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, isAIPlayer: true, status: 'online' },
        { userId: 'ai_player_5', username: 'AI_Epsilon', rating: 1100, maxRating: 1100, wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, isAIPlayer: true, status: 'online' },
        { userId: 'ai_player_6', username: 'AI_Zeta', rating: 1300, maxRating: 1300, wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, isAIPlayer: true, status: 'online' },
        { userId: 'ai_player_7', username: 'AI_Eta', rating: 1400, maxRating: 1400, wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, isAIPlayer: true, status: 'online' },
        { userId: 'ai_player_8', username: 'AI_Theta', rating: 1600, maxRating: 1600, wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, isAIPlayer: true, status: 'online' },
        { userId: 'ai_player_9', username: 'AI_Iota', rating: 1050, maxRating: 1050, wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, isAIPlayer: true, status: 'online' },
        { userId: 'ai_player_10', username: 'AI_Kappa', rating: 1250, maxRating: 1250, wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, isAIPlayer: true, status: 'online' },
        { userId: 'ai_player_11', username: 'AI_Lambda', rating: 1450, maxRating: 1450, wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, isAIPlayer: true, status: 'online' },
        { userId: 'ai_player_12', username: 'AI_Mu', rating: 1700, maxRating: 1700, wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, isAIPlayer: true, status: 'online' },
        { userId: 'ai_player_13', username: 'AI_Nu', rating: 950, maxRating: 950, wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, isAIPlayer: true, status: 'online' },
        { userId: 'ai_player_14', username: 'AI_Xi', rating: 1150, maxRating: 1150, wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, isAIPlayer: true, status: 'online' },
        { userId: 'ai_player_15', username: 'AI_Omicron', rating: 1350, maxRating: 1350, wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, isAIPlayer: true, status: 'online' },
        { userId: 'ai_player_16', username: 'AI_Pi', rating: 1550, maxRating: 1550, wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, isAIPlayer: true, status: 'online' },
        { userId: 'ai_player_17', username: 'AI_Rho', rating: 850, maxRating: 850, wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, isAIPlayer: true, status: 'online' },
        { userId: 'ai_player_18', username: 'AI_Sigma', rating: 1080, maxRating: 1080, wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, isAIPlayer: true, status: 'online' },
        { userId: 'ai_player_19', username: 'AI_Tau', rating: 1280, maxRating: 1280, wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, isAIPlayer: true, status: 'online' },
        { userId: 'ai_player_20', username: 'AI_Upsilon', rating: 1480, maxRating: 1480, wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, isAIPlayer: true, status: 'online' },
        { userId: 'ai_player_21', username: 'AI_Phi', rating: 1020, maxRating: 1020, wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, isAIPlayer: true, status: 'online' },
        { userId: 'ai_player_22', username: 'AI_Chi', rating: 1220, maxRating: 1220, wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, isAIPlayer: true, status: 'online' },
        { userId: 'ai_player_23', username: 'AI_Psi', rating: 1420, maxRating: 1420, wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, isAIPlayer: true, status: 'online' },
        { userId: 'ai_player_24', username: 'AI_Omega', rating: 1620, maxRating: 1620, wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, isAIPlayer: true, status: 'online' },
        { userId: 'ai_player_25', username: 'AI_Aries', rating: 820, maxRating: 820, wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, isAIPlayer: true, status: 'online' },
        { userId: 'ai_player_26', username: 'AI_Taurus', rating: 1120, maxRating: 1120, wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, isAIPlayer: true, status: 'online' },
        { userId: 'ai_player_27', username: 'AI_Gemini', rating: 1320, maxRating: 1320, wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, isAIPlayer: true, status: 'online' },
        { userId: 'ai_player_28', username: 'AI_Cancer', rating: 1520, maxRating: 1520, wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, isAIPlayer: true, status: 'online' },
        { userId: 'ai_player_29', username: 'AI_Leo', rating: 980, maxRating: 980, wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, isAIPlayer: true, status: 'online' },
        { userId: 'ai_player_30', username: 'AI_Virgo', rating: 1180, maxRating: 1180, wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, isAIPlayer: true, status: 'online' },
        { userId: 'ai_player_31', username: 'AI_Libra', rating: 1380, maxRating: 1380, wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, isAIPlayer: true, status: 'online' },
        { userId: 'ai_player_32', username: 'AI_Scorpio', rating: 1580, maxRating: 1580, wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, isAIPlayer: true, status: 'online' },
        { userId: 'ai_player_33', username: 'AI_Sagittarius', rating: 880, maxRating: 880, wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, isAIPlayer: true, status: 'online' },
        { userId: 'ai_player_34', username: 'AI_Capricorn', rating: 1060, maxRating: 1060, wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, isAIPlayer: true, status: 'online' },
        { userId: 'ai_player_35', username: 'AI_Aquarius', rating: 1260, maxRating: 1260, wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, isAIPlayer: true, status: 'online' },
        { userId: 'ai_player_36', username: 'AI_Pisces', rating: 1460, maxRating: 1460, wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, isAIPlayer: true, status: 'online' },
        { userId: 'ai_player_37', username: 'AI_Orion', rating: 1660, maxRating: 1660, wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, isAIPlayer: true, status: 'online' },
        { userId: 'ai_player_38', username: 'AI_Lyra', rating: 920, maxRating: 920, wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, isAIPlayer: true, status: 'online' },
        { userId: 'ai_player_39', username: 'AI_Cygnus', rating: 1160, maxRating: 1160, wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, isAIPlayer: true, status: 'online' },
        { userId: 'ai_player_40', username: 'AI_Draco', rating: 1360, maxRating: 1360, wins: [0,0,0,0], totalGames: 0, currentWinStreak: 0, maxWinStreak: 0, isAIPlayer: true, status: 'online' }
      ];
      let needsInit = false;
      for (const ai of aiPlayers) {
        try {
          const docRef = doc(db, 'users', ai.userId);
          const docSnap = await getDoc(docRef);
          if (!docSnap.exists()) {
            await setDoc(docRef, { ...ai, updatedAt: Date.now() });
            needsInit = true;
          }
        } catch (e) {}
      }
      
      if (!needsInit) {
         runAISimulation();
      }
    };
    initAIPlayers();
  }, []);

  // 初期ロード時のペナルティチェック
  useEffect(() => {
    const penaltyFlag = localStorage.getItem('daifugo_penalty_flag');
    if (penaltyFlag === 'true') {
      setUserData(prev => {
        const newRating = Math.floor(prev.rating * 0.9);
        const updated = { ...prev, rating: newRating, currentWinStreak: 0 };
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
    const isAnyModalOpen = showRegisterModal || showRecommendModal || showRulesModal || showUpdateModal || showDisconnectPenaltyModal;
    if (userData.username && !userData.hasCompleted163Settings && !isAnyModalOpen) {
      setShowInitialSettingsModal(true);
    }
  }, [userData.username, userData.hasCompleted163Settings, showRegisterModal, showRecommendModal, showRulesModal, showUpdateModal, showDisconnectPenaltyModal]);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isOnlineMode && isRankMatch && currentScreen === 'game' && roomId && roomData) {
        const updatedPlayers = [...(roomData.players || [])];
        if (updatedPlayers[mySlot] && !updatedPlayers[mySlot].isCpu) {
          updatedPlayers[mySlot] = { userId: `cpu_${mySlot}`, name: `CPU (代行)`, rating: userData.rating, isCpu: true, isSubstitute: true };
          update(ref(rtdb, `rooms/${roomId}`), { players: updatedPlayers });
        }
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isOnlineMode, isRankMatch, currentScreen, roomId, roomData, mySlot, userData.rating]);

  const handleCloseUpdate = () => {
    setShowUpdateModal(false);
    if (userData.lastSeenVersion !== CURRENT_VERSION) {
      saveUserData({ ...userData, lastSeenVersion: CURRENT_VERSION });
    }
  };

  const saveUserData = async (newData) => {
    setUserData(newData);
    localStorage.setItem('daifugo_user', JSON.stringify(newData));

    if (newData.username && newData.userId) {
      try {
        await setDoc(doc(db, 'users', newData.userId), {
          userId: newData.userId, username: newData.username, rating: newData.rating,
          maxRating: newData.maxRating, wins: newData.wins, totalGames: newData.totalGames,
          currentWinStreak: newData.currentWinStreak, maxWinStreak: newData.maxWinStreak,
          updatedAt: Date.now()
        }, { merge: true });
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
    const updated = { ...userData, username: inputUsername.trim(), lastSeenVersion: CURRENT_VERSION };
    saveUserData(updated);
    setShowRegisterModal(false);
    setShowRecommendModal(true);
  };

  const handleCloseRecommend = () => {
    setShowRecommendModal(false);
    setShowRulesModal(true);
  };

  const fetchRankings = async () => {
    setRankingLoading(true); setRankingError('');
    try {
      const snapshot = await getDocs(collection(db, 'users'));
      const list = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data && data.username) list.push(data);
      });
      list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      setGlobalRankings(list.slice(0, 50));

      const myIndex = list.findIndex(u => u.userId === userData.userId);
      if (myIndex !== -1) {
        setMyRankingInfo({
          rank: myIndex + 1,
          user: list[myIndex]
        });
      } else {
        setMyRankingInfo({
          rank: '-',
          user: userData
        });
      }
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
            setIsRankMatch(data.type === 'rank');
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
            // 人間がいなくなったらAIのステータスを解放
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

  const joinRankMatch = async () => {
    if (roomId) {
      await leaveRoomById(roomId, userData.userId);
      setRoomId(null); setRoomData(null);
    }
    // ★ Ver.2.1.1: 待機時間を30秒に変更
    setIsRankMatch(true); setIsOnlineMode(true); setCurrentScreen('waiting_rank'); setRoomTimer(30);
    const roomsRef = ref(rtdb, 'rooms');
    const snapshot = await get(roomsRef);
    const rooms = snapshot.val() || {};
    let targetRoomId = null; let targetRoom = null;

    for (let rId in rooms) {
      const r = rooms[rId];
      if (r.type === 'rank' && r.status === 'waiting' && r.players) {
        const activeCount = r.players.filter(p => p.userId !== userData.userId).length;
        if (activeCount < 4) {
          targetRoomId = rId; targetRoom = r; break;
        }
      }
    }

    if (targetRoomId) {
      const existingPlayers = (targetRoom.players || []).filter(p => p.userId !== userData.userId);
      setMySlot(existingPlayers.length);
      const updatedPlayers = [...existingPlayers, { userId: userData.userId, name: userData.username, rating: userData.rating, isCpu: false }];
      setRoomId(targetRoomId);
      await update(ref(rtdb, `rooms/${targetRoomId}`), { players: updatedPlayers });
      if (updatedPlayers.length === 4) executeStartOnlineMatch(targetRoomId, updatedPlayers);
    } else {
      const newRoomRef = push(ref(rtdb, 'rooms'));
      setMySlot(0); setRoomId(newRoomRef.key);
      await set(newRoomRef, {
        roomId: newRoomRef.key, type: 'rank', status: 'waiting', hostId: userData.userId,
        players: [{ userId: userData.userId, name: userData.username, rating: userData.rating, isCpu: false }]
      });
    }
  };

  const createRoom = async () => {
    if (roomId) {
      await leaveRoomById(roomId, userData.userId);
      setRoomId(null); setRoomData(null);
    }
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    setIsRankMatch(false); setIsOnlineMode(true); setMySlot(0); setRoomId(`room_${code}`);
    await set(ref(rtdb, `rooms/room_${code}`), {
      roomId: `room_${code}`, code: code, type: 'room', status: 'waiting', hostId: userData.userId,
      players: [{ userId: userData.userId, name: userData.username, rating: userData.rating, isCpu: false }]
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
    const updatedPlayers = [...existingPlayers, { userId: userData.userId, name: userData.username, rating: userData.rating, isCpu: false }];
    await update(ref(rtdb, `rooms/${targetId}`), { players: updatedPlayers });
    setCurrentScreen('waiting_room');
  };

  const startOnlineGameWithCpu = async () => {
    if (!roomId || !roomData) return;
    let currentPlayers = [...(roomData.players || [])];
    
    let availableAIList = [];
    if (roomData.type === 'rank') {
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
    const baseRating = currentPlayers[0]?.rating || userData.rating;
    
    while (currentPlayers.length < 4) {
      if (roomData.type === 'rank' && availableAIList.length > 0) {
        const ai = availableAIList.pop();
        currentPlayers.push({ userId: ai.userId, name: ai.username, rating: ai.rating, isCpu: true, isAIPlayer: true });
        try { await setDoc(doc(db, 'users', ai.userId), { status: 'playing' }, { merge: true }); } catch(e){}
      } else {
        currentPlayers.push({ userId: `cpu_${cpuCount}`, name: `CPU ${cpuCount++}`, rating: generateCpuRating(baseRating), isCpu: true });
      }
    }
    executeStartOnlineMatch(roomId, currentPlayers);
  };

  const executeStartOnlineMatch = async (rId, playerList) => {
    const playerNames = playerList.map(p => p.name);
    const ratings = playerList.map(p => p.rating);
    
    await update(ref(rtdb, `rooms/${rId}`), { 
      status: 'playing', 
      players: playerList,
      gameState: {
         players: playerNames,
         playerRatings: ratings
      }
    });
    
    setPlayers(playerNames);
    setPlayerRatings(ratings);
    startNewGameSet(playerNames, isRankMatch, true);
  };

  // ★ パフォーマンス改善：ホスト側の同期送信
  useEffect(() => {
    if (isOnlineMode && isHost && roomId && currentScreen === 'game') {
      const stateToSync = {
        handsJSON: JSON.stringify(hands),
        turn, field: field || null, passed, rankingsThisMatch, fouledPlayers,
        isRevolution, is11Back, message, matchCount, scores, prevRanks,
        exchangePhase, exchangeCardsJSON: JSON.stringify(exchangeCards || {}),
        matchResultModal: matchResultModal || null,
        players, 
        playerRatings
      };
      set(ref(rtdb, `rooms/${roomId}/gameState`), stateToSync);
    }
  }, [hands, turn, field, passed, rankingsThisMatch, fouledPlayers, isRevolution, is11Back, message, matchCount, scores, prevRanks, exchangePhase, exchangeCards, matchResultModal, players, playerRatings, isOnlineMode, isHost, roomId, currentScreen]);

  // ★ ゲスト側の同期受信
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
          if (val.playerRatings && val.playerRatings.length === 4) setPlayerRatings([0, 1, 2, 3].map(i => val.playerRatings[i] || 500));

          if (val.gameOverData && !syncedGameOver) {
            setSyncedGameOver(true);
            finish5MatchGameSet(val.gameOverData.finalScores);
          }
        }
      });
      return () => off(gsRef);
    }
  }, [isOnlineMode, isHost, roomId, currentScreen, syncedGameOver]);

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
      remove(ref(rtdb, `rooms/${roomId}/requests/${req.id}`));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestsQueue]);

  const startNewGameSet = (playerList = ['あなた', 'CPU 1', 'CPU 2', 'CPU 3'], isRank = false, isOnline = false) => {
    if (!isOnline) {
      setPlayerRatings([
        userData.rating,
        generateCpuRating(userData.rating),
        generateCpuRating(userData.rating),
        generateCpuRating(userData.rating)
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
    setPassed([false, false, false, false]); setRankingsThisMatch([]); setFouledPlayers([]);
    setMessage(`${mCount}試合目 開始！`);

    const deck = shuffle(createDeck());
    const newHands = [[], [], [], []];
    for (let i = 0; i < 52; i++) newHands[i % 4].push(deck[i]);
    newHands[lastRanks[3]].push(deck[52]);

    for (let i = 0; i < 4; i++) sortHand(newHands[i], false);
    setHands(newHands);

    if (mCount > 1) {
      setExchangePhase(true); setExchangeCards({});
      setMessage('🔄 カード交換フェーズです');
    } else {
      setExchangePhase(false);
      let firstTurn = lastRanks[3];
      const d3Player = newHands.findIndex(h => h.some(c => c.suit === '♦' && c.num === 3));
      if (d3Player !== -1) firstTurn = d3Player;
      setTurn(firstTurn);
    }
  };

  useEffect(() => {
    if (exchangePhase && (!isOnlineMode || isHost)) {
      const newEx = { ...exchangeCards };
      let changed = false;
      for (let idx = 0; idx < 4; idx++) {
        const isCpuSlot = isOnlineMode ? roomData?.players?.[idx]?.isCpu : (idx !== 0);
        if (isCpuSlot && !newEx[idx]) {
          const rank = prevRanks.indexOf(idx);
          const reqCount = (rank === 0 || rank === 3) ? 2 : 1;
          newEx[idx] = (rank === 0 || rank === 1) ? hands[idx].slice(0, reqCount) : hands[idx].slice(-reqCount);
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
    const myRank = prevRanks.indexOf(mySlot);
    const reqCount = (myRank === 0 || myRank === 3) ? 2 : 1;
    let cardsToSubmit = selectedCards;
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

    if (isOnlineMode && roomId && roomData) {
      const updatedPlayers = [...(roomData.players || [])];
      if (updatedPlayers[mySlot]) {
        updatedPlayers[mySlot] = { userId: `cpu_${mySlot}`, name: `CPU (代行)`, rating: userData.rating, isCpu: true, isSubstitute: true };
      }
      await update(ref(rtdb, `rooms/${roomId}`), { players: updatedPlayers });

      if (isRankMatch) {
        const penaltyRating = Math.max(0, userData.rating - 15);
        saveUserData({ ...userData, rating: penaltyRating, totalGames: userData.totalGames + 1, currentWinStreak: 0 });
      }
      setRoomId(null); setRoomData(null); setMySlot(0);
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
      
      const isSubstitute = isOnlineMode && roomData?.players && roomData.players[turn]?.isSubstitute;
      const isAIPlayer = isOnlineMode && roomData?.players && roomData.players[turn]?.isAIPlayer;
      const cpuRating = playerRatings[turn];
      
      const move = findBestCpuMove(cpuHand, field, isReversedEffective, cpuRating, isSubstitute, hands, turn, isAIPlayer);
      
      const effectiveRating = isAIPlayer ? cpuRating * 2 : cpuRating;
      const isUltraAI = effectiveRating >= 2000;
      let thinkTime = 1000;

      if (isUltraAI) {
        if (!move) {
          thinkTime = Math.floor(Math.random() * 500) + 800; 
        } else {
          thinkTime = Math.floor(Math.random() * 2000) + 1500 + (cpuHand.length * 100);
        }
      }

      const cpuTimer = setTimeout(() => {
        if (move) playCards(turn, move); else passTurn(turn);
      }, thinkTime);
      return () => clearTimeout(cpuTimer);
    }
  }, [turn, field, hands, currentScreen, isReversedEffective, matchResultModal, roomData, isOnlineMode, isHost, exchangePhase, playerRatings]);

  const findBestCpuMove = (hand, currentField, isRev, cpuRating, isSubstitute = false, allHands = [], currentTurn = 0, isAIPlayer = false) => {
    const sorted = [...hand].sort((a, b) => getCardStrength(a.num, isRev) - getCardStrength(b.num, isRev));
    
    let someoneIsFinishing = false;
    if (allHands.length > 0) {
      for (let i=0; i<4; i++) {
        if (i !== currentTurn && allHands[i].length > 0 && allHands[i].length <= 2) {
          someoneIsFinishing = true;
        }
      }
    }

    const effectiveRating = isAIPlayer ? cpuRating * 2 : cpuRating;
    const isUltraAI = effectiveRating >= 2000;
    const isEnhancedAI = effectiveRating >= 1000; 
    const isSmart = isUltraAI || isEnhancedAI || ((Math.random() * 1000) < effectiveRating);
    const isVerySmart = isUltraAI || isEnhancedAI || (isSmart && ((Math.random() * 1000) < effectiveRating));

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

    if (isSubstitute) {
      return availableOptions[Math.floor(Math.random() * availableOptions.length)];
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

    if (isUltraAI || isEnhancedAI) {
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
          if (isSeq) return !combo.some(c => c.num === 0 || (isRev ? c.num===3 : c.num===2) || (isUltraAI && combo.length >= 4));
          return !combo.some(c => c.num === 8 || c.num === 11 || c.num === 0 || (isRev ? c.num===3 : c.num===2) || (isUltraAI && combo.length >= 4));
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
    const pts = [2, 1, 0, -1];
    const newScores = [...scores];
    fullRankings.forEach((playerIdx, rank) => { newScores[playerIdx] += pts[rank]; });

    setScores(newScores); setPrevRanks(fullRankings);
    if (matchCount < 5) {
      setMatchResultModal({ match: matchCount, rankings: fullRankings, scores: newScores });
    } else {
      if (isOnlineMode && isHost && roomId) {
        update(ref(rtdb, `rooms/${roomId}/gameState`), { gameOverData: { finalScores: newScores } });
      }
      finish5MatchGameSet(newScores);
    }
  };

  const finish5MatchGameSet = (finalScores) => {
    localStorage.removeItem('daifugo_penalty_flag');

    const playerIndices = [0, 1, 2, 3];
    playerIndices.sort((a, b) => finalScores[b] - finalScores[a]);

    const myFinalRank = playerIndices.indexOf(mySlot);
    const newWins = [...userData.wins];
    newWins[myFinalRank] += 1;
    let newStreak = (myFinalRank === 0) ? userData.currentWinStreak + 1 : 0;
    let ratingChange = 0; let newRating = userData.rating;

    if (isRankMatch) {
      ratingChange = calcRating(userData.rating, playerRatings, myFinalRank, playerIndices);
      newRating = Math.max(0, userData.rating + ratingChange);
    }

    const updatedUser = {
      ...userData, rating: newRating, maxRating: Math.max(userData.maxRating, newRating),
      wins: newWins, totalGames: userData.totalGames + 1, currentWinStreak: newStreak,
      maxWinStreak: Math.max(userData.maxWinStreak, newStreak)
    };
    saveUserData(updatedUser);

    setGameResultModal({ finalRankings: playerIndices, scores: finalScores, ratingChange, newRating });

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
                const aiChange = calcRating(aiData.rating, playerRatings, aiRank, playerIndices);
                const aiNewRating = Math.max(0, aiData.rating + aiChange);
                const aiNewWins = [...(aiData.wins || [0,0,0,0])];
                aiNewWins[aiRank] += 1;
                const aiNewStreak = (aiRank === 0) ? (aiData.currentWinStreak || 0) + 1 : 0;
                
                const newStatus = Math.random() < 0.8 ? 'online' : 'offline';

                await setDoc(aiDocRef, {
                  ...aiData,
                  rating: aiNewRating,
                  maxRating: Math.max(aiData.maxRating || 0, aiNewRating),
                  wins: aiNewWins,
                  totalGames: (aiData.totalGames || 0) + 1,
                  currentWinStreak: aiNewStreak,
                  maxWinStreak: Math.max(aiData.maxWinStreak || 0, aiNewStreak),
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

    if (isOnlineMode && roomId && roomData) {
      const updatedPlayers = [...(roomData.players || [])];
      if (updatedPlayers[mySlot]) {
        updatedPlayers[mySlot] = { userId: `cpu_${mySlot}`, name: `CPU (代行)`, rating: userData.rating, isCpu: true, isSubstitute: true };
      }
      await update(ref(rtdb, `rooms/${roomId}`), { players: updatedPlayers });

      if (isRankMatch) {
        const penaltyRating = Math.max(0, userData.rating - 15);
        saveUserData({ ...userData, rating: penaltyRating, totalGames: userData.totalGames + 1, currentWinStreak: 0 });
      }
      setRoomId(null); setRoomData(null); setMySlot(0);
    }
    setCurrentScreen('menu');
  };

  const toggleSelectCard = (card) => {
    if (selectedCards.some(c => c.id === card.id)) setSelectedCards(selectedCards.filter(c => c.id !== card.id));
    else setSelectedCards([...selectedCards, card]);
  };

  const handleUserPlay = () => {
    if (isValidPlay(selectedCards, field, isReversedEffective)) {
      if (isOnlineMode && !isHost) {
        push(ref(rtdb, `rooms/${roomId}/requests`), { type: 'play', playerIdx: mySlot, cardsJSON: JSON.stringify(selectedCards), ts: Date.now() });
        setSelectedCards([]);
      } else {
        playCards(mySlot, selectedCards);
      }
    } else { alert('そのカードは出せません！'); }
  };

  const handleUserPass = () => {
    if (isOnlineMode && !isHost) {
      push(ref(rtdb, `rooms/${roomId}/requests`), { type: 'pass', playerIdx: mySlot, ts: Date.now() });
    } else {
      passTurn(mySlot);
    }
  };

  const containerStyle = userData.bgImage ? { backgroundImage: `url(${userData.bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { backgroundColor: userData.bgColor };
  const calcRate = (count) => { return userData.totalGames === 0 ? '0%' : `${((count / userData.totalGames) * 100).toFixed(1)}%`; };

  return (
    <div className="app-outer" style={containerStyle}>
      <style>{`
        .card-item.x-small {
          width: 35px;
          height: 50px;
          font-size: 12px;
        }
        .card-item.x-large {
          width: 90px;
          height: 130px;
          font-size: 36px;
        }
      `}</style>
      <div className="app-container">

        {/* --- 初期設定(カードサイズ・デザイン)モーダル --- */}
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
                  <option value="mark">数字とマーク</option>
                  <option value="number">数字のみ</option>
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

        {/* --- ペナルティ警告モーダル --- */}
        {showDisconnectPenaltyModal && (
          <div className="modal-overlay">
            <div className="modal-content">
              <h3 style={{ margin: '0 0 10px 0', color: '#e74c3c' }}>⚠️ 警告</h3>
              <p style={{ fontSize: '13px', lineHeight: '1.5' }}>
                前回のランク戦中に不正な切断（サイト更新・終了など）が検知されました。<br />
                ペナルティとしてレーティングが <strong>10% 減少</strong> しました。
              </p>
              <button className="action-btn warning-btn" onClick={() => setShowDisconnectPenaltyModal(false)} style={{ marginTop: '15px' }}>確認しました</button>
            </div>
          </div>
        )}

        {/* --- 更新情報モーダル (蓄積型) --- */}
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
                  <li><strong>🏆 5試合総合ポイント制:</strong> 5試合行い、1位2Pt/2位1Pt/3位0Pt/4位-1Pt の合計で順位を競います。</li>
                  <li><strong>📊 レーティング計算:</strong> 1位は必ず上昇、4位は必ず下落。実数値に応じた公平なレーティング計算。</li>
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
            <p className="user-badge">ようこそ、{userData.username || 'ゲスト'} さん</p>

            <button className="menu-btn" onClick={() => setCurrentScreen('online_select')}>オンライン対戦</button>
            <button className="menu-btn" onClick={() => { setMySlot(0); startNewGameSet(['あなた', 'CPU 1', 'CPU 2', 'CPU 3'], false, false); }}>コンピュータ対戦</button>
            <button className="menu-btn" onClick={() => setCurrentScreen('ranking')}>全プレイヤーレーティングランキング</button>
            <button className="menu-btn" onClick={() => setCurrentScreen('profile')}>プロフィール</button>
            <button className="menu-btn" onClick={() => setCurrentScreen('settings')}>設定</button>
          </div>
        )}

        {currentScreen === 'online_select' && (
          <div className="sub-screen">
            <h2>オンライン対戦</h2>
            <div className="menu-container">
              <button className="menu-btn mode-btn" onClick={joinRankMatch}>
                ランク戦
                <span className="btn-subtext">レーティング競い合い / 全国ランキング</span>
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
            <h2>ランク戦 待機ルーム</h2>
            <p className="timer-text">試合開始まで: {Math.floor(roomTimer / 60)}分 {roomTimer % 60}秒</p>
            <p className="info-text">※30秒経過時に不足分をCPUで補填して開始します</p>

            <div className="player-list-box">
              <h4>参加プレイヤー ({roomData?.players ? roomData.players.length : 1} / 4人)</h4>
              {roomData?.players?.map((p, idx) => (
                <div key={idx} className="player-item">👤 {p.name} ({p.rating} Pt)</div>
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
              <span>{matchCount} / 5 試合</span>
              <span>Pt: {scores[mySlot]}</span>
              {isRevolution && <span className="status-badge rev">革命</span>}
              {is11Back && <span className="status-badge back">11バック</span>}
              {field?.isBound && <span className="status-badge" style={{ backgroundColor: '#8e44ad', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', marginLeft: '5px' }}>🔒 縛り</span>}
              <button className="home-btn-small" onClick={() => setShowConfirmHomeModal(true)}>🏠 ホームへ</button>
            </div>

            <div className="cpu-players">
              {[0, 1, 2, 3].filter(idx => idx !== mySlot).map(idx => (
                <div key={idx} className={`cpu-card ${turn === idx && !exchangePhase ? 'active-turn' : ''}`}>
                  <div className="cpu-name">{players[idx]}</div>
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
                  {exchangeCards[mySlot] ? (
                    <p style={{ fontSize: '12px', color: '#555' }}>他のプレイヤーの準備を待っています...</p>
                  ) : (
                    <div>
                      {prevRanks.indexOf(mySlot) === 0 || prevRanks.indexOf(mySlot) === 1 ? (
                        <>
                          <p style={{ fontSize: '11px', margin: '5px 0' }}>いらないカードを {prevRanks.indexOf(mySlot) === 0 ? 2 : 1}枚 選択してください</p>
                          <button 
                            className="action-btn"
                            style={{ padding: '6px 12px', fontSize: '12px' }}
                            onClick={handleExchangeSubmit}
                            disabled={selectedCards.length !== (prevRanks.indexOf(mySlot) === 0 ? 2 : 1)}
                          >
                            交換を決定する ({selectedCards.length} / {prevRanks.indexOf(mySlot) === 0 ? 2 : 1})
                          </button>
                        </>
                      ) : (
                        <>
                          <p style={{ fontSize: '11px', margin: '5px 0' }}>あなたの最強カードが自動的に {prevRanks.indexOf(mySlot) === 3 ? 2 : 1}枚 渡されます。</p>
                          <button className="action-btn" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={handleExchangeSubmit}>確認して渡す</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="field-title">場</div>
                  <div className="field-cards">
                    {field ? (
                      field.cards.map((c, idx) => {
                        const isRed = c.suit === '♥' || c.suit === '♦';
                        return (
                          <div key={idx} className={`card-item ${userData.cardSize} ${isRed ? 'red-suit' : ''}`}>
                            {userData.cardDesign === 'mark' ? `${c.suit}${NUM_MAP[c.num] || ''}` : (NUM_MAP[c.num] || c.suit)}
                          </div>
                        );
                      })
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
                  const isRed = card.suit === '♥' || card.suit === '♦';
                  return (
                    <div
                      key={card.id}
                      className={`card-item ${userData.cardSize} ${isSelected ? 'selected' : ''} ${isRed ? 'red-suit' : ''}`}
                      onClick={() => toggleSelectCard(card)}
                    >
                      {userData.cardDesign === 'mark' ? `${card.suit}${NUM_MAP[card.num] || ''}` : (NUM_MAP[card.num] || card.suit)}
                    </div>
                  );
                })}
              </div>

              {!exchangePhase && (
                <div className="controls">
                  <button
                    className="game-btn play-btn"
                    disabled={turn !== mySlot || selectedCards.length === 0}
                    onClick={handleUserPlay}
                  >
                    カードを出す ({selectedCards.length})
                  </button>
                  <button
                    className="game-btn pass-btn"
                    disabled={turn !== mySlot || !field}
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
                        <span>獲得Pt: {[2, 1, 0, -1][rank]}Pt</span>
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
                  <h2>🏆 5試合総合結果 🏆</h2>
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

        {currentScreen === 'ranking' && (
          <div className="sub-screen">
            <h2>全プレイヤーレーティングランキング</h2>

            <button className="action-btn" style={{ marginBottom: '15px', padding: '8px 16px', fontSize: '0.95rem' }} onClick={fetchRankings} disabled={rankingLoading}>
              {rankingLoading ? '読み込み中...' : '🔄 最新情報に更新'}
            </button>

            {rankingError && (<p className="error-text" style={{ color: '#e74c3c', padding: '10px', background: 'rgba(231,76,60,0.1)', borderRadius: '6px' }}>{rankingError}</p>)}

            <div className="ranking-list">
              {rankingLoading ? (
                <div className="ranking-item">プレイデータ読み込み中...</div>
              ) : globalRankings.length > 0 ? (
                globalRankings.map((user, idx) => {
                  const getAILightColor = (status) => {
                    if (status === 'playing') return '#f1c40f'; 
                    if (status === 'offline') return '#e74c3c'; 
                    return '#2ecc71'; 
                  };
                  const getAIStatusText = (status) => {
                    if (status === 'playing') return '試合中';
                    if (status === 'offline') return 'オフライン';
                    return 'オンライン';
                  };
                  return (
                    <div key={idx} className={`ranking-item ${user.userId === userData.userId ? 'highlight-me' : ''}`}>
                      <span style={{ display: 'flex', alignItems: 'center' }}>
                        {idx + 1}位: {user.username}
                        {user.isAIPlayer && (
                          <span style={{
                            display: 'inline-block',
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: getAILightColor(user.status),
                            marginLeft: '6px',
                            boxShadow: `0 0 4px ${getAILightColor(user.status)}`
                          }} title={getAIStatusText(user.status)}></span>
                        )}
                      </span>
                      <span>{user.rating} Pt</span>
                    </div>
                  );
                })
              ) : (
                <div className="ranking-item">登録されているプレイヤーがいません</div>
              )}
            </div>

            {/* ★ Ver.2.0.1 自分の順位を常に下部に表示 */}
            {!rankingLoading && myRankingInfo && (
              <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '2px dashed #bdc3c7' }}>
                <p style={{ fontSize: '12px', color: '#7f8c8d', margin: '0 0 5px 0', textAlign: 'left' }}>あなたの順位</p>
                <div className="ranking-item highlight-me" style={{ margin: '0', borderRadius: '8px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', fontWeight: 'bold' }}>
                    {myRankingInfo.rank}位: {myRankingInfo.user.username || 'あなた'}
                  </span>
                  <span style={{ fontWeight: 'bold' }}>{myRankingInfo.user.rating || userData.rating} Pt</span>
                </div>
              </div>
            )}

            <button className="back-btn" onClick={() => setCurrentScreen('menu')}>戻る</button>
          </div>
        )}

        {currentScreen === 'profile' && (
          <div className="sub-screen profile-screen">
            <h2>プロフィール</h2>
            <div className="profile-card">
              <div className="profile-row"><span className="label">ユーザーネーム:</span><span className="val">{userData.username}</span></div>
              <div className="profile-row"><span className="label">現在のレーティング:</span><span className="val highlight">{userData.rating} Pt</span></div>
              <div className="profile-row"><span className="label">最高レーティング:</span><span className="val">{userData.maxRating} Pt</span></div>
              <hr />
              <h4>各順位獲得確率</h4>
              <div className="stats-grid">
                <div>1位: {calcRate(userData.wins[0])}</div>
                <div>2位: {calcRate(userData.wins[1])}</div>
                <div>3位: {calcRate(userData.wins[2])}</div>
                <div>4位: {calcRate(userData.wins[3])}</div>
              </div>
              <hr />
              <div className="profile-row"><span className="label">現在の連勝数:</span><span className="val">{userData.currentWinStreak} 連勝</span></div>
              <div className="profile-row"><span className="label">最多連勝数:</span><span className="val">{userData.maxWinStreak} 連勝</span></div>
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

            <div className="setting-item">
              <label>背景色変更</label>
              <input type="color" value={userData.bgColor} onChange={(e) => saveUserData({ ...userData, bgColor: e.target.value, bgImage: '' })} />
            </div>

            <div className="setting-item">
              <label>トランプのデザイン</label>
              <select value={userData.cardDesign} onChange={(e) => saveUserData({ ...userData, cardDesign: e.target.value })}>
                <option value="mark">数字とマーク</option>
                <option value="number">数字のみ</option>
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

            <div className="setting-rules-box">
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
    </div>
  );
}

export default App;


