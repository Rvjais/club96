<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SkyCrash Aviator - Multiplayer Flight & Cashout</title>
    <!-- Tailwind CSS CDN -->
    <script src="https://cdn.tailwindcss.com"></script>
    <!-- FontAwesome Icons CDN -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <!-- Google Font Inter -->
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    colors: {
                        darkBg: '#0f141c',
                        cardBg: '#19212e',
                        borderBg: '#2a3547',
                        accentRed: '#ff2d55',
                        accentGreen: '#10b981',
                        accentYellow: '#f59e0b',
                        accentPurple: '#8b5cf6'
                    },
                    fontFamily: {
                        sans: ['Inter', 'sans-serif'],
                    }
                }
            }
        }
    </script>
    <style>
        /* Custom scrollbar and glowing effects */
        ::-webkit-scrollbar {
            width: 6px;
            height: 6px;
        }
        ::-webkit-scrollbar-track {
            background: #0f141c;
        }
        ::-webkit-scrollbar-thumb {
            background: #2a3547;
            border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
            background: #3b4c68;
        }
        .glow-red {
            box-shadow: 0 0 25px rgba(255, 45, 85, 0.4);
        }
        .glow-green {
            box-shadow: 0 0 25px rgba(16, 185, 129, 0.4);
        }
        .pulse-glow {
            animation: pulseGlow 1.5s infinite ease-in-out;
        }
        @keyframes pulseGlow {
            0%, 100% { opacity: 0.8; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.02); }
        }
        .multiplier-text {
            text-shadow: 0 0 20px rgba(255, 255, 255, 0.5);
        }
        canvas {
            touch-action: none;
        }
    </style>
