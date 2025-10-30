// app.js
// JavaScript extracted from the inline <script type="module"> in the original HTML
// (Keep as a module so Firebase imports work)
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot, collection, serverTimestamp, setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Firebase Loggingを有効化 (デバッグ用)
setLogLevel('debug');

// デフォルトの座標（東京駅） - 位置情報エラー時のフォールバック
const DEFAULT_LAT = 35.681236, DEFAULT_LNG = 139.767125;

// --- 修正箇所 1: 認証状態フラグの追加 ---
let isAuthReady = false; 

// Firebase Initialization
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
    // Local testing config (dummy values)
    apiKey: "AIzaSyCDSiW9H_zD0yMUda9QI0PHViKDPUJ7aak",
    authDomain: "mapaplication-131cd.firebaseapp.com",
    projectId: "mapaplication-131cd",
    storageBucket: "mapaplication-131cd.firebasestorage.app",
    messagingSenderId: "705232824885",
    appId: "1:705232824885:web:206e16a332b1b987929f7c",
    measurementId: "G-39Q9ZDTB0V"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

let userId = null;
let visitedLocations = {}; // { locationId: { id, name, firstVisit, lastVisit } }
let currentMapPosition = { lat: DEFAULT_LAT, lng: DEFAULT_LNG };


// Auth State Listener
onAuthStateChanged(auth, async (user) => {
    if (user) {
        userId = user.uid;
        console.log("Firebase Auth State Changed. User ID:", userId);
        
        // 訪問履歴をリアルタイムで同期
        const visitedRef = collection(db, `artifacts/${appId}/users/${userId}/visited_locations`);
        onSnapshot(visitedRef, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                const data = change.doc.data();
                // Firestoreから取得したTimestampをDateオブジェクトに変換
                visitedLocations[change.doc.id] = {
                    id: change.doc.id,
                    name: data.name,
                    // Timestampは.toDate()で変換できる
                    firstVisit: data.firstVisit ? data.firstVisit.toDate() : null,
                    lastVisit: data.lastVisit ? data.lastVisit.toDate() : null
                };
            });
            console.log("Visited locations updated:", visitedLocations);
            // 訪問履歴が更新されたらUIも更新
            updateGameStatusUI(currentMapPosition.lat, currentMapPosition.lng);

        }, (error) => {
            console.error("Error listening to visited locations:", error);
        });

        // 認証が完了し、データリスナーも設定されたことを示す
        isAuthReady = true; 

    } else {
        console.log("No user signed in. Signing in anonymously.");
        // 初回認証処理 (匿名認証またはカスタム認証)
        try {
            if (typeof __initial_auth_token !== 'undefined') {
                await signInWithCustomToken(auth, __initial_auth_token);
            } else {
                await signInAnonymously(auth);
            }
        } catch (error) {
            console.error("Anonymous sign-in failed:", error);
        }
    }
});

// Game messages data
const gameMessages = {
    tokyo_station: {
        title: '東京駅の秘密',
        text: '東京駅を発見しました！不思議なメモが落ちています…。「東の森の奥深くに、失われた宝が眠る。」と書かれている。'
    },
    asakusa_sensoji: {
        title: '浅草寺の静寂',
        text: '浅草寺に到着しました。荘厳な雰囲気の中で、この世界の真実が映し出されているように見えます。'
    },
    shinjuku_gyoen: {
        title: '新宿御苑の手帳',
        text: '新宿御苑のベンチの下に、古びた手帳を見つけました。次の目的地へのヒントが隠されているようです。'
    },
    geolocation_error: {
        title: '位置情報エラー',
        text: '位置情報を取得できません。お使いのブラウザやデバイスの設定（GPSアクセス許可）を確認してください。'
    },
    browser_unsupported: {
        title: '非対応ブラウザ',
        text: 'お使いのブラウザはGeolocationをサポートしていません。'
    },
    ryuiti: {
        title:'竜一の隠れ家',
        text: '高台の上にあるため見晴らしがいい'
    },
    ryugasaki_syotengai: {
        title:'龍ヶ崎商店街',
        text: 'ここではいろいろなアイテムが売っている。'
    },
    game_intro: {
        title: '冒険の始まり',
        text: 'このゲームは、現実世界を舞台にした冒険ゲームです。\n\n地図上にある青いサークルは目的地です。サークルの中に入ると、画面の下にボタンが現れます。ボタンを押して、メッセージを読みましょう！\n\nさあ、冒険に出発です！'
    },
    firestore_error: {
        title: 'データ保存エラー',
        text: 'ユーザーデータの保存中に問題が発生しました。インターネット接続を確認し、ブラウザを再読み込みしてもう一度お試しください。'
    },
    auth_error: {
        title: '認証処理中',
        text: 'ゲームの初期設定（ユーザー認証）がまだ完了していません。しばらくお待ちいただくか、ブラウザを再読み込みしてください。'
    }
};

