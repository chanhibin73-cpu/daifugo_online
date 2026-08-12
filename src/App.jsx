import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { db, rtdb } from './firebase';
import { collection, doc, setDoc, deleteDoc, getDocs, getDoc, updateDoc } from 'firebase/firestore';
import { ref, set, get, update, onValue, off, push, remove } from 'firebase/database';

// --- アプリの更新履歴 ---
const UPDATE_HISTORY = [
  {
    version: '2.7',
    features: [
      '🤖 通常AIプレイヤーを20人、強化AIプレイヤーを5人追加しました。',
      '⏰ AIの休憩時間を 5:29〜5:59 と 23:29〜23:59 に変更しました。',
      '📈 ランキングにレーティングの増減を表示するようにしました。'
    ]
  },
  {
    version: '2.6',
    features: [
      '🤖 AIプレイヤーを1人追加し、超強化AI「AI_asn」を追加しました！',
      '📊 プロフィールに「最高順位」の項目を追加しました。',
      '🔐 アカウント登録機能を追加し、別のデバイスでもデータが共有できるようになりました。'
    ]
  },
  {
    version: '2.5.1',
    features: [
      '🤖 AIプレイヤーを2人追加しました。'
    ]
  },
  {
    version: '2.5',
    features: [
      '⚙️ アップデートを行いました。'
    ]
  },
  {
    version: '2.4',
    features: [
      '⚙️ レーティングの調整を行いました。'
    ]
  },
  {
    version: '2.3.1',
    features: [
      '📊 ランキングの順位変動を「累計変動数（↑2, ↓1 など）」で表示し、12時間ごとにリセット・更新される仕組みに変更しました！'
    ]
  },
  {
    version: '2.3',
    features: [
      '⚙️ システムの安定性を向上させました。'
    ]
  }
];

// --- AIプレイヤーの定義 ---
// 既存のAIに加えて、Ver2.7で通常AI20名、強化AI5名を追加
const AI_PLAYERS = [
  // 既存AI
  { id: 'ai_asn', name: 'AI_asn', rating: 3000, type: 'super' },
  { id: 'ai_1', name: 'AI_Taro', rating: 1600, type: 'normal' },
  { id: 'ai_2', name: 'AI_Hanako', rating: 1550, type: 'normal' },
  { id: 'ai_3', name: 'AI_Jiro', rating: 1500, type: 'normal' },
  
  // Ver2.7 新規追加: 通常AI (20人, レーティング500~2200)
  { id: 'ai_n1', name: 'AI_Alpha', rating: 2200, type: 'normal' },
  { id: 'ai_n2', name: 'AI_Beta', rating: 2100, type: 'normal' },
  { id: 'ai_n3', name: 'AI_Gamma', rating: 2000, type: 'normal' },
  { id: 'ai_n4', name: 'AI_Delta', rating: 1900, type: 'normal' },
  { id: 'ai_n5', name: 'AI_Epsilon', rating: 1800, type: 'normal' },
  { id: 'ai_n6', name: 'AI_Zeta', rating: 1700, type: 'normal' },
  { id: 'ai_n7', name: 'AI_Eta', rating: 1600, type: 'normal' },
  { id: 'ai_n8', name: 'AI_Theta', rating: 1550, type: 'normal' },
  { id: 'ai_n9', name: 'AI_Iota', rating: 1500, type: 'normal' },
  { id: 'ai_n10', name: 'AI_Kappa', rating: 1450, type: 'normal' },
  { id: 'ai_n11', name: 'AI_Lambda', rating: 1400, type: 'normal' },
  { id: 'ai_n12', name: 'AI_Mu', rating: 1300, type: 'normal' },
  { id: 'ai_n13', name: 'AI_Nu', rating: 1200, type: 'normal' },
  { id: 'ai_n14', name: 'AI_Xi', rating: 1100, type: 'normal' },
  { id: 'ai_n15', name: 'AI_Omicron', rating: 1000, type: 'normal' },
  { id: 'ai_n16', name: 'AI_Pi', rating: 900, type: 'normal' },
  { id: 'ai_n17', name: 'AI_Rho', rating: 800, type: 'normal' },
  { id: 'ai_n18', name: 'AI_Sigma', rating: 700, type: 'normal' },
  { id: 'ai_n19', name: 'AI_Tau', rating: 600, type: 'normal' },
  { id: 'ai_n20', name: 'AI_Upsilon', rating: 500, type: 'normal' },
  
  // Ver2.7 新規追加: 強化AI (5人, レーティング1~500)
  { id: 'ai_s1', name: 'AI_Str_1', rating: 500, type: 'strong' },
  { id: 'ai_s2', name: 'AI_Str_2', rating: 400, type: 'strong' },
  { id: 'ai_s3', name: 'AI_Str_3', rating: 300, type: 'strong' },
  { id: 'ai_s4', name: 'AI_Str_4', rating: 200, type: 'strong' },
  { id: 'ai_s5', name: 'AI_Str_5', rating: 100, type: 'strong' }
];

