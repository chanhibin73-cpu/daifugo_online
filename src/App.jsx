import React, { useState, useEffect } from 'react';
import './App.css';
import { db, rtdb } from './firebase';
import { collection, doc, setDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { ref, set, get, update, onValue, off, push, remove } from 'firebase/database';

// --- アプリの更新履歴 ---
const UPDATE_HISTORY = [
  {
    version: '1.3',
    features: [
      '🐛 バグ修正: コンピュータが禁止上がりを避けて永遠にパスを繰り返す問題を修正しました。',
      '🤖 新機能: プレイヤーレート800以上で、より深く高度な状況判断（3倍の思考時間、相手手札枚数の監視・妨害）を行うレーティング2000超の「AIコンピュータ」が低確率で出現するようになりました。',
      '💻 設定画面に推奨利用環境の案内を追加しました。'
    ]
  },
  {
    version: '1.2',
    features: [
      '🤖 コンピュータ生成ロジックの改善: コンピュータのレーティングがプレイヤーのレーティングに比例するようになりました。',
      '🔥 強化コンピュータの調整: プレイヤーレートに比例して強化CPUの発生確率（最大10%）が変化し、下限が1000になりました。'
    ]
  },
  {
    version: '1.1',
    features: [
      '🤖 コンピュータの思考プログラム変更: レーティングに比例してより深い思考を行うようになりました。',
      '📊 レーティングシステムの変更: 対戦相手との個別のレーティング差を計算に強く反映するようになりました。'
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
    const oppRank = i;
    const diff = oppRating - myRating;
    
    if (myRank < oppRank) {
      diffBonus += diff * 0.04; 
    } else {
      diffBonus += diff * 0.04; 
    }
  }

  let change = Math.round(baseChange + diffBonus);

  if (myRank === 0 && change <= 0) change = 1;
  if (myRank === 3 && change >= 0) change = -1;

  return change;
};

// プレイヤーのレーティングに比例したCPUのレーティング生成
const generateCpuRating = (playerRating) => {
  const pRating = Math.max(100, playerRating || 500);
  
  const enhancedProb = Math.min(0.10, pRating / 10000);
  
  let aiProb = 0;
  if (pRating > 800) {
    aiProb = enhancedProb / 3;
  }

  const rand = Math.random();

  if (rand < aiProb) {
    // 超強化AIコンピュータ: 2000超
    return 2000 + Math.floor(Math.random() * 500);
  } else if (rand < aiProb + enhancedProb) {
    // 強化コンピュータ
    const baseEnhanced = Math.max(1000, 1000 + Math.floor(pRating * 0.2));
    return baseEnhanced + Math.floor(Math.random() * 301);
  } else {
    // 通常コンピュータ
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
      lastSeenVersion: ''
    };
  });

  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showRecommendModal, setShowRecommendModal] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showDeleteDataModal, setShowDeleteDataModal] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showDisconnectPenaltyModal, setShowDisconnectPenaltyModal] = useState(false);
  const [inputUsername, setInputUsername] = useState('');

  const [globalRankings, setGlobalRankings] = useState([]);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [rankingError, setRankingError] = useState('');
  const [roomId, setRoomId] = useState(null);
  const [roomData, setRoomData] = useState(null);
  const [roomTimer, setRoomTimer] = useState(180);

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

  const isReversedEffective = isRevolution !== is11Back;

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
            const playerNames = data.players.map(p => p.name);
            const ratings = data.players.map(p => p.rating);
            setPlayers(playerNames);
            setPlayerRatings(ratings);
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
          if (updatedPlayers.length === 0) {
            await set(roomRef, null);
          } else {
            await update(roomRef, { players: updatedPlayers });
          }
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
    setIsRankMatch(true); setIsOnlineMode(true); setCurrentScreen('waiting_rank'); setRoomTimer(180);
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
    let cpuCount = 1;
    const baseRating = currentPlayers[0]?.rating || userData.rating;
    while (currentPlayers.length < 4) {
      currentPlayers.push({ userId: `cpu_${cpuCount}`, name: `CPU ${cpuCount++}`, rating: generateCpuRating(baseRating), isCpu: true });
    }
    executeStartOnlineMatch(roomId, currentPlayers);
  };

  const executeStartOnlineMatch = async (rId, playerList) => {
    await update(ref(rtdb, `rooms/${rId}`), { status: 'playing', players: playerList });
    const playerNames = playerList.map(p => p.name);
    const ratings = playerList.map(p => p.rating);
    
    setPlayers(playerNames);
    setPlayerRatings(ratings);
    startNewGameSet(playerNames, isRankMatch, true);
  };

  useEffect(() => {
    if (isOnlineMode && isHost && roomId && currentScreen === 'game') {
      const stateToSync = {
        hands, turn, field: field || null, passed, rankingsThisMatch, fouledPlayers,
        isRevolution, is11Back, message, matchCount, scores, prevRanks,
        exchangePhase, exchangeCards: exchangeCards || {},
        matchResultModal: matchResultModal || null
      };
      set(ref(rtdb, `rooms/${roomId}/gameState`), stateToSync);
    }
  }, [hands, turn, field, passed, rankingsThisMatch, fouledPlayers, isRevolution, is11Back, message, matchCount, scores, prevRanks, exchangePhase, exchangeCards, matchResultModal, isOnlineMode, isHost, roomId, currentScreen]);

  useEffect(() => {
    if (isOnlineMode && !isHost && roomId && currentScreen === 'game') {
      const gsRef = ref(rtdb, `rooms/${roomId}/gameState`);
      const unsub = onValue(gsRef, (snap) => {
        const val = snap.val();
        if (val) {
          if (val.hands) setHands(val.hands);
          if (val.turn !== undefined) setTurn(val.turn);
          setField(val.field || null);
          if (val.passed) setPassed(val.passed);
          if (val.rankingsThisMatch) setRankingsThisMatch(val.rankingsThisMatch);
          if (val.fouledPlayers) setFouledPlayers(val.fouledPlayers);
          if (val.isRevolution !== undefined) setIsRevolution(val.isRevolution);
          if (val.is11Back !== undefined) setIs11Back(val.is11Back);
          if (val.message) setMessage(val.message);
          if (val.matchCount) setMatchCount(val.matchCount);
          if (val.scores) setScores(val.scores);
          if (val.prevRanks) setPrevRanks(val.prevRanks);
          if (val.exchangePhase !== undefined) setExchangePhase(val.exchangePhase);
          if (val.exchangeCards) setExchangeCards(val.exchangeCards);
          setMatchResultModal(val.matchResultModal || null);

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
      if (req.type === 'play') playCards(req.playerIdx, req.cards);
      else if (req.type === 'pass') passTurn(req.playerIdx);
      else if (req.type === 'exchange') setExchangeCards(prev => ({...prev, [req.playerIdx]: req.cards || []}));
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
      push(ref(rtdb, `rooms/${roomId}/requests`), { type: 'exchange', playerIdx: mySlot, cards: cardsToSubmit, ts: Date.now() });
    } else {
      setExchangeCards(prev => ({...prev, [mySlot]: cardsToSubmit}));
    }
    setSelectedCards([]);
  };

  const isValidPlay = (cards, currentField, isRev) => {
    if (cards.length === 0) return false;
    const nonJokers = cards.filter(c => c.num !== 0);
    if (nonJokers.length > 0) {
      const targetNum = nonJokers[0].num;
      if (!nonJokers.every(c => c.num === targetNum)) return false;
    }
    const playedNum = nonJokers.length > 0 ? nonJokers[0].num : 0;
    const playedStrength = getCardStrength(playedNum, isRev);

    if (!currentField) return true;
    if (currentField.cards.length === 1 && currentField.cards[0].num === 0) {
      if (cards.length === 1 && cards[0].suit === '♠' && cards[0].num === 3) return true;
    }
    if (cards.length !== currentField.cards.length) return false;
    return playedStrength > currentField.strength;
  };

  const playCards = (playerIdx, cards) => {
    const nonJokers = cards.filter(c => c.num !== 0);
    const playedNum = nonJokers.length > 0 ? nonJokers[0].num : 0;
    let logs = [`${players[playerIdx]}がカードを出しました`];

    let nextRevolution = isRevolution;
    if (cards.length >= 4) { nextRevolution = !isRevolution; setIsRevolution(nextRevolution); logs.push('🔥 革命発生！'); }
    let next11Back = is11Back;
    if (cards.some(c => c.num === 11)) { next11Back = true; setIs11Back(true); logs.push('↺ 11バック発生！'); }

    const effectiveRev = nextRevolution !== next11Back;
    const strength = getCardStrength(playedNum, effectiveRev);

    const newHand = hands[playerIdx].filter(c => !cards.some(sc => sc.id === c.id));
    const nextHands = [...hands];
    nextHands[playerIdx] = newHand;
    if (cards.length >= 4) { for (let i = 0; i < 4; i++) sortHand(nextHands[i], effectiveRev); }
    setHands(nextHands); setSelectedCards([]);

    const newField = { cards, strength, count: cards.length, playedBy: playerIdx };
    setField(newField);

    let isMiyakoOchi = false;
    if (matchCount > 1 && rankingsThisMatch.length === 0 && fouledPlayers.length === 0) {
      if (playerIdx !== prevRanks[0]) isMiyakoOchi = true;
    }

    let newRankings = [...rankingsThisMatch];
    let newFouled = [...fouledPlayers];

    if (newHand.length === 0) {
      const contains8 = cards.some(c => c.num === 8);
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

    if (cards.some(c => c.num === 8)) {
      setMessage('✂️ 8切り！ ターン継続');
      clearField(playerIdx, nextHands, newRankings, newFouled); return;
    }
    advanceTurn(playerIdx, nextHands, newRankings, newFouled, newField);
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
      clearField(next, currentHands, currentRankings, currentFouled); return;
    }

    let next = (currentIdx + 1) % 4;
    while (currentHands[next].length === 0) { next = (next + 1) % 4; }
    setTurn(next);
  };

  // CPU自動打札
  useEffect(() => {
    if (currentScreen !== 'game' || matchResultModal || gameResultModal || exchangePhase) return;
    const isCurrentCpuSlot = isOnlineMode ? (isHost && roomData?.players && roomData.players[turn]?.isCpu) : (turn !== 0);

    if (isCurrentCpuSlot) {
      const isAI = playerRatings[turn] >= 2000;
      const thinkTime = isAI ? 3000 : 1000; // AIは3秒熟考する

      const cpuTimer = setTimeout(() => {
        const cpuHand = hands[turn];
        if (!cpuHand || cpuHand.length === 0) return;
        
        const isSubstitute = isOnlineMode && roomData?.players && roomData.players[turn]?.isSubstitute;
        
        let move = findBestCpuMove(cpuHand, field, isReversedEffective, playerRatings[turn], isSubstitute, hands, turn);
        if (move) playCards(turn, move); else passTurn(turn);
      }, thinkTime);
      return () => clearTimeout(cpuTimer);
    }
  }, [turn, field, hands, currentScreen, isReversedEffective, matchResultModal, roomData, isOnlineMode, isHost, exchangePhase, playerRatings]);

  const findBestCpuMove = (hand, currentField, isRev, cpuRating, isSubstitute = false, allHands = [], currentTurn = 0) => {
    const sorted = [...hand].sort((a, b) => getCardStrength(a.num, isRev) - getCardStrength(b.num, isRev));
    
    // 誰かが上がりそうか（残り2枚以下の他人がいるか）
    let someoneIsFinishing = false;
    if (allHands.length > 0) {
      for (let i=0; i<4; i++) {
        if (i !== currentTurn && allHands[i].length > 0 && allHands[i].length <= 2) {
          someoneIsFinishing = true;
        }
      }
    }

    const isAI = cpuRating >= 2000;
    const isSmart = isAI || ((Math.random() * 1000) < cpuRating);
    const isVerySmart = isAI || (isSmart && ((Math.random() * 1000) < cpuRating));

    const isForbiddenFinish = (cards) => {
      if (cards.length !== hand.length) return false;
      const contains8 = cards.some(c => c.num === 8);
      const containsJoker = cards.some(c => c.num === 0);
      const containsForbiddenStrong = isRev ? cards.some(c => c.num === 3) : cards.some(c => c.num === 2);
      return contains8 || containsJoker || containsForbiddenStrong;
    };

    // 出すと残りが全て禁止上がりカードのみになってしまう手は避ける（バグ修正）
    const leavesOnlyForbidden = (cards) => {
       const remaining = hand.filter(c => !cards.some(sc => sc.id === c.id));
       if (remaining.length === 0) return false; // isForbiddenFinishで判定される
       return remaining.every(c => c.num === 8 || c.num === 0 || (isRev ? c.num === 3 : c.num === 2));
    };

    const groups = {};
    sorted.forEach(c => { if (c.num !== 0) { groups[c.num] = groups[c.num] || []; groups[c.num].push(c); } });

    // 出せる選択肢を全て列挙
    let options = [];
    if (!currentField) {
      for (let num in groups) {
        for (let i = 1; i <= groups[num].length; i++) {
          options.push(groups[num].slice(0, i));
        }
      }
      if (groups[0]) options.push([groups[0][0]]);
    } else {
      const reqCount = currentField.cards.length;
      if (reqCount === 1 && currentField.cards[0].num === 0) {
        const sp3 = sorted.find(c => c.suit === '♠' && c.num === 3);
        if (sp3) options.push([sp3]);
      }
      if (reqCount === 1) {
        for (let i = 0; i < sorted.length; i++) {
          if (isValidPlay([sorted[i]], currentField, isRev)) options.push([sorted[i]]);
        }
      } else {
        for (let num in groups) {
          if (groups[num].length >= reqCount) {
            const combo = groups[num].slice(0, reqCount);
            if (isValidPlay(combo, currentField, isRev)) options.push(combo);
          }
        }
      }
    }

    if (options.length === 0) return null;

    // 禁止上がりを避ける、もしそれしかなければ反則覚悟で出す
    let safeOptions = options.filter(combo => !isForbiddenFinish(combo));
    let bestOptions = safeOptions.filter(combo => !leavesOnlyForbidden(combo));
    
    // 安全な手がなければ妥協する
    let availableOptions = bestOptions.length > 0 ? bestOptions : (safeOptions.length > 0 ? safeOptions : options);

    if (isSubstitute) {
      return availableOptions[Math.floor(Math.random() * availableOptions.length)];
    }

    if (isAI) {
      if (someoneIsFinishing) {
        // 相手を妨害するために強い札や8切りを惜しみなく使う
        availableOptions.sort((a, b) => getCardStrength(b[0].num, isRev) - getCardStrength(a[0].num, isRev));
        const eights = availableOptions.filter(combo => combo.some(c => c.num === 8));
        if (eights.length > 0) return eights[eights.length - 1]; // 8を含む強い手
        return availableOptions[0]; // 最強カード
      } else {
        // 温存戦略（強いカード、8、11、革命を使わない）
        availableOptions.sort((a, b) => getCardStrength(a[0].num, isRev) - getCardStrength(b[0].num, isRev));
        const noSpecials = availableOptions.filter(combo => !combo.some(c => c.num === 8 || c.num === 11 || c.num === 0 || (isRev ? c.num===3 : c.num===2) || combo.length >= 4));
        
        if (!currentField) {
           const multiples = noSpecials.filter(combo => combo.length > 1);
           if (multiples.length > 0) return multiples[multiples.length - 1];
           const singlesNoPair = noSpecials.filter(combo => combo.length === 1 && groups[combo[0].num].length === 1);
           if (singlesNoPair.length > 0) return singlesNoPair[0];
        }
        
        if (noSpecials.length > 0) return noSpecials[0];
        return availableOptions[0];
      }
    } else if (isVerySmart || isSmart) {
      availableOptions.sort((a, b) => getCardStrength(a[0].num, isRev) - getCardStrength(b[0].num, isRev));
      const noSpecials = availableOptions.filter(combo => !combo.some(c => c.num === 8 || c.num === 0));
      
      if (!currentField) {
         const multiples = noSpecials.filter(combo => combo.length > 1);
         if (multiples.length > 0) return multiples[multiples.length - 1];
         const singlesNoPair = noSpecials.filter(combo => combo.length === 1 && groups[combo[0].num].length === 1);
         if (singlesNoPair.length > 0) return singlesNoPair[0];
      }
      
      if (noSpecials.length > 0) return noSpecials[0];
      return availableOptions[0];
    }

    // 通常CPU
    availableOptions.sort((a, b) => getCardStrength(a[0].num, isRev) - getCardStrength(b[0].num, isRev));
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
        push(ref(rtdb, `rooms/${roomId}/requests`), { type: 'play', playerIdx: mySlot, cards: selectedCards, ts: Date.now() });
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
      <div className="app-container">

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
            <p className="info-text">※3分経過時に不足分をCPUで補填して開始します</p>

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

        {currentScreen === 'game' && (
          <div className="game-board">
            <div className="game-header">
              <span>{matchCount} / 5 試合</span>
              <span>Pt: {scores[mySlot]}</span>
              {isRevolution && <span className="status-badge rev">革命</span>}
              {is11Back && <span className="status-badge back">11バック</span>}
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
                globalRankings.map((user, idx) => (
                  <div key={idx} className={`ranking-item ${user.userId === userData.userId ? 'highlight-me' : ''}`}>
                    <span>{idx + 1}位: {user.username}</span>
                    <span>{user.rating} Pt</span>
                  </div>
                ))
              ) : (
                <div className="ranking-item">登録されているプレイヤーがいません</div>
              )}
            </div>
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
                <option value="small">小</option>
                <option value="medium">中</option>
                <option value="large">大</option>
              </select>
            </div>

            <div className="setting-rules-box">
              <h4>📜 採用ルール一覧</h4>
              <ul className="rules-mini-list">
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


