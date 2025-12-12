/* script.js - corrected & robust Dots & Boxes
   - Two-player hotseat
   - Click edges to claim; scoring yields extra turn
   - Restart/grid change works properly
*/

(() => {
  // Elements
  const boardEl = document.getElementById('board');
  const gridSelect = document.getElementById('grid-size');
  const restartBtn = document.getElementById('restart');
  const turnIndicator = document.getElementById('turn-indicator');
  const scoreEls = [document.getElementById('score-0'), document.getElementById('score-1')];
  const playerEls = [document.getElementById('player-0'), document.getElementById('player-1')];

  // State
  let N = parseInt(gridSelect.value, 10); // number of boxes per row/col
  let dots = [];   // array of dot {x,y,idx}
  let edges = {};  // map key -> { a, b, claimedBy, svgEl }
  let boxes = [];  // array of { edges: [kTop, kRight, kBottom, kLeft], claimedBy, svgRect }
  let currentPlayer = 0;
  let scores = [0, 0];

  // Helpers
  const uid = (...parts) => parts.join('-');

  // Build/reset board
  function makeGrid(n) {
    N = Number(n) || 4;
    dots = [];
    edges = {};
    boxes = [];
    currentPlayer = 0;
    scores = [0, 0];
    updateUI();
    renderSVGBoard();
  }

  // Render the SVG board fresh
  function renderSVGBoard() {
    boardEl.innerHTML = '';
    const svgNS = 'http://www.w3.org/2000/svg';

    // Visual sizing
    const dotSpacing = 72; // units inside viewBox
    const pad = 16;
    const totalSize = N * dotSpacing + pad * 2;
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${totalSize} ${totalSize}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `Dots and Boxes ${N} by ${N}`);

    // compute dots
    for (let r = 0; r <= N; r++) {
      for (let c = 0; c <= N; c++) {
        const x = pad + c * dotSpacing;
        const y = pad + r * dotSpacing;
        const idx = r * (N + 1) + c;
        dots[idx] = { x, y, r, c, idx };
      }
    }

    // Create horizontal edges
    for (let r = 0; r <= N; r++) {
      for (let c = 0; c < N; c++) {
        const a = r * (N + 1) + c;
        const b = r * (N + 1) + (c + 1);
        createEdge(svg, a, b);
      }
    }
    // Create vertical edges
    for (let r = 0; r < N; r++) {
      for (let c = 0; c <= N; c++) {
        const a = r * (N + 1) + c;
        const b = (r + 1) * (N + 1) + c;
        createEdge(svg, a, b);
      }
    }

    // Create boxes (rects placed under dots)
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const topKey = uid('e', r * (N + 1) + c, r * (N + 1) + (c + 1));
        const rightKey = uid('e', r * (N + 1) + (c + 1), (r + 1) * (N + 1) + (c + 1));
        const bottomKey = uid('e', (r + 1) * (N + 1) + c, (r + 1) * (N + 1) + (c + 1));
        const leftKey = uid('e', r * (N + 1) + c, (r + 1) * (N + 1) + c);

        const rect = document.createElementNS(svgNS, 'rect');
        const x = pad + c * dotSpacing + dotSpacing * 0.08;
        const y = pad + r * dotSpacing + dotSpacing * 0.08;
        const s = dotSpacing * 0.84;
        rect.setAttribute('x', x);
        rect.setAttribute('y', y);
        rect.setAttribute('width', s);
        rect.setAttribute('height', s);
        rect.setAttribute('class', 'box-fill');
        rect.style.pointerEvents = 'none';
        svg.appendChild(rect);

        boxes.push({
          edges: [topKey, rightKey, bottomKey, leftKey],
          claimedBy: null,
          svgRect: rect
        });
      }
    }

    // Draw dots on top
    dots.forEach(d => {
      const circle = document.createElementNS(svgNS, 'circle');
      circle.setAttribute('cx', d.x);
      circle.setAttribute('cy', d.y);
      circle.setAttribute('r', 6);
      circle.setAttribute('class', 'dot-circle');
      svg.appendChild(circle);
    });

    boardEl.appendChild(svg);
  }

  // Create a single edge line and register it
  function createEdge(svg, aIdx, bIdx) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const a = dots[aIdx], b = dots[bIdx];
    if (!a || !b) return;
    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('x1', a.x);
    line.setAttribute('y1', a.y);
    line.setAttribute('x2', b.x);
    line.setAttribute('y2', b.y);
    line.setAttribute('class', 'edge unclaimed');
    const key = uid('e', aIdx, bIdx);
    line.dataset.key = key;

    edges[key] = {
      a: aIdx,
      b: bIdx,
      claimedBy: null,
      svgEl: line
    };

    // click handler
    line.addEventListener('click', () => {
      // ignore if already claimed
      if (!edges[key] || edges[key].claimedBy !== null) return;
      handleClaimEdge(key);
    });

    svg.appendChild(line);
  }

  // Claim edge and handle box completion logic
  function handleClaimEdge(key) {
    const edge = edges[key];
    if (!edge || edge.claimedBy !== null) return;

    // mark claimed
    edge.claimedBy = currentPlayer;
    const el = edge.svgEl;
    el.classList.remove('unclaimed');
    el.classList.add('claimed', `p${currentPlayer}`);

    // check boxes adjacent to this edge
    const newlyCompleted = claimBoxesAdjacentToEdge(key, currentPlayer);

    if (newlyCompleted === 0) {
      // switch turn
      currentPlayer = 1 - currentPlayer;
    } else {
      // award points
      scores[currentPlayer] += newlyCompleted;
    }

    updateUI();
    checkEnd();
  }

  // For given edge key, check boxes that use it and mark any complete boxes
  function claimBoxesAdjacentToEdge(edgeKey, player) {
    let completed = 0;
    boxes.forEach(box => {
      if (box.claimedBy !== null) return; // already claimed
      // if this box uses the edgeKey, check completion (or it might complete because of another edge but we still check)
      if (box.edges.includes(edgeKey)) {
        const allClaimed = box.edges.every(k => edges[k] && edges[k].claimedBy !== null);
        if (allClaimed) {
          box.claimedBy = player;
          box.svgRect.classList.add(`p${player}`);
          completed++;
        }
      }
    });
    return completed;
  }

  function updateUI() {
    scoreEls[0].textContent = scores[0];
    scoreEls[1].textContent = scores[1];
    turnIndicator.textContent = currentPlayer === 0 ? 'Player 1' : 'Player 2';
    playerEls.forEach((el, idx) => {
      if (idx === currentPlayer) el.classList.add('active');
      else el.classList.remove('active');
    });
  }

  function checkEnd() {
    const total = N * N;
    const claimed = boxes.filter(b => b.claimedBy !== null).length;
    if (claimed === total) {
      const [a, b] = scores;
      let msg = a === b ? `It's a tie! ${a} — ${b}` : `${a > b ? 'Player 1' : 'Player 2'} wins! ${a} — ${b}`;
      // small delay so last stroke renders, then show dialog
      setTimeout(() => {
        alert(`Game over — ${msg}`);
      }, 120);
    }
  }

  // Controls
  restartBtn.addEventListener('click', () => makeGrid(parseInt(gridSelect.value, 10)));
  gridSelect.addEventListener('change', (e) => makeGrid(parseInt(e.target.value, 10)));

  // start
  makeGrid(N);

  // expose simple debug API
  window.DotsBoxes = {
    reset: () => makeGrid(N),
    setGrid: (n) => makeGrid(n)
  };
})();
