// app.js

// Global Game State
let sentences = [];
let filteredSentences = [];
let gameMode = 'single'; // 'single' | 'computer' | 'double'
let grade = 1;
let puzzleType = 'hanzi'; // 'hanzi' | 'tailo'
let currentQuestionIdx = 0;
let correctCount = 0;
let score = 0;

// Player answers
let playerAnswer = []; // selected tiles
let p1Answer = [];
let p2Answer = [];
let p1Score = 0;
let p2Score = 0;

// Combat / AI state
let computerProgress = 0;
let aiInterval = null;
let computerFinished = false;
let doubleRoundFinished = false;

// Audio Context for Sound Synthesis (Web Audio API)
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

// Sound Effects Synthesizer
function playSound(type) {
  initAudio();
  if (!audioCtx) return;
  
  // Resume context if suspended (browser security)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  
  const now = audioCtx.currentTime;
  
  if (type === 'correct') {
    // Triumphant arpeggio
    osc.type = 'sine';
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    
    // Play sequence of notes (C5 -> E5 -> G5 -> C6)
    osc.frequency.setValueAtTime(523.25, now); // C5
    osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
    osc.frequency.setValueAtTime(783.99, now + 0.16); // G5
    osc.frequency.setValueAtTime(1046.50, now + 0.24); // C6
    
    osc.start(now);
    osc.stop(now + 0.45);
  } else if (type === 'wrong') {
    // Sad buzz
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(130.81, now); // C3
    osc.frequency.linearRampToValueAtTime(80, now + 0.3);
    
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.25, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    
    osc.start(now);
    osc.stop(now + 0.4);
  } else if (type === 'click') {
    // Soft pop
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.1);
    
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    
    osc.start(now);
    osc.stop(now + 0.12);
  } else if (type === 'win') {
    // Fanfare
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(261.63, now); // C4
    osc.frequency.setValueAtTime(329.63, now + 0.1); // E4
    osc.frequency.setValueAtTime(392.00, now + 0.2); // G4
    osc.frequency.setValueAtTime(523.25, now + 0.3); // C5
    
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    
    osc.start(now);
    osc.stop(now + 0.6);
  }
}

// Map sentence object to grade (1 to 6) based on Hanzi length
function getGradeForSentence(s) {
  const cleanHanzi = s.hanzi.replace(/[^\u4e00-\u9fff]/g, '');
  const len = cleanHanzi.length;
  if (len <= 5) return 1;
  if (len <= 7) return 2;
  if (len <= 9) return 3;
  if (len <= 11) return 4;
  if (len <= 13) return 5;
  return 6;
}