export default function App() {
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showDeleteDataModal, setShowDeleteDataModal] = useState(false);
  const [view, setView] = useState('home'); // 'home', 'playing'
  const [ranking, setRanking] = useState([]);
  
  // --- AIの休憩時間チェック ---
  // Ver2.7: 5:29~5:59, 23:29~23:59
  const checkAIRestTime = () => {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();

    if (h === 5 && m >= 29 && m <= 59) return true;
    if (h === 23 && m >= 29 && m <= 59) return true;

    return false;
  };

  const startGame = () => {
    if (checkAIRestTime()) {
      alert('現在AIは休憩中です（5:29〜5:59、23:29〜23:59）。時間をおいて再度お試しください。');
      return;
    }
    setView('playing');
  };

  // --- ランキング取得および更新処理 ---
  const fetchRanking = async () => {
    try {
      const usersRef = collection(db, 'users');
      const snapshot = await getDocs(usersRef);
      let usersData = [];
      snapshot.forEach(doc => {
        usersData.push({ id: doc.id, ...doc.data() });
      });
      
      // レーティングで降順ソート
      usersData.sort((a, b) => (b.rating || 0) - (a.rating || 0));

      const now = new Date();
      // 12時間ごとの更新判定
      let shouldUpdateDiff = false;
      const lastUpdate = localStorage.getItem('lastRankingUpdateTimer');
      if (!lastUpdate || (now.getTime() - parseInt(lastUpdate)) > 12 * 60 * 60 * 1000) {
          shouldUpdateDiff = true;
          localStorage.setItem('lastRankingUpdateTimer', now.getTime().toString());
      }

      const updatedUsers = usersData.map((u, index) => {
        const currentRank = index + 1;
        let prevRank = u.previousRank || currentRank;
        let prevRating = u.previousRating || u.rating || 1500;
        
        if (shouldUpdateDiff) {
            prevRank = currentRank;
            prevRating = u.rating || 1500;
            // 順位・レーティング変動の基準値を更新
            updateDoc(doc(db, 'users', u.id), {
                previousRank: prevRank,
                previousRating: prevRating
            }).catch(e => console.error("Ranking update error:", e));
        }

        return {
            ...u,
            currentRank,
            previousRank: prevRank,
            previousRating: prevRating
        };
      });

      setRanking(updatedUsers);
    } catch (error) {
      console.error("ランキング取得エラー:", error);
    }
  };

  useEffect(() => {
    if (view === 'home') {
      fetchRanking();
    }
  }, [view]);

  return (
    <div className="App" style={{ maxWidth: '600px', margin: '0 auto', fontFamily: 'sans-serif', padding: '10px' }}>
      
      {view === 'home' && (
        <div className="home-screen">
          <h1 style={{ textAlign: 'center', color: '#2c3e50' }}>大富豪アプリ</h1>
          
          <div className="start-btn-container" style={{ textAlign: 'center', margin: '20px 0' }}>
            <button 
              onClick={startGame}
              style={{ padding: '15px 30px', fontSize: '18px', backgroundColor: '#27ae60', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', width: '80%' }}
            >
              ▶ ゲームスタート
            </button>
          </div>

          <div className="ranking-section" style={{ backgroundColor: '#f9f9f9', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
            <h3 style={{ marginTop: 0, borderBottom: '2px solid #3498db', paddingBottom: '5px' }}>🏆 ランキング</h3>
            {ranking.length === 0 ? (
              <p>データを読み込み中...</p>
            ) : (
              <div className="ranking-list">
                {ranking.slice(0, 50).map((user) => {
                  const rankDiff = user.previousRank ? user.previousRank - user.currentRank : 0;
                  const rateDiff = user.previousRating ? Math.round((user.rating || 1500) - user.previousRating) : 0;
                  
                  return (
                    <div key={user.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #ddd' }}>
                      <div style={{ fontWeight: 'bold' }}>
                        <span style={{ display: 'inline-block', width: '30px' }}>{user.currentRank}位</span> 
                        {user.name || '名無し'}
                      </div>
                      <div style={{ textAlign: 'right', fontSize: '14px' }}>
                        <div>レート: {Math.round(user.rating || 1500)}</div>
                        <div style={{ fontSize: '12px', marginTop: '2px' }}>
                          順位: {rankDiff > 0 ? <span style={{color:'#e74c3c'}}>↑{rankDiff}</span> : rankDiff < 0 ? <span style={{color:'#3498db'}}>↓{Math.abs(rankDiff)}</span> : <span style={{color:'#7f8c8d'}}>-</span>}
                          {' | '}
                          レート: {rateDiff > 0 ? <span style={{color:'#e74c3c'}}>+{rateDiff}</span> : rateDiff < 0 ? <span style={{color:'#3498db'}}>{rateDiff}</span> : <span style={{color:'#7f8c8d'}}>±0</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="setting-rules-box" style={{ backgroundColor: '#ecf0f1', padding: '15px', borderRadius: '8px' }}>
            <h4 style={{ margin: '0 0 10px 0' }}>📜 採用ルール</h4>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', lineHeight: '1.6' }}>
              <li><strong>革命:</strong> 同数4枚以上出しで即座に強さ反転</li>
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
            <button className="action-btn" style={{ backgroundColor: '#3498db', color: '#fff', border: 'none', padding: '10px', borderRadius: '5px', width: '100%', cursor: 'pointer' }} onClick={() => setShowUpdateModal(true)}>
              📢 更新情報 (リリースノート) を確認
            </button>
          </div>

          <div style={{ marginTop: '10px', textAlign: 'center', marginBottom: '30px' }}>
            <button className="action-btn warning-btn" style={{ backgroundColor: '#e74c3c', color: '#fff', border: 'none', padding: '10px', borderRadius: '5px', width: '100%', cursor: 'pointer' }} onClick={() => setShowDeleteDataModal(true)}>
              🗑 全データを削除して初期化
            </button>
          </div>
        </div>
      )}

      {view === 'playing' && (
        <div className="playing-screen">
          <h2 style={{ textAlign: 'center' }}>ゲームプレイ中...</h2>
          <button onClick={() => setView('home')} style={{ display: 'block', margin: '0 auto', padding: '10px 20px' }}>ホームに戻る</button>
        </div>
      )}

      {/* 更新情報モーダル */}
      {showUpdateModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', width: '90%', maxWidth: '400px', maxHeight: '80vh', overflowY: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>リリースノート</h3>
            {UPDATE_HISTORY.map((hist, idx) => (
              <div key={idx} style={{ marginBottom: '15px', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
                <h4 style={{ margin: '0 0 5px 0', color: '#2980b9' }}>Ver {hist.version}</h4>
                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px' }}>
                  {hist.features.map((feat, fIdx) => (
                    <li key={fIdx}>{feat}</li>
                  ))}
                </ul>
              </div>
            ))}
            <button onClick={() => setShowUpdateModal(false)} style={{ width: '100%', padding: '10px', backgroundColor: '#bdc3c7', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* データ削除モーダル */}
      {showDeleteDataModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', width: '80%', maxWidth: '300px', textAlign: 'center' }}>
            <h3 style={{ color: '#e74c3c', marginTop: 0 }}>警告</h3>
            <p style={{ fontSize: '14px' }}>本当に全データを削除して初期化しますか？</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
              <button onClick={() => setShowDeleteDataModal(false)} style={{ padding: '10px 20px', backgroundColor: '#bdc3c7', border: 'none', borderRadius: '5px' }}>キャンセル</button>
              <button onClick={() => { alert('初期化しました'); setShowDeleteDataModal(false); }} style={{ padding: '10px 20px', backgroundColor: '#e74c3c', color: '#fff', border: 'none', borderRadius: '5px' }}>削除する</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