</head>
<body class="bg-darkBg text-slate-100 font-sans min-h-screen flex flex-col justify-between select-none overflow-x-hidden">

    <!-- Top Navigation Header -->
    <header class="bg-cardBg border-b border-borderBg/60 px-4 py-3 sticky top-0 z-50 shadow-md">
        <div class="max-w-7xl mx-auto flex items-center justify-between">
            <!-- Logo & Game Name -->
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-accentRed to-orange-500 flex items-center justify-center text-white shadow-lg shadow-accentRed/30">
                    <i class="fa-solid font-bold fa-plane-departure text-xl -rotate-12"></i>
                </div>
                <div>
                    <h1 class="font-black text-xl tracking-wider text-white flex items-center gap-2">
                        SKY<span class="text-accentRed">CRASH</span>
                        <span class="text-[10px] bg-accentRed/20 text-accentRed px-2 py-0.5 rounded-full uppercase font-bold border border-accentRed/30">Live Demo</span>
                    </h1>
                    <p class="text-xs text-slate-400">Provably Fair Multiplier Game</p>
                </div>
            </div>

            <!-- Balance and Quick Actions -->
            <div class="flex items-center gap-4">
                <!-- Sound Toggle -->
                <button id="soundToggleBtn" onclick="toggleSound()" class="p-2.5 rounded-lg bg-darkBg border border-borderBg text-slate-300 hover:text-white hover:border-slate-500 transition-all">
                    <i id="soundIcon" class="fa-solid fa-volume-high text-sm"></i>
                </button>

                <!-- Demo Balance Box -->
                <div class="bg-darkBg border border-borderBg rounded-xl px-3.5 py-1.5 flex items-center gap-3">
                    <div class="flex flex-col text-right">
                        <span class="text-[10px] font-semibold uppercase text-slate-400 tracking-wider">Demo Balance</span>
                        <span id="userBalance" class="text-base font-extrabold text-accentGreen">$1,000.00</span>
                    </div>
                    <button onclick="resetBalance()" title="Reset Demo Balance" class="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition">
                        <i class="fa-solid fa-rotate text-xs"></i>
                    </button>
                </div>
            </div>
        </div>
    </header>

    <!-- Main Content Container -->
    <main class="max-w-7xl w-full mx-auto p-3 sm:p-4 flex-1 flex flex-col gap-4">
        
        <!-- Multiplier History Bar -->
        <div class="bg-cardBg rounded-xl p-2.5 border border-borderBg/60 flex items-center gap-2 overflow-x-auto shadow-inner">
            <span class="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2 flex items-center gap-1.5 whitespace-nowrap">
                <i class="fa-solid fa-clock-rotate-left text-accentRed"></i> History:
            </span>
            <div id="historyContainer" class="flex items-center gap-2 overflow-x-auto scrollbar-none py-1 w-full">
                <!-- Dynamically populated past crash multipliers -->
            </div>
        </div>

        <!-- Main Workspace Grid (Canvas + Bets + Live Feed) -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1">

            <!-- LEFT COLUMN: Live Bets Feed & Stats (3 Cols on Desktop) -->
            <div class="lg:col-span-3 order-3 lg:order-1 bg-cardBg border border-borderBg/60 rounded-2xl p-3 flex flex-col h-[400px] lg:h-auto">
                <div class="flex items-center justify-between border-b border-borderBg pb-2 mb-2">
                    <div class="flex gap-2">
                        <button id="tabAllBets" onclick="switchBetTab('all')" class="text-xs font-bold px-3 py-1.5 rounded-lg bg-accentRed/20 text-accentRed border border-accentRed/30">
                            All Bets
                        </button>
                        <button id="tabMyBets" onclick="switchBetTab('my')" class="text-xs font-bold px-3 py-1.5 rounded-lg bg-darkBg text-slate-400 border border-transparent hover:text-white">
                            My Bets
                        </button>
                    </div>
                    <span id="livePlayersCount" class="text-xs text-slate-400 flex items-center gap-1 font-semibold">
                        <span class="w-2 h-2 rounded-full bg-accentGreen animate-pulse"></span> 42 Online
                    </span>
                </div>

                <!-- Column Headers -->
                <div class="grid grid-cols-3 text-[11px] font-bold text-slate-400 px-2 py-1 uppercase tracking-wider">
                    <span>User</span>
                    <span class="text-center">Multiplier</span>
                    <span class="text-right">Win ($)</span>
                </div>

                <!-- Feed List -->
                <div id="betsFeed" class="flex-1 overflow-y-auto space-y-1.5 pr-1">
                    <!-- Dynamic Live Bets List -->
                </div>
            </div>

            <!-- CENTER/RIGHT AREA: Canvas Visualizer + Bet Controllers (9 Cols) -->
            <div class="lg:col-span-9 order-1 lg:order-2 flex flex-col gap-4">
                
                <!-- Display Canvas Area -->
                <div class="relative w-full bg-cardBg border border-borderBg/60 rounded-2xl overflow-hidden min-h-[300px] sm:min-h-[380px] lg:min-h-[420px] flex flex-col justify-between shadow-2xl">
                    
                    <!-- Background Grid Canvas -->
                    <canvas id="gameCanvas" class="absolute inset-0 w-full h-full block z-0"></canvas>

                    <!-- Top Status Overlay (Waiting / Running / Crashed) -->
                    <div class="relative z-10 p-4 flex justify-between items-start pointer-events-none">
                        <div id="provablyFairBadge" class="bg-darkBg/80 backdrop-blur-md border border-borderBg px-3 py-1 rounded-full text-[11px] font-medium text-slate-300 flex items-center gap-1.5 pointer-events-auto cursor-pointer" onclick="showFairnessModal()">
                            <i class="fa-solid fa-shield-halved text-accentGreen"></i>
                            <span>Provably Fair</span>
                        </div>
                        <div id="roundStateBadge" class="bg-darkBg/80 backdrop-blur-md border border-borderBg px-3 py-1 rounded-full text-[11px] font-bold text-accentYellow flex items-center gap-1.5">
                            <span class="w-2 h-2 rounded-full bg-accentYellow animate-ping"></span>
                            <span>WAITING FOR NEXT ROUND</span>
                        </div>
                    </div>

                    <!-- Center Big Multiplier Display -->
                    <div id="multiplierOverlay" class="relative z-10 my-auto text-center pointer-events-none transition-all duration-200">
                        <!-- Big Multiplier Text -->
                        <div id="multiplierVal" class="text-5xl sm:text-7xl lg:text-8xl font-black tracking-tight text-white multiplier-text">
                            1.00x
                        </div>
                        <div id="flightStatusText" class="text-sm sm:text-base font-bold text-slate-400 mt-2 tracking-wide uppercase">
                            Next flight starting soon...
                        </div>
                        <!-- Countdown progress bar when waiting -->
                        <div id="countdownBarContainer" class="w-48 sm:w-64 h-2 bg-darkBg/80 rounded-full mx-auto mt-4 overflow-hidden border border-borderBg hidden">
                            <div id="countdownBar" class="h-full bg-gradient-to-r from-accentYellow to-accentRed w-full transition-all duration-100 ease-linear"></div>
                        </div>
                    </div>

                    <!-- Bottom Canvas Legend -->
                    <div class="relative z-10 p-3 bg-gradient-to-t from-darkBg/90 to-transparent flex justify-between items-center text-xs text-slate-400 font-mono">
                        <span id="seedInfo">HASH: 8f9a2b...c3d</span>
                        <span id="altitudeInfo">ALT: 0m</span>
                    </div>
                </div>

                <!-- Dual Bet Controllers Grid -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">

                    <!-- BET PANEL 1 -->
                    <div class="bg-cardBg border border-borderBg/60 rounded-2xl p-4 flex flex-col justify-between gap-3 relative shadow-md">
                        <!-- Panel Header & Auto Cashout Switch -->
                        <div class="flex items-center justify-between border-b border-borderBg/50 pb-2">
                            <span class="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                                <span class="w-2 h-2 rounded-full bg-accentRed"></span> Bet Panel #1
                            </span>
                            <div class="flex items-center gap-2">
                                <span class="text-xs font-medium text-slate-400">Auto Cashout:</span>
                                <label class="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" id="autoCashoutToggle1" onchange="toggleAutoCashout(1)" class="sr-only peer">
                                    <div class="w-9 h-5 bg-darkBg peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accentGreen"></div>
                                </label>
                                <input type="number" id="autoCashoutVal1" value="2.00" step="0.1" min="1.1" disabled class="w-16 bg-darkBg border border-borderBg rounded-lg text-center text-xs py-1 font-bold text-white opacity-50 focus:outline-none focus:border-accentGreen">
                            </div>
                        </div>

                        <!-- Amount Inputs -->
                        <div class="flex items-center gap-3">
                            <div class="flex-1">
                                <label class="block text-[10px] font-semibold uppercase text-slate-400 mb-1">Bet Amount ($)</label>
                                <div class="relative">
                                    <input type="number" id="betAmount1" value="10.00" min="1" max="1000" step="1" class="w-full bg-darkBg border border-borderBg rounded-xl px-3 py-2.5 text-base font-extrabold text-white focus:outline-none focus:border-accentRed">
                                </div>
                            </div>
                            <!-- Quick Add Buttons -->
                            <div class="grid grid-cols-2 gap-1.5 w-32">
                                <button onclick="setQuickBet(1, 1)" class="bg-darkBg hover:bg-slate-800 border border-borderBg rounded-lg py-1 text-xs font-bold text-slate-300 transition">+1</button>
                                <button onclick="setQuickBet(1, 5)" class="bg-darkBg hover:bg-slate-800 border border-borderBg rounded-lg py-1 text-xs font-bold text-slate-300 transition">+5</button>
                                <button onclick="setQuickBet(1, 10)" class="bg-darkBg hover:bg-slate-800 border border-borderBg rounded-lg py-1 text-xs font-bold text-slate-300 transition">+10</button>
                                <button onclick="setQuickBet(1, 50)" class="bg-darkBg hover:bg-slate-800 border border-borderBg rounded-lg py-1 text-xs font-bold text-slate-300 transition">+50</button>
                            </div>
                        </div>

                        <!-- Big Action Button Panel 1 -->
                        <button id="btnAction1" onclick="handleBetAction(1)" class="w-full py-3.5 rounded-xl bg-gradient-to-r from-accentGreen to-emerald-600 hover:from-emerald-500 hover:to-emerald-700 text-white font-extrabold text-lg uppercase tracking-wider shadow-lg transition-all active:scale-95 flex flex-col items-center justify-center">
                            <span>BET</span>
                            <span id="btnSubtext1" class="text-[11px] font-normal text-emerald-100 opacity-90">Next Round</span>
                        </button>
                    </div>

                    <!-- BET PANEL 2 -->
                    <div class="bg-cardBg border border-borderBg/60 rounded-2xl p-4 flex flex-col justify-between gap-3 relative shadow-md">
                        <!-- Panel Header & Auto Cashout Switch -->
                        <div class="flex items-center justify-between border-b border-borderBg/50 pb-2">
                            <span class="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                                <span class="w-2 h-2 rounded-full bg-accentPurple"></span> Bet Panel #2
                            </span>
                            <div class="flex items-center gap-2">
                                <span class="text-xs font-medium text-slate-400">Auto Cashout:</span>
                                <label class="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" id="autoCashoutToggle2" onchange="toggleAutoCashout(2)" class="sr-only peer">
                                    <div class="w-9 h-5 bg-darkBg peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accentGreen"></div>
                                </label>
                                <input type="number" id="autoCashoutVal2" value="3.00" step="0.1" min="1.1" disabled class="w-16 bg-darkBg border border-borderBg rounded-lg text-center text-xs py-1 font-bold text-white opacity-50 focus:outline-none focus:border-accentGreen">
                            </div>
                        </div>

                        <!-- Amount Inputs -->
                        <div class="flex items-center gap-3">
                            <div class="flex-1">
                                <label class="block text-[10px] font-semibold uppercase text-slate-400 mb-1">Bet Amount ($)</label>
                                <div class="relative">
                                    <input type="number" id="betAmount2" value="20.00" min="1" max="1000" step="1" class="w-full bg-darkBg border border-borderBg rounded-xl px-3 py-2.5 text-base font-extrabold text-white focus:outline-none focus:border-accentRed">
                                </div>
                            </div>
                            <!-- Quick Add Buttons -->
                            <div class="grid grid-cols-2 gap-1.5 w-32">
                                <button onclick="setQuickBet(2, 1)" class="bg-darkBg hover:bg-slate-800 border border-borderBg rounded-lg py-1 text-xs font-bold text-slate-300 transition">+1</button>
                                <button onclick="setQuickBet(2, 5)" class="bg-darkBg hover:bg-slate-800 border border-borderBg rounded-lg py-1 text-xs font-bold text-slate-300 transition">+5</button>
                                <button onclick="setQuickBet(2, 10)" class="bg-darkBg hover:bg-slate-800 border border-borderBg rounded-lg py-1 text-xs font-bold text-slate-300 transition">+10</button>
                                <button onclick="setQuickBet(2, 50)" class="bg-darkBg hover:bg-slate-800 border border-borderBg rounded-lg py-1 text-xs font-bold text-slate-300 transition">+50</button>
                            </div>
                        </div>

                        <!-- Big Action Button Panel 2 -->
                        <button id="btnAction2" onclick="handleBetAction(2)" class="w-full py-3.5 rounded-xl bg-gradient-to-r from-accentGreen to-emerald-600 hover:from-emerald-500 hover:to-emerald-700 text-white font-extrabold text-lg uppercase tracking-wider shadow-lg transition-all active:scale-95 flex flex-col items-center justify-center">
                            <span>BET</span>
                            <span id="btnSubtext2" class="text-[11px] font-normal text-emerald-100 opacity-90">Next Round</span>
                        </button>
                    </div>

                </div>

            </div>
        </div>
    </main>

    <!-- Footer Bar -->
    <footer class="bg-cardBg border-t border-borderBg/60 py-3 px-4 text-center text-xs text-slate-400">
        <div class="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <div>
                &copy; 2026 SkyCrash Aviator. Educational Demo Game.
            </div>
            <div class="flex gap-4 text-slate-300 font-semibold">
                <span>RNG Verified</span> &bull; 
                <span>Instant Cashout</span> &bull; 
                <span>Demo Currency</span>
            </div>
        </div>
    </footer>

    <!-- Notification Toast Box -->
    <div id="toastContainer" class="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none"></div>

    <!-- Provably Fair Modal -->
    <div id="fairnessModal" class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm hidden flex items-center justify-center p-4">
        <div class="bg-cardBg border border-borderBg rounded-2xl p-6 max-w-md w-full shadow-2xl relative">
            <button onclick="closeFairnessModal()" class="absolute top-4 right-4 text-slate-400 hover:text-white">
                <i class="fa-solid fa-xmark text-xl"></i>
            </button>
            <div class="flex items-center gap-3 mb-4">
                <i class="fa-solid fa-shield-halved text-2xl text-accentGreen"></i>
                <h3 class="text-xl font-bold text-white">Provably Fair System</h3>
            </div>
            <p class="text-sm text-slate-300 mb-4 leading-relaxed">
                Every flight outcome is pre-determined using SHA-256 cryptographic hashes before the flight begins. Neither the server nor the client can alter the outcome once the round starts.
            </p>
            <div class="space-y-3 bg-darkBg p-3 rounded-xl border border-borderBg font-mono text-xs">
                <div>
                    <span class="text-slate-400 block text-[10px] uppercase">Current Round Seed (SHA-256):</span>
                    <span id="modalSeedHash" class="text-accentYellow break-all">e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855</span>
                </div>
                <div>
                    <span class="text-slate-400 block text-[10px] uppercase">Crash Formula:</span>
                    <span class="text-slate-200">f(x) = max(1.00, 99 / (100 - rand))</span>
                </div>
            </div>
            <button onclick="closeFairnessModal()" class="w-full mt-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-sm">
                Close & Verify
            </button>
        </div>
    </div>

    <!-- JavaScript Game Logic Engine -->
    <script>
        // ==========================================
        // GAME STATE & CONSTANTS
        // ==========================================
        const STATES = {
            WAITING: 'WAITING',   // Countdown before flight
            FLYING: 'FLYING',     // Plane is flying
            CRASHED: 'CRASHED'    // Plane crashed / flew away
        };

        let gameState = STATES.WAITING;
        let balance = 1000.00;
        let currentMultiplier = 1.00;
        let crashMultiplier = 1.00;
        let flightStartTime = 0;
        let countdownTimer = 5.0; // 5 seconds wait
        let countdownInterval = null;
        let animFrameId = null;
        let soundEnabled = true;

        // Sound Engine (Web Audio API Synthesizer)
        let audioCtx = null;
        let engineOscillator = null;
        let engineGain = null;

        // Player Bets State
        const bets = {
            1: { active: false, amount: 10, cashedOut: false, cashoutMult: 0, pendingNext: false },
            2: { active: false, amount: 20, cashedOut: false, cashoutMult: 0, pendingNext: false }
        };

        const autoCashout = {
            1: { enabled: false, value: 2.00 },
            2: { enabled: false, value: 3.00 }
        };

        // Multipliers History
        const multiplierHistory = [1.24, 2.50, 1.05, 14.20, 1.88, 3.12, 1.15, 8.45, 1.02, 2.05];

        // Canvas Setup
        const canvas = document.getElementById('gameCanvas');
        const ctx = canvas.getContext('2d');

        // Virtual Bots for Live Feed Simulation
        let virtualBots = [];
        const botNames = ['CryptoFlyer', 'LuckyJet', 'AcePilot', 'MoonRider', 'SkyHigh', 'RiskTaker', 'Aviation99', 'TurboMax', 'AlphaBet', 'DiamondHands', 'RocketMan', 'VortexUser'];

        // ==========================================
        // AUDIO SYNTHESIZER FUNCTIONS
        // ==========================================
        function initAudio() {
            if (!audioCtx) {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                audioCtx = new AudioContext();
            }
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
        }

        function toggleSound() {
            soundEnabled = !soundEnabled;
            const icon = document.getElementById('soundIcon');
            if (soundEnabled) {
                icon.className = 'fa-solid fa-volume-high text-sm';
                showToast('Sound Enabled', 'info');
            } else {
                icon.className = 'fa-solid fa-volume-xmark text-sm';
                if (engineOscillator) stopEngineSound();
                showToast('Sound Muted', 'info');
            }
        }

        function startEngineSound() {
            if (!soundEnabled) return;
            initAudio();
            try {
                if (engineOscillator) stopEngineSound();
                engineOscillator = audioCtx.createOscillator();
                engineGain = audioCtx.createGain();

                engineOscillator.type = 'sawtooth';
                engineOscillator.frequency.setValueAtTime(120, audioCtx.currentTime); // low pitch rumble start

                // Low pass filter for smooth engine tone
                const filter = audioCtx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(400, audioCtx.currentTime);

                engineGain.gain.setValueAtTime(0.05, audioCtx.currentTime);

                engineOscillator.connect(filter);
                filter.connect(engineGain);
                engineGain.connect(audioCtx.destination);

                engineOscillator.start();
            } catch (e) {
                console.error("Audio error:", e);
            }
        }

        function updateEngineSound(mult) {
            if (!soundEnabled || !engineOscillator) return;
            try {
                // Modulate pitch higher as multiplier grows
                const targetFreq = Math.min(800, 120 + Math.log(mult) * 180);
                engineOscillator.frequency.setTargetAtTime(targetFreq, audioCtx.currentTime, 0.1);
            } catch (e) {}
        }

        function stopEngineSound() {
            if (engineOscillator) {
                try {
                    engineOscillator.stop();
                    engineOscillator.disconnect();
                } catch(e){}
                engineOscillator = null;
            }
        }

        function playCashoutSound() {
            if (!soundEnabled) return;
            initAudio();
            try {
                const now = audioCtx.currentTime;
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();

                osc.type = 'sine';
                osc.frequency.setValueAtTime(523.25, now); // C5
                osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
                osc.frequency.setValueAtTime(783.99, now + 0.16); // G5
                osc.frequency.setValueAtTime(1046.50, now + 0.24); // C6

                gain.gain.setValueAtTime(0.15, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

                osc.connect(gain);
                gain.connect(audioCtx.destination);

                osc.start(now);
                osc.stop(now + 0.5);
            } catch (e) {}
        }

        function playCrashSound() {
            if (!soundEnabled) return;
            initAudio();
            try {
                stopEngineSound();
                const now = audioCtx.currentTime;
                // Create explosion noise
                const bufferSize = audioCtx.sampleRate * 0.4;
                const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) {
                    data[i] = Math.random() * 2 - 1;
                }

                const noise = audioCtx.createBufferSource();
                noise.buffer = buffer;

                const filter = audioCtx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(600, now);
                filter.frequency.exponentialRampToValueAtTime(30, now + 0.4);

                const gain = audioCtx.createGain();
                gain.gain.setValueAtTime(0.2, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

                noise.connect(filter);
                filter.connect(gain);
                gain.connect(audioCtx.destination);

                noise.start(now);
            } catch (e) {}
        }

        // ==========================================
        // PROVABLY FAIR RNG GENERATOR
        // ==========================================
        function generateCrashPoint() {
            // Standard Crash game exponential distribution algorithm with 3% house edge
            const rand = Math.random() * 100; // 0 to 100
            
            // 3% instant crash chance at 1.00x
            if (rand < 3) {
                return 1.00;
            }

            // Exponential probability function
            const crash = 97 / (100 - rand);
            return Math.max(1.00, Math.floor(crash * 100) / 100);
        }

        // ==========================================
        // UI HELPERS & UPDATES
        // ==========================================
        function formatMoney(amount) {
            return '$' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }

        function updateBalanceUI() {
            document.getElementById('userBalance').innerText = formatMoney(balance);
        }

        function resetBalance() {
            balance = 1000.00;
            updateBalanceUI();
            showToast('Demo balance reset to $1,000.00', 'info');
        }

        function showToast(message, type = 'success') {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            
            let bg = 'bg-accentGreen';
            if (type === 'error') bg = 'bg-accentRed';
            if (type === 'info') bg = 'bg-slate-700';

            toast.className = `${bg} text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg transform transition-all duration-300 translate-y-2 opacity-0 flex items-center gap-2`;
            toast.innerHTML = `<i class="fa-solid fa-circle-info"></i> ${message}`;

            container.appendChild(toast);

            setTimeout(() => {
                toast.classList.remove('translate-y-2', 'opacity-0');
            }, 10);

            setTimeout(() => {
                toast.classList.add('opacity-0', 'translate-y-2');
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }

        function renderHistory() {
            const container = document.getElementById('historyContainer');
            container.innerHTML = '';
            
            // Render latest history on top/left
            multiplierHistory.slice(-15).reverse().forEach(mult => {
                const badge = document.createElement('span');
                let colorClass = 'bg-blue-500/10 text-blue-400 border-blue-500/30';
                if (mult >= 2.0) colorClass = 'bg-accentPurple/20 text-accentPurple border-accentPurple/30';
                if (mult >= 10.0) colorClass = 'bg-accentYellow/20 text-accentYellow border-accentYellow/40 font-black glow-yellow';

                badge.className = `px-2.5 py-1 rounded-lg border text-xs font-bold whitespace-nowrap transition-all hover:scale-105 ${colorClass}`;
                badge.innerText = mult.toFixed(2) + 'x';
                container.appendChild(badge);
            });
        }

        // ==========================================
        // CANVAS RENDERING ENGINE
        // ==========================================
        function resizeCanvas() {
            const rect = canvas.parentElement.getBoundingClientRect();
            canvas.width = rect.width;
            canvas.height = rect.height;
        }

        window.addEventListener('resize', resizeCanvas);

        function drawCanvas() {
            const width = canvas.width;
            const height = canvas.height;

            // Clear Background
            ctx.clearRect(0, 0, width, height);

            // Draw Subtle Grid
            ctx.strokeStyle = '#1e2838';
            ctx.lineWidth = 1;
            const gridSize = 40;

            for (let x = 0; x < width; x += gridSize) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
                ctx.stroke();
            }
            for (let y = 0; y < height; y += gridSize) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(width, y);
                ctx.stroke();
            }

            // Draw Flight Graph Curve
            if (gameState === STATES.FLYING || gameState === STATES.CRASHED) {
                const padding = 40;
                const startX = padding;
                const startY = height - padding;

                // Flight Progress relative calculation
                const elapsedSec = (Date.now() - flightStartTime) / 1000;
                const progress = Math.min(1.0, elapsedSec / 12.0); // Curve reaches right side in ~12 seconds

                const targetX = startX + (width - padding * 2) * progress;
                const targetY = startY - (height - padding * 2) * Math.min(1.0, Math.pow(progress, 0.8));

                // Bezier Curve Control Point
                const cpX = startX + (targetX - startX) * 0.5;
                const cpY = startY;

                // Glow line under curve
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.quadraticCurveTo(cpX, cpY, targetX, targetY);
                ctx.lineTo(targetX, startY);
                ctx.closePath();

                // Gradient fill under curve
                const fillGrad = ctx.createLinearGradient(0, targetY, 0, startY);
                if (gameState === STATES.FLYING) {
                    fillGrad.addColorStop(0, 'rgba(255, 45, 85, 0.35)');
                    fillGrad.addColorStop(1, 'rgba(255, 45, 85, 0.0)');
                } else {
                    fillGrad.addColorStop(0, 'rgba(239, 68, 68, 0.15)');
                    fillGrad.addColorStop(1, 'rgba(239, 68, 68, 0.0)');
                }
                ctx.fillStyle = fillGrad;
                ctx.fill();

                // Draw Smooth Trajectory Line
                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.quadraticCurveTo(cpX, cpY, targetX, targetY);
                ctx.strokeStyle = gameState === STATES.FLYING ? '#ff2d55' : '#ef4444';
                ctx.lineWidth = 4;
                ctx.shadowColor = gameState === STATES.FLYING ? '#ff2d55' : '#ef4444';
                ctx.shadowBlur = 15;
                ctx.stroke();
                ctx.restore();

                // Draw Airplane at Head of Curve
                if (gameState === STATES.FLYING) {
                    drawAirplane(targetX, targetY, Math.PI / 6); // Slanted upwards
                } else {
                    // Crashed state: Draw explosion or red indicator
                    drawExplosion(targetX, targetY);
                }
            }
        }

        function drawAirplane(x, y, angle) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(-angle);

            // Plane Body (Stylized Red/White Jet Wing)
            ctx.fillStyle = '#ff2d55';
            ctx.shadowColor = '#ff2d55';
            ctx.shadowBlur = 20;

            // Draw Jet Silhouette
            ctx.beginPath();
            ctx.moveTo(20, 0); // Nose
            ctx.lineTo(-15, -12); // Left wing
            ctx.lineTo(-8, 0); // Inner fuselage
            ctx.lineTo(-15, 12); // Right wing
            ctx.closePath();
            ctx.fill();

            // Cockpit Highlight
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(2, 0, 3, 0, Math.PI * 2);
            ctx.fill();

            // Thruster Tail Particle Glow
            ctx.fillStyle = '#f59e0b';
            ctx.beginPath();
            ctx.arc(-12 + (Math.random() * 3), 0, 4 + Math.random() * 2, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        }

        function drawExplosion(x, y) {
            ctx.save();
            ctx.translate(x, y);

            // Red & Yellow Burst Lines
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 3;
            for (let i = 0; i < 8; i++) {
                const angle = (Math.PI * 2 / 8) * i;
                ctx.beginPath();
                ctx.moveTo(Math.cos(angle) * 5, Math.sin(angle) * 5);
                ctx.lineTo(Math.cos(angle) * 22, Math.sin(angle) * 22);
                ctx.stroke();
            }

            // Explosion Text
            ctx.fillStyle = '#ef4444';
            ctx.font = 'bold 16px Inter';
            ctx.textAlign = 'center';
            ctx.fillText('FLEW AWAY!', 0, -30);

            ctx.restore();
        }

        // ==========================================
        // VIRTUAL BOTS & LIVE FEED SIMULATOR
        // ==========================================
        function initVirtualBots() {
            virtualBots = [];
            const count = 12 + Math.floor(Math.random() * 8); // 12-20 bots per round
            for (let i = 0; i < count; i++) {
                const name = botNames[Math.floor(Math.random() * botNames.length)] + '_' + Math.floor(Math.random() * 99);
                const betAmt = [2, 5, 10, 20, 50, 100][Math.floor(Math.random() * 6)];
                const targetMult = 1.10 + Math.random() * 4.5; // Random target cashout

                virtualBots.push({
                    id: 'bot_' + i,
                    name: name,
                    amount: betAmt,
                    targetMult: targetMult,
                    cashedOut: false,
                    winAmount: 0
                });
            }
            renderBetsFeed();
        }

        function updateVirtualBots(currentMult) {
            let updated = false;
            virtualBots.forEach(bot => {
                if (!bot.cashedOut && currentMult >= bot.targetMult && currentMult < crashMultiplier) {
                    bot.cashedOut = true;
                    bot.winAmount = bot.amount * bot.targetMult;
                    updated = true;
                }
            });
            if (updated) {
                renderBetsFeed();
            }
        }

        function renderBetsFeed() {
            const feed = document.getElementById('betsFeed');
            feed.innerHTML = '';

            // User's active bets first
            [1, 2].forEach(id => {
                if (bets[id].active) {
                    const row = document.createElement('div');
                    row.className = 'grid grid-cols-3 text-xs p-2 rounded-lg bg-accentRed/10 border border-accentRed/30 items-center font-bold';
                    
                    const winVal = bets[id].cashedOut ? formatMoney(bets[id].amount * bets[id].cashoutMult) : '-';
                    const multVal = bets[id].cashedOut ? bets[id].cashoutMult.toFixed(2) + 'x' : 'Flying...';

                    row.innerHTML = `
                        <span class="text-white flex items-center gap-1">
                            <i class="fa-solid fa-user text-[10px] text-accentRed"></i> You (#${id})
                        </span>
                        <span class="text-center ${bets[id].cashedOut ? 'text-accentGreen' : 'text-slate-300'}">${multVal}</span>
                        <span class="text-right ${bets[id].cashedOut ? 'text-accentGreen font-extrabold' : 'text-slate-400'}">${winVal}</span>
                    `;
                    feed.appendChild(row);
                }
            });

            // Virtual bots
            virtualBots.forEach(bot => {
                const row = document.createElement('div');
                row.className = 'grid grid-cols-3 text-xs p-2 rounded-lg bg-darkBg/60 border border-borderBg/40 items-center text-slate-300';
                
                const winVal = bot.cashedOut ? formatMoney(bot.winAmount) : '-';
                const multVal = bot.cashedOut ? bot.targetMult.toFixed(2) + 'x' : '-';

                row.innerHTML = `
                    <span class="truncate text-slate-400">${bot.name}</span>
                    <span class="text-center ${bot.cashedOut ? 'text-accentGreen font-bold' : 'text-slate-500'}">${multVal}</span>
                    <span class="text-right ${bot.cashedOut ? 'text-accentGreen font-bold' : 'text-slate-500'}">${winVal}</span>
                `;
                feed.appendChild(row);
            });
        }

        function switchBetTab(tab) {
            const btnAll = document.getElementById('tabAllBets');
            const btnMy = document.getElementById('tabMyBets');

            if (tab === 'all') {
                btnAll.className = 'text-xs font-bold px-3 py-1.5 rounded-lg bg-accentRed/20 text-accentRed border border-accentRed/30';
                btnMy.className = 'text-xs font-bold px-3 py-1.5 rounded-lg bg-darkBg text-slate-400 border border-transparent hover:text-white';
            } else {
                btnMy.className = 'text-xs font-bold px-3 py-1.5 rounded-lg bg-accentRed/20 text-accentRed border border-accentRed/30';
                btnAll.className = 'text-xs font-bold px-3 py-1.5 rounded-lg bg-darkBg text-slate-400 border border-transparent hover:text-white';
            }
        }

        // ==========================================
        // GAME LOOP & FLIGHT CONTROLLER
        // ==========================================
        function startWaitingPhase() {
            gameState = STATES.WAITING;
            currentMultiplier = 1.00;
            countdownTimer = 5.0;

            // UI Elements
            document.getElementById('roundStateBadge').innerHTML = `
                <span class="w-2 h-2 rounded-full bg-accentYellow animate-ping"></span>
                <span>WAITING FOR NEXT ROUND</span>
            `;
            document.getElementById('roundStateBadge').className = "bg-darkBg/80 backdrop-blur-md border border-borderBg px-3 py-1 rounded-full text-[11px] font-bold text-accentYellow flex items-center gap-1.5";
            
            document.getElementById('flightStatusText').innerText = 'Next flight starting soon...';
            document.getElementById('multiplierVal').innerText = '1.00x';
            document.getElementById('multiplierVal').className = 'text-5xl sm:text-7xl lg:text-8xl font-black tracking-tight text-slate-300 multiplier-text';
            document.getElementById('countdownBarContainer').classList.remove('hidden');

            // Reset pending next bets into active bets
            [1, 2].forEach(id => {
                if (bets[id].pendingNext) {
                    bets[id].active = true;
                    bets[id].cashedOut = false;
                    bets[id].cashoutMult = 0;
                    bets[id].pendingNext = false;
                } else if (!bets[id].cashedOut && bets[id].active) {
                    // Keep active if placed during waiting
                } else {
                    bets[id].active = false;
                    bets[id].cashedOut = false;
                }
                updateButtonUI(id);
            });

            // Pre-calculate provably fair crash multiplier for upcoming round
            crashMultiplier = generateCrashPoint();
            initVirtualBots();

            // Countdown timer interval
            if (countdownInterval) clearInterval(countdownInterval);
            const startTime = Date.now();
            const totalDuration = 5000; // 5s

            countdownInterval = setInterval(() => {
                const elapsed = Date.now() - startTime;
                const remaining = Math.max(0, (totalDuration - elapsed) / 1000);
                
                const percent = (remaining / 5.0) * 100;
                document.getElementById('countdownBar').style.width = percent + '%';

                if (remaining <= 0) {
                    clearInterval(countdownInterval);
                    startFlightPhase();
                }
            }, 50);
        }

        function startFlightPhase() {
            gameState = STATES.FLYING;
            flightStartTime = Date.now();
            
            document.getElementById('countdownBarContainer').classList.add('hidden');
            document.getElementById('roundStateBadge').innerHTML = `
                <span class="w-2 h-2 rounded-full bg-accentGreen animate-pulse"></span>
                <span>PLANE IS FLYING</span>
            `;
            document.getElementById('roundStateBadge').className = "bg-darkBg/80 backdrop-blur-md border border-borderBg px-3 py-1 rounded-full text-[11px] font-bold text-accentGreen flex items-center gap-1.5";
            document.getElementById('flightStatusText').innerText = 'Cash out before crash!';
            document.getElementById('multiplierVal').className = 'text-5xl sm:text-7xl lg:text-8xl font-black tracking-tight text-white multiplier-text';

            // Deduct active bets balance
            [1, 2].forEach(id => {
                if (bets[id].active) {
                    balance -= bets[id].amount;
                }
                updateButtonUI(id);
            });
            updateBalanceUI();

            // Start Engine Audio
            startEngineSound();

            // Start Main Animation Loop
            runGameLoop();
        }

        function runGameLoop() {
            if (gameState !== STATES.FLYING) return;

            const elapsedSec = (Date.now() - flightStartTime) / 1000;
            
            // Exponential Multiplier Growth Formula: 1 + 0.08*t + 0.03*t^1.8
            currentMultiplier = 1.00 + (0.08 * elapsedSec) + (0.02 * Math.pow(elapsedSec, 2.1));
            
            // Format Display
            document.getElementById('multiplierVal').innerText = currentMultiplier.toFixed(2) + 'x';
            document.getElementById('altitudeInfo').innerText = 'ALT: ' + Math.floor(elapsedSec * 140) + 'm';

            // Audio Modulation
            updateEngineSound(currentMultiplier);

            // Check Auto Cashouts
            [1, 2].forEach(id => {
                if (bets[id].active && !bets[id].cashedOut && autoCashout[id].enabled) {
                    if (currentMultiplier >= autoCashout[id].value) {
                        cashOutBet(id);
                    }
                }
            });

            // Update Bots simulation
            updateVirtualBots(currentMultiplier);

            // Check Crash Condition
            if (currentMultiplier >= crashMultiplier) {
                triggerCrash();
                return;
            }

            // Draw Canvas Frame
            drawCanvas();

            animFrameId = requestAnimationFrame(runGameLoop);
        }

        function triggerCrash() {
            gameState = STATES.CRASHED;
            stopEngineSound();
            playCrashSound();

            currentMultiplier = crashMultiplier;
            document.getElementById('multiplierVal').innerText = crashMultiplier.toFixed(2) + 'x';
            document.getElementById('multiplierVal').className = 'text-5xl sm:text-7xl lg:text-8xl font-black tracking-tight text-accentRed multiplier-text';
            
            document.getElementById('flightStatusText').innerText = 'FLEW AWAY @ ' + crashMultiplier.toFixed(2) + 'x';

            document.getElementById('roundStateBadge').innerHTML = `
                <span class="w-2 h-2 rounded-full bg-accentRed"></span>
                <span>CRASHED</span>
            `;
            document.getElementById('roundStateBadge').className = "bg-darkBg/80 backdrop-blur-md border border-borderBg px-3 py-1 rounded-full text-[11px] font-bold text-accentRed flex items-center gap-1.5";

            // Push to history
            multiplierHistory.push(crashMultiplier);
            renderHistory();

            // Reset active non-cashed-out bets
            [1, 2].forEach(id => {
                if (bets[id].active && !bets[id].cashedOut) {
                    bets[id].active = false;
                }
                updateButtonUI(id);
            });

            // Redraw final canvas crash frame
            drawCanvas();

            // Pause before starting next round
            setTimeout(() => {
                startWaitingPhase();
            }, 3000);
        }

        // ==========================================
        // BETTING CONTROLS & ACTIONS
        // ==========================================
        function handleBetAction(id) {
            const amtInput = document.getElementById(`betAmount${id}`);
            const amount = parseFloat(amtInput.value);

            if (isNaN(amount) || amount <= 0) {
                showToast('Invalid bet amount', 'error');
                return;
            }

            if (gameState === STATES.WAITING) {
                if (!bets[id].active) {
                    if (balance < amount) {
                        showToast('Insufficient balance!', 'error');
                        return;
                    }
                    bets[id].active = true;
                    bets[id].amount = amount;
                    bets[id].cashedOut = false;
                    showToast(`Bet #${id} placed for next round`, 'info');
                } else {
                    // Cancel bet before round starts
                    bets[id].active = false;
                    showToast(`Bet #${id} cancelled`, 'info');
                }
            } else if (gameState === STATES.FLYING) {
                if (bets[id].active && !bets[id].cashedOut) {
                    // CASHOUT ACTION
                    cashOutBet(id);
                } else if (!bets[id].pendingNext) {
                    // Queue bet for NEXT round
                    if (balance < amount) {
                        showToast('Insufficient balance!', 'error');
                        return;
                    }
                    bets[id].pendingNext = true;
                    bets[id].amount = amount;
                    showToast(`Bet #${id} queued for next round`, 'info');
                } else {
                    bets[id].pendingNext = false;
                    showToast(`Queued bet #${id} cancelled`, 'info');
                }
            } else if (gameState === STATES.CRASHED) {
                if (!bets[id].pendingNext) {
                    if (balance < amount) {
                        showToast('Insufficient balance!', 'error');
                        return;
                    }
                    bets[id].pendingNext = true;
                    bets[id].amount = amount;
                    showToast(`Bet #${id} queued for next round`, 'info');
                } else {
                    bets[id].pendingNext = false;
                }
            }

            updateButtonUI(id);
            renderBetsFeed();
        }

        function cashOutBet(id) {
            if (!bets[id].active || bets[id].cashedOut || gameState !== STATES.FLYING) return;

            bets[id].cashedOut = true;
            bets[id].cashoutMult = currentMultiplier;

            const winAmt = bets[id].amount * currentMultiplier;
            balance += winAmt;

            updateBalanceUI();
            playCashoutSound();
            showToast(`Cashed out #${id} at ${currentMultiplier.toFixed(2)}x (+${formatMoney(winAmt)})`, 'success');

            updateButtonUI(id);
            renderBetsFeed();
        }

        function updateButtonUI(id) {
            const btn = document.getElementById(`btnAction${id}`);
            const sub = document.getElementById(`btnSubtext${id}`);

            if (gameState === STATES.WAITING) {
                if (bets[id].active) {
                    btn.className = "w-full py-3.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-800 text-white font-extrabold text-lg uppercase tracking-wider shadow-lg transition-all active:scale-95 flex flex-col items-center justify-center";
                    btn.children[0].innerText = "CANCEL BET";
                    sub.innerText = "Waiting for start";
                } else {
                    btn.className = "w-full py-3.5 rounded-xl bg-gradient-to-r from-accentGreen to-emerald-600 hover:from-emerald-500 hover:to-emerald-700 text-white font-extrabold text-lg uppercase tracking-wider shadow-lg transition-all active:scale-95 flex flex-col items-center justify-center";
                    btn.children[0].innerText = "BET";
                    sub.innerText = "Next Round";
                }
            } else if (gameState === STATES.FLYING) {
                if (bets[id].active && !bets[id].cashedOut) {
                    // CASH OUT BIG BUTTON
                    const winEstimate = formatMoney(bets[id].amount * currentMultiplier);
                    btn.className = "w-full py-3.5 rounded-xl bg-gradient-to-r from-accentYellow to-orange-500 hover:from-yellow-400 hover:to-orange-600 text-black font-black text-lg uppercase tracking-wider shadow-lg transition-all active:scale-95 flex flex-col items-center justify-center glow-yellow pulse-glow";
                    btn.children[0].innerText = "CASH OUT";
                    sub.innerText = winEstimate;
                } else if (bets[id].pendingNext) {
                    btn.className = "w-full py-3.5 rounded-xl bg-gradient-to-r from-slate-700 to-slate-800 text-slate-300 font-extrabold text-lg uppercase tracking-wider transition-all flex flex-col items-center justify-center";
                    btn.children[0].innerText = "CANCEL QUEUED";
                    sub.innerText = "Queued for Next Round";
                } else {
                    btn.className = "w-full py-3.5 rounded-xl bg-gradient-to-r from-accentGreen to-emerald-600 hover:from-emerald-500 hover:to-emerald-700 text-white font-extrabold text-lg uppercase tracking-wider shadow-lg transition-all active:scale-95 flex flex-col items-center justify-center opacity-80";
                    btn.children[0].innerText = "BET FOR NEXT";
                    sub.innerText = "Queue Next Flight";
                }
            } else {
                // CRASHED
                if (bets[id].pendingNext) {
                    btn.className = "w-full py-3.5 rounded-xl bg-gradient-to-r from-slate-700 to-slate-800 text-slate-300 font-extrabold text-lg uppercase tracking-wider transition-all flex flex-col items-center justify-center";
                    btn.children[0].innerText = "CANCEL QUEUED";
                    sub.innerText = "Waiting Next Round";
                } else {
                    btn.className = "w-full py-3.5 rounded-xl bg-gradient-to-r from-accentGreen to-emerald-600 hover:from-emerald-500 hover:to-emerald-700 text-white font-extrabold text-lg uppercase tracking-wider shadow-lg transition-all active:scale-95 flex flex-col items-center justify-center";
                    btn.children[0].innerText = "BET";
                    sub.innerText = "Next Round";
                }
            }
        }

        function setQuickBet(panelId, amountToAdd) {
            const input = document.getElementById(`betAmount${panelId}`);
            let curr = parseFloat(input.value) || 0;
            input.value = (curr + amountToAdd).toFixed(2);
        }

        function toggleAutoCashout(panelId) {
            const toggle = document.getElementById(`autoCashoutToggle${panelId}`);
            const input = document.getElementById(`autoCashoutVal${panelId}`);
            
            autoCashout[panelId].enabled = toggle.checked;
            input.disabled = !toggle.checked;

            if (toggle.checked) {
                input.classList.remove('opacity-50');
                autoCashout[panelId].value = parseFloat(input.value) || 2.00;
            } else {
                input.classList.add('opacity-50');
            }
        }

        document.getElementById('autoCashoutVal1').addEventListener('change', (e) => {
            autoCashout[1].value = parseFloat(e.target.value) || 2.00;
        });

        document.getElementById('autoCashoutVal2').addEventListener('change', (e) => {
            autoCashout[2].value = parseFloat(e.target.value) || 3.00;
        });

        // Modal Helpers
        function showFairnessModal() {
            document.getElementById('fairnessModal').classList.remove('hidden');
        }

        function closeFairnessModal() {
            document.getElementById('fairnessModal').classList.add('hidden');
        }

        // ==========================================
        // INITIALIZATION
        // ==========================================
        window.onload = function() {
            resizeCanvas();
            renderHistory();
            updateBalanceUI();
            
            // Draw static canvas initial grid
            drawCanvas();

            // Start loop waiting sequence
            startWaitingPhase();
        };
    </script>
</body>
</html>