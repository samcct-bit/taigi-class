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
let aiSafetyTimeout = null;
let computerFinished = false;
let doubleRoundFinished = false;

// Global Custom Lesson Variables
let isCustomLesson = false;
let customLessonData = null;

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

// Map sentence object to grade (1 to 6) based on 108 Curriculum Guidelines
function getGradeForSentence(s) {
  const cleanHanzi = s.hanzi.replace(/[。！？，、：；「」()（）.,!?;:\"”' \s]/g, '');
  const len = [...cleanHanzi].length;
  const book = s.book; // "0301" or "0302"
  const cat = s.category_id;
  
  if (book === "0301") {
    // Book 1 (Grades 1, 2, 3)
    if ((cat === 1 || cat === 3 || cat === 5 || cat === 13) && len <= 7) {
      return 1; // Grade 1: Short sentences in basic topics (Interpersonal, Food, Home, Animals)
    } else if ((cat === 1 || cat === 3 || cat === 4 || cat === 5 || cat === 7 || cat === 12 || cat === 13) && len <= 9) {
      return 2; // Grade 2: Lifestyle expanded (Daily goods, Actions, directions)
    } else {
      return 3; // Grade 3: Book 1 remaining (School, community, health, weather)
    }
  } else {
    // Book 2 (Grades 4, 5, 6)
    if (len <= 8) {
      return 4; // Grade 4: Book 2 short sentences
    } else if (len <= 11) {
      return 5; // Grade 5: Book 2 medium sentences
    } else {
      return 6; // Grade 6: Book 2 long/complex sentences
    }
  }
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

// Learning Progress Played History Helpers
function getPlayedSentenceIds() {
  try {
    const stored = localStorage.getItem('taigi_played_sentence_ids');
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    return [];
  }
}

function savePlayedSentenceIds(ids) {
  try {
    localStorage.setItem('taigi_played_sentence_ids', JSON.stringify(ids));
  } catch (e) {}
}

function markSentencesAsPlayed(sentenceObjects) {
  const played = getPlayedSentenceIds();
  const playedSet = new Set(played);
  sentenceObjects.forEach(s => {
    const key = `${s.book}_${s.category_id}_${s.sentence_id}`;
    playedSet.add(key);
  });
  savePlayedSentenceIds(Array.from(playedSet));
}

function updateProgressUI() {
  const played = getPlayedSentenceIds();
  const total = 840;
  const count = Math.min(played.length, total);
  const percent = Math.round((count / total) * 100);
  
  const progressText = document.getElementById('global-learning-progress');
  if (progressText) {
    progressText.textContent = `${percent}% (${count} / ${total})`;
  }
}

// Fetch database
async function loadDatabase() {
  try {
    const response = await fetch('./data/processed/taigi_sentences.json');
    sentences = await response.json();
    console.log(`Database loaded: ${sentences.length} sentences.`);
    updateProgressUI();
  } catch (error) {
    console.error('Failed to load database:', error);
  }
}

// Setup Event Listeners
document.addEventListener('DOMContentLoaded', async () => {
  await loadDatabase();

  // Reset Progress Button Hook
  document.getElementById('reset-progress-btn').addEventListener('click', () => {
    playSound('click');
    if (confirm('確定要重置所有學習記錄與進度嗎？')) {
      localStorage.removeItem('taigi_played_sentence_ids');
      updateProgressUI();
      alert('學習記錄已重置！');
    }
  });
  
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
      
      // Clear custom lesson status when standard grade is selected
      isCustomLesson = false;
      customLessonData = null;
      document.getElementById('custom-folder-input').value = '';
      document.getElementById('custom-status-msg').textContent = '';
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
      clearAiTimers();
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

  // Load Custom Lesson Event Listener
  const loadCustomBtn = document.getElementById('load-custom-btn');
  const customFolderInput = document.getElementById('custom-folder-input');
  const customStatusMsg = document.getElementById('custom-status-msg');

  loadCustomBtn.addEventListener('click', async () => {
    playSound('click');
    const folderName = customFolderInput.value.trim();
    if (!folderName) {
      customStatusMsg.textContent = '❌ 請輸入自訂資料夾名稱！';
      customStatusMsg.className = 'custom-status-text error';
      return;
    }

    customStatusMsg.textContent = '正在載入教材中...';
    customStatusMsg.className = 'custom-status-text';

    try {
      const data = await loadCustomLesson(folderName);
      customStatusMsg.textContent = `✅ 載入成功：【${customLessonData.title}】共 ${data.dialogues?.length || 0} 句對話及 ${data.vocabulary?.length || 0} 個詞彙！`;
      customStatusMsg.className = 'custom-status-text success';
    } catch (err) {
      console.error(err);
      customStatusMsg.textContent = `❌ 載入失敗：${err.message}`;
      customStatusMsg.className = 'custom-status-text error';
      isCustomLesson = false;
      customLessonData = null;
    }
  });

  // AI One-Click Gen Event Listener
  const generateAiBtn = document.getElementById('generate-ai-btn');
  const aiPromptInput = document.getElementById('ai-prompt-input');

  generateAiBtn.addEventListener('click', async () => {
    playSound('click');
    const prompt = aiPromptInput.value.trim();
    if (!prompt) {
      customStatusMsg.textContent = '❌ 請輸入生成教材的主題或描述！';
      customStatusMsg.className = 'custom-status-text error';
      return;
    }

    customStatusMsg.textContent = '🪄 正在生成 AI 教材（此過程需要 20-30 秒，包含大綱分析與 TTS 合成，請耐心稍候...）';
    customStatusMsg.className = 'custom-status-text';
    
    // Disable buttons during generation
    generateAiBtn.disabled = true;
    generateAiBtn.style.opacity = '0.6';
    loadCustomBtn.disabled = true;

    try {
      const formData = new FormData();
      formData.append('prompt', prompt);

      // Call local backend FastAPI generator on port 8000
      const response = await fetch('http://127.0.0.1:8000/api/generate', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('伺服器生成失敗，請確認後端 server.py 與 Ollama 服務是否正常啟動。');
      }

      const result = await response.json();
      if (result.status !== 'success') {
        throw new Error(result.message || '生成失敗！');
      }

      // Load the newly generated lesson
      const data = await loadCustomLesson(result.folderName);
      
      customStatusMsg.textContent = `🎉 生成並載入成功：【${customLessonData.title}】！遊戲自動開始...`;
      customStatusMsg.className = 'custom-status-text success';
      
      // Auto fill folder name input
      customFolderInput.value = result.folderName;

      // Play fanfare and start game automatically
      setTimeout(() => {
        playSound('win');
        startChallenge();
      }, 1200);

    } catch (err) {
      console.error(err);
      customStatusMsg.textContent = `❌ 生成失敗：${err.message}`;
      customStatusMsg.className = 'custom-status-text error';
      isCustomLesson = false;
      customLessonData = null;
    } finally {
      generateAiBtn.disabled = false;
      generateAiBtn.style.opacity = '1';
      loadCustomBtn.disabled = false;
    }
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
  let selected = [];

  if (isCustomLesson && customLessonData) {
    // For custom lessons, play all loaded sentences (dialogues + vocabulary)
    selected = [...customLessonData.sentences];
  } else {
    // Filter sentences by grade
    let gradeSentences = sentences.filter(s => getGradeForSentence(s) === grade);
    
    if (gradeSentences.length === 0) {
      alert('此年級目前無可用語句！');
      return;
    }
    
    const playedIds = getPlayedSentenceIds();
    const playedSet = new Set(playedIds);
    
    // Separate into unplayed and played for this grade
    let unplayed = gradeSentences.filter(s => !playedSet.has(`${s.book}_${s.category_id}_${s.sentence_id}`));
    let played = gradeSentences.filter(s => playedSet.has(`${s.book}_${s.category_id}_${s.sentence_id}`));
    
    if (unplayed.length >= 10) {
      selected = shuffleArray(unplayed).slice(0, 10);
    } else {
      selected = [...unplayed];
      const needed = 10 - selected.length;
      const shuffledPlayed = shuffleArray(played);
      selected = selected.concat(shuffledPlayed.slice(0, needed));
      
      if (selected.length < 10) {
        selected = shuffleArray(gradeSentences).slice(0, 10);
      }
    }
    
    // Save selected sentences to played history
    markSentencesAsPlayed(selected);
    updateProgressUI();
  }
  
  filteredSentences = selected;
  
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
  const gradeText = isCustomLesson ? customLessonData.title : ['一年級', '二年級', '三年級', '四年級', '五年級', '六年級'][grade - 1];
  
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
  clearAiTimers();
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
    
    // AI completion speeds after audio ends: G1 (20s) to G6 (5s)
    const speeds = [20000, 16000, 12000, 9000, 7000, 5000];
    const totalAiTime = speeds[grade - 1];
    const stepsCount = targetArray.length;
    const intervalTime = totalAiTime / stepsCount;
    
    let currentStep = 0;
    let aiStarted = false;
    
    function startAiProgress() {
      if (aiStarted) return;
      aiStarted = true;
      if (aiSafetyTimeout) {
        clearTimeout(aiSafetyTimeout);
        aiSafetyTimeout = null;
      }
      
      aiInterval = setInterval(() => {
        currentStep++;
        computerProgress = (currentStep / stepsCount) * 100;
        document.getElementById('computer-progress-bar').style.width = `${computerProgress}%`;
        
        if (currentStep >= stepsCount) {
          clearAiTimers();
          computerFinished = true;
        }
      }, intervalTime);
    }
    
    // Start AI when audio ends
    audio.onended = () => {
      startAiProgress();
    };
    
    // Dynamic safety timeout adjustment based on audio duration
    const setSafetyTimeout = (delayMs) => {
      if (aiSafetyTimeout) clearTimeout(aiSafetyTimeout);
      aiSafetyTimeout = setTimeout(() => {
        startAiProgress();
      }, delayMs);
    };
    
    // 1. Set a safe default of 8 seconds
    setSafetyTimeout(8000);
    
    // 2. If audio metadata is already loaded, use duration + 1.5s buffer
    if (audio.duration && !isNaN(audio.duration)) {
      setSafetyTimeout(audio.duration * 1000 + 1500);
    }
    
    // 3. Listen to metadata load to dynamically update safety timeout
    audio.onloadedmetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setSafetyTimeout(audio.duration * 1000 + 1500);
      }
    };
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
  clearAiTimers();
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

async function loadCustomLesson(folderName) {
  const response = await fetch(`./data/custom/${folderName}/lesson_structure.json`);
  if (!response.ok) {
    throw new Error('找不到指定的自訂教材資料夾或檔案，請確認名稱是否正確！');
  }

  const data = await response.json();
  const parsedSentences = [];
  
  // 1. Process dialogues
  if (data.dialogues && data.dialogues.length > 0) {
    data.dialogues.forEach((d, idx) => {
      parsedSentences.push({
        book: "custom",
        category_id: 1,
        sentence_id: idx + 1,
        hanzi: d.hanji,
        tailo: d.tailo_diacritic,
        mandarin: d.zh_tw,
        audio_url: `./data/custom/${folderName}/${d.audio_file}`
      });
    });
  }

  // 2. Process vocabulary
  if (data.vocabulary && data.vocabulary.length > 0) {
    data.vocabulary.forEach((v, idx) => {
      parsedSentences.push({
        book: "custom_vocab",
        category_id: 2,
        sentence_id: idx + 1,
        hanzi: v.hanji,
        tailo: v.tailo_diacritic,
        mandarin: v.zh_tw,
        audio_url: `./data/custom/${folderName}/${v.audio_file}`
      });
    });
  }

  if (parsedSentences.length === 0) {
    throw new Error('教材內容中無可用的句型或詞彙！');
  }

  customLessonData = {
    title: data.title || '自訂台語教材',
    sentences: parsedSentences
  };
  isCustomLesson = true;

  // Unselect standard grade buttons to indicate custom mode
  document.querySelectorAll('.grade-btn').forEach(b => b.classList.remove('active'));
  
  return data;
}

function clearAiTimers() {
  if (aiInterval) {
    clearInterval(aiInterval);
    aiInterval = null;
  }
  if (aiSafetyTimeout) {
    clearTimeout(aiSafetyTimeout);
    aiSafetyTimeout = null;
  }
}