let map, marker, watchId=null, lastPosition=null, activeEventLocation=null;

const eventLocations = [
    { id:'tokyo_station', name:'東京駅', lat:35.681236, lng:139.767125, radius:150, messageId: 'tokyo_station' },
    { id:'asakusa_sensoji', name:'浅草寺', lat:35.714774, lng:139.796637, radius:80, messageId: 'asakusa_sensoji' },
    { id:'shinjuku_gyoen', name:'新宿御苑', lat:35.685175, lng:139.710776, radius:100, messageId: 'shinjuku_gyoen' },
    { id:'ryuiti', name:'竜一の隠れ家', lat:35.9150826, lng:140.1875742, radius:150, messageId: 'ryuiti' },
    { id:'syotengai', name:'龍ヶ崎商店街', lat:35.90764205837861, lng:140.18062645636314, radius:150, messageId: 'ryugasaki_syotengai'}
];

// DOM elements
const titleScreen = document.getElementById('titleScreen');
const introMessageBox = document.getElementById('introMessageBox');
const gameScreen = document.getElementById('gameScreen');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingMessage = document.getElementById('loadingMessage'); // 修正: メッセージエレメントを取得
const messageBox = document.getElementById('messageBox');
const messageTitle = document.getElementById('messageTitle');
const messageText = document.getElementById('messageText');
const eventActionButton = document.getElementById('eventActionButton');
const eventButtonText = document.getElementById('eventButtonText');
const diaryScreen = document.getElementById('diaryScreen');
const diaryList = document.getElementById('diaryList');
const startButton = document.getElementById('startButton');
const continueButton = document.getElementById('continueButton');
const closeMessageButton = document.getElementById('closeMessageButton');
const closeDiaryScreenButton = document.getElementById('closeDiaryScreenButton');
const diaryButton = document.getElementById('diaryButton');
const visitedCountDisplay = document.getElementById('visitedCountDisplay');
const nearestTargetDisplay = document.getElementById('nearestTargetDisplay');

function showMessageBox(messageId) {
    const messageData = gameMessages[messageId];
    if (messageData) {
        messageTitle.innerText = messageData.title;
        messageText.innerText = messageData.text;
        messageBox.classList.remove('hidden');
    }
}

function hideMessageBox() {
    messageBox.classList.add('hidden');
}

function showDiaryScreen() {
    diaryList.innerHTML = '';
    const visitedArray = Object.values(visitedLocations);
    
    if (visitedArray.length === 0) {
        const li = document.createElement('li');
        li.innerHTML = 'まだ訪れた場所はありません。';
        diaryList.appendChild(li);
    } else {
        // 日付の新しい順にソート
        visitedArray.sort((a, b) => b.lastVisit.getTime() - a.lastVisit.getTime());
        visitedArray.forEach(loc => {
            // 日付のフォーマット関数
            const formatDate = (date) => date ? date.toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'N/A';
            
            const firstVisitDate = formatDate(loc.firstVisit);
            const lastVisitDate = formatDate(loc.lastVisit);
            
            const li = document.createElement('li');
            li.innerHTML = `
                <strong>${loc.name}</strong><br>
                初回訪問: ${firstVisitDate}<br>
                最終訪問: ${lastVisitDate}
            `;
            diaryList.appendChild(li);
        });
    }
    gameScreen.classList.add('hidden');
    diaryScreen.classList.remove('hidden');
}

