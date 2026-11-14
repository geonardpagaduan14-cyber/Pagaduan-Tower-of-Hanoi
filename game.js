/* Tower of Hanoi - frontend
   All moves are validated by the Prolog backend (POST /api/move).
   Animation uses the Web Animations API: Lift -> Travel -> Drop.
   No sounds anywhere. */
(() => {
  'use strict';

  const NUM_PEGS = 3;
  const GOAL_PEG = 2;

  // Base durations in ms at 1x speed
  const LIFT_MS = 320;
  const TRAVEL_MS = 420;   // per peg of horizontal distance
  const DROP_MS = 320;

  const $ = (id) => document.getElementById(id);
  const el = {
    time: $('time'),
    moves: $('moves'),
    invalid: $('invalid'),
    optimal: $('optimal'),
    diskCount: $('disk-count'),
    newGame: $('new-game'),
    solve: $('auto-solve'),
    speed: $('speed'),
    speedLabel: $('speed-label'),
    message: $('message'),
    banner: $('offline-banner'),
    modal: $('victory-modal'),
    vTime: $('v-time'),
    vMoves: $('v-moves'),
    vOptimal: $('v-optimal'),
    vNote: $('victory-note'),
    vAgain: $('v-again'),
    vClose: $('v-close'),
  };

  const pegWraps = Array.from(document.querySelectorAll('.peg-wrap'));
  const stacks = pegWraps.map((w) => w.querySelector('.disks-stack'));

  // ---------- Game state ----------
  let numDisks = Number(el.diskCount.value);
  let state = [];
  let moves = 0;
  let invalidCount = 0;
  let startTime = null;
  let endTime = null;
  let timerId = null;
  let selected = null;
  let busy = false;          // a move is in flight (fetch + animation)
  let solving = false;       // auto-solve loop is running
  let manualMoved = false;   // user has made a manual move
  let won = false;
  let runId = 0;             // bumps on New Game to cancel stale work
  let activeAnims = [];
  let offline = false;
  let retryId = null;

  // ---------- Helpers ----------
  const speed = () => Number(el.speed.value) || 1;
  const optimalMoves = () => Math.pow(2, numDisks) - 1;

  function formatTime(ms) {
    const total = Math.floor(ms / 100) / 10;
    const m = Math.floor(total / 60);
    const s = total - m * 60;
    return m + ':' + s.toFixed(1).padStart(4, '0');
  }

  function showMessage(text, isError) {
    el.message.textContent = text || '';
    el.message.classList.toggle('error', !!isError);
  }

  // ---------- Timer ----------
  function elapsed() {
    if (startTime === null) return 0;
    return (endTime !== null ? endTime : performance.now()) - startTime;
  }
  function updateTime() { el.time.textContent = formatTime(elapsed()); }
  function startTimer() {
    if (startTime !== null) return;
    startTime = performance.now();
    timerId = setInterval(updateTime, 100);
  }
  function stopTimer() {
    if (startTime !== null && endTime === null) endTime = performance.now();
    clearInterval(timerId);
    timerId = null;
    updateTime();
  }

  function updateCounters() {
    el.moves.textContent = String(moves);
    el.invalid.textContent = String(invalidCount);
    el.optimal.textContent = String(optimalMoves());
  }

  // ---------- Server access ----------
  function setOffline(flag) {
    offline = flag;
    el.banner.hidden = !flag;
    if (flag && retryId === null) {
      retryId = setInterval(pingServer, 3000);
    } else if (!flag && retryId !== null) {
      clearInterval(retryId);
      retryId = null;
    }
  }

  async function api(path, body) {
    let res;
    try {
      res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      setOffline(true);
      throw new Error('offline');
    }
    if (!res.ok) {
      setOffline(true);
      throw new Error('server error ' + res.status);
    }
    let data;
    try {
      data = await res.json();
    } catch (err) {
      setOffline(true);
      throw new Error('bad response');
    }
    setOffline(false);
    return data;
  }

  async function pingServer() {
    try {
      await api('/api/move', { state: [[1], [], []], from: 0, to: 1 });
    } catch (err) { /* banner already shown */ }
  }

  // ---------- Rendering ----------
  function render() {
    stacks.forEach((stack, i) => {
      stack.textContent = '';
      state[i].forEach((size) => {
        const d = document.createElement('div');
        d.className = 'disk disk-' + size;
        d.style.setProperty('--n', String(size));
        d.dataset.size = String(size);
        stack.appendChild(d);
      });
    });
  }

  function clearSelection() {
    selected = null;
    pegWraps.forEach((w) => w.classList.remove('selected'));
  }

  // ---------- Animation: Lift -> Travel -> Drop ----------
  async function animateMove(from, to) {
    const disk = stacks[from].lastElementChild;
    if (!disk) return;

    const rect = disk.getBoundingClientRect();
    const sRect = pegWraps[from].getBoundingClientRect();
    const tRect = pegWraps[to].getBoundingClientRect();
    const diskH = rect.height;
    const destCount = state[to].length;

    // Absolute translate values relative to the disk's resting place
    const liftY = (sRect.top - diskH - 14) - rect.top;
    const dx = (tRect.left + tRect.width / 2) - (sRect.left + sRect.width / 2);
    const dropY = (sRect.bottom - (destCount + 1) * diskH) - rect.top;
    const steps = Math.max(1, Math.abs(to - from));

    disk.classList.add('flying');

    const run = (fromT, toT, baseMs) => {
      const anim = disk.animate(
        [{ transform: fromT }, { transform: toT }],
        { duration: baseMs / speed(), easing: 'linear', fill: 'forwards' }
      );
      activeAnims.push(anim);
      return anim.finished;
    };

    try {
      // Phase 1: straight up
      await run('translate(0px, 0px)',
                `translate(0px, ${liftY}px)`, LIFT_MS);
      // Phase 2: straight across
      await run(`translate(0px, ${liftY}px)`,
                `translate(${dx}px, ${liftY}px)`, TRAVEL_MS * steps);
      // Phase 3: straight down
      await run(`translate(${dx}px, ${liftY}px)`,
                `translate(${dx}px, ${dropY}px)`, DROP_MS);
    } finally {
      activeAnims = [];
    }
  }

  function shakeTopDisk(peg) {
    const disk = stacks[peg].lastElementChild;
    if (!disk) return;
    disk.animate(
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-9px)' },
        { transform: 'translateX(9px)' },
        { transform: 'translateX(-6px)' },
        { transform: 'translateX(6px)' },
        { transform: 'translateX(0)' },
      ],
      { duration: 320, easing: 'linear' }
    );
  }

  // ---------- Moves (always via the Prolog backend) ----------
  async function attemptMove(from, to, auto) {
    const id = runId;
    busy = true;
    clearSelection();
    try {
      const data = await api('/api/move', { state, from, to });
      if (id !== runId) return false;

      if (!data.valid) {
        invalidCount++;
        updateCounters();
        showMessage('Invalid move: a bigger disk can\'t go on a smaller one.', true);
        shakeTopDisk(from);
        return false;
      }

      if (!auto && !manualMoved) {
        manualMoved = true;
        el.solve.disabled = true;
      }
      startTimer();
      showMessage('');

      await animateMove(from, to);
      if (id !== runId) return false;

      state = data.newState;
      moves++;
      render();
      updateCounters();

      if (state[GOAL_PEG].length === numDisks) victory(auto);
      return true;
    } catch (err) {
      if (id === runId && err && err.message === 'offline') {
        showMessage('Prolog server is offline. Move blocked.', true);
      } else if (id === runId && err && err.name !== 'AbortError') {
        showMessage('Something went wrong talking to the server. Move blocked.', true);
      }
      return false;
    } finally {
      if (id === runId) busy = false;
    }
  }

  function victory(auto) {
    won = true;
    solving = false;
    stopTimer();
    el.solve.disabled = true;
    el.vTime.textContent = formatTime(elapsed());
    el.vMoves.textContent = String(moves);
    el.vOptimal.textContent = String(optimalMoves());
    if (auto) el.vNote.textContent = 'Solved by Prolog.';
    else if (moves === optimalMoves()) el.vNote.textContent = 'Perfect! You matched the optimal solution.';
    else el.vNote.textContent = 'Nicely done!';
    el.modal.hidden = false;
    el.vAgain.focus();
  }

  // ---------- Auto-solve ----------
  async function autoSolve() {
    if (solving || manualMoved || busy || won) return;
    const id = runId;
    solving = true;
    el.solve.disabled = true;
    clearSelection();
    showMessage('Asking Prolog for the optimal solution...');

    let data;
    try {
      data = await api('/api/solve', { disks: numDisks, pegs: NUM_PEGS });
    } catch (err) {
      if (id === runId) {
        solving = false;
        el.solve.disabled = false;
        showMessage('Prolog server is offline. Can\'t auto-solve.', true);
      }
      return;
    }
    if (id !== runId) return;
    showMessage('');

    for (const m of data.moves) {
      if (id !== runId) return;
      const ok = await attemptMove(m.from, m.to, true);
      if (!ok) {
        if (id === runId) {
          solving = false;
          showMessage('Auto-solve stopped. Start a New Game to try again.', true);
        }
        return;
      }
    }
    if (id === runId) solving = false;
  }

  // ---------- New game ----------
  function newGame() {
    runId++;
    activeAnims.forEach((a) => { try { a.cancel(); } catch (e) { /* ignore */ } });
    activeAnims = [];

    clearInterval(timerId);
    timerId = null;
    startTime = null;
    endTime = null;

    numDisks = Number(el.diskCount.value);
    state = [Array.from({ length: numDisks }, (_, i) => numDisks - i), [], []];
    moves = 0;
    invalidCount = 0;
    busy = false;
    solving = false;
    manualMoved = false;
    won = false;

    clearSelection();
    showMessage('');
    el.modal.hidden = true;
    el.solve.disabled = false;
    render();
    updateCounters();
    updateTime();
  }

  // ---------- Input ----------
  function onPegActivate(i) {
    if (busy || solving || won) return;
    if (selected === null) {
      if (state[i].length === 0) return;
      selected = i;
      pegWraps[i].classList.add('selected');
    } else if (selected === i) {
      clearSelection();
    } else {
      attemptMove(selected, i, false);
    }
  }

  pegWraps.forEach((wrap, i) => {
    wrap.addEventListener('click', () => onPegActivate(i));
    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onPegActivate(i);
      }
    });
  });

  el.newGame.addEventListener('click', newGame);
  el.diskCount.addEventListener('change', newGame);
  el.solve.addEventListener('click', autoSolve);
  el.speed.addEventListener('input', () => {
    el.speedLabel.textContent = el.speed.value + 'x';
  });
  el.vAgain.addEventListener('click', newGame);
  el.vClose.addEventListener('click', () => { el.modal.hidden = true; });

  // ---------- Init ----------
  el.speedLabel.textContent = el.speed.value + 'x';
  newGame();
  pingServer();
})();
