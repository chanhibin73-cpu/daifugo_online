import React, { useState, useEffect } from 'react';
import './App.css';

// --- トランプ＆大富豪ヘルパー関数 ---
const SUITS = ['♠', '♥', '♦', '♣'];
const NUM_MAP = { 1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K' };

// カード強さ（通常: 3(1) ~ 2(13), Joker(14)）
const getCardStrength = (num, isReversed) => {
  if (num === 0) return 14; // Jokerは常に最強
  let baseStrength = 0;
  if (num >= 3) baseStrength = num - 2;
  else baseStrength = num + 11; // 1->12(A), 2->13

  return isReversed ? 14 - baseStrength : baseStrength;
};

// 山札生成（52枚 + Joker 1枚）
const createDeck = () => {
  const deck = [];
  let id = 1;
  for (let s of SUITS) {
    for (let n = 1; n <= 13; n++) {
      deck.push({ id: id++, suit: s, num: n });
    }
  }
  deck.push({ id: id++, suit: '🃏', num: 0 }); // Joker
  return deck;
};

// シャッフル
const shuffle = (array) => {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
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

  // --- 大富豪ゲームステート ---
  const [matchCount, setMatchCount] = useState(1); // 1~5試合
  const [scores, setScores] = useState([0, 0, 0, 0]); // P0(自分), P1(CPU1), P2(CPU2), P3(CPU3)
  const [prevRanks, setPrevRanks] = useState([0, 1, 2, 3]); // 前試合順位 (0:大富豪~3:大貧民)
  
  const [hands, setHands] = useState([[], [], [], []]);
  const [turn, setTurn] = useState(0);
  const [field, setField] = useState(null); // { cards: [], strength: number, count: number, playedBy: number }
  const [passed, setPassed] = useState([false, false, false, false]);
  const [rankingsThisMatch, setRankingsThisMatch] = useState([]); // 今試合の上がり順
  const [selectedCards, setSelectedCards] = useState([]);

  // ルールフラグ
  const [isRevolution, setIsRevolution] = useState(false); // 革命（永続）
  const [is11Back, setIs11Back] = useState(false);       // 11バック（単時）
  const [message, setMessage] = useState('');
  const [matchResultModal, setMatchResultModal] = useState(null); // 試合結果表示
  const [gameResultModal, setGameResultModal] = useState(null);   // 5試合総合結果

  const isReversedEffective = isRevolution !== is11Back; // 強さ反転判定

  useEffect(() => {
    if (!userData.username) {
      setShowRegisterModal(true);
    }
  }, []);

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

  // --- ゲーム開始（新規5試合ゲームセット） ---
  const startNewGameSet = () => {
    setMatchCount(1);
    setScores([0, 0, 0, 0]);
    setPrevRanks([0, 1, 2, 3]);
    setCurrentScreen('game');
    startMatch(1, [0, 1, 2, 3]);
  };

  // --- 1試合開始処理 ---
  const startMatch = (mCount, lastRanks) => {
    setIsRevolution(false);
    setIs11Back(false);
    setField(null);
    setPassed([false, false, false, false]);
    setRankingsThisMatch([]);
    setMessage(`${mCount}試合目 開始！`);

    const deck = shuffle(createDeck());
    const newHands = [[], [], [], []];
    // カード分配 (13枚ずつ)
    for (let i = 0; i < 52; i++) {
      newHands[i % 4].push(deck[i]);
    }
    // 残り1枚(Joker等)は大貧民またはランダムへ
    newHands[lastRanks[3]].push(deck[52]);

    // 手札ソート
    for (let i = 0; i < 4; i++) {
      sortHand(newHands[i], false);
    }

    // 2試合目以降のカード献上・交換
    if (mCount > 1) {
      executeCardExchange(newHands, lastRanks);
    }

    setHands(newHands);
    // 最初の手番は大貧民（第1試合はダイヤ3を持っている人またはP0）
    let firstTurn = lastRanks[3];
    if (mCount === 1) {
      const d3Player = newHands.findIndex(h => h.some(c => c.suit === '♦' && c.num === 3));
      if (d3Player !== -1) firstTurn = d3Player;
    }
    setTurn(firstTurn);
  };

  // 手札ソート
  const sortHand = (hand, isRev) => {
    hand.sort((a, b) => getCardStrength(a.num, isRev) - getCardStrength(b.num, isRev));
  };

  // カード交換ロジック (大富豪/富豪/貧民/大貧民)
  const executeCardExchange = (newHands, ranks) => {
    const daifugo = ranks[0];
    const fugo = ranks[1];
    const hinmin = ranks[2];
    const daihinmin = ranks[3];

    // 大貧民 -> 大富豪 (強い2枚)
    const dhBest = newHands[daihinmin].slice(-2);
    newHands[daihinmin] = newHands[daihinmin].slice(0, -2);
    newHands[daifugo].push(...dhBest);

    // 大富豪 -> 大貧民 (要らない2枚：弱い2枚)
    const dfWorst = newHands[daifugo].slice(0, 2);
    newHands[daifugo] = newHands[daifugo].slice(2);
    newHands[daihinmin].push(...dfWorst);

    // 貧民 -> 富豪 (強い1枚)
    const hBest = newHands[hinmin].pop();
    newHands[fugo].push(hBest);

    // 富豪 -> 貧民 (弱い1枚)
    const fWorst = newHands[fugo].shift();
    newHands[hinmin].push(fWorst);
  };

  // --- 出せるカードかチェック ---
  const isValidPlay = (cards, currentField, isRev) => {
    if (cards.length === 0) return false;
    // 同一数字かチェック (Joker混ざりOK)
    const nonJokers = cards.filter(c => c.num !== 0);
    if (nonJokers.length > 0) {
      const targetNum = nonJokers[0].num;
      if (!nonJokers.every(c => c.num === targetNum)) return false;
    }

    const playedNum = nonJokers.length > 0 ? nonJokers[0].num : 0;
    const playedStrength = getCardStrength(playedNum, isRev);

    // 場が空の場合
    if (!currentField) return true;

    // 【スペード3】場がJoker単体の場合、スペード3単体で出せる
    if (currentField.cards.length === 1 && currentField.cards[0].num === 0) {
      if (cards.length === 1 && cards[0].suit === '♠' && cards[0].num === 3) {
        return true;
      }
    }

    // 枚数が一致しない場合はNG
    if (cards.length !== currentField.cards.length) return false;

    // 強さ比較
    return playedStrength > currentField.strength;
  };

  // --- カードを提出 ---
  const playCards = (playerIdx, cards) => {
    const nonJokers = cards.filter(c => c.num !== 0);
    const playedNum = nonJokers.length > 0 ? nonJokers[0].num : 0;
    const strength = getCardStrength(playedNum, isReversedEffective);

    // 手札から削除
    const newHand = hands[playerIdx].filter(c => !cards.some(sc => sc.id === c.id));
    const nextHands = [...hands];
    nextHands[playerIdx] = newHand;
    setHands(nextHands);
    setSelectedCards([]);

    // 新しい場
    const newField = { cards, strength, count: cards.length, playedBy: playerIdx };
    setField(newField);

    let logs = [`P${playerIdx === 0 ? 'あなた' : playerIdx}がカードを出しました`];

    // ルール判定1: 革命 (4枚以上)
    if (cards.length >= 4) {
      setIsRevolution(!isRevolution);
      logs.push('🔥 革命発生！');
    }

    // ルール判定2: 11バック (Jが含まれる)
    if (cards.some(c => c.num === 11)) {
      setIs11Back(true);
      logs.push('↺ 11バック発生！');
    }

    // 都落ち判定（前試合の大富豪が1位になれなかった時）
    let isMiyakoOchi = false;
    if (matchCount > 1 && rankingsThisMatch.length === 0) {
      const prevDaifugo = prevRanks[0];
      if (playerIdx !== prevDaifugo) {
        // 他の人が1位上がり達成 -> 前大富豪は都落ち
        isMiyakoOchi = true;
      }
    }

    // 上がり判定
    let newRankings = [...rankingsThisMatch];
    if (newHand.length === 0 && !newRankings.includes(playerIdx)) {
      newRankings.push(playerIdx);
      logs.push(`🎉 P${playerIdx === 0 ? 'あなた' : playerIdx}が ${newRankings.length}位で上がり！`);

      if (isMiyakoOchi) {
        const prevDaifugo = prevRanks[0];
        if (!newRankings.includes(prevDaifugo)) {
          logs.push(`⚠️ 都落ち！ 前の大富豪は強制最下位！`);
          // 前大富豪の手札を破棄し最下位確定の準備
          nextHands[prevDaifugo] = [];
          setHands(nextHands);
        }
      }
    }

    setRankingsThisMatch(newRankings);
    setMessage(logs.join(' / '));

    // ルール判定3: 8切り
    if (cards.some(c => c.num === 8)) {
      setMessage('✂️ 8切り！ ターン継続');
      clearField(playerIdx, nextHands, newRankings);
      return;
    }

    // 次の手番へ
    advanceTurn(playerIdx, nextHands, newRankings, newField);
  };

  // --- パス処理 ---
  const passTurn = (playerIdx) => {
    const newPassed = [...passed];
    newPassed[playerIdx] = true;
    setPassed(newPassed);
    setMessage(`P${playerIdx === 0 ? 'あなた' : playerIdx}がパスしました`);

    advanceTurn(playerIdx, hands, rankingsThisMatch, field, newPassed);
  };

  // 場を流す
  const clearField = (nextTurnPlayer, currentHands, currentRankings) => {
    setField(null);
    setIs11Back(false); // 11バック解除
    setPassed([false, false, false, false]);
    
    // 上がっていないプレイヤーに手番を渡す
    let next = nextTurnPlayer;
    while (currentHands[next].length === 0 && currentRankings.length < 3) {
      next = (next + 1) % 4;
    }
    setTurn(next);
  };

  // 手番を進める
  const advanceTurn = (currentIdx, currentHands, currentRankings, currentField, currentPassed = passed) => {
    // 試合終了チェック（3人上がったら終了）
    if (currentRankings.length >= 3) {
      endMatch(currentRankings, currentHands);
      return;
    }

    let next = (currentIdx + 1) % 4;
    
    // パス済み・すでに上がり済みのプレイヤーをスキップ
    while (currentPassed[next] || currentHands[next].length === 0) {
      // 全員パスしたかチェック
      const activePlayers = [0, 1, 2, 3].filter(i => currentHands[i].length > 0);
      const activePassed = activePlayers.filter(i => currentPassed[i]);

      if (activePassed.length >= activePlayers.length - 1 && currentField && activePlayers.includes(currentField.playedBy)) {
        // 最後にカードを出した人の勝ちで場が流れる
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

  // CPUの思考AI
  useEffect(() => {
    if (currentScreen !== 'game' || turn === 0 || matchResultModal || gameResultModal) return;

    const cpuTimer = setTimeout(() => {
      const cpuHand = hands[turn];
      if (cpuHand.length === 0) return;

      // 出せる組み合わせを探索（やりがいのある少し強いAI）
      let candidateToPlay = findBestCpuMove(cpuHand, field, isReversedEffective);

      if (candidateToPlay) {
        playCards(turn, candidateToPlay);
      } else {
        passTurn(turn);
      }
    }, 1000);

    return () => clearTimeout(cpuTimer);
  }, [turn, field, hands, currentScreen, isReversedEffective, matchResultModal]);

  // CPU思考ロジック
  const findBestCpuMove = (hand, currentField, isRev) => {
    const sorted = [...hand].sort((a, b) => getCardStrength(a.num, isRev) - getCardStrength(b.num, isRev));

    // 場が空の場合：一番枚数が取れる組み合わせ、または一番弱いカードを出す
    if (!currentField) {
      // 8があれば8切りを狙う
      const eights = sorted.filter(c => c.num === 8);
      if (eights.length > 0) return [eights[0]];

      // 同一数字のペアを探す
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
      return [sorted[0]]; // 1枚出し
    }

    // スペード3の返し
    if (currentField.cards.length === 1 && currentField.cards[0].num === 0) {
      const sp3 = sorted.find(c => c.suit === '♠' && c.num === 3);
      if (sp3) return [sp3];
    }

    // 場にカードがある場合：枚数を合わせて出せる最小のカードを探す
    const reqCount = currentField.cards.length;
    
    // 単枚出しの場合
    if (reqCount === 1) {
      const valid = sorted.filter(c => isValidPlay([c], currentField, isRev));
      if (valid.length > 0) return [valid[0]];
    } else {
      // 複数枚出し
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

    return null; // パス
  };

  // --- 試合終了・ポイント計算 ---
  const endMatch = (finalRankings, finalHands) => {
    // まだ上がっていない人を最下位に
    const remaining = [0, 1, 2, 3].filter(i => !finalRankings.includes(i));
    const fullRankings = [...finalRankings, ...remaining];

    // ポイント配分: 1位: 2Pt, 2位: 1Pt, 3位: 0Pt, 4位: -1Pt
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
      // 5試合終了！ 総合順位決定
      finish5MatchGameSet(newScores);
    }
  };

  // 5試合終了時の処理
  const finish5MatchGameSet = (finalScores) => {
    // スコア順にランキング付け
    const playerIndices = [0, 1, 2, 3];
    playerIndices.sort((a, b) => finalScores[b] - finalScores[a]);

    const myFinalRank = playerIndices.indexOf(0); // 自分の最終順位 (0: 1位, 1: 2位...)

    // プロフィールデータ更新
    const newWins = [...userData.wins];
    newWins[myFinalRank] += 1;

    let newStreak = userData.currentWinStreak;
    if (myFinalRank === 0) newStreak += 1;
    else newStreak = 0;

    const updatedUser = {
      ...userData,
      wins: newWins,
      totalGames: userData.totalGames + 1,
      currentWinStreak: newStreak,
      maxWinStreak: Math.max(userData.maxWinStreak, newStreak)
    };
    saveUserData(updatedUser);

    setGameResultModal({
      finalRankings: playerIndices,
      scores: finalScores
    });
  };

  // カード選択タップ
  const toggleSelectCard = (card) => {
    if (selectedCards.some(c => c.id === card.id)) {
      setSelectedCards(selectedCards.filter(c => c.id !== card.id));
    } else {
      setSelectedCards([...selectedCards, card]);
    }
  };

  // 自分の「カードを出す」ボタンタップ
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
        
        {/* 初回ユーザーネーム登録 */}
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
            <button className="menu-btn" onClick={startNewGameSet}>コンピュータ対戦 (5試合)</button>
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
              <button className="menu-btn mode-btn" onClick={() => alert('ランク戦は次のステップで接続します')}>
                ランク戦
                <span className="btn-subtext">レーティング変動あり / ランキング反映</span>
              </button>
              <button className="menu-btn mode-btn" onClick={() => alert('ルーム戦は次のステップで接続します')}>
                ルーム戦
                <span className="btn-subtext">4桁の合い言葉で友達と対戦</span>
              </button>
            </div>
            <button className="back-btn" onClick={() => setCurrentScreen('menu')}>戻る</button>
          </div>
        )}

        {/* --- 大富豪 ゲーム画面 --- */}
        {currentScreen === 'game' && (
          <div className="game-board">
            <div className="game-header">
              <span>{matchCount} / 5 試合目</span>
              <span>Pt: {scores[0]}</span>
              {isRevolution && <span className="status-badge rev">革命中</span>}
              {is11Back && <span className="status-badge back">11バック</span>}
            </div>

            {/* CPUプレイヤー情報 */}
            <div className="cpu-players">
              {[1, 2, 3].map(cpuIdx => (
                <div key={cpuIdx} className={`cpu-card ${turn === cpuIdx ? 'active-turn' : ''}`}>
                  <div className="cpu-name">CPU {cpuIdx}</div>
                  <div className="cpu-cards-count">🂠 {hands[cpuIdx].length}枚</div>
                  <div className="cpu-score">Pt: {scores[cpuIdx]}</div>
                </div>
              ))}
            </div>

            {/* メッセージログ */}
            <div className="log-banner">{message}</div>

            {/* 場（カード表示） */}
            <div className="field-area">
              <div className="field-title">場</div>
              <div className="field-cards">
                {field ? (
                  field.cards.map((c, idx) => (
                    <div key={idx} className={`card-item ${userData.cardSize}`}>
                      {userData.cardDesign === 'mark' ? `${c.suit}${NUM_MAP[c.num] || ''}` : (NUM_MAP[c.num] || c.suit)}
                    </div>
                  ))
                ) : (
                  <div className="empty-field">カードはありません</div>
                )}
              </div>
            </div>

            {/* 自分の手札＆操作 */}
            <div className="player-area">
              <div className="player-info">
                <span>あなたの手札 ({hands[0].length}枚)</span>
                {turn === 0 && <span className="your-turn-badge">あなたの番です！</span>}
              </div>

              <div className="hand-cards">
                {hands[0].map(card => {
                  const isSelected = selectedCards.some(sc => sc.id === card.id);
                  return (
                    <div
                      key={card.id}
                      className={`card-item ${userData.cardSize} ${isSelected ? 'selected' : ''}`}
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
                        <span>{rank + 1}位: {pIdx === 0 ? 'あなた' : `CPU ${pIdx}`}</span>
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
                        <span>{rank + 1}位: {pIdx === 0 ? 'あなた' : `CPU ${pIdx}`}</span>
                        <span>合計 {gameResultModal.scores[pIdx]} Pt</span>
                      </div>
                    ))}
                  </div>
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
            <p className="info-text">※Firebase連携後に全体ランキングが表示されます</p>
            <div className="ranking-list">
              <div className="ranking-item">
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
              <h4>各順位獲得確率 (CPU戦含む)</h4>
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
