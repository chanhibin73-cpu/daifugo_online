import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  // 画面状態: 'menu', 'online_select', 'cpu', 'ranking', 'profile', 'settings', 'game'
  const [currentScreen, setCurrentScreen] = useState('menu');

  // ユーザー情報ステート（初期値またはlocalStorageから取得）
  const [userData, setUserData] = useState(() => {
    const saved = localStorage.getItem('daifugo_user');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return {
      username: '',
      rating: 500,
      maxRating: 500,
      wins: [0, 0, 0, 0], // 1位, 2位, 3位, 4位 の回数
      totalGames: 0,
      currentWinStreak: 0,
      maxWinStreak: 0,
      // 設定
      bgColor: '#2c3e50',
      bgImage: '',
      volume: 50,
      cardDesign: 'mark', // 'number' または 'mark'
      cardSize: 'medium' // 'small', 'medium', 'large'
    };
  });

  // モーダル表示状態
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showRecommendModal, setShowRecommendModal] = useState(false);
  const [inputUsername, setInputUsername] = useState('');

  // 初回起動チェック
  useEffect(() => {
    if (!userData.username) {
      setShowRegisterModal(true);
    }
  }, []);

  // ユーザーデータをローカルに保存
  const saveUserData = (newData) => {
    setUserData(newData);
    localStorage.setItem('daifugo_user', JSON.stringify(newData));
  };

  // 初回ユーザー登録処理
  const handleRegister = (e) => {
    e.preventDefault();
    if (!inputUsername.trim()) return;
    const updated = { ...userData, username: inputUsername.trim() };
    saveUserData(updated);
    setShowRegisterModal(false);
    setShowRecommendModal(true); // 登録後におすすめポップアップ表示
  };

  // 背景スタイルの動的適用
  const containerStyle = userData.bgImage
    ? { backgroundImage: `url(${userData.bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { backgroundColor: userData.bgColor };

  // 順位確率の計算
  const calcRate = (count) => {
    if (userData.totalGames === 0) return '0%';
    return `${((count / userData.totalGames) * 100).toFixed(1)}%`;
  };

  // 画像ファイルのアップロード処理（背景用）
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        saveUserData({ ...userData, bgImage: reader.result });
      };
      reader.readAsDataURL(file);
    }
  };

  // データ削除
  const handleResetData = () => {
    if (window.confirm('本当にすべてのデータを削除して初期化しますか？')) {
      localStorage.removeItem('daifugo_user');
      window.location.reload();
    }
  };

  return (
    <div className="app-outer" style={containerStyle}>
      <div className="app-container">
        
        {/* 初回ユーザーネーム登録モーダル */}
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

        {/* --- メインメニュー画面 --- */}
        {currentScreen === 'menu' && (
          <div className="menu-container">
            <h1 className="title">大富豪オンライン</h1>
            <p className="user-badge">ようこそ、{userData.username || 'ゲスト'} さん</p>
            
            <button className="menu-btn" onClick={() => setCurrentScreen('online_select')}>オンライン対戦</button>
            <button className="menu-btn" onClick={() => setCurrentScreen('cpu')}>コンピュータ対戦</button>
            <button className="menu-btn" onClick={() => setCurrentScreen('ranking')}>全プレイヤーレーティングランキング</button>
            <button className="menu-btn" onClick={() => setCurrentScreen('profile')}>プロフィール</button>
            <button className="menu-btn" onClick={() => setCurrentScreen('settings')}>設定</button>
          </div>
        )}

        {/* --- オンライン対戦 モード選択画面 --- */}
        {currentScreen === 'online_select' && (
          <div className="sub-screen">
            <h2>オンライン対戦</h2>
            <div className="menu-container">
              <button className="menu-btn mode-btn" onClick={() => alert('ランク戦待機ルームは次のステップで実装します！')}>
                ランク戦
                <span className="btn-subtext">レーティング変動あり / ランキング反映</span>
              </button>
              <button className="menu-btn mode-btn" onClick={() => alert('ルーム戦は次のステップで実装します！')}>
                ルーム戦
                <span className="btn-subtext">4桁の合い言葉で友達と対戦</span>
              </button>
            </div>
            <button className="back-btn" onClick={() => setCurrentScreen('menu')}>戻る</button>
          </div>
        )}

        {/* --- コンピュータ対戦（仮） --- */}
        {currentScreen === 'cpu' && (
          <div className="sub-screen">
            <h2>コンピュータ対戦</h2>
            <p>1ゲーム5試合勝負（CPU3人）</p>
            <button className="action-btn" onClick={() => alert('対戦ロジックは次のステップで実装します！')}>試合開始</button>
            <br /><br />
            <button className="back-btn" onClick={() => setCurrentScreen('menu')}>戻る</button>
          </div>
        )}

        {/* --- ランキング画面（仮） --- */}
        {currentScreen === 'ranking' && (
          <div className="sub-screen">
            <h2>全プレイヤーレーティングランキング</h2>
            <p className="info-text">※Firebase連携後にリアルタイムランキングが表示されます</p>
            <div className="ranking-list">
              <div className="ranking-item">
                <span>1位: {userData.username || 'あなた'}</span>
                <span>{userData.rating} Pt</span>
              </div>
            </div>
            <button className="back-btn" onClick={() => setCurrentScreen('menu')}>戻る</button>
          </div>
        )}

        {/* --- プロフィール画面 --- */}
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
            <p className="note">※ユーザーネームの変更は「設定」から行えます</p>
            <button className="back-btn" onClick={() => setCurrentScreen('menu')}>戻る</button>
          </div>
        )}

        {/* --- 設定画面 --- */}
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
              <label>自分の写真背景</label>
              <input type="file" accept="image/*" onChange={handleImageUpload} />
              {userData.bgImage && (
                <button className="small-btn" onClick={() => saveUserData({ ...userData, bgImage: '' })}>
                  背景写真を解除
                </button>
              )}
            </div>

            <div className="setting-item">
              <label>音量 ({userData.volume}%)</label>
              <input
                type="range"
                min="0"
                max="100"
                value={userData.volume}
                onChange={(e) => saveUserData({ ...userData, volume: Number(e.target.value) })}
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

            <div className="setting-item danger-zone">
              <button className="danger-btn" onClick={handleResetData}>データ削除</button>
            </div>

            <button className="back-btn" onClick={() => setCurrentScreen('menu')}>戻る</button>
          </div>
        )}

      </div>
    </div>
  );
}

export default App;
