export function HeroVisual() {
  return (
    <div className="hero-visual" aria-hidden="true">
      <svg viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="fade" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#14b89a" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#0c1420" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Probability lattice */}
        <path className="branch-path" d="M80 720 C200 520, 280 480, 420 360" />
        <path className="branch-path" d="M80 720 C260 640, 400 580, 560 420" />
        <path className="branch-path" d="M80 720 C320 700, 520 640, 720 500" />
        <path className="branch-path hot" d="M80 720 C240 560, 360 400, 520 220" />
        <path className="branch-path" d="M520 220 C640 160, 760 140, 920 100" />
        <path className="branch-path hot" d="M520 220 C680 240, 820 280, 1040 260" />
        <path className="branch-path" d="M520 220 C620 300, 700 380, 880 440" />
        <path className="branch-path" d="M560 420 C700 380, 840 340, 1000 300" />
        <path className="branch-path" d="M420 360 C540 300, 700 260, 860 180" />

        <circle className="branch-node" cx="80" cy="720" r="6" />
        <circle className="branch-node live" cx="520" cy="220" r="6" />
        <circle className="branch-node" cx="420" cy="360" r="5" />
        <circle className="branch-node" cx="560" cy="420" r="5" />
        <circle className="branch-node live" cx="1040" cy="260" r="6" />
        <circle className="branch-node" cx="920" cy="100" r="4" />
        <circle className="branch-node" cx="880" cy="440" r="4" />
        <circle className="branch-node" cx="1000" cy="300" r="4" />

        <text className="prob-label" x="540" y="205">
          p=0.71 commit
        </text>
        <text className="prob-label" x="1055" y="255">
          ready
        </text>
        <text className="prob-label" x="430" y="345">
          p=0.18
        </text>
        <text className="prob-label" x="575" y="410">
          p=0.11 rollback
        </text>

        <rect x="0" y="0" width="1200" height="800" fill="url(#fade)" opacity="0.35" />
      </svg>
    </div>
  );
}