// Split Hanzi string into character array (preserving surrogate pairs for extensions like 𠢕)
function getHanziTiles(hanziStr) {
  const clean = hanziStr.replace(/[。！？，、：；「」()（）.,!?;:\"”' \s]/g, '');
  return [...clean];
}

// Split Tailo string into syllable array (lowercased, ignoring punctuation/spaces)
function getTailoTiles(tailoStr) {
  // Normalize double hyphens and replace single hyphens with space
  let clean = tailoStr.replace(/--/g, ' ');
  clean = clean.replace(/-/g, ' ');
  // Strip punctuation
  clean = clean.replace(/[.,!?;:\"”'(\)0-9]/g, '');
  // Split and filter empty items
  return clean.toLowerCase().split(/\s+/).filter(w => w.trim().length > 0);
}

// Scramble helper
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Fetch database
async function loadDatabase() {
  try {
    const response = await fetch('./data/processed/taigi_sentences.json');
    sentences = await response.json();
    console.log(`Database loaded: ${sentences.length} sentences.`);
  } catch (error) {
    console.error('Failed to load database:', error);
  }
}

// Setup Event Listeners
document.addEventListener('DOMContentLoaded', async () => {
  await loadDatabase();
  
  // Start Screen selectors
  const modeBtns = document.querySelectorAll('.mode-btn');
  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      playSound('click');
      modeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      gameMode = btn.dataset.mode;
    });
  });

  const gradeBtns = document.querySelectorAll('.grade-btn');
  gradeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      playSound('click');
      gradeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      grade = parseInt(btn.dataset.grade);
    });
  });

  const typeBtns = document.querySelectorAll('.type-btn');
  typeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      playSound('click');
      typeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      puzzleType = btn.dataset.type;
    });
  });

  // Start Challenge Button
  document.getElementById('start-game-btn').addEventListener('click', () => {
    playSound('win');
    startChallenge();
  });

  // Back home button hook
  document.querySelectorAll('.back-home-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      playSound('click');
      clearInterval(aiInterval);
      showScreen('start-screen');
    });
  });

  // Setup Single Player handlers
  document.getElementById('clear-btn').addEventListener('click', () => {
    playSound('click');
    clearCurrentAnswer();
  });

  document.getElementById('submit-btn').addEventListener('click', () => {
    verifyAnswerAndProceed();
  });

  // Audio Play helper
  document.getElementById('play-audio-btn').addEventListener('click', () => {
    playCurrentAudio();
  });

  // Double player clear handlers
  document.querySelectorAll('.split-clear-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      playSound('click');
      const p = e.target.dataset.player;
      clearSplitAnswer(p);
    });
  });

  // End Screen Retry & Next Level hooks
  document.getElementById('retry-btn').addEventListener('click', () => {
    playSound('click');
    startChallenge();
  });

  document.getElementById('next-level-btn').addEventListener('click', () => {
    playSound('click');
    if (grade < 6) grade += 1;
    // Update active UI grade button
    document.querySelectorAll('.grade-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.grade) === grade);
    });
    startChallenge();
  });

  document.getElementById('end-home-btn').addEventListener('click', () => {
    playSound('click');
    showScreen('start-screen');
  });
});

// View switcher
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(scr => {
    scr.classList.remove('active');
  });
  document.getElementById(screenId).classList.add('active');
}

// Start Game Entry
function startChallenge() {
  // Filter sentences by grade
  filteredSentences = sentences.filter(s => getGradeForSentence(s) === grade);
  
  if (filteredSentences.length === 0) {
    alert('此年級目前無可用語句！');
    return;
  }
  
  // Shuffle questions and select up to 10
  filteredSentences = shuffleArray(filteredSentences).slice(0, 10);
  
  currentQuestionIdx = 0;
  correctCount = 0;
  score = 0;
  p1Score = 0;
  p2Score = 0;
  
  // Reset split-screen scores UI
  document.getElementById('p1-score').textContent = '0';
  document.getElementById('p2-score').textContent = '0';
  
  // Update header text UI
  const modeText = gameMode === 'single' ? '單人練習' : (gameMode === 'computer' ? '挑戰電腦 AI' : '雙人對戰');
  const gradeText = ['一年級', '二年級', '三年級', '四年級', '五年級', '六年級'][grade - 1];
  
  document.getElementById('display-mode').textContent = modeText;
  document.getElementById('display-grade').textContent = gradeText;
  document.getElementById('total-questions-idx').textContent = filteredSentences.length.toString();
  
  // Configure arenas
  if (gameMode === 'double') {
    showScreen('double-screen');
    setupDoubleRound();
  } else {
    showScreen('game-screen');
    const vsArena = document.getElementById('vs-arena');
    if (gameMode === 'computer') {
      vsArena.classList.add('active');
    } else {
      vsArena.classList.remove('active');
    }
    setupQuestionRound();
  }
}

