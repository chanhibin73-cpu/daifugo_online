import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { db, rtdb } from './firebase';
import { collection, doc, setDoc, getDocs, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { ref, set, get, update, onValue, off, push, remove } from 'firebase/database';

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

// 将棋連盟風レーティング計算ロジック
const calcShogiRating = (myRating, opponentRatings, rank) => {
  const allRatings = [myRating, ...opponentRatings];
  const avgRating = allRatings.reduce((a, b) => a + b, 0) / 4;
  const diff = avgRating - myRating;

  let baseChange = 0;
  if (rank === 0) baseChange = 16;       // 1位
  else if (rank === 1) baseChange = 6;   // 2位
  else if (rank === 2) baseChange = -6;  // 3位
  else if (rank === 3) baseChange = -16; // 4位

  let change = Math.round(baseChange + diff / 30);

  if (rank === 0 && change <= 0) change = 1;
  if (rank === 3 && change >= 0) change = -1;

  return change;
};

function App() {
  const [currentScreen, setCurrentScreen] = useState('menu');

  // ユーザーデータ
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
      cardSize: 'medium'
    };
  });

  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showRecommendModal, setShowRecommendModal] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [inputUsername, setInputUsername] = useState('');

  // オンライン・ランキングデータ
  const [globalRankings, setGlobalRankings] = useState([]);
  const [roomId, setRoomId] = useState(null);
  const [roomData, setRoomData] = useState(null);
  const [roomTimer, setRoomTimer] = useState(180);

  // ローカルゲームステート
  const [isRankMatch, setIsRankMatch] = useState(false);
  const [matchCount, setMatchCount] = useState(1);
  const [scores, setScores] = useState([0, 0, 0, 0]);
  const [prevRanks, setPrevRanks] = useState([0, 1, 2, 3]);
  const [players, setPlayers] = useState(['あなた', 'CPU 1', 'CPU 2', 'CPU 3']);
  const [playerRatings, setPlayerRatings] = useState([500, 500, 500, 500]);
  const [isOnlineMode, setIsOnlineMode] = useState(false);
  const [mySlot, setMySlot] = useState(0);

  const [hands, setHands] = useState([[], [], [], []]);
  const [turn, setTurn] = useState(0);
  const [field, setField] = useState(null);
  const [passed, setPassed] = useState([false, false, false, false]);
  const [rankingsThisMatch, setRankingsThisMatch] = useState([]);
  const [selectedCards, setSelectedCards] = useState([]);

  // ルールステート
  const [isRevolution, setIsRevolution] = useState(false);
  const [is11Back, setIs11Back] = useState(false);
  const [message, setMessage] = useState('');
  const [matchResultModal, setMatchResultModal] = useState(null);
  const [gameResultModal, setGameResultModal] = useState(null);
  const [showConfirmHomeModal, setShowConfirmHomeModal] = useState(false);

  const [inputRoomCode, setInputRoomCode] = useState('');

  const isReversedEffective = isRevolution !== is11Back;

  // 初期化モーダル表示フロー
  useEffect(() => {
    if (!userData.username) {
      setShowRegisterModal(true);
    }
  }, []);

  // ユーザーデータの保存＆Firestore同期
  const saveUserData = async (newData) => {
    setUserData(newData);
    localStorage.setItem('daifugo_user', JSON.stringify(newData));

    if (newData.username && newData.userId) {
      try {
        await setDoc(doc(db, 'users', newData.userId), {
          userId: newData.userId,
          username: newData.username,
          rating: newData.rating,
          maxRating: newData.maxRating,
          wins: newData.wins,
          totalGames: newData.totalGames,
          currentWinStreak: newData.currentWinStreak,
          maxWinStreak: newData.maxWinStreak,
          updatedAt: Date.now()
        }, { merge: true });
      } catch (err) {
        console.error("Firestore sync error:", err);
      }
    }
  };

  const handleRegister = (e) => {
    e.preventDefault();
    if (!inputUsername.trim()) return;
    const updated = { ...userData, username: inputUsername.trim() };
    saveUserData(updated);
    setShowRegisterModal(false);
    setShowRecommendModal(true);
  };

  const handleCloseRecommend = () => {
    setShowRecommendModal(false);
    setShowRulesModal(true);
  };

  // --- 全プレイヤーレーティングランキング取得 ---
  useEffect(() => {
    if (currentScreen === 'ranking') {
      const q = query(collection(db, 'users'), orderBy('rating', 'desc'), limit(50));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const list = [];
        snapshot.forEach((doc) => {
          list.push(doc.data());
        });
        setGlobalRankings(list);
      }, (err) => {
        console.error("Ranking fetch error:", err);
      });
      return () => unsubscribe();
    }
  }, [currentScreen]);

  // --- リアルタイム待機部屋＆マルチプレイ同期 ---
  useEffect(() => {
    if (!roomId) return;
    const roomRef = ref(rtdb, `rooms/${roomId}`);
    const unsubscribe = onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setRoomData(data);
        if (data.status === 'playing' && currentScreen.startsWith('waiting')) {
          setCurrentScreen('game');
        }
      }
    });
    return () => off(roomRef);
  }, [roomId, currentScreen]);

  // ランク戦 待機タイマー
  useEffect(() => {
    let timer = null;
    if (currentScreen === 'waiting_rank' && roomTimer > 0) {
      timer = setInterval(() => setRoomTimer(prev => prev - 1), 1000);
    } else if (currentScreen === 'waiting_rank' && roomTimer === 0) {
      startOnlineGameWithCpu();
    }
    return () => clearInterval(timer);
  }, [currentScreen, roomTimer]);

  // --- ランク戦マッチメイキング ---
  const joinRankMatch = async () => {
    setIsRankMatch(true);
    setIsOnlineMode(true);
    setCurrentScreen('waiting_rank');
    setRoomTimer(180);

    const roomsRef = ref(rtdb, 'rooms');
    const snapshot = await get(roomsRef);
    const rooms = snapshot.val() || {};

    let targetRoomId = null;
    let targetRoom = null;

    for (let rId in rooms) {
      const r = rooms[rId];
      if (r.type === 'rank' && r.status === 'waiting' && r.players && r.players.length < 4) {
        targetRoomId = rId;
        targetRoom = r;
        break;
      }
    }

    if (targetRoomId) {
      const newSlot = targetRoom.players.length;
      setMySlot(newSlot);
      const updatedPlayers = [...targetRoom.players, {
        userId: userData.userId,
        name: userData.username,
        rating: userData.rating,
        isCpu: false
      }];
      setRoomId(targetRoomId);
      await update(ref(rtdb, `rooms/${targetRoomId}`), { players: updatedPlayers });

      if (updatedPlayers.length === 4) {
        executeStartOnlineMatch(targetRoomId, updatedPlayers);
      }
    } else {
      const newRoomRef = push(ref(rtdb, 'rooms'));
      const newRId = newRoomRef.key;
      setMySlot(0);
      setRoomId(newRId);
      const initialData = {
        roomId: newRId,
        type: 'rank',
        status: 'waiting',
        hostId: userData.userId,
        players: [{
          userId: userData.userId,
          name: userData.username,
          rating: userData.rating,
          isCpu: false
        }]
      };
      await set(newRoomRef, initialData);
    }
  };

  // --- ルーム戦 作成/参加 ---
  const createRoom = async () => {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    setIsRankMatch(false);
    setIsOnlineMode(true);
    setMySlot(0);

    const newRoomRef = ref(rtdb, `rooms/room_${code}`);
    setRoomId(`room_${code}`);
    await set(newRoomRef, {
      roomId: `room_${code}`,
      code: code,
      type: 'room',
      status: 'waiting',
      hostId: userData.userId,
      players: [{
        userId: userData.userId,
        name: userData.username,
        rating: userData.rating,
        isCpu: false
      }]
    });
    setCurrentScreen('waiting_room');
  };

  const joinRoomByCode = async () => {
    if (inputRoomCode.length !== 4) {
      alert('4桁のルーム番号を入力してください');
      return;
    }
    const targetId = `room_${inputRoomCode}`;
    const roomRef = ref(rtdb, `rooms/${targetId}`);
    const snapshot = await get(roomRef);

    if (!snapshot.exists()) {
      alert('該当する部屋が見つかりません');
      return;
    }

    const rData = snapshot.val();
    if (rData.players.length >= 4) {
      alert('部屋が満員です');
      return;
    }

    const newSlot = rData.players.length;
    setMySlot(newSlot);
    setIsRankMatch(false);
    setIsOnlineMode(true);
    setRoomId(targetId);

    const updatedPlayers = [...rData.players, {
      userId: userData.userId,
      name: userData.username,
      rating: userData.rating,
      isCpu: false
    }];

    await update(roomRef, { players: updatedPlayers });
    setCurrentScreen('waiting_room');
  };

  const startOnlineGameWithCpu = async () => {
    if (!roomId || !roomData) return;
    let currentPlayers = [...(roomData.players || [])];
    let cpuCount = 1;

    while (currentPlayers.length < 4) {
      currentPlayers.push({
        userId: `cpu_${cpuCount}`,
        name: `CPU ${cpuCount++}`,
        rating: 500,
        isCpu: true
      });
    }

    executeStartOnlineMatch(roomId, currentPlayers);
  };

  const executeStartOnlineMatch = async (rId, playerList) => {
    await update(ref(rtdb, `rooms/${rId}`), {
      status: 'playing',
      players: playerList
    });
    const playerNames = playerList.map(p => p.name);
    const ratings = playerList.map(p => p.rating);

    setPlayers(playerNames);
    setPlayerRatings(ratings);
    startNewGameSet(playerNames, isRankMatch, true);
  };

  // --- ゲームセット＆試合コントロール ---
  const startNewGameSet = (playerList = ['あなた', 'CPU 1', 'CPU 2', 'CPU 3'], isRank = false, isOnline = false) => {
    setIsRankMatch(isRank);
    setIsOnlineMode(isOnline);
    setMatchCount(1);
    setScores([0, 0, 0, 0]);
    setPrevRanks([0, 1, 2, 3]);
    setCurrentScreen('game');
    startMatch(1, [0, 1, 2, 3], playerList);
  };

  const sortHand = (hand, isRev) => {
    hand.sort((a, b) => getCardStrength(a.num, isRev) - getCardStrength(b.num, isRev));
  };

  const startMatch = (mCount, lastRanks, playerList = players) => {
    setIsRevolution(false);
    setIs11Back(false);
    setField(null);
    setPassed([false, false, false, false]);
    setRankingsThisMatch([]);
    setMessage(`${mCount}試合目 開始！`);

    const deck = shuffle(createDeck());
    const newHands = [[], [], [], []];
    for (let i = 0; i < 52; i++) {
      newHands[i % 4].push(deck[i]);
    }
    newHands[lastRanks[3]].push(deck[52]);

    for (let i = 0; i < 4; i++) {
      sortHand(newHands[i], false);
    }

    if (mCount > 1) {
      executeCardExchange(newHands, lastRanks);
    }

    setHands(newHands);
    let firstTurn = lastRanks[3];
    if (mCount === 1) {
      const d3Player = newHands.findIndex(h => h.some(c => c.suit === '♦' && c.num === 3));
      if (d3Player !== -1) firstTurn = d3Player;
    }
    setTurn(firstTurn);
  };

  const executeCardExchange = (newHands, ranks) => {
    const daifugo = ranks[0], fugo = ranks[1], hinmin = ranks[2], daihinmin = ranks[3];

    const dhBest = newHands[daihinmin].slice(-2);
    newHands[daihinmin] = newHands[daihinmin].slice(0, -2);
    newHands[daifugo].push(...dhBest);

    const dfWorst = newHands[daifugo].slice(0, 2);
    newHands[daifugo] = newHands[daifugo].slice(2);
    newHands[daihinmin].push(...dfWorst);

    const hBest = newHands[hinmin].pop();
    newHands[fugo].push(hBest);

    const fWorst = newHands[fugo].shift();
    newHands[hinmin].push(fWorst);
  };

  const isValidPlay = (cards, currentField, isRev) => {
    if (cards.length === 0) return false;
    const nonJokers = cards.filter(c => c.num !== 0);
    if (nonJokers.length > 0) {
      const targetNum = nonJokers[0].num;
      if (!nonJokers.every(c => c.num === targetNum)) return false;
    }

    const playedNum = nonJokers.length > 0 ? nonJokers[0].num : 0;
    
    // カードが出された時点で想定される革命状態
    let willRevolution = isRevolution;
    if (cards.length >= 4) {
      willRevolution = !isRevolution;
    }
    let will11Back = is11Back;
    if (cards.some(c => c.num === 11)) {
      will11Back = true;
    }
    const targetRev = willRevolution !== will11Back;
    
    const playedStrength = getCardStrength(playedNum, targetRev);

    if (!currentField) return true;

    // スペ3返し
    if (currentField.cards.length === 1 && currentField.cards[0].num === 0) {
      if (cards.length === 1 && cards[0].suit === '♠' && cards[0].num === 3) {
        return true;
      }
    }

    if (cards.length !== currentField.cards.length) return false;
    return playedStrength > currentField.strength;
  };

  // ★修正ポイント: カードを出した瞬間に革命を適用★
  const playCards = (playerIdx, cards) => {
    const nonJokers = cards.filter(c => c.num !== 0);
    const playedNum = nonJokers.length > 0 ? nonJokers[0].num : 0;

    let logs = [`${players[playerIdx]}がカードを出しました`];

    // 1. 革命・11バック判定を先に実施し、即座に最新状態を計算
    let nextRevolution = isRevolution;
    if (cards.length >= 4) {
      nextRevolution = !isRevolution;
      setIsRevolution(nextRevolution);
      logs.push('🔥 革命発生！');
    }

    let next11Back = is11Back;
    if (cards.some(c => c.num === 11)) {
      next11Back = true;
      setIs11Back(true);
      logs.push('↺ 11バック発生！');
    }

    // 出したそのターンから即適用される実効革命状態
    const effectiveRev = nextRevolution !== next11Back;

    // 出したカードの強さも「革命適用後の強さ」として場に計算・記録
    const strength = getCardStrength(playedNum, effectiveRev);

    const newHand = hands[playerIdx].filter(c => !cards.some(sc => sc.id === c.id));
    const nextHands = [...hands];
    nextHands[playerIdx] = newHand;

    // 全プレイヤーの手札を革命後の強さ順に即時ソートし直す
    if (cards.length >= 4) {
      for (let i = 0; i < 4; i++) {
        sortHand(nextHands[i], effectiveRev);
      }
    }

    setHands(nextHands);
    setSelectedCards([]);

    const newField = { cards, strength, count: cards.length, playedBy: playerIdx };
    setField(newField);

    let isMiyakoOchi = false;
    if (matchCount > 1 && rankingsThisMatch.length === 0) {
      if (playerIdx !== prevRanks[0]) isMiyakoOchi = true;
    }

    let newRankings = [...rankingsThisMatch];
    if (newHand.length === 0 && !newRankings.includes(playerIdx)) {
      newRankings.push(playerIdx);
      logs.push(`🎉 ${players[playerIdx]}が ${newRankings.length}位で上がり！`);

      if (isMiyakoOchi) {
        const prevDaifugo = prevRanks[0];
        if (!newRankings.includes(prevDaifugo)) {
          logs.push(`⚠️ 都落ち！ 前の大富豪は強制最下位！`);
          nextHands[prevDaifugo] = [];
          setHands(nextHands);
        }
      }
    }

    setRankingsThisMatch(newRankings);
    setMessage(logs.join(' / '));

    if (cards.some(c => c.num === 8)) {
      setMessage('✂️ 8切り！ ターン継続');
      clearField(playerIdx, nextHands, newRankings);
      return;
    }

    advanceTurn(playerIdx, nextHands, newRankings, newField);
  };

  const passTurn = (playerIdx) => {
    const newPassed = [...passed];
    newPassed[playerIdx] = true;
    setPassed(newPassed);
    setMessage(`${players[playerIdx]}がパスしました`);

    advanceTurn(playerIdx, hands, rankingsThisMatch, field, newPassed);
  };

  const clearField = (nextTurnPlayer, currentHands, currentRankings) => {
    setField(null);
    setIs11Back(false);
    setPassed([false, false, false, false]);

    let next = nextTurnPlayer;
    while (currentHands[next].length === 0 && currentRankings.length < 3) {
      next = (next + 1) % 4;
    }
    setTurn(next);
  };

  const advanceTurn = (currentIdx, currentHands, currentRankings, currentField, currentPassed = passed) => {
    if (currentRankings.length >= 3) {
      endMatch(currentRankings, currentHands);
      return;
    }

    let next = (currentIdx + 1) % 4;

    while (currentPassed[next] || currentHands[next].length === 0) {
      const activePlayers = [0, 1, 2, 3].filter(i => currentHands[i].length > 0);
      const activePassed = activePlayers.filter(i => currentPassed[i]);

      if (activePassed.length >= activePlayers.length - 1 && currentField && activePlayers.includes(currentField.playedBy)) {
        clearField(currentField.playedBy, currentHands, currentRankings);
        return;
      }
      if (activePassed.length >= activePlayers.length) {
        clearField(next, currentHands, currentRankings);
        return;
      }

      next = (next + 1) % 4;
    }

    setTurn(next);
  };

  // CPU自動打札
  useEffect(() => {
    if (currentScreen !== 'game' || matchResultModal || gameResultModal) return;

    const isCurrentCpuSlot = isOnlineMode
      ? (roomData?.players && roomData.players[turn]?.isCpu)
      : (turn !== 0);

    if (isCurrentCpuSlot) {
      const cpuTimer = setTimeout(() => {
        const cpuHand = hands[turn];
        if (!cpuHand || cpuHand.length === 0) return;

        let move = findBestCpuMove(cpuHand, field, isReversedEffective);
        if (move) playCards(turn, move);
        else passTurn(turn);
      }, 1000);

      return () => clearTimeout(cpuTimer);
    }
  }, [turn, field, hands, currentScreen, isReversedEffective, matchResultModal, roomData, isOnlineMode]);

  const findBestCpuMove = (hand, currentField, isRev) => {
    const sorted = [...hand].sort((a, b) => getCardStrength(a.num, isRev) - getCardStrength(b.num, isRev));

    if (!currentField) {
      const eights = sorted.filter(c => c.num === 8);
      if (eights.length > 0) return [eights[0]];

      const groups = {};
      sorted.forEach(c => {
        if (c.num !== 0) {
          groups[c.num] = groups[c.num] || [];
          groups[c.num].push(c);
        }
      });
      for (let num in groups) {
        if (groups[num].length >= 2) return groups[num];
      }
      return [sorted[0]];
    }

    if (currentField.cards.length === 1 && currentField.cards[0].num === 0) {
      const sp3 = sorted.find(c => c.suit === '♠' && c.num === 3);
      if (sp3) return [sp3];
    }

    const reqCount = currentField.cards.length;
    if (reqCount === 1) {
      const valid = sorted.filter(c => isValidPlay([c], currentField, isRev));
      if (valid.length > 0) return [valid[0]];
    } else {
      const groups = {};
      sorted.forEach(c => {
        if (c.num !== 0) {
          groups[c.num] = groups[c.num] || [];
          groups[c.num].push(c);
        }
      });
      for (let num in groups) {
        if (groups[num].length >= reqCount) {
          const combo = groups[num].slice(0, reqCount);
          if (isValidPlay(combo, currentField, isRev)) return combo;
        }
      }
    }
    return null;
  };

  const endMatch = (finalRankings, finalHands) => {
    const remaining = [0, 1, 2, 3].filter(i => !finalRankings.includes(i));
    const fullRankings = [...finalRankings, ...remaining];

    const pts = [2, 1, 0, -1];
    const newScores = [...scores];
    fullRankings.forEach((playerIdx, rank) => {
      newScores[playerIdx] += pts[rank];
    });

    setScores(newScores);
    setPrevRanks(fullRankings);

    if (matchCount < 5) {
      setMatchResultModal({
        match: matchCount,
        rankings: fullRankings,
        scores: newScores
      });
    } else {
      finish5MatchGameSet(newScores);
    }
  };

  const finish5MatchGameSet = (finalScores) => {
    const playerIndices = [0, 1, 2, 3];
    playerIndices.sort((a, b) => finalScores[b] - finalScores[a]);

    const myFinalRank = playerIndices.indexOf(mySlot);

    const newWins = [...userData.wins];
    newWins[myFinalRank] += 1;

    let newStreak = (myFinalRank === 0) ? userData.currentWinStreak + 1 : 0;

    let ratingChange = 0;
    let newRating = userData.rating;

    if (isRankMatch) {
      const oppRatings = playerRatings.filter((_, idx) => idx !== mySlot);
      ratingChange = calcShogiRating(userData.rating, oppRatings, myFinalRank);
      newRating = Math.max(0, userData.rating + ratingChange);
    }

    const updatedUser = {
      ...userData,
      rating: newRating,
      maxRating: Math.max(userData.maxRating, newRating),
      wins: newWins,
      totalGames: userData.totalGames + 1,
      currentWinStreak: newStreak,
      maxWinStreak: Math.max(userData.maxWinStreak, newStreak)
    };
    saveUserData(updatedUser);

    setGameResultModal({
      finalRankings: playerIndices,
      scores: finalScores,
      ratingChange,
      newRating
    });
  };

  const handleConfirmReturnHome = async () => {
    setShowConfirmHomeModal(false);

    if (isOnlineMode && roomId && roomData) {
      const updatedPlayers = [...(roomData.players || [])];
      if (updatedPlayers[mySlot]) {
        updatedPlayers[mySlot] = {
          userId: `cpu_${mySlot}`,
          name: `CPU (代行)`,
          rating: 500,
          isCpu: true
        };
      }
      await update(ref(rtdb, `rooms/${roomId}`), { players: updatedPlayers });

      if (isRankMatch) {
        const penaltyRating = Math.max(0, userData.rating - 15);
        saveUserData({
          ...userData,
          rating: penaltyRating,
          totalGames: userData.totalGames + 1,
          currentWinStreak: 0
        });
      }
    }

    setCurrentScreen('menu');
  };

  const toggleSelectCard = (card) => {
    if (selectedCards.some(c => c.id === card.id)) {
      setSelectedCards(selectedCards.filter(c => c.id !== card.id));
    } else {
      setSelectedCards([...selectedCards, card]);
    }
  };

  const handleUserPlay = () => {
    if (isValidPlay(selectedCards, field, isReversedEffective)) {
      playCards(mySlot, selectedCards);
    } else {
      alert('そのカードは出せません！');
    }
  };

  const containerStyle = userData.bgImage
    ? { backgroundImage: `url(${userData.bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { backgroundColor: userData.bgColor };

  const calcRate = (count) => {
    if (userData.totalGames === 0) return '0%';
    return `${((count / userData.totalGames) * 100).toFixed(1)}%`;
  };

  return (
    <div className="app-outer" style={containerStyle}>
      <div className="app-container">

        {/* モーダル1: ユーザー登録 */}
        {showRegisterModal && (
          <div className="modal-overlay">
            <div className="modal-content">
              <h2>ユーザー登録</h2>
              <p>プレイヤーネームを入力してください</p>
              <form onSubmit={handleRegister}>
                <input
                  type="text"
                  value={inputUsername}
                  onChange={(e) => setInputUsername(e.target.value)}
                  placeholder="ユーザーネーム"
                  maxLength={10}
                  required
                />
                <button type="submit" className="action-btn">登録する</button>
              </form>
            </div>
          </div>
        )}

        {/* モーダル2: おすすめWeb App Collection ポップアップ */}
        {showRecommendModal && (
          <div className="modal-overlay">
            <div className="modal-content recommend-modal">
              <button className="close-btn" onClick={handleCloseRecommend}>×</button>
              <h3>おすすめ Web App Collection</h3>
              <p>おすすめのWebアプリコレクションをチェックしてみよう！</p>
              <a
                href="https://hibimaruwebappscollection.vercel.app/index.html"
                target="_blank"
                rel="noopener noreferrer"
                className="recommend-link-btn"
              >
                サイトを見る
              </a>
              <div>
                <button className="action-btn next-modal-btn" onClick={handleCloseRecommend}>次へ（ルールを確認）</button>
              </div>
            </div>
          </div>
        )}

        {/* モーダル3: 導入されているルール紹介ポップアップ */}
        {showRulesModal && (
          <div className="modal-overlay">
            <div className="modal-content rules-modal-content">
              <h3>📜 導入されているルール 📜</h3>
              <div className="rules-scroll-area">
                <ul>
                  <li><strong>🔥 革命:</strong> 4枚以上のカードを同時に出すと、即座にカードの強さが逆転します。</li>
                  <li><strong>✂️ 8切り:</strong> 8を含むカードを出すと、場が流れて自分のターンになります。</li>
                  <li><strong>↺ 11バック:</strong> J(11)を出すと、そのターン中のみカードの強さが逆転します。</li>
                  <li><strong>♠️ スペ3返し:</strong> ジョーカー単体出しに対して、♠3単体で勝利できます。</li>
                  <li><strong>⚠️ 都落ち:</strong> 前回大富豪が1位で上がれなかった場合、強制最下位（大貧民）となります。</li>
                  <li><strong>🏆 5試合総合ポイント制:</strong> 5試合行い、1位2Pt/2位1Pt/3位0Pt/4位-1Pt の合計で順位を競います。</li>
                  <li><strong>📊 将棋連盟風レーティング:</strong> 1位は必ず上昇、4位は必ず下落。実数値に応じた公平なレーティング計算。</li>
                </ul>
              </div>
              <button className="action-btn" onClick={() => setShowRulesModal(false)}>ゲームを始める</button>
            </div>
          </div>
        )}

        {/* モーダル4: ホームへ戻る確認ポップアップ */}
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

        {/* メインメニュー */}
        {currentScreen === 'menu' && (
          <div className="menu-container">
            <h1 className="title">大富豪オンライン</h1>
            <p className="user-badge">ようこそ、{userData.username || 'ゲスト'} さん</p>

            <button className="menu-btn" onClick={() => setCurrentScreen('online_select')}>オンライン対戦</button>
            <button className="menu-btn" onClick={() => { setMySlot(0); startNewGameSet(['あなた', 'CPU 1', 'CPU 2', 'CPU 3'], false, false); }}>コンピュータ対戦</button>
            <button className="menu-btn" onClick={() => setCurrentScreen('ranking')}>全プレイヤーレーティングランキング</button>
            <button className="menu-btn" onClick={() => setCurrentScreen('profile')}>プロフィール</button>
            <button className="menu-btn" onClick={() => setCurrentScreen('settings')}>設定</button>
          </div>
        )}

        {/* オンライン選択 */}
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

        {/* ルーム戦 選択 */}
        {currentScreen === 'room_select' && (
          <div className="sub-screen">
            <h2>ルーム戦</h2>
            <button className="menu-btn" onClick={createRoom}>部屋を作成する</button>
            <div className="room-input-box">
              <input
                type="number"
                placeholder="4桁のルーム番号"
                value={inputRoomCode}
                onChange={(e) => setInputRoomCode(e.target.value.slice(0, 4))}
              />
              <button className="action-btn" onClick={joinRoomByCode}>部屋に入る</button>
            </div>
            <button className="back-btn" onClick={() => setCurrentScreen('online_select')}>戻る</button>
          </div>
        )}

        {/* ランク戦 待機ルーム */}
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
            <button className="back-btn" onClick={() => setCurrentScreen('online_select')}>退出する</button>
          </div>
        )}

        {/* ルーム戦 待機ルーム */}
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

            {roomData?.hostId === userData.userId ? (
              <button className="action-btn" onClick={startOnlineGameWithCpu}>試合スタート</button>
            ) : (
              <p className="info-text">ホストの開始を待っています...</p>
            )}

            <button className="back-btn" onClick={() => setCurrentScreen('online_select')}>退出する</button>
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
              <button className="home-btn-small" onClick={() => setShowConfirmHomeModal(true)}>🏠 ホームへ</button>
            </div>

            {/* 対戦相手情報 */}
            <div className="cpu-players">
              {[0, 1, 2, 3].filter(idx => idx !== mySlot).map(idx => (
                <div key={idx} className={`cpu-card ${turn === idx ? 'active-turn' : ''}`}>
                  <div className="cpu-name">{players[idx]}</div>
                  <div className="cpu-cards-count">🂠 {hands[idx]?.length || 0}枚</div>
                  <div className="cpu-score">Pt: {scores[idx]}</div>
                </div>
              ))}
            </div>

            {/* メッセージ */}
            <div className="log-banner">{message}</div>

            {/* 場 */}
            <div className="field-area">
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
            </div>

            {/* 自分の手札 */}
            <div className="player-area">
              <div className="player-info">
                <span>あなたの手札 ({hands[mySlot]?.length || 0}枚)</span>
                {turn === mySlot && <span className="your-turn-badge">あなたの番です！</span>}
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
                  disabled={turn !== mySlot}
                  onClick={() => passTurn(mySlot)}
                >
                  パス
                </button>
              </div>
            </div>

            {/* 1試合結果ダイアログ */}
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
                  <button
                    className="action-btn"
                    onClick={() => {
                      const nextM = matchCount + 1;
                      setMatchCount(nextM);
                      setMatchResultModal(null);
                      startMatch(nextM, matchResultModal.rankings);
                    }}
                  >
                    次の試合へ
                  </button>
                </div>
              </div>
            )}

            {/* 5試合総合結果ダイアログ */}
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

                  <button
                    className="action-btn"
                    onClick={() => {
                      setGameResultModal(null);
                      setCurrentScreen('menu');
                    }}
                  >
                    メニューへ戻る
                  </button>
                </div>
              </div>
            )}

          </div>
        )}

        {/* ランキング画面 */}
        {currentScreen === 'ranking' && (
          <div className="sub-screen">
            <h2>全プレイヤーレーティングランキング</h2>
            <div className="ranking-list">
              {globalRankings.length > 0 ? (
                globalRankings.map((user, idx) => (
                  <div key={idx} className={`ranking-item ${user.userId === userData.userId ? 'highlight-me' : ''}`}>
                    <span>{idx + 1}位: {user.username}</span>
                    <span>{user.rating} Pt</span>
                  </div>
                ))
              ) : (
                <div className="ranking-item">プレイヤーデータを読み込み中...</div>
              )}
            </div>
            <button className="back-btn" onClick={() => setCurrentScreen('menu')}>戻る</button>
          </div>
        )}

        {/* プロフィール画面 */}
        {currentScreen === 'profile' && (
          <div className="sub-screen profile-screen">
            <h2>プロフィール</h2>
            <div className="profile-card">
              <div className="profile-row">
                <span className="label">ユーザーネーム:</span>
                <span className="val">{userData.username}</span>
              </div>
              <div className="profile-row">
                <span className="label">現在のレーティング:</span>
                <span className="val highlight">{userData.rating} Pt</span>
              </div>
              <div className="profile-row">
                <span className="label">最高レーティング:</span>
                <span className="val">{userData.maxRating} Pt</span>
              </div>
              <hr />
              <h4>各順位獲得確率</h4>
              <div className="stats-grid">
                <div>1位: {calcRate(userData.wins[0])}</div>
                <div>2位: {calcRate(userData.wins[1])}</div>
                <div>3位: {calcRate(userData.wins[2])}</div>
                <div>4位: {calcRate(userData.wins[3])}</div>
              </div>
              <hr />
              <div className="profile-row">
                <span className="label">現在の連勝数:</span>
                <span className="val">{userData.currentWinStreak} 連勝</span>
              </div>
              <div className="profile-row">
                <span className="label">最多連勝数:</span>
                <span className="val">{userData.maxWinStreak} 連勝</span>
              </div>
            </div>
            <button className="back-btn" onClick={() => setCurrentScreen('menu')}>戻る</button>
          </div>
        )}

        {/* 設定画面 */}
        {currentScreen === 'settings' && (
          <div className="sub-screen settings-screen">
            <h2>設定</h2>

            <div className="setting-item">
              <label>ユーザーネーム変更</label>
              <input
                type="text"
                value={userData.username}
                onChange={(e) => saveUserData({ ...userData, username: e.target.value })}
                maxLength={10}
              />
            </div>

            <div className="setting-item">
              <label>背景色変更</label>
              <input
                type="color"
                value={userData.bgColor}
                onChange={(e) => saveUserData({ ...userData, bgColor: e.target.value, bgImage: '' })}
              />
            </div>

            <div className="setting-item">
              <label>トランプのデザイン</label>
              <select
                value={userData.cardDesign}
                onChange={(e) => saveUserData({ ...userData, cardDesign: e.target.value })}
              >
                <option value="mark">数字とマーク</option>
                <option value="number">数字のみ</option>
              </select>
            </div>

            <div className="setting-item">
              <label>カードのサイズ</label>
              <select
                value={userData.cardSize}
                onChange={(e) => saveUserData({ ...userData, cardSize: e.target.value })}
              >
                <option value="small">小</option>
                <option value="medium">中</option>
                <option value="large">大</option>
              </select>
            </div>

            {/* ルール一覧設定項目 */}
            <div className="setting-rules-box">
              <h4>📜 採用ルール一覧</h4>
              <ul className="rules-mini-list">
                <li><strong>革命:</strong> 4枚以上同時出しで即座に強さ反転</li>
                <li><strong>8切り:</strong> 8を出して場を流す</li>
                <li><strong>11バック:</strong> Jを出してターン中強さ反転</li>
                <li><strong>スペ3返し:</strong> ジョーカー単体に♠3で勝利</li>
                <li><strong>都落ち:</strong> 前回大富豪未達成で最下位</li>
                <li><strong>将棋連盟風レート:</strong> 公平なレート補正計算</li>
              </ul>
            </div>

            <button className="back-btn" onClick={() => setCurrentScreen('menu')}>戻る</button>
          </div>
        )}

      </div>
    </div>
  );
}

export default App;
