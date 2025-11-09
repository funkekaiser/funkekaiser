(function(){
  const ballImg = new Image();
  ballImg.src = 'images/head.png';
  let ballAngle = 0; // rotation accumulator
  const smallScreen = window.matchMedia('(max-width: 600px)').matches;
  if (smallScreen) {
    const c = document.getElementById('pong');
    if (c) c.style.display = 'none';
    // Plain text/mobile layout only on small screens
    return;
  }
  const canvas = document.getElementById('pong');

  // Theme colors read from CSS variables
  let COLORS = {
    bg: '#000000',
    line: '#333333',
    entity: '#e7e7ea',
    score: '#a1a1a8',
    accent: '#6ea8fe'
  };
  function readTheme(){
    const cs = getComputedStyle(document.documentElement);
    const v = (name)=> cs.getPropertyValue(name).trim() || null;
    COLORS.bg     = v('--game-bg')     || COLORS.bg;
    COLORS.line   = v('--game-line')   || COLORS.line;
    COLORS.entity = v('--game-entity') || COLORS.entity;
    COLORS.score  = v('--game-score')  || COLORS.score;
    COLORS.accent = v('--game-accent') || COLORS.accent;
  }
  readTheme();
  const darkMedia = window.matchMedia('(prefers-color-scheme: dark)');
  darkMedia.addEventListener('change', ()=>{ readTheme(); draw(); });

  const ctx = canvas.getContext('2d');

  // Device-pixel-ratio aware sizing
  let W = 0, H = 0, dpr = 1;
  function fitCanvas(){
    dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    W = Math.max(320, Math.floor(window.innerWidth));
    H = Math.max(240, Math.floor(window.innerHeight));
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
  }
  fitCanvas();
  window.addEventListener('resize', ()=>{ readTheme(); fitCanvas(); centerAndServe(Math.random() < .5 ? 1 : -1); draw(); });

  // Game params (scaled off height)
  function dims(){
    const ph = Math.max(70, Math.floor(H * 0.22));
    const pw = Math.max(10, Math.floor(H * 0.028));
    const pm = Math.max(12, Math.floor(W * 0.025));
    const br = Math.max(20, Math.floor(H * 0.06));
    return { paddleW: pw, paddleH: ph, paddleMargin: pm, ballR: br };
  }

  // State
  let running = true;
  let lastTime = performance.now();
  let scoreL = 0, scoreR = 0;
  const winScore = 7;

  const left  = { x: 0, y: 0, w: 0, h: 0, speed: 0 };
  const right = { x: 0, y: 0, w: 0, h: 0, speed: 0 };
  const ball  = { x: 0, y: 0, vx: 0, vy: 0 };

  // AI imperfection + auto-handicap (more mistakes when AI is ahead)
  const ai = {
    timerMs: 0,
    reactionMs: 90,       // base reaction delay
    targetY: null,
    noise: 0,             // low-pass noise for aim wobble
    baseOffset: 0.55,     // fraction of paddle height used as max offset
  };

  function resetPaddles(){
    const { paddleW, paddleH, paddleMargin } = dims();
    left.w = right.w = paddleW;
    left.h = right.h = paddleH;
    left.x = paddleMargin;
    right.x = W - paddleMargin - paddleW;
    left.y = (H - left.h) / 2;
    right.y = (H - right.h) / 2;
    left.speed = Math.max(6, Math.floor(H * 0.018));
    right.speed = Math.max(5, Math.floor(H * 0.016));
  }

  function centerAndServe(dir){
    const { ballR } = dims();
    ball.x = W / 2; ball.y = H / 2;
    const startSpeed = Math.max(5, H * 0.012);
    const angle = (Math.random() * Math.PI/3 - Math.PI/6); // ±30°
    ball.vx = Math.cos(angle) * startSpeed * dir;
    ball.vy = Math.sin(angle) * startSpeed;
  }

  function fullReset(){ scoreL = 0; scoreR = 0; resetPaddles(); centerAndServe(Math.random() < .5 ? 1 : -1); }

  // Input: mouse follows pointer Y; keep Space (pause) and R (reset)
  const keys = new Set();
  let mouseY = null;
  window.addEventListener('pointermove', (e)=>{ mouseY = e.clientY; });
  // Also capture initial touch/pen press and finger drags
  window.addEventListener('pointerdown', (e)=>{ mouseY = e.clientY; });
  // Double‑tap toggles pause / restart
  let lastTap = 0;
  window.addEventListener('pointerdown', (e)=>{
    const now = Date.now();
    if (now - lastTap < 300) {
      // Treat as Space key
      if (!running && (scoreL >= winScore || scoreR >= winScore)){
        fullReset();
        running = true;
        lastTime = performance.now();
        requestAnimationFrame(loop);
      } else {
        running = !running;
        if (running){ lastTime = performance.now(); requestAnimationFrame(loop);} else { draw(); }
      }
    }
    lastTap = now;
  });
  window.addEventListener('touchmove', (e)=>{
    const t = e.touches && e.touches[0];
    if (t) mouseY = t.clientY;
  }, { passive: true });
  window.addEventListener('keydown', (e)=>{
    if (["Space","KeyR"].includes(e.code)) e.preventDefault();
    keys.add(e.code);
    if (e.code === 'Space'){
      // If game ended (win/lose), Space resets and restarts
      if (!running && (scoreL >= winScore || scoreR >= winScore)){
        fullReset();
        running = true;
        lastTime = performance.now();
        requestAnimationFrame(loop);
      } else {
        // Normal pause toggle
        running = !running;
        if (running){ lastTime = performance.now(); requestAnimationFrame(loop);} else { draw(); }
      }
    }
    if (e.code === 'KeyR'){ fullReset(); draw(); }
  });
  window.addEventListener('keyup', (e)=> keys.delete(e.code));

  function clamp(v,min,max){ return v < min ? min : v > max ? max : v; }

  function cpuMove(dt){
    // Auto-handicap: if AI is leading, it reacts slower and aims worse; if trailing, it plays tighter
    const lead = scoreR - scoreL; // positive if AI is ahead
    const handicap = clamp(0.6 + 0.12 * lead, 0.3, 1.1);

    // Update reaction timer (dt is in frames normalized to ~60fps, convert back to ms)
    ai.timerMs += dt * 16.67;
    const reaction = 70 + 120 * handicap; // 70..190ms depending on handicap

    // Update target only on reaction ticks (reduces twitch), but move toward it smoothly every frame
    if (ai.timerMs >= reaction || ai.targetY == null){
      ai.timerMs = 0;
      let baseTarget = (ball.vx > 0)
        ? (ball.y - right.h / 2 + ball.vy * 4) // slight lead when incoming
        : (H/2 - right.h/2);

      // Low-pass random wobble (imperfect aim)
      ai.noise = ai.noise * 0.9 + (Math.random() - 0.5) * 0.6;
      const offset = ai.noise * (right.h * ai.baseOffset) * handicap; // bigger offset when ahead
      ai.targetY = baseTarget + offset;
    }

    // Smooth follow using critically-damped like approach (proportional controller)
    // effSpeed is in px per frame at 60fps; multiply by dt for time-based movement
    const effSpeed = right.speed * clamp(1.0 - 0.25 * handicap, 0.65, 1.05);
    const maxStep = effSpeed * dt; // px this frame
    const diff = ai.targetY - right.y;
    // blendFactor controls how aggressively the paddle chases the target; scale with dt
    const blendFactor = clamp(0.22 * dt, 0.02, 0.35);
    let step = diff * blendFactor;
    // Cap the step to avoid large jumps when target changes
    step = clamp(step, -maxStep, maxStep);
    right.y = clamp(right.y + step, 0, H - right.h);

    // Occasional deliberate miss when ball is fast and near the AI side
    const fast = Math.hypot(ball.vx, ball.vy) > Math.max(9, H * 0.026) * 0.9;
    if (ball.vx > 0 && fast && ball.x > W * 0.62 && Math.random() < 0.03 * handicap){
      ai.targetY = (H - right.h) * Math.random(); // jumpy retarget to induce a miss
    }
  }

  function update(dt){
    const { ballR } = dims();

    // Player (left) input: mouse Y controls paddle
    if (mouseY !== null){
      left.y = clamp(mouseY - left.h/2, 0, H - left.h);
    }

    // AI (right)
    cpuMove(dt);

    // Ball
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    // Increase rotation based on speed
    ballAngle += Math.hypot(ball.vx, ball.vy) * 0.002;

    // Walls
    if (ball.y - ballR < 0 && ball.vy < 0){ ball.y = ballR; ball.vy *= -1; }
    if (ball.y + ballR > H && ball.vy > 0){ ball.y = H - ballR; ball.vy *= -1; }

    // Paddles
    // Left
    if (ball.x - ballR < left.x + left.w && ball.y > left.y && ball.y < left.y + left.h && ball.vx < 0){
      ball.x = left.x + left.w + ballR;
      const rel = (ball.y - (left.y + left.h/2)) / (left.h/2);
      const ang = rel * (Math.PI/3);
      const speed = Math.min(Math.hypot(ball.vx, ball.vy) * 1.05, Math.max(9, H * 0.026));
      ball.vx =  Math.cos(ang) * speed;
      ball.vy =  Math.sin(ang) * speed;
    }
    // Right (AI)
    if (ball.x + ballR > right.x && ball.y > right.y && ball.y < right.y + right.h && ball.vx > 0){
      ball.x = right.x - ballR;
      const rel = (ball.y - (right.y + right.h/2)) / (right.h/2);
      const ang = rel * (Math.PI/3);
      const speed = Math.min(Math.hypot(ball.vx, ball.vy) * 1.05, Math.max(9, H * 0.026));
      ball.vx = -Math.cos(ang) * speed;
      ball.vy =  Math.sin(ang) * speed;
    }

    // Scoring
    if (ball.x + ballR < 0){ scoreR++; centerAndServe(1); }
    if (ball.x - ballR > W){ scoreL++; centerAndServe(-1); }
  }

  function drawCourt(){
    // Background
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0,0,W,H);
    // Center dashed line
    ctx.setLineDash([8,10]);
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W/2,0); ctx.lineTo(W/2,H); ctx.stroke();
    ctx.setLineDash([]);
  }

  function draw(){
    const { ballR } = dims();
    drawCourt();

    // Entities
    ctx.fillStyle = COLORS.entity;
    ctx.fillRect(left.x, left.y, left.w, left.h);
    ctx.fillRect(right.x, right.y, right.w, right.h);
    if (ballImg.complete) {
      ctx.save();
      ctx.translate(ball.x, ball.y);
      ctx.rotate(ballAngle);
      ctx.drawImage(ballImg, -ballR, -ballR, ballR * 2, ballR * 2);
      ctx.restore();
    } else {
      ctx.beginPath(); ctx.arc(ball.x, ball.y, ballR, 0, Math.PI*2); ctx.fill();
    }

    // Score
    ctx.fillStyle = COLORS.score;
    ctx.font = '28px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${scoreL} : ${scoreR}`, W/2, 40);

    if (!running){
      ctx.fillStyle = COLORS.accent;
      ctx.font = '20px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.fillText('Paused — press Space or Double-tap', W/2, 80);
    }

    if (scoreL >= winScore || scoreR >= winScore){
      ctx.fillStyle = COLORS.accent;
      ctx.font = '22px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      const msg = scoreL > scoreR ? 'You win!' : 'CPU wins!';
      ctx.fillText(msg, W/2, 110);
      running = false;
    }
  }

  function loop(t){
    if (!running){ draw(); return; }
    const dt = Math.min(32, t - lastTime) / 16.67; // clamp and normalize
    lastTime = t;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // Init
  resetPaddles();
  centerAndServe(Math.random() < .5 ? 1 : -1);
  draw();
  requestAnimationFrame(loop);
})();
