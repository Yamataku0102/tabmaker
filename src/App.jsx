import React, { useState, useEffect, useRef } from 'react';
import * as VF from 'vexflow';
import { Settings, Plus, Trash2, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, CornerDownLeft } from 'lucide-react';

const stringMidi = { 1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40 };
const NOTES_SHARP = [
  { note: 'c', acc: null }, { note: 'c', acc: '#' }, { note: 'd', acc: null },
  { note: 'd', acc: '#' }, { note: 'e', acc: null }, { note: 'f', acc: null },
  { note: 'f', acc: '#' }, { note: 'g', acc: null }, { note: 'g', acc: '#' },
  { note: 'a', acc: null }, { note: 'a', acc: '#' }, { note: 'b', acc: null },
];
const NOTES_FLAT = [
  { note: 'c', acc: null }, { note: 'd', acc: 'b' }, { note: 'd', acc: null },
  { note: 'e', acc: 'b' }, { note: 'e', acc: null }, { note: 'f', acc: null },
  { note: 'g', acc: 'b' }, { note: 'g', acc: null }, { note: 'a', acc: 'b' },
  { note: 'a', acc: null }, { note: 'b', acc: 'b' }, { note: 'b', acc: null },
];

const keySignatures = {
  'C': [], 'G': ['f'], 'D': ['f', 'c'], 'A': ['f', 'c', 'g'], 
  'E': ['f', 'c', 'g', 'd'], 'B': ['f', 'c', 'g', 'd', 'a'],
  'F': ['b'], 'Bb': ['b', 'e'], 'Eb': ['b', 'e', 'a'], 
  'Ab': ['b', 'e', 'a', 'd'], 'Db': ['b', 'e', 'a', 'd', 'g']
};

function getPitchInfo(str, fret, key) {
  const baseMidi = stringMidi[str];
  const midi = baseMidi + fret;
  const octave = Math.floor(midi / 12) - 1;
  const useFlats = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'd', 'g', 'c', 'f', 'bb', 'eb'].includes(key);
  const info = useFlats ? NOTES_FLAT[midi % 12] : NOTES_SHARP[midi % 12];
  
  const sig = keySignatures[key] || [];
  let neededAcc = null;
  
  if (info.acc) {
    if (!sig.includes(info.note)) {
      neededAcc = info.acc;
    }
  } else {
    if (sig.includes(info.note)) {
      neededAcc = 'n';
    }
  }
  
  const vfKey = info.acc ? `${info.note}${info.acc}/${octave}` : `${info.note}/${octave}`;
  return { key: vfKey, acc: neededAcc };
}