// SETUP QUESTION ROUND: SINGLE / VS COMPUTER
function setupQuestionRound() {
  clearInterval(aiInterval);
  const q = filteredSentences[currentQuestionIdx];
  
  document.getElementById('current-question-idx').textContent = (currentQuestionIdx + 1).toString();
  document.getElementById('mandarin-prompt').textContent = q.mandarin;
  
  // Load audio source
  const audio = document.getElementById('global-audio');
  audio.src = q.audio_url;
  
  // Automatically play audio at start of round
  playCurrentAudio();
  
  // Prepare tiles
  const targetArray = puzzleType === 'hanzi' ? getHanziTiles(q.hanzi) : getTailoTiles(q.tailo);
  const scrambled = shuffleArray(targetArray);
  
  playerAnswer = [];
  computerProgress = 0;
  computerFinished = false;
  
  // Render empty slots
  const slotsContainer = document.getElementById('answer-slots');
  slotsContainer.innerHTML = '';
  targetArray.forEach(() => {
    const slot = document.createElement('div');
    slot.className = 'word-tile empty-slot';
    slot.style.border = '2px dashed #94a3b8';
    slot.style.background = 'transparent';
    slot.style.boxShadow = 'none';
    slot.style.width = puzzleType === 'tailo' ? '80px' : '54px';
    slotsContainer.appendChild(slot);
  });
  
  // Render source tiles
  const sourceContainer = document.getElementById('source-tiles');
  sourceContainer.innerHTML = '';
  scrambled.forEach((text, index) => {
    const tile = document.createElement('div');
    tile.className = 'word-tile';
    if (puzzleType === 'tailo') tile.classList.add('tailo-tile');
    tile.textContent = text;
    tile.dataset.index = index;
    
    tile.addEventListener('click', () => {
      playSound('click');
      selectTile(tile);
    });
    sourceContainer.appendChild(tile);
  });
  
  // If VS Computer, trigger AI task loop
  if (gameMode === 'computer') {
    // Reset progresses
    document.getElementById('player-progress-bar').style.width = '0%';
    document.getElementById('computer-progress-bar').style.width = '0%';
    
    // AI speed settings: Grade 1 (slowest) to Grade 6 (fastest)
    const speeds = [12000, 10000, 8000, 6000, 4500, 3000];
    const totalAiTime = speeds[grade - 1];
    const stepsCount = targetArray.length;
    const intervalTime = totalAiTime / stepsCount;
    
    let currentStep = 0;
    aiInterval = setInterval(() => {
      currentStep++;
      computerProgress = (currentStep / stepsCount) * 100;
      document.getElementById('computer-progress-bar').style.width = `${computerProgress}%`;
      
      if (currentStep >= stepsCount) {
        clearInterval(aiInterval);
        computerFinished = true;
      }
    }, intervalTime);
  }
}

// TILE SELECTION MANAGER
function selectTile(tile) {
  if (tile.classList.contains('disabled')) return;
  
  tile.classList.add('disabled');
  playerAnswer.push({
    text: tile.textContent,
    srcIndex: tile.dataset.index
  });
  
  updateAnswerSlotsDisplay();
  
  // Update Player Progress Bar in AI Mode
  if (gameMode === 'computer') {
    const q = filteredSentences[currentQuestionIdx];
    const targetLength = puzzleType === 'hanzi' ? getHanziTiles(q.hanzi).length : getTailoTiles(q.tailo).length;
    const progress = (playerAnswer.length / targetLength) * 100;
    document.getElementById('player-progress-bar').style.width = `${progress}%`;
  }
}

// Refresh assembly slots UI
function updateAnswerSlotsDisplay() {
  const slotsContainer = document.getElementById('answer-slots');
  const slots = slotsContainer.querySelectorAll('.word-tile');
  
  // Clear all
  slots.forEach(s => {
    s.textContent = '';
    s.classList.remove('active-filled');
    s.style.border = '2px dashed #94a3b8';
    s.style.background = 'transparent';
  });
  
  // Fill selected
  playerAnswer.forEach((item, idx) => {
    if (idx < slots.length) {
      const slot = slots[idx];
      slot.textContent = item.text;
      slot.className = 'word-tile active-filled';
      if (puzzleType === 'tailo') slot.classList.add('tailo-tile');
      slot.style.border = '1px solid var(--tile-border)';
      slot.style.background = 'var(--tile-bg)';
      
      // Click slot tile to remove it
      slot.onclick = () => {
        playSound('click');
        removeSelectedTile(idx);
      };
    }
  });
}

