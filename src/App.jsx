import React, { useState, useEffect } from 'react';
import './App.css';

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
  const diff = avgRating - myRating; // 平均との差

  let baseChange = 0;
  if (rank === 0) baseChange = 16;       // 1位
  else if (rank === 1) baseChange = 6;   // 2位
  else if (rank === 2) baseChange = -6;  // 3位
  else if (rank === 3) baseChange = -16; // 4位

  let change = Math.round(baseChange + diff / 30);

  // 条件の適用: 1位は必ず上昇、4位は必ず減少
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
      try { return JSON.parse(saved); } catch (e) {}
    }
    return {
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
  const [inputUsername, setInputUsername] = useState('');

  // ゲームステート
  const [isRankMatch, setIsRankMatch] = useState(false);
  const [matchCount, setMatchCount] = useState(1);
  const [scores, setScores] = useState([0, 0, 0, 0]);
  const [prevRanks, setPrevRanks] = useState([0, 1, 2, 3]);
  const [players, setPlayers] = useState(['あなた', 'CPU 1', 'CPU 2', 'CPU 3']);
  const [playerRatings, setPlayerRatings] = useState([500, 500, 500, 500]);

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

  // オンライン待機ルームステート
  const [roomCode, setRoomCode] = useState('');
  const [inputRoomCode, setInputRoomCode] = useState('');
  const [roomPlayers, setRoomPlayers] = useState([]);
  const [roomTimer, setRoomTimer] = useState(180); // 3分タイマー
  const [isHost, setIsHost] = useState(false);

  const isReversedEffective = isRevolution !== is11Back;

  useEffect(() => {
    if (!userData.username) {
      setShowRegisterModal(true);
    }
  }, []);

  // 待機ルームタイマー（ランク戦）
  useEffect(() => {
    let timer = null;
    if (currentScreen === 'waiting_rank' && roomTimer > 0) {
      timer = setInterval(() => setRoomTimer(prev => prev - 1), 1000);
    } else if (currentScreen === 'waiting_rank' && roomTimer === 0) {
      // 3分経過時：CPUで補填して試合開始
      startOnlineGame(true);
    }
    return () => clearInterval(timer);
  }, [currentScreen, roomTimer]);

  const saveUserData = (newData) => {
    setUserData(newData);
    localStorage.setItem('daifugo_user', JSON.stringify(newData));
  };

  const handleRegister = (e) => {
    e.preventDefault();
    if (!inputUsername.trim()) return;
    const updated = { ...userData, username: inputUsername.trim() };
    saveUserData(updated);
    setShowRegisterModal(false);
    setShowRecommendModal(true);
  };

  // --- ランク戦 待機ルームに入る ---
  const joinRankMatch = () => {
    setIsRankMatch(true);
    setRoomPlayers([userData.username]);
    setRoomTimer(180);
    setCurrentScreen('waiting_rank');
  };

  // --- ルーム戦 作成/参加 ---
  const createRoom = () => {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    setRoomCode(code);
    setIsHost(true);
    setIsRankMatch(false);
    setRoomPlayers([userData.username]);
    setCurrentScreen('waiting_room');
  };

  const joinRoomByCode = () => {
    if (inputRoomCode.length !== 4) {
      alert('4桁のルーム番号を入力してください');
      return;
    }
    setRoomCode(inputRoomCode);
    setIsHost(false);
    setIsRankMatch(false);
    setRoomPlayers(['ホスト', userData.username]);
    setCurrentScreen('waiting_room');
  };

  // オンライン対戦開始処理
  const startOnlineGame = (fillWithCpu = false) => {
    let finalPlayers = [...roomPlayers];
    let ratings = [userData.rating, 500, 500, 500];

    if (fillWithCpu || finalPlayers.length < 4) {
      let cpuCount = 1;
      while (finalPlayers.length < 4) {
        finalPlayers.push(`CPU ${cpuCount++}`);
      }
    }

    setPlayers(finalPlayers);
    setPlayerRatings(ratings);
    startNewGameSet(finalPlayers, isRankMatch);
  };

  // ゲームセット開始
  const startNewGameSet = (playerList = ['あなた', 'CPU 1', 'CPU 2', 'CPU 3'], isRank = false) => {
    setIsRankMatch(isRank);
    setMatchCount(1);
    setScores([0, 0, 0, 0]);
    setPrevRanks([0, 1, 2, 3]);
    setCurrentScreen('game');
    startMatch(1, [0, 1, 2, 3], playerList);
  };

  // 1試合開始
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

  const sortHand = (hand, isRev) => {
    hand.sort((a, b) => getCardStrength(a.num, isRev) - getCardStrength(b.num, isRev));
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
    const playedStrength = getCardStrength(playedNum, isRev);

    if (!currentField) return true;

    if (currentField.cards.length === 1 && currentField.cards[0].num === 0) {
      if (cards.length === 1 && cards[0].suit === '♠' && cards[0].num === 3) {
        return true;
      }
    }

    if (cards.length !== currentField.cards.length) return false;
    return playedStrength > currentField.strength;
  };

  const playCards = (playerIdx, cards) => {
    const nonJokers = cards.filter(c => c.num !== 0);
    const playedNum = nonJokers.length > 0 ? nonJokers[0].num : 0;
    const strength = getCardStrength(playedNum, isReversedEffective);

    const newHand = hands[playerIdx].filter(c => !cards.some(sc => sc.id === c.id));
    const nextHands = [...hands];
    nextHands[playerIdx] = newHand;
    setHands(nextHands);
    setSelectedCards([]);

    const newField = { cards, strength, count: cards.length, playedBy: playerIdx };
    setField(newField);

    let logs = [`${players[playerIdx]}がカードを出しました`];

    if (cards.length >= 4) {
      setIsRevolution(!isRevolution);
      logs.push('🔥 革命発生！');
    }

    if (cards.some(c => c.num === 11)) {
      setIs11Back(true);
      logs.push('↺ 11バック発生！');
    }

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

  // CPU思考処理
  useEffect(() => {
    if (currentScreen !== 'game' || turn === 0 || matchResultModal || gameResultModal) return;

    const cpuTimer = setTimeout(() => {
      const cpuHand = hands[turn];
      if (cpuHand.length === 0) return;

      let move = findBestCpuMove(cpuHand, field, isReversedEffective);
      if (move) playCards(turn, move);
      else passTurn(turn);
    }, 1000);

    return () => clearTimeout(cpuTimer);
  }, [turn, field, hands, currentScreen, isReversedEffective, matchResultModal]);

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

  // 5試合総合終了＆将棋連盟風レーティング計算
  const finish5MatchGameSet = (finalScores) => {
    const playerIndices = [0, 1, 2, 3];
    playerIndices.sort((a, b) => finalScores[b] - finalScores[a]);

    const myFinalRank = playerIndices.indexOf(0);

    const newWins = [...userData.wins];
    newWins[myFinalRank] += 1;

    let newStreak = (myFinalRank === 0) ? userData.currentWinStreak + 1 : 0;

    let ratingChange = 0;
    let newRating = userData.rating;

    // ランク戦のみレーティング変動
    if (isRankMatch) {
      const oppRatings = [500, 500, 500]; // 対戦相手のレート
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

  const toggleSelectCard = (card) => {
    if (selectedCards.some(c => c.id === card.id)) {
      setSelectedCards(selectedCards.filter(c => c.id !== card.id));
    } else {
      setSelectedCards([...selectedCards, card]);
    }
  };

  const handleUserPlay = () => {
    if (isValidPlay(selectedCards, field, isReversedEffective)) {
      playCards(0, selectedCards);
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

        {/* ユーザー登録 */}
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

        {/* おすすめサイトポップアップ */}
        {showRecommendModal && (
          <div className="modal-overlay">
            <div className="modal-content recommend-modal">
              <button className="close-btn" onClick={() => setShowRecommendModal(false)}>×</button>
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
            </div>
          </div>
        )}

        {/* メインメニュー */}
        {currentScreen === 'menu' && (
          <div className="menu-container">
            <h1 className="title">大富豪オンライン</h1>
            <p className="user-badge">ようこそ、{userData.username || 'ゲスト'} さん</p>

            <button className="menu-btn" onClick={() => setCurrentScreen('online_select')}>オンライン対戦</button>
            <button className="menu-btn" onClick={() => startNewGameSet(['あなた', 'CPU 1', 'CPU 2', 'CPU 3'], false)}>コンピュータ対戦</button>
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
            <p className="info-text">※3分経過時に2人以上でCPUを補填して開始します</p>

            <div className="player-list-box">
              <h4>参加プレイヤー ({roomPlayers.length} / 4人)</h4>
              {roomPlayers.map((p, idx) => (
                <div key={idx} className="player-item">👤 {p}</div>
              ))}
            </div>

            <button className="action-btn" onClick={() => startOnlineGame(true)}>今すぐ対戦開始 (CPU補充)</button>
            <button className="back-btn" onClick={() => setCurrentScreen('online_select')}>退出する</button>
          </div>
        )}

        {/* ルーム戦 待機ルーム */}
        {currentScreen === 'waiting_room' && (
          <div className="sub-screen">
            <h2>ルーム番号: {roomCode}</h2>
            <p>メンバーが集まったらホストがスタートを押してください</p>

            <div className="player-list-box">
              <h4>参加メンバー ({roomPlayers.length} / 4人)</h4>
              {roomPlayers.map((p, idx) => (
                <div key={idx} className="player-item">👤 {p}</div>
              ))}
            </div>

            {isHost ? (
              <button className="action-btn" onClick={() => startOnlineGame(true)}>試合スタート</button>
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
              <span>{matchCount} / 5 試合目</span>
              <span>Pt: {scores[0]}</span>
              {isRevolution && <span className="status-badge rev">革命</span>}
              {is11Back && <span className="status-badge back">11バック</span>}
            </div>

            {/* 対戦相手情報 */}
            <div className="cpu-players">
              {[1, 2, 3].map(idx => (
                <div key={idx} className={`cpu-card ${turn === idx ? 'active-turn' : ''}`}>
                  <div className="cpu-name">{players[idx]}</div>
                  <div className="cpu-cards-count">🂠 {hands[idx].length}枚</div>
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
                <span>あなたの手札 ({hands[0].length}枚)</span>
                {turn === 0 && <span className="your-turn-badge">あなたの番です！</span>}
              </div>

              <div className="hand-cards">
                {hands[0].map(card => {
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
                  disabled={turn !== 0 || selectedCards.length === 0}
                  onClick={handleUserPlay}
                >
                  カードを出す ({selectedCards.length})
                </button>
                <button
                  className="game-btn pass-btn"
                  disabled={turn !== 0}
                  onClick={() => passTurn(0)}
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
                      <div key={rank} className="result-item">
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
                      <div key={rank} className={`result-item ${pIdx === 0 ? 'highlight-me' : ''}`}>
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
              <div className="ranking-item highlight-me">
                <span>1位: {userData.username || 'あなた'}</span>
                <span>{userData.rating} Pt</span>
              </div>
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

            <button className="back-btn" onClick={() => setCurrentScreen('menu')}>戻る</button>
          </div>
        )}

      </div>
    </div>
  );
}

export default App;
