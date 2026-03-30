"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw, Trash2, Zap, Clock } from 'lucide-react';

// --- Web Audio API Helper ---
const playSound = (type: 'tick' | 'setEnd' | 'finish' | 'fanfare' | 'bell' | 'startSignal') => {
  const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContext) return;
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  const now = ctx.currentTime;

  switch (type) {
    case 'tick':
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
      break;
    case 'startSignal':
    case 'setEnd':
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1320, now);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
      break;
    case 'finish':
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.5);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.5);
      break;
    case 'fanfare':
      [440, 554.37, 659.25, 880].forEach((freq, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(freq, now + i * 0.1);
        g.connect(ctx.destination);
        o.connect(g);
        g.gain.setValueAtTime(0.1, now + i * 0.1);
        g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.1 + 0.5);
        o.start(now + i * 0.1);
        o.stop(now + i * 0.1 + 0.5);
      });
      break;
    case 'bell':
      osc.type = 'sine';
      osc.frequency.setValueAtTime(110, now);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 4);
      osc.start(now);
      osc.stop(now + 4);
      break;
  }
};

interface HistoryLog {
  id: string;
  date: string;
  sets: number;
}

export default function SunSalApp() {
  const [targetSets, setTargetSets] = useState(10);
  const [currentSet, setCurrentSet] = useState(1);
  const [currentCount, setCurrentCount] = useState(0);
  const [tempo, setTempo] = useState(2.5);
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(true);
  const [isCountingDown, setIsCountingDown] = useState(false);
  const [countdownNum, setCountdownNum] = useState(3);
  const [isAccelerating, setIsAccelerating] = useState(false);
  const [logs, setLogs] = useState<HistoryLog[]>([]);
  const [unlocked, setUnlocked] = useState({ hundred: false, oneHundredEight: false });

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const wakeLockRef = useRef<any>(null);

  useEffect(() => {
    const saved = localStorage.getItem('sunsal_v2_data');
    if (saved) {
      const parsed = JSON.parse(saved);
      setLogs(parsed.logs || []);
      setUnlocked(parsed.unlocked || { hundred: false, oneHundredEight: false });
    }
  }, []);

  const requestWakeLock = async () => {
    try { if ('wakeLock' in navigator) wakeLockRef.current = await (navigator as any).wakeLock.request('screen'); } catch (err) { console.error(err); }
  };
  const releaseWakeLock = () => { if (wakeLockRef.current) { wakeLockRef.current.release(); wakeLockRef.current = null; } };

  const startPractice = () => {
    setIsCountingDown(true);
    setCountdownNum(3);
    requestWakeLock();
  };

  useEffect(() => {
    if (isCountingDown) {
      if (countdownNum > 0) {
        playSound('tick');
        const t = setTimeout(() => setCountdownNum(countdownNum - 1), 1000);
        return () => clearTimeout(t);
      } else {
        playSound('startSignal');
        setIsCountingDown(false);
        setIsActive(true);
        setIsPaused(false);
        setCurrentSet(1);
        setCurrentCount(1);
      }
    }
  }, [isCountingDown, countdownNum]);

  const completePractice = useCallback(() => {
    setIsActive(false);
    setIsPaused(true);
    releaseWakeLock();
    if (targetSets === 108) playSound('bell');
    else if (targetSets === 100) playSound('fanfare');
    else playSound('finish');

    const now = new Date();
    const newLog: HistoryLog = {
      id: now.getTime().toString(),
      date: `${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`,
      sets: targetSets,
    };
    
    const newLogs = [newLog, ...logs];
    const newUnlocked = {
      hundred: unlocked.hundred || targetSets >= 100,
      oneHundredEight: unlocked.oneHundredEight || targetSets >= 108
    };

    setLogs(newLogs);
    setUnlocked(newUnlocked);
    localStorage.setItem('sunsal_v2_data', JSON.stringify({ logs: newLogs, unlocked: newUnlocked }));
  }, [targetSets, logs, unlocked]);

  useEffect(() => {
    if (isActive && !isPaused) {
      // --- 加速ロジック: 1.0sを目指すが、0.7sは絶対に割らない ---
      const targetEnd = tempo > 1.0 ? 1.0 : 0.7;
      const calculatedTempo = tempo - (currentSet / targetSets) * (tempo - targetEnd);
      const currentTempo = isAccelerating ? Math.max(0.7, calculatedTempo) : tempo;

      timerRef.current = setTimeout(() => {
        if (currentCount < 12) {
          const nextCount = currentCount + 1;
          setCurrentCount(nextCount);
          playSound(nextCount === 12 ? 'setEnd' : 'tick');
        } else {
          if (currentSet < targetSets) {
            setCurrentSet(currentSet + 1);
            setCurrentCount(1);
            playSound('tick');
          } else {
            completePractice();
          }
        }
      }, currentTempo * 1000);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isActive, isPaused, currentCount, currentSet, tempo, isAccelerating, targetSets, completePractice]);

  const resetAllData = () => {
    if (confirm('すべての実施履歴をリセットしますか？')) {
      setLogs([]);
      localStorage.setItem('sunsal_v2_data', JSON.stringify({ logs: [], unlocked }));
    }
  };

  const totalReps = logs.reduce((acc, log) => acc + log.sets, 0);
  const activeDays = new Set(logs.map(log => log.date.split(' ')[0])).size;

  const setOptions = [10, 20, 30, 40, 50, 70, 100, 108];
  if (unlocked.hundred) setOptions.push(200);
  if (unlocked.oneHundredEight) setOptions.push(216);

  const progress = (currentSet - 1) / targetSets * 360 + (currentCount / 12 / targetSets * 360);

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans p-6 flex flex-col items-center">
      <header className="w-full max-w-md flex justify-between items-baseline mb-8">
        <div className="flex items-baseline gap-1">
          <h1 className="text-3xl font-black tracking-tighter leading-none flex items-baseline gap-2">
            SunSal
            <span className="text-2xl font-black leading-none text-slate-900">サンサル</span>
          </h1>
          {/* 開発者用バージョン表記 */}
          <span className="text-[10px] font-mono text-slate-400 ml-2">v1.0.0</span>
        </div>
        <div className="flex gap-4">
           <button 
             onClick={() => setIsAccelerating(!isAccelerating)} 
             className={`transition-all active:scale-90 ${isAccelerating ? 'animate-pulse' : ''}`}
           >
             <Zap size={26} className={`${isAccelerating ? 'text-pink-500 fill-pink-500' : 'text-purple-400'} transition-colors`} />
           </button>
        </div>
      </header>

      {!isActive && !isCountingDown ? (
        <div className="w-full max-w-md space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10">
          <section className="bg-slate-50 p-6 rounded-3xl border border-slate-100 shadow-sm">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-900 mb-4">Select Rounds</h2>
            <div className="grid grid-cols-4 gap-2">
              {setOptions.map(num => (
                <button
                  key={num}
                  onClick={() => setTargetSets(num)}
                  className={`py-3 rounded-xl font-black transition-all ${targetSets === num ? 'bg-slate-900 text-white scale-105' : 'bg-white text-slate-900 border border-slate-200 hover:bg-slate-100'}`}
                >
                  {num}
                </button>
              ))}
            </div>
          </section>

          <section className="bg-slate-50 p-6 rounded-3xl border border-slate-100 shadow-sm">
            <div className="flex justify-between mb-4">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-900">Tempo: {tempo}s</h2>
              <div className="flex items-center gap-2 text-[10px] font-black text-slate-900">
                {isAccelerating && <span className="text-pink-500">ACCELERATE ON</span>}
              </div>
            </div>
            <input 
              type="range" min="1.0" max="4.0" step="0.1" value={tempo} 
              onChange={(e) => setTempo(parseFloat(e.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-pink-500"
            />
          </section>

          <button 
            onClick={startPractice}
            className="w-full bg-slate-900 text-white py-6 rounded-[2rem] text-2xl font-black flex justify-center items-center gap-3 hover:bg-slate-800 transition-all active:scale-95 shadow-xl"
          >
            <Play fill="white" size={28} /> START
          </button>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-lime-400 p-5 rounded-3xl text-slate-900 shadow-sm">
              <p className="text-[10px] font-black uppercase opacity-60">Total Reps</p>
              <p className="text-4xl font-black">{totalReps}</p>
            </div>
            <div className="bg-cyan-400 p-5 rounded-3xl text-slate-900 shadow-sm">
              <p className="text-[10px] font-black uppercase opacity-60">Active Days</p>
              <p className="text-4xl font-black">{activeDays}</p>
            </div>
          </div>

          <section className="bg-slate-50 rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-white/50">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-900 flex items-center gap-2">
                <Clock size={14} /> History Log
              </h2>
              <button onClick={resetAllData} className="text-slate-400 hover:text-red-500 transition-colors">
                <Trash2 size={16} />
              </button>
            </div>
            <div className="max-h-[180px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300">
              {logs.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {logs.map((log) => (
                    <div key={log.id} className="p-4 flex justify-between items-center bg-white/30">
                      <span className="text-sm font-bold text-slate-500">{log.date}</span>
                      <span className="text-lg font-black text-slate-900">{log.sets} <span className="text-[10px] opacity-40">SETS</span></span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-10 text-center text-slate-300 text-xs font-bold uppercase tracking-widest italic">
                  No records yet
                </div>
              )}
            </div>
          </section>
        </div>
      ) : isCountingDown ? (
        <div className="flex-1 flex flex-col items-center justify-center">
           <p className="text-2xl font-black text-slate-900 mb-4 italic tracking-tighter">READY...</p>
           <p className="text-[12rem] font-black leading-none text-slate-900">{countdownNum > 0 ? countdownNum : 'GO!'}</p>
        </div>
      ) : (
        <div className="w-full max-w-md flex flex-col items-center space-y-10 py-4">
          <div className="relative w-72 h-72 flex items-center justify-center">
            <svg className="absolute inset-0 w-full h-full -rotate-90">
              <circle cx="144" cy="144" r="130" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-slate-100" />
              <circle 
                cx="144" cy="144" r="130" stroke="currentColor" strokeWidth="10" fill="transparent" 
                strokeDasharray={816} strokeDashoffset={816 - (816 * progress / 360)}
                strokeLinecap="round" className="text-slate-900 transition-all duration-300" 
              />
            </svg>
            <div className="text-center z-10">
              <span className="text-8xl font-black block leading-none text-slate-900">{currentSet}</span>
              <span className="text-sm font-black text-slate-900 uppercase tracking-widest mt-2 block">/ {targetSets} SETS</span>
            </div>
          </div>

          <div className="flex items-center justify-around w-full px-4">
             <div className="text-center">
               <p className="text-xs font-black text-slate-900 mb-1 uppercase tracking-widest">Side</p>
               <p className={`text-7xl font-black ${currentSet % 2 !== 0 ? 'text-purple-500' : 'text-cyan-500'}`}>
                 {currentSet % 2 !== 0 ? 'R' : 'L'}
               </p>
             </div>
             <div className="h-16 w-px bg-slate-200" />
             <div className="text-center">
               <p className="text-xs font-black text-slate-900 mb-1 uppercase tracking-widest">Count</p>
               <p className="text-7xl font-black text-slate-800">{currentCount}</p>
             </div>
          </div>

          <div className="flex gap-4 w-full">
            <button 
              onClick={() => setIsPaused(!isPaused)}
              className="flex-1 bg-white border-[3px] border-slate-900 text-slate-900 py-4 rounded-[1.5rem] text-lg font-black flex justify-center items-center gap-2 active:scale-95 transition-transform"
            >
              {isPaused ? <Play fill="black" size={20} /> : <Pause fill="black" size={20} />} {isPaused ? 'RESUME' : 'PAUSE'}
            </button>
            <button 
              onClick={() => { if(confirm('セッションを中止しますか？')) setIsActive(false); }}
              className="px-8 bg-slate-100 text-slate-900 rounded-[1.5rem] hover:bg-slate-200 transition-all"
            >
              <RotateCcw size={24} />
            </button>
          </div>
        </div>
      )}

      <footer className="mt-auto py-6">
        <p className="text-[10px] font-black text-slate-900 tracking-[0.3em]">©️BORN TO YOG</p>
      </footer>
    </div>
  );
}