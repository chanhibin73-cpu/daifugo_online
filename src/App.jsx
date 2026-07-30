import React, { useState } from 'react';
import './App.css';

function App() {
  const [currentScreen, setCurrentScreen] = useState('menu');

  return (
    <div className="app-container">
      <div className="game-screen">
        
        {/* メインメニュー画面 */}
        {currentScreen === 'menu' && (
          <div className="menu-container">
            <h1>大富豪オンライン</h1>
            <button className="menu-btn" onClick={() => setCurrentScreen('online')}>オンライン対戦</button>
            <button className="menu-btn" onClick={() => setCurrentScreen('cpu')}>コンピュータ対戦</button>
            <button className="menu-btn" onClick={() => setCurrentScreen('ranking')}>全プレイヤーレーティングランキング</button>
            <button className="menu-btn" onClick={() => setCurrentScreen('profile')}>プロフィール</button>
            <button className="menu-btn" onClick={() => setCurrentScreen('settings')}>設定</button>
          </div>
        )}

        {/* サブ画面（仮） */}
        {currentScreen !== 'menu' && (
          <div className="sub-screen">
            <h2>準備中の画面です</h2>
            <button className="back-btn" onClick={() => setCurrentScreen('menu')}>メニューに戻る</button>
          </div>
        )}

      </div>
    </div>
  );
}

export default App;