function hideDiaryScreen() {
    diaryScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
}

/**
 * 訪問履歴をFirestoreに保存・更新する
 */
async function handleEventButtonClick() {
    // --- 修正箇所 1: 認証完了を待つ ---
    if (!isAuthReady || !userId) {
        console.error("Authentication not ready or user ID missing. Blocking Firestore write.");
        showMessageBox('auth_error'); // 認証未完了メッセージ
        return;
    }

    if (!activeEventLocation) {
        console.error("No active event location found.");
        return;
    }
    
    const locationDocRef = doc(db, `artifacts/${appId}/users/${userId}/visited_locations`, activeEventLocation.id);
    
    try {
        const docSnap = await getDoc(locationDocRef);
        const now = serverTimestamp();

        if (docSnap.exists()) {
            // 既に訪問済みの場合、最終訪問日時のみを更新
            await setDoc(locationDocRef, {
                lastVisit: now
            }, { merge: true });
            console.log("Updated last visit for", activeEventLocation.name);
        } else {
            // 初回訪問の場合、初回訪問日時と最終訪問日時を記録
            await setDoc(locationDocRef, {
                id: activeEventLocation.id,
                name: activeEventLocation.name,
                firstVisit: now,
                lastVisit: now
            });
            console.log("Recorded first visit for", activeEventLocation.name);
        }
        
        // イベントメッセージを表示
        showMessageBox(activeEventLocation.messageId);

    } catch (error) {
        console.error("Error updating Firestore visit record:", error);
        showMessageBox('firestore_error'); 
    }
}

// Haversine formula for distance calculation (meters)
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function initMap(latitude, longitude) {
    const currentLocation = [latitude, longitude];
    if (map) {
        // マップが既に存在する場合は、視点とマーカーのみを更新
        map.setView(currentLocation, 18);
        marker.setLatLng(currentLocation);
    } else {
        // 初回マップ初期化
        map = L.map('map').setView(currentLocation, 18);
        // 日本のタイルも利用可能なOSMを使用
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }).addTo(map);

        marker = L.marker(currentLocation, {
            icon: L.divIcon({
                className: 'custom-marker',
                html: `<div class="player-marker"></div>`, // プレイヤーマーカーのスタイルを適用
                iconSize: [18, 18]
            })
        }).addTo(map);

        // イベント地点のマーカーとサークルを追加
        eventLocations.forEach(loc => {
            L.circle([loc.lat, loc.lng], {
                color: '#0000FF', fillColor: '#0000FF', fillOpacity: 0.15, radius: loc.radius
            }).addTo(map);
            // 中心点マーカー (視覚的な目印として)
            L.circleMarker([loc.lat, loc.lng], {
                color: '#0000FF', fillColor: '#0000FF', fillOpacity: 0.8, radius: 5, stroke: false
            }).addTo(map)
            .bindPopup(`<b>${loc.name}</b><br>目標地点`);
        });
    }
    loadingOverlay.classList.add('hidden');
}

/**
 * 現在の訪問実績と最寄りの未訪問地点までの距離を更新する
 * @param {number} currentLat - 現在の緯度
 * @param {number} currentLng - 現在の経度
 */
function updateGameStatusUI(currentLat, currentLng) {
    const visitedCount = Object.keys(visitedLocations).length;
    visitedCountDisplay.innerText = `実績: ${visitedCount} / ${eventLocations.length} 箇所`;

    let nearestUnvisited = null;
    let minDistance = Infinity;

    if (visitedCount === eventLocations.length) {
        nearestTargetDisplay.innerHTML = '<strong>全ての場所を訪問しました！おめでとう！</strong>';
        return;
    }

    // 1. 最も近い未訪問の地点を見つける
    eventLocations.forEach(loc => {
        // 訪問済みリストに存在しない場所をチェック
        if (!visitedLocations[loc.id]) {
            const distance = getDistance(currentLat, currentLng, loc.lat, loc.lng);
            if (distance < minDistance) {
                minDistance = distance;
                nearestUnvisited = loc;
            }
        }
    });

    if (nearestUnvisited) {
        let distanceText;
        if (minDistance < 1000) {
            distanceText = `${Math.round(minDistance)}m`;
        } else {
            distanceText = `${(minDistance / 1000).toFixed(1)}km`;
        }
        nearestTargetDisplay.innerHTML = `<strong>次の目標: ${nearestUnvisited.name}</strong> (約 ${distanceText}先)`;
    } else if (visitedCount < eventLocations.length) {
         // まだ達成されていない地点があるが、最寄りの地点を見つけられなかった場合（通常、このブロックには入らないはず）
         nearestTargetDisplay.innerHTML = '目標地点を探索中...';
    } else {
        // 全ての地点を達成した場合（上のガード節で対応済みだが念のため）
        nearestTargetDisplay.innerHTML = '現在地を測定中...';
    }
}