// Remove tile from answer slot
function removeSelectedTile(index) {
  const removed = playerAnswer.splice(index, 1)[0];
  
  // Re-enable in source
  const sourceTiles = document.getElementById('source-tiles').querySelectorAll('.word-tile');
  sourceTiles.forEach(tile => {
    if (tile.dataset.index === removed.srcIndex) {
      tile.classList.remove('disabled');
    }
  });
  
  updateAnswerSlotsDisplay();
  
  // Reset Player Progress Bar
  if (gameMode === 'computer') {
    const q = filteredSentences[currentQuestionIdx];
    const targetLength = puzzleType === 'hanzi' ? getHanziTiles(q.hanzi).length : getTailoTiles(q.tailo).length;
    const progress = (playerAnswer.length / targetLength) * 100;
    document.getElementById('player-progress-bar').style.width = `${progress}%`;
  }
}

function clearCurrentAnswer() {
  playerAnswer = [];
  updateAnswerSlotsDisplay();
  
  const sourceTiles = document.getElementById('source-tiles').querySelectorAll('.word-tile');
  sourceTiles.forEach(tile => {
    tile.classList.remove('disabled');
  });
  
  if (gameMode === 'computer') {
    document.getElementById('player-progress-bar').style.width = '0%';
  }
}

function playCurrentAudio() {
  const audio = document.getElementById('global-audio');
  if (audio.src) {
    audio.play().catch(e => console.log('Audio playback prevented by browser:', e));
  }
}

// VALIDATE SINGLE / VS COMPUTER ANSWER
function verifyAnswerAndProceed() {
  clearInterval(aiInterval);
  const q = filteredSentences[currentQuestionIdx];
  const targetArray = puzzleType === 'hanzi' ? getHanziTiles(q.hanzi) : getTailoTiles(q.tailo);
  
  const isLengthCorrect = playerAnswer.length === targetArray.length;
  let isContentCorrect = true;
  
  if (isLengthCorrect) {
    for (let i = 0; i < targetArray.length; i++) {
      if (playerAnswer[i].text !== targetArray[i]) {
        isContentCorrect = false;
        break;
      }
    }
  } else {
    isContentCorrect = false;
  }
  
  // Evaluate outcome
  let won = false;
  if (isContentCorrect) {
    if (gameMode === 'computer') {
      if (!computerFinished) {
        won = true;
        correctCount++;
        score += 15; // 15 points for beating the computer
        playSound('correct');
        alert('恭喜你！成功擊敗電腦 AI！');
      } else {
        alert('拼對了！但是慢了一步，電腦 AI 搶先拼完了。');
        playSound('wrong');
      }
    } else {
      won = true;
      correctCount++;
      score += 10; // 10 points for regular practice
      playSound('correct');
    }
  } else {
    playSound('wrong');
    alert(`拼錯囉！正確答案是：\n${puzzleType === 'hanzi' ? q.hanzi : q.tailo}`);
  }
  
  // Transition to next round
  currentQuestionIdx++;
  if (currentQuestionIdx < filteredSentences.length) {
    setupQuestionRound();
  } else {
    showEndScreen();
  }
}