export default function App() {
  const [currentKey, setCurrentKey] = useState('C');
  const [currentDuration, setCurrentDuration] = useState('q');
  const [columns, setColumns] = useState([
    { duration: 'q', notes: {}, chord: '', isRest: false }
  ]);
  const [cursor, setCursor] = useState({ col: 0, str: 1 });
  
  const containerRef = useRef(null);
  const wrapperRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(800);

  useEffect(() => {
    if (!wrapperRef.current) return;
    const observer = new ResizeObserver(entries => {
      if (entries[0].contentRect.width > 0) {
        setContainerWidth(entries[0].contentRect.width);
      }
    });
    observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const div = containerRef.current;
    div.innerHTML = '';
    
    const maxColsPerLine = Math.max(4, Math.floor((containerWidth - 100) / 60));
    const systems = [];
    let currentSys = { cols: [], startIndex: 0 };

    columns.forEach((col, idx) => {
      if (col.type === 'linebreak') {
        systems.push(currentSys);
        currentSys = { cols: [], startIndex: idx + 1 };
      } else {
        currentSys.cols.push({ col, globalIdx: idx });
        if (currentSys.cols.length >= maxColsPerLine) {
          systems.push(currentSys);
          currentSys = { cols: [], startIndex: idx + 1 };
        }
      }
    });
    if (currentSys.cols.length > 0) {
      systems.push(currentSys);
    }

    const systemHeight = 280;
    const svgHeight = Math.max(450, systems.length * systemHeight + 50);
    
    const renderer = new VF.Renderer(div, VF.Renderer.Backends.SVG);
    renderer.resize(containerWidth, svgHeight);
    const context = renderer.getContext();
    context.setFont('Arial', 10, '').setBackgroundFillStyle('#eed');

    let cursorX = 0, cursorY = 0;
    let foundCursor = false;

    systems.forEach((sys, sysIdx) => {
      if (sys.cols.length === 0) return;

      const yOffset = sysIdx * systemHeight;
      const stave = new VF.Stave(10, 80 + yOffset, containerWidth - 20);
      stave.addClef('treble').addKeySignature(currentKey);
      stave.setContext(context).draw();

      const tabStave = new VF.TabStave(10, 220 + yOffset, containerWidth - 20);
      tabStave.addClef('tab');
      tabStave.setContext(context).draw();

      new VF.StaveConnector(stave, tabStave).setType(VF.StaveConnector.type.BRACKET).setContext(context).draw();
      new VF.StaveConnector(stave, tabStave).setType(VF.StaveConnector.type.SINGLE).setContext(context).draw();

      const staveNotes = [];
      const tabNotes = [];
      let totalBeats = 0;
      const getBeats = (d) => ({ 'w': 4, 'h': 2, 'q': 1, '8': 0.5, '16': 0.25 }[d] || 1);

      sys.cols.forEach(item => {
        const { col, globalIdx } = item;
        const isCursorCol = cursor.col === globalIdx;
        
        if (col.type === 'barline') {
          staveNotes.push(new VF.BarNote(VF.BarlineType.SINGLE));
          tabNotes.push(new VF.BarNote(VF.BarlineType.SINGLE));
        } else if (col.isRest || Object.keys(col.notes || {}).length === 0) {
          totalBeats += getBeats(col.duration);
          const sn = new VF.StaveNote({ keys: ['b/4'], duration: col.duration + 'r' });
          if (col.chord) {
            sn.addModifier(new VF.Annotation(col.chord).setVerticalJustification(VF.AnnotationVerticalJustify.TOP));
          }
          staveNotes.push(sn);

          const tn = new VF.GhostNote({ duration: col.duration });
          tabNotes.push(tn);
        } else {
          totalBeats += getBeats(col.duration);
          const positions = [];
          const noteEntries = Object.entries(col.notes).map(([str, fret]) => {
            const s = parseInt(str, 10);
            return { str: s, fret, pitch: getPitchInfo(s, fret, currentKey) };
          });

          noteEntries.sort((a, b) => b.str - a.str);

          const snKeys = [];
          noteEntries.forEach(entry => {
            snKeys.push(entry.pitch.key);
            positions.push({ str: entry.str, fret: entry.fret });
          });

          const sn = new VF.StaveNote({ keys: snKeys, duration: col.duration });
          noteEntries.forEach((entry, i) => {
            if (entry.pitch.acc) {
              sn.addModifier(new VF.Accidental(entry.pitch.acc), i);
            }
          });

          if (col.chord) {
            sn.addModifier(new VF.Annotation(col.chord).setVerticalJustification(VF.AnnotationVerticalJustify.TOP));
          }
          staveNotes.push(sn);

          const tn = new VF.TabNote({ positions, duration: col.duration });
          
          if (isCursorCol) {
            // Cursor box is drawn later via context.rect
          }
          tabNotes.push(tn);
        }
      });

      if (staveNotes.length > 0) {
        try {
          const beats = Math.max(4, Math.ceil(totalBeats));
          const voice = new VF.Voice({ num_beats: beats, beat_value: 4 }).setMode(VF.Voice.Mode.SOFT);
          voice.addTickables(staveNotes);
          
          const tabVoice = new VF.Voice({ num_beats: beats, beat_value: 4 }).setMode(VF.Voice.Mode.SOFT);
          tabVoice.addTickables(tabNotes);
          
          const formatWidth = Math.max(100, containerWidth - 100);
          new VF.Formatter().joinVoices([voice, tabVoice]).format([voice, tabVoice], formatWidth);
          
          voice.draw(context, stave);
          tabVoice.draw(context, tabStave);

          const localCursorIdx = sys.cols.findIndex(c => c.globalIdx === cursor.col);
          if (localCursorIdx !== -1) {
            const cursorNote = tabNotes[localCursorIdx];
            if (cursorNote) {
              let x = cursorNote.getAbsoluteX();
              if (cursorNote instanceof VF.GhostNote) x += 10;
              cursorX = x;
              cursorY = tabStave.getYForLine(cursor.str);
              foundCursor = true;
              
              context.beginPath();
              context.setFillStyle('rgba(99, 102, 241, 0.1)'); // Indigo background
              context.rect(x - 15, stave.getYForLine(0) - 20, 30, tabStave.getYForLine(6) - stave.getYForLine(0) + 40);
              context.fill();
            }
          }
        } catch (e) {
          console.error("VexFlow Error:", e);
        }
      }
    });

    if (foundCursor) {
      context.beginPath();
      context.setStrokeStyle('rgba(236, 72, 153, 0.8)'); // Pink border
      context.setLineWidth(3);
      context.rect(cursorX - 8, cursorY - 8, 16, 16);
      context.stroke();
    }

  }, [columns, currentKey, cursor, containerWidth]);

  const updateCurrentColumn = (updater) => {
    setColumns(prev => {
      const next = [...prev];
      if (next[cursor.col].type === 'barline' || next[cursor.col].type === 'linebreak') return next; 
      next[cursor.col] = updater(next[cursor.col]);
      return next;
    });
  };

  const handleFretInput = (fret) => {
    updateCurrentColumn(col => ({
      ...col,
      isRest: false,
      duration: currentDuration,
      notes: { ...col.notes, [cursor.str]: fret }
    }));
  };

  const handleRestInput = () => {
    updateCurrentColumn(col => ({
      ...col,
      isRest: true,
      duration: currentDuration,
      notes: {}
    }));
  };

  const handleBarlineInput = () => {
    setColumns(prev => {
      const next = [...prev];
      next.splice(cursor.col + 1, 0, { type: 'barline' }, { duration: currentDuration, notes: {}, chord: '', isRest: false });
      return next;
    });
    setCursor(c => ({ ...c, col: c.col + 2 }));
  };

  const handleLinebreakInput = () => {
    setColumns(prev => {
      const next = [...prev];
      next.splice(cursor.col + 1, 0, { type: 'linebreak' }, { duration: currentDuration, notes: {}, chord: '', isRest: false });
      return next;
    });
    setCursor(c => ({ ...c, col: c.col + 2 }));
  };

  const handleDelete = () => {
    setColumns(prev => {
      const next = [...prev];
      const col = { ...next[cursor.col] };
      
      if (col.type === 'barline' || col.type === 'linebreak') {
        if (next.length > 1) {
          next.splice(cursor.col, 1);
          setCursor(c => ({ ...c, col: Math.max(0, c.col - 1) }));
        }
        return next;
      }
      
      if (col.notes[cursor.str] !== undefined) {
        // 現在の弦の音符を削除
        delete col.notes[cursor.str];
        next[cursor.col] = col;
      } else if (Object.keys(col.notes).length === 0) {
        // カラムが空の場合はカラム自体を削除（最低1つは残す）
        if (next.length > 1) {
          next.splice(cursor.col, 1);
          setCursor(c => ({ ...c, col: Math.max(0, c.col - 1) }));
        }
      } else {
        // 別の弦に音符があるが、現在の弦にはない場合
        // 何もしないか、またはすべてクリアするか
      }
      return next;
    });
  };

  const moveCursor = (dir) => {
    setCursor(prev => {
      if (dir === 'up') return { ...prev, str: Math.max(1, prev.str - 1) };
      if (dir === 'down') return { ...prev, str: Math.min(6, prev.str + 1) };
      if (dir === 'left') return { ...prev, col: Math.max(0, prev.col - 1) };
      if (dir === 'right') {
        const nextCol = prev.col + 1;
        if (nextCol >= columns.length) {
          setColumns(c => [...c, { duration: currentDuration, notes: {}, chord: '', isRest: false }]);
        }
        return { ...prev, col: nextCol };
      }
      return prev;
    });
  };

  const handleDurationChange = (d) => {
    setCurrentDuration(d);
    updateCurrentColumn(col => ({ ...col, duration: d }));
  };

  const handleChordChange = (e) => {
    const val = e.target.value;
    updateCurrentColumn(col => ({ ...col, chord: val }));
  };

  const durations = [
    { id: 'w', label: '全音符' },
    { id: 'h', label: '2分音符' },
    { id: 'q', label: '4分音符' },
    { id: '8', label: '8分音符' },
    { id: '16', label: '16分音符' },
  ];

  const keys = ['C', 'G', 'D', 'A', 'E', 'B', 'F', 'Bb', 'Eb', 'Ab'];

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50 text-gray-800 font-sans">
      <div className="p-3 sm:p-4 bg-white shadow-md flex flex-wrap items-center gap-4 z-10">
        <h1 className="font-extrabold text-xl sm:text-2xl text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-purple-600">
          TabMaker MVP
        </h1>
        
        <div className="flex items-center gap-2 bg-gray-100 px-3 py-1.5 rounded-lg">
          <label className="text-sm font-semibold text-gray-600">Key:</label>
          <select 
            value={currentKey} 
            onChange={e => setCurrentKey(e.target.value)}
            className="bg-white border border-gray-300 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-sm"
          >
            {keys.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2 bg-gray-100 px-3 py-1.5 rounded-lg flex-1 min-w-[200px]">
          <label className="text-sm font-semibold text-gray-600 whitespace-nowrap">コード:</label>
          <input 
            type="text" 
            value={columns[cursor.col]?.chord || ''} 
            onChange={handleChordChange}
            placeholder="例: Cmaj7"
            className="w-full border border-gray-300 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 bg-gray-200 flex items-start justify-center shadow-inner">
        <div ref={wrapperRef} className="bg-white shadow-xl rounded-xl p-4 w-full border border-gray-200">
          <div ref={containerRef}></div>
        </div>
      </div>

      <div className="bg-gray-900 text-white p-4 shadow-[0_-10px_20px_rgba(0,0,0,0.2)] z-10 relative">
        <div className="max-w-5xl mx-auto flex flex-col gap-4">
          
          <div className="flex flex-wrap justify-center gap-2">
            {durations.map(d => (
              <button 
                key={d.id}
                onClick={() => handleDurationChange(d.id)}
                className={`px-3 sm:px-4 py-2 rounded-lg font-bold text-sm transition-all duration-200 ${
                  currentDuration === d.id 
                    ? 'bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.6)] transform scale-105' 
                    : 'bg-gray-800 border border-gray-700 hover:bg-gray-700'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-4 lg:gap-8 justify-center items-center">
            
            {/* D-Pad Cursor Controls */}
            <div className="flex flex-col items-center gap-1 bg-gray-800 p-3 rounded-xl border border-gray-700">
              <div className="text-center text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-1">Cursor</div>
              <button onClick={() => moveCursor('up')} className="w-12 h-10 bg-gray-700 hover:bg-gray-600 active:bg-pink-500 rounded-lg flex items-center justify-center transition-colors">
                <ArrowUp size={20} />
              </button>
              <div className="flex gap-1">
                <button onClick={() => moveCursor('left')} className="w-12 h-10 bg-gray-700 hover:bg-gray-600 active:bg-indigo-500 rounded-lg flex items-center justify-center transition-colors">
                  <ArrowLeft size={20} />
                </button>
                <button onClick={() => moveCursor('down')} className="w-12 h-10 bg-gray-700 hover:bg-gray-600 active:bg-pink-500 rounded-lg flex items-center justify-center transition-colors">
                  <ArrowDown size={20} />
                </button>
                <button onClick={() => moveCursor('right')} className="w-12 h-10 bg-gray-700 hover:bg-gray-600 active:bg-indigo-500 rounded-lg flex items-center justify-center transition-colors">
                  <ArrowRight size={20} />
                </button>
              </div>
            </div>

            {/* Fret Pad */}
            <div className="flex flex-col gap-1 bg-gray-800 p-3 rounded-xl border border-gray-700">
              <div className="text-center text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-1">Fret</div>
              <div className="grid grid-cols-7 sm:grid-cols-13 gap-1">
                {Array.from({length: 25}, (_, i) => i).map(f => (
                  <button
                    key={f}
                    onClick={() => handleFretInput(f)}
                    className="w-10 h-10 rounded bg-gray-700 hover:bg-gray-600 active:bg-indigo-500 active:scale-95 font-bold text-base flex items-center justify-center transition-colors border border-gray-600"
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2 h-full justify-center">
              <div className="flex gap-2">
                <button 
                  onClick={handleRestInput} 
                  className="flex-1 px-3 sm:px-4 py-2 sm:py-3 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 font-bold flex items-center justify-center gap-2 transition-all shadow-md text-sm"
                >
                  <Plus size={18} /> 休符
                </button>
                <button 
                  onClick={handleDelete} 
                  className="flex-1 px-3 sm:px-4 py-2 sm:py-3 rounded-lg bg-red-600 hover:bg-red-500 active:bg-red-700 font-bold flex items-center justify-center gap-2 transition-all shadow-md text-sm"
                >
                  <Trash2 size={18} /> 削除
                </button>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={handleBarlineInput} 
                  className="flex-1 px-3 sm:px-4 py-2 sm:py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 font-bold flex items-center justify-center gap-2 transition-all shadow-md text-sm"
                >
                  <span className="w-[18px] h-[18px] flex items-center justify-center font-serif text-lg">|</span> 小節線
                </button>
                <button 
                  onClick={handleLinebreakInput} 
                  className="flex-1 px-3 sm:px-4 py-2 sm:py-3 rounded-lg bg-purple-600 hover:bg-purple-500 active:bg-purple-700 font-bold flex items-center justify-center gap-2 transition-all shadow-md text-sm"
                >
                  <CornerDownLeft size={18} /> 改行
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