function startGeolocationTracking() {
    loadingOverlay.classList.remove('hidden');
    loadingMessage.innerText = '現在地を取得中...'; // メッセージ更新

    if (navigator.geolocation) {
        // --- 修正箇所 2: Geolocationオプションを緩和 ---
        watchId = navigator.geolocation.watchPosition(pos => {
            const lat = pos.coords.latitude, lng = pos.coords.longitude;
            currentMapPosition = { lat: lat, lng: lng };
            initMap(lat, lng);
            
            // ゲームステータスUIの更新
            updateGameStatusUI(lat, lng);

            let found = false;
            const GPS_JITTER_BUFFER = 5; // 5メートルのバッファを導入
            
            eventLocations.forEach(loc => {
                const distance = getDistance(lat, lng, loc.lat, loc.lng);
                // --- 修正箇所 3: バッファを追加して判定を緩和 ---
                if (distance <= loc.radius + GPS_JITTER_BUFFER) {
                    activeEventLocation = loc;
                    eventButtonText.innerText = `${loc.name}のメッセージを見る`;
                    eventActionButton.classList.remove('hidden');
                    found = true;
                }
            });
            
            if (!found) {
                eventActionButton.classList.add('hidden');
                activeEventLocation = null;
            }

            loadingOverlay.classList.add('hidden');
        }, err => {
            // エラー発生時の処理
            let errorMessage = '位置情報サービスが拒否されました。設定を確認してください。';
            if (err.code === err.POSITION_UNAVAILABLE) {
                errorMessage = 'GPS信号が検出できません。屋外に移動してみてください。';
            } else if (err.code === err.TIMEOUT) {
                errorMessage = '位置情報の取得に時間がかかりすぎました。';
            }
            gameMessages.geolocation_error.text = errorMessage;

            showMessageBox('geolocation_error');
            initMap(DEFAULT_LAT, DEFAULT_LNG); // エラー時もマップは表示
            loadingOverlay.classList.add('hidden');
        }, { 
            enableHighAccuracy: true, 
            timeout: 60000,      // タイムアウトを延長
            maximumAge: 3000     // 3秒以内のキャッシュを再利用
        });
    } else {
        showMessageBox('browser_unsupported');
        initMap(DEFAULT_LAT, DEFAULT_LNG);
        loadingOverlay.classList.add('hidden');
    }
}

// Handle start game button click
function startGame() {
    titleScreen.classList.add('hidden');
    showGameIntro();
}

// Show game introduction
function showGameIntro() {
    const messageData = gameMessages['game_intro'];
    document.getElementById('introTitle').innerText = messageData.title;
    document.getElementById('introText').innerText = messageData.text;
    introMessageBox.classList.remove('hidden');
}

// Continue to the game screen from intro
function continueToGame() {
    introMessageBox.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    startGeolocationTracking();
    // マップサイズが確定した後にLeafletに通知
    setTimeout(() => {
        if (map) map.invalidateSize();
    }, 100);
}

// Event Listeners
startButton.addEventListener('click', startGame);
continueButton.addEventListener('click', continueToGame);
closeMessageButton.addEventListener('click', hideMessageBox);
closeDiaryScreenButton.addEventListener('click', hideDiaryScreen);
eventActionButton.addEventListener('click', handleEventButtonClick);
diaryButton.addEventListener('click', showDiaryScreen);