// SETUP DOUBLE PLAYER SPLIT-SCREEN ROUND
function setupDoubleRound() {
  if (currentQuestionIdx >= filteredSentences.length) {
    showEndScreen();
    return;
  }
  
  doubleRoundFinished = false;
  document.getElementById('round-winner-banner').textContent = '預備...... 開始！';
  document.getElementById('round-winner-banner').style.background = 'var(--warning)';
  
  const q = filteredSentences[currentQuestionIdx];
  
  // Set question strings
  document.getElementById('p1-mandarin-prompt').textContent = q.mandarin;
  document.getElementById('p2-mandarin-prompt').textContent = q.mandarin;
  
  // Configure audio trigger elements
  const audio = document.getElementById('global-audio');
  audio.src = q.audio_url;
  playCurrentAudio();
  
  // Set trigger action hooks for audio
  document.querySelectorAll('.split-play-audio-btn').forEach(btn => {
    btn.onclick = () => playCurrentAudio();
  });
  
  const targetArray = puzzleType === 'hanzi' ? getHanziTiles(q.hanzi) : getTailoTiles(q.tailo);
  
  p1Answer = [];
  p2Answer = [];
  
  // Render setup for both players
  setupSplitPlayer('p1', targetArray);
  setupSplitPlayer('p2', targetArray);
}

// SETUP SPLIT SCREEN VIEW HELPER
function setupSplitPlayer(p, targetArray) {
  const scrambled = shuffleArray(targetArray);
  
  // Render empty slots
  const slotsContainer = document.getElementById(`${p}-answer-slots`);
  slotsContainer.innerHTML = '';
  targetArray.forEach(() => {
    const slot = document.createElement('div');
    slot.className = 'word-tile empty-slot';
    slot.style.border = '2px dashed #94a3b8';
    slot.style.background = 'transparent';
    slot.style.boxShadow = 'none';
    slot.style.width = puzzleType === 'tailo' ? '70px' : '48px';
    slotsContainer.appendChild(slot);
  });
  
  // Render source tiles
  const sourceContainer = document.getElementById(`${p}-source-tiles`);
  sourceContainer.innerHTML = '';
  scrambled.forEach((text, index) => {
    const tile = document.createElement('div');
    tile.className = 'word-tile';
    if (puzzleType === 'tailo') tile.classList.add('tailo-tile');
    tile.textContent = text;
    tile.dataset.index = index;
    
    tile.addEventListener('click', () => {
      playSound('click');
      selectSplitTile(p, tile);
    });
    sourceContainer.appendChild(tile);
  });
}

// SELECT SPLIT SCREEN CARD
function selectSplitTile(p, tile) {
  if (doubleRoundFinished || tile.classList.contains('disabled')) return;
  
  tile.classList.add('disabled');
  
  const answerArr = p === 'p1' ? p1Answer : p2Answer;
  answerArr.push({
    text: tile.textContent,
    srcIndex: tile.dataset.index
  });
  
  updateSplitSlotsDisplay(p);
  
  // Auto check answer if array is complete
  const q = filteredSentences[currentQuestionIdx];
  const targetLength = puzzleType === 'hanzi' ? getHanziTiles(q.hanzi).length : getTailoTiles(q.tailo).length;
  
  if (answerArr.length === targetLength) {
    checkSplitAnswer(p);
  }
}

// Refresh split answer slots UI
function updateSplitSlotsDisplay(p) {
  const slotsContainer = document.getElementById(`${p}-answer-slots`);
  const slots = slotsContainer.querySelectorAll('.word-tile');
  const answerArr = p === 'p1' ? p1Answer : p2Answer;
  
  slots.forEach(s => {
    s.textContent = '';
    s.classList.remove('active-filled');
    s.style.border = '2px dashed #94a3b8';
    s.style.background = 'transparent';
  });
  
  answerArr.forEach((item, idx) => {
    if (idx < slots.length) {
      const slot = slots[idx];
      slot.textContent = item.text;
      slot.className = 'word-tile active-filled';
      if (puzzleType === 'tailo') slot.classList.add('tailo-tile');
      slot.style.border = '1px solid var(--tile-border)';
      slot.style.background = 'var(--tile-bg)';
    }
  });
}

function clearSplitAnswer(p) {
  if (doubleRoundFinished) return;
  
  if (p === 'p1') p1Answer = [];
  else p2Answer = [];
  
  updateSplitSlotsDisplay(p);
  
  const sourceTiles = document.getElementById(`${p}-source-tiles`).querySelectorAll('.word-tile');
  sourceTiles.forEach(tile => {
    tile.classList.remove('disabled');
  });
}

// VERIFY ROUND FOR SPLIT SCREEN
function checkSplitAnswer(p) {
  if (doubleRoundFinished) return;
  
  const q = filteredSentences[currentQuestionIdx];
  const targetArray = puzzleType === 'hanzi' ? getHanziTiles(q.hanzi) : getTailoTiles(q.tailo);
  const answerArr = p === 'p1' ? p1Answer : p2Answer;
  
  let isCorrect = true;
  for (let i = 0; i < targetArray.length; i++) {
    if (answerArr[i].text !== targetArray[i]) {
      isCorrect = false;
      break;
    }
  }
  
  if (isCorrect) {
    doubleRoundFinished = true;
    playSound('correct');
    
    // Update Score
    if (p === 'p1') {
      p1Score++;
      document.getElementById('p1-score').textContent = p1Score;
      document.getElementById('round-winner-banner').textContent = '紅方 玩家 1 獲勝！';
      document.getElementById('round-winner-banner').style.background = 'var(--p1-color)';
    } else {
      p2Score++;
      document.getElementById('p2-score').textContent = p2Score;
      document.getElementById('round-winner-banner').textContent = '藍方 玩家 2 獲勝！';
      document.getElementById('round-winner-banner').style.background = 'var(--p2-color)';
    }
    
    // Delayed transition
    setTimeout(() => {
      currentQuestionIdx++;
      setupDoubleRound();
    }, 2000);
  } else {
    // Buzz sound but let them clear and retry
    playSound('wrong');
    clearSplitAnswer(p);
  }
}

// SHOW FINAL REPORT CARD
function showEndScreen() {
  playSound('win');
  showScreen('end-screen');
  
  const modeText = gameMode === 'single' ? '單人練習' : (gameMode === 'computer' ? '挑戰電腦 AI' : '雙人對戰');
  const gradeText = ['一年級', '二年級', '三年級', '四年級', '五年級', '六年級'][grade - 1];
  
  document.getElementById('report-mode-grade').textContent = `${modeText} ─ ${gradeText}`;
  
  if (gameMode === 'double') {
    // Score calculations for multiplayer
    document.getElementById('report-title').textContent = '對戰挑戰結束！';
    document.getElementById('stat-correct').textContent = `${p1Score} vs ${p2Score}`;
    document.getElementById('stat-score').textContent = p1Score === p2Score ? '雙方平手' : (p1Score > p2Score ? '紅方勝利' : '藍方勝利');
    document.getElementById('stat-rank').textContent = '戰況激烈';
    document.getElementById('report-stars').textContent = '👥 VS 👥';
    document.getElementById('next-level-btn').style.display = 'none';
  } else {
    document.getElementById('report-title').textContent = '關卡挑戰成功！';
    document.getElementById('next-level-btn').style.display = grade < 6 ? 'block' : 'none';
    
    const correctStr = `${correctCount} / ${filteredSentences.length}`;
    document.getElementById('stat-correct').textContent = correctStr;
    document.getElementById('stat-score').textContent = `${score} 分`;
    
    // Performance Stars & Ranks
    const accuracy = correctCount / filteredSentences.length;
    let rank = '';
    let stars = '';
    
    if (accuracy >= 0.9) {
      rank = '極致完美 ★★★';
      stars = '★★★★★';
    } else if (accuracy >= 0.7) {
      rank = '優異拔尖 ★★';
      stars = '★★★★';
    } else if (accuracy >= 0.5) {
      rank = '熟練穩健 ★';
      stars = '★★★';
    } else {
      rank = '再接再厲 ✩';
      stars = '★★';
    }
    
    document.getElementById('stat-rank').textContent = rank;
    document.getElementById('report-stars').textContent = stars;
  }
}
